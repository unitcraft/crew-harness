// Задача 257: результат задачи живёт в ДРУГОМ репозитории с независимой историей (постановка в одном репозитории,
// пакет результата — в другом). Первые ячейки — красная проба дефекта (без привязки контур смотрит только в репозиторий
// постановки: «нет в локальном репозитории задачи», с подтянутыми объектами — «не содержит основу»). Дальше — модель
// явного целевого репозитория результата: crew_task {action: "target"} (запреты: не интегратор, без слова/даты, нет
// каталога, тот же репозиторий, неверный remote, нет ветки на remote), после привязки precheck/merge/accept идут по
// репозиторию результата, чужой SHA привязанную задачу не удовлетворяет, сдвиг main пакета — «сдвинулась», уже
// опубликованный кандидат (предок вершины) закрывается без вливания, снятие привязки возвращает прежний контур.
//   node test/crew-landing-crossrepo.test.mjs
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { harness, reporter } from "./landing-harness.mjs"

const { cell, done } = reporter("crew-landing-crossrepo.test")
const H = await harness("crew-landing-crossrepo", { settings: { merge_precheck: "required" } })
const { call, git, proj, tmp, task: T } = H
const REV = "sesREV1"

// второй репозиторий со СВОЕЙ историей (репозиторий результата, «пакет»): свой origin, несвязанный с репозиторием постановки
const pkgBare = path.join(tmp, "pkg-origin.git")
const pkg = path.join(tmp, "pkg")
mkdirSync(pkg, { recursive: true })
git(tmp, "init", "-q", "--bare", "-b", "main", pkgBare)
git(pkg, "init", "-q", "-b", "main")
writeFileSync(path.join(pkg, "pkg.txt"), "package v1\n")
git(pkg, "add", "-A")
git(pkg, "commit", "-q", "-m", "package v1")
git(pkg, "remote", "add", "origin", pkgBare)
git(pkg, "push", "-q", "origin", "main")
const pkgTip = git(pkg, "rev-parse", "HEAD")

// задача поставлена в репозитории постановки (proj), результат опубликован в репозитории пакета (pkg main = pkgTip)
const t = H.reviewing()
const begin = await call("crew_task", REV, { action: "precheck", n: t.n })
cell("проба: precheck начинается по репозиторию постановки (основа — вершина его main, не пакета)", T(t.n).precheck?.state === "running" && T(t.n).precheck.base === H.originTip() && T(t.n).precheck.base !== pkgTip, begin)

const r1 = await call("crew_task", REV, { action: "precheck", n: t.n, candidate: pkgTip, result: "пакет опубликован: pkg main и тег" })
cell("ДЕФЕКТ: кандидат другого репозитория отвергнут — «нет в локальном репозитории»", /нет в локальном репозитории (задачи|результата)/.test(r1) && T(t.n).precheck.state === "running" && !T(t.n).precheck.candidate, r1)

// даже если объекты пакета подтянуть в репозиторий постановки, истории не связаны — «не содержит основу»
git(proj, "fetch", "-q", pkg, "main")
const r2 = await call("crew_task", REV, { action: "precheck", n: t.n, candidate: pkgTip, result: "пакет опубликован: pkg main и тег" })
cell("ДЕФЕКТ: с подтянутыми объектами — «не содержит основу» (истории постановки и результата независимы)", /не содержит основу/.test(r2) && T(t.n).precheck.state === "running" && !T(t.n).precheck.candidate, r2)

// ---- привязка целевого репозитория результата (crew_task {action: "target"}, задача 257): запреты
const INTEG = "sesINTEG1"
const bind = (task, input, sid = INTEG) => call("crew_task", sid, { action: "target", n: task.n, ...input })
const WORD = "«результат в пакете, привяжи репозиторий» (владелец, 2026-10-29, чат)"

