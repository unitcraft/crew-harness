// request-ui.js — вкладка «Запрос» правой колонки (задача 192.11): состав запроса к агенту по ходам.
// Рисует только то, что дал request.js. Текст — через textContent. Раскрытие карточек и выбор хода живут в памяти страницы (сессия|ход|карточка).

import { t } from './strings.js';
import { h, icon } from './dom.js';
import {
  pickRequest, traceRange, requestJson, firstLine, REQUEST_KEEP,
} from './request.js';

const KIND_TEXT = Object.freeze({
  hub_note: 'req.kind_hub_note',
  mode_instruction: 'req.kind_mode_instruction',
  reminder: 'req.kind_reminder',
  task_list: 'req.kind_task_list',
  owner_message: 'req.kind_owner_message',
  images: 'req.kind_images',
  tool_result_hint: 'req.kind_tool_result_hint',
  other: 'req.kind_other',
});

/**
 * @param doc
 * @param deps { onCopy(text), onGet(trace, turn), fetchTrace(trace, from, to) -> Promise<{lines, error?}>, rerender() }
 */
export function createRequestPanel(doc, deps) {
  const { onCopy, onGet, rerender } = deps;
  const picked = new Map(); // сессия -> номер хода (0 — последний)
  const opened = new Set(); // «сессия|ход|карточка»
  const traces = new Map(); // «сессия|ход» -> { state: 'loading'|'ok'|'error', lines, why }
  let rev = 0;
  const changed = () => { rev += 1; rerender(); };

  function toggle(key) {
    if (opened.has(key)) opened.delete(key); else opened.add(key);
    changed();
  }

  function copyButton(text) {
    const b = h(doc, 'button', { type: 'button', class: 'link-btn req-copy', text: t('req.copy') });
    b.addEventListener('click', () => onCopy(text));
    return b;
  }

  function foldHead(key, label, side) {
    const on = opened.has(key);
    const head = h(doc, 'button', { type: 'button', class: 'req-head', 'aria-expanded': String(on), 'data-key': key },
      icon(doc, 'i-chevron-down', 'chev'),
      h(doc, 'span', { class: 'req-label', text: label }),
      side ? h(doc, 'span', { class: 'req-side muted', text: side }) : false);
    head.addEventListener('click', () => toggle(key));
    return head;
  }

  // ---- ходы ----

  function turnChips(session, list, current) {
    const chips = list.map((r) => {
      const b = h(doc, 'button', { type: 'button', class: 'req-chip', 'aria-pressed': String(r.turn === current.turn), 'data-turn': r.turn, text: t('req.turn_chip', { n: r.turn }) });
      b.addEventListener('click', () => { picked.set(session.id, r === list[list.length - 1] ? 0 : r.turn); changed(); });
      return b;
    });
    return h(doc, 'div', { class: 'req-turns', role: 'group', 'aria-label': t('req.turns', { n: REQUEST_KEEP }) }, ...chips);
  }

  // ---- части ----

  function partCard(session, req, part, index) {
    const key = `${session.id}|${req.turn}|part${index}`;
    const box = h(doc, 'li', { class: 'req-part', 'data-kind': part.kind },
      foldHead(key, part.title && part.title !== t(KIND_TEXT[part.kind]) ? `${t(KIND_TEXT[part.kind])}: ${part.title}` : t(KIND_TEXT[part.kind]), t('req.chars', { chars: part.chars, tokens: part.tokens })));
    if (opened.has(key)) {
      box.append(h(doc, 'pre', { class: 'req-text mono', text: part.text }));
      if (part.truncated) box.append(h(doc, 'p', { class: 'muted req-note', text: t('req.truncated') }));
      box.append(copyButton(part.text));
    }
    return box;
  }

  function partsCard(session, list, req) {
    const head = h(doc, 'div', { class: 'req-summary' },
      h(doc, 'span', { class: 'req-sum', text: t('req.summary', { n: req.parts.length, tokens: req.totalTokens }) }),
      req.label ? h(doc, 'span', { class: 'muted req-turn-label', text: req.label }) : false);
    const all = copyButton(requestJson(req));
    all.textContent = t('req.copy_all');
    return h(doc, 'section', { class: 'card req-card', 'data-turn': req.turn },
      h(doc, 'h3', { class: 'card-title', text: t('req.title') }),
      h(doc, 'p', { class: 'muted req-border', text: t('req.border') }),
      turnChips(session, list, req),
      head,
      req.parts.length === 0 ? h(doc, 'p', { class: 'muted', text: t('req.no_parts') }) : h(doc, 'ul', { class: 'req-list' }, ...req.parts.map((p, i) => partCard(session, req, p, i))),
      all);
  }

  // ---- инструменты ----

  function hubToolRow(session, req, tool) {
    const key = `${session.id}|${req.turn}|tool:${tool.name}`;
    const box = h(doc, 'li', { class: 'req-tool' }, foldHead(key, tool.name, firstLine(tool.description, 50)));
    if (opened.has(key)) {
      box.append(h(doc, 'p', { class: 'req-desc', text: tool.description }));
      box.append(h(doc, 'h5', { class: 'mach-sub', text: t('req.schema') }));
      box.append(h(doc, 'pre', { class: 'req-text mono', text: tool.schema }));
      box.append(copyButton(tool.schema));
    }
    return box;
  }

  function toolsCard(session, req) {
    return h(doc, 'section', { class: 'card req-card req-tools' },
      h(doc, 'h3', { class: 'card-title', text: t('req.tools') }),
      h(doc, 'h4', { class: 'mach-sub', text: t('req.tools_hub') }),
      req.hubTools.length === 0 ? h(doc, 'p', { class: 'muted', text: t('req.tools_hub_none') }) : h(doc, 'ul', { class: 'req-list' }, ...req.hubTools.map((x) => hubToolRow(session, req, x))),
      h(doc, 'h4', { class: 'mach-sub', text: t('req.tools_agent') }),
      req.agentTools.length === 0 ? h(doc, 'p', { class: 'muted', text: t('req.tools_agent_none') })
        : h(doc, 'ul', { class: 'req-list req-agent-tools' }, ...req.agentTools.map((x) => h(doc, 'li', { class: 'req-agent-tool' },
          h(doc, 'span', { class: 'req-label', text: x.name }), h(doc, 'span', { class: 'muted req-side', text: [x.kind, x.title].filter(Boolean).join(' · ') })))),
      h(doc, 'h4', { class: 'mach-sub', text: t('req.commands') }),
      req.commands.length === 0 ? h(doc, 'p', { class: 'muted', text: t('req.commands_none') })
        : h(doc, 'ul', { class: 'req-list req-commands' }, ...req.commands.map((c) => h(doc, 'li', { class: 'req-command mono', text: c }))));
  }

  // ---- параметры ----

  function paramsCard(req) {
    const row = (label, value) => [h(doc, 'dt', { text: label }), h(doc, 'dd', { text: value || t('req.none') })];
    const mcp = req.mcp.map((m) => `${m.name}: ${m.urlKind}`).join('; ');
    return h(doc, 'section', { class: 'card req-card req-params' },
      h(doc, 'h3', { class: 'card-title', text: t('req.params') }),
      h(doc, 'dl', { class: 'env' },
        ...row(t('req.p_agent'), req.agent), ...row(t('req.p_mode'), req.mode), ...row(t('req.p_route'), req.route), ...row(t('req.p_model'), req.model),
        ...row(t('req.p_effort'), req.effort), ...row(t('req.p_cwd'), req.cwd), ...row(t('req.p_mcp'), mcp)));
  }

  // ---- сырой обмен ----

  function rawCard(session, list, req) {
    const range = traceRange(req, list);
    const key = `${session.id}|${req.turn}`;
    const got = traces.get(key);
    const body = [];
    if (!range) {
      body.push(h(doc, 'p', { class: 'muted', text: t('req.raw_off') }));
    } else {
      const label = got && got.state === 'ok' ? t('req.raw_hide') : t('req.raw_show', { from: range.from, to: range.to, file: req.raw.file });
      const b = h(doc, 'button', { type: 'button', class: 'link-btn req-raw-btn', text: label });
      b.addEventListener('click', () => {
        if (got && got.state === 'ok') { traces.delete(key); changed(); return; }
        traces.set(key, { state: 'loading', lines: [], why: '' });
        changed();
        Promise.resolve(deps.fetchTrace(session.id, range.from, range.to)).then((data) => {
          if (data && Array.isArray(data.lines)) traces.set(key, { state: 'ok', lines: data.lines, why: '' });
          else traces.set(key, { state: 'error', lines: [], why: data && data.error ? String(data.error) : '?' });
          changed();
        }).catch((e) => { traces.set(key, { state: 'error', lines: [], why: String(e && e.message ? e.message : e) }); changed(); });
      });
      body.push(b);
      if (got && got.state === 'loading') body.push(h(doc, 'p', { class: 'muted', text: t('req.raw_loading') }));
      if (got && got.state === 'error') body.push(h(doc, 'p', { class: 'muted req-raw-error', text: t('req.raw_error', { why: got.why }) }));
      if (got && got.state === 'ok') {
        const text = got.lines.map((l) => `${l.n} ${l.dir}: ${l.line}`).join('\n');
        body.push(h(doc, 'pre', { class: 'req-text mono req-raw', text }));
        body.push(h(doc, 'p', { class: 'muted req-note', text: t('req.raw_note', { n: got.lines.length }) }));
        body.push(copyButton(text));
      }
    }
    return h(doc, 'section', { class: 'card req-card req-rawcard' }, h(doc, 'h3', { class: 'card-title', text: t('req.raw') }), ...body);
  }

  function emptyCard(session) {
    const ask = h(doc, 'button', { type: 'button', class: 'link-btn req-ask', text: t('req.ask') });
    ask.addEventListener('click', () => onGet(session.id, 0));
    return h(doc, 'section', { class: 'card req-card' },
      h(doc, 'h3', { class: 'card-title', text: t('req.title') }),
      h(doc, 'p', { class: 'muted req-border', text: t('req.border') }),
      h(doc, 'p', { class: 'muted', text: t('req.empty') }),
      ask);
  }

  return {
    /** Подпись содержимого: меняется, когда должна меняться картинка. */
    signature(session) {
      return JSON.stringify([rev, session.id, session.requests.map((r) => [r.turn, r.raw.to, r.totalChars]), picked.get(session.id) ?? 0, [...opened].filter((k) => k.startsWith(`${session.id}|`))]);
    },
    render(session) {
      const list = session.requests;
      const req = pickRequest(list, picked.get(session.id) ?? 0);
      if (!req) return [emptyCard(session)];
      return [partsCard(session, list, req), toolsCard(session, req), paramsCard(req), rawCard(session, list, req)];
    },
  };
}
