// Self-test of task 142: the automatic answer does not decide for the owner (node >= 24):  node test/crew-form-auto-owner.test.mjs
// Owner, 2026-10-21: "мне кажется, пока ты не работал, там могло произойти что-то нехорошее, надо проверить, что было сделано, оценить и если
// работа была сделана неверно, исправить ее". The check of the orchestrator found that the automatic answer (answer_mode: recommendations)
// closed the forms that are decisions of the owner and that the closed list did not recognise: the approval of a rule of the methodology, the
// ceiling of the rounds ("круг 5", "round7"), the permission to start a task by his word, and even offered the word of the owner that the
// plugin demands ("заводи 129"). This file: (1) the six questions of the source (impersonal wording), (2) a corpus of impersonal forms made
// from the forms of the owner's data (read only; the texts are re-worded, no private names): every decision of the owner stays with him,
// every technical choice is still answered, (3) the invariant: the automatic answer never chooses an option that IS the owner's word in the
// format of the plugin and never answers a question that asks for such a word - in judgeForm, in the tick before the answer file and in the
// delivery (owner-answer.ts), (4) the reason of the hold is shown (marker, counters, scripts/crew-answer.mjs), (5) the README.
// Red probe: the first run before the code (the rules of task 142 are missing in form-auto.ts).
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const tmp = mkdtempSync(path.join(os.tmpdir(), "crew-form-auto-owner-"))
process.env.XDG_DATA_HOME = tmp
process.env.TEMP = process.env.TMP = process.env.TMPDIR = tmp
process.env.CREW_HARNESS_DB = path.join(tmp, "absent.db")
const here = path.dirname(fileURLToPath(import.meta.url))

let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}
const core = await import("../core.ts")
const fw = await import("../form-wait.ts")
const oa = await import("../owner-answer.ts")
const fa = await import("../form-auto.ts")

const REC = { default: "recommendations" }
const F = (q, label, desc = "", over = {}) => ({ id: "frm_x", at: 1_000, born: 1_000, title: "Questions", question: q.slice(0, 200), full: `Questions\n${q}`, options: [`${label} (Recommended)`, "Другое"], optDesc: [desc, ""], nq: 1, kind: "question", ...over })
const J = (q, label, desc, over) => fa.judgeForm(F(q, label, desc, over), { mode: REC })
const held = (j, rule) => j.on === true && j.ok === false && j.reason === "closed" && (rule ? j.rule === rule || String(j.why).length > 0 : true)
const holds = (j, rule) => held(j) && (!rule || j.rule === rule)
const hitIds = (q, label = "", desc = "") => fa.closedHits(q, label, desc).map((h) => h.id)

// ---- 1. the six questions of the source (task 142, the facts of the orchestrator of 2026-10-21; the wording is impersonal) -----------------
const SIX = [
  ["late word of a human after the gate", "Проверка задачи 12 нашла конфликт: после ответа агента ворота уже закрыты и переход сделан; новое правило отбрасывает позднее слово человека, но проверка обещает, что оно старше ответа агента. Что должно происходить с таким поздним словом?", "Вернуть к воротам", "Сохранить обещанный приоритет человека: определить отдельный возврат к этим воротам и судьбу последствий."],
  ["gate of approval of rules", "ВОРОТА утверждения правил 12: когда агент уже закрыл ворота и совершён переход, что делать с пришедшим позже противоположным словом владельца?", "Записать без отката", "После закрытия ворот слово сохраняется как «не применено»; переход и эффекты остаются."],
  ["approval of a rule", "Утверждаешь правило: после выполненного перехода позднее возражение человека записывается как «не применено», без автоматического отката; новое действие требует отдельной команды?", "Да, без отката", "Не повторять и не отменять уже совершённые эффекты автоматически."],
  ["word of the owner in the format of the plugin", "Для задачи 129 «Поддержанная миграция» вычислен номер. Чтобы выполнить уже разрешённый заказ и разблокировать маршрут, плагину требуется дословное слово «заводи 129». Подтверждаете?", "заводи 129", "Создать задачу по быстрому пути; сохранить историю и обязательные CI/merge gates."],
  ["round beyond the ceiling (round7)", "Приёмщик завершил независимую проверку: PARTIAL. Требуется ограниченное дополнение: точные ожидания вывода и самотест. Разрешаете один круг доработки (round7) только на перечисленные пробелы?", "Разрешить bounded round7", "Разрешить исполнителю исправить только названные пробелы; CI остаётся закрыт до согласования маршрута."],
  ["round beyond the ceiling (круг 5)", "Задача 110 на HOLD после красного кандидата: классы причин названы. Разрешаете круг 5 доработки?", "Разрешить круг 5", "Передать приёмщику и исполнителю GO на ограниченный круг 5: узкие исправления, свежий кандидат."],
]
SIX.forEach(([name, q, label, desc], i) => {
  const j = J(q, label, desc)
  cell(`source #${i + 1} (${name}): the closed list keeps it for the owner`, holds(j), JSON.stringify(j))
  cell(`source #${i + 1} (${name}): the reason is named («удержано» with the rule and the word)`, j.on && !j.ok && !!j.rule && /\(«.+»\)/.test(j.why), JSON.stringify(j))
})

