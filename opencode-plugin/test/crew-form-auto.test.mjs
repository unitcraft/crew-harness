// Self-test of the automatic answer to the forms of the built-in questionnaire, task 096 (node >= 24):  node test/crew-form-auto.test.mjs
// Owner, 2026-10-19: "answer_mode: recommendations only works for text questions of one kind - I was sure these were automatic answers to
// the questionnaires". A form (a record of forms/, kind question, with options) is closed by the plugin itself when ALL of this holds: the
// project settings (with the `local` block) give the mode `recommendations` for the type of the question (the type of a form is `default`,
// or the `Тип:` of its text); exactly one option is marked "(Recommended)" and it is the first; the question is not on the closed list
// (the table CLOSED_LIST: gates of the methodology, tag/release/publish, force/password/key/token/money, "слово владельца", the keys
// answer_*, lifting prohibitions and borders); the limit `answer_max` of answers in a row for the session is not spent; the form is not
// replaced, stale, cancelled or in the repeat. The answer is put no sooner than `answer_delay_sec` after the form appeared. Delivery is the
// answer file of task 059 (owner-answer.ts) with the source "plugin". This file: the pure rules and the tick with fake dependencies, and the
// "death between changes" of the delivery (rule 13/34(e) of the methodology). Red probe: the first run before the code (form-auto.ts is missing).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-form-auto-"))
process.env.XDG_DATA_HOME = tmp
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const core = await import("../core.ts")
const fw = await import("../form-wait.ts")
const oa = await import("../owner-answer.ts")
let fa
try {
  fa = await import("../form-auto.ts")
} catch (e) {
  console.log(`FAIL form-auto.ts is missing :: ${e}`)
  process.exit(1)
}

