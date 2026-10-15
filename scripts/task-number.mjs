#!/usr/bin/env node
// Номер задачи для агента вне OpenCode (задача 058, REQ-21; вопрос В-05).
//
// Зачем: быстрые задачи заводит и агент вне OpenCode (оркестратор), а crew_spawn плагина — окна OpenCode; без общего счёта оба
// берут один номер наперегонки. Скрипт берёт номер тем же кодом плагина (opencode-plugin/task-numbers.ts: 1 + наибольший номер
// записей проекта и папок задач во всех рабочих деревьях, локальных ветках и ветках origin), занимает его записью в хранилище
// плагина (атомарное создание файла, как crew_spawn) и заводит папку NNN-<slug>/ (task/message.md и log.md с первой строкой) в
// указанном дереве. Коммитит агент сам, на своей ветке; основную копию целевой ветки скрипт не трогает (откажет, если дерево — она).
//
// Запуск (node >= 24, из любого каталога):
//   node scripts/task-number.mjs --dir <дерево задачи> --title "<название>" [--slug <латиница>] [--message-file <файл>]
//        [--project <имя проекта плагина>] [--tasks-dir doc/tasks] [--allow-main]
// Ответ — одна строка JSON: {"n": 59, "number": "059", "folder": "doc/tasks/059-<slug>", "path": "<папка на диске>"}.
// Ошибка — текст в stderr и код выхода 1.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const plugin = path.resolve(here, "..", "opencode-plugin")
const load = (f) => import(pathToFileURL(path.join(plugin, f)).href)

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("--")) continue
    const key = a.slice(2)
    if (key === "allow-main") out[key] = true
    else out[key] = argv[++i]
  }
  return out
}
const fail = (text) => {
  process.stderr.write(`task-number: ${text}\n`)
  process.exit(1)
}

const a = args(process.argv.slice(2))
if (!a.dir || !a.title) fail("нужны --dir <дерево задачи> и --title <название>")
const tn = await load("task-numbers.ts")
const tasks = await load("tasks.ts")
const folders = await load("task-folders.ts")
const dir = path.resolve(a.dir)
const top = tn.repoTop(dir)
if (!top) fail(`${dir} — не репозиторий git`)
const git = (...x) => execFileSync("git", ["-C", top, ...x], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim()
// основная копия — живая (AGENTS.md, пп. 3 и 11): папку пишем только в связанное дерево
const common = path.resolve(top, git("rev-parse", "--git-common-dir"))
const mainRoot = path.dirname(common)
if (!a["allow-main"] && path.resolve(mainRoot).toLowerCase() === path.resolve(top).toLowerCase()) fail("дерево — основная копия; папка задачи заводится в рабочем дереве на ветке задачи")
const rel = String(a["tasks-dir"] ?? tn.DEFAULT_TASKS_DIR).replace(/\\/g, "/").replace(/^\.\/+|\/+$/g, "")
if (!rel) fail("пустой --tasks-dir: у проекта без папок задач номер выдаёт только crew_spawn")
const project = String(a.project ?? path.basename(mainRoot)).trim()
const title = String(a.title).trim()
const slug = a.slug ? tasks.slugify(String(a.slug)) : tasks.slugify(title)
const message = a["message-file"] ? readFileSync(path.resolve(a["message-file"]), "utf8") : ""
const used = tn.usedNumbers(top, rel)
const t = tasks.createTask(
  { project, title, slug, goal: title, priority: "P2", tier: "light", role: "worker", author: "external", author_role: `${project}.external`, qid: "", status: "done", kind: "external", directory: top },
  undefined,
  { used, fill: (n, s) => ({ folder: `${rel}/${tn.folderName(n, s)}` }) },
)
const folder = path.join(top, ...t.folder.split("/"))
if (existsSync(folder)) fail(`папка ${t.folder} уже есть (номер ${tn.pad3(t.n)} занят записью, папку не перезаписываю)`)
mkdirSync(path.join(folder, "task"), { recursive: true })
writeFileSync(path.join(folder, "task", "message.md"), message.trim() ? message : folders.templateMessage({ title, goal: title, author_role: `${project}.external` }))
let sha = ""
try {
  sha = git("rev-parse", "--short", "HEAD")
} catch {}
writeFileSync(path.join(folder, "log.md"), folders.firstLogLine({ title }, message.trim() ? "текст агента (--message-file)" : "шаблон (заполнить)", `${git("rev-parse", "--abbrev-ref", "HEAD")} ${sha}`.trim()))
tasks.taskEvent(t, "external", undefined, `номер выдан агенту вне OpenCode: папка ${t.folder}/ в дереве ветки ${git("rev-parse", "--abbrev-ref", "HEAD")}`)
process.stdout.write(JSON.stringify({ n: t.n, number: tn.pad3(t.n), folder: t.folder, path: folder }) + "\n")
process.exit(0)
