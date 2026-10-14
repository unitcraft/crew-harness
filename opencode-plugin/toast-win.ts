// System notification of Windows about a question to the owner (task 040). No dependencies and no rights: the built-in
// Windows PowerShell 5.1 shows a toast through the Windows Runtime (ToastNotificationManager) under the application id of
// PowerShell itself, which is registered in every Windows 10/11. The text goes through environment variables (never into the
// command line), so no quoting of the owner's text can break the script. Fire and forget: a failure is a line in the log, never
// an error of the pass. The pop-up notice of the OpenCode window (notices/ + toast.show) is the first line; this one is a
// separate setting of the project (owner_system_notify).
import { spawn } from "node:child_process"

const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]",
  "[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]",
  "$t = [System.Security.SecurityElement]::Escape($env:CREW_TOAST_TITLE)",
  "$m = [System.Security.SecurityElement]::Escape($env:CREW_TOAST_MESSAGE)",
  "$xml = New-Object Windows.Data.Xml.Dom.XmlDocument",
  "$xml.LoadXml('<toast scenario=\"reminder\"><visual><binding template=\"ToastGeneric\"><text>' + $t + '</text><text>' + $m + '</text></binding></visual></toast>')",
  "$id = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($id).Show([Windows.UI.Notifications.ToastNotification]::new($xml))",
].join("; ")

/** Show a Windows toast. Returns true when the process was started (on other systems - false, nothing happens). */
export function systemToast(title: string, message: string, log: (line: string) => void = () => {}, run: typeof spawn = spawn): boolean {
  if (process.platform !== "win32") return false
  try {
    const p = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", SCRIPT], {
      env: { ...process.env, CREW_TOAST_TITLE: title.slice(0, 120), CREW_TOAST_MESSAGE: message.slice(0, 250) },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
      detached: true,
    })
    let err = ""
    p.stderr?.on("data", (d: any) => (err += String(d).slice(0, 300)))
    p.on("error", (e: any) => log(`system toast not started: ${String(e).slice(0, 200)}`))
    p.on("exit", (code: number | null) => {
      if (code) log(`system toast failed (exit ${code}): ${err.replace(/\s+/g, " ").slice(0, 300)}`)
    })
    p.unref?.()
    return true
  } catch (e) {
    log(`system toast not started: ${String(e).slice(0, 200)}`)
    return false
  }
}
