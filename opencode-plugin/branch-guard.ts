// КОНТРОЛЬ КАТАЛОГА И ВЕТКИ ОКОН (задача 157; владелец, 2026-10-23: «интегратору контролировать постоянно, в какой ветке он работает,
// видимо и воркерам тоже, чтобы ветка не переключилась сама по непонятным причинам, переключение ветки возможно — но оно должно быть
// трезвым и обоснованным, для интегратора штатная ветка — майн»). Инцидент 2026-10-22: непринятый код попал в живую `main`; 2026-10-23
// окно интегратора оказалось в каталоге задачи 145.
//
// ОЖИДАЕМАЯ ПАРА «каталог и ветка» вычисляется на каждом ходе из записи задачи и настроек проекта, а не копируется:
//   интегратор — основная копия проекта и целевая ветка (main);
//   исполнитель — дерево и ветка своей сессии (запись задачи: worktree/branch, у сессии с place own — её дерево и ветка);
//   приёмщик — основная копия на целевой ветке или любое дерево того же репозитория (кандидат на отсоединённом HEAD — разрешённый случай);
//   оркестратор, вкладки владельца, прочие роли — не контролируются. Окно без однозначного ожидания не контролируется (ложные срабатывания
//   не должны глушить окна).
// ЧТО ПРОВЕРЯЕТСЯ. Каталог окна — по session.get(...).location (источник истины: карточка и ctx.location относятся не к каждой сессии),
// ветка — чтением .git/HEAD без git (branch-head.ts). Ход: одна строка предупреждения в системную часть. Команда оболочки, меняющая ветку
// или историю в основной копии, в дереве чужой задачи или в своём дереве не на своей ветке, отклоняется, пока не записана причина
// (crew_branch_note: что, зачем, кто разрешил). Чтение, `git -C <своё helper-дерево>` и возврат на свою ветку не блокируются.
// ПРИЧИНА: строка в журнале ящика (branch-journal.jsonl) и в истории задачи; разрешение на мутации в названном каталоге — 30 минут;
// названная пара становится ожиданием окна, пока не сменились роль или задача (override).
// Нет автоматического checkout, reset и переноса: плагин только показывает и отклоняет. Окно переносит штатный session_move.
// ЧЕСТНАЯ ГРАНИЦА: произвольный shell (переменные, подстановки, внешний терминал) проверки не разбирают и не предотвращают гонку.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { type Head, type Mutation, fsKey, gitCalls, mutationOf, readHead, sameTree, writeTargets } from "./branch-head.ts"

export type TaskLike = {
  project: string
  n: number
  status: string
  executor?: string
  reviewer?: string
  directory: string
  worktree?: string
  branch?: string
  sessions?: { session?: string; place?: string; worktree?: string; branch?: string }[]
  side?: { worktree?: string }[]
}
export type CardLike = { session: string; role: string; project?: string; directory?: string; task?: { project: string; n: number }; review?: { project: string; n: number } }
export type Deps = {
  /** ящик плагина (BASE) */
  base: string
  log(line: string): void
  now?(): number
  /** корень проекта (путь) */
  projectRoot(project: string): string | undefined
  targetBranch(dir: string): string
  task(project: string, n: number): TaskLike | undefined
  /** открытые задачи (для чужих деревьев) */
  openTasks(): TaskLike[]
  /** держит ли сессия замок вливания этой задачи */
  holdsLock(project: string, session: string, n: number): boolean
  /** строка в историю задачи */
  taskNote?(project: string, n: number, text: string): void
}

export type Role = "integrator" | "executor" | "reviewer"
export type Expect = {
  role: Role
  project: string
  task?: { project: string; n: number }
  /** к чему привязана запись причины: роль и задача; сменились — запись не действует */
  bind: string
  common?: string
  /** основная копия репозитория */
  main?: string
  /** допустимые корни окна (у приёмщика пусто: любое дерево репозитория) */
  dirs: string[]
  /** ожидаемая ветка (у приёмщика нет) */
  branch?: string
  target: string
  /** деревья той же задачи: свои */
  helpers: string[]
  detachedOk: boolean
}

export const PASS_MS = 30 * 60_000
export const LIVE_MS = 30 * 60_000
export const DAY_MS = 24 * 3_600_000
const SHELL_TOOLS = new Set(["bash", "shell", "sh", "zsh", "powershell", "pwsh"])
const WRITE_TOOLS = new Set(["edit", "write", "multiedit", "patch", "apply_patch"])