// ---- the closed list: a table "action -> patterns + examples that do not close" (task 097) --------------------------------
// Owner, 2026-10-19: "не задавайте и не тормозите" - the plugin asks the owner only for the closed list. A question is closed when it
// PROPOSES an action of the list (a verb + an object, or a nominal action after a word of proposal), or when the RECOMMENDED option
// itself contains such an action. A word of the list in the description of the situation ("red on main", "found at the handover")
// closes nothing. Every row of CLOSED_LIST has patterns (act) and two kinds of examples: `yes` (closes by this row) and `no` (does not).
// The old cells (task 096) were phrases that name the action: they stay; the phrases that only MENTIONED a word moved to MENTION below.
const CLOSED = [
  ["gates", "Пройти ворота приёмки без слова владельца?"],
  ["gates", "Снять gate перед следующим шагом?"],
  ["gates", "Это ворота методики?"],
  ["gates", "Нужен gate перед следующим шагом?"],
  ["accept", "Принять результат задачи?"],
  ["accept", "Готовить сдачу сейчас?"],
  ["approval", "Утвердить спецификацию задачи?"],
  ["approval", "Approve the plan of the task?"],
  ["approval", "Согласовать spec.md с владельцем?"],
  ["push", "Запушить ветку в origin?"],
  ["push", "Выполнить git push сейчас?"],
  ["push", "Отправить изменения в main?"],
  ["merge", "Влить ветку в основную?"],
  ["merge", "Сделать merge после проверки?"],
  ["merge", "Слить через squash?"],
  ["delete", "Удалить ветку и рабочее дерево?"],
  ["delete", "Сделать уборку после приёмки?"],
  ["delete", "Delete the old folder?"],
  ["restart", "Перезапустить службу OpenCode?"],
  ["restart", "Нужен restart сервиса?"],
  ["live", "Сделать живую проверку на рабочей системе?"],
  ["live", "Проверить на живой службе?"],
  ["release", "Поставить tag 0.3.0?"],
  ["release", "Выпустить релиз?"],
  ["release", "Опубликовать пакет?"],
  ["release", "Загрузить asset в артефакт?"],
  ["release", "Закрепить артефакт (pin) в боковой панели?"],
  ["force", "Применить force к ветке?"],
  ["secret", "Использовать пароль из файла?"],
  ["secret", "Записать токен в настройки?"],
  ["secret", "Выдать новый API key?"],
  ["money", "Оплатить подписку?"],
  ["money", "Потратить деньги на квоту?"],
  ["owner-word", "Это решение требует слова владельца?"],
  ["answer-keys", "Поменять answer_mode проекта?"],
  ["answer-keys", "Увеличить answer_max до 10?"],
  ["answer-keys", "Выставить answer_delay_sec в ноль?"],
  ["config", "Поправить .opencode/crew-harness.json?"],
  ["boundaries", "Разрешить правку вне границ задачи?"],
  ["boundaries", "Расширить объём задачи на соседний модуль?"],
  ["boundaries", "Снять запрет на правку чужого репозитория?"],
  ["waive", "Отказаться от требования про журнал?"],
  ["ceiling", "Добавить ещё один раунд сверх потолка?"],
  ["ceiling", "Разрешить одну проверку сверх прежнего лимита?"],
  ["rights", "Расширить права исполнителя на соседний проект?"],
  ["environments", "Менять общую среду разработки?"],
]
for (const [id, text] of CLOSED) {
  const hits = fa.closedHits(text).map((h) => h.id)
  cell(`closed list [${id}]: «${text}»`, hits.includes(id), JSON.stringify(hits))
}
// the table itself: patterns, `yes` and `no` examples in every row; the examples are run as cells (a row is extended by a line, no logic)
cell("closed list: every rule has an id, a reason and patterns", fa.CLOSED_LIST.length >= 18 && fa.CLOSED_LIST.every((r) => r.id && r.why && Array.isArray(r.act) && r.act.length > 0), JSON.stringify(fa.CLOSED_LIST.map((r) => r.id)))
cell("closed list: every rule has at least 2 closing and 2 not-closing examples", fa.CLOSED_LIST.every((r) => Array.isArray(r.yes) && r.yes.length >= 2 && Array.isArray(r.no) && r.no.length >= 2), JSON.stringify(fa.CLOSED_LIST.filter((r) => !(r.yes?.length >= 2 && r.no?.length >= 2)).map((r) => r.id)))
cell("closed list: every rule of the table is covered by a cell above", fa.CLOSED_LIST.every((r) => CLOSED.some(([id]) => id === r.id)), JSON.stringify(fa.CLOSED_LIST.filter((r) => !CLOSED.some(([id]) => id === r.id)).map((r) => r.id)))
for (const r of fa.CLOSED_LIST) {
  for (const ex of r.yes ?? []) {
    const hits = fa.exampleHits(ex).map((h) => h.id)
    cell(`closed list [${r.id}] closes: «${ex}»`, hits.includes(r.id), JSON.stringify(hits))
  }
  for (const ex of r.no ?? []) {
    const hits = fa.exampleHits(ex).map((h) => h.id)
    cell(`closed list [${r.id}] does NOT close: «${ex}»`, !hits.includes(r.id), JSON.stringify(hits))
  }
}
// the situations that only MENTION a word of the list close nothing (any row); the words come from the real journal of 2026-10-18
const MENTION = [
  "Красный на main: страж check-wiring пришёл коммитом без адреса плана.",
  "Найден при сдаче задачи, дефект открыт.",
  "Прогнать gate-tool локально? Хук требует зелёный вердикт gate-tool на вливаемый хеш.",
  "Слияние несёт новый файл, хук требует свежий вердикт.",
  "Merge/precheck пока не запускались.",
  "Guards публикации красные на старых выдержках и форматах.",
  "После удаления регистрации старая задача осталась в другом проекте.",
  "Разделить выпускную работу и исправление плагина?",
  "Для следующего шага требуется согласованная очередь машины партнёра.",
  "Простой межпроцессный gate не проверен.",
  "Канон и pin не изменены, оригиналы сохранены.",
  "Результат принят, замечаний нет. Спецификация утверждена вчера.",
  "До потолка остался один заход; пятичасовая квота исчерпана.",
  "Служба перезапущена владельцем, плагин подгружен.",
  "Лимит токенов на сегодня исчерпан.",
  "Проверить ключи в таблице реестра и сравнить хеши.",
]
for (const text of MENTION) cell(`closed list: a mention «${text.slice(0, 60)}» closes nothing`, fa.closedHits(text).length === 0, JSON.stringify(fa.closedHits(text)))
for (const text of ["Какой формат отчёта выбрать?", "Начать с теста или с кода?", "Разрешить Phase 1 сразу?", "Вариант A или вариант B для таблицы?", "Как назвать новую функцию?"]) cell(`closed list: neutral «${text}» passes`, fa.closedHits(text).length === 0, JSON.stringify(fa.closedHits(text)))
// safety: phrasings of real gates that must still close, in the forms the sessions write (a recall battery, task 097); an example with " => " is a question and the recommended option
const RECALL = [
  "Пушим в main?", "Можно запушить в main прямо сейчас?", "Разрешаете запушить ветку?", "Выполнить git push origin main?", "Нужно ли делать пуш?", "Откатить main на прошлый коммит?",
  "Сливаем ветку в main?", "Можно вливать?", "Влить задачу 12 в основную ветку?", "Делаем merge?", "Можно мержить?", "Выполнить git merge --ff-only?", "Разрешить слияние?", "Rebase onto main?",
  "Удалить ветку task/12?", "Удаляем рабочее дерево?", "Можно убрать старые ветки?", "Очистить worktrees после слияния?", "Стереть папку с результатами?", "git branch -d task/12?", "Сделать cleanup?",
  "Выпускаем 0.3.0?", "Ставим тег v1.2?", "Публикуем релиз?", "Опубликовать в npm?", "Создать release 0.3.0?", "Deploy to production?",
  "Перезапускаем службу?", "Можно перезапустить opencode?", "Остановить службу и запустить заново?", "Переключить службу на новую версию?",
  "Утверждаем план?", "Утвердить spec.md?", "Одобряем спецификацию?", "Принимаем задачу?", "Принять работу исполнителя?", "Подтвердить сдачу?", "Закрываем задачу 12 как принятую?", "Accept the result?",
  "Использовать --force?", "Force-push?", "Введите пароль для сервера?", "Передать токен доступа агенту?", "Добавить API ключ в настройки?", "Оплатить квоту?", "Купить подписку на модель?",
  "Расширить права агента?", "Выдать доступ к соседнему репозиторию?", "Разрешить работу вне границ задачи?", "Выйти за границы задачи?", "Пропустить проверки стражей?", "Отключить хуки?",
  "Поменять answer_max?", "Отредактировать .opencode/crew-harness.json?", "Отказаться от критерия приёмки?", "Превысить потолок раундов?", "Менять общую среду?", "Запустить боевую проверку?", "Править рабочую копию main?",
  "Что делаем с веткой? => Запушить в main (Recommended)", "Как поступить? => Удалить ветку (Recommended)", "Продолжаем? => Слить в main (Recommended)", "Что дальше? => Принять (Recommended)", "Как? => Опубликовать (Recommended)",
  "Как? => Утвердить план (Recommended)", "Что делаем? => Перезапустить службу (Recommended)", "Что делаем? => Продолжить || Запушить ветку и влить в main",
]
for (const text of RECALL) cell(`recall: «${text}» stays with the owner`, fa.exampleHits(text).length > 0, "")
for (const text of ["Исправить баг сейчас или после рефакторинга?", "Использовать Map или объект?", "Назвать функцию parse или read?", "Запустить тесты сначала или сборку?", "Добавить тест на граничный случай?", "Вынести функцию в отдельный файл?", "Прогнать полный набор тестов?", "Продолжить текущим заходом?", "Какую модель взять для проверки?"]) cell(`recall: neutral «${text}» passes`, fa.exampleHits(text).length === 0, JSON.stringify(fa.exampleHits(text)))
// the recommended option is scanned too: its label and description, with the question as the context of the objects
cell("closed list: the label of the recommended option proposes a push", fa.closedHits("Что делаем с веткой?", "Запушить в origin (Recommended)").some((h) => h.id === "push"), "")
cell("closed list: the description of the recommended option proposes a deletion of a branch", fa.closedHits("Что делаем с веткой?", "Убрать", "Удалить ветку и рабочее дерево").some((h) => h.id === "delete"), "")
cell("closed list: a bare verb in the label takes its object from the question", fa.closedHits("Что делаем с результатом приёмки?", "Принять (Recommended)").some((h) => h.id === "accept"), JSON.stringify(fa.closedHits("Что делаем с результатом приёмки?", "Принять (Recommended)")))
cell("closed list: a negated action does not propose it", fa.closedHits("Как поступить с веткой?", "Оставить (Recommended)", "Без push и без удаления ветки").length === 0, JSON.stringify(fa.closedHits("Как поступить с веткой?", "Оставить (Recommended)", "Без push и без удаления ветки")))

