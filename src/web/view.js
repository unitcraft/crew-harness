// view.js — рисование DOM по модели. Никакой логики «что произошло»: это в state.js.
//
// Правила, на которых держится безопасность и спокойный вид:
//   * текст из событий попадает в DOM ТОЛЬКО через textContent / createTextNode — никакой
//     разметки из данных (проверка страницы ищет innerHTML и родню);
//   * каркас строится один раз; при каждой перерисовке меняется только то, что изменилось,
//     поэтому ответ агента растёт без мерцания, а черновик в поле ввода не пропадает;
//   * прокрутка вниз только если владелец уже был у конца: читающего историю не дёргаем.

import { t } from './strings.js';
import { STATE_KEYS, sessionList, splitBlocks } from './state.js';

const NEAR_BOTTOM_PX = 48;

function h(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== false && child !== null && child !== undefined) node.append(child);
  return node;
}

/**
 * @param doc       document
 * @param refs      { side, main, app, status, overlay } — корневые узлы из index.html
 * @param deps      { agents, now, handlers }
 *   handlers: onSelect(trace), onBack(), onNewToggle(open), onCreate({agent, name}),
 *             onSend(trace, text) -> bool, onCancel(trace), onDecide(trace, request, decision)
 */
export function createView(doc, refs, deps) {
  const { agents, now, handlers } = deps;
  const drafts = new Map();

  const agentLabel = (id) => {
    const a = agents.find((x) => x.id === id);
    return a ? t(a.labelKey) : id;
  };

  function formatTime(ms) {
    const d = new Date(ms);
    const today = new Date(now());
    const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    return sameDay
      ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // ---------------------------------------------------------------- список сессий

  const newButton = h(doc, 'button', { type: 'button', class: 'primary', text: t('sessions.new') });
  const agentSelect = h(doc, 'select', { id: 'new-agent' });
  for (const a of agents) {
    agentSelect.append(h(doc, 'option', { value: a.id, disabled: a.disabled === true, text: t(a.labelKey) }));
  }
  const nameInput = h(doc, 'input', { id: 'new-name', type: 'text', autocomplete: 'off', placeholder: t('sessions.new_name_placeholder') });
  const createButton = h(doc, 'button', { type: 'submit', class: 'primary', text: t('sessions.new_create') });
  const closeButton = h(doc, 'button', { type: 'button', text: t('sessions.new_close') });
  const newForm = h(doc, 'form', { class: 'new-form', hidden: true },
    h(doc, 'label', { for: 'new-agent' }, t('sessions.new_agent'), agentSelect),
    h(doc, 'label', { for: 'new-name' }, t('sessions.new_name'), nameInput),
    h(doc, 'div', { class: 'actions' }, closeButton, createButton));
  const list = h(doc, 'ul', { class: 'session-list' });
  const listEmpty = h(doc, 'p', { class: 'empty', text: t('sessions.empty') });

  refs.side.replaceChildren(
    h(doc, 'div', { class: 'side-head' }, h(doc, 'h2', { text: t('sessions.title') }), newButton),
    newForm, list, listEmpty,
  );

  newButton.addEventListener('click', () => handlers.onNewToggle(newForm.hidden));
  closeButton.addEventListener('click', () => handlers.onNewToggle(false));
  newForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handlers.onCreate({ agent: agentSelect.value, name: nameInput.value.trim() });
    nameInput.value = '';
  });

  let listSig = '';
  function renderList(model, ui) {
    const sessions = sessionList(model);
    const sig = JSON.stringify([ui.selected, sessions.map((s) => [s.id, s.name, s.agent, s.state, s.updatedAt])]);
    listEmpty.hidden = sessions.length > 0;
    if (sig === listSig) return;
    listSig = sig;
    list.replaceChildren(...sessions.map((s) => {
      const item = h(doc, 'button', {
        type: 'button',
        class: 'session-item',
        'aria-current': s.id === ui.selected ? 'true' : 'false',
        title: t('sessions.time_title', { time: formatTime(s.updatedAt) }),
      },
      h(doc, 'span', { class: 'session-row' },
        h(doc, 'span', { class: 'session-name', text: s.name }),
        h(doc, 'span', { class: 'session-time', text: formatTime(s.updatedAt) })),
      h(doc, 'span', { class: 'session-row' },
        h(doc, 'span', { class: 'session-agent', text: agentLabel(s.agent) }),
        h(doc, 'span', { class: 'badge', 'data-state': s.state, text: t(STATE_KEYS[s.state]) })));
      item.addEventListener('click', () => handlers.onSelect(s.id));
      return h(doc, 'li', {}, item);
    }));
  }

  // ---------------------------------------------------------------- чат

  const pick = h(doc, 'p', { class: 'pick', text: t('chat.pick') });
  const backButton = h(doc, 'button', { type: 'button', class: 'chat-back', text: t('chat.back') });
  const title = h(doc, 'h2');
  const stateBadge = h(doc, 'span', { class: 'badge' });
  const log = h(doc, 'div', { class: 'log', role: 'log', 'aria-live': 'off' });
  const emptyChat = h(doc, 'p', { class: 'empty', text: t('chat.empty') });
  const input = h(doc, 'textarea', { id: 'composer-input', rows: 3, placeholder: t('chat.placeholder'), 'aria-label': t('chat.input_label') });
  const sendButton = h(doc, 'button', { type: 'button', class: 'primary', text: t('chat.send') });
  const cancelButton = h(doc, 'button', { type: 'button', class: 'cancel danger', text: t('chat.cancel'), hidden: true });
  const chat = h(doc, 'section', { class: 'chat', hidden: true },
    h(doc, 'div', { class: 'chat-head' }, backButton, title, stateBadge),
    log,
    h(doc, 'div', { class: 'composer' }, input, sendButton, cancelButton));
  refs.main.replaceChildren(pick, chat);

  backButton.addEventListener('click', () => handlers.onBack());

  let currentTrace = null;
  const nodes = new Map(); // key сообщения -> { node, body, sig }

  function submit() {
    const text = input.value.trim();
    if (!currentTrace || text.length === 0) return;
    if (handlers.onSend(currentTrace, text)) {
      input.value = '';
      drafts.delete(currentTrace);
    }
  }
  sendButton.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  input.addEventListener('input', () => { if (currentTrace) drafts.set(currentTrace, input.value); });
  cancelButton.addEventListener('click', () => { if (currentTrace) handlers.onCancel(currentTrace); });

  function fillBody(body, text) {
    const blocks = splitBlocks(text);
    body.replaceChildren(...blocks.map((b) => (b.type === 'code'
      ? h(doc, 'pre', {}, h(doc, 'code', { text: b.text, 'data-lang': b.lang || undefined }))
      : h(doc, 'div', { class: 'text', text: b.text }))));
  }

  const decisionKey = {
    allow: 'chat.perm_allowed', deny: 'chat.perm_denied', cancelled: 'chat.perm_cancelled',
  };

  function buildMessage(m) {
    const body = h(doc, 'div', { class: 'body' });
    const extra = h(doc, 'div', { class: 'extra' });
    let who = '';
    let cls = 'msg-agent';
    if (m.role === 'user') { who = t('chat.you'); cls = 'msg-user'; }
    else if (m.role === 'agent') who = t('chat.agent');
    else cls = 'msg-perm';
    const node = h(doc, 'div', { class: `msg ${cls}`, 'data-key': m.key },
      who ? h(doc, 'div', { class: 'who', text: who }) : false, body, extra);
    return { node, body, extra, sig: null };
  }

  function updateMessage(entry, m) {
    const sig = [m.status, m.text, m.reason, m.decision].join('\u0000');
    if (sig === entry.sig) return;
    entry.sig = sig;
    const { node, body, extra } = entry;

    if (m.role === 'user') {
      fillBody(body, m.text);
    } else if (m.role === 'agent') {
      node.dataset.status = m.status;
      if (m.text.length === 0 && m.status === 'streaming') {
        body.replaceChildren(h(doc, 'div', { class: 'thinking', text: t('chat.thinking') }));
      } else {
        fillBody(body, m.text);
      }
      if (m.status === 'refused') {
        extra.replaceChildren(h(doc, 'div', {
          class: 'note note-refused',
          text: m.reason ? t('chat.refused', { reason: m.reason }) : t('chat.refused_plain'),
        }));
      } else if (m.status === 'error') {
        extra.replaceChildren(h(doc, 'div', {
          class: 'note note-error',
          text: m.reason ? t('chat.error', { message: m.reason }) : t('chat.error_plain'),
        }));
      } else if (m.status === 'cancelled') {
        extra.replaceChildren(h(doc, 'div', { class: 'note', text: t('chat.cancelled') }));
      } else {
        extra.replaceChildren();
      }
    } else {
      body.replaceChildren(
        h(doc, 'div', { text: t('chat.perm_line', { action: m.action }) }),
        m.detail ? h(doc, 'div', { class: 'detail', text: m.detail }) : false,
      );
      extra.replaceChildren(h(doc, 'div', {
        class: 'outcome',
        'data-decision': m.decision ?? 'wait',
        text: m.decision === null ? t('chat.perm_waiting') : t(decisionKey[m.decision]),
      }));
    }
  }

  function renderChat(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    pick.hidden = Boolean(session);
    chat.hidden = !session;
    if (!session) { currentTrace = null; return; }

    if (currentTrace !== session.id) {
      if (currentTrace) drafts.set(currentTrace, input.value);
      currentTrace = session.id;
      nodes.clear();
      log.replaceChildren();
      input.value = drafts.get(session.id) ?? '';
      title.textContent = session.name;
    }

    stateBadge.textContent = t(STATE_KEYS[session.state]);
    stateBadge.dataset.state = session.state;
    const busy = session.state === 'answering' || session.state === 'permission';
    cancelButton.hidden = !busy;
    sendButton.disabled = busy;

    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight <= NEAR_BOTTOM_PX;
    const fresh = [];
    for (const m of session.messages) {
      let entry = nodes.get(m.key);
      if (!entry) { entry = buildMessage(m); nodes.set(m.key, entry); fresh.push(entry.node); }
      updateMessage(entry, m);
    }
    if (fresh.length) log.append(...fresh);
    if (session.messages.length === 0) { if (!emptyChat.parentNode) log.append(emptyChat); }
    else if (emptyChat.parentNode) emptyChat.remove();
    if (nearBottom || fresh.length === session.messages.length) log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- диалог разрешения

  let shownRequest = null;
  function renderDialog(model, ui) {
    const session = ui.selected ? model.sessions[ui.selected] : undefined;
    const pending = session ? session.pending : null;
    if (!pending) {
      if (shownRequest !== null) {
        shownRequest = null;
        refs.overlay.hidden = true;
        refs.overlay.replaceChildren();
        if (!chat.hidden) input.focus();
      }
      return;
    }
    if (shownRequest === pending.request) return;
    shownRequest = pending.request;

    const allow = h(doc, 'button', { type: 'button', class: 'primary', text: t('perm.allow') });
    const deny = h(doc, 'button', { type: 'button', class: 'danger', text: t('perm.deny') });
    allow.addEventListener('click', () => handlers.onDecide(session.id, pending.request, 'allow'));
    deny.addEventListener('click', () => handlers.onDecide(session.id, pending.request, 'deny'));
    const dialog = h(doc, 'div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'perm-title' },
      h(doc, 'h3', { id: 'perm-title', text: t('perm.title') }),
      h(doc, 'dl', {},
        h(doc, 'dt', { text: t('perm.action') }),
        h(doc, 'dd', { text: pending.action }),
        pending.detail ? h(doc, 'dt', { text: t('perm.detail') }) : false,
        pending.detail ? h(doc, 'dd', { class: 'detail', text: pending.detail }) : false),
      h(doc, 'div', { class: 'actions' }, deny, allow));
    refs.overlay.replaceChildren(dialog);
    refs.overlay.hidden = false;
    deny.focus(); // безопасное умолчание: Enter не разрешает действие
  }

  // ---------------------------------------------------------------- строка статуса

  function statusText(status) {
    switch (status.state) {
      case 'connected': return t('conn.connected');
      case 'mock': return t('conn.mock');
      case 'retry': return t('conn.retry', { seconds: status.seconds });
      case 'nofile': return t('conn.nofile');
      default: return t('conn.connecting');
    }
  }

  let statusSig = '';
  function renderStatus(status, flash) {
    const sig = JSON.stringify([status, flash]);
    if (sig === statusSig) return;
    statusSig = sig;
    refs.status.dataset.state = status.state;
    refs.status.replaceChildren(
      h(doc, 'span', { class: 'status-dot', 'aria-hidden': 'true' }),
      h(doc, 'span', { text: `${t('conn.label')}: ${statusText(status)}` }),
      ...(flash ? [h(doc, 'span', { class: 'status-flash', text: flash })] : []),
    );
  }

  return {
    /** ui: { selected, newOpen, pane, flash }; status: { state, seconds? } */
    render(model, ui, status) {
      refs.app.dataset.pane = ui.pane;
      newForm.hidden = !ui.newOpen;
      renderList(model, ui);
      renderChat(model, ui);
      renderDialog(model, ui);
      renderStatus(status, ui.flash);
    },
  };
}
