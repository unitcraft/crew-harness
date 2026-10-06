// Before a test run: the temp folders of earlier runs (peers-*/ in the OS temp dir, older than an hour). Tests remove
// their folder at the end, but on Windows a folder held by a watch process or an open database stays (2026-10-06:
// ~100 such folders); this sweeps them up instead of leaving them forever.
import { readdirSync, rmSync, statSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const HOUR = 3_600_000
let removed = 0
for (const name of readdirSync(os.tmpdir())) {
  if (!/^peers-[a-z-]+-[A-Za-z0-9]{6}$/.test(name)) continue
  const dir = path.join(os.tmpdir(), name)
  try {
    if (Date.now() - statSync(dir).mtimeMs < HOUR) continue
    rmSync(dir, { recursive: true, force: true, maxRetries: 2 })
    removed++
  } catch {}
}
if (removed) console.log(`cleanup-tmp: ${removed} old test folders removed`)