// ---- the real journal of 2026-10-18 (task 097): the questions the owner answered "по рекомендации", impersonal text -----------------
// The 23 forms whose answer was the option "(Recommended)" (the journal answers/ of the plugin data, read only; the letters keep the first
// 200 characters of the question). Names of people, models, projects and hashes are replaced; the verbs and the objects are as they were.
// "hold": the rule that must keep the form with the owner (the real gates); "auto": the plugin may close it.
const REAL = [
  ["auto", "Разрешить уже работающей модели A перенести готовую дельту в Канон рабочего дерева (шаги 5–9 плана), сохранив abc1234 и новые нормы целевой ветки, затем провести одну независимую проверку модели A вместо модели B?", "Перенос + модель A"],
  ["auto", "Приёмка #5 «Исправить сравнение и проверить ключи» встала на сборке кандидата: слияние несёт tool/tool.toml (путь яруса tool), хук требует свежий зелёный вердикт gate-tool на вливаемый хеш, а письмо пр", "Прогнать gate-tool локально"],
  ["auto", "Для разрешённой вами задачи `proj-b` выяснилось, что корень сателлита относится к отдельному техническому проекту `proj-b`; интегратор соседнего проекта не может напрямую назначить там исполнителя. Разре", "Разрешить координатора"],
  ["ceiling", "Модель B исчерпала пятичасовую квоту. Проверка С2-4 дошла до 3/6, итогового отчёта нет; артефакты сохранены. Рекомендую для приоритетной задачи разрешить одну заменяющую проверку модели A сверх прежнего лимита, затем снов", "Одна модель A"],
  ["accept", "Работа 61: перенос на abc1234 проверен независимой моделью A — 0 существенных, 0 поверхностных находок. Рекомендую принять документальный результат с раскрытыми оговорками (одна семья, мнение получено после переноса", "Принять и готовить"],
  ["auto", "Стражи публикации красные на старых выдержках и форматах, а не на внесённом Каноне. Рекомендую сохранить точные оригиналы в архиве с manifest, а открытые документы подготовить как явно обозначенные пу", "Архив и копии"],
  ["approval", "Проверка С2-5 нашла одну коллизию. Рекомендую точечно исправить AC-05 и утвердить требования: каждому эффекту — стабильный `(O, effectID)`; при close до его admission — ноль допусков/исполнений; разрешённый эф", "Исправить и утвердить"],
  ["push", "Работа 61: кандидат `abc1234` от свежего main полностью зелёный локально; просрочено: 0. Разрешить push только ветки кандидата для серверного CI и штатную техническую приёмку публикационного пакета? Рекомен", "Ветка и приёмка"],
  ["auto", "Как продолжить приёмку 1? Точные PR refs и связанные runs получены, но все три existing checks — FAILURE, а product work отсутствует. Merge/precheck пока не запускались.", "Вернуть на выполнение"],
  ["auto", "Выбрано «сначала завершить сателлит 1», но её global registration уже снята: координатор сменился, а worker/приёмщик остались в проекте proj-b и не могут штатно общаться. Рекомендую временно вернуть ро", "Временно вернуть"],
  ["approval", "Утвердить план перехода реестра на «reg N»? Читающих мест одно (scan.py), учителей формы четыре (PR-шаблон, rules-for-agents.md, шапка check.sh, handoff.md).", "Всё одним слиянием, без окна"],
  ["auto", "Лёгкие проверки пройдены; product commits внесены в сателлитную ветку. Для следующего обязательного шага требуется согласованная очередь машины партнёра: Linux cold build всех 18 архивов и строгий guard; зат", "Ждать партнёра"],
  ["answer-keys", "В правилах CrewHarness изменение answer_mode разрешено только человеку: правкой .opencode/crew-harness.json и коммитом. Поэтому изменение не выполнено, интегратор CrewHarness уведомлён. Как поступаем?", "Вручную"],
  ["auto", "Штатной отмены осиротевшей задачи 1 без возврата проекта сейчас нет: отмена заказа 102 дочернюю задачу не останавливает. Рекомендую разрешить одну С3 модели A существующей 81 «Блокировка закрытых сессий и их о", "Один план модели A"],
  ["auto", "После удаления регистрации старая задача `proj-b` 1 осталась в другом проекте на доработке. CrewHarness подтвердил: отмена заказа 102 её не отменит, а штатной команды отменить задачу чужог", "Спланировать безопасный fence"],
  ["auto", "Разрешаете отделить выпускную работу 94 от общего исправления плагина 81, сохранив обязательный доказанный адресный fence старой сессии перед любым повтором Phase 1? Это решение о порядке, **не разр", "Отделить при fence"],
  ["auto", "Реестр №1887 (ОТКРЫТАЯ, найдена при сдаче 103): check-guard-wiring красный на main — страж check-foo пришёл коммитом abc1234 с шапкой в 3 строки без адреса плана и вне guard-w", "Строка долга в базе"],
  ["auto", "Приёмка 103 подтвердила на исходном `main` отдельный открытый дефект №1887: ночной `check-guard-wiring` красный из-за недокументированной шапки `check-foo.sh` и отсутствующей записи b", "Да, отдельная задача"],
  ["auto", "Реестр №1887 (ОТКРЫТАЯ, найдена при сдаче 103): check-guard-wiring красный на main — страж check-foo пришёл коммитом abc1234 с шапкой в 3 строки без адреса плана и вне guard-w", "Строка долга в базе"],
  ["auto", "Работа 103 завершена с 16:40, но подтверждение слота от занятого интегратора не приходит почти час. Новых активных этапов в списке нет. Рекомендую зарезервировать освободившийся слот за одной уже р", "Выделить слот"],
  ["auto", "План 81 готов. Для соблюдения требований предложены SQLite и новый нативный Windows-broker с ограниченными правами процессов; реальная работоспособность ещё не доказана. Рекомендую разрешить одному и", "RED и прототип"],
  ["auto", "Прототип пока не даёт нужного доказательства: A фактически не закрывается в тесте, watch запускается до close, а простой межпроцессный gate не проверен. Рекомендую одну ограниченную доработку обычным ", "Одна доработка"],
  ["auto", "Вторая попытка неполная: A.effect проверен до запуска watch, а два процесса запущены последовательно. Причины найдены, raw и оставшаяся fixture сохранены; тяжёлые компоненты не обоснованы. Рекомендую ", "Одна модель A на пробы"],
]
const realJudge = (q, label) => fa.judgeForm({ id: "frm_r", at: 1, born: 1, title: "Questions", question: q.slice(0, 200), full: q, options: [`${label} (Recommended)`], nq: 1, kind: "question" }, { mode: { default: "recommendations" } })
let realAuto = 0
REAL.forEach(([want, q, label], i) => {
  const j = realJudge(q, label)
  if (j.ok) realAuto++
  if (want === "auto") cell(`real journal #${i + 1}: «${label}» is closed by the plugin`, j.ok === true, JSON.stringify(j))
  else cell(`real journal #${i + 1}: «${label}» stays with the owner by the rule «${want}»`, j.ok === false && j.reason === "closed" && fa.closedHits(q, `${label} (Recommended)`).some((h) => h.id === want), JSON.stringify([j, fa.closedHits(q, label)]))
})
// the 24th answer of the same day (after the measure of task 096): a technical question "confirm that the old tab is closed" - the plan is only context
cell("real journal #24: «Закрыта, запускай» is closed by the plugin (the word «плану» stands before the verb «подтвердите»)", realJudge("Новый изолированный Phase 1 runner прошёл короткую независимую статическую проверку; исходные архивы и SHA совпали с прежним манифестом. Для запуска по упрощённому плану подтвердите: закрыта ли старая", "Закрыта, запускай").ok === true, "")
cell("real journal: 23 forms, the plugin closes at least 60 % (was 7 of 23); the 6 real gates (accept, approval x2, push, answer keys, ceiling) all stay", REAL.length === 23 && realAuto / REAL.length >= 0.6 && REAL.filter(([w]) => w !== "auto").length === 6, `${realAuto} of ${REAL.length}`)

