/** @jsxImportSource @opentui/solid */
// БЛОК «Crew» В БОКОВОЙ ПАНЕЛИ ОКНА (план 003.2, 2026-10-06). Слот sidebar.content — тот же, куда OpenCode 2.0.23 выводит
// «Context» и «MCP»; JSX плагина окна OpenCode компилирует сам (Solid + opentui) и даёт свой рантайм. Строки — из
// status/ (их пишет плагин сервиса), раз в 2 с; логика строк — status.ts sidebarLines (под тестом). Подключается из
// tui.ts через import() с защитой: не заработало — блока нет, остальное в окне работает.
import { createSignal, For, onCleanup } from "solid-js"
import { readStatuses, sideText, sidebarLines } from "./status.ts"
import { str } from "./dialog-size.ts"

const EVERY_MS = 2_000

function CrewBlock(props: { api: any; sessionID?: string }) {
  const read = () => {
    try {
      const list = readStatuses()
      const project = list.find((s) => s.session === props.sessionID)?.project ?? list[0]?.project
      return sidebarLines(list, Date.now(), project)
    } catch {
      return { title: "Crew", rows: [], foot: "" }
    }
  }
  const [view, setView] = createSignal(read())
  const timer = setInterval(() => setView(read()), EVERY_MS)
  onCleanup(() => clearInterval(timer))
  const color = (tone: string) => {
    const t = props.api?.theme?.text ?? {}
    return tone === "accent" ? (t.accent ?? t.primary ?? t.base) : tone === "muted" ? t.muted : t.base
  }
  return (
    <box flexDirection="column" marginTop={1}>
      <text fg={color("base")}>{str(view().title)}</text>
      <For each={view().rows}>{(r) => <text fg={color(r.tone)}>{str(sideText(r))}</text>}</For>
      <text fg={color("muted")}>{str(view().foot)}</text>
    </box>
  )
}

export function mountSidebar(api: any) {
  api.ui.slot({ append: "sidebar.content", render: (p: any) => <CrewBlock api={api} sessionID={p?.sessionID} /> })
}
