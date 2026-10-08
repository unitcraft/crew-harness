/** @jsxImportSource @opentui/solid */
// ДИАЛОГ С ДЛИННЫМ ТЕКСТОМ (правка 004, 2026-10-08). api.ui.dialog.alert в OpenCode 2.0.23 всегда средней ширины, прижат к верху и
// не прокручивается: длинная сводка тянется до низа окна, сверху пусто, продолжение не видно. Здесь свой диалог через
// api.ui.dialog.show(render, onClose): размер xlarge и по центру (api.ui.dialog.set), текст в прокручиваемом блоке (колесо мыши и
// клавиши), под ним строка «ещё N строк». Подключается из tui.ts через import() с защитой: не загрузился (другая версия, тест
// под Node) — остаётся обычный alert.
import { createSignal, onMount } from "solid-js"

function TextDialog(props: { api: any; title: string; message: string; done: () => void }) {
  const lines = props.message.split("\n")
  // высота текста: окно минус рамка, заголовок, подсказка и отступы
  const rows = Math.max(8, (process.stdout.rows || 30) - 10)
  const scrolls = lines.length > rows
  let box: any
  const [more, setMore] = createSignal(Math.max(0, lines.length - rows))
  const refresh = () => {
    try {
      setMore(Math.max(0, lines.length - rows - Math.round(box?.scrollTop ?? 0)))
    } catch {}
  }
  const scroll = (by: number) => () => {
    try {
      box?.scrollBy?.(by)
    } catch {}
    refresh()
  }
  onMount(() => {
    try {
      props.api.ui.dialog.set({ size: "xlarge", centered: true })
    } catch {}
  })
  try {
    props.api.keymap.layer(() => ({
      mode: "modal",
      commands: [
        { bind: "return", title: "Close", group: "Dialog", run: () => (props.done(), props.api.ui.dialog.clear()) },
        ...(scrolls
          ? [
              { bind: "down", title: "Scroll down", group: "Dialog", run: scroll(1) },
              { bind: "up", title: "Scroll up", group: "Dialog", run: scroll(-1) },
              { bind: "pagedown", title: "Scroll page down", group: "Dialog", run: scroll(rows - 1) },
              { bind: "pageup", title: "Scroll page up", group: "Dialog", run: scroll(-(rows - 1)) },
            ]
          : []),
      ],
    }))
  } catch {}
  const t = props.api?.theme?.text ?? {}
  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={t.base}>{props.title}</text>
        <text fg={t.muted}>esc</text>
      </box>
      <scrollbox ref={(el: any) => (box = el)} maxHeight={rows} scrollbarOptions={{ visible: false }}>
        <text fg={t.base} wrapMode="word">
          {props.message}
        </text>
      </scrollbox>
      <text fg={t.muted}>{scrolls ? (more() > 0 ? `ещё ${more()} строк · ↑↓ PgUp PgDn или колесо мыши — прокрутка` : "конец · ↑↓ PgUp PgDn — прокрутка") : "enter — закрыть"}</text>
    </box>
  )
}

/** Показать текст в широком диалоге; обещание выполняется, когда диалог закрыт. */
export function showTextDialog(api: any, o: { title: string; message: string }): Promise<void> {
  return new Promise((resolve) => {
    let finished = false
    const done = () => {
      if (!finished) {
        finished = true
        resolve()
      }
    }
    api.ui.dialog.show(() => <TextDialog api={api} title={o.title} message={o.message} done={done} />, done)
  })
}
