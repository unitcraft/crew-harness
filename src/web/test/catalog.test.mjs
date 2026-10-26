// Каталог семей (задача 192o): списки моделей, режимов и усилия по каждой семье приходят событием agent_catalog;
// страница показывает у сессии сперва собственную сводку её семьи, иначе каталог семьи; при смене семьи прежние значения не показываются ни на миг.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS, initialModel, reduce, shownOf, beginSwitch, undoSwitch,
} from '../state.js';

let counter = 0;
function ev(kind, input = {}, { trace = 's1', step = 0, id, time = 1000 + step } = {}) {
  counter += 1;
  return { id: id ?? `e${counter}`, trace, step, kind, input, time };
}
const run = (events, model = initialModel()) => events.reduce((m, e) => reduce(m, e), model);

const catalogEvent = (agent, record, { updated = 5000, id } = {}) => ev('agent_catalog', { agent, updated, ...record }, { trace: 'agents', step: 0, id: id ?? `catalog/${agent}/${updated}`, time: updated });

const CLAUDE = {
  model: 'Sonnet', model_id: 'sonnet', models: [{ id: 'opus', name: 'Opus' }, { id: 'sonnet', name: 'Sonnet' }],
  effort: 'high', effort_name: 'Effort', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }],
  mode: 'plan', modes: [{ id: 'plan', name: 'Plan', description: 'Сначала план' }],
};
const KIMI = {
  model: 'Kimi K3', model_id: 'k3', models: [{ id: 'k3', name: 'Kimi K3' }],
  mode: 'default', modes: [{ id: 'default', name: 'Default' }, { id: 'yolo', name: 'Yolo' }],
};

const session = (agent = 'claude', trace = 's1') => ev('session_created', { name: 'A', agent }, { trace, step: 0 });

test('agent_catalog — вид события, он сохраняется в состоянии по id агента', () => {
  assert.ok(KINDS.includes('agent_catalog'));
  const m = run([catalogEvent('claude', CLAUDE), catalogEvent('kimi', KIMI)]);
  assert.deepEqual(Object.keys(m.catalog).sort(), ['claude', 'kimi']);
  assert.equal(m.catalog.claude.options.modelId, 'sonnet');
  assert.deepEqual(m.catalog.claude.options.efforts.map((c) => c.id), ['low', 'high']);
  assert.equal(m.catalog.kimi.options.modes[1].id, 'yolo');
  assert.equal(m.catalog.claude.model, 'Sonnet');
});

test('каталог: запись с меньшим временем не затирает более свежую, повтор события безвреден', () => {
  const fresh = catalogEvent('claude', { ...CLAUDE, model_id: 'opus', model: 'Opus' }, { updated: 9000 });
  const stale = catalogEvent('claude', CLAUDE, { updated: 5000 });
  const m = run([fresh, stale, fresh]);
  assert.equal(m.catalog.claude.options.modelId, 'opus');
  assert.equal(m.catalog.claude.updated, 9000);
});

test('каталог: событие без агента ничего не меняет', () => {
  const m = run([ev('agent_catalog', { models: [{ id: 'x', name: 'X' }] }, { trace: 'agents' })]);
  assert.deepEqual(m.catalog, {});
});

test('старая сессия без собственной сводки сразу показывает модели, режимы и усилие своей семьи из каталога', () => {
  const m = run([session('claude'), catalogEvent('claude', CLAUDE), catalogEvent('kimi', KIMI)]);
  const shown = shownOf(m, m.sessions.s1);
  assert.equal(shown.agent, 'claude');
  assert.equal(shown.model, 'Sonnet');
  assert.equal(shown.options.modelId, 'sonnet');
  assert.deepEqual(shown.options.efforts.map((c) => c.id), ['low', 'high']);
  assert.equal(shown.options.modes[0].description, 'Сначала план');
  assert.equal(shown.loading, false);
});