const nowOf = (d: Deps) => (d.now ? d.now() : Date.now())
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9_-]/g, "_")
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// ---- ожидание по роли

const treesOf = (t: TaskLike): string[] => [t.worktree, ...(t.sessions ?? []).map((s) => s.worktree), ...(t.side ?? []).map((s) => s.worktree)].filter((x): x is string => !!x)

export function expectedFor(card: CardLike, deps: Deps): Expect | undefined {
  try {
    if (card.task) {
      const t = deps.task(card.task.project, card.task.n)
      if (t && t.executor === card.session && (t.status === "running" || t.status === "rework")) {
        const ses = (t.sessions ?? []).find((s) => s.session === card.session)
        const own = ses?.place === "own" && !!ses.worktree && !!ses.branch
        const dir = own ? ses!.worktree : t.worktree
        const branch = own ? ses!.branch : t.branch
        if (!dir || !branch) return undefined
        return { role: "executor", project: card.project ?? t.project, task: { project: t.project, n: t.n }, bind: `executor:${t.project}#${t.n}`, common: (readHead(t.directory) ?? readHead(dir))?.common, dirs: [dir], branch, target: deps.targetBranch(t.directory), helpers: treesOf(t), detachedOk: false }
      }
    }
    if (card.review) {
      const t = deps.task(card.review.project, card.review.n)
      if (t && t.reviewer === card.session && ["submitted", "reviewing", "accepted"].includes(t.status)) {
        const h = readHead(t.directory)
        if (!h) return undefined
        return { role: "reviewer", project: card.project ?? t.project, task: { project: t.project, n: t.n }, bind: `reviewer:${t.project}#${t.n}`, common: h.common, main: h.main ? h.top : undefined, dirs: [], target: deps.targetBranch(t.directory), helpers: treesOf(t), detachedOk: true }
      }
    }
    if (card.role === "integrator" && card.project) {
      const root = deps.projectRoot(card.project)
      const h = root ? readHead(root) : undefined
      if (!h || !h.main) return undefined
      const target = deps.targetBranch(h.top)
      return { role: "integrator", project: card.project, bind: `integrator:${card.project}`, common: h.common, main: h.top, dirs: [h.top], branch: target, target, helpers: [], detachedOk: false }
    }
  } catch (e) {
    deps.log(`branch guard: expectation of ${card.session} failed: ${e}`)
  }
  return undefined
}

// ---- подписи

const sha = (s?: string) => (s ? s.slice(0, 7) : "?")
const branchWord = (h: { branch?: string; detached?: string; ref?: string }) => h.branch ?? (h.detached ? `detached ${sha(h.detached)}` : (h.ref ?? "?"))
function pairLabel(dir: string | undefined, h: { branch?: string; detached?: string; ref?: string } | undefined, main?: boolean): string {
  if (!dir) return "?"
  const kind = main === undefined ? "" : main ? " (основная копия)" : " (дерево)"
  return `${path.basename(dir)}${kind} @ ${h ? branchWord(h) : "?"}`
}
const ROLE_WORD: Record<Role, string> = { integrator: "integrator", executor: "исполнитель", reviewer: "приёмщик" }

// ---- снимок, журнал

export type Pair = { dir?: string; branch?: string; detached?: string; main?: boolean; label: string }
export type Override = { dir: string; branch?: string; at: number; why: string; who: string; bind: string }
export type Pass = { dir: string; until: number; at: number }
export type LastNote = { at: number; what: string; why: string; who: string; from: string; to: string }
export type State = {
  session: string
  role: Role
  project: string
  task?: string
  bind: string
  checkedAt: number
  status: "ok" | "drift" | "unknown"
  reason?: string
  since?: number
  expected: { label: string; dir?: string; branch?: string }
  actual: Pair
  override?: Override
  pass?: Pass
  lastNote?: LastNote
}
export type JournalLine = { at: number; kind: "note" | "change" | "drift" | "restored" | "blocked"; session: string; role: string; project?: string; task?: string; from?: string; to?: string; reason?: string; what?: string; why?: string; who?: string; command?: string }

const stateFile = (base: string, session: string) => path.join(base, "branch", `${safeKey(session)}.json`)
const journalFile = (base: string) => path.join(base, "branch-journal.jsonl")