// ---- judgeForm: the rules on one form ---------------------------------------------------------------------------------
const REC = { default: "recommendations" }
const F = (over = {}) => ({ id: "frm_1", at: 1_000, born: 1_000, title: "Questions", question: "Какой формат отчёта?", full: "Какой формат отчёта?", options: ["Короткий (Recommended)", "Длинный"], nq: 1, kind: "question", session: "sesA", ...over })
const J = (over, map = REC) => fa.judgeForm(F(over), { mode: map })
const ok = (j) => j.on && j.ok
const why = (j) => (j.on && !j.ok ? j.reason : j.on ? "ok" : "off")
cell("judge: one (Recommended) first, nothing closed -> answered with option 1", ok(J({})) && J({}).option === 1 && /Короткий/.test(J({}).label), JSON.stringify(J({})))
cell("judge: the mark is read without case", ok(J({ options: ["Короткий (recommended)", "Длинный"] })), JSON.stringify(J({ options: ["Короткий (recommended)", "Длинный"] })))
cell("judge: no mark -> norec", why(J({ options: ["Короткий", "Длинный"] })) === "norec", JSON.stringify(J({ options: ["Короткий", "Длинный"] })))
cell("judge: two marks -> norec", why(J({ options: ["Короткий (Recommended)", "Длинный (Recommended)"] })) === "norec", "")
cell("judge: the mark not on the first option -> norec", why(J({ options: ["Короткий", "Длинный (Recommended)"] })) === "norec", "")
cell("judge: no options (a free text question) -> norec", why(J({ options: undefined })) === "norec", JSON.stringify(J({ options: undefined })))
cell("judge: a Russian mark is not a guess -> norec", why(J({ options: ["Короткий (рекомендуется)", "Длинный"] })) === "norec", "")
cell("judge: not one question in the form -> doubt", why(J({ nq: 2 })) === "doubt" && why(J({ nq: undefined })) === "doubt", JSON.stringify([J({ nq: 2 }), J({ nq: undefined })]))
cell("judge: a multiple choice -> doubt", why(J({ multi: true })) === "doubt", "")
cell("judge: no mode / mode owner -> off (the old behaviour)", J({}, {}).on === false && J({}, { default: "owner" }).on === false && J({}, { implementation: "recommendations" }).on === false, JSON.stringify([J({}, {}), J({}, { default: "owner" }), J({}, { implementation: "recommendations" })]))
cell("judge: Тип: implementation takes the mode of the type", ok(J({ full: "Тип: implementation. Какой формат?" }, { implementation: "recommendations" })), "")
cell("judge: Тип: plan with the mode owner for plan -> off", J({ full: "Тип: plan. Какой формат?" }, { default: "recommendations", plan: "owner" }).on === false, "")
cell("judge: Тип: gate stays with the owner whatever the mode (closed)", why(J({ full: "Тип: gate. Какой формат?" })) === "closed" && J({ full: "Тип: gate. Какой формат?" }).rule === "gate-type", JSON.stringify(J({ full: "Тип: gate. Какой формат?" })))
cell("judge: an unknown Тип -> doubt", why(J({ full: "Тип: что-то. Какой формат?" })) === "doubt", JSON.stringify(J({ full: "Тип: что-то. Какой формат?" })))
cell("judge: a word of the closed list in the question -> closed", why(J({ full: "Влить в main?", question: "Влить в main?" })) === "closed", JSON.stringify(J({ full: "Влить в main?" })))
cell("judge: a word of the closed list in the title -> closed", why(J({ title: "Перезапуск службы" })) === "closed", "")
cell("judge: a word of the closed list in the recommended option -> closed", why(J({ options: ["Выпустить релиз (Recommended)", "Нет"] })) === "closed", "")
cell("judge: a word of the closed list in the description of the recommended option -> closed", why(J({ optDesc: ["Оплатить и продолжить", ""] })) === "closed", "")
cell("judge: a closed word only in ANOTHER option does not close", ok(J({ options: ["Короткий (Recommended)", "Нет, не пушить"], optDesc: ["", "удалить всё"] })), JSON.stringify(J({ options: ["Короткий (Recommended)", "Нет, не пушить"] })))
cell("judge (097): a word of the gates in the description of the situation closes nothing", ok(J({ full: "На main красный, найден при сдаче 103, gate-tool не проходит. Как продолжить?", question: "На main красный, найден при сдаче 103, gate-tool не проходит. Как продолжить?" })), JSON.stringify(J({ full: "На main красный, найден при сдаче 103. Как продолжить?" })))
cell("judge (097): a neutral question whose RECOMMENDED option proposes a push is closed", why(J({ options: ["Запушить ветку в origin (Recommended)", "Оставить локально"] })) === "closed", JSON.stringify(J({ options: ["Запушить ветку в origin (Recommended)", "Оставить локально"] })))
cell("judge (097): the description of the recommended option may mention a word of the gates without proposing it", ok(J({ optDesc: ["Короткий; на main красный после слияния", ""] })), JSON.stringify(J({ optDesc: ["Короткий; на main красный после слияния", ""] })))
cell("judge (097): the rule and the word of the hit are named in the reason", J({ full: "Влить в main?", question: "Влить в main?" }).rule === "merge" && /влить/.test(J({ full: "Влить в main?", question: "Влить в main?" }).why), JSON.stringify(J({ full: "Влить в main?" })))
cell("judge: the closed list wins over a missing mark", why(J({ full: "Влить в main?", options: ["Да", "Нет"] })) === "closed", "")
cell("judge: the whole text is read, not the 200 characters of the record", why(J({ question: "Какой формат?", full: `Какой формат? ${"слово ".repeat(60)} затем перезапустить службу` })) === "closed", "")