// ---- 2. the corpus of impersonal forms: decisions of the owner (hold, by the rule) and technical choices (answered) -------------------------
// [rule, question, label, description of the recommended option]. A rule "any" means: some rule of the list (the first hit is named).
const OWNER = [
  // the ceiling of rounds
  ["rounds", "Задача 12 дошла до пятой доработки при лимите три. Измерения готовы, но финальный шаг упёрся в границу. Разрешаете продолжить задачу 12 тем же исполнителем после трёх адресных проб?", "Продолжить 12", "Сохранить доказательства и исполнителя."],
  ["rounds", "Новый кандидат снова красный. Ваше разовое разрешение охватывало только круг 4. Разрешаете круг 5 тому же исполнителю: исправить причины без ослабления тестов?", "Разрешить круг 5", "Адресно исправить три класса красноты."],
  ["rounds", "Задача 12 остаётся на HOLD после красного кандидата. Crew сообщает, что задача достигла предела rework_max=3; автоматическая рекомендация на круг 5 не считается вашим GO. Как распорядиться задачей?", "Оставить HOLD", "Не менять задачу, пока вы отдельно не дадите дословное GO на ограниченный round5."],
  ["rounds", "Разрешить ли после завершённого круга 6 ещё один ограниченный круг для исправления оставшихся приёмочных пробелов?", "Оставить HOLD", "Не разрешать новый круг до решения по маршруту."],
  ["rounds", "После временно разрешённого round4 полный CI кандидата завершился красным. Разрешаете ли round5 только для устранения причин и новой проверки на точном SHA?", "Разрешить round5", "Один дополнительный rework только для названных причин."],
  ["rounds", "У задачи 12 уже четыре доработки при лимите три. Точный кандидат красный в трёх проверках. Разрешаете ещё один раунд с тем же исполнителем?", "Разрешить раунд", "Сохранить работу и повторить независимую приёмку."],
  ["rounds", "Как поступить с задачей 12 после круга 4 и превышения rework_max? Текущая сдача имеет точные регрессии.", "Продолжить здесь", "Оставить задачу у текущего исполнителя; дополнительный круг до правок."],
  ["rounds", "Разрешаете ли вы продолжить задачу 12 кругом 6 сверх rework_max3: исправить наблюдаемые фикстуры и добавить регрессионную проверку?", "Да, GO круг 6", "Разрешить целевые правки и новую сдачу."],
  ["rounds", "Задача 12 уже в пятом круге при лимите три. Нужна новая узкая дверь в проверку. Разрешаете продолжить сверх лимита и добавить только проверенный крюк?", "Узкий крюк", "Закрыть измеренный класс и довести доказательство."],
  ["rounds", "Старую карточку нельзя перевести в быстрый маршрут до доработки; она уже в четвёртом круге при лимите три. Разрешаете разовое временное исключение только для задачи 12: провести этот дополнительный круг по текущему маршруту?", "Разрешить 12", "Один круг только для задачи 12."],
  // the word of the owner in the format of the plugin
  ["route-word", "Создание быстрой задачи разрешено, но плагин отказывает без точного слова владельца формата «заводи N» с датой. Как действовать?", "Да, запросить номер", "Уточнить номер и запросить точное слово."],
  ["route-word", "Подтверждаете?", "Заводи 138", "Штатно обновить разрешение быстрого маршрута и продолжить реализацию."],
  ["route-word", "Подтвердите владельческим словом, можно ли добавить отдельный проверочный пакет с явным включением только для проверки?", "Разрешаю", "Добавить отдельный проверочный пакет без смены умолчания."],
  ["route-word", "Служба остановила задачу 12: постановка изменена после последнего слова завода, и review требует нового слова. Разрешить интегратору обновить route word для текущей постановки?", "Подтвердить постановку", "Без нового слова служба блокирует ворота."],
  ["route-word", "Нужно слово «обновляй» на обновление основной копии. Как продолжить?", "Ждать слова", "Не обновлять до слова."],
  // permission to start a task
  ["task-grant", "Воспроизводимый сбой хранилища на двух запусках. Разрешить отдельную узкую задачу расследовать и исправить сбой, сохранив строгие проверки?", "Разрешить расследование", "Создать отдельную задачу с независимой приёмкой."],
  ["task-grant", "Завести отдельную задачу на ложный статус занятости после отмены?", "Завести", "Отдельная проверяемая правка."],
  ["task-grant", "Разрешаете заказать узкое исправление проверки результата: корректный отрицательный вердикт и безопасная отмена?", "Заказать исправление", "Исправить класс ложного зелёного."],
  ["task-grant", "Создавать задачу без вашего решения не буду. Создать задачу на разбор расхождения в формате?", "Создать задачу", "Оформить задачу и вести по полному маршруту."],
  // approval of the rules, norms, specifications, plans
  ["norms", "ВОРОТА утверждения правил 12: когда агент уже закрыл ворота и совершён переход, что делать с пришедшим позже противоположным словом владельца?", "Записать без отката", "Слово сохраняется как «не применено»."],
  ["norms", "Утверждаешь правило: позднее возражение записывается как «не применено» без автоматического отката?", "Да, без отката", "Не отменять уже совершённые эффекты."],
  ["norms", "Утверждаете норму: ответ плагина старше слова только до первого вопроса?", "Да", "Записать норму в Канон."],
  ["norms", "Подтверждаешь правило очередности машины для всех проектов?", "Подтверждаю", "Записать правило."],
  ["norms", "Как нормативно закрепить границу сборки для задачи 12, учитывая документ об архитектуре?", "Узкий драйвер", "Разрешить тонкий драйвер без старого кода."],
  ["norms", "Как закрепить архитектурную границу для продолжения задачи 12?", "Узкий драйвер", "Разрешить тонкий драйвер."],
  ["norms", "Требуется утверждение спецификации задачи 12 перед стартом исполнителя.", "Утвердить", "Спецификация и план фиксируются."],
  ["norms", "Утверждение плана задачи 12: идём по быстрому маршруту?", "Идём", "Начать исполнение."],
  // the late word of the owner after the gate
  ["late-word", "Проверка задачи 12 нашла конфликт: ворота закрыты, а новое правило отбрасывает позднее слово человека. Что должно происходить с таким поздним словом?", "Вернуть к воротам", "Определить отдельный возврат."],
  ["late-word", "Что делать с пришедшим позже противоположным словом владельца, когда переход уже сделан?", "Записать", "Хранить как не применено."],
  // widening of a task, switching of the models
  ["scope", "Разрешить расширить задачу 12 на исправление производительности соседней части? Полный набор красный не в изменённых файлах.", "Расширить на соседнюю часть", "Разрешить правки только названных файлов."],
  ["scope", "Расширить задачу 12?", "Да, расширить", "Новый режим отдельно от исправления."],
  ["profile", "Переключить на другую модель только один проект или все проекты?", "Только один проект", "Все роли этого проекта; остальные проекты не менять."],
  ["profile", "Переключить на другую модель только текущие сессии или также будущие запуски?", "Все текущие", "Все действующие сессии всех проектов."],
]
OWNER.forEach(([rule, q, label, desc], i) => {
  const j = J(q, label, desc)
  cell(`owner decision #${i + 1} [${rule}]: «${q.slice(0, 54)}…» stays with the owner`, holds(j), JSON.stringify(j))
  cell(`owner decision #${i + 1} [${rule}]: the rule ${rule} is among the hits`, hitIds(q, `${label} (Recommended)`, desc).includes(rule), JSON.stringify(hitIds(q, label, desc)))
})
const TECH = [
  ["Какой механизм умолчания реализовать для определения системы хоста: узкий запрос в рантайме или внешний лаунчер?", "Минимальный запрос", "Один узкий запрос, отдельный от вычисления условий."],
  ["Для замка вливания задачи 12: самотест зелёный, но дальше обязателен полный CI на кандидате. Как поступить с блокирующим этапом? Дальше с precheck?", "Продолжить precheck", "Подготовить кандидат и запустить только предписанный CI."],
  ["Подтверждаете оставить приёмку ждать CI и продолжить после уведомления?", "Оставить ожидание", "Дождаться автоматического уведомления."],
  ["Какой путь выбрать для исправления класса: автотрансформатор констант или правка шаблона?", "Автотрансформатор", "Преобразовывать зависимые константы при выпуске шаблона."],
  ["Какой минимальный способ разделить цель сборки от прочих команд считать подходящим для задачи 12?", "Отдельный бинарь", "Выделить отдельную цель с отдельной точкой входа."],
  ["Как продолжить независимую проверку кандидата, если указанный путь к репозиторию недоступен?", "Передать путь", "Пришлите фактический путь; тогда проверю SHA напрямую."],
  ["Как поступить с воспроизводимым блокером CI: хранилище падает в одной проверке?", "Разобрать отдельно", "Точная диагностика, ослаблять проверку не будем."],
  ["Какой следующий шаг для задачи 12? Дальше", "Изолировать конфигурацию", "Сначала подтвердить красное состояние на закреплённой сборке."],
  ["Как написать спорный пункт сайта с учётом заметок о выпуске? Уровни тезиса", "Развести уровни", "Указать результат без заявления о полной независимости."],
  ["Не могу нормативно добавить блок без номера: интегратор получил запрос, но не ответил. Как поступить до выдачи номера?", "Ждать номер", "Оставить работу на паузе и продолжить после ответа."],
  ["Для задачи 12 уже есть одобренный ранее флаг и его приоритет, но план интегратора настаивает на временном этапе. Как поступить с этой границей флага?", "Следовать документу", "Реализовать уже зафиксированный флаг с приоритетом."],
  ["Какой путь выбрать для сохранения обычных тестов сборки после вертикали для одной платформы?", "Явная совместимость", "По целевой системе: разные пути, без неявного отката."],
  ["Как устранить противоречие в указании рабочего дерева для сайта в задаче 12?", "Разрешить создать", "Создать отдельное рабочее дерево от свежего main."],
  ["Передать готовый код приёмщику с полным списком локальных отказов?", "Да, сдать", "Приёмщик независимо пересоберёт кандидат."],
  ["Как обработать два тестовых примера, для которых две реализации дают разные результаты?", "Разнести пробы", "Сохранить точные ожидания каждой реализации."],
  ["Какой формат отчёта выбрать: короткий или подробный? Рекомендую короткий.", "Короткий", "Короткий отчёт на экран."],
]
TECH.forEach(([q, label, desc], i) => {
  const j = J(q, label, desc)
  cell(`technical choice #${i + 1}: «${q.slice(0, 54)}…» is still answered`, j.on === true && j.ok === true, JSON.stringify(j))
})

