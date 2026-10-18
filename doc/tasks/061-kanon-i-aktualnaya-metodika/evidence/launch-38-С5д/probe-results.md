# Фактические документальные пробы38

## A — ручной CURRENT-FIRST

A1 ALLOW условно: plan201–210 требует current тем же шагом, proposed D1 прямо сохраняет срок. A2 ALLOW условно: plan235–242/265–267 включает ADR-first, не ждёт README. A3 DENY: отсутствие result.md не исключает первый перенос (spec31/39, proposed D1). A4 DENY: наличие указателя не заменяет ворот4 (plan190–199). A5 ALLOW только добавление адресов уже внесённых частей; невнесённый адрес/цитата нормы DENY по M541/S192/plan265–267. В каждом варианте исход определяется отличающимся входом current/gate/фактический перенос. Переносы не исполнялись. Exit: N/A, именованный ручной маршрут; это не запущенный runtime.

## B — inline Python-B, только память/read-only

Команда — `python -B -` с функцией `p=Path.resolve(); allowed exact new paths; p.is_relative_to(R) and p in allowed and not p.exists()`. Все отказы проверяются до open. Хеши — sha256(bytes); мутант только `b + b'\nMUTANT\n'`. Никаких frozen imports. Фактические bool/поиск ниже, exit0 при всех true. Это проверка path/hash, не смысловой validator норм.

## C — ручные DRIFT/AUTHORITY/NORM

C1 ALLOW условный разрешённый шаг, а не нынешний draft. C2 DENY по owner-gate22 и proposed TRANSITION: любой новый commit, даже тот же scope. C3 DENY слепому старому patch: exact target является входом full-diff; новый target требует сравнения пересечений. C4 DENY одному интегратору после ворот по owner-gate14, позитив — только решение владельца + append old/new/reason/source. C5 NORM-ON: M711/M1550 и REQ-01/02 не выключаются partial/helpers-off/отсутствием runtime. C6 DENY возвращению031/045/013: owner-input3–15. C7 ALLOW внешнему D0 без пересказа; DENY выдаче engine/automaton за runtime по шапкам1–5. Exit: N/A, именованный ручной маршрут; полного adversarial PASS по всем66 нет.

Сверены первичные M711→U713 и M1550→U1552; ниже равенство полных строк, не усечённого отображения. Оно подтверждает сохранность этих двух обязанностей, но не весь delta.

## Сырые результаты B и поиска

```json
{
  "checks": {
    "B1 old36 deny": true,
    "B2 old37 deny": true,
    "B3 foreign deny": true,
    "B4 exact new allow": true,
    "B5 existing before deny": true,
    "B6 unchanged positive": true,
    "B7 content mutant detected": true,
    "tracked positive process": true,
    "fallback controls": true,
    "M711 equals U713": true,
    "M1550 equals U1552": true
  },
  "search": {
    "tracked_exit": 0,
    "tracked_hits": [
      {
        "path": "doc/canon/process.md",
        "line": 188
      },
      {
        "path": "doc/canon/process.md",
        "line": 195
      },
      {
        "path": "doc/canon/process.md",
        "line": 196
      },
      {
        "path": "scripts/guards/check-task-docs.py",
        "line": 39
      },
      {
        "path": "scripts/guards/check-task-docs.py",
        "line": 43
      },
      {
        "path": "scripts/guards/check-task-docs.py",
        "line": 59
      },
      {
        "path": "scripts/guards/check-task-docs.py",
        "line": 126
      },
      {
        "path": "scripts/guards/check-task-docs.py",
        "line": 453
      },
      {
        "path": "scripts/guards/check-task-docs.py",
        "line": 472
      },
      {
        "path": "scripts/guards/check-task-docs.py",
        "line": 473
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 23
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 624
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 670
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 672
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 673
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 680
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 682
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 690
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 695
      },
      {
        "path": "scripts/guards/selftest/test-check-task-docs.py",
        "line": 696
      }
    ],
    "untracked_files": [],
    "untracked_hits": [],
    "rg_available": false,
    "fallback": "Python literal search, не rg",
    "control_positive": true,
    "control_negative": true
  }
}
```

Поиск выполнен реальными git grep и ls-files; untracked fallback явно Python. CLI rg не устанавливался и успешным вызовом не назван. Positive control — известный process в настоящем tracked корпусе; отдельный in-memory literal контроль проверяет fallback. Не заявлена единственность будущего действующего результата: его ещё нет.

Проверка проектов перед пробами: exact patch восстановлен difflib относительно target и совпал по всем четырём секциям; разделы target вопросов, task/message, compaction и answer modes сохранены побайтно, строка ADR0011 сохранена, новые ADR links разрешились в target/proposed, proposed AGENTS отсутствует, настоящий current отсутствует. Это структурная/байтовая проверка, не полная semantic приёмка.

A–D продукта N/A: код/runtime/UI не меняются, suites/guards/build запрещены. E частично: полное первичное покрытие не завершено. F: три документальные группы и positive/negative controls проведены. G: сохранность/соседи — fingerprints/after; фактический перенесённый Канон NOT VERIFIED.