test('каталог пришёл раньше сессии или позже — вид один и тот же', () => {
  const a = run([catalogEvent('claude', CLAUDE), session('claude')]);
  const b = run([session('claude'), catalogEvent('claude', CLAUDE)]);
  assert.deepEqual(shownOf(a, a.sessions.s1), shownOf(b, b.sessions.s1));
});

test('свежее своё важнее каталога: сводка сессии своей семьи показывается, пока каталог другой сессии не должен подменять её значения', () => {
  const own = { model: 'Opus', model_id: 'opus', models: [{ id: 'opus', name: 'Opus' }], mode: 'default', modes: [{ id: 'default', name: 'Default' }] };
  const m = run([
    session('claude'),
    catalogEvent('claude', CLAUDE, { updated: 5000 }),
    ev('session_model', own, { step: 1 }),
    catalogEvent('claude', { ...CLAUDE, model_id: 'sonnet' }, { updated: 8000 }),
  ]);
  const shown = shownOf(m, m.sessions.s1);
  assert.equal(shown.model, 'Opus');
  assert.equal(shown.options.modelId, 'opus');
  assert.deepEqual(shown.options.modes.map((c) => c.id), ['default']);
});

test('пустая собственная сводка (агент ничего не отдал) не прячет каталог', () => {
  const m = run([session('claude'), catalogEvent('claude', CLAUDE), ev('session_model', { model: '' }, { step: 1 })]);
  assert.equal(shownOf(m, m.sessions.s1).options.modelId, 'sonnet');
});

test('сессия без собственной сводки и без записи каталога показывает пусто', () => {
  const m = run([session('claude'), catalogEvent('kimi', KIMI)]);
  const shown = shownOf(m, m.sessions.s1);
  assert.equal(shown.model, '');
  assert.deepEqual([shown.options.models, shown.options.efforts, shown.options.modes], [[], [], []]);
  assert.equal(shown.loading, false);
});

test('смена семьи: сразу, до ответа сервера, нет ни одного значения прежней семьи — подставлен каталог новой', () => {
  const m0 = run([
    session('claude'), catalogEvent('claude', CLAUDE), catalogEvent('kimi', KIMI),
    ev('session_model', CLAUDE, { step: 1 }),
  ]);
  assert.equal(shownOf(m0, m0.sessions.s1).options.mode, 'plan');
  const m = beginSwitch(m0, 's1', 'kimi');
  const shown = shownOf(m, m.sessions.s1);
  assert.equal(shown.agent, 'kimi');
  assert.equal(shown.model, 'Kimi K3');
  assert.equal(shown.options.mode, 'default');
  assert.equal(shown.options.modelId, 'k3');
  assert.deepEqual(shown.options.efforts, []);
  assert.deepEqual(shown.options.modes.map((c) => c.id), ['default', 'yolo']);
  assert.equal(shown.loading, false);
  // сама сессия ещё на старой семье: сервер не отвечал
  assert.equal(m.sessions.s1.agent, 'claude');
});

test('смена семьи без записи в каталоге новой семьи: пусто и «загрузка», а не значения прежней семьи', () => {
  const m0 = run([session('claude'), catalogEvent('claude', CLAUDE), ev('session_model', CLAUDE, { step: 1 })]);
  const m = beginSwitch(m0, 's1', 'kimi');
  const shown = shownOf(m, m.sessions.s1);
  assert.equal(shown.agent, 'kimi');
  assert.equal(shown.model, '');
  assert.deepEqual([shown.options.models, shown.options.efforts, shown.options.modes], [[], [], []]);
  assert.equal(shown.options.mode, '');
  assert.equal(shown.options.effort, '');
  assert.equal(shown.loading, true);
});

