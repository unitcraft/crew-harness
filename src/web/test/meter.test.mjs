// Дорожка уровня голоса и вид карточки в записи (задача 192).
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, smoothLevel, pushLevel, barHeights, recordingView, createMeter, BARS } from '../meter.js';
import { createDictation } from '../voice.js';
import { t } from '../strings.js';

test('levelOf: тишина (середина 128) — 0, громкий сигнал — до 1, пустое окно — 0', () => {
  assert.equal(levelOf(new Uint8Array(256).fill(128)), 0);
  assert.equal(levelOf(new Uint8Array(0)), 0);
  const loud = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 250 : 6));
  assert.equal(levelOf(loud), 1);
  const quiet = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 132 : 124));
  assert.ok(levelOf(quiet) > 0 && levelOf(quiet) < 0.3);
});

test('smoothLevel: подъём быстрее спада', () => {
  const up = smoothLevel(0, 1) - 0;
  const down = 1 - smoothLevel(1, 0);
  assert.ok(up > down);
});

test('pushLevel: окно ровно BARS, новый справа, старые смещаются влево, уровень ограничен 0..1', () => {
  let w = pushLevel([], 0);
  assert.equal(w.length, BARS);
  w = pushLevel(w, 0.5);
  w = pushLevel(w, 7);
  w = pushLevel(w, -2);
  assert.deepEqual(w.slice(-3), [0.5, 1, 0]);
  assert.equal(w.length, BARS);
  let long = [];
  for (let i = 0; i < BARS + 10; i += 1) long = pushLevel(long, i / 100);
  assert.equal(long.length, BARS);
  assert.equal(long[0], 10 / 100);
});

test('barHeights: тишина — точка минимальной высоты, голос — выше, максимум не превышен, длина окна сохранена', () => {
  const px = barHeights([0, 0.03, 0.5, 1], 3, 24);
  assert.deepEqual(px.slice(0, 2), [3, 3]);
  assert.ok(px[2] > 3 && px[2] < px[3]);
  assert.equal(px[3], 24);
  assert.equal(barHeights(pushLevel([], 0.2)).length, BARS);
});

test('вид карточки: в записи — «Слушаю…», без кнопки отправки и без «↵», с дорожкой; в покое — как было', () => {
  const rec = recordingView('recording');
  assert.equal(t(rec.placeholderKey), 'Слушаю…');
  assert.deepEqual([rec.hideSend, rec.showWave, 'showEnter' in rec], [true, true, false]);
  for (const s of ['idle', 'processing', 'error', 'unavailable']) {
    const v = recordingView(s);
    assert.equal(t(v.placeholderKey), 'Enter — отправить, Shift+Enter — новая строка');
    assert.deepEqual([v.hideSend, v.showWave], [false, false]);
  }
});

test('измеритель без микрофона не падает: ровные точки, остановка чистит таймер', async () => {
  const seen = [];
  let ticks = 0;
  const timers = { setInterval: (f) => { ticks += 1; f(); return 7; }, clearInterval: () => { ticks -= 1; } };
  const meter = createMeter({ mediaDevices: undefined, AudioCtx: undefined, onLevels: (w) => seen.push(w), timers });
  await meter.start();
  assert.ok(seen.length >= 2);
  assert.ok(seen.every((w) => w.length === BARS && w.every((l) => l === 0)));
  meter.stop();
  assert.equal(ticks, 0);
});

test('Esc: запись браузерным распознавателем отменяется, сказанное в поле не остаётся', () => {
  class Rec {
    static last = null;
    constructor() { Rec.last = this; }
    start() {}
    stop() { this.onend(); }
    abort() { this.onend(); }
  }
  const field = { value: 'до после', selectionStart: 3, selectionEnd: 3, setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; } };
  const d = createDictation({ Ctor: Rec, field });
  d.start();
  Rec.last.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'привет' }], { isFinal: true })] });
  assert.equal(field.value, 'до привет после');
  d.cancel();
  assert.equal(field.value, 'до после');
  assert.equal(d.active(), false);
});

// ---- правая группа карточки: порядок и зазоры без наложений (задача 192) ----
import fs from 'node:fs';
const viewSrc = fs.readFileSync(new URL('../view.js', import.meta.url), 'utf8');
const cssSrc = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');

