/** @jsxImportSource @opentui/solid */
// БЛОК «Ход работ» В БОКОВОЙ ПАНЕЛИ ОКНА (задача 004, 2026-10-08). Слот sidebar.content, сразу после блока «Crew» (sidebar.tsx):
// фоновые сессии методики не вкладки, их ход берётся из `progress.log` всех рабочих деревьев репозитория вкладки. Строки строит
// progress-view.ts (под самотестом), раз в 2 с; обход файлов он делает не чаще раза в 5 с. Подключается из tui.ts отдельной
// цепочкой import() с защитой: блок «Crew» его сбой не касается, а ошибка в этом файле не мешает «Crew». Сам progress-view.ts
// подгружается отсюда через import() в try/catch: не загрузился — блок пуст, окно живо.
import { createSignal, For, onCleanup } from "solid-js"
import { cardFile, readJson } from "./core.ts"
import { str } from "./dialog-size.ts"

const EVERY_MS = 2_000

type Row = { text: string; tone: string }

function ProgressBlock(props: { api: any; sessionID?: string }) {
  let view: any
  const read = (): Row[] => {
    try {
      if (!view) return []
      const dir = props.sessionID ? readJson<any>(cardFile(props.sessionID))?.directory : undefined
      return view.progressPanel(dir)
    } catch {
      return []
    }
  }
  const [rows, setRows] = createSignal<Row[]>([])
  import("./progress-view.ts")
    .then((m) => {
      view = m
      setRows(read())
    })
    .catch(() => {})
  const timer = setInterval(() => setRows(read()), EVERY_MS)
  onCleanup(() => clearInterval(timer))
  const color = (tone: string) => {
    const t = props.api?.theme?.text ?? {}
    return tone === "accent" ? (t.accent ?? t.primary ?? t.base) : tone === "muted" ? t.muted : t.base
  }
  return (
    <box flexDirection="column">
      {rows().length ? (
        <box flexDirection="column" marginTop={1}>
          <For each={rows()}>{(r) => <text fg={color(r.tone)}>{str(r.text)}</text>}</For>
        </box>
      ) : null}
    </box>
  )
}

export function mountProgress(api: any) {
  api.ui.slot({ append: "sidebar.content", render: (p: any) => <ProgressBlock api={api} sessionID={p?.sessionID} /> })
}