const rBadRole = await bind(t, { dir: pkg, word: WORD }, REV)
cell("target: не интегратор — отказ, привязки нет", /только интегратор/.test(rBadRole) && !T(t.n).landing, rBadRole)
const rNoWord = await bind(t, { dir: pkg })
cell("target: без слова владельца — отказ", /Нужен word/.test(rNoWord) && !T(t.n).landing, rNoWord)
const rNoDate = await bind(t, { dir: pkg, word: "привяжи (владелец)" })
cell("target: слово без даты — отказ", /нет даты/.test(rNoDate) && !T(t.n).landing, rNoDate)
const rNoDir = await bind(t, { dir: path.join(tmp, "no-such-dir"), word: WORD })
cell("target: каталог не существует — отказ, привязки нет", /каталога .* нет/.test(rNoDir) && !T(t.n).landing, rNoDir)
const rSame = await bind(t, { dir: proj, word: WORD })
cell("target: тот же репозиторий, что у задачи — отказ (привязка не нужна)", /тот же репозиторий/.test(rSame) && !T(t.n).landing, rSame)
const rNoRemote = await bind(t, { dir: pkg, remote: "upstream", word: WORD })
cell("target: неверный remote — отказ, привязки нет", /remote «upstream»/.test(rNoRemote) && /нет/.test(rNoRemote) && !T(t.n).landing, rNoRemote)
const rNoBranch = await bind(t, { dir: pkg, branch: "release", word: WORD })
cell("target: ветки нет на remote — отказ, привязки нет", /ветку release/.test(rNoBranch) && /подтвердить не удалось/.test(rNoBranch) && !T(t.n).landing, rNoBranch)

// ---- привязка записывается; контур precheck/merge/accept идёт по репозиторию результата
const rBind = await bind(t, { dir: pkg, word: WORD })
cell("target: привязка записана (dir, remote, branch, url, слово), строка в истории, живая предпроверка устарела",
  T(t.n).landing?.dir === pkg && T(t.n).landing?.remote === "origin" && T(t.n).landing?.branch === "main" && T(t.n).landing?.url.includes("pkg-origin") && T(t.n).landing?.word === WORD
    && T(t.n).precheck.state === "stale" && H.history(t.n).some((h) => /репозиторий результата/.test(h)), rBind + JSON.stringify(T(t.n).precheck))

const rBegin2 = await call("crew_task", REV, { action: "precheck", n: t.n })
cell("precheck после привязки: основа — вершина main репозитория РЕЗУЛЬТАТА, не постановки", T(t.n).precheck?.state === "running" && T(t.n).precheck.base === pkgTip && T(t.n).precheck.base !== H.originTip(), rBegin2)

// произвольный SHA третьего репозитория привязанную задачу не удовлетворяет
const third = path.join(tmp, "third")
mkdirSync(third, { recursive: true })
git(third, "init", "-q", "-b", "main")
writeFileSync(path.join(third, "x.txt"), "x\n")
git(third, "add", "-A")
git(third, "commit", "-q", "-m", "third")
const thirdTip = git(third, "rev-parse", "HEAD")
const rForeign = await call("crew_task", REV, { action: "precheck", n: t.n, candidate: thirdTip, result: "чужой коммит" })
cell("привязанную задачу произвольный SHA третьего репозитория не удовлетворяет", /нет в локальном репозитории результата/.test(rForeign) && !T(t.n).precheck.candidate, rForeign)

// устаревшая база: main пакета сдвинулась после начала — merge не выдаст замок
const t3 = H.reviewing()
await bind(t3, { dir: pkg, word: WORD })
await call("crew_task", REV, { action: "precheck", n: t3.n })
const rFin3 = await call("crew_task", REV, { action: "precheck", n: t3.n, candidate: pkgTip, result: "пакет опубликован: main" })
cell("привязанная задача: кандидат, равный основе пакета, — зелёная запись", T(t3.n).precheck?.state === "green" && T(t3.n).precheck.candidate === pkgTip, rFin3)
const move1 = (() => { writeFileSync(path.join(pkg, "v2.txt"), "v2\n"); git(pkg, "add", "-A"); git(pkg, "commit", "-q", "-m", "v2"); git(pkg, "push", "-q", "origin", "main"); return git(pkg, "rev-parse", "HEAD") })()
const rMergeStale = await call("crew_task", REV, { action: "merge", n: t3.n })
cell("устаревшая база: main пакета сдвинулась после зелёной — замок не выдан (запись остаётся зелёной до повторной предпроверки)", /сдвинулась/.test(rMergeStale) && !H.holder() && T(t3.n).precheck.state === "green", rMergeStale)

