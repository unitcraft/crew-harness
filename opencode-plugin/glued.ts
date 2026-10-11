// Слипшиеся слова в письме: часть моделей (openai gpt-6.1-sol, gpt-6-astra) теряет пробелы в длинных строковых
// литералах внутри кода инструмента `execute`. Кусок смешанных алфавитов (кириллица + латиница без пробела) длиной
// от MIN_RUN знаков — признак потери. Ссылки, пути, хеши, блоки кода и инлайн-код не считаются.
const MIN_RUN = 20
const MIXED = /(?:[A-Za-z]+[А-Яа-яЁё]+|[А-Яа-яЁё]+[A-Za-z]+)[A-Za-zА-Яа-яЁё]*/g

export type Glued = { runs: string[]; reject: boolean }

function strip(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .replace(/\S*[\\/]\S*/g, (m) => (/[А-Яа-яЁё]/.test(m) ? m : " "))
    .replace(/\b[0-9a-f]{7,64}\b/gi, " ")
}

export function gluedRuns(text: string): string[] {
  return (strip(text).match(MIXED) ?? []).filter((r) => r.length >= MIN_RUN)
}

export function gluedText(text: string): Glued {
  const runs = gluedRuns(text)
  const spaces = (text.match(/\s/g) ?? []).length
  const reject = runs.length >= 2 || (runs.length >= 1 && text.length > 150 && spaces / text.length < 0.06)
  return { runs, reject }
}

export const gluedRefusal = (g: Glued): string =>
  `Не отправлено: в тексте слиплись слова («${g.runs[0].slice(0, 40)}…»): модель потеряла пробелы. Перепиши письмо с пробелами; длинное — коротко, а подробности файлом и ссылкой на него.`