export function readState(base: string, session: string): State | undefined {
  try {
    return JSON.parse(readFileSync(stateFile(base, session), "utf8"))
  } catch {
    return undefined
  }
}
export function allStates(base: string): State[] {
  const dir = path.join(base, "branch")
  const out: State[] = []
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue
      try {
        out.push(JSON.parse(readFileSync(path.join(dir, f), "utf8")))
      } catch {}
    }
  } catch {}
  return out.sort((a, b) => a.role.localeCompare(b.role) || a.session.localeCompare(b.session))
}
function writeState(base: string, s: State) {
  const file = stateFile(base, s.session)
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(s))
  renameSync(tmp, file)
}
export function readJournal(base: string): JournalLine[] {
  try {
    return readFileSync(journalFile(base), "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as JournalLine]
        } catch {
          return []
        }
      })
  } catch {
    return []
  }
}
const JOURNAL_MAX_BYTES = 512 * 1024
function journal(deps: Deps, line: Omit<JournalLine, "at">) {
  try {
    const file = journalFile(deps.base)
    mkdirSync(path.dirname(file), { recursive: true })
    // журнал не растёт без предела: больше JOURNAL_MAX_BYTES — остаются последние 1000 строк
    try {
      if (statSync(file).size > JOURNAL_MAX_BYTES) writeFileSync(file, readFileSync(file, "utf8").split("\n").filter(Boolean).slice(-1000).join("\n") + "\n")
    } catch {}
    appendFileSync(file, JSON.stringify({ at: nowOf(deps), ...line }) + "\n")
  } catch (e) {
    deps.log(`branch guard: journal not written: ${e}`)
  }
}

// ---- сверка окна

type Verdict = { ok: boolean; reason?: string }

function judgeHead(exp: Expect, head: Head, ov?: Override): Verdict {
  if (ov && sameTree(head.top, ov.dir) && (ov.branch === undefined || head.branch === ov.branch)) return { ok: true }
  const act = pairLabel(head.top, head, head.main)
  if (exp.role === "reviewer") {
    if (!exp.common || !sameTree(head.common, exp.common)) return { ok: false, reason: `каталог: ожидалось дерево репозитория ${path.basename(exp.main ?? "") || "проекта"}, фактически ${act}` }
    if (head.main && head.branch !== exp.target) return { ok: false, reason: `ветка: основная копия должна стоять на ${exp.target}, фактически ${act}` }
    return { ok: true }
  }
  if (!sameTree(head.top, exp.dirs[0])) return { ok: false, reason: `каталог: ожидалось ${path.basename(exp.dirs[0])}, фактически ${act}` }
  if (exp.branch && head.branch !== exp.branch) return { ok: false, reason: `ветка: ожидалась ${exp.branch}, фактически ${branchWord(head)}` }
  return { ok: true }
}

function expectedLabel(exp: Expect, ov?: Override): { label: string; dir?: string; branch?: string } {
  if (exp.role === "reviewer") return { label: `${path.basename(exp.main ?? "") || "репозиторий"} (основная копия) @ ${exp.target}, или любое дерево репозитория`, dir: exp.main, branch: exp.target }
  return { label: pairLabel(exp.dirs[0], { branch: exp.branch }, exp.dirs[0] ? sameTree(exp.dirs[0], exp.main) : undefined), dir: exp.dirs[0], branch: exp.branch }
}

/**
 * Сверка окна: card — карточка, dir — каталог по session.get(...).location. Пишет снимок для панели и doctor, журнал смен (дрейф,
 * возврат, смена с причиной). Не контролируется — undefined. Не бросает.
 */