// уже опубликованный кандидат (предок вершины): зелёная без вливания, merge фиксирует, accept закрывает
const rBegin3 = await call("crew_task", REV, { action: "precheck", n: t.n })
cell("после сдвига main пакета: повторный precheck переписывает основу на новую вершину", T(t.n).precheck?.state === "running" && T(t.n).precheck.base === move1, rBegin3)
const rPub = await call("crew_task", REV, { action: "precheck", n: t.n, candidate: pkgTip, result: "пакет опубликован: main и тег" })
cell("опубликованный кандидат (предок вершины): зелёная с published, ответ говорит «без вливания»",
  /уже опубликован/.test(rPub) && T(t.n).precheck?.state === "green" && T(t.n).precheck.published === true && T(t.n).precheck.candidate === pkgTip, rPub)
const rMerge = await call("crew_task", REV, { action: "merge", n: t.n })
cell("merge: замок выдан на вершине пакета, факт публикации перепроверен под замком, вливание не нужно",
  /твой, выдан на вершину main/.test(rMerge) && /уже опубликован/.test(rMerge) && H.holder()?.session === REV && H.holder()?.n === t.n, rMerge)
const rAccept = await call("crew_task", REV, { action: "accept", n: t.n, commit: pkgTip })
cell("accept: принято по коммиту репозитория результата (истории постановки и результата не связаны), оба замка отпущены",
  T(t.n).status === "accepted" && T(t.n).commit === pkgTip && !H.holder() && !H.review.pubHolder(H.review.pubKeyOf(T(t.n))) && T(t.n).precheck.state === "green" && !!T(t.n).precheck.accepted_on, rAccept)
cell("accept: свидетельства сохранены — привязка, published, accepted_on из репозитория результата",
  T(t.n).landing?.dir === pkg && T(t.n).precheck.published === true && [move1].includes(T(t.n).precheck.accepted_on), JSON.stringify({ landing: T(t.n).landing, precheck: T(t.n).precheck }))

// снятие привязки: контур снова по репозиторию постановки
const t4 = H.reviewing()
await bind(t4, { dir: pkg, word: WORD })
const rUnbind = await bind(t4, { dir: "", word: WORD })
cell("target dir \"\": привязка снята, строка в истории", !T(t4.n).landing && /снята/.test(rUnbind) && H.history(t4.n).some((h) => /привязка .* снята/.test(h)), rUnbind)
await call("crew_task", REV, { action: "precheck", n: t4.n })
cell("после снятия привязки precheck снова читает вершину репозитория постановки", T(t4.n).precheck?.base === H.originTip(), JSON.stringify(T(t4.n).precheck))

// ---- запись предпроверки явно привязана к repo/remote/ref (задача 257, уточнение интегратора)
const t5 = H.reviewing()
await bind(t5, { dir: pkg, word: WORD })
await call("crew_task", REV, { action: "precheck", n: t5.n })
cell("запись «идёт» хранит снимок привязки (dir, remote, branch)",
  T(t5.n).precheck?.landing?.dir === pkg && T(t5.n).precheck?.landing?.remote === "origin" && T(t5.n).precheck?.landing?.branch === "main", JSON.stringify(T(t5.n).precheck))
await call("crew_task", REV, { action: "precheck", n: t5.n, candidate: pkgTip, result: "ci пакета" })
cell("зелёная запись хранит снимок привязки", T(t5.n).precheck?.state === "green" && T(t5.n).precheck?.landing?.dir === pkg, JSON.stringify(T(t5.n).precheck))
// привязка сменилась мимо действия target (правкой файла): зелёная запись ей не соответствует — merge отказывает
const tampered = T(t5.n)
tampered.landing = { ...tampered.landing, branch: "main2" }
H.tasks.saveTask(tampered)
const rMergeTamper = await call("crew_task", REV, { action: "merge", n: t5.n })
cell("merge: запись не от текущей привязки — отказ «другой привязки», замки не взяты", /другой привязки/.test(rMergeTamper) && !H.holder(), rMergeTamper)
// и завершение предпроверки со сменившейся привязкой отказывает
const t6 = H.reviewing()
await bind(t6, { dir: pkg, word: WORD })
await call("crew_task", REV, { action: "precheck", n: t6.n })
const tampered6 = T(t6.n)
tampered6.landing = { ...tampered6.landing, remote: "upstream" }
H.tasks.saveTask(tampered6)
const rFinTamper = await call("crew_task", REV, { action: "precheck", n: t6.n, candidate: pkgTip, result: "ci пакета" })
cell("finishPrecheck: привязка сменилась после начала — отказ, запись остаётся «идёт»", /другой привязки/.test(rFinTamper) && T(t6.n).precheck.state === "running" && !T(t6.n).precheck.candidate, rFinTamper)

