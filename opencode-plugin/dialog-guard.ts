// ОКНО ПЛАГИНА НЕ ОСТАЁТСЯ ОТКРЫТЫМ, КОГДА ЕГО КЛАВИШИ ЗАБРАЛ ДРУГОЙ РЕЖИМ (задача 069). Источник: владелец открыл окно плагина
// (/crew-sets use ...), под ним пришёл вопрос встроенного вопросника, Esc «закрыть окно» отменил вопрос («The user dismissed this
// question»), вкладка осталась без ответа.
//
// ПОЧЕМУ ТАК (проверено по коду сборки OpenCode 2.0.26, подробности — doc/tasks/069-esc-keeps-question/analysis.md). Клавиша идёт ОДНОМУ
// обработчику — слою текущего режима клавиатуры, а режим — последняя включённая запись стека режимов (api.keymap.mode). Стек диалогов
// кладёт режим «modal», когда в нём появляется первый диалог; вопросник («форма») кладёт режим «form», когда рисуется. Вопрос, который
// был открыт ДО окна, лежит ниже «modal»: Esc закрывает только окно. Вопрос, пришедший ПОСЛЕ окна, ложится выше: клавиши окна (Esc, Enter,
// стрелки) до окна не доходят, Esc отменяет вопрос, Enter отвечает на него первым вариантом, а закрыть окно нечем, пока вопроса нет.
// Поглотить клавишу слоем плагина нельзя без вреда: Enter и стрелки окна тоже пришлось бы забирать у вопроса, а окно OpenCode
// (выбор, ввод) устроено на режиме «modal». Вернуть «modal» наверх (api.keymap.mode.push) тоже плохо: форма от смены режима снимает
// фокус со своего поля ввода, а окно его не получает назад.
//
// ПОЭТОМУ окно, которому режим «modal» не принадлежит, закрывается: вопрос остаётся открытым и виден, владелец получает уведомление,
// команду можно открыть заново (тогда окно ляжет поверх вопроса — безопасный порядок). Охраняются ВСЕ окна плагина разом: alert,
// confirm, prompt, select и show в API окна идут через show() его же объекта, его и подменяет installDialogGuard. Чужие окна OpenCode
// (палитра, выбор модели) плагин не охраняет и не закрывает.
const MODAL = "modal"

/** The look of the guard and the time the stack of dialogs needs to push its own mode after show() (env: for self-tests). */
export const GUARD_MS = Number(process.env.CREW_HARNESS_DIALOG_GUARD_MS) || 50
export const GRACE_MS = Number(process.env.CREW_HARNESS_DIALOG_GRACE_MS) || 300

export const HIJACK_NOTICE = {
  title: "crew-harness",
  message: "Вопрос забрал клавиши у окна — окно закрыто, чтобы Esc не отменил вопрос. Ответьте на вопрос; команду можно открыть заново.",
}

/** Guard the dialogs the plugin opens through `api.ui.dialog`. Returns the function that switches the guard off. */
export function installDialogGuard(api: any, say: (line: string) => void = () => {}): () => void {
  const dialog = api?.ui?.dialog
  const modeOf = (): string | undefined => {
    try {
      const m = api?.keymap?.mode?.current?.()
      return typeof m === "string" ? m : undefined
    } catch {
      return undefined
    }
  }
  // an older build without modes, or without show(): nothing to guard with, the windows stay as they were
  if (typeof dialog?.show !== "function" || typeof dialog?.clear !== "function" || modeOf() === undefined) return () => {}
  const show = dialog.show
  let token = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    if (timer) clearInterval(timer)
    timer = undefined
  }
  const watch = (mine: number) => {
    stop()
    const since = Date.now()
    timer = setInterval(() => {
      if (mine !== token) return stop()
      const mode = modeOf()
      if (mode === undefined || mode === MODAL || Date.now() - since < GRACE_MS) return
      stop()
      token++ // the window is closed on purpose: its onClose must not be taken for a newer window's
      say(`a window of the plugin is closed: the keys went to the mode "${mode}" (a question arrived under the window)`)
      try {
        dialog.clear()
      } catch {}
      try {
        api.ui?.toast?.show?.({ ...HIJACK_NOTICE, variant: "info", duration: 8_000 })
      } catch {}
    }, GUARD_MS)
    timer.unref?.()
  }
  const guarded = function (this: any, render: any, onClose?: () => void) {
    const mine = ++token
    watch(mine)
    // a newer show() replaces this window and calls its onClose: only the close of the newest window stops the guard
    const closed = () => {
      if (mine === token) stop()
      onClose?.()
    }
    try {
      return show.call(this ?? dialog, render, closed)
    } catch (e) {
      stop()
      throw e
    }
  }
  try {
    dialog.show = guarded
  } catch (e) {
    say(`the dialog API does not allow the guard: ${String(e).slice(0, 120)}`)
    return () => {}
  }
  return () => {
    stop()
    token++
    try {
      dialog.show = show
    } catch {}
  }
}