export function checkWindow(card: CardLike, dir: string | undefined, deps: Deps, cause?: string): State | undefined {
  try {
    const exp = expectedFor(card, deps)
    if (!exp) {
      try {
        rmSync(stateFile(deps.base, card.session), { force: true })
      } catch {}
      return undefined
    }
    const now = nowOf(deps)
    const prev = readState(deps.base, card.session)
    const ov = prev?.override && prev.override.bind === exp.bind ? prev.override : undefined
    const head = dir ? readHead(dir) : undefined
    const st: State = {
      session: card.session,
      role: exp.role,
      project: exp.project,
      ...(exp.task ? { task: String(exp.task.n).padStart(3, "0") } : {}),
      bind: exp.bind,
      checkedAt: now,
      status: "unknown",
      expected: expectedLabel(exp, ov),
      actual: head ? { dir: head.top, branch: head.branch, detached: head.detached, main: head.main, label: pairLabel(head.top, head, head.main) } : { label: "не определено" },
      ...(ov ? { override: ov } : {}),
      ...(prev?.pass ? { pass: prev.pass } : {}),
      ...(prev?.lastNote ? { lastNote: prev.lastNote } : {}),
    }
    if (!head) st.reason = dir ? "каталог окна не читается как git-репозиторий" : "каталог окна неизвестен (session.get не вернул location)"
    else {
      const v = judgeHead(exp, head, ov)
      st.status = v.ok ? "ok" : "drift"
      if (v.reason) st.reason = v.reason
    }
    const key = (p: Pair) => `${p.dir ? fsKey(p.dir) : "?"}|${p.branch ?? p.detached ?? "?"}`
    const changed = !!prev && key(prev.actual) !== key(st.actual)
    const base = { session: card.session, role: exp.role, project: exp.project, ...(st.task ? { task: st.task } : {}), ...(cause ? { command: short(cause, 200) } : {}) }
    if (st.status === "drift") {
      st.since = prev?.status === "drift" && !changed ? (prev.since ?? now) : now
      if (prev?.status !== "drift" || changed) {
        journal(deps, { kind: "drift", ...base, from: prev?.status === "ok" || prev?.status === "drift" ? prev.actual.label : st.expected.label, to: st.actual.label, reason: st.reason })
        deps.log(`branch guard: ${exp.role} ${card.session} is not where it should be: ${st.reason}`)
      }
    } else if (st.status === "ok") {
      if (prev?.status === "drift") {
        journal(deps, { kind: "restored", ...base, from: prev.actual.label, to: st.actual.label })
        deps.log(`branch guard: ${exp.role} ${card.session} is back: ${st.actual.label}`)
      } else if (changed && prev?.status === "ok") {
        journal(deps, { kind: "change", ...base, from: prev.actual.label, to: st.actual.label, reason: ov ? "по записи причины" : "в пределах ожидаемого" })
      }
    }
    writeState(deps.base, st)
    return st
  } catch (e) {
    deps.log(`branch guard: check of ${card?.session} failed: ${e}`)
    return undefined
  }
}

/** Одна строка предупреждения в системную часть хода; нет расхождения — undefined. Строка не меняется, пока расхождение то же. */
export function turnWarning(st: State | undefined): string | undefined {
  if (!st || st.status !== "drift") return undefined
  const moveHint = st.reason?.startsWith("каталог") ? "каталог исправляет session_move" : st.expected.branch ? `ветку исправляет git switch ${st.expected.branch} (возврат разрешён без причины)` : "верни окно на место"
  return `crew-harness: окно не на своей ветке: ожидалось ${st.expected.label}, фактически ${st.actual.label}. ${moveHint}; если так и должно быть — запиши причину: crew_branch_note {what, why, who}. Пока расхождение не снято, команды, меняющие ветку или историю, отклоняются.`
}

// ---- команды

export type BashVerdict = { deny?: string; calls: number; unresolved: number }

function foreignOwner(top: string, exp: Expect, deps: Deps): TaskLike | undefined {
  if (exp.helpers.some((h) => sameTree(h, top))) return undefined
  for (const t of deps.openTasks()) {
    if (exp.task && t.project === exp.task.project && t.n === exp.task.n) continue
    if (treesOf(t).some((x) => sameTree(x, top))) return t
  }
  return undefined
}

const taskNo = (t: { n: number }) => String(t.n).padStart(3, "0")

function refusal(what: string, why: string, dir: string, extra = ""): string {
  return `Отклонено: ${what} — ${why}.${extra} Запиши причину: crew_branch_note {what: "<что меняешь>", why: "<зачем>", who: "<кто разрешил: слово владельца с датой или решение оркестратора>", directory: "${dir.replace(/\\/g, "/")}"} и повтори команду (разрешение на этот каталог — ${PASS_MS / 60_000} минут). Чтение (git status, log, diff), git -C <своё helper-дерево> и возврат на свою ветку не блокируются.`
}

