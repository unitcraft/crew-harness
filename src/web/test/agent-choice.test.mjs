import test from 'node:test';
import assert from 'node:assert/strict';
import { createView } from '../view.js';
import { initialModel, reduce } from '../state.js';
import { createFakeDocument } from './fake-dom.mjs';
import { t } from '../strings.js';

for (const agents of [[], [{ id: 'opencode' }]]) {
  test(`недоступные настройки объясняют клик: агентов ${agents.length}`, () => {
    const doc = createFakeDocument(); const refs = {}; const notices = [];
    for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
      refs[key] = doc.createElement('div'); doc.body.append(refs[key]);
    }
    const view = createView(doc, refs, { agents, now: () => 0, handlers: {
      queued: () => 0, queuedItems: () => [], onNotice: (text) => notices.push(text),
    } });
    const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1,
      kind: 'session_created', input: { name: 'Проверка', agent: 'opencode' } });
    view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
    const buttons = refs.main.querySelectorAll('.status-btn').filter((b) => b.getAttribute('aria-disabled') === 'true');
    assert.ok(buttons.length >= 3);
    for (const button of buttons) {
      const before = notices.length;
      button.click();
      assert.equal(notices.length, before + 1, button.title);
      assert.equal(notices.at(-1), button.title);
    }
  });
}

test('ответ реестра снимает loading: ошибка, пустой успех и повтор с реальными семьями', () => {
  const doc = createFakeDocument(); const refs = {}; const notices = []; const switches = [];
  for (const key of ['app', 'side', 'main', 'rail', 'status', 'overlay']) {
    refs[key] = doc.createElement('div'); doc.body.append(refs[key]);
  }
  const view = createView(doc, refs, { agents: [], registryPending: true, now: () => 0, handlers: {
    queued: () => 0, queuedItems: () => [], onNotice: (text) => notices.push(text),
    onSwitchAgent: (...args) => switches.push(args),
  } });
  const model = reduce(initialModel(), { id: 'create', trace: 's', step: 0, time: 1,
    kind: 'session_created', input: { name: 'Проверка', agent: 'opencode' } });
  const draw = () => view.render(model, { selected: 's', projects: [], pins: {}, theme: 'system' }, { state: 'connected' });
  const family = () => refs.main.querySelector('.status-group').querySelector('button');
  draw(); family().click(); assert.equal(notices.at(-1), t('status.agents_loading'));
  view.setAgents([], true); draw(); family().click();
  assert.equal(notices.at(-1), t('sessions.agents_unavailable'));
  view.setAgents([], false); draw(); family().click();
  assert.equal(notices.at(-1), t('sessions.agents_none'));
  view.setAgents([{ id: 'opencode' }, { id: 'other' }], false); draw(); family().click();
  const rows = refs.main.querySelectorAll('.menu-item');
  assert.equal(rows.length, 2);
  rows[1].click(); assert.deepEqual(switches, [['s', 'other']]);
});
