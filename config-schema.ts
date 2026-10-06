// СХЕМА НАСТРОЕК ПРОЕКТА (план 002, Ф.6). Одна на всё: опросник peer_config guide (вопрос, варианты, рекомендация,
// зачем), проверка peer_config set (значение не той формы — отказ, файл не тронут), показ peer_config show. Тест
// сверяет, что опросник покрывает все ключи схемы, а loadConfig (core.ts) читает те же ключи.

export type Kind =
  | { type: "enum"; options: string[] }
  | { type: "int" }
  | { type: "string"; allowEmpty?: boolean }
  | { type: "subset"; options: string[] }
  | { type: "roles" }
  | { type: "intMap" }
  | { type: "modelMap" }
  | { type: "tierLists" }
  | { type: "acceptance" }
  | { type: "strings" }
  | { type: "stringMap"; keys: string[] }
  | { type: "grades" }
export type Setting = { key: string; kind: Kind; default: any; question: string; why: string; recommend?: string; group: string }

const TIERS = ["heavy", "medium", "light"]
export const SCHEMA: Setting[] = [
  { key: "project", group: "Проект", kind: { type: "string" }, default: "(имя папки настроек)", question: "Как называется проект (адрес вкладок «проект.роль»)?", why: "строчные латинские буквы, цифры, дефис", recommend: "короткое имя, например nova" },
  { key: "root", group: "Проект", kind: { type: "string" }, default: ".", question: "Где корень проекта — относительно папки настроек?", why: "вкладки под корнем относятся к проекту; «..» — папка выше (виртуальный проект из многих репозиториев)", recommend: ".. для папки со многими репозиториями, . для одного репозитория" },
  { key: "branch", group: "Проект", kind: { type: "string" }, default: "(ветка по умолчанию)", question: "Из какой ветки читать этот файл настроек?", why: "читается закоммиченное; другая ветка — только если настройки живут не в main", recommend: "не задавать" },
  { key: "exclusive_roles", group: "Роли", kind: { type: "roles" }, default: ["integrator"], question: "Какие роли, кроме integrator, должны быть исключительными (один держатель)?", why: "исключительную роль держит одна вкладка; остальные роли разделяемые", recommend: "никаких" },
  { key: "inbound", group: "Роли", kind: { type: "enum", options: ["integrator", "any", "none"] }, default: "integrator", question: "Кому из других проектов можно писать в этот проект?", why: "integrator — только интегратору (работа — заказом), any — всем, none — никому", recommend: "integrator" },
  { key: "task_fields", group: "Задачи", kind: { type: "subset", options: ["goal", "criteria", "boundaries", "open_questions"] }, default: ["goal", "criteria"], question: "Какие поля задачи обязательны?", why: "без них задача не ставится; работа не начинается без критериев приёмки", recommend: "goal, criteria, boundaries, open_questions" },
  { key: "spawn_limits", group: "Задачи", kind: { type: "intMap" }, default: { worker: 3, reviewer: 2 }, question: "Сколько задач может работать одновременно на роль (и сколько сессий приёмки — reviewer; при reviewer: acceptor — ключ acceptor, без него reviewer)?", why: "лимит на одного интегратора; P0 проходит мимо; сессии приёмки места worker не занимают", recommend: "worker 3, reviewer 2 (acceptor 2 при reviewer: acceptor)" },
  { key: "inflight_limit", group: "Задачи", kind: { type: "int" }, default: 6, question: "Сколько задач может быть открыто сразу (в работе + сданных + на приёмке)?", why: "держит очередь приёмки обозримой; P0 проходит мимо", recommend: "6" },
  { key: "spawn_models", group: "Задачи", kind: { type: "modelMap" }, default: { heavy: "claude-code/opus", medium: "claude-code/sonnet", light: "claude-code/haiku" }, question: "Какая модель у ступеней heavy / medium / light?", why: "модель сессии задачи по её весу; машинно-зависимое лучше задать в опции плагина local", recommend: "по умолчанию" },
  { key: "tiers", group: "Задачи", kind: { type: "tierLists" }, default: { heavy: ["opus"], medium: ["sonnet"], light: ["haiku"] }, question: "Какие модели относятся к ступеням (подстроки имени)?", why: "по ним письмо с tier выбирает свободную вкладку", recommend: "по умолчанию" },
  { key: "default_priority", group: "Задачи", kind: { type: "enum", options: ["P0", "P1", "P2", "P3"] }, default: "P2", question: "Какой приоритет у задачи, если его не назвали?", why: "P0 авария, P1 первая очередь, P2 обычная работа, P3 когда освободятся руки", recommend: "P2" },
  { key: "push_empty_turns", group: "Подталкивание", kind: { type: "int" }, default: 3, question: "Сколько пустых ходов подряд (без инструментов) считать застреванием?", why: "дальше напоминаний нет, интегратору вызов", recommend: "3" },
  { key: "stall_minutes", group: "Подталкивание", kind: { type: "int" }, default: 30, question: "Через сколько минут затянувшееся (замок вливания держат, сданная задача ждёт приёмщика) поднимать интегратору (0 — не поднимать)?", why: "приёмка может упереться в запрет и стоять часами, пока кто-то не заметит", recommend: "30" },
  { key: "accepted_reminder_min", group: "Подталкивание", kind: { type: "int" }, default: 30, question: "Через сколько минут напоминать о принятой, но не очищенной задаче (0 — не напоминать)?", why: "принятая задача до очистки занимает место в inflight_limit; задача #9 nova провисела так 11,5 ч, и запуск срочной задачи получил отказ", recommend: "30" },
  { key: "machine_slots", group: "Подталкивание", kind: { type: "int" }, default: 1, question: "Сколько тяжёлых команд (гейт, сборка, прогон тестов через peer_watch {machine: true}) проекта может идти одновременно (0 — без предела)?", why: "гейты нескольких воркеров и приёмщиков разом с CI перегружают машину владельца", recommend: "1 на обычной машине; 2 — если ядер и памяти много" },
  { key: "owner_reminder_min", group: "Подталкивание", kind: { type: "int" }, default: 15, question: "Через сколько минут повторять владельцу «вкладка ждёт вашего ответа», если он не ответил (0 — не повторять)?", why: "вопрос в окне, прокрученном вверх, не виден; без повтора он висит часами", recommend: "15" },
  { key: "push_max", group: "Подталкивание", kind: { type: "int" }, default: 20, question: "Сколько всего напоминаний на задачу до вызова интегратора?", why: "предохранитель от бесконечных напоминаний", recommend: "20" },
  { key: "reviewer", group: "Приёмка", kind: { type: "enum", options: ["worker", "integrator", "acceptor"] }, default: "worker", question: "Кто принимает сданные задачи?", why: "worker — другой воркер (не автор), интегратор свободен; acceptor — отдельная роль приёмщика: в приёмщики идёт только вкладка роли acceptor или новая сессия с этой ролью, вливание (merge), принятие и очистку делает только она или интегратор; integrator — сам интегратор", recommend: "acceptor, если в проекте права приёмщика должны отличаться от прав воркера; иначе worker" },
  { key: "plans_dir", group: "Планы", kind: { type: "string" }, default: "docs/plans", question: "Где в репозитории лежат планы (папка от корня репозитория папки настроек)?", why: "задача-план пишет файл плана туда; после согласования плагин читает из него шаги", recommend: "docs/plans" },
  { key: "plan_name", group: "Планы", kind: { type: "string" }, default: "{n}-{slug}.md", question: "Как называть файл плана ({n} — номер, {slug} — латиницей из названия)?", why: "номер выдаёт плагин; подплан — {n} вида 12.1", recommend: "{n}-{slug}.md" },
  { key: "plan_rounds_max", group: "Планы", kind: { type: "int" }, default: 4, question: "Сколько раундов перепроверки плана, прежде чем спросить владельца?", why: "раунды идут, пока два подряд не дадут только косметические замечания; бесконечно — нельзя", recommend: "4" },
  { key: "plan_clean_rounds", group: "Планы", kind: { type: "int" }, default: 2, question: "Сколько раундов подряд только с косметическими замечаниями — и план готов к согласованию?", why: "один чистый раунд — случайность, два подряд — устойчивость", recommend: "2" },
  { key: "plan_sections", group: "Планы", kind: { type: "stringMap", keys: ["why", "existing", "mode", "phases", "out", "questions", "decisions"] }, default: { why: "Зачем", existing: "Что уже есть", mode: "Режим выполнения", phases: "Фазы", out: "Не делаем", questions: "Открытые вопросы", decisions: "Решения владельца" }, question: "Как называются разделы плана (по ролям)?", why: "плагин находит по ним фазы, границы шагов, вопросы и ответ владельца о режиме; обязательны все, кроме decisions (и mode, если вопрос о режиме выключен)", recommend: "как в проекте; умолчание — форма nova" },
  { key: "plan_header", group: "Планы", kind: { type: "strings" }, default: ["Статус", "Источник", "Зависимости"], question: "Какие поля обязательны в шапке плана («**Поле:**»)?", why: "форма проверяется при сдаче плана", recommend: "Статус, Источник, Зависимости" },
  { key: "plan_prefix", group: "Планы", kind: { type: "string" }, default: "Ф", question: "Как обозначаются фазы и шаги (префикс: «Ф» → «### Ф.1», «#### Ф.1.2»)?", why: "по префиксу плагин находит фазы и шаги и ставит по ним задачи", recommend: "Ф" },
  { key: "plan_labels", group: "Планы", kind: { type: "stringMap", keys: ["what", "criteria", "mode"] }, default: { what: "Что", criteria: "Приёмка", mode: "Без упрощений" }, question: "Какие метки у шага (что сделать, приёмка) и у вопроса о режиме?", why: "«Что:» — цель задачи-шага, «**Приёмка:**» — её критерии; метка режима — строка ответа владельца", recommend: "Что, Приёмка, Без упрощений" },
  { key: "plan_marks", group: "Планы", kind: { type: "stringMap", keys: ["plan_open", "plan_work", "plan_closed", "plan_cancelled", "step_work", "step_done", "criterion_open", "criterion_done", "question_open", "question_answered"] }, default: { plan_open: "🔴 ОТКРЫТ", plan_work: "🟡 В РАБОТЕ", plan_closed: "✅ ЗАКРЫТ", plan_cancelled: "❌ ОТМЕНЁН", step_work: "⏳ В РАБОТЕ", step_done: "✅ СДЕЛАНО", criterion_open: "⬜", criterion_done: "✅ ВЫПОЛНЕНО", question_open: "❔", question_answered: "✅" }, question: "Какие отметки (значок и слово) у плана, шага, критерия и вопроса?", why: "приёмка шага требует отметку step_done в целевой ветке; открытые вопросы — по question_open", recommend: "значок и слово, как в умолчании" },
  { key: "plan_mode_question", group: "Планы", kind: { type: "enum", options: ["on", "off"] }, default: "on", question: "Спрашивать ли владельца о режиме выполнения («Без упрощений: ДА/НЕТ»)?", why: "on: раздел обязателен, ответ владельца проверяется при вливании плана; off: вопроса нет", recommend: "on" },
  { key: "plan_acceptance", group: "Планы", kind: { type: "acceptance" }, default: "(шаги А/Б плана 012)", question: "Какие шаги у перепроверки плана (id, текст, обязателен ли)?", why: "проверяющий раунда отмечает каждый (check); без отметки всех обязательных вердикт раунда не принимается", recommend: "умолчание: А — против исходной задачи, Б — правильность составления" },
  { key: "plan_merge_acceptance", group: "Планы", kind: { type: "acceptance" }, default: "(approval-written, form)", question: "Какие шаги у вливания согласованного плана?", why: "приёмщик вливания отмечает их перед accept", recommend: "умолчание" },
  { key: "plan_grades", group: "Планы", kind: { type: "grades" }, default: "(блокирующее, существенное, косметическое)", question: "Какие градации замечаний перепроверки и какие из них не мешают «чистому» раунду (clean)?", why: "раунд чистый, когда нет замечаний градаций с clean: false; план готов после plan_clean_rounds чистых подряд", recommend: "три градации умолчания" },
  { key: "plan_approver", group: "Планы", kind: { type: "enum", options: ["owner", "integrator"] }, default: "owner", question: "Кто согласует план — владелец (/plans в окне) или интегратор (peer_task plan_decide)?", why: "owner: решение пишет окно владельца, агент его не подделает; integrator: быстрее, владелец видит планы в /peers", recommend: "owner" },
  { key: "plan_steps", group: "Планы", kind: { type: "enum", options: ["auto", "manual"] }, default: "auto", question: "Ставить ли задачи по шагам влитого плана автоматически?", why: "auto: плагин ставит шаги по зависимостям, «где» и лимитам; manual: автору — список шагов, задачи ставит он сам", recommend: "auto" },
  { key: "plan_template", group: "Планы", kind: { type: "string", allowEmpty: true }, default: "", question: "Свой шаблон плана — путь к файлу от корня репозитория (пусто — встроенный)?", why: "шаблон идёт в письмо исполнителю задачи-плана; {n}, {title}, {source} подставляются", recommend: "пусто" },
  { key: "heavy_commands", group: "Подталкивание", kind: { type: "strings" }, default: [], question: "Какие команды — тяжёлые прогоны (подстроки: полный гейт, сборка, прогон тестов, бенчмарки)?", why: "peer_watch с такой командой сам встаёт в очередь машины (machine_slots); команда не из списка тяжёлая, если занимает все ядра или идёт дольше 2 мин", recommend: "скрипты гейта и полной сборки проекта" },
  { key: "acceptance", group: "Приёмка", kind: { type: "acceptance" }, default: [], question: "Какие шаги приёмки (id, текст, обязателен ли)?", why: "accept не проходит без отчёта по каждому обязательному шагу; текст ссылается на методологию проекта", recommend: "шаги из методологии проекта" },
  { key: "target_branch", group: "Приёмка", kind: { type: "string" }, default: "main", question: "В какую ветку вливать?", why: "плагин проверяет, что ветка задачи или squash-коммит в ней", recommend: "main" },
  { key: "rework_max", group: "Приёмка", kind: { type: "int" }, default: 3, question: "Сколько кругов доработки до вызова интегратора?", why: "много возвратов — задача поставлена неясно", recommend: "3" },
  { key: "cleanup", group: "Приёмка", kind: { type: "enum", options: ["none", "local", "local+remote"] }, default: "local+remote", question: "Что удалять после вливания?", why: "local — worktree и локальную ветку, local+remote — ещё ветку на origin", recommend: "local+remote" },
  { key: "worktrees", group: "Worktree", kind: { type: "string", allowEmpty: true }, default: "", question: "В какой папке (от корня проекта) создавать worktree задач?", why: "пусто — решает методология проекта; задано — письмо с задачей называет точный путь", recommend: "worktrees" },
  { key: "worktree_name", group: "Worktree", kind: { type: "string" }, default: "{repo}-{n}-{slug}", question: "Как называть папку worktree?", why: "{repo} репозиторий, {n} номер задачи, {slug} название латиницей, {project}", recommend: "{repo}-{n}-{slug}" },
  { key: "branch_name", group: "Worktree", kind: { type: "string" }, default: "t{n}-{slug}", question: "Как называть ветку задачи?", why: "те же подстановки", recommend: "t{n}-{slug} или как принято в проекте" },
  { key: "help_extra", group: "Прочее", kind: { type: "string", allowEmpty: true }, default: "", question: "Какой абзац проекта дописывать к peer_help?", why: "правила проекта для вкладок: контрольный вопрос, где методология", recommend: "коротко, со ссылкой на правила" },
]
export const SCHEMA_KEYS = SCHEMA.map((s) => s.key)

