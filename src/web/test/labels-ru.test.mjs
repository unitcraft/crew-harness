// Русские названия режимов и усилия (задача 192): известное переводится, неизвестное остаётся как пришло,
// оригинал уходит в title. Названия моделей не затрагиваются.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelOf } from '../labels-ru.js';

test('режимы Kimi по id и названию', () => {
  const d = labelOf('mode', { id: 'default', name: 'Default', description: 'Manual approvals; tools execute normally.' });
  assert.equal(d.name, 'По умолчанию');
  assert.equal(d.description, 'Ручное подтверждение, инструменты выполняются обычно');
  assert.equal(d.title, 'Default — Manual approvals; tools execute normally.');
  assert.equal(labelOf('mode', { id: 'plan', name: 'Plan' }).name, 'План');
  assert.equal(labelOf('mode', { id: 'plan', name: 'Plan' }).description, 'Только планирование, без выполнения инструментов');
  assert.equal(labelOf('mode', { id: 'auto', name: 'Auto', description: 'Auto-approve safe operations.' }).description, 'Безопасные операции подтверждаются автоматически');
  assert.equal(labelOf('mode', { id: 'yolo', name: 'YOLO' }).description, 'Подтверждать всё автоматически');
});

test('режимы Claude Code: название точнее id, «Auto» с другим описанием', () => {
  assert.equal(labelOf('mode', { id: 'default', name: 'Manual' }).name, 'Ручной');
  assert.equal(labelOf('mode', { id: 'default', name: 'Manual' }).description, 'Всегда спрашивать перед изменениями');
  assert.equal(labelOf('mode', { id: 'acceptEdits', name: 'Accept edits' }).name, 'Принимать правки');
  assert.equal(labelOf('mode', { id: 'bypassPermissions', name: 'Bypass permissions' }).name, 'Без запросов');
  assert.equal(labelOf('mode', { id: 'bypassPermissions', name: 'Bypass permissions' }).description, 'Принимать все разрешения');
  assert.equal(labelOf('mode', { id: 'auto', name: 'Auto', description: 'Claude handles permission decisions' }).description, 'Агент сам решает вопросы разрешений');
  assert.equal(labelOf('mode', { id: 'x', name: 'ACCEPT EDITS' }).name, 'Принимать правки');
});

test('усилие', () => {
  const ru = { low: 'Низкое', medium: 'Среднее', high: 'Высокое', xhigh: 'Очень высокое', max: 'Максимальное', default: 'По умолчанию' };
  for (const [id, name] of Object.entries(ru)) assert.equal(labelOf('effort', { id, name: id[0].toUpperCase() + id.slice(1) }).name, name);
  assert.equal(labelOf('effort', { id: 'high', name: 'High' }).title, 'High');
  assert.equal(labelOf('effort', { id: 'high', name: 'High', description: 'Think a lot' }).description, 'Think a lot');
});

test('неизвестное возвращается как есть, модели не переводятся', () => {
  const m = { id: 'turbo', name: 'Turbo', description: 'Something new' };
  assert.deepEqual(labelOf('mode', m), { name: 'Turbo', description: 'Something new', title: '' });
  assert.deepEqual(labelOf('effort', m), { name: 'Turbo', description: 'Something new', title: '' });
  assert.deepEqual(labelOf('model', { id: 'plan', name: 'Plan' }), { name: 'Plan', description: '', title: '' });
  assert.deepEqual(labelOf('mode', undefined), { name: '', description: '', title: '' });
});

test('view.js берёт названия режима и усилия из labelOf; оригинал — в title', () => {
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const view = fs.readFileSync(path.join(web, 'view.js'), 'utf8');
  assert.match(view, /from '\.\/labels-ru\.js'/);
  assert.match(view, /modeButton\.title = modeLabel\.title/);
  assert.match(view, /modelButton\.title = effortLabel\.title/);
  assert.match(view, /tip: l\.title/);
});
