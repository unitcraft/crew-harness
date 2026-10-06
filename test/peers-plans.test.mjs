// Self-test of plan documents (plan 012; node >= 24):  node test/peers-plans.test.mjs
// The template, the parser (phases, steps, tags, criteria, questions, mode) and the machine criteria of a plan.
const { planTemplate, parsePlan, planProblems, stepDeps, allSteps } = await import("../plans.ts")
let fail = 0
const cell = (name, ok, detail) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " :: " + detail}`)
  if (!ok) fail++
}

const good = `# План 7 — длина фрагмента

**Статус:** 🔴 ОТКРЫТ
**Источник:** слова владельца 2026-10-06
**Зависимости:** —

## Зачем
Фрагмент длиной 0 на 3 фикстурах из 12.
## Что уже есть
\`grep -rn frag_len src\` — одна функция.
## Режим выполнения
Без упрощений: ДА — владелец, 2026-10-06
## Фазы
### Ф.1 — разбор [P1] [после: —]
#### Ф.1.1 — лексер — GATE [P1] [где: lex/lex.nv]
Что: лексер отдаёт длину склеенного текста
**Приёмка:**
- ⬜ \`nova test lex\` → 12/12; доказательство: строка PASS; краснота: вернуть старую длину → 3 FAIL
#### Ф.1.2 — парсер ✅ СДЕЛАНО 2026-10-07, коммит \`abc\` [после: Ф.1.1] [где: parse/expr.nv]
Что: парсер берёт длину из лексера
**Приёмка:**
- ✅ ВЫПОЛНЕНО \`nova test parse\` → 40/40
### Ф.2 — проверка [P2] [после: Ф.1]
#### Ф.2.1 — фикстуры [подплан]
Что: батарея фикстур
**Приёмка:**
- ⬜ батарея зелёная
## Не делаем
Оракул.
## Открытые вопросы
- ❔ Нужна ли спека? · адресат: владелец · умолчание: нет · срок: до Ф.2 · **Блокирует:** Ф.2
## Решения владельца
| № | решение | дата |
`
const p = parsePlan(good)
const steps = allSteps(p)
cell("title, header and sections are read", p.title === "План 7 — длина фрагмента" && p.header["Статус"] === "🔴 ОТКРЫТ" && p.sections.includes("Не делаем"), JSON.stringify({ t: p.title, h: p.header, s: p.sections }))
cell("phases and steps with their tags", p.phases.length === 2 && steps.length === 3 && steps[0].gate && steps[0].priority === "P1" && steps[0].where[0] === "lex/lex.nv" && steps[1].after[0] === "Ф.1.1" && steps[2].subplan, JSON.stringify(steps.map((s) => [s.id, s.title, s.priority, s.after, s.where, s.gate, s.subplan])))
cell("titles are clean of tags and marks", steps[0].title === "лексер" && steps[1].title === "парсер", JSON.stringify(steps.map((s) => s.title)))
cell("done marks are read", steps[1].done && !steps[0].done, JSON.stringify(steps.map((s) => s.done)))
cell("what and criteria of a step", steps[0].what.startsWith("лексер отдаёт") && steps[0].criteria.length === 1 && /12\/12/.test(steps[0].criteria[0]), JSON.stringify(steps[0]))
cell("the owner's answer on shortcuts", p.noShortcuts === true, String(p.noShortcuts))
cell("a phase's 'after' expands to its steps", JSON.stringify(stepDeps(p, steps[2])) === '["Ф.1.1","Ф.1.2"]', JSON.stringify(stepDeps(p, steps[2])))
cell("a good plan has no problems", planProblems(good).length === 0, JSON.stringify(planProblems(good)))
cell("the template itself parses into one phase and step", parsePlan(planTemplate(9, "x", "y")).phases[0]?.steps.length === 1, JSON.stringify(parsePlan(planTemplate(9, "x", "y")).phases))

const bad = good
  .replace("**Источник:** слова владельца 2026-10-06\n", "")
  .replace("## Что уже есть\n", "")
  .replace("Что: парсер берёт длину из лексера\n", "")
  .replace("· срок: до Ф.2 ", "")
  .replace("[после: Ф.1.1]", "[после: Ф.9.9]")
const probs = planProblems(bad)
cell("a bad plan: each problem is named", ["Источник", "Что уже есть", "Ф.1.2: нет строки «Что", "нет: срок", "Ф.9.9"].every((w) => probs.some((x) => x.includes(w))), JSON.stringify(probs))
const cyc = good.replace("#### Ф.1.1 — лексер — GATE [P1]", "#### Ф.1.1 — лексер — GATE [P1] [после: Ф.1.2]")
cell("a dependency cycle is found", planProblems(cyc).some((x) => /по кругу/.test(x)), JSON.stringify(planProblems(cyc)))
const noQ = good.replace(/## Открытые вопросы\n- ❔[^\n]*\n/, "## Открытые вопросы\n")
cell("empty open questions need the explicit 'none' line", planProblems(noQ).some((x) => /Открытых вопросов нет/.test(x)) && planProblems(noQ.replace("## Открытые вопросы\n", "## Открытые вопросы\nОткрытых вопросов нет, проверено 2026-10-06\n")).length === 0, JSON.stringify(planProblems(noQ)))

console.log(fail ? `peers-plans.test: FAIL ${fail}` : "peers-plans.test ok")
process.exit(fail ? 1 : 0)
