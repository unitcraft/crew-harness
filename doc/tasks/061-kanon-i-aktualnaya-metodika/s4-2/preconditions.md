# Собственные внешние предпосылки С4-2

Команды — из корня подготовленного дерева. Внешний locator передаётся `git -C <method|045|013>` только как CLI-аргумент; в артефактах сохранены относительные пути, не локаторы машины. Ранний `external-before.json` снят до первого чтения внешних предметов. Полные stdout/stderr/exit — `upstream-check.json`, `external-checks.json`; таблица ниже — смысл результатов, не замена вывода.

| Заявление плана / источник | Собственная read-only команда / expected | Observed / итог | Граница вывода / действие |
|---|---|---|---|
| §2: upstream именно публичная методика | `git remote get-url origin`; ожидаемый публичный URL | `https://github.com/unitcraft/ai-dev-methodology.git`, exit 0; CONFIRMED | Не доказывает будущую актуальность |
| :6,22: опубликованный main 78ed | `git ls-remote origin refs/heads/main`; полный 78ed | Два собственных запроса вернули `78ed75838ef58073153e5343c9483bc462721a31`, exit 0; CONFIRMED | До будущих gate/transfer повторить; drift → В-01а, не silent pin |
| :22: local HEAD/clean | `rev-parse HEAD`, `status --porcelain=v1 --untracked-files=all` | HEAD=78ed, stdout status пуст, exit 0; CONFIRMED | Не runtime и не активный pin061 |
| old/current/принятые объекты существуют | `cat-file -t <full-commit>` для f333/a449/78ed/ab2/9d391ba | Каждый — commit, exit 0; CONFIRMED | Exact content читается `git show`, не по краткому имени |
| :22–24: поздний delta | `git diff a449..78ed --stat`, `git diff ... -- methodology.md task-sessions.md completeness-check.md doc/open-questions.md` | Пять путей; M156 session gate-question, S234–245 С4 п.7, provenance P, вопрос малого риска Q; CONFIRMED | HTML производный; Q не сокращает цикл. Карта до a449 не полная карта late delta |
| :61,65: исходная карта old→a449 | `git diff f333..a449 --stat`; полный normative diff M/S/R | 16 путей; изменения source/progress/roles/current/convergence/opinion подтверждены; CONFIRMED | Не все 16 — нормы; комплект/starter/presentation не действие061 |
| Algorithm не менялся | `git show <pin>:task-algorithm.md` → raw SHA | f333/a449/78ed/ab2: 51475 bytes, SHA `ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96`; CONFIRMED | Hash — идентичность, не чтение |
| Принятые журналы ab2 и Q5 9d391ba | `git diff ab2..a449 -- task-runner.md`; сравнение Q5 из Git objects | ab2→a449 только профиль opinion; Q5 одинакова; CONFIRMED | Полный runtime не следует из принятия ручного инструмента |
| :12,63,67,79: approved031 1.0 | `git show 4b48c50...:doc/tasks/031-runner-regulation-in-plugin/spec.md` | Approved 732 строки; SHA `a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829`; CONFIRMED | Не destination. Closed fields/refs не подтверждают matching registries |
| Progress conflict C17/C22 | Сверка exact031:105,259,309,540 и R88–94/716 | `готово:` отвергается031, разрешено current; N/start exception требует отдельной semantic редакции; CONFIRMED | Никакой доказанный новый JSON key из этого не следует; версии не выбраны |
| 045 HEAD/plan/spec | `rev-parse HEAD`, status, raw hashes | HEAD=b18cc505...; spec685245.../plan4856a2... совпали; status содержит исходные untracked; CONFIRMED | Не чистая ветка, не наши изменения; plan draft |
| 045 за origin/main на 111 | `rev-list --count HEAD..origin/main` | Проверено отдельно ниже в `external-supplement.json`; CONFIRMED лишь локальное tracking-ref отставание | Не fresh remote отставание; не основание fetch/rebase |
| 045 готовый каталог/утверждённый план | Чтение plan:1,192–212, current; поиск tracked `src/runner_core` и exists | План черновик, current о подготовке, src отсутствует; NOT VERIFIED для готового продукта | Выбор пути10+6 не approvals; отдельный цикл045, обе блокирующие темы сохраняются |
| 045 per-anchor/per-DNC блокер | Plan:136–139,156–164, review4:14–16 | Отдельная обязательная запись/вход/target или reason/expected/evidence/reviewer PASS либо NOT VERIFIED действительно требуются; CONFIRMED | 061 даёт маршрут, не исправляет045 и не утверждает её план |
| 013 draft/старое слово владельца | spec:1,457–512; task/message:1–74; log применимые записи | Draft, минимальный контракт надо разработать/утвердить отдельно; решение09октября уже в исходнике; CONFIRMED | Не свежий delta и не consumer API |
| :28,79: runtime013/reader | `git ls-files src/runner_core`; exists src/src/runner_core/format | stdout пуст; exists False; NOT VERIFIED для runtime/reader | Подтверждено отсутствие путей в этом checkout, не отсутствие в мире и не совместимость |
| Наблюдаемое plugin поведение | Чтение actual callsites journal/tasks/task-folders/index/core на492c166 | Launch до session.create; append-only progress; tmp/rename task record; CONFIRMED в узком scope | Нет evidence полного runner, processGroup/starttime/offset в TaskSession; не утверждение отсутствия механизма во всём коде |
| :73: новые evidence-пути доступны | Проверка существования шести exact `NEWs3-1/*.md` и `coverage.md` | Шесть уже существуют, coverage отсутствует; CONFIRMED | Реальный конфликт первого доступного шага: K2, не разрешение переписать before |
| Будущий format/current | exists + план/spec gate boundaries | В этом дереве format/current061 отсутствуют; CONFIRMED как текущее состояние | Создаются только будущим разрешённым переносом; отсутствие reader не блокирует документ |

## Чего исполнитель не сможет сделать без вопроса

1. Выбрать содержание/REQ/AC/пары новой редакции и три значения версий; ответ оставлен В-02 и отдельным содержательным воротам plan:16,79,83,95. До них можно подготовить предложение, нельзя создать format. Отрицательная/неполная compatibility оценка возвращает shape владельцу. Это честная зависимость, не дефект наличия будущих ворот.
2. Перевести задачу с уже состоявшимися воротами на новый pin без решения владельца. Полномочия есть в принятом В-01; новое упоминание78ed не разрешение перехода061/045. До переноса проверяются upstream/delta; список конкретных переходов согласуется в выбранном scope.
3. Подменить полный каталог выбранным путём/придумать signatures — нельзя и вопрос о пути заново не нужен. Содержание10+6 и signatures относятся045; 013 не возобновляется.
4. Исполнить противоречивую команду переноса внешнего gate-question как проектной нормы и одновременно запрет пересказа — требуется авторская правка плана K1, а не новая цель/spec.
5. Записать свежие пять notes из шага0 в уже занятые пути NEWs3-1 и одновременно доказать неизменность исходных evidence — K2; шестой выход шага0, coverage.md, ещё отсутствует. Нужна новая session-local папка, а не владелец, набирающий команды.

Сборка, полные guards, тесты продукта, запуск reader, live/remote writes не нужны для read-only проверки этих предпосылок и не выполнялись. Их недоступность не объявлена внешним блокером. Будущие checks создаются до invocation по plan:101; форматные пары — именованная ручная проверка, не несуществующий validator. Никакого вопроса о выборе нового общего контракта061 не добавлено.
