// Независимые состояния двух источников. Таймер сообщает о задержке, но никогда не объявляет успех.
export function createLoading({ timers, projects, changed }) {
  const fresh = () => ({ phase: 'loading', data: null, slow: false, refreshing: false, error: '' });
  const state = { projects: fresh(), sessions: fresh() };
  const clocks = new Map(); let generation = 0; let stopped = false;
  function clear(key) { if (clocks.has(key)) timers.clear(clocks.get(key)); clocks.delete(key); }
  function begin(key) {
    clear(key);
    state[key] = { ...state[key], phase: 'loading', slow: false, error: '', refreshing: state[key].data !== null };
    clocks.set(key, timers.set(() => { clocks.delete(key); state[key].slow = true; changed(); }, 8000));
    changed();
  }
  function finish(key, data, error = '') {
    clear(key);
    state[key] = { ...state[key], phase: error ? 'error' : 'ready', data: error ? state[key].data : data, slow: false, error };
    changed();
  }
  return {
    state,
    async loadProjects() {
      const current = ++generation; begin('projects');
      let result;
      try { result = await projects(); } catch { result = { ok: false, error: '' }; }
      if (stopped || current !== generation) return;
      if (result.ok) finish('projects', result.projects);
      else finish('projects', null, result.error || 'offline');
    },
    sessionsStart() { begin('sessions'); },
    sessionsReady() { finish('sessions', true); },
    sessionsError() { finish('sessions', null, 'offline'); },
    stop() { stopped = true; generation += 1; clear('projects'); clear('sessions'); },
  };
}