const ROLE_RE = /^[a-z][a-z0-9-]{0,40}$/
const isObj = (v: any) => !!v && typeof v === "object" && !Array.isArray(v)
const isInt = (v: any) => Number.isInteger(v) && v >= 0

/** Проверить значение ключа; вернуть текст ошибки или undefined. */
export function invalid(key: string, v: any): string | undefined {
  const s = SCHEMA.find((x) => x.key === key)
  if (!s) return `неизвестный ключ «${key}»; ключи: ${SCHEMA_KEYS.join(", ")}`
  const k = s.kind
  switch (k.type) {
    case "enum":
      return k.options.includes(v) ? undefined : `${key}: одно из ${k.options.join(" / ")}`
    case "int":
      return isInt(v) ? undefined : `${key}: целое число ≥ 0`
    case "string":
      return typeof v === "string" && (k.allowEmpty || v.trim()) ? (key === "project" && !/^[a-z0-9][a-z0-9-]{0,40}$/.test(v) ? `${key}: строчные латинские буквы, цифры, дефис` : undefined) : `${key}: строка${k.allowEmpty ? "" : ", не пустая"}`
    case "subset":
      return Array.isArray(v) && v.every((x) => k.options.includes(x)) ? undefined : `${key}: список из ${k.options.join(", ")}`
    case "roles":
      return Array.isArray(v) && v.every((x) => typeof x === "string" && ROLE_RE.test(x)) ? undefined : `${key}: список ролей (строчные латинские, цифры, дефис)`
    case "intMap":
      return isObj(v) && Object.entries(v).every(([r, n]) => (r === "*" || ROLE_RE.test(r)) && isInt(n)) ? undefined : `${key}: {"роль": число}`
    case "modelMap":
      return isObj(v) && Object.entries(v).every(([t, m]) => TIERS.includes(t) && typeof m === "string" && /^[^/\s]+\/\S+$/.test(m)) ? undefined : `${key}: {"heavy"|"medium"|"light": "провайдер/модель"}`
    case "tierLists":
      return isObj(v) && Object.entries(v).every(([t, l]) => TIERS.includes(t) && Array.isArray(l) && l.every((x) => typeof x === "string" && x)) ? undefined : `${key}: {"heavy"|"medium"|"light": ["подстрока", ...]}`
    case "stringMap":
      return isObj(v) && Object.entries(v).every(([k, x]) => (s.kind as any).keys.includes(k) && typeof x === "string" && x.trim()) ? undefined : `${key}: {${(s.kind as any).keys.map((k: string) => `"${k}"`).join(", ")}: "строка"} (любые из ключей)`
    case "grades":
      return Array.isArray(v) && v.length > 0 && v.every((g) => isObj(g) && typeof g.id === "string" && /^[a-z][a-z0-9_-]*$/.test(g.id) && typeof g.name === "string" && g.name.trim() && typeof g.text === "string" && typeof g.clean === "boolean") && new Set(v.map((g: any) => g.id)).size === v.length && v.some((g: any) => !g.clean)
        ? undefined
        : `${key}: список {"id": "латиницей", "name": "название", "text": "что значит", "clean": true|false}, id без повторов, хотя бы одна градация с clean: false`
    case "strings":
      return Array.isArray(v) && v.every((x) => typeof x === "string" && x.trim()) ? undefined : `${key}: список строк`
    case "acceptance":
      return Array.isArray(v) && v.every((a) => isObj(a) && typeof a.id === "string" && /^[a-z0-9][a-z0-9_-]*$/.test(a.id) && typeof a.text === "string" && a.text.trim() && (a.required === undefined || typeof a.required === "boolean")) && new Set(v.map((a: any) => a.id)).size === v.length
        ? undefined
        : `${key}: список {"id": "латиницей", "text": "что проверить", "required": true|false}, id без повторов`
  }
}

