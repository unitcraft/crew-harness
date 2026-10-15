// САМОВОССТАНОВЛЕНИЕ ЗАВИСШЕГО ХОДА (задача 048; владелец, 2026-10-15: «я не хочу это делать вручную, если это требуется
// обязательно делать, автоматизируй»). Ход, который задача 036 признала зависшим (core.ts hungTurn), плагин прерывает сам —
// ctx.session.interrupt({sessionID, resume: true}), тот же вызов, что делает окно по Esc, — и будит вкладку письмом «продолжай».
// Пределы: одна попытка на зависание (время последней активности модели), не больше RESUME_PER_HOUR попыток на сессию за час.
// Неуспех (interrupt нет, бросил, ответил interrupted=false; ход снова завис после попытки; предел) — прежнее уведомление
// владельцу «нажмите Esc…». Решение — чистая функция resumeVerdict: её проверяет test/crew-hung-resume.test.mjs.
import { hhmm } from "./core.ts"

export const RESUME_PER_HOUR = 2
export const RESUME_WINDOW_MS = 60 * 60_000
/** Сколько ждать после успешной попытки, пока ход того же зависания не сдвинется: потом — владельцу. */
export const RESUME_GRACE_MS = Number(process.env.CREW_HARNESS_RESUME_GRACE_MS) || 5 * 60_000
/** Предел ожидания ответа interrupt: зависший вызов не держит проход сводки. */
const INTERRUPT_MS = Number(process.env.CREW_HARNESS_STEP_MS) || 30_000

/** Попытка: зависание (since — время последней активности модели), когда пробовали, удалась ли. */
export type ResumeTry = { since: number; at: number; ok: boolean }
export type ResumeVerdict = { act: "try" } | { act: "wait" } | { act: "owner"; why: string }

/** Что делать с зависшим ходом: пробовать, ждать итога попытки или сказать владельцу (и почему). */
export function resumeVerdict(tries: ResumeTry[], since: number, now: number, can: boolean): ResumeVerdict {
  if (!can) return { act: "owner", why: "no session.interrupt in this OpenCode" }
  const same = tries.find((x) => x.since === since)
  if (same) {
    if (!same.ok) return { act: "owner", why: "the try for this hang failed" }
    return now - same.at < RESUME_GRACE_MS ? { act: "wait" } : { act: "owner", why: `still hung ${Math.round((now - same.at) / 60_000)} min after the try` }
  }
  const recent = tries.filter((x) => now - x.at < RESUME_WINDOW_MS)
  if (recent.length >= RESUME_PER_HOUR) return { act: "owner", why: `${recent.length} tries in an hour, the limit is ${RESUME_PER_HOUR}` }
  return { act: "try" }
}

/** Письмо вкладке после прерывания (по-русски, как остальные служебные письма). */
export const resumeLetter = (at: number) => `Ход завис и прерван плагином в ${hhmm(at)}; продолжай с того места, где остановился.`

/** Запись в истории задачи об успешном самовосстановлении. */
export const resumeNote = (since: number, at: number) => `ход завис с ${hhmm(since)}; плагин прервал его в ${hhmm(at)} и попросил продолжить`

/** Есть ли у плагина способ прервать ход (проба при загрузке и crew_doctor). */
export const canInterrupt = (session: any) => typeof session?.interrupt === "function"

/** Прервать ход сессии. ok — сервер ответил interrupted=true (прервано выполнение, принадлежащее этому процессу OpenCode). */
export async function interruptTurn(session: any, sessionID: string, ms = INTERRUPT_MS): Promise<{ ok: boolean; why?: string }> {
  if (!canInterrupt(session)) return { ok: false, why: "no session.interrupt" }
  let timer: any
  try {
    const r: any = await Promise.race([
      session.interrupt({ sessionID, resume: true }),
      new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`no answer in ${Math.round(ms / 1000)} s`)), ms))),
    ])
    const interrupted = r?.interrupted ?? r?.data?.interrupted
    return interrupted === true ? { ok: true } : { ok: false, why: `interrupted=${String(interrupted)}` }
  } catch (e) {
    return { ok: false, why: `interrupt failed: ${String(e).slice(0, 200)}` }
  } finally {
    clearTimeout(timer)
  }
}