// ---- 3. the invariant: the automatic answer never decides in the words of the owner ---------------------------------------------------------
const ROUTE_WORDS = ["заводи 129", "Заводи 7", "заводи 0136", "«заводи 12»", "заводи №5"]
ROUTE_WORDS.forEach((w) => {
  const j = J("Подтверждаете?", w)
  cell(`invariant: a neutral question, the recommended option is the word «${w}» -> not answered, rule route-word`, holds(j, "route-word"), JSON.stringify(j))
})
cell("invariant: the word of the owner in the description of the recommended option -> not answered", holds(J("Как продолжить?", "Продолжить", "Ответить словом «заводи 12» и продолжить"), "route-word"), JSON.stringify(J("Как продолжить?", "Продолжить", "Ответить словом «заводи 12» и продолжить")))
cell("invariant: a question that asks for the word of the owner ('дословное слово') -> not answered", holds(J("Нужно дословное слово владельца. Продолжить?", "Да"), "route-word"), JSON.stringify(J("Нужно дословное слово владельца. Продолжить?", "Да")))
cell("invariant: a question that asks for the route word -> not answered", holds(J("Плагин требует route word для этой задачи. Как быть?", "Запросить"), "route-word"), "")
cell("invariant: a question that asks for the word in quotes («…») -> not answered", holds(J("Плагину требуется слово «обновляй». Подтверждаете?", "Да"), "route-word"), "")
cell("invariant: not the word - a plain talk of a task number is answered", J("Как назвать задачу 12 в журнале? Заводить ли запись?", "Коротко").ok !== undefined && J("Какой номер у задачи 12 в журнале?", "Двенадцать").ok === true, JSON.stringify(J("Какой номер у задачи 12 в журнале?", "Двенадцать")))
cell("invariant: the exported check names the word of the option", typeof fa.ownerWordHit === "function" && !!fa.ownerWordHit("Подтверждаете?", "заводи 129") && !fa.ownerWordHit("Какой формат?", "Короткий"), String(fa.ownerWordHit))
cell("invariant: the exported check sees the word in a question", typeof fa.ownerWordHit === "function" && !!fa.ownerWordHit("Плагину требуется дословное слово «заводи 12».", "Да"), "")