// ---- the tick with fake dependencies ---------------------------------------------------------------------------------
const formsDir = path.join(tmp, "forms")
const answersDir = path.join(tmp, "answers")
const S = "sesTICK"
const logLines = []
const cfgOn = { mode: REC, max: 3, delaySec: 60, project: "proj", task: 7 }
const mkDeps = (over = {}) => ({ config: () => cfgOn, tab: async () => ({ open: true, busy: true }), ownerWrote: async () => false, ownerWordAfter: async () => 0, say: (l) => logLines.push(l), ...over })
const T0 = 10_000_000
const put = (over = {}) => fw.addForm(over.session ?? S, F({ session: S, at: T0, born: T0, ...over }), formsDir)
const dirFiles = (d) => (existsSync(d) ? readdirSync(d).filter((n) => n.endsWith(".json")) : [])
const answerFile = (id) => core.readJson(path.join(answersDir, `auto-${core.safeKey(id)}.json`))
const reset = () => {
  rmSync(formsDir, { recursive: true, force: true })
  rmSync(answersDir, { recursive: true, force: true })
}

// before the delay nothing; at the delay one answer file with the source plugin
reset()
put()
await fa.autoTick(mkDeps(), T0 + 59_000, formsDir, answersDir)
cell("tick: before answer_delay_sec nothing is put", dirFiles(answersDir).length === 0, JSON.stringify(dirFiles(answersDir)))
await fa.autoTick(mkDeps(), T0 + 60_000, formsDir, answersDir)
const af = answerFile("frm_1")
cell("tick: at the delay one answer file is put, source plugin, option 1, form and session", dirFiles(answersDir).length === 1 && af?.source === "plugin" && af.option === "1" && af.form === "frm_1" && af.session === S && /answer_mode/.test(af.quote ?? "") && af.project === "proj" && af.task === 7 && af.mode === "recommendations" && af.type === "default", JSON.stringify(af))
await fa.autoTick(mkDeps(), T0 + 66_000, formsDir, answersDir)
await fa.autoTick(mkDeps(), T0 + 72_000, formsDir, answersDir)
cell("tick: a repeated tick does not answer twice (idempotent)", dirFiles(answersDir).length === 1, JSON.stringify(dirFiles(answersDir)))
writeFileSync(path.join(answersDir, "auto-frm_1.json"), JSON.stringify({ ...af, status: "applied", done: T0 + 61_000 }))
await fa.autoTick(mkDeps(), T0 + 80_000, formsDir, answersDir)
cell("tick: an applied answer is not repeated either", dirFiles(answersDir).length === 1, JSON.stringify(dirFiles(answersDir)))
cell("tick: the log says who answered and why", logLines.some((l) => /frm_1/.test(l) && /answer_mode|recommend/i.test(l)), logLines.join(" | "))

// delay 0: at once
reset()
put()
await fa.autoTick(mkDeps({ config: () => ({ ...cfgOn, delaySec: 0 }) }), T0, formsDir, answersDir)
cell("tick: answer_delay_sec 0 answers at once", dirFiles(answersDir).length === 1, JSON.stringify(dirFiles(answersDir)))

// the owner was first: the form is gone (replied) before the deadline
reset()
put()
await fa.autoTick(mkDeps(), T0 + 30_000, formsDir, answersDir)
fw.removeForm(S, "frm_1", formsDir)
await fa.autoTick(mkDeps(), T0 + 70_000, formsDir, answersDir)
cell("tick: the owner answered before the deadline -> no automatic answer", dirFiles(answersDir).length === 0, JSON.stringify(dirFiles(answersDir)))

