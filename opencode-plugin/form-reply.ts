// ЗАВЕРШЕНИЕ ВОПРОСНИКА ЧЕРЕЗ ШТАТНЫЙ API СЛУЖБЫ (задача 263; инцидент 258, 2026-10-30). OpenCode 2.0.26:
// POST /api/session/{sessionID}/form/{formID}/reply (Form.Reply {answer: {q0: «вариант или свой текст»}}) завершает
// именно ожидающий вызов `question` — модель получает ответ как результат инструмента и ход продолжается сам, без
// прерывания и обходного письма. Однократность гарантирует сервер: повтор — 409 FormAlreadySettledError; формы нет —
// 404 FormNotFoundError; ответ не подошёл — 400 FormInvalidAnswerError. Локация роута — из сессии, каталог вызывающего
// не нужен (packages/server/src/middleware/form-location.ts @ 2.0.26). Поле ключа вопроса — `q0`[，`q1`…], значение —
// подпись варианта (packages/core/src/tool/plugin/question.ts @ 2.0.26: toField, custom: true — свой текст допустим).
// Доступ — как у CLI `opencode api`: регистрация службы <state>/opencode/service.json (url, password), Basic
// «opencode:<password>» (документация v2, раздел Service; проверено на живой службе 2026-10-30: без пароля — 401).
// Пароль не журналируется и никуда не передаётся, кроме заголовка запроса к своей же службе на 127.0.0.1.
import os from "node:os"
import path from "node:path"
import { readJson } from "./core.ts"

export type ReplyResult = { ok: true } | { ok: false; why: string; settled?: boolean; missing?: boolean; unknown?: boolean }

type ServiceReg = { url?: string; password?: string; version?: string; pid?: number }

/** Папка состояния OpenCode: $XDG_STATE_HOME/opencode, иначе ~/.local/state/opencode (как у CLI). */
const stateDir = () => path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "opencode")

/** Регистрация живой службы (как у CLI): service.json с url и password. Нет файла или полей — undefined. */
export function serviceReg(file = path.join(stateDir(), "service.json")): { url: string; password: string } | undefined {
  const r = readJson<ServiceReg>(file)
  return r?.url && r?.password ? { url: String(r.url), password: String(r.password) } : undefined
}

export const REPLY_TIMEOUT_MS = Number(process.env.CREW_HARNESS_REPLY_MS) || 30_000

/**
 * Ответить на ожидающую форму вопросника. ok — 204 (вызов question завершён этим ответом); settled — 409 (форма уже
 * закрыта: ответил владелец в окне или наш прежний вызов — повтор безопасен); missing — 404 (формы нет); иначе — why.
 */
export async function replyForm(session: string, formId: string, answer: string, reg: { url: string; password: string } | undefined = serviceReg(), f: typeof fetch = fetch): Promise<ReplyResult> {
  if (!reg) return { ok: false, why: "служба не зарегистрирована (нет service.json)" }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REPLY_TIMEOUT_MS)
  try {
    const r = await f(`${reg.url}/api/session/${encodeURIComponent(session)}/form/${encodeURIComponent(formId)}/reply`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`opencode:${reg.password}`).toString("base64")}`, "content-type": "application/json" },
      body: JSON.stringify({ answer: { q0: answer } }),
      signal: ctrl.signal,
    })
    if (r.status === 204) return { ok: true }
    const text = (await r.text().catch(() => "")).slice(0, 300)
    if (r.status === 409) return { ok: false, why: "already answered (the form is settled)", settled: true }
    if (r.status === 404) return { ok: false, why: `form not found: ${text}`, missing: true }
    return { ok: false, why: `HTTP ${r.status}: ${text}`, ...(r.status >= 500 ? { unknown: true } : {}) }
  } catch (e) {
    return { ok: false, why: `reply outcome unknown: ${String(e).slice(0, 200)}`, unknown: true }
  } finally {
    clearTimeout(timer)
  }
}
