// projects.js — чистая модель проектов пульта: проект, папки, переменные .env, пути.
// Ни DOM, ни сети, ни часов: страница (projects-ui.js) и тесты берут функции отсюда.
//
// Проект: { id, name, folders: [{ path, branch?, worktree }], env } — как отдаёт сервер (/api/projects).
// В списке (GET /api/projects) вместо env приходит env_keys (только имена): значения в список не попадают.

// ---- пути ------------------------------------------------------------------------------------

/**
 * Единый вид абсолютного пути: прямые косые, без повторов и хвостового «/», буква диска заглавная,
 * корень диска — «D:/». Относительный путь и пустая строка возвращаются как есть (с косыми), без догадок.
 */
export function normalizePath(input) {
  let p = String(input ?? '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  if (p === '') return '';
  const drive = /^([A-Za-z]):(\/.*)?$/.exec(p);
  if (drive) {
    const rest = (drive[2] ?? '/').replace(/\/+$/, '');
    return `${drive[1].toUpperCase()}:${rest === '' ? '/' : rest}`;
  }
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p;
}

/** Абсолютный ли путь: «D:/…» или «/…». */
export function isAbsolutePath(input) {
  return /^[A-Za-z]:\//.test(normalizePath(input)) || normalizePath(input).startsWith('/');
}

/** Последняя часть пути («C:/work/app» -> «app»); корень возвращается целиком. */
export function folderName(path) {
  const p = normalizePath(path);
  if (p === '' || p === '/' || /^[A-Za-z]:\/$/.test(p)) return p;
  return p.slice(p.lastIndexOf('/') + 1);
}

/** Родитель пути или null у корня («D:/» и «/» родителя не имеют). */
export function parentPath(path) {
  const p = normalizePath(path);
  if (p === '' || p === '/' || /^[A-Za-z]:\/$/.test(p)) return null;
  const at = p.lastIndexOf('/');
  if (at <= 0) return '/';
  const head = p.slice(0, at);
  return /^[A-Za-z]:$/.test(head) ? `${head}/` : head;
}

/** Один путь дважды — одна папка (без учёта регистра букв диска и косых). */
export function samePath(a, b) {
  const x = normalizePath(a);
  const y = normalizePath(b);
  return /^[A-Za-z]:/.test(x) ? x.toLowerCase() === y.toLowerCase() : x === y;
}

// ---- переменные .env -------------------------------------------------------------------------

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Разбор текста .env. Возвращает { vars: [{ key, value, line }], errors: [{ line, message }] }.
 * Пустые строки и строки с «#» пропускаются; допустим префикс «export »; значение — без кавычек
 * (до « #» — комментарий), в одинарных кавычках (как есть) или в двойных (допустим перенос строк).
 * Номера строк — с единицы; сообщения по-русски в виде «строка N: …», как у сервера.
 */
export function parseEnv(text) {
  const vars = [];
  const errors = [];
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const body = trimmed.replace(/^export\s+/, '');
    const eq = body.indexOf('=');
    if (eq < 0) { errors.push({ line: i + 1, message: `строка ${i + 1}: нет знака «=»` }); continue; }
    const key = body.slice(0, eq).trim();
    if (!KEY_RE.test(key)) {
      errors.push({ line: i + 1, message: `строка ${i + 1}: неверное имя «${key}»` });
      continue;
    }
    const rest = body.slice(eq + 1).trim();
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      // значение в кавычках: ищем закрывающую (для двойных — на этой или следующих строках)
      let value = rest.slice(1);
      let at = value.indexOf(quote);
      let last = i;
      while (at < 0 && quote === '"' && last + 1 < lines.length) {
        last += 1;
        value += `\n${lines[last]}`;
        at = value.indexOf(quote);
      }
      if (at < 0) { errors.push({ line: i + 1, message: `строка ${i + 1}: кавычка не закрыта` }); continue; }
      const tail = value.slice(at + 1).trim();
      if (tail !== '' && !tail.startsWith('#')) {
        errors.push({ line: last + 1, message: `строка ${last + 1}: лишний текст после кавычки` });
        i = last;
        continue;
      }
      vars.push({ key, value: value.slice(0, at), line: i + 1 });
      i = last;
    } else {
      vars.push({ key, value: rest.replace(/\s+#.*$/, '').trim(), line: i + 1 });
    }
  }
  return { vars, errors };
}

/** Сколько разных переменных в тексте .env (повтор имени считается один раз). */
export function countEnv(text) {
  return new Set(parseEnv(text).vars.map((v) => v.key)).size;
}

/** Имена переменных без значений, по порядку появления, без повторов. */
export function envKeys(text) {
  return [...new Set(parseEnv(text).vars.map((v) => v.key))];
}

// ---- проект ----------------------------------------------------------------------------------

/** Папка проекта в нормальном виде. */
export function makeFolder(raw) {
  const folder = { path: normalizePath(raw && raw.path), worktree: Boolean(raw && raw.worktree) };
  if (raw && typeof raw.branch === 'string' && raw.branch.trim() !== '') folder.branch = raw.branch.trim();
  // задача 192.6: сервер говорит, что папка не git-репозиторий (repo=false); иного ответа нет (старый сервер, заглушка) — считаем, что репозиторий
  if (raw && raw.repo === false) folder.repo = false;
  return folder;
}

/** Проект из ответа сервера (список или полный): всё недостающее — пустым. */
export function makeProject(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const keys = Array.isArray(r.env_keys) ? r.env_keys.filter((k) => typeof k === 'string') : envKeys(r.env);
  return {
    id: typeof r.id === 'string' ? r.id : '',
    name: typeof r.name === 'string' ? r.name : '',
    folders: Array.isArray(r.folders) ? r.folders.map(makeFolder).filter((f) => f.path !== '') : [],
    env: typeof r.env === 'string' ? r.env : '',
    worktreesDir: typeof r.worktrees_dir === 'string' ? r.worktrees_dir.trim() : '',
    envKeys: keys,
  };
}

/** Список проектов из ответа GET /api/projects; мусор отбрасывается. */
export function parseProjects(body) {
  const list = body && Array.isArray(body.projects) ? body.projects : [];
  return list.filter((p) => p && typeof p.id === 'string' && p.id !== '').map(makeProject);
}

/**
 * Проверка перед сохранением: { ok, errors: { name?, folders?, env? } }.
 * Название обязательно; папки без повторов; .env без ошибок разбора.
 */
export function validateProject(draft) {
  const errors = {};
  if (String(draft.name ?? '').trim() === '') errors.name = 'empty';
  const seen = [];
  for (const f of draft.folders ?? []) {
    if (seen.some((p) => samePath(p, f.path))) { errors.folders = 'duplicate'; break; }
    seen.push(f.path);
  }
  const env = parseEnv(draft.env);
  if (env.errors.length > 0) errors.env = env.errors[0].message;
  const trees = worktreesDirProblem(draft.worktreesDir);
  if (trees) errors.worktreesDir = trees;
  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Задача 192.5: «папка деревьев» проекта. Пусто — деревья рядом с папкой проекта; имя (`worktrees`) — папка с этим именем рядом с проектом; абсолютный путь — эта папка.
 * Возвращает 'dots' для «..», 'control' для управляющего символа, '' — если значение допустимо (что оно не внутри репозитория, проверяет сервер).
 */
export function worktreesDirProblem(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) return 'control';
  if (text.split(/[\\/]/).some((part) => part === '..')) return 'dots';
  return '';
}

/** Куда лягут деревья: подпись под полем («рядом с проектом», «папка worktrees рядом с проектом», «в D:/trees»). */
export function worktreesDirHint(value) {
  const text = String(value ?? '').trim().replace(/\\/g, '/');
  if (text === '') return { kind: 'beside' };
  if (isAbsolutePath(text)) return { kind: 'absolute', path: text.replace(/\/+$/, '') };
  return { kind: 'named', name: text.replace(/\/+$/, '') };
}

/** Тело запроса POST/PUT /api/projects: только то, что принимает сервер. */
export function projectPayload(draft) {
  return {
    name: String(draft.name ?? '').trim(),
    folders: (draft.folders ?? []).map(makeFolder),
    env: String(draft.env ?? ''),
    worktrees_dir: String(draft.worktreesDir ?? '').trim(),
  };
}

/** Есть ли у проекта более одной папки (тогда при создании сессии папку выбирают). */
export function needsFolderChoice(project) {
  return Boolean(project) && project.folders.length > 1;
}

/** Папка для новой сессии: единственная выбирается сама; иначе — запрошенная, если она есть в проекте; иначе первая. */
export function pickFolder(project, wanted) {
  if (!project || project.folders.length === 0) return null;
  const hit = wanted ? project.folders.find((f) => samePath(f.path, wanted)) : undefined;
  return hit ?? project.folders[0];
}

/** Подпись «Проект · папка (ветка)» для заголовка сессии; пустые части пропускаются, без проекта — пустая строка. */
export function sessionPlace({ project, folder, branch }) {
  const name = String(project ?? '').trim();
  if (name === '') return '';
  const dir = folder ? folderName(folder) : '';
  const tail = dir ? (branch ? `${dir} (${branch})` : dir) : '';
  return tail ? `${name} · ${tail}` : name;
}

/** Текст ошибки сервера (400 {"error": "..."}) или запасной. */
export function errorText(body, fallback) {
  return body && typeof body.error === 'string' && body.error.trim() !== '' ? body.error.trim() : fallback;
}

/** Русская форма числа: 'one' (1, 21), 'few' (2–4, 22–24), 'many' (0, 5–20, 25…). */
export function pluralRu(n) {
  const k = Math.abs(Math.trunc(Number(n) || 0));
  const last = k % 10;
  const tail = k % 100;
  if (last === 1 && tail !== 11) return 'one';
  if (last >= 2 && last <= 4 && (tail < 12 || tail > 14)) return 'few';
  return 'many';
}

/** Склеить путь каталога и имя вложенной папки; пустая база — корень списка дисков. */
export function joinPath(base, name) {
  const b = normalizePath(base);
  if (b === '') return normalizePath(name);
  return normalizePath(b.endsWith('/') ? `${b}${name}` : `${b}/${name}`);
}

/** Имя нового проекта по имени папки; такое уже есть (без учёта регистра) — «имя (2)», «имя (3)» и так далее. */
export function uniqueProjectName(base, names) {
  const taken = new Set(names.map((n) => String(n).trim().toLowerCase()));
  const first = String(base).trim() || 'Проект';
  if (!taken.has(first.toLowerCase())) return first;
  for (let n = 2; ; n += 1) {
    const candidate = `${first} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}