// the owner wrote in the tab; the tab is not busy; the tab is closed
for (const [name, over] of [
  ["the owner wrote in the tab", { ownerWrote: async () => true }],
  ["the tab has no running turn", { tab: async () => ({ open: true, busy: false }) }],
  ["the tab is closed", { tab: async () => ({ open: false, busy: true }) }],
  ["the session has no settings (no card)", { config: () => undefined }],
]) {
  reset()
  put()
  await fa.autoTick(mkDeps(over), T0 + 70_000, formsDir, answersDir)
  cell(`tick: ${name} -> no automatic answer`, dirFiles(answersDir).length === 0, JSON.stringify(dirFiles(answersDir)))
}

// a form that is replaced, stale, cancelled, in the repeat, exhausted
for (const [name, over, now] of [
  ["replaced by a newer form", { replacedBy: "frm_2" }, T0 + 70_000],
  ["stale (older than the TTL)", {}, T0 + fw.FORM_TTL_MS + 1_000],
  ["cancelled (Esc)", { cancelled: T0 + 1_000 }, T0 + 70_000],
  ["in the repeat of a lost question", { repeats: 1, wokeAt: T0 + 5_000 }, T0 + 70_000],
  ["exhausted (no answer after the repeats)", { exhausted: T0 + 5_000 }, T0 + 70_000],
]) {
  reset()
  put(over)
  await fa.autoTick(mkDeps(), now, formsDir, answersDir)
  cell(`tick: a form ${name} is not touched`, dirFiles(answersDir).length === 0 && !dirFiles(path.join(formsDir, "auto")).length, JSON.stringify([dirFiles(answersDir), dirFiles(path.join(formsDir, "auto"))]))
}

// mode off: nothing, not even a marker
reset()
put()
await fa.autoTick(mkDeps({ config: () => ({ ...cfgOn, mode: { default: "owner" } }) }), T0 + 70_000, formsDir, answersDir)
await fa.autoTick(mkDeps({ config: () => ({ ...cfgOn, mode: {} }) }), T0 + 70_000, formsDir, answersDir)
cell("tick: mode owner / no key -> as before: no file, no marker", dirFiles(answersDir).length === 0 && !dirFiles(path.join(formsDir, "auto")).length, JSON.stringify([dirFiles(answersDir), dirFiles(path.join(formsDir, "auto"))]))

// the owner side: held forms are kept for the owner with the reason
reset()
put({ id: "frm_c", full: "Влить в main?", question: "Влить в main?", options: ["Да (Recommended)", "Нет"] })
put({ id: "frm_n", full: "Какой формат?", options: ["Короткий", "Длинный"] })
put({ id: "frm_d", full: "Какой формат?", nq: 2 })
await fa.autoTick(mkDeps(), T0 + 1_000, formsDir, answersDir)
const mk = (id) => core.readJson(path.join(formsDir, "auto", `${core.safeKey(id)}.json`))
cell("held: closed list -> no file, a marker with the reason and the rule", dirFiles(answersDir).length === 0 && mk("frm_c")?.state === "held" && mk("frm_c")?.reason === "closed" && !!mk("frm_c")?.rule, JSON.stringify(mk("frm_c")))
cell("held: no recommendation -> reason norec", mk("frm_n")?.state === "held" && mk("frm_n")?.reason === "norec", JSON.stringify(mk("frm_n")))
cell("held: a doubt -> reason doubt", mk("frm_d")?.state === "held" && mk("frm_d")?.reason === "doubt", JSON.stringify(mk("frm_d")))
const stats = fa.autoStats("proj", T0 + 2_000, formsDir, answersDir)
cell("stats: held by reason", stats.held.closed === 1 && stats.held.norec === 1 && stats.held.doubt === 1 && stats.heldTotal === 3 && stats.answered === 0, JSON.stringify(stats))
cell("stats: another project sees nothing", fa.autoStats("other", T0 + 2_000, formsDir, answersDir).heldTotal === 0, "")
await fa.autoTick(mkDeps(), T0 + 3_000, formsDir, answersDir)
cell("held: a repeated tick does not change the markers (still three, one each)", dirFiles(path.join(formsDir, "auto")).length === 3, JSON.stringify(dirFiles(path.join(formsDir, "auto"))))

// the limit answer_max and its reset
const rec = (id, done, extra = {}) => (mkdirSync(answersDir, { recursive: true }), writeFileSync(path.join(answersDir, `${id}.json`), JSON.stringify({ id, at: done - 100, session: S, form: id, option: "1", quote: "q", status: "applied", done, ...extra })))
reset()
for (let i = 1; i <= 3; i++) rec(`auto-old${i}`, T0 + i * 1_000, { source: "plugin" })
put({ id: "frm_lim" })
await fa.autoTick(mkDeps(), T0 + 100_000, formsDir, answersDir)
cell("limit: answer_max answers in a row -> the form goes to the owner (reason limit)", !existsSync(path.join(answersDir, "auto-frm_lim.json")) && mk("frm_lim")?.reason === "limit", JSON.stringify(mk("frm_lim")))
cell("stats: the limit is counted", fa.autoStats("proj", T0 + 100_500, formsDir, answersDir).held.limit === 1, "")
await fa.autoTick(mkDeps({ config: () => ({ ...cfgOn, max: 4 }) }), T0 + 101_000, formsDir, answersDir)
cell("limit: a bigger answer_max lets it through (the marker becomes sent)", existsSync(path.join(answersDir, "auto-frm_lim.json")) && mk("frm_lim")?.state === "sent", JSON.stringify(mk("frm_lim")))

reset()
for (let i = 1; i <= 2; i++) rec(`auto-old${i}`, T0 + i * 1_000, { source: "plugin" })
put({ id: "frm_two" })
await fa.autoTick(mkDeps(), T0 + 100_000, formsDir, answersDir)
cell("limit: two of three -> still answered", existsSync(path.join(answersDir, "auto-frm_two.json")), "")

reset()
for (let i = 1; i <= 3; i++) rec(`auto-old${i}`, T0 + i * 1_000, { source: "plugin" })
rec("owner-1", T0 + 3_500, {})
put({ id: "frm_rst" })
await fa.autoTick(mkDeps(), T0 + 100_000, formsDir, answersDir)
cell("limit reset: an answer of the owner after the series starts the count over", existsSync(path.join(answersDir, "auto-frm_rst.json")), JSON.stringify(mk("frm_rst")))

