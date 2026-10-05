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
export type Setting = { key: string; kind: Kind; default: any; question: string; why: string; recommend?: string; group: string }

const TIERS = ["heavy", "medium", "light"]
export const SCHEMA: Setting[] = [
  { key: "project", group: "Проект", kind: { type: "string" }, default: "(имя папки настроек)", question: "Как называется проект (адрес вкладок «проект.роль»)?", why: "строчные латинские буквы, цифры, дефис", recommend: "короткое имя, например nova" },
  { key: "root", group: "Проект", kind: { type: "string" }, default: ".", question: "Где корень проекта — относительно папки настроек?", why: "вкладки под корнем относятся к проекту; «..» — папка выше (виртуальный проект из многих репозиториев)", recommend: ".. для папки со многими репозиториями, . для одного репозитория" },
  { key: "branch", group: "Проект", kind: { type: "string" }, default: "(ветка по умолчанию)", question: "Из какой ветки читать этот файл настроек?", why: "читается закоммиченное; другая ветка — только если настройки живут не в main", recommend: "не задавать" },
  { key: "exclusive_roles", group: "Роли", kind: { type: "roles" }, default: ["integrator"], question: "Какие роли, кроме integrator, должны быть исключительными (один держатель)?", why: "исключительную роль держит одна вкладка; остальные роли разделяемые", recommend: "никаких" },
  { key: "inbound", group: "Роли", kind: { type: "enum", options: ["integrator", "any", "none"] }, default: "integrator", question: "Кому из других проектов можно писать в этот проект?", why: "integrator — только интегратору (работа — заказом), any — всем, none — никому", recommend: "integrator" },
  { key: "task_fields", group: "Задачи", kind: { type: "subset", options: ["goal", "criteria", "boundaries", "open_questions"] }, default: ["goal", "criteria"], question: "Какие поля задачи обязательны?", why: "без них задача не ставится; работа не начинается без критериев приёмки", recommend: "goal, criteria, boundaries, open_questions" },
  { key: "spawn_limits", group: "Задачи", kind: { type: "intMap" }, default: { worker: 3, reviewer: 2 }, question: "Сколько задач может работать одновременно на роль (и сколько сессий приёмки — reviewer)?", why: "лимит на одного интегратора; P0 проходит мимо", recommend: "worker 3, reviewer 2" },
  { key: "inflight_limit", group: "Задачи", kind: { type: "int" }, default: 6, question: "Сколько задач может быть открыто сразу (в работе + сданных + на приёмке)?", why: "держит очередь приёмки обозримой; P0 проходит мимо", recommend: "6" },
  { key: "spawn_models", group: "Задачи", kind: { type: "modelMap" }, default: { heavy: "claude-code/opus", medium: "claude-code/sonnet", light: "claude-code/haiku" }, question: "Какая модель у ступеней heavy / medium / light?", why: "модель сессии задачи по её весу; машинно-зависимое лучше задать в опции плагина local", recommend: "по умолчанию" },
  { key: "tiers", group: "Задачи", kind: { type: "tierLists" }, default: { heavy: ["opus"], medium: ["sonnet"], light: ["haiku"] }, question: "Какие модели относятся к ступеням (подстроки имени)?", why: "по ним письмо с tier выбирает свободную вкладку", recommend: "по умолчанию" },
  { key: "default_priority", group: "Задачи", kind: { type: "enum", options: ["P0", "P1", "P2", "P3"] }, default: "P2", question: "Какой приоритет у задачи, если его не назвали?", why: "P0 авария, P1 первая очередь, P2 обычная работа, P3 когда освободятся руки", recommend: "P2" },
  { key: "push_empty_turns", group: "Подталкивание", kind: { type: "int" }, default: 3, question: "Сколько пустых ходов подряд (без инструментов) считать застреванием?", why: "дальше напоминаний нет, интегратору вызов", recommend: "3" },
  { key: "owner_reminder_min", group: "Подталкивание", kind: { type: "int" }, default: 15, question: "Через сколько минут повторять владельцу «вкладка ждёт вашего ответа», если он не ответил (0 — не повторять)?", why: "вопрос в окне, прокрученном вверх, не виден; без повтора он висит часами", recommend: "15" },
  { key: "push_max", group: "Подталкивание", kind: { type: "int" }, default: 20, question: "Сколько всего напоминаний на задачу до вызова интегратора?", why: "предохранитель от бесконечных напоминаний", recommend: "20" },
  { key: "reviewer", group: "Приёмка", kind: { type: "enum", options: ["worker", "integrator"] }, default: "worker", question: "Кто принимает сданные задачи?", why: "worker — другой воркер (не автор), интегратор свободен; integrator — сам интегратор", recommend: "worker" },
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