const show = (v: any) => (typeof v === "string" ? v || "(пусто)" : JSON.stringify(v))

/** Опросник: вопросы по всем ключам, с действующими значениями. */
export function guideText(current: Record<string, any>, sourceOf: (key: string) => string): string {
  const out: string[] = [
    "ОПРОСНИК НАСТРОЕК ПРОЕКТА. Задай владельцу вопросы текстом (у вкладок claude-code нет инструмента вопросов): по группе за раз, варианты — номерами, «оставить как есть» — всегда вариант. Ответы запиши: peer_config {action: \"set\", values: {...}} — потом закоммить файл (действует с коммита).",
  ]
  let group = ""
  for (const s of SCHEMA) {
    if (s.group !== group) {
      group = s.group
      out.push(`\n${group.toUpperCase()}`)
    }
    const opts = s.kind.type === "enum" || s.kind.type === "subset" ? ` Варианты: ${s.kind.options.map((o, i) => `${i + 1}) ${o}`).join("  ")}.` : ""
    out.push(`- ${s.key}: ${s.question} Сейчас: ${show(current[s.key] ?? s.default)} (${sourceOf(s.key)}).${opts} Рекомендация: ${s.recommend ?? show(s.default)}. Зачем: ${s.why}.`)
  }
  return out.join("\n")
}
