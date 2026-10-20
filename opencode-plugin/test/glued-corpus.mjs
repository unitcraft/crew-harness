// Measurement of the glued-words sign on a corpus (task 127), not a test:  node test/glued-corpus.mjs [repo-root] [--list]
// Walks every *.md (incl. *.portolan.md) and *.tsv in doc/, src/ and scripts/ of the repository, runs the sign of glued.ts and prints
// the files with a hit grouped by their top folders; with --list it prints every hit with its context.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gluedMarks } from "../glued.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const root = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(here, "..", ".."))
const list = args.includes("--list")
const files = []
const walk = (d) => {
  for (const name of readdirSync(d)) {
    if (name === "node_modules" || name === ".git") continue
    const p = path.join(d, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(md|tsv)$/.test(name)) files.push(p)
  }
}
for (const d of ["doc", "src", "scripts"]) {
  try {
    walk(path.join(root, d))
  } catch {}
}
const groups = new Map()
let total = 0
let hitFiles = 0
for (const f of files) {
  const text = readFileSync(f, "utf8")
  const marks = gluedMarks(text)
  if (marks.length === 0) continue
  hitFiles++
  total += marks.length
  const rel = path.relative(root, f).split(path.sep).join("/")
  const parts = rel.split("/")
  const key = parts[0] === "doc" && parts[1] === "tasks" ? parts.slice(0, 3).join("/") : parts.slice(0, 2).join("/")
  const g = groups.get(key) ?? { files: 0, marks: 0 }
  g.files++
  g.marks += marks.length
  groups.set(key, g)
  if (list) for (const m of marks) console.log(`${rel}: ${m}`)
}
console.log(`files ${files.length}, files with a hit ${hitFiles}, distinct hits per file summed ${total}`)
for (const [k, g] of [...groups].sort((a, b) => b[1].marks - a[1].marks)) console.log(`${String(g.marks).padStart(6)} ${String(g.files).padStart(4)} files  ${k}`)