reset()
for (let i = 1; i <= 3; i++) rec(`auto-old${i}`, T0 + i * 1_000, { source: "plugin" })
put({ id: "frm_w" })
await fa.autoTick(mkDeps({ ownerWordAfter: async (_s, at) => (at >= T0 + 3_000 ? T0 + 4_000 : 0) }), T0 + 100_000, formsDir, answersDir)
cell("limit reset: the owner's word in the tab after the last automatic answer starts the count over", existsSync(path.join(answersDir, "auto-frm_w.json")), JSON.stringify(mk("frm_w")))

reset()
for (let i = 1; i <= 4; i++) rec(`auto-old${i}`, T0 + i * 1_000, { source: "plugin" })
put({ id: "frm_mid" })
// the owner spoke between the 2nd and the 3rd answer: the series is 2 (3rd and 4th) -> under the limit 3
await fa.autoTick(mkDeps({ ownerWordAfter: async (_s, at) => (at === T0 + 2_000 ? T0 + 2_500 : 0) }), T0 + 100_000, formsDir, answersDir)
cell("limit: the owner's word in the middle of the series cuts it", existsSync(path.join(answersDir, "auto-frm_mid.json")), JSON.stringify(mk("frm_mid")))

reset()
for (let i = 1; i <= 3; i++) rec(`auto-old${i}`, T0 + i * 1_000, { source: "plugin", session: "sesOTHER" })
put({ id: "frm_oth" })
await fa.autoTick(mkDeps(), T0 + 100_000, formsDir, answersDir)
cell("limit: answers of another session are not counted", existsSync(path.join(answersDir, "auto-frm_oth.json")), "")

reset()
for (let i = 1; i <= 3; i++) rec(`auto-ref${i}`, T0 + i * 1_000, { source: "plugin", status: "refused" })
put({ id: "frm_ref" })
await fa.autoTick(mkDeps(), T0 + 100_000, formsDir, answersDir)
cell("limit: refused answers are not counted", existsSync(path.join(answersDir, "auto-frm_ref.json")), "")

// a loop on the question (task 078) is a doubt
reset()
mkdirSync(path.join(formsDir, "loops"), { recursive: true })
writeFileSync(path.join(formsDir, "loops", `${core.safeKey(S)}.json`), JSON.stringify({ session: S, asks: [{ form: "x", at: 1 }], loop: { since: 1, n: 3, question: "q", forms: ["x"] } }))
put({ id: "frm_loop" })
await fa.autoTick(mkDeps(), T0 + 100_000, formsDir, answersDir)
cell("loop: a tab that loops on its question is not answered again (doubt)", !existsSync(path.join(answersDir, "auto-frm_loop.json")) && mk("frm_loop")?.reason === "doubt", JSON.stringify(mk("frm_loop")))

// marker follows the file: sent -> applied / failed
reset()
put({ id: "frm_a" })
put({ id: "frm_b" })
await fa.autoTick(mkDeps(), T0 + 61_000, formsDir, answersDir)
cell("marker: sent after the file is put", mk("frm_a")?.state === "sent" && mk("frm_b")?.state === "sent", JSON.stringify([mk("frm_a"), mk("frm_b")]))
writeFileSync(path.join(answersDir, "auto-frm_a.json"), JSON.stringify({ ...answerFile("frm_a"), status: "applied", done: T0 + 62_000 }))
writeFileSync(path.join(answersDir, "auto-frm_b.json"), JSON.stringify({ ...answerFile("frm_b"), status: "refused", why: "the turn was not interrupted: interrupted=false", done: T0 + 62_000 }))
await fa.autoTick(mkDeps(), T0 + 63_000, formsDir, answersDir)
cell("marker: applied / failed follow the answer file", mk("frm_a")?.state === "applied" && mk("frm_b")?.state === "failed", JSON.stringify([mk("frm_a"), mk("frm_b")]))
const st2 = fa.autoStats("proj", T0 + 64_000, formsDir, answersDir)
cell("stats: answered, the last closing, the failed one counted as held (fail)", st2.answered === 1 && st2.last === T0 + 62_000 && st2.held.fail === 1, JSON.stringify(st2))
cell("notes: the doctor line names the count, the last closing and the reasons", fa.autoNotes(T0 + 64_000, formsDir, answersDir).some((l) => /1/.test(l) && /автоответ/i.test(l)), JSON.stringify(fa.autoNotes(T0 + 64_000, formsDir, answersDir)))

// the owner was first: his answer file took the form before ours - not a failure, not counted
reset()
put({ id: "frm_first" })
await fa.autoTick(mkDeps(), T0 + 61_000, formsDir, answersDir)
writeFileSync(path.join(answersDir, "auto-frm_first.json"), JSON.stringify({ ...answerFile("frm_first"), status: "refused", why: "already answered (answer o9)", done: T0 + 62_000 }))
await fa.autoTick(mkDeps(), T0 + 63_000, formsDir, answersDir)
cell("marker: our answer lost to the owner (already answered) -> state owner, counted nowhere", mk("frm_first")?.state === "owner" && fa.autoStats("proj", T0 + 64_000, formsDir, answersDir).heldTotal === 0 && fa.autoStats("proj", T0 + 64_000, formsDir, answersDir).answered === 0, JSON.stringify(mk("frm_first")))