/** Причина отказа для вызова git в каталоге dir или undefined. */
function judgeTarget(exp: Expect, card: CardLike, dir: string, mu: Mutation, call: { sub: string; text: string }, deps: Deps): string | undefined {
  const head = readHead(dir)
  if (!head) return undefined
  if (exp.common && !sameTree(head.common, exp.common)) return undefined // другой репозиторий — не наш
  const st = readState(deps.base, card.session)
  const now = nowOf(deps)
  if (st?.pass && st.pass.until > now && sameTree(st.pass.dir, head.top)) return undefined
  if (mu.kind === "branch" && mu.to && exp.branch && mu.to === exp.branch && exp.dirs.some((d) => sameTree(d, head.top))) return undefined // путь назад
  const ov = st?.override && st.override.bind === exp.bind ? st.override : undefined
  const what = `git ${call.sub} (${mu.kind === "branch" ? "меняет ветку" : "меняет историю"})`
  if (head.main) {
    if (exp.role === "reviewer" && exp.task && deps.holdsLock(exp.task.project, card.session, exp.task.n)) return undefined
    return refusal(what, `в основной копии проекта ${path.basename(head.top)} (ветка ${branchWord(head)}) без записанной причины; живая система подгружает её файлы`, head.top)
  }
  const foreign = foreignOwner(head.top, exp, deps)
  if (foreign) return refusal(what, `в дереве чужой задачи ${taskNo(foreign)} (${path.basename(head.top)})`, head.top)
  if (exp.role !== "reviewer" && exp.dirs.some((d) => sameTree(d, head.top))) {
    const v = judgeHead(exp, head, ov)
    if (!v.ok) return refusal(what, `окно не на своей ветке (${v.reason}); вернись на ${exp.branch}: git switch ${exp.branch}`, head.top)
    // уход со своей ветки в своём дереве (switch на другую, checkout -b, --detach) — тоже смена ветки, нужна причина
    if (mu.kind === "branch" && exp.branch && mu.to !== exp.branch && !(ov && ov.branch && mu.to === ov.branch)) return refusal(what, `уход со своей ветки ${exp.branch} в своём дереве${mu.to ? ` на ${mu.to}` : ""}`, head.top)
  }
  return undefined
}

/** Приговор команде оболочки. workdir/cwd команды главнее каталога окна. Не бросает. */
export function judgeBash(card: CardLike, windowDir: string | undefined, input: { command?: unknown; workdir?: unknown; cwd?: unknown } | undefined, deps: Deps): BashVerdict {
  const out: BashVerdict = { calls: 0, unresolved: 0 }
  try {
    const exp = expectedFor(card, deps)
    if (!exp) return out
    const cwd = String(input?.workdir ?? input?.cwd ?? windowDir ?? "")
    const calls = gitCalls(input?.command, cwd)
    out.calls = calls.length
    for (const c of calls) {
      const mu = mutationOf(c.sub, c.args)
      if (!mu) continue
      if (c.dir === undefined) {
        out.unresolved++
        deps.log(`branch guard: unresolved folder of "git ${c.sub}" in session ${card.session}: passed (the path has a variable or the folder is unknown)`)
        continue
      }
      const why = judgeTarget(exp, card, c.dir, mu, c, deps)
      if (why) {
        out.deny = why
        return out
      }
    }
  } catch (e) {
    deps.log(`branch guard: judging a command of ${card?.session} failed: ${e}`)
  }
  return out
}

/** Приговор записи файла (edit, write, patch) или undefined. */
export function judgeWrite(card: CardLike, windowDir: string | undefined, tool: string, input: any, deps: Deps): string | undefined {
  try {
    const exp = expectedFor(card, deps)
    if (!exp) return undefined
    const files = writeTargets(tool, input)
    if (!files.length) return undefined
    const st = readState(deps.base, card.session)
    const now = nowOf(deps)
    const winHead = windowDir ? readHead(windowDir) : undefined
    const ov = st?.override && st.override.bind === exp.bind ? st.override : undefined
    const winOk = winHead ? judgeHead(exp, winHead, ov) : ({ ok: true } as Verdict)
    for (const f of files) {
      let p = path.resolve(windowDir || ".", f)
      while (!existsSync(p) && path.dirname(p) !== p) p = path.dirname(p)
      const head = readHead(p)
      if (!head) continue
      if (exp.common && !sameTree(head.common, exp.common)) continue
      if (st?.pass && st.pass.until > now && sameTree(st.pass.dir, head.top)) continue
      const what = `запись файла ${path.basename(f)}`
      if (head.main) {
        if (exp.role === "executor" || (exp.role === "reviewer" && !(exp.task && deps.holdsLock(exp.task.project, card.session, exp.task.n)))) return refusal(what, "в основной копии проекта (живая система подгружает её файлы)", head.top)
      } else {
        const foreign = foreignOwner(head.top, exp, deps)
        if (foreign) return refusal(what, `в дереве чужой задачи ${taskNo(foreign)}`, head.top)
      }
      if (winHead && !winOk.ok && sameTree(head.top, winHead.top)) return refusal(what, `окно не на своей ветке (${winOk.reason})`, head.top)
    }
  } catch (e) {
    deps.log(`branch guard: judging a write of ${card?.session} failed: ${e}`)
  }
  return undefined
}