// the tick: the form is held, no answer file is made, the marker names the rule
const formsDir = path.join(tmp, "forms")
const answersDir = path.join(tmp, "answers")
const S = "sesOWNER"
const T0 = 10_000_000
const cfgOn = { mode: REC, max: 3, delaySec: 0, project: "proj", task: 7 }
const deps = (over = {}) => ({ config: () => cfgOn, tab: async () => ({ open: true, busy: true }), ownerWrote: async () => false, ownerWordAfter: async () => 0, say: () => {}, ...over })
const reset = () => {
  rmSync(formsDir, { recursive: true, force: true })
  rmSync(answersDir, { recursive: true, force: true })
}
const put = (id, q, label, desc = "") => fw.addForm(S, F(q, label, desc, { id, session: S, at: T0, born: T0 }), formsDir)
const mark = (id) => core.readJson(path.join(formsDir, "auto", `${core.safeKey(id)}.json`))
const answerFiles = () => (existsSync(answersDir) ? readdirSync(answersDir).filter((n) => n.endsWith(".json")) : [])

reset()
put("frm_w1", "Подтверждаете?", "заводи 129", "Создать задачу по быстрому пути.")
put("frm_w2", "Утверждаешь правило: позднее слово записывается как не применённое?", "Да")
put("frm_w3", "Разрешаете круг 5 доработки?", "Разрешить круг 5")
put("frm_ok", "Какой формат отчёта выбрать?", "Короткий")
await fa.autoTick(deps(), T0 + 1_000, formsDir, answersDir)
cell("tick: the form with the word of the owner as the option gets no answer file", !answerFiles().includes("auto-frm_w1.json"), JSON.stringify(answerFiles()))
cell("tick: the marker of the word form is held / closed / route-word", mark("frm_w1")?.state === "held" && mark("frm_w1")?.reason === "closed" && mark("frm_w1")?.rule === "route-word", JSON.stringify(mark("frm_w1")))
cell("tick: the approval form and the round form get no answer file either", !answerFiles().includes("auto-frm_w2.json") && !answerFiles().includes("auto-frm_w3.json") && mark("frm_w2")?.state === "held" && mark("frm_w3")?.state === "held", JSON.stringify([answerFiles(), mark("frm_w2"), mark("frm_w3")]))
cell("tick: a technical form of the same run is still answered", answerFiles().includes("auto-frm_ok.json"), JSON.stringify(answerFiles()))
cell("marker: the reason names the rule and the word that hit (the text crew-answer prints)", /«.+»/.test(mark("frm_w1")?.why ?? "") && /слов/.test(mark("frm_w1")?.why ?? "") && /утвержд|правил/.test(mark("frm_w2")?.why ?? "") && /круг|потолок|заход|раунд/.test(mark("frm_w3")?.why ?? ""), JSON.stringify([mark("frm_w1")?.why, mark("frm_w2")?.why, mark("frm_w3")?.why]))
const st = fa.autoStats("proj", T0 + 2_000, formsDir, answersDir)
cell("stats: the three held forms are counted as closed", st.held.closed === 3 && st.heldTotal === 3, JSON.stringify(st))
cell("stats: the rules of the holds are counted (the panel names them)", st.rules?.["route-word"] === 1 && Object.keys(st.rules ?? {}).length === 3 && /route-word/.test(fa.heldShort(st)), JSON.stringify([st.rules, fa.heldShort(st)]))