// ---- delivery: the plugin source of the answer file and the death between the changes --------------------------------
const calls = { interrupt: [], letter: [], history: [] }
const delivDeps = (over = {}) => ({
  interrupt: async (s) => (calls.interrupt.push(s), { ok: true }),
  letter: (s, text, id) => void calls.letter.push({ s, text, id }),
  history: (s, note) => void calls.history.push({ s, note }),
  say: () => {},
  ...over,
})
const clear = () => {
  calls.interrupt.length = calls.letter.length = calls.history.length = 0
}
const newAuto = async (id) => {
  reset()
  clear()
  put({ id })
  await fa.autoTick(mkDeps({ config: () => ({ ...cfgOn, delaySec: 0 }) }), T0, formsDir, answersDir)
  return path.join(answersDir, `auto-${id}.json`)
}
let file = await newAuto("frm_dl")
await oa.answerTick(delivDeps(), T0 + 1_000, answersDir, formsDir)
let done = core.readJson(file)
cell("delivery: the automatic answer is applied through the answer file (interrupt once, one letter, one history note)", done?.status === "applied" && calls.interrupt.length === 1 && calls.letter.length === 1 && calls.history.length === 1, JSON.stringify([done, calls]))
cell("delivery: the letter is a service letter 'not the owner's word' naming answer_mode and the option", /не слово владельца/.test(calls.letter[0]?.text ?? "") && /answer_mode/.test(calls.letter[0]?.text ?? "") && /Короткий/.test(calls.letter[0]?.text ?? "") && !/передан через оркестратора/.test(calls.letter[0]?.text ?? ""), calls.letter[0]?.text)
cell("delivery: the letter keeps the rule 'the owner's word is older'", /Слово владельца в диалоге старше/.test(calls.letter[0]?.text ?? "") && /только слово владельца/.test(calls.letter[0]?.text ?? ""), calls.letter[0]?.text)
cell("delivery: the history note names the source (plugin), the mode and the answer id", /answer_mode/.test(calls.history[0]?.note ?? "") && /\[answer auto-frm_dl\]/.test(calls.history[0]?.note ?? ""), calls.history[0]?.note)
cell("delivery: the form record is gone as answered", fw.pendingForms(S, T0 + 1_000, formsDir).length === 0, "")
await oa.answerTick(delivDeps(), T0 + 2_000, answersDir, formsDir)
cell("delivery: a second pass does nothing", calls.interrupt.length === 1 && calls.letter.length === 1, JSON.stringify(calls))
cell("delivery: the letter id is stable (owner-answer-<id>)", calls.letter[0]?.id === "owner-answer-auto-frm_dl", calls.letter[0]?.id)

// death 1: after the claim and the removal of the record, before the interrupt
file = await newAuto("frm_d1")
let died = false
try {
  await oa.answerTick(delivDeps({ interrupt: async () => { throw new Error("process died") } }), T0 + 1_000, answersDir, formsDir)
} catch {
  died = true
}
let mid = core.readJson(file)
cell("death before the interrupt: the file says 'applying' and keeps the form and the answer (the record is made BEFORE the interrupt)", died && mid?.status === "applying" && mid.snap?.id === "frm_d1" && !!mid.answer && fw.pendingForms(S, T0 + 1_000, formsDir).length === 0, JSON.stringify(mid))
clear()
await oa.answerTick(delivDeps(), T0 + 5_000, answersDir, formsDir)
done = core.readJson(file)
cell("death before the interrupt: the restart interrupts once, sends one letter, no loss", done?.status === "applied" && calls.interrupt.length === 1 && calls.letter.length === 1, JSON.stringify([done, calls]))

// death 2: after the interrupt, before the letter
file = await newAuto("frm_d2")
died = false
try {
  await oa.answerTick(delivDeps({ letter: () => { throw new Error("process died") } }), T0 + 1_000, answersDir, formsDir)
} catch {
  died = true
}
mid = core.readJson(file)
cell("death after the interrupt: the file keeps 'interrupted'", died && mid?.status === "applying" && !!mid.interrupted, JSON.stringify(mid))
clear()
await oa.answerTick(delivDeps(), T0 + 5_000, answersDir, formsDir)
done = core.readJson(file)
cell("death after the interrupt: the restart does NOT interrupt again, sends the letter once", done?.status === "applied" && calls.interrupt.length === 0 && calls.letter.length === 1, JSON.stringify([done, calls]))

// death 3: after the letter, before the end
file = await newAuto("frm_d3")
died = false
try {
  await oa.answerTick(delivDeps({ history: () => { throw new Error("process died") } }), T0 + 1_000, answersDir, formsDir)
} catch {
  died = true
}
mid = core.readJson(file)
clear()
await oa.answerTick(delivDeps(), T0 + 5_000, answersDir, formsDir)
done = core.readJson(file)
cell("death after the letter: the restart finishes, the same letter id (no second letter), no second interrupt", died && done?.status === "applied" && calls.interrupt.length === 0 && calls.letter.every((l) => l.id === "owner-answer-auto-frm_d3") && calls.history.length === 1, JSON.stringify([mid?.status, done?.status, calls]))

// failed interrupt: the form returns to the owner, the file is refused, the marker follows
file = await newAuto("frm_f")
await oa.answerTick(delivDeps({ interrupt: async () => ({ ok: false, why: "interrupted=false" }) }), T0 + 1_000, answersDir, formsDir)
done = core.readJson(file)
cell("failed interrupt: refused, the form stays open for the owner, no letter", done?.status === "refused" && /not interrupted/.test(done.why ?? "") && fw.pendingForms(S, T0 + 1_000, formsDir).length === 1 && calls.letter.length === 0, JSON.stringify(done))
await fa.autoTick(mkDeps({ config: () => ({ ...cfgOn, delaySec: 0 }) }), T0 + 2_000, formsDir, answersDir)
cell("failed interrupt: the tick does not answer the same form again (one try)", readdirSync(answersDir).filter((n) => n.startsWith("auto-")).length === 1 && mk("frm_f")?.state === "failed", JSON.stringify(mk("frm_f")))

// the owner's own answer file still works as before (no source)
reset()
clear()
put({ id: "frm_o" })
mkdirSync(answersDir, { recursive: true })
writeFileSync(path.join(answersDir, "o1.json"), JSON.stringify({ id: "o1", at: T0, form: "frm_o", session: S, option: "2", quote: "нет" }))
await oa.answerTick(delivDeps(), T0 + 1_000, answersDir, formsDir)
const o1 = core.readJson(path.join(answersDir, "o1.json"))
cell("owner file: applied as before, the letter is the owner's word", o1?.status === "applied" && /по слову владельца/.test(calls.letter[0]?.text ?? "") && !/answer_mode/.test(calls.letter[0]?.text ?? ""), JSON.stringify([o1, calls.letter[0]?.text]))

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-form-auto.test: FAIL ${fail}` : "crew-form-auto.test ok")
process.exit(fail ? 1 : 0)
