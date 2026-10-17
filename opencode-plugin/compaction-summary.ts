// СВОДКА ПРИ СЖАТИИ КОНТЕКСТА (задача 072). Образец сводки — раздел «Сводка при сжатии контекста» в doc/canon/process.md (один
// источник: разделы, длины, что в сводку не входит); здесь — только его английская запись для запроса сжатия.
//
// Как это работает в OpenCode 2.0.26. Сжатие — отдельный запрос модели: система, история вкладки и шаблон сводки последним сообщением
// (Objective, Requirements, Decisions, Work State, Next Move, Relevant Files, Important Context). Шаблон зашит в сборку и добавляется
// ПОСЛЕ хука, заменить его плагин не может; хук сессии `compaction` получает тот же снимок запроса, что хук `context` (system, messages,
// tools, model, agent) и может дополнить `system`. Сводка принимается, только если в ней есть заголовок шаблона («## Decisions» и т.д.),
// иначе сборка повторяет запрос и отказывает («did not match the required template») — поэтому заголовки шаблона сохраняются, а
// разделы образца раскладываются под них (COMPACTION_SECTIONS.template).
// Вкладки claude-code (провайдер claude-code) сжимает сам Claude Code, их запрос этот хук не строит — текст им не добавляется.

/** Разделы образца и заголовок шаблона OpenCode, под которым раздел стоит; тест сверяет их с разделом Канона. */
export const COMPACTION_SECTIONS: { ru: string; template: string }[] = [
  { ru: "Что решил владелец", template: "Decisions" },
  { ru: "Открытые вопросы владельцу", template: "Work State" },
  { ru: "Что идёт и что ждёт", template: "Work State" },
  { ru: "Где лежат документы", template: "Relevant Files" },
  { ru: "Что нельзя делать", template: "Requirements" },
]

/** Текст для системной части запроса сжатия: неизменный для языка владельца, английский (язык владельца встаёт одним словом). */
export function compactionSummaryText(ownerLanguage: string): string {
  return (
    `crew-harness rule for this summary (it refines the template; where they differ, this rule wins). ` +
    `The next turn of this tab and the owner read it: write it in ${ownerLanguage}; the owner's words stay verbatim, code, paths and commands unchanged. ` +
    `Keep every ## heading of the template in its order and put under them: ` +
    `Requirements = what must not be done: the owner's bans and the limits of the work, each with date and source. ` +
    `Decisions = what the owner decided: his words verbatim with date and source ("owner, 2026-10-07"); a decision or ban that a later owner word lifted or changed is dropped, not repeated. ` +
    `Work State = what runs and what waits: tasks by title, not by number alone; sessions by kind; who waits for whom or for what; the open questions to the owner go to Blocked, with the recommendation given. ` +
    `Relevant Files = where the documents are: repository paths (task folders, specs, plans), never commit or file hashes. ` +
    `Important Context = only what the work cannot go on without: a hash, a card or session number, a process remark of a reviewer; otherwise the path of the file that holds it, or "(none)". ` +
    `Objective and Next Move stay as short as the template asks. ` +
    `Up to 1000-1500 characters a section and up to 6000 characters in all. ` +
    `Leave out the story of how the work went, tool and test output, and anything the next turn can read from the files listed.`
  )
}