// ---- причина

export type NoteInput = { what?: unknown; why?: unknown; who?: unknown; directory?: unknown; branch?: unknown }

/** Записать причину (инструмент crew_branch_note). Без «что, зачем, кто разрешил» не принимается. */
export function noteBranch(card: CardLike, windowDir: string | undefined, input: NoteInput, deps: Deps): { ok: boolean; text: string } {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const what = s(input?.what)
  const why = s(input?.why)
  const who = s(input?.who)
  const miss = [what.length < 3 ? "what (что меняется)" : "", why.length < 8 ? "why (зачем: хотя бы одна фраза)" : "", who.length < 3 ? "who (кто разрешил: слово владельца с датой или решение оркестратора)" : ""].filter(Boolean)
  if (miss.length) return { ok: false, text: `Причина не записана: не хватает ${miss.join("; ")}. Нужны все три поля: что, зачем, кто разрешил.` }
  try {
    const now = nowOf(deps)
    const exp = expectedFor(card, deps)
    const winHead = windowDir ? readHead(windowDir) : undefined
    const given = s(input?.directory)
    const dirHead = given ? readHead(path.resolve(windowDir || ".", given)) : winHead
    const passDir = dirHead?.top ?? (given ? path.resolve(given) : (windowDir ?? ""))
    const branch = s(input?.branch) || undefined
    const from = winHead ? pairLabel(winHead.top, winHead, winHead.main) : "?"
    const to = branch ? `${path.basename(passDir)} @ ${branch}` : dirHead ? pairLabel(dirHead.top, dirHead, dirHead.main) : from
    const role = exp?.role ?? card.role
    const taskRef = exp?.task ?? card.task ?? card.review
    journal(deps, { kind: "note", session: card.session, role, project: exp?.project ?? card.project, ...(taskRef ? { task: String(taskRef.n).padStart(3, "0") } : {}), from, to, what, why, who })
    deps.log(`branch guard: reason recorded by ${role} ${card.session}: ${short(what, 80)} (${short(who, 60)})`)
    if (taskRef) {
      try {
        deps.taskNote?.(taskRef.project, taskRef.n, `смена каталога или ветки (${ROLE_WORD[exp?.role ?? "executor"] ?? role}): ${what}; зачем: ${why}; разрешил: ${who}`)
      } catch {}
    }
    if (!exp) return { ok: true, text: `Причина записана в журнал (${short(what, 80)}). Окно не контролируется: разрешение не требуется.` }
    // состояние: разрешение на мутации в каталоге, запись для ожидания (если названа ветка или окно стоит не на своём месте и причину дают этому месту)
    const cur = checkWindow(card, windowDir, deps) ?? readState(deps.base, card.session)
    if (cur) {
      cur.pass = { dir: passDir, until: now + PASS_MS, at: now }
      cur.lastNote = { at: now, what, why, who, from, to }
      const here = !!winHead && sameTree(passDir, winHead.top)
      if (branch || (cur.status === "drift" && here)) cur.override = { dir: passDir, branch: branch ?? (here ? winHead?.branch : undefined), at: now, why, who, bind: exp.bind }
      writeState(deps.base, cur)
      checkWindow(card, windowDir, deps)
    }
    const until = new Date(now + PASS_MS)
    const hh = `${String(until.getHours()).padStart(2, "0")}:${String(until.getMinutes()).padStart(2, "0")}`
    return { ok: true, text: `Причина записана: ${what}. Зачем: ${why}. Разрешил: ${who}. Команды, меняющие ветку или историю в ${path.basename(passDir)}, разрешены ${PASS_MS / 60_000} минут (до ${hh}).${branch || (cur?.override && cur.status !== "drift") ? ` Ожидание окна теперь: ${cur?.override ? pairLabel(cur.override.dir, { branch: cur.override.branch }) : to}, пока не сменятся роль или задача.` : ""} Запись видна в /crew и crew_doctor.` }
  } catch (e) {
    deps.log(`branch guard: note failed: ${e}`)
    return { ok: false, text: `Причина не записана: ${e}` }
  }
}