// смена адреса remote после предпроверки инвалидирует запись (задача 257, уточнение интегратора): клон со ВТОРЫМ url
const elsewhere = path.join(tmp, "elsewhere.git")
git(tmp, "clone", "-q", "--bare", pkgBare, "elsewhere.git")
const t8 = H.reviewing()
await bind(t8, { dir: pkg, word: WORD })
await call("crew_task", REV, { action: "precheck", n: t8.n })
await call("crew_task", REV, { action: "precheck", n: t8.n, candidate: pkgTip, result: "ci пакета" })
const urlWas = git(pkg, "remote", "get-url", "origin")
git(pkg, "remote", "set-url", "origin", elsewhere)
const rUrl = await call("crew_task", REV, { action: "merge", n: t8.n })
cell("смена URL remote после зелёной: merge отказывает («другой привязки»), замки не взяты", /другой привязки/.test(rUrl) && !H.holder(), rUrl)
const rBeginUrl = await call("crew_task", REV, { action: "precheck", n: t8.n })
cell("смена URL remote после привязки: новая предпроверка не начинается, пока интегратор не подтвердит привязку заново", /адрес remote .* сменился/.test(rBeginUrl) && T(t8.n).precheck.state === "green", rBeginUrl)
git(pkg, "remote", "set-url", "origin", urlWas)

// ---- замок публикации в цель: один на цель независимо от проекта-владельца (задача 257, уточнение интегратора)
// кандидат равен основе (pkgTipNow): служба releaseLandedLock такой замок фоном не отпускает («кандидат = основа») — ячейки без гонки
const t7 = H.reviewing()
await bind(t7, { dir: pkg, word: WORD })
await call("crew_task", REV, { action: "precheck", n: t7.n })
const pkgTipNow = git(pkgBare, "rev-parse", "refs/heads/main")
await call("crew_task", REV, { action: "precheck", n: t7.n, candidate: pkgTipNow, result: "ci пакета" })
const pubKey = H.review.pubKeyOf(T(t7.n))
// цель держит приёмщик ДРУГОГО проекта (живая карточка sesREV3 и живая задача otherproj/900 — замок не брошен)
H.core.saveCard({ session: "sesREV3", role: "worker", auto: false, title: "sesREV3", directory: proj, repo: "proj", project: "otherproj", pid: process.pid, updated: Date.now() })
H.tasks.createTask({ project: "otherproj", title: "чужая задача", goal: "g", criteria: "c", priority: "P2", tier: "light", role: "worker", model: "claude-code/haiku", author: "sesINTEG1", author_role: "otherproj.integrator", qid: "qother", status: "reviewing", kind: "spawn", directory: pkg, executor: "sesEXO", reviewer: "sesREV3", review_kind: "tab", review_qid: "rqother" }, undefined, { n: 900 })
H.review.takePubLock(pubKey, "otherproj", "sesREV3", 900)
const rBusy = await call("crew_task", REV, { action: "merge", n: t7.n })
cell("замок публикации: цель занята задачей другого проекта — отказ с именем держателя, замок проекта не оставлен",
  /цель публикации .* занята/.test(rBusy) && /otherproj/.test(rBusy) && !H.holder(), rBusy)
H.review.releasePubLock(pubKey, "otherproj", "sesREV3", 900)
const rFree = await call("crew_task", REV, { action: "merge", n: t7.n })
cell("замок публикации: цель свободна — замок выдан, публикация держится приёмщиком этой задачи",
  /выдан на вершину/.test(rFree) && H.review.pubHolder(pubKey)?.session === REV && H.review.pubHolder(pubKey)?.n === t7.n && H.review.pubHolder(pubKey)?.project === "proj", rFree)
const rUnl = await call("crew_task", REV, { action: "unlock", n: t7.n })
cell("unlock: отпущены оба замка (проекта и публикации), запись устарела", /отпущен/.test(rUnl) && !H.holder() && !H.review.pubHolder(pubKey) && T(t7.n).precheck.state === "stale", rUnl)

done(H)