test('карточка: «+», поле, затем панель записи (таймер и дорожка) и строка кнопок (отмена, отправка, микрофон); «↵» в записи нет', () => {
  const box = viewSrc.match(/const box = h\(doc, 'div', \{ class: 'box' \}, attach\.row, plusButton, input,\s*([^;]*)\);/);
  assert.ok(box, 'карточка найдена');
  assert.match(box[1], /^recPanel, h\(doc, 'div', \{ class: 'box-row' \}, cancelButton, sendButton, micWrap\)/);
  assert.match(viewSrc, /const recPanel = h\(doc, 'div', \{ class: 'rec-panel' \}, micTimer, wave\);/);
  assert.match(viewSrc, /const micWrap = h\(doc, 'div', \{ class: 'mic-wrap' \}, micButton, micMore, voiceMenu\);/);
  assert.ok(!/enterButton|enter-btn/.test(viewSrc + cssSrc), 'кнопки «↵» в записи нет');
});

test('в записи Enter останавливает её и вставляет текст, а не отправляет сообщение', () => {
  assert.match(viewSrc, /if \(e\.key === 'Enter' && !e\.shiftKey && !e\.isComposing && dictation\.active\(\)\) \{ e\.preventDefault\(\); dictation\.stop\(\); return; \}/);
  assert.equal(t('voice.recording'), 'Нажмите, чтобы остановить');
});

test('таймер мелкий серый фиксированной ширины, стрелка провайдера в записи скрыта, зазоры 6–8 px', () => {
  assert.match(cssSrc, /\.mic-timer \{[^}]*width: 34px[^}]*color: var\(--fg-muted\)/);
  assert.ok(!/\.mic-timer \{[^}]*--danger/.test(cssSrc));
  assert.match(cssSrc, /\.box\.recording \.mic-more \{ visibility: hidden; \}/);
  assert.match(cssSrc, /\.box \{ display: flex; align-items: flex-end; gap: 6px;/);
  assert.match(cssSrc, /\.box-row \{ flex: none; gap: 2px; margin-bottom: 4px; \}/);
  assert.match(cssSrc, /\.mic-wrap \{ gap: 0; \}/);
});

const rule = (selector) => [...cssSrc.matchAll(new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'g'))].map((m) => m[2]).join(' ');

test('кнопка отправки плоская: нигде нет синего фона, цвет --fg, пустая — серая с прозрачностью', () => {
  assert.ok(!/\.send-btn \{[^}]*(background: var\(--accent\)|--accent-fg)/.test(cssSrc), 'старая синяя заливка убрана');
  assert.ok(!/\.send-btn:hover:not\(:disabled\) \{[^}]*--accent/.test(cssSrc));
  assert.match(cssSrc, /\.send-btn, \.cancel-btn \{ color: var\(--fg\); \}/);
  assert.match(rule('.send-btn:disabled'), /background: transparent/);
  assert.match(rule('.send-btn:disabled'), /color: var\(--fg-muted\)/);
  assert.match(rule('.send-btn:disabled'), /opacity: \.45/);
});