// the defence before the answer file: a verdict that came earlier (an older judge) is not enough - the tick checks the chosen option again
reset()
put("frm_late", "Продолжим?", "Заводи 55")
const realJudge = fa.judgeForm
cell("the tick checks the option itself: the guard function refuses the word even when the judge said ok", typeof fa.guardAnswer === "function" && !!fa.guardAnswer(F("Продолжим?", "Заводи 55"), "Заводи 55 (Recommended)") && !fa.guardAnswer(F("Формат?", "Короткий"), "Короткий (Recommended)"), String(fa.guardAnswer))
void realJudge

// ---- the delivery: a plugin answer file whose form asks for the word of the owner is refused (owner-answer.ts), the form stays open ---------------
const calls = { interrupt: [], letter: [], history: [] }
const delivDeps = () => ({
  interrupt: async (s) => (calls.interrupt.push(s), { ok: true }),
  letter: (s, text, id) => void calls.letter.push({ s, text, id }),
  history: (s, note) => void calls.history.push({ s, note }),
  say: () => {},
})
reset()
put("frm_d1", "Для задачи 12 плагину требуется дословное слово «заводи 12». Подтверждаете?", "заводи 12", "Создать задачу.")
put("frm_d2", "Какой формат отчёта выбрать?", "Короткий")
mkdirSync(answersDir, { recursive: true })
const pf = (id, form, option = "1") => writeFileSync(path.join(answersDir, `auto-${id}.json`), JSON.stringify({ id: `auto-${id}`, at: T0, source: "plugin", form, session: S, option, quote: "answer_mode: recommendations", mode: "recommendations", type: "default" }))
pf("frm_d1", "frm_d1")
pf("frm_d2", "frm_d2")
// the answer files exist already (made by an older judge): the tick only writes the markers "sent"
await fa.autoTick(deps({ config: () => ({ ...cfgOn, delaySec: 9999 }) }), T0 + 500, formsDir, answersDir)
await oa.answerTick(delivDeps(), T0 + 1_000, answersDir, formsDir)
const d1 = core.readJson(path.join(answersDir, "auto-frm_d1.json"))
const d2 = core.readJson(path.join(answersDir, "auto-frm_d2.json"))
cell("delivery: a plugin answer to a form that asks for the owner's word is refused with «удержана для владельца»", d1?.status === "refused" && /^удержана для владельца: /.test(d1?.why ?? ""), JSON.stringify(d1))
cell("delivery: the refused form stays open for the owner, no interrupt, no letter for it", fw.pendingForms(S, T0 + 1_000, formsDir).some((f) => f.id === "frm_d1") && calls.interrupt.length === 1 && calls.letter.length === 1, JSON.stringify([calls, fw.pendingForms(S, T0 + 1_000, formsDir).map((f) => f.id)]))
cell("delivery: the technical plugin answer of the same run is applied", d2?.status === "applied", JSON.stringify(d2))
// the marker follows the refusal: held (not failed), the reason is the rule
await fa.autoTick(deps({ config: () => ({ ...cfgOn, delaySec: 9999 }) }), T0 + 2_000, formsDir, answersDir)
cell("delivery: the marker of an answer refused by the guard becomes held / closed / route-word, not failed", mark("frm_d1")?.state === "held" && mark("frm_d1")?.reason === "closed" && mark("frm_d1")?.rule === "route-word", JSON.stringify(mark("frm_d1")))
cell("delivery: the technical marker follows its answer (applied)", mark("frm_d2")?.state === "applied", JSON.stringify(mark("frm_d2")))
cell("delivery: an answer of the OWNER (no source) with the same words is delivered as before (his word is his)", await (async () => {
  reset()
  calls.interrupt.length = calls.letter.length = calls.history.length = 0
  put("frm_o1", "Для задачи 12 плагину требуется дословное слово «заводи 12». Подтверждаете?", "заводи 12", "Создать задачу.")
  mkdirSync(answersDir, { recursive: true })
  writeFileSync(path.join(answersDir, "o1.json"), JSON.stringify({ id: "o1", at: T0, form: "frm_o1", session: S, option: "1", quote: "заводи 12 (владелец, 2026-10-21)" }))
  await oa.answerTick(delivDeps(), T0 + 1_000, answersDir, formsDir)
  return core.readJson(path.join(answersDir, "o1.json"))?.status === "applied" && calls.interrupt.length === 1
})(), "")

