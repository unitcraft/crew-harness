# Отпечатки С2к

База собственного дерева: `492c166fbd12e00a6a924efab065f6adb4bd91f6`, ветка `review/061-topic-contract`. Других refs/деревьев не создавал. Живой plugin не использован. SHA-256 считается по raw bytes, не через текстовый pipeline.

## Семь subjects и inputs

На старте и после предметного чтения каждый корневой файл равен соответствующему `../inputs/` побайтно. Собственный машинный baseline — `baseline.json`. Все14проверок hash и7побайтных сравнений сохранились; изменённых0.

| Файл | SHA-256 до = после = input |
|---|---|
| spec.md | a9156e7135f4abbf8d46d585432a2ce3ae6942d7a6f73da3c96f007dcb846b64 |
| analysis.md | 56375053b9cb580f48796ba2234f9747741ee9963a20b5854ddee6bd0aff0734 |
| 031-impact.md | c79ac11b03a81ec4150175560b299410b687adb92720682e305b392e40d8135c |
| spec-trace.md | 5f9bb73dbe9d0bd078878e7ec444253a670ea630ec8ef3fa1273e27002ce647f |
| spec-fixes-1.md | fdce445416e0b24fef4f524c95f5c279ef1838aa95d91bc9846aae2ad3b2772b |
| spec-fixes-2.md | 2dee3927afe251847e619d78795108c236796303bab1e2836e6ab9e900c2de89 |
| spec-fixes-3.md | 24c044576c4f8ab861ace1d2cc3ce5cb4c3e9aabde7937373c7503099f1400a4 |

## Прочие защищённые входы

- До работы сняты101файл author045 и8файлов013, после сравнения изменённых0. Каждый относительный путь/hash/байтовыйразмер есть в baseline.json; локаторов машины там нет. Это широкая hash-граница, не заявление чтения109файлов.
- 045 spec SHA685245b64f33424e225e340898399b49084f39b20f66469b58637fe96cc05ed8, planSHA150c9826fc1be49a63cbd8754491c88063c9eca02d145519040d1da51c6711e4 совпадают с заданием.
- 013spec SHAf86a69f3cd2c76cf5a4aa1a35ac720dcd5b8c28c560c6b5150ec9526e93eb376; taskmessageSHA88d6a8f9cdac4cd73ba5d0e49e1c8ed1d3f1fbd772741410e8437bd8e2e8f4a9; logSHA434e218c66362a3bccaeb5cecd3f621e4c6817dda4115be80d169cbc19c0f263. Status013 до/после прочтения одинаков: modifiedlog/taskmessage,untrackedspec/reviews1–3/profile/progress;045status показывает untrackedпапку045. Начальный hash109снят раньше этих status-команд; не заявляю сохранённый до первой команды полный status045.
- Frozen061/AGENTS/MarkdownCanon:100файлов, digestдо=после `5d70b248900c7e76184bce7bf0ed66df210fd70e23b613f2f4f710cdc467e3f7`. Алгоритм: Python `sorted(Path...)`, записи `{file:repo-relative-posix,sha256:hex}`, затем SHA256(`json.dumps(records,sort_keys=True).encode()`). Исключены свой contract и все basename progress/profile/usage. Именно эти100 сохранны, не все возможные snapshots. Ошибка scope исключила10вложенных исторических журналов; не чинится сменой expected.
- Отдельная поздняя полная выборка110 в пункте6: исключены только `progress.log`,`profile.log`,`usage.log` **в корне061** и свой contract. SHA `b7dd5dbf9203407ebf1dd90a2a7365ba438e804960f166fde579fbc4ca6fd8b3`. Ранняя сохранность дополнительных10 собственным baseline не доказана; поздняя повторная сверка не ретроисправляет ранний охват. Фактических правок этихфайлов не было.

## Immutable Git inputs

Approved031 из commit4b48c50eef1fb46af4f074a80511979b16e515e3:

| Файл | Raw SHA-256 |
|---|---|
| spec.md | a9fc97dd622bfe486c46ff00e87baf0b4a2469a2174f1ea2f84f0d6052755829 |
| spec-trace.md | 8af75b276ea92302bdb41d45a7ca0a34522af0d0e0f5fa129078fa9403166d48 |
| log.md | de0f724a355bf0e920e22994cd8566f900e1ef67fec1efbb5163aa7e3e693943 |
| task/message.md | f8cb1bae2cdf41996cf45ee3979d18b053f172424948e8e968b04b7611c8587d |

Currentметодика a449bd2e218e04384d1d42e0c1bffe892495e298:

| Файл | Raw SHA-256 |
|---|---|
| task-runner.md | 178fd0f1055bbdd190a4c8d4a5316566ea7be00829f9883cbfb9fde6a2a16a85 |
| task-sessions.md | 64b221cde012f6e8d05c94fa6a467e4c5ce999bfd8071878caa3e85b8d57214d |
| methodology.md | b404b8d89b659956884fea74f27ed9e317881d4ff35ecf22019d9b40664c6295 |
| task-algorithm.md (толькоhash) | ff55cf734d3fe816178f7c46718cd4e8322b73cac8d64efdf955b166dc079e96 |

## Релевантный plugin492c166

Рабочие байты = raw Git blob для каждого из7файлов; hashes получены после чтения, финальная сверка перед сдачей повторена:7/7 совпадают. Это привязка прочитанного к immutable-базе, не чтение живой копии.

| Файл | Raw SHA-256 |
|---|---|
| journal.ts | 211eb4324489886444287bb5a266adacfffd55185d4e9f64923a563967006e93 |
| task-folders.ts | 6e13014ad6fe52a61d27b2ec3110df0d9f3f531365fbd3856cdd869fa31dadd7 |
| tasks.ts | c5eade92e01b73a37b0e78b83c8228fd1e5f548aa1fb06360f7049fcab919896 |
| core.ts | 75543b85249bd6d135b917c2bb3347c0140f33ea222afc4ad90d023f03b29384 |
| index.ts | e37562e25903e72067fd39fe463ea6d864dd8dd043f1d690e11b5532e0b6f5f1 |
| README.md | d16abd39650d4b5158b37a4a0d3a3dcaf5c31185b6ac714eef51887d700c13f9 |
| progress.ts | baf360da61c51447b60d07d74f1c4201a9939b47a923c7b82f839e09cf426f41 |
