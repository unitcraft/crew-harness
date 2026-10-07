# Возможности CLI агентов на подписке — сводка исполнителя (2026-10-07, по сторонним обзорам; официально НЕ сверено)

| Агент | Подписка | Без окна | MCP | Хуки | ACP |
|---|---|---|---|---|---|
| Claude Code | Pro/Max, только официальный бинарник | `claude -p`, фоновые `claude --bg` + `claude agents` | да | да | адаптер |
| Codex CLI (OpenAI) | план ChatGPT | `codex exec` | да; сам может быть MCP-сервером | да (с начала 2026) | адаптер |
| Kimi Code CLI (Moonshot) | Kimi Code (от $19/мес) | headless-режим | да | да | да (`kimi acp`) |
| GLM Coding Plan (Z.ai) | своя; работает в 20+ оболочках, в т.ч. Claude Code и OpenCode | через оболочку | через оболочку | через оболочку | — |
| Gemini CLI | Google | headless | да | — | да |

Agent Orchestrator (ComposioHQ, Apache-2.0): десктоп + демон, Windows, 30+ агентов (Claude Code, Codex, Kimi, Gemini
CLI, OpenCode, Qwen, DeepSeek…), каждому дерево и ветка, канбан Working / Needs You / In Review / Ready to Merge;
возможности агентов в нём разные (каталог возможностей); приёмщика, замка вливания и очереди машины нет.

Источники: codex.danielvaughan.com (обзоры Codex CLI 2026), kimi.com/code/docs, github.com/MoonshotAI/kimi-code,
flaviocopes.com/zcode, eesel.ai (ZCode), agentclientprotocol.com, github.com/ComposioHQ/agent-orchestrator.