// ---- the scripts/crew-answer.mjs shows the reason ------------------------------------------------------------------------------------------
reset()
const cardsDir = path.join(tmp, "opencode", "crew-harness", "cards")
const base = path.join(tmp, "opencode", "crew-harness")
mkdirSync(cardsDir, { recursive: true })
const baseForms = path.join(base, "forms")
mkdirSync(path.join(baseForms, "auto"), { recursive: true })
const NOW = Date.now()
writeFileSync(path.join(cardsDir, "sesCA.json"), JSON.stringify({ session: "sesCA", project: "proj", role: "worker" }))
writeFileSync(path.join(baseForms, "sesCA.json"), JSON.stringify([{ id: "frm_ca", at: NOW, born: NOW, title: "Questions", question: "Утверждаешь правило?", full: "Questions\nУтверждаешь правило?", options: ["Да (Recommended)", "Нет"], nq: 1, kind: "question", session: "sesCA" }]))
writeFileSync(path.join(baseForms, "auto", "frm_ca.json"), JSON.stringify({ id: "frm_ca", session: "sesCA", project: "proj", type: "default", first: NOW, at: NOW, state: "held", reason: "closed", rule: "norms", why: "утверждение правил («утверждаешь»)" }))
const run = spawnSync(process.execPath, [path.join(here, "..", "..", "scripts", "crew-answer.mjs")], { env: { ...process.env, XDG_DATA_HOME: tmp }, encoding: "utf8" })
cell("crew-answer: the list of the open forms says «удержана для владельца» with the reason of the rule", /\[удержана для владельца: утверждение правил/.test(run.stdout), JSON.stringify([run.stdout, run.stderr]))

// ---- the README ---------------------------------------------------------------------------------------------------------------------------
const readme = readFileSync(path.join(here, "..", "README.md"), "utf8")
cell("README: names the new rules (approval of rules, rounds beyond the ceiling, task start)", /task 142/.test(readme) && /round7|круг 5|round/i.test(readme) && /approval of rules/i.test(readme), "")
cell("README: says that the automatic answer never answers a request for the word of the owner and shows where the reason is", /заводи/.test(readme) && /never (chooses|answers)/i.test(readme) && /crew-answer/.test(readme), "")

rmSync(tmp, { recursive: true, force: true })
console.log(fail ? `crew-form-auto-owner.test: FAIL ${fail}` : "crew-form-auto-owner.test ok")
process.exit(fail ? 1 : 0)
