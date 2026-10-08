// РАЗМЕР ДИАЛОГА ПО СОДЕРЖИМОМУ (правка 003, 2026-10-08, замечание владельца: ответ в две строки показывался на весь экран, всё пусто).
// Короткий текст — среднее окно по центру; текст с широкими строками (таблицы) или длинный — большое. Отдельный модуль без JSX,
// чтобы тест под Node проверял выбор размера (dialog-text.tsx компилирует OpenCode). Ширины текста — по окнам OpenCode 2.0.23:
// medium 60, large 88, xlarge 116 колонок минус отступы диалога.
export type DialogSize = "medium" | "large" | "xlarge"
export const TEXT_WIDTH: Record<DialogSize, number> = { medium: 56, large: 84, xlarge: 112 }
/** Видимая ширина строки: широкие знаки (CJK, эмодзи) занимают две колонки. */
export const cellWidth = (s: string): number => {
  let n = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    n += (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0x1f300 && c <= 0x1faff) ? 2 : 1
  }
  return n
}
/** Сколько строк займёт текст в окне такой ширины (перенос по словам приближён переносом по знакам). */
export const wrappedRows = (lines: string[], width: number): number => lines.reduce((n, l) => n + Math.max(1, Math.ceil(cellWidth(l) / width)), 0)
/** Размер окна и число строк тела для текста; rows — сколько строк тела помещается на экране. */
export function pickSize(message: string, rows: number, columns = 120): { size: DialogSize; bodyRows: number; scrolls: boolean } {
  const lines = String(message ?? "").split("\n")
  const widest = Math.max(0, ...lines.map(cellWidth))
  let size: DialogSize
  if (widest > TEXT_WIDTH.large && columns >= 100) size = "xlarge" // таблицы и длинные строки: широкое окно
  else if (widest <= TEXT_WIDTH.medium && wrappedRows(lines, TEXT_WIDTH.medium) <= 12) size = "medium" // строка шире среднего окна не переносится
  else if (wrappedRows(lines, TEXT_WIDTH.large) <= rows) size = "large"
  else size = "xlarge"
  const need = wrappedRows(lines, TEXT_WIDTH[size])
  return { size, bodyRows: Math.min(rows, need), scrolls: need > rows }
}