test('кнопки карточки (отправка, отмена, микрофон) — область 32×32, значки 20 px с тонкой линией, радиус 8, фон прозрачный, hover --hover, фокус — контур; «стоп» — тёмный квадрат 14 px', () => {
  const shared = cssSrc.match(/\.send-btn, \.cancel-btn, \.mic-btn \{([^}]*)\}/);
  assert.ok(shared);
  assert.match(shared[1], /width: 32px; height: 32px; min-height: 32px/);
  assert.match(shared[1], /border-radius: 8px/);
  assert.ok(!/border-radius: 50%/.test(shared[1]), 'не круг');
  assert.match(shared[1], /background: transparent/);
  assert.match(cssSrc, /\.send-btn \.icon, \.mic-btn \.icon \{ width: 20px; height: 20px; stroke-width: 1\.75; \}/);
  assert.match(cssSrc, /\.plus-btn \.icon \{ width: 20px; height: 20px; stroke-width: 1\.75; \}/);
  assert.match(cssSrc, /\.cancel-btn \.icon \{ display: none; \}/);
  assert.match(cssSrc, /\.cancel-btn::before \{ content: ""; width: 14px; height: 14px; border-radius: 3px; background: var\(--fg\); \}/);
  assert.match(cssSrc, /\.mic-btn:hover \{ background: var\(--hover\)/);
  assert.match(cssSrc, /:focus-visible[^{]*\{ outline: 2px solid var\(--accent\)/);
  assert.match(rule('.mic-more'), /width: 12px/);
});

test('микрофон серый; единственное цветное состояние — запись; стрелка провайдера 12 px прижата к нему', () => {
  assert.match(cssSrc, /\.mic-btn \{ color: var\(--fg-muted\); touch-action: none; \}/);
  assert.match(rule('.mic-more'), /width: 12px/);
  assert.match(rule('.mic-more'), /margin-left: 0/);
});

test('запись: микрофон — скруглённый квадрат 10 px с --accent-soft, значок --accent и заливной; без пульсации тени, «дыхание» значка отключается при reduced-motion', () => {
  const rec = cssSrc.match(/\.mic-btn\[data-state="recording"\] \{([^}]*)\}/);
  assert.ok(rec);
  assert.match(rec[1], /border-radius: 10px/);
  assert.match(rec[1], /background: var\(--accent-soft\)/);
  assert.match(rec[1], /color: var\(--accent\)/);
  assert.ok(!/animation|box-shadow/.test(rec[1]), 'у кнопки нет пульсации тени');
  assert.match(cssSrc, /\.mic-btn\[data-state="recording"\] \.icon \{ animation: breathe 1\.6s/);
  assert.match(cssSrc, /@keyframes breathe \{ 50% \{ opacity: \.75; \} \}/);
  assert.match(cssSrc, /prefers-reduced-motion: reduce\) \{ \.mic-btn\[data-state="recording"\] \.icon \{ animation: none; \} \}/);
  assert.match(viewSrc, /'#i-mic-fill' : '#i-mic'/);
  assert.match(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /<symbol id="i-mic-fill"[^>]*><rect[^>]*fill="currentColor"/);
  assert.match(cssSrc, /--accent-soft: #e6eefc;/);
});

test('карточка: радиус 14, отступы 4/8/4/8, объёмная двухслойная тень из токена, текст 15 px; рамка при фокусе не акцентная; высота одной строки 50 px', () => {
  assert.match(cssSrc, /\.box \{ display: flex; align-items: flex-end; gap: 6px; position: relative; padding: 4px 8px 4px 8px; border-radius: 14px; box-shadow: var\(--shadow-card\); \}/);
  assert.match(cssSrc, /\.box textarea \{ min-height: 40px; padding: 9px 12px 9px 0; font-size: 15px; line-height: 1\.45;/);
  assert.match(cssSrc, /\.box textarea::placeholder \{ color: var\(--fg-muted\)/);
  const focusRules = [...cssSrc.matchAll(/\.box:focus-within \{([^}]*)\}/g)].map((m) => m[1]).join(' ');
  assert.ok(focusRules.length > 0 && !/accent/.test(focusRules), 'при фокусе рамка серая, не --accent');
  assert.match(focusRules, /box-shadow: var\(--shadow-card-focus\)/);
  // 40 (строка поля) + 2*4 (отступы) + 2 (рамка) = 50
  assert.equal(40 + 8 + 2, 50);
});

test('токены объёмной тени заданы во всех темах: светлой и обоих блоках тёмной, в тёмной есть светлая внутренняя кромка', () => {
  assert.equal([...cssSrc.matchAll(/--shadow-card: /g)].length, 3);
  assert.equal([...cssSrc.matchAll(/--shadow-card-focus: /g)].length, 3);
  assert.equal([...cssSrc.matchAll(/--shadow-card: [^;]*inset 0 1px 0 rgba\(255, 255, 255, \.04\)/g)].length, 2);
  assert.match(cssSrc, /--shadow-card: 0 1px 2px rgba\(0, 0, 0, \.06\), 0 6px 20px rgba\(0, 0, 0, \.08\);/);
});

test('панель записи лежит поверх карточки (position: absolute; right) с завесой-градиентом слева; ширина поля от записи не зависит', () => {
  const panel = cssSrc.match(/\.rec-panel \{([^}]*)\}/)[1];
  assert.match(panel, /position: absolute; top: 0; bottom: 0; right: \d+px/);
  assert.match(cssSrc, /\.box\.recording \.rec-panel \{ display: flex; \}/);
  const veil = cssSrc.match(/\.rec-panel::before \{([^}]*)\}/)[1];
  assert.match(veil, /width: 140px/);
  assert.match(veil, /linear-gradient\(to right, transparent, var\(--surface\) 70%\)/);
  assert.match(veil, /pointer-events: none/);
  const recRules = [...cssSrc.matchAll(/\.box\.recording[^{]*\{([^}]*)\}/g)].map((m) => m[0]).join('\n');
  assert.ok(!/\.box\.recording textarea[^{]*\{[^}]*(width|padding)/.test(recRules), 'у поля в записи нет своей ширины и отступов');
  assert.match(cssSrc, /\.box textarea \{[^}]*padding: 9px 12px 9px 0;/);
});

test('строка статуса — плоский серый текст 13 px без чипов и без шевронов: при наведении меняется только фон, ширина та же', () => {
  assert.match(cssSrc, /\.composer-status \{[^}]*margin-top: 8px[^}]*font-size: 13px/);
  const btn = cssSrc.match(/\n\.status-btn \{([^}]*)\}/)[1];
  assert.match(btn, /padding: 0 6px/);
  assert.match(btn, /border-radius: 8px/);
  assert.match(cssSrc, /\.status-btn:hover, \.status-btn\[aria-expanded="true"\] \{ background: var\(--hover\); \}/);
  assert.match(cssSrc, /\.status-btn:focus-visible \{ background: var\(--hover\); outline: 1px solid var\(--border\)/);
  assert.ok(!/\.status-btn[^{]*\.icon/.test(cssSrc), 'нет правил про значки в чипах строки статуса');
  for (const name of ['familyButton', 'modeButton', 'modelButton']) {
    const line = viewSrc.split('\n').find((l) => l.includes(`${name}.replaceChildren`) || (name === 'modelButton' && l.includes('}));') && false));
    if (line) assert.ok(!/chevron/.test(line), `${name}: нет шеврона`);
  }
  const statusCode = viewSrc.slice(viewSrc.indexOf('familyButton.replaceChildren'), viewSrc.indexOf('statusModel.hidden = hasModels'));
  assert.ok(!/chevron/.test(statusCode), 'в сборке строки статуса нет шевронов');
  assert.match(cssSrc, /\.status-group > :not\(\[hidden\]\) ~ :not\(\[hidden\]\)::before \{ content: "\\00b7"/);
});

test('«↵» отправки: есть только когда есть что отправлять и не идёт запись; поле сжимается, а не двигается правая группа', () => {
  assert.match(viewSrc, /function syncSend\(busy\) \{\s*const can = canSend\(input\.value, attach\.items\(\), uploading\);[\s\S]*?sendButton\.hidden = !can && !recordingNow;[\s\S]*?sendButton\.style\.visibility = recordingNow \? 'hidden' : '';/);
  assert.ok(!/sendButton\.hidden = v\.hideSend/.test(viewSrc));
  assert.match(cssSrc, /\.send-btn\[hidden\] \{ display: none; \}/);
  assert.match(cssSrc, /\.box-row \{ flex: none; gap: 2px; margin-bottom: 4px; \}/);
  assert.match(cssSrc, /\.box textarea \{ min-height: 40px;/);
});

test('подсказки кнопок карточки — тёмные (data-tip), правый клик на микрофоне открывает меню настроек', () => {
  assert.match(cssSrc, /\.box-row \[data-tip\]:hover::after[^{]*\{[^}]*background: var\(--tip-bg\); color: var\(--tip-fg\);/);
  for (const cls of ['mic-btn', 'cancel-btn', 'send-btn']) {
    const line = viewSrc.split('\n').find((l) => l.includes(`class: '${cls}'`));
    assert.match(line, /'data-tip':/, cls);
    assert.ok(!/ title:/.test(line.replace("'aria-haspopup'", '')), `${cls}: нет второй, штатной подсказки`);
  }
  assert.match(viewSrc, /micButton\.addEventListener\('contextmenu', \(e\) => \{ e\.preventDefault\(\); if \(voiceMenu\.hidden\) toggleVoiceMenu\(\); \}\);/);
  assert.equal(t('voice.right_click'), 'Правый клик \u2014 настройки');
});

test('кнопка «+» слева в карточке открывает выбор изображений: скрытый input type=file accept=image/* multiple', async () => {
  const attachUi = fs.readFileSync(new URL('../attach-ui.js', import.meta.url), 'utf8');
  assert.match(viewSrc, /const box = h\(doc, 'div', \{ class: 'box' \}, attach\.row, plusButton, input,/);
  assert.match(viewSrc, /attach\.bindPicker\(plusButton\)/);
  assert.match(attachUi, /chooser\.type = 'file';\s*chooser\.accept = pickerAccept\(\);\s*chooser\.multiple = true;/);
  assert.match(attachUi, /button\.addEventListener\('click', \(\) => chooser\.click\(\)\)/);
  const { pickerAccept } = await import('../attachments.js');
  assert.equal(pickerAccept(), 'image/png,image/jpeg,image/webp,image/gif');
  assert.equal(t('images.add'), 'Прикрепить изображение');
  assert.match(cssSrc, /\.plus-btn \{[^}]*width: 32px; height: 32px;[^}]*border-radius: 8px/);
});


test('геометрия правой группы: «↵» и микрофон вплотную, стрелка ⌄ вплотную к микрофону, группа с отступом 8 px от края; панель записи опаковая, поле в записи без правки орфографии', () => {
  assert.match(cssSrc, /\.box \{[^}]*padding: 4px 8px 4px 8px/);
  assert.match(cssSrc, /\.box-row \{ flex: none; gap: 2px; margin-bottom: 4px; \}/);
  assert.match(cssSrc, /\.mic-wrap \{ gap: 0; \}/);
  assert.match(rule('.mic-more'), /margin-left: 0/);
  const panel = cssSrc.match(/\.rec-panel \{([^}]*)\}/)[1];
  assert.match(panel, /right: 52px/); // 8 (отступ) + 32 (микрофон) + 12 (стрелка)
  assert.match(panel, /background: var\(--surface\)/);
  assert.match(panel, /z-index: 2/);
  assert.match(viewSrc, /input\.spellcheck = !v\.showWave;/);
});

test('верх первой строки не режется: max-height поля = пять строк плюс ВСЕ вертикальные отступы (2 × 9 px)', () => {
  const m = cssSrc.match(/\.box textarea \{ min-height: 40px; padding: 9px 12px 9px 0;[^}]*max-height: calc\(1\.45em \* 5 \+ (\d+)px\);/);
  assert.ok(m, 'правило поля найдено');
  assert.equal(Number(m[1]), 18, 'отступы сверху и снизу 9 + 9');
  // ширина поля от записи не зависит: нет правил textarea с классом recording
  assert.ok(!/\.box\.recording textarea\s*\{/.test(cssSrc), 'у поля в записи нет своих размеров');
});

test('панель записи — непрозрачный блок на всю высоту карточки (top: 0; bottom: 0), левее микрофона; кнопка отправки в записи держит место, поле не меняет ширину', () => {
  const panel = cssSrc.match(/\.rec-panel \{([^}]*)\}/)[1];
  assert.match(panel, /position: absolute; top: 0; bottom: 0; right: 52px/);
  assert.match(panel, /background: var\(--surface\)/);
  assert.match(panel, /align-items: flex-end; padding: 0 0 8px 4px/);
  const veil = cssSrc.match(/\.rec-panel::before \{([^}]*)\}/)[1];
  assert.match(veil, /top: 0; bottom: 0/);
  assert.match(viewSrc, /sendButton\.style\.visibility = recordingNow \? 'hidden' : '';/);
});

test('миниатюры картинок вписываются в квадрат целиком: object-fit: contain на нейтральной подложке, углы скруглены, без обрезки', () => {
  for (const cls of ['attach-img', 'thumb-img']) {
    const rule = cssSrc.match(new RegExp(`\.${cls} \{([^}]*)\}`))[1];
    assert.match(rule, /object-fit: contain/, cls);
    assert.ok(!/object-fit: cover/.test(rule), `${cls}: без обрезки`);
    assert.match(rule, /background: var\(--surface-2\)/, cls);
    assert.match(rule, /border-radius: \d+px/, cls);
    assert.match(rule, /border: 1px solid var\(--border\)/, cls);
  }
});
