import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRouteState, routeSignal } from '../routes.js';
import { createProjectsApi } from '../projects-api.js';

test('цель результата видна в состоянии страницы и задаётся ID репозитория без проекта', () => {
  const state = parseRouteState({ route: 'interactive', result_repo: 'projectb', result_label: 'B — /work/b' });
  assert.equal(state.resultRepo, 'projectb');
  assert.equal(state.resultLabel, 'B — /work/b');
  assert.deepEqual(routeSignal.resultRepo('projectb'), { kind: 'session_result_repo', input: { repo_id: 'projectb' } });
  assert.match(viewSource(), /projectsUi\.pickFolder\(\)/);
  assert.match(viewSource(), /inspectResultRepo\(path\)/);
  assert.match(viewSource(), /projectsUi\.confirm\(/);
  const view = readFileSync(new URL('../view.js', import.meta.url), 'utf8');
  assert.match(view, /Учёт:.*→ результат:/);
  assert.match(view, /resultRepoButton\.disabled = Boolean\(task\) \|\| hasTree/);
  assert.match(view, /handlers\.onResultRepo\(currentTrace, p\.id\)/);
});

function viewSource() { return readFileSync(new URL('../view.js', import.meta.url), 'utf8'); }

test('подтверждение цели использует отдельный registry, не POST проекта', async () => {
  const calls = [];
  const api = createProjectsApi(() => async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ id: 'repob' }) };
  });
  await api.inspectResultRepo('C:/work/B');
  await api.registerResultRepo({ dir: 'C:/work/B', common: 'C:/work/B/.git', url: 'https://example.test/b.git', remote: 'origin', branch: 'main' });
  await api.listResultRepos();
  assert.match(calls[0].url, /^\/api\/result-repositories\/inspect\?path=/);
  assert.equal(calls[1].url, '/api/result-repositories');
  assert.equal(JSON.parse(calls[1].init.body).word, 'подтверждаю');
  assert.ok(calls.every((c) => !c.url.startsWith('/api/projects')));
});

test('регистрация — подтверждение в локальной модели, не отдельная owner authentication', () => {
  const server = readFileSync(new URL('../../server/front/projects_api.nv', import.meta.url), 'utf8');
  const start = server.indexOf('fn result_repo_post_route(');
  const end = server.indexOf('\nfn ', start + 1);
  const handler = server.slice(start, end < 0 ? undefined : end);
  assert.match(handler, /origin_allowed\(req, port\)/);
  assert.match(handler, /result_repo_register\(data_dir, body\)/);
  assert.match(handler, /not isolation from arbitrary shell\/HTTP/);
  assert.match(viewSource(), /Подтвердить другой репозиторий…/);
});