test('agent_switched завершает смену; сводка прежней семьи не возвращается, поздняя сводка старого агента отброшена; сводка нового агента берётся', () => {
  const m0 = run([
    session('claude'), catalogEvent('claude', CLAUDE), ev('session_model', CLAUDE, { step: 1 }),
  ]);
  const switching = beginSwitch(m0, 's1', 'kimi');
  const switched = reduce(switching, ev('agent_switched', { from: 'claude', to: 'kimi', shown: 1, total: 1, cut: 0 }, { step: 5 }));
  assert.equal(switched.sessions.s1.agent, 'kimi');
  assert.equal(switched.sessions.s1.switchingTo, '');
  let shown = shownOf(switched, switched.sessions.s1);
  assert.equal(shown.options.mode, '');
  assert.equal(shown.loading, true);
  // запоздавшая сводка старого агента (шаг меньше шага смены) отброшена
  const late = reduce(switched, ev('session_model', CLAUDE, { step: 4 }));
  shown = shownOf(late, late.sessions.s1);
  assert.deepEqual(shown.options.modes, []);
  // каталог новой семьи пришёл — показан
  const withCatalog = reduce(late, catalogEvent('kimi', KIMI));
  shown = shownOf(withCatalog, withCatalog.sessions.s1);
  assert.equal(shown.options.modelId, 'k3');
  assert.equal(shown.loading, false);
  // сводка нового агента важнее каталога
  const own = reduce(withCatalog, ev('session_model', { ...KIMI, model: 'Kimi K3 Turbo', model_id: 'k3t', models: [{ id: 'k3t', name: 'Kimi K3 Turbo' }] }, { step: 6 }));
  shown = shownOf(own, own.sessions.s1);
  assert.equal(shown.model, 'Kimi K3 Turbo');
  assert.equal(shown.options.modelId, 'k3t');
});

test('сервер отказал в смене (событие error) или отправка не вышла: страница возвращается к прежней семье и её значениям', () => {
  const m0 = run([session('claude'), catalogEvent('claude', CLAUDE), catalogEvent('kimi', KIMI), ev('session_model', CLAUDE, { step: 1 })]);
  const refused = reduce(beginSwitch(m0, 's1', 'kimi'), ev('error', { message: 'the agent kimi cannot be started' }, { step: 2 }));
  assert.equal(refused.sessions.s1.switchingTo, '');
  assert.equal(shownOf(refused, refused.sessions.s1).options.mode, 'plan');
  const undone = undoSwitch(beginSwitch(m0, 's1', 'kimi'), 's1');
  assert.equal(shownOf(undone, undone.sessions.s1).agent, 'claude');
  assert.equal(shownOf(undone, undone.sessions.s1).options.mode, 'plan');
});

test('выбор той же семьи, что у сессии, ничего не меняет; выбор прежней семьи во время смены её отменяет; чужая сессия — та же модель', () => {
  const m0 = run([session('claude'), catalogEvent('kimi', KIMI)]);
  assert.equal(beginSwitch(m0, 's1', 'claude'), m0);
  assert.equal(beginSwitch(m0, 'nobody', 'kimi'), m0);
  const back = beginSwitch(beginSwitch(m0, 's1', 'kimi'), 's1', 'claude');
  assert.equal(back.sessions.s1.switchingTo, '');
});

test('две сессии одной семьи: у каждой своя сводка, у третьей без сводки — каталог', () => {
  const m = run([
    session('claude', 'a'), session('claude', 'b'), session('claude', 'c'), catalogEvent('claude', CLAUDE),
    ev('session_model', { ...CLAUDE, model_id: 'opus', model: 'Opus' }, { trace: 'a', step: 1 }),
  ]);
  assert.equal(shownOf(m, m.sessions.a).options.modelId, 'opus');
  assert.equal(shownOf(m, m.sessions.b).options.modelId, 'sonnet');
  assert.equal(shownOf(m, m.sessions.c).options.modelId, 'sonnet');
});

test('заготовка (mock): сессия без собственной сводки показывает списки семьи из каталога заготовки', async () => {
  const { INITIAL_JOURNAL } = await import('../mock.js');
  const m = run(INITIAL_JOURNAL.map((e) => ({ ...e })));
  assert.equal(m.sessions['ses-demo-2'].options.models.length, 0);
  const shown = shownOf(m, m.sessions['ses-demo-2']);
  assert.ok(shown.options.models.length > 0 && shown.options.modes.length > 0 && shown.options.efforts.length > 0);
});
