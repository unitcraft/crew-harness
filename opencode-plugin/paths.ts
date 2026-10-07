// ПАПКА ПЛАГИНА. Ящик — <данные OpenCode>/crew-harness: письма, карточки, задачи, наблюдения, состояние. Прежние
// имена: opencode-peers (до плана 014, 2026-10-06), nova-peers (до 2026-10-05). Новое имя — ссылка-junction на настоящую
// папку прежнего ящика: данные не двигаются, ничего не раздваивается. Модуль без зависимостей: его импортируют core,
// tasks, watch, status, settings.

import { existsSync, realpathSync, symlinkSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME
  return xdg ? path.join(xdg, "opencode") : path.join(os.homedir(), ".local", "share", "opencode")
}

export const CREW_DIR = "crew-harness"
/** прежние имена ящика, от новых к старым: opencode-peers (до 2026-10-06, план 014), nova-peers (до 2026-10-05) */
export const LEGACY_DIRS = ["opencode-peers", "nova-peers"]

/**
 * Ящик плагина. Есть прежний (opencode-peers или nova-peers; любой может быть ссылкой) — новое имя становится
 * ссылкой-junction на его настоящую папку: данные не двигаются (Windows не переименует папку, файлы которой держат
 * окна и MCP-процессы), прежние процессы и новый код работают с одними файлами.
 */
export function crewBase(root = dataDir()): string {
  const neu = path.join(root, CREW_DIR)
  if (existsSync(neu)) return neu
  for (const name of LEGACY_DIRS) {
    const old = path.join(root, name)
    if (!existsSync(old)) continue
    try {
      symlinkSync(realpathSync(old), neu, "junction")
      return neu
    } catch {
      return old
    }
  }
  return neu // прежнего ящика нет: новая установка
}

export const BASE = crewBase()
