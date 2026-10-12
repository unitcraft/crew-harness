// АСИНХРОННЫЙ GIT И ПРЕДЕЛ ВРЕМЕНИ ШАГА (задача 034). Плагин живёт в процессе службы OpenCode: синхронный execFileSync в шаге
// прохода останавливает цикл событий службы на всё время ожидания диска и процессора (журнал 2026-10-12: «loop lag 36878 ms,
// шаг leftWatch»), и окна считают службу мёртвой. Здесь — запуск git без блокировки, с пределом времени и не более
// GIT_CONCURRENCY одновременных процессов на плагин, и помощник цикла по задачам с пределом времени шага.
import { execFile } from "node:child_process"

export const GIT_CONCURRENCY = 2
export const GIT_TIMEOUT_MS = 8_000
export const STEP_BUDGET_MS = 5_000

let active = 0
const waiting: (() => void)[] = []
/** peak — наибольшее число одновременно идущих процессов (для проверки семафора). */
export const gitqStats = { peak: 0, started: 0 }

const acquire = () =>
  new Promise<void>((res) => {
    const go = () => {
      active++
      gitqStats.peak = Math.max(gitqStats.peak, active)
      res()
    }
    if (active < GIT_CONCURRENCY) go()
    else waiting.push(go)
  })
const release = () => {
  active--
  waiting.shift()?.()
}

/** Любая команда через ту же очередь: предел времени (процесс убивается), без блокировки цикла. */
export async function execQueued(file: string, args: string[], timeout = GIT_TIMEOUT_MS): Promise<string> {
  await acquire()
  gitqStats.started++
  try {
    return await new Promise<string>((res, rej) =>
      execFile(file, args, { encoding: "utf8", windowsHide: true, timeout, killSignal: "SIGKILL", maxBuffer: 32 * 1024 * 1024 }, (e, out) => (e ? rej(e) : res(String(out)))),
    )
  } finally {
    release()
  }
}

export const gitAsync = (cwd: string, args: string[], timeout = GIT_TIMEOUT_MS) => execQueued("git", ["-C", cwd, ...args], timeout)

/** Включено службой: устаревшие кеши (настройки, файл приёмки) отдаются сразу и обновляются в фоне. */
export const background = { on: false }

const pause = () => new Promise<void>((r) => setTimeout(r, 0))
const cursors = new Map<string, number>()

/**
 * Цикл по задачам/карточкам с пределом времени шага. Израсходовано больше budgetMs — цикл останавливается между элементами,
 * в журнал одна строка, а следующий проход продолжает с того же места (курсор по имени шага). Между элементами цикл
 * событий получает слово. Возвращает true, если дошли до конца.
 */
export async function forEachBudget<T>(name: string, items: T[], fn: (x: T, i: number) => Promise<void> | void, log: (s: string) => void, budgetMs = STEP_BUDGET_MS, now = () => Date.now()): Promise<boolean> {
  const t0 = now()
  const from = Math.min(cursors.get(name) ?? 0, items.length)
  for (let i = from; i < items.length; i++) {
    if (now() - t0 > budgetMs) {
      cursors.set(name, i)
      log(`step ${name} yielded after ${now() - t0} ms (done ${i - from} of ${items.length - from})`)
      return false
    }
    await fn(items[i], i)
    await pause()
  }
  cursors.delete(name)
  return true
}

/**
 * Предел времени для циклов, у которых места остановки запоминать не нужно (сделанное само выпадает из выборки на следующем
 * проходе): `if (await bud.stop(i, total)) break` в начале витка. Уступает циклу событий; истёк предел — одна строка в журнал.
 */
export function stepBudget(name: string, log: (s: string) => void, budgetMs = STEP_BUDGET_MS, now = () => Date.now()) {
  const t0 = now()
  return {
    async stop(done: number, total: number): Promise<boolean> {
      if (now() - t0 > budgetMs) {
        log(`step ${name} yielded after ${now() - t0} ms (done ${done} of ${total})`)
        return true
      }
      await pause()
      return false
    },
  }
}
