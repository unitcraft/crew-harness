// ПАПКА ПЛАГИНА (2026-10-06). Ящик плагина — <данные OpenCode>/opencode-peers: письма, карточки, задачи, наблюдения,
// состояние. Прежнее имя — nova-peers (плагин родился в nv-lang под этим именем; после выноса имя папки оставили, чтобы
// не потерять накопленное). Владелец: «почему nova-peers?» — переносим.
//
// Перенос делает первый процесс нового кода: nova-peers переименовывается в opencode-peers, на старом месте остаётся
// ссылка-junction nova-peers → opencode-peers, и процессы старого кода (открытые окна, внешние проверки по старому пути)
// попадают в ту же папку — ничего не раздваивается. Не вышло (кто-то держит файлы папки) — работаем со старой папкой,
// попытка — при следующем запуске. Модуль без зависимостей: его импортируют core, tasks, watch, status, settings.

import { existsSync, lstatSync, renameSync, symlinkSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME
  return xdg ? path.join(xdg, "opencode") : path.join(os.homedir(), ".local", "share", "opencode")
}

export const PEERS_DIR = "opencode-peers"
export const LEGACY_DIR = "nova-peers"

/** Ящик плагина; при первом обращении нового кода переносит прежнюю папку nova-peers. */
export function peersBase(root = dataDir()): string {
  const neu = path.join(root, PEERS_DIR)
  const old = path.join(root, LEGACY_DIR)
  if (existsSync(neu)) return neu
  let real = false
  try {
    real = lstatSync(old).isDirectory() // junction — не isDirectory у lstat
  } catch {}
  if (!real) return neu // прежней папки нет: новая установка
  try {
    renameSync(old, neu)
  } catch {
    return old // папку держат — работаем со старой, перенос при следующем запуске
  }
  try {
    symlinkSync(neu, old, "junction")
  } catch {} // без ссылки старый код начнёт новую nova-peers — заметно в журнале; новый код её не читает
  return neu
}

export const BASE = peersBase()
