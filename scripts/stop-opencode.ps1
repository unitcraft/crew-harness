# Stops every OpenCode process (the windows first, the service last) and prints what is left:
# just "0" when nothing is left, otherwise the table of the remaining processes.
# Use it before a service restart (AGENTS.md, rule 12). -DryRun only lists the processes, stops none.
#
# A window killed outright leaves its terminal tab tracking the mouse (every move prints codes like
# "[555;45;5M"). So each window first gets Ctrl+C (a chance to restore the terminal itself), the ones
# still alive after -SoftMilliseconds are killed, and then the tab's console gets the reset sequences
# (mouse tracking, focus events and bracketed paste off, cursor shown, VT input off). A helper process
# does the console work, so this script never leaves its own console. A window that shares its console
# with the service gets no Ctrl+C (the service goes last). A tab that could not be reset is named on
# one line with the command to type there.
# -Name is for checks only: it points the script at a stand-in process instead of opencode.exe.
param(
  [int]$WaitSeconds = 4,
  [int]$SoftMilliseconds = 2000,
  [string]$Name = 'opencode.exe',
  [switch]$DryRun
)

function Get-OpenCode {
  @(Get-CimInstance Win32_Process -Filter "Name='$Name'" -ErrorAction SilentlyContinue)
}

$all = Get-OpenCode
$service = @($all | Where-Object { [string]$_.CommandLine -match 'serve --service' })
$windows = @($all | Where-Object { [string]$_.CommandLine -notmatch 'serve --service' })

if ($DryRun) {
  Write-Host ("windows: {0}, service: {1}" -f $windows.Count, $service.Count)
  $all | Select-Object ProcessId, @{ n = 'Command'; e = { ([string]$_.CommandLine) } } | Format-Table -AutoSize -Wrap
  return
}

$esc = [char]27
$modes = '1000', '1001', '1002', '1003', '1005', '1006', '1015', '1016', '1004', '2004'
$reset = (($modes | ForEach-Object { "$esc[?$($_)l" }) -join '') + "$esc[?25h$esc[0m"

$helper = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class StopOpenCodeHelper {
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool FreeConsole();
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll", SetLastError = true)] static extern uint GetConsoleProcessList(uint[] list, uint count);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetConsoleCtrlHandler(IntPtr h, bool add);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GenerateConsoleCtrlEvent(uint ev, uint group);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sa, uint disp, uint flags, IntPtr tmpl);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetConsoleMode(IntPtr h, out uint mode);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetConsoleMode(IntPtr h, uint mode);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool FlushConsoleInputBuffer(IntPtr h);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool WriteConsoleW(IntPtr h, string s, uint n, out uint written, IntPtr reserved);

  static Process Open(int pid) {
    try { var p = Process.GetProcessById(pid); return p.HasExited ? null : p; } catch { return null; }
  }

  // Writes the reset sequences into the console of pid and turns its input back from raw VT input.
  static bool Reset(int pid, string seq) {
    FreeConsole();
    if (!AttachConsole((uint)pid)) return false;
    bool ok = false;
    IntPtr bad = new IntPtr(-1);
    IntPtr hout = CreateFileW("CONOUT$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    IntPtr hin = CreateFileW("CONIN$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (hout != bad) {
      uint mode, written;
      if (GetConsoleMode(hout, out mode)) {
        SetConsoleMode(hout, mode | 0x4);
        ok = WriteConsoleW(hout, seq, (uint)seq.Length, out written, IntPtr.Zero);
        SetConsoleMode(hout, mode);
      }
      CloseHandle(hout);
    }
    if (hin != bad) {
      uint mode;
      if (GetConsoleMode(hin, out mode)) SetConsoleMode(hin, (mode & ~0x200u) | 0x6u);
      FlushConsoleInputBuffer(hin);
      CloseHandle(hin);
    }
    FreeConsole();
    return ok;
  }

  // Ctrl+C to each window, a wait, a kill of the rest, the reset of each tab.
  // Returns the shell PIDs of the tabs that could not be reset.
  public static string[] Run(int[] windows, int[] parents, int[] services, int softMs, int hardMs, string seq) {
    int self = Process.GetCurrentProcess().Id;
    var skip = new HashSet<int>(windows); skip.UnionWith(services); skip.Add(self);
    var shells = new List<int>[windows.Length];
    SetConsoleCtrlHandler(IntPtr.Zero, true);
    for (int i = 0; i < windows.Length; i++) {
      shells[i] = new List<int>();
      FreeConsole();
      if (!AttachConsole((uint)windows[i])) { shells[i].Add(parents[i]); continue; }
      var list = new uint[64];
      uint n = GetConsoleProcessList(list, (uint)list.Length);
      bool shared = false;
      for (int k = 0; k < n && k < list.Length; k++) {
        int pid = (int)list[k];
        if (Array.IndexOf(services, pid) >= 0) shared = true;
        if (!skip.Contains(pid)) shells[i].Add(pid);
      }
      if (!shared && softMs > 0) GenerateConsoleCtrlEvent(0, 0);
      FreeConsole();
    }
    var alive = new List<Process>();
    foreach (int w in windows) { var p = Open(w); if (p != null) alive.Add(p); }
    var until = DateTime.UtcNow.AddMilliseconds(softMs);
    foreach (var p in alive) {
      int left = (int)(until - DateTime.UtcNow).TotalMilliseconds;
      try { if (left > 0) p.WaitForExit(left); } catch { }
    }
    foreach (var p in alive) { try { if (!p.HasExited) p.Kill(); } catch { } }
    until = DateTime.UtcNow.AddMilliseconds(hardMs);
    foreach (var p in alive) {
      int left = (int)(until - DateTime.UtcNow).TotalMilliseconds;
      try { if (left > 0) p.WaitForExit(left); } catch { }
    }
    var failed = new List<string>();
    var done = new HashSet<int>();
    for (int i = 0; i < windows.Length; i++) {
      int first = 0; bool ok = false;
      foreach (int pid in shells[i]) {
        if (Open(pid) == null) continue;
        if (first == 0) first = pid;
        if (done.Contains(pid) || Reset(pid, seq)) { done.Add(pid); ok = true; break; }
      }
      if (!ok && first != 0 && !failed.Contains(first.ToString())) failed.Add(first.ToString());
    }
    FreeConsole();
    return failed.ToArray();
  }
}
'@

if ($windows.Count -gt 0) {
  $wins = ($windows | ForEach-Object { $_.ProcessId }) -join ','
  $pars = ($windows | ForEach-Object { $_.ParentProcessId }) -join ','
  $svcs = (@($service | ForEach-Object { $_.ProcessId }) + 0) -join ','
  $code = @"
`$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
$helper
'@
[StopOpenCodeHelper]::Run([int[]]@($wins), [int[]]@($pars), [int[]]@($svcs), $SoftMilliseconds, 2000, '$reset')
"@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
  $failed = @(& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded 2>$null)
  $command = '[Console]::Write("' + ($reset -replace $esc, '$([char]27)') + '")'
  foreach ($shell in $failed) {
    if ([string]$shell -match '^\d+$') {
      Write-Host ("tab shell PID {0} may still print mouse codes; type there: {1}" -f $shell, $command)
    }
  }
}

foreach ($p in $windows) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($p in $service) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }

$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
  Start-Sleep -Milliseconds 500
  $left = Get-OpenCode
} while ($left.Count -gt 0 -and (Get-Date) -lt $deadline)

if ($left.Count -eq 0) {
  0
} else {
  $left | Select-Object ProcessId, @{ n = 'Command'; e = { ([string]$_.CommandLine) } } | Format-Table -AutoSize -Wrap
}