// ---- панель и doctor

export type Row = { text: string; tone: "error" | "warn" | "muted" }
const liveStates = (base: string, now: number, project?: string) => allStates(base).filter((s) => now - s.checkedAt < LIVE_MS && (!project || s.project === project))
const roleOf = (s: State) => `${ROLE_WORD[s.role]}${s.task ? ` ${s.task}` : ""}`
const noteText = (n: LastNote) => `${n.from} → ${n.to}; причина: ${n.what} — ${n.why}; разрешил: ${n.who}`

/** Строки /crew по окнам проекта: красная при расхождении, жёлтая — смена с причиной за сутки, серая — как ожидалось. */
export function branchRows(base: string, project: string | undefined, now = Date.now()): Row[] {
  const rows: Row[] = []
  const calm: string[] = []
  for (const s of liveStates(base, now, project)) {
    if (s.status === "drift") rows.push({ tone: "error", text: `⚠ ${roleOf(s)}: каталог/ветка ожидалось ${s.expected.label} → фактически ${s.actual.label}` })
    else if (s.lastNote && now - s.lastNote.at < DAY_MS) rows.push({ tone: "warn", text: `✎ ${roleOf(s)}: ${noteText(s.lastNote)}` })
    else if (s.status === "ok") calm.push(roleOf(s))
    else rows.push({ tone: "muted", text: `? ${roleOf(s)}: не определено${s.reason ? ` (${s.reason})` : ""}` })
  }
  // окна на своих местах — одной строкой (подробно: crew_doctor, «К сведению»)
  if (calm.length) rows.push({ tone: "muted", text: `⎇ окна на своих местах (каталог и ветка как ожидалось): ${calm.join(", ")}` })
  return rows
}

/** Строки боковой панели: только расхождения и недавние смены с причиной, короткие. */
export function branchSideRows(base: string, project: string | undefined, now = Date.now()): Row[] {
  const rows: Row[] = []
  const br = (l: string) => l.replace(/ \((?:основная копия|дерево)\)/, "")
  for (const s of liveStates(base, now, project)) {
    if (s.status === "drift") rows.push({ tone: "error", text: `⚠ ${roleOf(s)} не на ветке` }, { tone: "error", text: `↳ ожид. ${br(s.expected.label)}` }, { tone: "error", text: `↳ факт. ${br(s.actual.label)}` })
    else if (s.lastNote && now - s.lastNote.at < DAY_MS) rows.push({ tone: "warn", text: `✎ ${roleOf(s)}: смена с причиной` }, { tone: "warn", text: `↳ ${short(s.lastNote.what, 28)}` })
  }
  return rows
}

/** Проблемы для crew_doctor: окна не на своём месте. */
export function branchProblems(base: string, now = Date.now()): string[] {
  return liveStates(base, now)
    .filter((s) => s.status === "drift")
    .map((s) => `окно ${roleOf(s)} (проект ${s.project}, сессия ${s.session}) не на своей ветке: ожидалось ${s.expected.label}, фактически ${s.actual.label} (${s.reason}); исправить: session_move (каталог) или git switch (ветка), либо записать причину: crew_branch_note`)
}

/** Справка для crew_doctor: смены с причиной за сутки (не проблема). */
export function branchNotes(base: string, now = Date.now()): string[] {
  const live = liveStates(base, now)
  const out: string[] = []
  if (live.length) out.push(`ветка и каталог под контролем у ${live.length} окон: ${live.map((s) => `${roleOf(s)} — ${s.actual.label}${s.status === "ok" ? "" : s.status === "drift" ? " (не на месте)" : " (не определено)"}`).join("; ")}`)
  for (const s of allStates(base)) if (s.lastNote && now - s.lastNote.at < DAY_MS) out.push(`смена каталога или ветки с причиной: ${roleOf(s)} (сессия ${s.session}) ${noteText(s.lastNote)}`)
  return out
}

/** Снимки окон, которых давно никто не обновлял (окно закрыто, сессии нет), — удалить. */
export function pruneStates(base: string, now = Date.now(), maxAgeMs = 2 * DAY_MS): void {
  for (const s of allStates(base)) if (now - s.checkedAt > maxAgeMs) rmSync(stateFile(base, s.session), { force: true })
}

// ---- хуки OpenCode

