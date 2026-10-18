// THE PLUGIN ANSWERS THE FORMS OF THE BUILT-IN QUESTIONNAIRE BY THE RECOMMENDATION (task 096, ADR-0010 supplement of 2026-10-19).
// Owner, 2026-10-19: "answer_mode: recommendations only works for text questions of one kind - I was sure these were automatic answers to
// the questionnaires" and "why did a tab slow the process for a day, how to remove such delays without me". Until now the plugin never
// answered a form (the record in forms/ waits for the owner, task 040/059); the orchestrator put the answer by hand on the owner's word
// ("по рекомендации"), dozens of times a day. Now a form is closed by the plugin itself when ALL of this holds at once:
//   (a) the settings of the project (with the `local` block) give the mode `recommendations` for the type of the question: the type of a
//       form is `default`, or the `Тип:` of its text (answer_mode of task 007);
//   (b) exactly ONE option is marked "(Recommended)" and it is the FIRST (no mark, two marks, the mark elsewhere - the owner, no guessing);
//   (c) the question does not PROPOSE an action of the CLOSED LIST and neither does the recommended option (CLOSED_LIST below: stays with the
//       owner whatever the mode; a gate word in the description of the situation closes nothing - task 097);
//   (d) the limit answer_max of automatic answers in a row for the session is not spent (the owner's answer or word resets the count);
//   (e) the form is open: not replaced, not stale, not cancelled, not in the repeat of a lost question (task 040/071/073);
//   and the form is at least answer_delay_sec old (the owner can answer first; his answer and his word in the tab win).
// Any doubt (a parse failure, an unknown type, not one question in the form, a multiple choice, a loop of task 078) - to the owner.
// Delivery is the answer file of task 059 (owner-answer.ts) with the source "plugin": the record in answers/ is made BEFORE the turn is
// interrupted and every step after it is repeatable, so a death of the process between the changes gives neither a repeat nor a loss
// (rules 13/34(e) of the methodology). The plugin never writes the keys answer_*: they are read only.
// Store: answers/auto-<form>.json (the answer, one per form - the name is the "once" mark) and forms/auto/<form>.json (the marker: held for
// the owner with the reason, or sent/applied/failed) - the counters of /crew and the doctor come from the markers.
import { existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { loopOf } from "./answer-loop.ts"
import { ANSWER_TYPES, type AnswerMap, modeFor, normalizeGateText } from "./answer-parse.ts"
import { readJson, safeKey } from "./core.ts"
import { FORMS, type PendingForm, waitingForms } from "./form-wait.ts"
import { BASE } from "./paths.ts"

const ANSWERS_DIR = path.join(BASE, "answers")
const DAY_MS = 24 * 3_600_000
const MARK_KEEP_MS = 3 * DAY_MS

// ---------------------------------------------------------------------------------------------------------------------
// THE CLOSED LIST (task 097). What stays with the owner at ANY mode: a question that PROPOSES an action of the list, or whose RECOMMENDED
// option itself contains such an action. A word of the list in the description of the situation ("red on main", "found at the handover",
// the name of a guard with the word gate) closes nothing: the owner, 2026-10-19: "не задавайте и не тормозите" - he waits only for the
// closed list (tag, release, deletion, push to main, widening of the rights). The first version (task 096) looked for the words anywhere in
// the text and sent about 70 % of the questions to the owner, two thirds of them for a word of the description (measure of 2026-10-18).
// A table, not logic: a rule is added by a line (id, why, patterns `act`, examples `yes` and `no`); every rule and every example has a
// cell in test/crew-form-auto.test.mjs (`yes` must close by this rule, `no` must not).
// The pattern (ClosedAct), the text is split into sentences and words (normalizeGateText of answer-parse.ts: lower case, no punctuation):
//   v  verbs in a form that PROPOSES (infinitive, imperative, "we"): "запушить", "пушим", "approve". A noun ("удаление"), a participle
//      ("утверждённый") and a past form ("слит") are not listed: they describe, they do not propose.
//   o  objects. With `v`: the verb and an object within `w` words (6) of one sentence; without `o` the verb alone closes ("утвердить").
//      The label and the description of the recommended option take the object from the question too ("Принять" - "результат приёмки").
//      With `n`: the noun and an object within `w` words (and a word of `p` when `p` is given).
//   n  nominal actions ("push", "слияние", "релиз"): close after a word of proposal `p` (PROPOSE: "разрешить", "нужен", "сделать", "git" ...)
//      within 4 words, or alone in a heading / label of up to 4 words or in a short question of up to 6.
//   An occurrence right after "не" / "без" ("не пушить", "без push") is skipped (`neg: false` keeps it). `after: true`: the object stands after the verb. `pv`: past forms that count only after "чтобы" / "если" / before "ли". `lone: true`: the verb alone in a label of up to 3 words closes (the object is not named).
// Notation of a term: "word" - the whole word (lower case, "ё" as "е"); "stem*" - a word that starts with the stem; "stem(a|b|)" - the stem
// with one of the endings, the whole word (an empty ending is allowed); words separated by a space are neighbouring words.
// The vocabulary is open and errs toward the owner: a false hit costs one question to the owner, a miss is a defect of safety.
export type ClosedAct = { v?: string[]; n?: string[]; o?: string[]; p?: string[]; w?: number; short?: false; neg?: false; after?: true; lone?: true; pv?: string[] }
export type ClosedRule = { id: string; why: string; act: ClosedAct[]; yes: string[]; no: string[] }

/** Words of proposal before / after a nominal action ("Разрешить push", "Нужен релиз", "Сделать уборку", "git push"). */
const PROPOSE = [
  "разреш(ить|ите|аем|аю|аете|им|ай|айте)", "можно", "нужн(о|а|ы|ый|ое|ой)", "нужен", "надо", "давай", "давайте", "рекомендую", "рекомендуем", "рекомендуется", "предлагаю", "предлагаем",
  "подтверд(ить|ите|им|ждаете|ждаем)", "выполн(ить|им|яем|яйте|и)", "сдела(ть|ем|й|йте)", "делать", "делаем", "провести", "проведем", "проводить", "проводим", "готовить", "готовим", "подготовить", "подготовим",
  "начать", "начнем", "приступить", "приступим", "запустить", "запустим", "запускаем", "запускать", "хотите", "требуется", "необходим(о|а|ы|ый)", "git", "to", "need", "needs", "should", "must", "let", "run", "do", "make", "allow", "approve",
]

export const CLOSED_LIST: ClosedRule[] = [
  {
    id: "gates",
    why: "ворота методики",
    act: [
      { v: ["пройти", "пройдем", "пройдите", "проходить", "проходим", "открыть", "откроем", "открой", "открываем", "снять", "снимем", "снимите", "снимать", "снимаем", "пропустить", "пропустим", "пропустите", "пропускать", "пропускаем", "обойти", "обойдем", "обойдите", "обходить", "обходим", "отменить", "отменим"], o: ["ворот*", "gate", "gates"], w: 4 },
      { n: ["ворот*", "gate", "gates"], p: ["это", "нужн(о|а|ы|ый|ое|ой)", "нужен", "надо", "требуется", "является"], short: false },
    ],
    yes: ["Пройти ворота приёмки без слова владельца?", "Снять gate перед следующим шагом?", "Это ворота методики?", "Нужен gate перед следующим шагом?", "Обойти ворота и продолжить?"],
    no: ["Прогнать gate-tool локально?", "Хук требует зелёный вердикт gate-tool на вливаемый хеш.", "Простой межпроцессный gate не проверен.", "Остановка на воротах без вопроса закрыта."],
  },
  {
    id: "approval",
    why: "утверждение спецификации или плана",
    act: [
      { v: ["утверд(ить|им|ите|и)", "утвержда(ем|ю|ете|ть)", "одобр(ить|им|ите|и)", "одобря(ем|ю|ть)", "approve", "approving"], pv: ["утвердил", "утвердила", "утвердили", "одобрил", "одобрила", "одобрили"] },
      {
        v: ["согласовать", "согласуем", "согласуйте", "согласуй", "согласую", "согласовываем", "согласовывать"],
        o: ["спецификац*", "требован*", "план", "плана", "плану", "планом", "плане", "планы", "планов", "plan", "spec", "specification", "requirements", "adr", "scope", "дизайн*", "архитектур*", "объем*"],
        w: 5,
      },
      {
        v: ["подтвердить", "подтвердим", "подтвердите", "подтверждаем", "подтверждаю"],
        o: ["спецификац*", "требован*", "план", "плана", "плану", "планом", "плане", "планы", "планов", "plan", "spec", "specification", "requirements", "adr", "scope", "дизайн*", "архитектур*", "объем*"],
        w: 5,
        after: true,
      },
      { n: ["утверждени(е|я|ю|ем|и)", "одобрени(е|я|ю|ем)", "approval"] },
    ],
    yes: ["Утвердить спецификацию задачи?", "Approve the plan of the task?", "Согласовать spec.md с владельцем?", "Исправить AC-05 и утвердить требования?", "Нужно утверждение плана?"],
    no: ["Спецификация утверждена вчера, план одобрен.", "После утверждённого плана реестр обновили.", "Для шага требуется согласованная очередь машины.", "Подтвердите, закрыта ли старая вкладка?", "Для запуска по упрощённому плану подтвердите, закрыта ли старая вкладка?"],
  },
  {
    id: "accept",
    why: "решение по результату и сдаче",
    act: [
      {
        v: ["принять", "примем", "примите", "прими", "принима(ем|ю|ете|ть)", "приму", "accept", "accepting"],
        o: ["результат*", "работ(а|у|ы|е|ой)", "сдач(а|у|и|е|ей)", "задач(а|у|и|е|ей)", "приемк(а|у|и|е|ой)", "этап*", "итог*", "поставк*", "кандидат*", "пакет*", "pr", "ревью", "review", "изменени(е|я|й|ями|ю)", "коммит*", "патч*", "документ*", "заход*", "ветк*", "реализац*", "result", "work", "task", "delivery", "handover", "submission", "changes", "patch", "branch"],
        w: 6,
        lone: true,
        pv: ["принял", "приняла", "приняли"],
      },
      { v: ["сдать", "сдадим", "сдаем", "сдавать", "сдайте"], o: ["задач(а|у|и|е)", "работ(а|у|ы)", "результат*", "этап*", "приемк(а|у|и)"], w: 4 },
      { v: ["закр(ыть|оем|ойте|ываем|ывать|ой)", "завершить", "завершим", "завершите", "завершаем"], o: ["задач(а|у|и|е)", "этап(|а|у|ы)", "эпик*", "issue", "pr", "приемк(а|у|и)"], w: 3 },
      { n: ["сдач(а|у|и|е|ей)", "acceptance"] },
    ],
    yes: ["Принять результат задачи?", "Готовить сдачу сейчас?", "Рекомендую принять документальный результат с оговорками.", "Закрыть задачу как выполненную?", "Сдать работу на приёмку?", "Что делаем с результатом приёмки? => Принять (Recommended)"],
    no: ["Приёмка встала на сборке кандидата.", "Результат принят, замечаний нет.", "Найден при сдаче задачи, дефект открыт.", "Принять решение о формате отчёта?", "Закрыть вкладку после ответа?"],
  },
  {
    id: "push",
    why: "пуш в main или на сервер",
    act: [
      { v: ["запуш(ить|им|ь|ьте|у)", "пуш(ить|им|ь|ьте|у|ну|нуть)"], pv: ["запушил", "запушила", "запушили", "пушил", "отправил", "отправила"] },
      { v: ["откат(ить|им|ывать)", "revert", "rollback"], o: ["main", "master", "origin", "remote", "upstream", "прод*", "production", "релиз*"], w: 4 },
      { v: ["push", "pushing"], o: ["main", "master", "origin", "remote", "upstream", "github", "branch", "ветк*", "сервер*"], w: 4 },
      { v: ["отправ(ить|им|ь|ьте|ляем|лять)", "выложи(ть|м|те)", "закин(уть|ем)"], o: ["origin", "remote", "upstream", "github", "main", "master", "сервер*", "удаленн(ый|ом|ого|ую)"], w: 6 },
      { n: ["push", "пуш", "пуша", "пушу", "пуше", "пушем", "пуши"] },
    ],
    yes: ["Запушить ветку в origin?", "Выполнить git push сейчас?", "Отправить изменения в main?", "Разрешить push только ветки кандидата?", "Пуш в main?", "Пушим?", "Хотите, чтобы я запушил ветку?", "Что делаем с веткой? => Запушить в origin (Recommended)"],
    no: ["Кандидат от свежего main полностью зелёный локально.", "Красный на main: страж пришёл коммитом без адреса плана.", "После push CI красный, причина в тесте.", "Приёмка подтвердила на исходном main отдельный дефект.", "Исполнитель уже запушил ветку, CI зелёный."],
  },
  {
    id: "merge",
    why: "слияние",
    act: [
      {
        v: [
          "слить", "слей", "слейте", "сольем", "сливаем", "сливать", "сливаю", "влить", "влей", "вольем", "вливаем", "вливать", "вливаю", "залить", "залей", "зальем", "заливаем", "заливать",
          "мержить", "смержить", "смержим", "мержим", "мержи", "смержи", "мерджить", "смерджить", "ребейзить", "ребейзим", "сквошить",
          "слью", "влью", "залью", "смержу", "мержу",
        ],
        pv: ["слил", "слила", "слили", "влил", "влила", "влили", "залил", "залила", "залили", "смержил", "смержила", "смержили"],
      },
      { v: ["merge", "merging", "rebase", "squash"], o: ["branch", "ветк*", "pr", "pull", "main", "master", "origin", "into", "commit", "commits", "коммит*", "candidate", "кандидат*", "request", "onto"], w: 4 },
      { v: ["объедин(ить|им|ите|яем|ять)"], o: ["ветк*", "pr", "коммит*", "изменени(е|я|й)", "репозитор*"], w: 4 },
      { n: ["merge", "мерж", "мержа", "мержу", "мерже", "слияни(е|я|ю|ем|и)", "вливани(е|я|ю|ем|и)", "rebase", "squash", "ребейз", "ребейза", "ребейзу"] },
    ],
    yes: ["Влить ветку в основную?", "Сделать merge после проверки?", "Слить через squash?", "Вливать в main?", "Нужно, чтобы я влил ветку в основную?", "Merge the branch into main?", "Разрешить слияние ветки задачи?"],
    no: ["Слияние несёт новый файл, хук требует свежий вердикт.", "Merge/precheck пока не запускались.", "Хеш вливаемый, ветка слитая вчера.", "Я слил ветку вчера, хеш записан.", "Отмена заказа дочернюю задачу не останавливает."],
  },
  {
    id: "delete",
    why: "удаление и уборка",
    act: [
      {
        v: [
          "удал(ить|им|ите|и|ю|ять|яем|яй|яйте)", "убра(ть)", "убер(у|ем|ите|и)", "убира(ем|ть|ю)", "стере(ть)", "сотр(у|ем|и)", "стира(ем|ть)", "снес(ти|у|ем|и)", "снос(им|ить)", "очист(ить|им|и)", "очищу", "очища(ем|ть)", "почист(ить|им)", "чист(ить|им)",
          "выброс(ить|им|ьте)", "выбрас(ывать|ываем)", "уничтож(ить|им|аем|ь)", "затере(ть)", "затр(ем)", "сброс(ить|им|ьте)", "сброшу", "сбрас(ывать|ываем)", "перезапис(ать)", "перезапиш(ем|ите)",
          "delete", "deleting", "remove", "removing", "rm", "rmdir", "unlink", "wipe", "purge", "drop", "prune",
        ],
        o: [
          "ветк*", "дерев(о|а|у|ом|е|ья|ьев|ьям)", "папк*", "файл*", "каталог*", "директори*", "репозитор*", "репо", "клон*", "worktree", "branch", "branches", "folder", "folders", "file", "files", "tree", "dir", "directory", "repo", "clone",
          "tag", "tags", "тег*", "журнал*", "архив*", "сесси(я|ю|и|й)", "вкладк*", "копи(я|ю|и|й)", "кэш*", "кеш*", "артефакт*", "коммит*", "commit", "commits", "изменени(е|я|й|ями)", "данные", "запис(ь|и|ей|ям)", "базу", "базы",
        ],
        w: 6,
        lone: true,
        pv: ["удалил", "удалила", "удалили", "убрал", "убрала", "убрали", "стер", "стерла", "стерли", "снес", "снесла", "снесли", "очистил", "очистила", "очистили", "сбросил", "сбросила", "сбросили"],
      },
      { v: ["reset"], o: ["hard", "жестк*"], w: 2 },
      { v: ["git rm", "git clean", "worktree remove", "worktree prune", "branch d", "branch delete"] },
      { n: ["удалени(е|я|ю|ем|и)", "уборк(а|у|и|е|ой)", "cleanup", "очистк(а|у|и|е|ой)"] },
    ],
    yes: ["Удалить ветку и рабочее дерево?", "Сделать уборку после приёмки?", "Delete the old folder?", "Убрать старые файлы?", "Хотите, чтобы я удалил ветку?", "Выполнить git reset --hard?", "Что делаем с веткой? => Удалить (Recommended)"],
    no: ["После удаления регистрации старая задача осталась в другом проекте.", "Удалённая ветка уже не мешает.", "Файл удалён вчера, очистка кэша завершена.", "Я удалил ветку вчера, дерево чистое.", "Дерево чистое, ветки слиты."],
  },
  {
    id: "restart",
    why: "перезапуск службы",
    act: [
      {
        v: ["перезапуст(ить|им|ите|и)", "перезапуск(ать|аем|аю)", "перезагруз(ить|им|ите|и)", "перезагруж(аем|ать)", "рестарт(нуть|нем|уем|овать)", "перезапущу", "перезагружу", "restart", "reboot"],
        o: ["служб*", "сервис*", "service", "opencode", "плагин*", "plugin", "демон*", "daemon", "сервер*", "окн*", "процесс*", "машин*", "компьютер*", "систем*"],
        w: 5,
        lone: true,
        pv: ["перезапустил", "перезапустила", "перезапустили", "перезагрузил", "перезагрузила", "перезагрузили"],
      },
      {
        v: ["останов(ить|им|ите|и)", "выключ(ить|им|ите|и)", "отключ(ить|им|ите|и)", "переключ(ить|им|ите|и)", "переключа(ть|ем)", "stop", "switch"],
        o: ["служб*", "сервис*", "service", "opencode", "демон*", "daemon"],
        w: 4,
        lone: true,
      },
      { n: ["перезапуск(|а|у|ом|е)", "перезагрузк(а|у|и|е|ой)", "рестарт(|а|у|ом|е)", "restart", "reboot"] },
    ],
    yes: ["Перезапустить службу OpenCode?", "Нужен restart сервиса?", "Остановить службу и переключить окна?", "Нужен перезапуск?"],
    no: ["Служба перезапущена владельцем, плагин подгружен.", "После перезапуска проверим журнал плагина.", "Служба живая, ответы приходят.", "Остановка по порогу сетки, замеры записаны."],
  },
  {
    id: "live",
    why: "живая проверка",
    act: [
      {
        v: [
          "провер(ить|им|ь|ьте|ять|яем)", "прогнать", "прогоним", "прогоните", "прогон(ять|яем)", "выполн(ить|им|ите|яем)", "провест(и|ем)", "провод(ить|им)", "сдела(ть|ем)", "запуст(ить|им|ите)", "запуска(ть|ем)", "править",
          "поправ(ить|им)", "мен(ять|яем)", "измен(ить|им|ите|яем)", "обнов(ить|им|ите|ляем|лять)", "трога(ть|ем)", "затрон(уть|ем)", "тест(ировать|ируем)",
        ],
        o: ["жив*", "live", "боев*", "продакш*", "prod", "production", "основн* копи*", "рабоч* копи* main", "копи* main"],
        w: 4,
      },
      { n: ["проверк(а|у|и|е|ой)", "прогон(|а|у|ом|е)"], o: ["жив*", "live", "боев*", "продакш*", "prod", "production"], w: 2 },
    ],
    yes: ["Сделать живую проверку на рабочей системе?", "Проверить на живой службе?", "Нужна живая проверка?", "Править живую систему напрямую?", "Обновить основную копию main?"],
    no: ["Правка файлов в рабочем дереве, не в основной копии.", "Служба живая, ответы приходят.", "Проверить тесты и сборку локально?", "Плагин остаётся живым после обновления."],
  },
  {
    id: "release",
    why: "tag, выпуск, публикация, asset, pin",
    act: [
      {
        v: [
          "выпуст(ить|им|ите|и)", "выпущу", "выпуска(ть|ем|ю)", "опубликова(ть)", "опубликую", "опубликуем", "опубликуйте", "публиковать", "публикуем", "публикую", "задеплои(ть|м)", "деплои(ть|м)", "деплой", "выкат(ить|им|ите)", "выкатыва(ть|ем)", "раскат(ить|им)",
          "раскатыва(ть|ем)", "publish", "publishing", "deploy", "deploying",
        ],
        pv: ["выпустил", "выпустила", "выпустили", "опубликовал", "опубликовала", "опубликовали", "задеплоил", "задеплоила", "задеплоили", "выкатил", "выкатила", "выкатили"],
      },
      { v: ["release", "releasing", "ship", "tag", "tagging"], o: ["version", "versions", "релиз*", "tag", "tags", "тег*", "package", "packages", "пакет*", "artifact", "artifacts", "артефакт*", "npm", "semver", "build", "commit"], w: 3 },
      { v: ["постав(ить|им|ь|ьте)", "ставить", "создад(им|ите)", "создать", "создай", "повесить", "навесить", "выставить", "отметить", "пометить"], o: ["tag", "tags", "тег*", "тэг*"], w: 3 },
      { v: ["загруз(ить|им|ите|и)", "загруж(аем|ать)", "вылож(ить|им|ите)", "прикреп(ить|им|ите)", "прилож(ить|им|ите)", "добав(ить|им|ьте)", "залить", "залей"], o: ["asset", "assets", "ассет*"], w: 4 },
      { v: ["закреп(ить|им|ите|и|ляем|лять)", "pin", "pinning"], o: ["артефакт*", "панел*", "pin", "боков*", "artifact", "версию", "версия"], w: 4 },
      { n: ["pin"], p: [...PROPOSE, "обнов(ить|им)", "сменить", "сменим", "поменять", "передвинуть", "сдвинуть"] },
      { n: ["релиз", "релиза", "релизу", "релизом", "релизе", "release", "выпуск", "выпуска", "выпуску", "выпуском", "выпуске", "публикаци(я|и|ю|ей)", "tag", "tags", "тег", "тега"] },
    ],
    yes: ["Поставить tag 0.3.0?", "Выпустить релиз?", "Опубликовать пакет?", "Загрузить asset в артефакт?", "Закрепить артефакт (pin) в боковой панели?", "Нужен релиз 0.2.1?", "Задеплоить на сервер?", "Publish the package?", "Что с версией? => Выпустить 0.2.1 (Recommended)"],
    no: ["Guards публикации красные на старых выдержках и форматах.", "Разделить выпускную работу и исправление плагина?", "Релиз 0.2.1 готовится по быстрому пути, ждём proof.", "Канон и pin не изменены, оригиналы сохранены.", "Тег уже стоит на коммите."],
  },
  {
    id: "force",
    why: "force",
    act: [{ v: ["force", "forced", "принудительн*"] }],
    yes: ["Применить force к ветке?", "Сделать force push?", "Принудительно перезаписать ветку?"],
    no: ["Enforce the style rules in CI.", "Без force, обычным push.", "Форс-мажор не ожидается."],
  },
  {
    id: "secret",
    why: "пароль, ключ, токен, учётные данные",
    act: [
      { v: ["парол*", "password*", "passwd", "credential*", "учетн* данн*"] },
      {
        v: [
          "выда(ть|ем|йте|вать)", "выдад(им|ите)", "введ(ем|ите|и)", "ввест(и)", "записа(ть)", "запиш(ем|ите|и)", "сохрани(ть|м|те)", "передат(ь)", "передад(им|ите)", "дать", "дадим", "дайте", "раскрыть", "раскроем", "показать", "покажем",
          "создать", "создадим", "сгенерир(овать|уем|уйте)", "сменить", "сменим", "поменять", "поменяем", "использова(ть)", "используем", "положи(ть|м|те)", "внес(ти|ем)", "пропис(ать|ем)", "добав(ить|им|ьте)", "хран(ить|им)", "отправ(ить|им|ьте)",
          "скопир(овать|уем)", "встав(ить|им)", "задат(ь)", "зададим", "подстав(ить|им)", "ротир(овать|уем)", "перевыпуст(ить|им)", "write", "store", "use", "set", "put", "commit", "share", "paste", "send", "print", "echo", "expose", "rotate",
          "reveal", "enter", "give", "provide", "show", "add", "create", "generate", "save",
        ],
        o: ["токен", "токены", "токена", "токену", "токеном", "токене", "token", "секрет*", "secret*", "api key", "apikey", "ssh key", "gpg key", "private key", "секретн* ключ", "приватн* ключ", "закрыт* ключ", "ключ(|и|а|у|ом|ей) доступа", "ключ(|и|а|у|ом|ей) api", "api ключ(|и|а|у|ом|ей)", "ssh ключ(|и|а|у|ом|ей)", "gpg ключ(|и|а|у|ом|ей)"],
        w: 5,
      },
    ],
    yes: ["Использовать пароль из файла?", "Записать токен в настройки?", "Выдать новый API key?", "Сохранить ключ доступа в репозитории?", "Хранить credentials в .env?"],
    no: ["Лимит токенов на сегодня исчерпан.", "Проверить ключи в таблице реестра и сравнить хеши.", "Ключ кэша зависит от хеша файла.", "Потратить токены на повторный прогон?"],
  },
  {
    id: "money",
    why: "оплата и деньги",
    act: [
      { v: ["оплат(ить|им|ите|и)", "заплат(ить|им|ите|и)", "купи(ть|м|те)", "покуп(ать|аем)", "платить", "плат(им|ите)"] },
      {
        v: ["потрат(ить|им|ите|и)", "трат(ить|им)", "пополн(ить|им|ите|и)", "продл(ить|им|ите|и)", "оформ(ить|им|ите|и)", "подпис(аться|емся)", "подписыва(ться|емся)", "перевест(и|ем)", "перевод(им|ить)", "списа(ть)", "списыва(ть|ем)", "взять", "возьмем"],
        o: ["деньг(и|а|ам|ами|ах)", "подписк*", "тариф*", "счет", "счета", "счету", "баланс*", "usd", "eur", "доллар*", "евро", "руб", "рубль", "рублей", "платн(ый|ую|ого|ом|ые|ых)", "кредит*", "credits", "credit", "billing", "payment", "subscription"],
        w: 5,
      },
      { n: ["оплат(а|у|ы|е|ой)", "платеж*", "покупк(а|у|и|е|ой)"] },
    ],
    yes: ["Оплатить подписку?", "Потратить деньги на квоту?", "Купить платный тариф?", "Продлить подписку на сервис?"],
    no: ["Подписка на уведомления отключена в окне.", "Пятичасовая квота модели исчерпана.", "Цена платного тарифа выросла."],
  },
  {
    id: "owner-word",
    why: "слово владельца",
    act: [
      {
        n: ["слов(о|а|у|ом|е)"],
        o: ["владел(ец|ьца|ьцу|ьцем|ьце)"],
        w: 2,
        p: [
          "нужн(о|а|ы|ый|ое|ой)", "нужен", "надо", "требуется", "требует", "требуют", "жд(ем|ете|ать)", "ждет", "получ(ить|им)", "дожд(емся|аться)", "без", "вместо", "обойти", "обойдем", "заменить", "заменим", "подменить", "считать",
          "засчитать", "спросить", "спросим", "узнать", "подтверд(ить|им|ите)",
        ],
        neg: false,
      },
    ],
    yes: ["Это решение требует слова владельца?", "Продолжить без слова владельца?", "Нужно слово владельца на этот шаг?"],
    no: ["Решение принято по слову владельца, запись в журнале.", "Слово владельца записано в разборе задачи."],
  },
  {
    id: "answer-keys",
    why: "изменение ключей answer_*",
    act: [{ v: ["answer mode", "answer max", "answer delay", "автоответ*"] }],
    yes: ["Поменять answer_mode проекта?", "Увеличить answer_max до 10?", "Выставить answer_delay_sec в ноль?", "Включить автоответ для типа plan?"],
    no: ["Ответ на вопрос принят, answer the question briefly.", "Ответ владельца записан в журнал и применён."],
  },
  {
    id: "config",
    why: "файлы настроек проекта и пользователя",
    act: [
      {
        v: [
          "прав(ить)", "править", "поправ(ить|им)", "измен(ить|им|ите|яем)", "мен(ять|яем)", "поменя(ть|ем)", "редактир(овать|уем)", "отредактир(овать|уем)", "записа(ть)", "запиш(ем|ите)", "постав(ить|им|ьте)", "выстав(ить|им|ьте)", "обнов(ить|им)", "добав(ить|им|ьте)", "включ(ить|им|ите)",
          "выключ(ить|им|ите)",
        ],
        o: ["crew harness json", "opencode jsonc", "opencode json", "настройк* проект*", "crew config"],
        w: 6,
      },
    ],
    yes: ["Поправить .opencode/crew-harness.json?", "Изменить глобальный opencode.jsonc?", "Записать профиль в настройки проекта?"],
    no: ["Файл crew-harness.json прочитан, ключей project_settings нет.", "Настройки проекта подгружены при старте."],
  },
  {
    id: "boundaries",
    why: "снятие запретов и границ задачи",
    act: [
      {
        v: [
          "расшир(ить|им|ите|яем|ять)", "снять", "снимем", "снимите", "снимать", "снимаем", "отменить", "отменим", "обойти", "обойдем", "обойдите", "обходить", "обходим", "нарушить", "нарушим", "игнорир(овать|уем)", "отключить", "отключим", "пропустить",
          "пропустим", "пропускать", "пропускаем", "ослабить", "ослабим", "bypass", "bypassing", "override", "skip", "disable",
        ],
        o: [
          "границ*", "рамк(и|ах|ам|ами)", "запрет*", "ограничени(е|я|й|ю|ям)", "scope", "объем*", "правил(о|а|у|ом|ам|ах|е)", "хук", "хуки", "хуков", "hook", "hooks", "страж*", "guard*", "проверк(а|у|и|е|ой)", "verify", "тест(ы|ов|ам|ах)", "lint", "линт*", "ci",
        ],
        w: 4,
      },
      { v: ["разреш(ить|ите|аем|аю|аете|им)"], o: ["вне"], w: 8 },
      { v: ["выйти", "выйдем", "выходить", "выходим", "выходи"], o: ["границ*", "рамк(и|ами|ах)", "предел(ы|ов|ами)"], w: 3 },
      { v: ["no verify"] },
    ],
    yes: ["Разрешить правку вне границ задачи?", "Расширить объём задачи на соседний модуль?", "Снять запрет на правку чужого репозитория?", "Обойти хук и запушить без проверки?", "Выйти за рамки задачи?", "Коммит с --no-verify?"],
    no: ["Запрещено править живую систему, поэтому работаем в рабочем дереве.", "Проверка границ задачи пройдена.", "Правка осталась в границах задачи.", "Разрешить Phase 1 сразу?"],
  },
  {
    id: "waive",
    why: "отказ от требования",
    act: [
      {
        v: ["отказа(ться|емся)", "отказыва(ться|емся)", "снять", "снимем", "убрать", "уберем", "исключить", "исключим", "ослабить", "ослабим", "отменить", "отменим", "пропустить", "пропустим", "смягчить", "смягчим", "урезать", "урежем"],
        o: ["требовани(е|я|ю|ем|й|ям|ями)", "критери(й|я|ю|ем|и|ев|ям)", "ac"],
        w: 4,
      },
    ],
    yes: ["Отказаться от требования про журнал?", "Снять критерий приёмки про время?", "Исключить требование из задачи?"],
    no: ["Требование выполнено полностью, критерий закрыт.", "Отказ сервера по таймауту, повторим запрос."],
  },
  {
    id: "ceiling",
    why: "потолок заходов и раундов",
    act: [
      {
        v: ["добав(ить|им|ьте)", "увелич(ить|им|ьте)", "повыс(ить|им)", "поднять", "поднимем", "поднимите", "превыс(ить|им)", "продл(ить|им)", "разреш(ить|ите|аем|аю|аете|им)"],
        o: ["заход*", "раунд*", "потолок", "потолк(а|у|ом|е)", "ceiling", "лимит*", "предел*"],
        w: 4,
      },
      { v: ["сверх"], o: ["лимит*", "потолок", "потолк(а|у|ом|е)", "ceiling", "предел*", "норм*", "заход*", "раунд*"], w: 3 },
    ],
    yes: ["Добавить ещё один раунд сверх потолка?", "Разрешить одну проверку сверх прежнего лимита?", "Поднять потолок заходов до пяти?"],
    no: ["До потолка остался один заход.", "Заход 3 из 6 завершён, отчёта нет.", "Пятичасовая квота исчерпана."],
  },
  {
    id: "rights",
    why: "расширение прав и доступа",
    act: [
      {
        v: [
          "выда(ть|ем|йте|вать)", "выдад(им|ите)", "дать", "дадим", "дайте", "предостав(ить|им|ьте)", "расшир(ить|им|ите|яем|ять)", "назнач(ить|им)", "повыс(ить|им)", "добав(ить|им|ьте)", "включ(ить|им)", "разреш(ить|им|ите)", "grant", "give", "allow", "add", "expand",
          "extend",
        ],
        o: ["прав(а|ам|ами|ах|о)", "полномочи(я|й|ям|ями)", "привилеги(и|й|ям|ями)", "доступ", "доступа", "доступу", "доступом", "доступе", "permission", "permissions", "sudo", "admin", "admins", "админ*", "root", "rights", "access"],
        w: 4,
      },
    ],
    yes: ["Расширить права исполнителя на соседний проект?", "Выдать агенту доступ к чужому репозиторию?", "Дать sudo?"],
    no: ["У процесса ограниченные права в песочнице.", "Права на файл проверены, доступ закрыт."],
  },
  {
    id: "environments",
    why: "общие среды",
    act: [
      {
        v: [
          "мен(ять|яем|им)", "измен(ить|им|ите|яем)", "править", "поправ(ить|им)", "обнов(ить|им|ите|ляем)", "установ(ить|им|ите)", "настро(ить|им|ите)", "перенастро(ить|им)", "трога(ть|ем)", "затрон(уть|ем)", "поставить", "поставим", "удал(ить|им)", "install",
          "change", "modify", "update",
        ],
        o: ["общ* сред(а|у|ы|е|ой|ах|ам|ами)", "общ* окружени*", "shared environment", "shared env", "shared environments"],
        w: 3,
      },
    ],
    yes: ["Менять общую среду разработки?", "Установить пакет в общую среду?", "Изменить shared environment?"],
    no: ["Среда запуска тестов — локальная, правок не требуется.", "Общая среда ждёт обновления модели."],
  },
]

// ----- the engine: sentences, words, terms. Pure, no files. -----
type Sub = (word: string) => boolean
type Term = Sub[]
type Span = { s: number; e: number; word: string }
type Seg = { toks: string[]; q: boolean; head: boolean; label: boolean }
type CAct = { v?: Term[]; n?: Term[]; o?: Term[]; p?: Term[]; w: number; short: boolean; neg: boolean; after: boolean; lone: boolean; pv?: Term[] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const fold = (s: string) => s.toLowerCase().replace(/ё/g, "е")
function subOf(src: string): Sub {
  const s = fold(src)
  if (s.endsWith("*")) {
    const p = s.slice(0, -1)
    return (w) => w.startsWith(p)
  }
  const m = /^([^()]*)\(([^()]*)\)$/.exec(s)
  if (m) {
    const re = new RegExp(`^${esc(m[1])}(?:${m[2].split("|").map(esc).join("|")})$`)
    return (w) => re.test(w)
  }
  return (w) => w === s
}
const termOf = (t: string): Term => t.split(" ").filter(Boolean).map(subOf)
const termsOf = (l?: string[]): Term[] => (l ?? []).map(termOf)
const PROPOSE_T = termsOf(PROPOSE)
const compiled = CLOSED_LIST.map((rule) => ({
  rule,
  acts: rule.act.map((a): CAct => ({ v: a.v && termsOf(a.v), n: a.n && termsOf(a.n), o: a.o && termsOf(a.o), p: a.p && termsOf(a.p), w: a.w ?? 6, short: a.short !== false, neg: a.neg !== false, after: a.after === true, lone: a.lone === true, pv: a.pv && termsOf(a.pv) })),
}))

const NEG = new Set(["не", "без", "нет", "нельзя", "never", "not", "no", "without", "dont", "don", "t"])
const MARK_RE = /\(\s*recommended\s*\)/gi

function spansOf(toks: string[], terms: Term[]): Span[] {
  const out: Span[] = []
  for (const t of terms) {
    for (let j = 0; j + t.length <= toks.length; j++) if (t.every((f, k) => f(toks[j + k]))) out.push({ s: j, e: j + t.length, word: toks.slice(j, j + t.length).join(" ") })
  }
  return out.sort((a, b) => a.s - b.s)
}
const gap = (a: Span, b: Span) => (a.e <= b.s ? b.s - a.e : b.e <= a.s ? a.s - b.e : 0)

/** Sentences of a text: a line, or a part of a line up to ". " / "! " / "? " / "; ". `head`: a heading / label (no closing point, up to 4 words). */
function segments(text: string, label = false): Seg[] {
  const out: Seg[] = []
  for (const line of String(text ?? "").split(/\n+/)) {
    for (const part of line.split(/(?<=[.!?;…])\s+/)) {
      const raw = part.trim()
      if (!raw) continue
      const toks = normalizeGateText(raw).trim().split(" ").filter(Boolean)
      if (toks.length) out.push({ toks, q: /\?[)»"'*_`\s]*$/.test(raw), head: !/[.;…]\s*$/.test(raw) && toks.length <= 4, label })
    }
  }
  return out
}

/** The word of the first pattern of the rule that the sentence satisfies (`ctx`: the words of the question, objects for an option). */
function actWord(a: CAct, seg: Seg, ctx?: string[]): string | undefined {
  const toks = seg.toks
  const alive = (s: Span) => a.neg === false || !(s.s > 0 && NEG.has(toks[s.s - 1]))
  const os = a.o ? spansOf(toks, a.o) : []
  const ctxO = ctx && a.o ? spansOf(ctx, a.o)[0] : undefined
  const objectFor = (x: Span): string | undefined => {
    const o = os.find((y) => (a.after ? y.s >= x.e : y.e <= x.s || y.s >= x.e) && gap(x, y) <= a.w)
    return o ? `${x.word} ${o.word}` : ctxO ? `${x.word} (${ctxO.word})` : undefined
  }
  if (a.pv) {
    // a past form ("чтобы я запушил", "влил ли") proposes only after a cue; alone it describes what was done
    const cue = (s: Span) => toks.slice(Math.max(0, s.s - 3), s.s).some((w) => w === "чтобы" || w === "если") || toks[s.e] === "ли"
    const pv = spansOf(toks, a.pv).filter(alive).find(cue)
    if (pv) return pv.word
  }
  if (a.v) {
    for (const v of spansOf(toks, a.v).filter(alive)) {
      if (!a.o) return v.word
      if (a.lone && seg.label && v.s === 0 && toks.length <= 3) return v.word // "Принять" alone in the label: the object is unknown, the label proposes the action
      const w = objectFor(v)
      if (w) return w
    }
  }
  if (a.n) {
    for (const n of spansOf(toks, a.n).filter(alive)) {
      let w: string | undefined = n.word
      if (a.o) {
        w = objectFor(n)
        if (!w) continue
        if (!a.p) return w
      }
      const near = spansOf(toks, a.p ?? PROPOSE_T).find((p) => gap(n, p) <= 4 && (p.e <= n.s || p.s >= n.e))
      if (near) return `${near.word} ${w}`
      if (!a.o && a.short && (seg.head || (seg.q && toks.length <= 6) || (seg.label && toks.length <= 6))) return w
    }
  }
  return undefined
}

export type ClosedHit = { id: string; why: string; word: string }
/**
 * Every rule of the closed list that the question proposes, or that the RECOMMENDED option (`label`, `desc`) proposes, with the word that hit.
 * `text` is the question (title, text); the option is optional.
 */
export function closedHits(text: string, label = "", desc = ""): ClosedHit[] {
  const qs = segments(text)
  const opt = [...segments(String(label ?? "").replace(MARK_RE, " "), true), ...segments(desc)]
  const ctx = qs.flatMap((s) => s.toks)
  const out: ClosedHit[] = []
  for (const c of compiled) {
    let word: string | undefined
    for (const a of c.acts) {
      word = qs.map((s) => actWord(a, s)).find(Boolean) ?? opt.map((s) => actWord(a, s, ctx)).find(Boolean)
      if (word) break
    }
    if (word) out.push({ id: c.rule.id, why: c.rule.why, word })
  }
  return out
}
/** The first rule of the closed list that the question or the recommended option proposes. */
export const closedBy = (text: string, label = "", desc = "") => closedHits(text, label, desc)[0]
/** An example of the table as the test runs it: "question" or "question => label (Recommended)" or "question => label || description". */
export function exampleHits(example: string): ClosedHit[] {
  const [q, opt = ""] = example.split(" => ")
  const [label, desc = ""] = opt.split(" || ")
  return closedHits(q, label, desc)
}

// ---------------------------------------------------------------------------------------------------------------------
// THE JUDGEMENT on one form: pure, no files.
export type HoldReason = "closed" | "norec" | "limit" | "doubt" | "fail"
export type Judge =
  | { on: false }
  | { on: true; ok: true; option: 1; label: string; type: string }
  | { on: true; ok: false; reason: HoldReason; why: string; rule?: string; type: string }

const MARK = /\(\s*recommended\s*\)/i
const TYPE_RE = /(?:^|[\s(«"'])тип\s*:\s*([\p{L}_-]+)/iu
const hold = (type: string, reason: HoldReason, why: string, rule?: string): Judge => ({ on: true, ok: false, reason, why, type, ...(rule ? { rule } : {}) })

export function judgeForm(f: PendingForm, cfg: { mode: AnswerMap }): Judge {
  try {
    // (a) the mode: the project hands nothing to the recommendation - the old behaviour, no marker, nothing
    if (!(ANSWER_TYPES as readonly string[]).some((t) => modeFor(cfg.mode, t) === "recommendations")) return { on: false }
    const text = [f.title, f.full, f.question].filter(Boolean).join("\n")
    const declared = TYPE_RE.exec(text)?.[1]?.toLowerCase()
    const type = declared ?? "default"
    if (type === "gate") return hold(type, "closed", "тип gate: ворота всегда у владельца", "gate-type")
    if (!(ANSWER_TYPES as readonly string[]).includes(type)) return hold(type, "doubt", `тип «${type}» не из requirements / plan / implementation / default`)
    if (modeFor(cfg.mode, type) !== "recommendations") return { on: false }
    const opts = f.options ?? []
    const marks = opts.map((o, i) => (MARK.test(o) ? i : -1)).filter((i) => i >= 0)
    const rec = marks.length === 1 ? marks[0] : -1
    // (c) the closed list: what the question PROPOSES, and what the RECOMMENDED option (label and description) proposes (task 097)
    const hit = closedBy(text, rec >= 0 ? opts[rec] : "", rec >= 0 ? (f.optDesc?.[rec] ?? "") : "")
    if (hit) return hold(type, "closed", `${hit.why} («${hit.word}»)`, hit.id)
    // the shape: exactly one question, not a multiple choice (the answer is one option)
    if (f.nq !== 1) return hold(type, "doubt", "в форме не один вопрос или форма не распознана")
    if (f.multi) return hold(type, "doubt", "вопрос с множественным выбором")
    // (b) exactly one mark, on the first option
    if (!opts.length) return hold(type, "norec", "нет вариантов (вопрос со свободным текстом)")
    if (marks.length !== 1) return hold(type, "norec", marks.length ? "пометка «(Recommended)» у нескольких вариантов" : "нет пометки «(Recommended)»")
    if (rec !== 0) return hold(type, "norec", "пометка «(Recommended)» не у первого варианта")
    return { on: true, ok: true, option: 1, label: opts[0], type }
  } catch (e) {
    return hold("default", "doubt", `сбой разбора: ${e}`)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// FILES
const autoDirOf = (formsDir: string) => path.join(formsDir, "auto")
const markFile = (formsDir: string, id: string) => path.join(autoDirOf(formsDir), `${safeKey(id)}.json`)
const answerFile = (answersDir: string, id: string) => path.join(answersDir, `auto-${safeKey(id)}.json`)

export type Mark = {
  id: string
  session: string
  project?: string
  task?: number
  type: string
  /** when the owner was first left this form (held) or the answer was put (sent) */
  first: number
  /** the last change of the state; for an applied answer - the time the plugin applied it */
  at: number
  state: "held" | "sent" | "applied" | "failed" | "owner"
  reason?: HoldReason
  rule?: string
  why?: string
  label?: string
  question?: string
}

function writeJson(file: string, v: unknown) {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(v, null, 1))
  renameSync(tmp, file)
}
/** Create the file only if there is none: a temporary file becomes visible by a hard link (the loser gets EEXIST), the fallback is the flag wx. */
function createOnce(file: string, v: unknown): boolean {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, JSON.stringify(v, null, 2))
  try {
    try {
      linkSync(tmp, file)
      return true
    } catch (e: any) {
      if (e?.code === "EEXIST") return false
      if (e?.code === "EPERM" || e?.code === "ENOSYS" || e?.code === "ENOTSUP" || e?.code === "EXDEV") {
        try {
          writeFileSync(file, readFileSync(tmp), { flag: "wx" })
          return true
        } catch (e2: any) {
          if (e2?.code === "EEXIST") return false
          throw e2
        }
      }
      throw e
    }
  } finally {
    rmSync(tmp, { force: true })
  }
}
const readMark = (formsDir: string, id: string) => readJson<Mark>(markFile(formsDir, id))
const saveMark = (formsDir: string, m: Mark) => writeJson(markFile(formsDir, m.id), m)

type AnswerFile = { id: string; at: number; session?: string; form?: string; source?: string; status?: string; done?: number; why?: string }
const readAnswers = (answersDir: string): AnswerFile[] => {
  const out: AnswerFile[] = []
  try {
    for (const n of readdirSync(answersDir)) {
      if (!n.endsWith(".json")) continue
      const a = readJson<AnswerFile>(path.join(answersDir, n))
      if (a && typeof a === "object" && !(a as any).kind) out.push(a)
    }
  } catch {}
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// THE TICK
export type AutoConfig = { mode: AnswerMap; max: number; delaySec: number; project?: string; task?: number }
export type AutoDeps = {
  /** the settings of the project of the tab (undefined: no card or no project - nothing is done) */
  config(session: string): AutoConfig | undefined
  /** is the tab open in a window (or a running task session) and does a turn run in it: the question is on the screen only while the turn runs */
  tab(session: string): Promise<{ open: boolean; busy: boolean }>
  /** did the owner write in the tab after `since` */
  ownerWrote(session: string, since: number): Promise<boolean>
  /** the time of the first word of the owner in the tab after `at` (0: none) */
  ownerWordAfter(session: string, at: number): Promise<number>
  say?(line: string): void
}

/** How many automatic answers in a row the session has: those put after the last answer of the owner (a file without the source plugin)
 *  and without the owner's word in the tab between or after them. Answers that were refused are not counted; one put but not yet applied is. */
export async function seriesOf(deps: Pick<AutoDeps, "ownerWordAfter">, session: string, answersDir: string, upTo = Infinity): Promise<number> {
  const mine = readAnswers(answersDir)
    .filter((a) => a.session === session && a.status !== "refused")
    .map((a) => ({ a, t: a.done ?? a.at ?? 0 }))
    .sort((x, y) => x.t - y.t)
  let from = 0
  mine.forEach((x, i) => {
    if (x.a.source !== "plugin") from = i + 1
  })
  const auto = mine.slice(from)
  if (!auto.length) return 0
  if ((await deps.ownerWordAfter(session, auto[auto.length - 1].t)) > 0) return 0
  let n = 1
  for (let i = auto.length - 1; i >= 1 && n < upTo; i--) {
    const w = await deps.ownerWordAfter(session, auto[i - 1].t)
    if (w > 0 && w < auto[i].t) break
    n++
  }
  return n
}

const recheck = new Map<string, { until: number; max: number }>()
const RECHECK_MS = 30_000
let markers = new Set<string>()
let scanned = ""

/** Follow the answer file: sent -> applied / failed. */
function syncMark(formsDir: string, answersDir: string, m: Mark): Mark {
  if (m.state !== "sent") return m
  const a = readJson<AnswerFile>(answerFile(answersDir, m.id))
  if (a?.status === "applied") {
    const f: Mark = { ...m, state: "applied", at: a.done ?? m.at }
    saveMark(formsDir, f)
    return f
  }
  // the owner was first (his answer file or his reply took the form): not a failure of ours, not counted anywhere
  if (a?.status === "refused" && /already answered|no open question form|вопрос задан заново/.test(a.why ?? "")) {
    const f: Mark = { ...m, state: "owner", ...(a.why ? { why: a.why } : {}), at: a.done ?? m.at }
    saveMark(formsDir, f)
    return f
  }
  if (a?.status === "refused") {
    const f: Mark = { ...m, state: "failed", reason: "fail", ...(a.why ? { why: a.why } : {}), at: a.done ?? m.at }
    saveMark(formsDir, f)
    return f
  }
  return m
}

export async function autoTick(deps: AutoDeps, now = Date.now(), formsDir = FORMS, answersDir = ANSWERS_DIR): Promise<void> {
  const say = deps.say ?? (() => {})
  const autoDir = autoDirOf(formsDir)
  // the markers that wait for their answer file: found once per process (and per folder), then kept in memory
  if (scanned !== autoDir) {
    scanned = autoDir
    markers = new Set()
    try {
      for (const n of existsSync(autoDir) ? readdirSync(autoDir) : []) if (n.endsWith(".json") && readJson<Mark>(path.join(autoDir, n))?.state === "sent") markers.add(n.replace(/\.json$/, ""))
    } catch {}
  }
  for (const key of [...markers]) {
    const m = readJson<Mark>(path.join(autoDir, `${key}.json`))
    if (!m || m.state !== "sent") {
      markers.delete(key)
      continue
    }
    if (syncMark(formsDir, answersDir, m).state !== "sent") markers.delete(key)
  }
  for (const { session, form: f } of waitingForms(now, formsDir)) {
    try {
      await one(deps, session, f, now, formsDir, answersDir, say)
    } catch (e) {
      say(`form auto failed for ${session}/${f.id}: ${e}`)
    }
  }
  purge(autoDir, now)
}

async function one(deps: AutoDeps, session: string, f: PendingForm, now: number, formsDir: string, answersDir: string, say: (l: string) => void) {
  if (f.replacedBy || f.cancelled || f.repeats || f.exhausted) return // the repeats of a lost question and the history are not touched (tasks 040, 071, 073)
  const cfg = deps.config(session)
  if (!cfg) return
  const file = answerFile(answersDir, f.id)
  const mark = readMark(formsDir, f.id)
  if (existsSync(file)) {
    // decided before (maybe by a process that died before it wrote the marker): the file is the fact, the marker follows it
    if (!mark || mark.state === "held") {
      const m: Mark = { id: f.id, session, ...(cfg.project ? { project: cfg.project } : {}), ...(cfg.task ? { task: cfg.task } : {}), type: "default", first: now, at: now, state: "sent" }
      saveMark(formsDir, m)
      markers.add(safeKey(f.id))
    }
    return
  }
  const j = judgeForm(f, cfg)
  if (!j.on) return
  const base = { id: f.id, session, ...(cfg.project ? { project: cfg.project } : {}), ...(cfg.task ? { task: cfg.task } : {}), type: j.type, question: (f.question ?? f.title ?? "").slice(0, 200) }
  const holdFor = (reason: HoldReason, why: string, rule?: string) => {
    if (mark?.state === "held" && mark.reason === reason && mark.rule === rule && mark.why === why) return
    saveMark(formsDir, { ...base, first: mark?.first ?? now, at: now, state: "held", reason, why, ...(rule ? { rule } : {}) })
    say(`form ${f.id} of ${session}: left to the owner (${reason}${rule ? `, ${rule}` : ""}): ${why}`)
  }
  if (!j.ok) return holdFor(j.reason, j.why, j.rule)
  if (now - (f.born ?? f.at) < Math.max(0, cfg.delaySec) * 1000) return // the owner may answer first
  const key = `${session}/${f.id}`
  const r0 = recheck.get(key)
  if (r0 && r0.until > now && r0.max === cfg.max) return // looked a moment ago (a query each): not every tick
  const tab = await deps.tab(session)
  if (!tab.open || !tab.busy) return // no running turn: the form is lost, not on the screen - the repeat of task 040 is its way
  if (loopOf(session, formsDir)) return holdFor("doubt", "вкладка зациклилась на вопросе (задача 078)")
  if (await deps.ownerWrote(session, f.at)) {
    recheck.set(key, { until: now + RECHECK_MS, max: cfg.max })
    return // the owner is in the tab: his word is older than any setting
  }
  const used = await seriesOf(deps, session, answersDir, cfg.max)
  if (used >= cfg.max) {
    recheck.set(key, { until: now + RECHECK_MS, max: cfg.max })
    return holdFor("limit", `предел answer_max: ${used} автоответов подряд`)
  }
  const out = {
    id: `auto-${safeKey(f.id)}`,
    at: now,
    source: "plugin",
    form: f.id,
    session,
    option: "1",
    quote: `answer_mode: recommendations (тип ${j.type}), форма встроенного вопросника, у первого варианта единственная пометка (Recommended); задержка ${cfg.delaySec} с`,
    mode: "recommendations",
    type: j.type,
    ...(cfg.project ? { project: cfg.project } : {}),
    ...(cfg.task ? { task: cfg.task } : {}),
  }
  // the record of the answer comes first (and only one per form: the name is the mark); delivery is owner-answer.ts
  if (!createOnce(file, out)) return
  saveMark(formsDir, { ...base, first: now, at: now, state: "sent", label: j.label })
  markers.add(safeKey(f.id))
  say(`form ${f.id} of ${session}: answered by answer_mode (recommendations, type ${j.type}): "${j.label.slice(0, 80)}" after ${Math.round((now - (f.born ?? f.at)) / 1000)} s`)
}

let purgedAt = 0
function purge(autoDir: string, now: number) {
  if (now - purgedAt < 10 * 60_000) return
  purgedAt = now
  try {
    for (const n of existsSync(autoDir) ? readdirSync(autoDir) : []) {
      const file = path.join(autoDir, n)
      if (n.endsWith(".json") && Date.now() - statSync(file).mtimeMs > MARK_KEEP_MS) rmSync(file, { force: true })
    }
  } catch {}
}

// ---------------------------------------------------------------------------------------------------------------------
// THE LETTER AND THE NOTE (owner-answer.ts uses them for the source plugin)
const GATES_TEXT = "Ворота — утверждение spec.md и plan.md, согласование плана, пуш, слияние, удаление, перезапуск или переключение службы, публикация, деньги и подписки, общие среды, отказ от требования, потолок заходов и раунды, решения по результату и сдаче — только слово владельца."
export const autoLetter = (question: string, answer: string, type: string) =>
  `Ответ по настройке проекта (answer_mode: recommendations, тип ${type}), не слово владельца. Ваш вопрос «${question}» закрыт плагином: выбран рекомендованный вариант «${answer}». ` +
  `Вопросник закрыт прерыванием хода; не задавайте этот вопрос снова, продолжайте с этим ответом. ` +
  `${GATES_TEXT} Правило: вышел за рекомендацию — вопрос владельцу. Слово владельца в диалоге старше этого ответа.`
export const autoNote = (question: string, answer: string, type: string, id: string) =>
  `ответ по настройке проекта (answer_mode: recommendations, тип ${type}) на форму «${question.slice(0, 150)}»: ${answer.slice(0, 200)} [answer ${id}]`

// ---------------------------------------------------------------------------------------------------------------------
// THE SHOW: the counters of /crew and of the side panel, the note of the doctor
export type AutoStats = { answered: number; last?: number; held: Record<HoldReason, number>; heldTotal: number }
const REASON_WORDS: Record<HoldReason, string> = { closed: "закрытый список", norec: "нет рекомендации", limit: "предел", doubt: "сомнение", fail: "сбой доставки" }
const REASON_SHORT: Record<HoldReason, string> = { closed: "closed", norec: "no rec", limit: "limit", doubt: "doubt", fail: "failed" }

/** The forms of the last 24 hours: answered by the plugin, and left to the owner by reason. `project` undefined - all projects. */
export function autoStats(project: string | undefined, now = Date.now(), formsDir = FORMS, answersDir = ANSWERS_DIR): AutoStats {
  void answersDir
  const out: AutoStats = { answered: 0, held: { closed: 0, norec: 0, limit: 0, doubt: 0, fail: 0 }, heldTotal: 0 }
  const dir = autoDirOf(formsDir)
  let names: string[] = []
  try {
    names = existsSync(dir) ? readdirSync(dir) : []
  } catch {}
  for (const n of names) {
    if (!n.endsWith(".json")) continue
    const m = readJson<Mark>(path.join(dir, n))
    if (!m || (project && m.project !== project)) continue
    if (m.state === "applied" && now - m.at <= DAY_MS) {
      out.answered++
      out.last = Math.max(out.last ?? 0, m.at)
    } else if ((m.state === "held" || m.state === "failed") && now - (m.state === "held" ? m.first : m.at) <= DAY_MS) {
      const r: HoldReason = m.state === "failed" ? "fail" : (m.reason ?? "doubt")
      out.held[r]++
      out.heldTotal++
    }
  }
  return out
}

/** "closed 1, no rec 2": the reasons with a count, for the counter of /crew. */
export const heldShort = (s: AutoStats) => (Object.keys(REASON_SHORT) as HoldReason[]).filter((r) => s.held[r]).map((r) => `${REASON_SHORT[r]} ${s.held[r]}`).join(", ")

/** Lines of the doctor ("К сведению"): the day's count, the last closing, the forms left to the owner and why. Nothing happened - no line. */
export function autoNotes(now = Date.now(), formsDir = FORMS, answersDir = ANSWERS_DIR): string[] {
  const s = autoStats(undefined, now, formsDir, answersDir)
  if (!s.answered && !s.heldTotal) return []
  const hm = (t: number) => new Date(t).toTimeString().slice(0, 5)
  const why = (Object.keys(REASON_WORDS) as HoldReason[]).filter((r) => s.held[r]).map((r) => `${REASON_WORDS[r]} ${s.held[r]}`).join(", ")
  return [`автоответы на формы встроенного вопросника за сутки: ${s.answered}${s.last ? ` (последнее в ${hm(s.last)})` : ""}; ушло владельцу: ${s.heldTotal}${why ? ` (${why})` : ""}`]
}
