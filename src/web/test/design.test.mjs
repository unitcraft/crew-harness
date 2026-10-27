import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(web, name), 'utf8');

test('composer has no fake model/mode/effort selectors; the model slot has responsive styling', () => {
  const view = read('view.js');
  const mock = read('mock.js');
  const strings = read('strings.js');
  const css = read('app.css');

  assert.doesNotMatch(view, /opt-model|opt-mode|opt-effort|modelField|modeField|effortField/);
  assert.doesNotMatch(mock, /MODELS|MODES|EFFORTS|model\.(?:base|fast|deep)/);
  assert.doesNotMatch(strings, /model\.(?:base|fast|deep)|composer\.model_label/);
  assert.match(css, /@media\s*\(max-width:\s*799px\)/);
});