type HookState = { verdicts: Map<string, { message: string; at: number }>; pending: Map<string, Promise<void>>; seen: Set<string> }
const hookState = (): HookState => {
  const g = globalThis as any
  return (g.__crewBranchGuard ??= { verdicts: new Map(), pending: new Map(), seen: new Set() })
}
const VERDICT_TTL_MS = 10 * 60_000

export type HookOpts = {
  cardOf(sessionID: string): CardLike | undefined
  /** каталог сессии: session.get(...).location */
  dirOf(sessionID: string): Promise<string | undefined>
  deps: Deps
}

/** Регистрация хуков инструментов. Ничего не бросает: нет хука в этой версии OpenCode — строка в журнал, остальное работает. */
export async function registerBranchHooks(ctx: any, log: (line: string) => void, o: HookOpts): Promise<void> {
  const st = hookState()
  const purge = (now: number) => {
    for (const [id, v] of st.verdicts) if (now - v.at > VERDICT_TTL_MS) st.verdicts.delete(id)
    if (st.seen.size > 4000) st.seen.clear()
  }
  try {
    await ctx.tool.hook("execute.before", async (ev: any) => {
      try {
        const tool = String(ev?.tool ?? "")
        const id = String(ev?.id ?? "")
        const shell = SHELL_TOOLS.has(tool)
        if (!id || (!shell && !WRITE_TOOLS.has(tool))) return
        if (st.seen.has(id)) return // хук прежнего экземпляра плагина уже судил этот вызов
        st.seen.add(id)
        const sid = String(ev?.sessionID ?? "")
        const card = o.cardOf(sid)
        if (!card) return
        const work = (async () => {
          const dir = await o.dirOf(sid)
          const message = shell ? judgeBash(card, dir, ev.input, o.deps).deny : judgeWrite(card, dir, tool, ev.input, o.deps)
          if (!message) return
          const now = Date.now()
          purge(now)
          st.verdicts.set(id, { message, at: now })
          const exp = expectedFor(card, o.deps)
          journal(o.deps, { kind: "blocked", session: sid, role: exp?.role ?? card.role, project: exp?.project ?? card.project, command: short(shell ? String(ev.input?.command ?? "") : writeTargets(tool, ev.input).join(", "), 200), reason: short(message, 240) })
          log(`branch guard: refused a call of ${sid} (${exp?.role ?? card.role}): ${short(message, 160)}`)
        })()
        st.pending.set(id, work)
        await work
      } catch (e) {
        log(`branch guard (before) failed: ${e}`)
      }
    })
  } catch (e) {
    log(`branch guard: no tool.hook("execute.before") in this OpenCode (${e}), commands and file writes are not checked`)
    return
  }
  try {
    await ctx.permission.hook("evaluate", async (ev: any) => {
      try {
        if (ev?.effect === "deny") return
        const id = String(ev?.source?.id ?? "")
        if (!id) return
        let v = st.verdicts.get(id)
        if (!v && st.pending.has(id)) {
          await st.pending.get(id)!.catch(() => {})
          v = st.verdicts.get(id)
        }
        if (!v) return
        ev.effect = "deny"
        ev.message = v.message
      } catch (e) {
        log(`branch guard (evaluate) failed: ${e}`)
      }
    })
  } catch (e) {
    log(`branch guard: no permission.hook("evaluate") in this OpenCode (${e}), refusals are not delivered`)
  }
  try {
    await ctx.tool.hook("execute.after", async (ev: any) => {
      try {
        const id = String(ev?.id ?? "")
        const v = st.verdicts.get(id)
        if (v) {
          st.verdicts.delete(id)
          if (ev.status === "error" && ev.error && typeof ev.error === "object") ev.error.message = v.message
        }
        st.pending.delete(id)
        const tool = String(ev?.tool ?? "")
        if (!SHELL_TOOLS.has(tool) || v) return
        // после оболочки: корень и ветка окна не сменились сами? Сменились — строка «было → стало» в журнале
        const sid = String(ev?.sessionID ?? "")
        const card = o.cardOf(sid)
        if (!card) return
        checkWindow(card, await o.dirOf(sid), o.deps, String(ev?.input?.command ?? "после команды оболочки"))
      } catch (e) {
        log(`branch guard (after) failed: ${e}`)
      }
    })
  } catch (e) {
    log(`branch guard: no tool.hook("execute.after") in this OpenCode (${e}), a branch changed by a command is seen at the next turn`)
  }
}
