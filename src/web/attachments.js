// attachments.js — картинки, приложенные к сообщению (задача 192): модель вложений без DOM.
//
// Зачем отдельно: что можно приложить, сколько, как называется и что уходит на сервер — решения, а не
// рисование, поэтому они проверяются под Node (test/attachments.test.mjs). view.js только берёт файлы из
// буфера обмена и из перетаскивания, показывает список и зовёт эти функции.
//
// Вложение: { id, name, type, size, blob }. Список — обычный массив; функции его не меняют, а возвращают новый.
// Байты не идут через строку WebSocket (хаб читает свой ввод по байту, мегабайт ждал бы 40 секунд): страница кладёт
// каждую картинку на сервер отдельным запросом POST /api/session-image/<сессия> (сырые байты), получает номер n, а в сообщении
// уходит только { name, n }. Сервер хранит файл, в журнал пишет { n, name, mime, bytes }, а перезагруженная страница
// берёт картинку по адресу /api/session-image/<сессия>/<n>.

export const IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const MAX_IMAGES = 6;

/** Значение accept для выбора файлов кнопкой «+»: те же типы, что принимает addImages. */
export function pickerAccept() {
  return IMAGE_TYPES.join(',');
}
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXT = Object.freeze({
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
});

/** Имя по умолчанию для картинки без имени: image.png, image.jpg… */
export function defaultName(type) {
  return `image.${EXT[type] ?? 'png'}`;
}

/** Имя, которого ещё нет среди занятых: image.png, image-2.png, image-3.png… */
export function uniqueName(taken, name) {
  if (!taken.includes(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n += 1) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/**
 * Добавить файлы к списку. files — объекты вида File ({ name, type, size }); seq — счётчик для id вложений.
 * Возвращает { list, errors, seq }. Ошибка — { code, name } с кодом 'type' | 'empty' | 'size' | 'count';
 * 'count' — не больше MAX_IMAGES в сообщении (лишние не добавляются, ошибка одна). Принятые файлы остаются, непринятые — нет.
 */
export function addImages(list, files, seq = 0) {
  let next = list;
  let n = seq;
  const errors = [];
  let overflow = false;
  for (const file of files) {
    const name = typeof file.name === 'string' ? file.name : '';
    if (!IMAGE_TYPES.includes(file.type)) { errors.push({ code: 'type', name: name || defaultName(file.type) }); continue; }
    if (!(file.size > 0)) { errors.push({ code: 'empty', name: name || defaultName(file.type) }); continue; }
    if (file.size > MAX_IMAGE_BYTES) { errors.push({ code: 'size', name: name || defaultName(file.type) }); continue; }
    if (next.length >= MAX_IMAGES) {
      if (!overflow) errors.push({ code: 'count', name });
      overflow = true;
      continue;
    }
    n += 1;
    const shown = uniqueName(next.map((x) => x.name), name || defaultName(file.type));
    next = [...next, { id: `att-${n}`, name: shown, type: file.type, size: file.size, blob: file }];
  }
  return { list: next, errors, seq: n };
}

/** Убрать вложение по id. Нет такого — тот же список. */
export function removeImage(list, id) {
  return list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list;
}

/** Можно ли отправлять: есть текст или есть картинка (одну картинку без слов слать можно), и ничего не уходит прямо сейчас. */
export function canSend(text, list, busy = false) {
  return !busy && (String(text).trim().length > 0 || list.length > 0);
}

/**
 * Положить все картинки на сервер по очереди. post(trace, item) -> Promise<{ n }> (бросает ошибку с текстом причины).
 * Возвращает { ok: true, images: [{ name, n }] } или { ok: false, error, name } на первой неудаче (остальные не отправляются).
 */
export async function uploadImages(trace, list, post) {
  const images = [];
  for (const item of list) {
    let reply;
    try {
      reply = await post(trace, item);
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e), name: item.name };
    }
    if (!reply || !Number.isInteger(reply.n) || reply.n < 1) return { ok: false, error: 'no number', name: item.name };
    images.push({ name: item.name, n: reply.n });
  }
  return { ok: true, images };
}

/** Вход события user_message: без картинок — как всегда, с картинками — ещё и images: [{ name, n }]. */
export function messageInput(turn, text, images = []) {
  return images.length > 0 ? { turn, text, images } : { turn, text };
}

const imageFile = (f) => Boolean(f) && typeof f.type === 'string' && f.type.startsWith('image/');

/**
 * Файлы-картинки из буфера обмена (событие paste, clipboardData): сначала items с kind 'file' и типом image/*,
 * если их нет — files. Скриншот в буфере приходит файлом image.png; текст из буфера сюда не попадает.
 */
export function clipboardImages(data) {
  if (!data) return [];
  const out = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item && item.kind === 'file' && typeof item.type === 'string' && item.type.startsWith('image/')) {
      const file = typeof item.getAsFile === 'function' ? item.getAsFile() : null;
      if (imageFile(file)) out.push(file);
    }
  }
  if (out.length > 0) return out;
  return Array.from(data.files ?? []).filter(imageFile);
}

/** Тащат ли сейчас файлы (а не текст или ссылку): по типам DataTransfer. */
export function dragHasFiles(data) {
  return Boolean(data) && Array.from(data.types ?? []).includes('Files');
}

/** Файлы, брошенные в карточку: все, не только картинки — лишнее отсеет addImages с ошибкой 'type'. */
export function droppedFiles(data) {
  return data ? Array.from(data.files ?? []) : [];
}

/** Есть ли в буфере текст: тогда вставку не отменяем, и текст ложится в поле рядом с картинкой. */
export function clipboardHasText(data) {
  return Boolean(data) && Array.from(data.types ?? []).includes('text/plain');
}

/** Адрес картинки сообщения на сервере. */
export function imageUrl(trace, n) {
  return `/api/session-image/${encodeURIComponent(trace)}/${n}`;
}
