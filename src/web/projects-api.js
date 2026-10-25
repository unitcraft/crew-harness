// projects-api.js — клиент HTTP к проектам и обзору папок сервиса. Только fetch (его подставляют), без DOM.
// Все методы возвращают { ok, ... } и не бросают: ошибка сети и ответ 4xx/5xx — обычный исход, страница показывает текст.

import { errorText, makeProject, parseProjects, normalizePath } from './projects.js';

async function readJson(response) {
  try { return await response.json(); } catch { return null; }
}

/** @param fetchFn () => fetch: берётся при каждом вызове, потому что мок подменяет globalThis.fetch после старта */
export function createProjectsApi(fetchFn, failText = 'Нет связи с сервисом') {
  async function call(method, url, body) {
    try {
      const init = { method, cache: 'no-store', headers: {} };
      if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
      const response = await fetchFn()(url, init);
      const json = await readJson(response);
      if (!response.ok) return { ok: false, status: response.status, error: errorText(json, `${failText} (${response.status})`) };
      return { ok: true, status: response.status, body: json };
    } catch {
      return { ok: false, status: 0, error: failText };
    }
  }

  return {
    async list() {
      const r = await call('GET', '/api/projects');
      return r.ok ? { ok: true, projects: parseProjects(r.body) } : r;
    },
    async get(id) {
      const r = await call('GET', `/api/projects/${encodeURIComponent(id)}`);
      return r.ok ? { ok: true, project: makeProject(r.body) } : r;
    },
    async create(payload) {
      const r = await call('POST', '/api/projects', payload);
      return r.ok ? { ok: true, id: r.body && r.body.id } : r;
    },
    update(id, payload) { return call('PUT', `/api/projects/${encodeURIComponent(id)}`, payload); },
    remove(id) { return call('DELETE', `/api/projects/${encodeURIComponent(id)}`); },
    /** Каталоги по пути; пустой путь — корни дисков и недавние. */
    async fsList(path = '') {
      const r = await call('GET', `/api/fs/list?path=${encodeURIComponent(path)}`);
      if (!r.ok) return r;
      const b = r.body || {};
      return {
        ok: true,
        path: typeof b.path === 'string' ? normalizePath(b.path) : '',
        parent: typeof b.parent === 'string' ? normalizePath(b.parent) : null,
        entries: (Array.isArray(b.entries) ? b.entries : []).filter((e) => e && typeof e.name === 'string' && e.dir !== false),
        recent: (Array.isArray(b.recent) ? b.recent : []).filter((p) => typeof p === 'string').map(normalizePath),
      };
    },
    /** Репозиторий ли папка и какая в нём ветка. */
    async fsGit(path) {
      const r = await call('GET', `/api/fs/git?path=${encodeURIComponent(path)}`);
      if (!r.ok) return { ok: false, isRepo: false, branch: '', error: r.error };
      const b = r.body || {};
      return { ok: true, isRepo: b.is_repo === true, branch: typeof b.branch === 'string' ? b.branch : '' };
    },
  };
}
