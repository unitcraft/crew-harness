// Durable local safety net, scoped by browser origin (server) and session id.
// No automatic retry: a successful socket.send is NOT server acceptance.
import { t } from './strings.js';
export const DELIVERY_KEY = 'crew-console-delivery-v1';
export const restoreText = (text, current) => current.trim() === '' ? text : `${text}\n\n${current}`;
export const afterSendText = (original, current) => original === current ? '' : current;
const LIMIT = 100;
const MAX_BYTES = 2_000_000;
const httpStatus = value => Number(/(?:HTTP\s*|status[=: ]+)([45]\d\d)\b/i.exec(String(value ?? '').slice(0, 16384))?.[1]) || null;

/** Backend errors are untrusted. Do not expose arbitrary payloads, URLs, headers or tokens. */
export function safeError(value) {
  const text = String(value ?? '').slice(0, 16384);
  // Only a bounded, known diagnostic vocabulary is allowed out of provider errors.
  // Unknown details are deliberately withheld rather than relying on a token blacklist.
  const rules = [
    [/^(NoResult|no_result)$/i, t('delivery.reason_result')],
    [/^(Denied|ModelRefused|model_refused|Refused)$/i, t('delivery.reason_refused')],
    [/^(MaxTokens|MaxTurnRequests|CeilingReached|max_tokens|max_turn_requests|ceiling_reached)$/i, t('delivery.reason_budget')],
    [/\bagent\b[^\r\n]{0,80}\bnot configured\b|unknown agent/i, t('delivery.reason_registry')],
    [/cannot be started|refused to start|spawn|ENOENT|not found/i, t('delivery.reason_start')],
    [/401|403|unauthori|authenticat|credential/i, t('delivery.reason_auth')],
    [/429|rate.?limit|quota/i, t('delivery.reason_limit')],
    [/timeout|timed out|Timeout/i, t('delivery.reason_timeout')],
    [/network|offline|connect|ECONN/i, t('delivery.reason_network')],
    [/идёт прогон шагов/i, t('delivery.reason_running')],
    [/репозиторий результата/i, t('delivery.reason_repo')],
    [/pictures|images|изображени/i, t('delivery.reason_images')],
    [/HTTP\s*([45]\d\d)/i, t('delivery.reason_http')],
  ];
  if (rules.some(([, message]) => message === text)) return text;
  return rules.find(([re]) => re.test(text))?.[1] ?? t('delivery.reason_unknown');
}

export function createDelivery(storage) {
  let records = [];
  try {
    const parsed = JSON.parse(storage?.getItem(DELIVERY_KEY) || '[]');
    if (Array.isArray(parsed)) records = parsed.filter(r => r && typeof r.id === 'string' && typeof r.trace === 'string' && typeof r.text === 'string').slice(0, LIMIT)
      .map(r => ({ ...r, images: Array.isArray(r.images) ? r.images : [], state: r.state === 'sending' ? 'unknown' : r.state, reason: r.reason ? safeError(r.reason) : '' }));
  } catch { /* unreadable storage: sending will be refused until writing works */ }
  function save(next) {
    const data = JSON.stringify(next);
    if (next.length > LIMIT || data.length > MAX_BYTES) return false;
    try { if (!storage) return false; storage.setItem(DELIVERY_KEY, data); records = next; return true; } catch { return false; }
  }
  function update(id, patch) {
    const next = records.map(r => r.id === id ? { ...r, ...patch } : r);
    // Keep the in-memory safety copy even if a later write fails. Unknown is always safe after reload.
    if (!save(next)) records = next;
  }
  return {
    items(trace) { return records.filter(r => r.trace === trace).map(r => ({ ...r })); },
    sessions() { return records.filter(r => r.session).map(r => r.session); },
    add(event, session = null) {
      if (records.some(r => r.id === event.id)) return false;
      return save([...records, { id: event.id, trace: event.trace, text: event.input.text || '', images: event.input.images || [], at: event.time, state: 'sending', clientTurn: event.input.turn, turn: '', reason: '', session }]);
    },
    failed(id, reason) { update(id, { state: 'not_sent', reason: safeError(reason), httpStatus: httpStatus(reason) }); },
    unknown(id) { update(id, { state: 'unknown' }); },
    disconnected() { for (const r of [...records]) if (r.state === 'sending') update(r.id, { state: 'unknown' }); },
    error(event) {
      const outgoing = records.find(r => r.trace === event.trace && r.id === event.input.client_id);
      if (outgoing) {
        update(outgoing.id, { reason: safeError(event.input.message), errorId: event.id, state: 'received', httpStatus: httpStatus(event.input.message) });
        return;
      }
      if (records.some(r => r.id === event.id)) return;
      const record = { id: event.id, trace: event.trace, text: '', images: [], at: event.time, state: 'error', turn: event.input.turn || '', reason: safeError(event.input.message), httpStatus: httpStatus(event.input.message) };
      if (!save([...records, record])) records = [...records, record];
    },
    canRetry(id) { return records.some(r => r.id === id && r.state === 'not_sent' && r.images.length === 0); },
    beginRetry(id) {
      const r = records.find(x => x.id === id);
      if (!r || r.state !== 'not_sent' || r.images.length) return null;
      // Persist intent before any side effect. Double click and reload cannot issue a second attempt.
      if (!save(records.map(x => x.id === id ? { ...x, state: 'sending', reason: '' } : x))) return null;
      return { ...r };
    },
    receipt(input) {
      if (!input || typeof input.client_id !== 'string') return;
      if (records.some(r => r.id === input.client_id && r.state === 'accepted')) return;
      update(input.client_id, { state: input.accepted === true ? 'accepted' : 'received', turn: typeof input.turn === 'string' ? input.turn : '' });
    },
    reconcile(model) {
      const next = records.filter(r => {
        const messages = model.sessions[r.trace]?.messages || [];
        if (r.state === 'error') return !r.turn || !messages.some(m => m.role === 'agent' && m.turn === r.turn && m.status === 'done' && m.doneAt >= r.at);
        // Correlate only by an identity echoed by the server, NEVER by text or arrival order.
        return !messages.some(m => m.role === 'user' && m.turn === (r.turn || r.clientTurn));
      });
      if (next.length !== records.length) save(next);
    },
    forget(id) { return save(records.filter(r => r.id !== id)); },
  };
}

/** Composer drafts survive reload; failed writes never prevent editing the in-memory draft. */
export function createDraftStore(storage) {
  const key = 'crew-console-composer-v1';
  let entries;
  try { entries = JSON.parse(storage?.getItem(key) || '[]'); } catch { entries = []; }
  const map = new Map(Array.isArray(entries) ? entries.filter(e => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string') : []);
  const save = () => { try { storage?.setItem(key, JSON.stringify([...map])); } catch { /* preserve memory */ } };
  return { get: id => map.get(id), set(id, text) { map.set(id, text); save(); }, delete(id) { map.delete(id); save(); } };
}
