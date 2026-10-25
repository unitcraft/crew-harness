// Строка статуса под полем (задача 192): семья, режим и модель с усилием — одна группа чипов, в этом порядке; у каждой подпись для чтения с экрана.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

test('группа status-group: семья, режим, модель·усилие подряд, затем кольцо и спиннер вне группы', () => {
  const group = view.match(/const statusGroup = h\(doc, 'div', \{ class: 'status-group' \}, ([^)]*)\);/);
  assert.ok(group, 'группа есть');
  const names = group[1].split(',').map((x) => x.trim());
  assert.deepEqual(names.filter((n) => n.endsWith('Button')), ['familyButton', 'modeButton', 'modelButton']);
  assert.ok(names.indexOf('familyButton') < names.indexOf('modeButton') && names.indexOf('modeButton') < names.indexOf('modelButton'));
  const row = view.match(/const status = h\(doc, 'div', \{ class: 'composer-status', hidden: true \}, ([^;]*)\);/);
  assert.match(row[1], /statusGroup, ringBox, spinner/);
});

test('у каждого чипа title и aria-label; группа прижата вправо, на узком экране переносится влево', () => {
  for (const name of ['familyButton', 'modeButton', 'modelButton']) {
    const line = view.split('\n').find((l) => l.includes(`const ${name} = h(doc, 'button'`));
    assert.match(line, /title: t\('(status\.agent|menu\.mode|status\.model)'\), 'aria-label': t\('(status\.agent|menu\.mode|status\.model)'\)/, name);
  }
  assert.match(css, /\.status-group \{[^}]*margin-left: auto/);
  assert.match(css, /@media \(max-width: 560px\)[^\r\n]*\.status-group \{ margin-left: 0/);
});
