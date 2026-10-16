# Открытые вопросы CrewHarness

Вопросы, которые ждут решения владельца или другой стороны. Не Канон: пункт — вопрос, а не норма. Правила файла — в
методике: [`doc/open-questions.md`](https://github.com/unitcraft/ai-dev-methodology/blob/9d391bad999674c27a52dc5d1e9dae9a61d8c033/doc/open-questions.md)
и разделы 8 и 10 [`methodology.md`](https://github.com/unitcraft/ai-dev-methodology/blob/9d391bad999674c27a52dc5d1e9dae9a61d8c033/methodology.md)
на коммите `9d391ba`; отличия проекта, форма строк и пометки разборов — [process.md](canon/process.md), «Открытые вопросы».
Форму проверяет страж [`check-open-questions.py`](../scripts/guards/check-open-questions.py); он же считает просроченные:
`python scripts/guards/check-open-questions.py --overdue`.

Форма пункта: заголовок `## #N <название>`, строки `- Вопрос:`, `- Адресат:`, `- Решение по умолчанию:`, `- Срок: ГГГГ-ММ-ДД`,
`- Источник: <ссылка>, ГГГГ-ММ-ДД`; дальше по мере дела — `- продлено: до ГГГГ-ММ-ДД[, причина: …]` (не больше двух, второе — с
причиной), `- применено умолчание: <что> (ГГГГ-ММ-ДД)`, `- закрыто: методика приняла норму, [methodology.md, раздел 4, коммит 0b0e6d4](https://github.com/unitcraft/ai-dev-methodology/blob/0b0e6d4/methodology.md), 2026-10-16; страж `log-gate` введён в `check-task-docs.py` (задача 062)
