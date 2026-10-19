// rename.test.mjs - the test of rename.mjs: on a copy of the tree src/ of the base commit (origin/main before task 102) the script gives
// the result recorded in rename-map.json ("files": the rules applied per file and the hash of the result), and for the files that the
// task changed by renames alone the result is the file of the task itself.
//
//   node --test doc/tasks/102-align-glossary/rename.test.mjs
//
// Needs `git` and the commit named in the map ("base.commit") in the repository; no npm.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run, loadMap, applyToText, manualSites } from './rename.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const mapPath = join(here, 'rename-map.json');
const map = loadMap(mapPath);
const repo = execFileSync('git', ['-C', here, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const lf = (text) => text.replace(/\r\n/g, '\n');
const sha = (text) => createHash('sha256').update(lf(text)).digest('hex');

// the *.nv files of src/ of the base commit, written to a temporary folder (git only, no tar)
function materialize(commit) {
  const dir = mkdtempSync(join(tmpdir(), 'rename-test-'));
  const listing = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '--name-only', commit, 'src'], { encoding: 'utf8' })
    .split(String.fromCharCode(10)).filter(Boolean);
  for (const path of listing) {
    if (!path.endsWith('.nv')) continue;
    const bytes = execFileSync('git', ['-C', repo, 'show', `${commit}:${path}`], { maxBuffer: 1 << 26 });
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), bytes);
  }
  return dir;
}

test('the map is well formed: every rule has an id, a type and a replacement', () => {
  const ids = new Set();
  for (const rule of map.rules) {
    assert.ok(rule.id && !ids.has(rule.id), `rule id ${rule.id}`);
    ids.add(rule.id);
    assert.ok(rule.type === 'word' || rule.type === 'regex');
    if (rule.type === 'word') assert.ok(rule.old && rule.new);
    else assert.ok(rule.pattern && typeof rule.replace === 'string');
  }
  assert.ok(map.base && map.base.commit);
  assert.ok(Object.keys(map.files).length >= 8);
});

test('word boundaries: a name inside another name is never touched', () => {
  const sample = [
    'import postgres.{PgEvent, ParamValue}',
    'type ChatEvent enum | Cancel',
    'type AgentLink { out ChanTx[str] }',
    '// Agent Client Protocol, JSON-RPC 2.0',
    '// `ListenerMsg.Event { event: ... }`',
    'fn f(event Event) -> Event => Event.word("a", "b")',
    'with Agent = acp_agent(client) { Agent.send(r) }',
    'let n = listener.accept(1)',
    ''
  ].join('\n');
  const { text } = applyToText(map, sample);
  assert.ok(text.includes('PgEvent'));
  assert.ok(text.includes('ChatEvent'));
  assert.ok(text.includes('AgentLink'));
  assert.ok(text.includes('Agent Client Protocol'));
  assert.ok(text.includes('ListenerMsg.Event'));
  assert.ok(text.includes('fn f(event Incoming) -> Incoming => Incoming.word("a", "b")'));
  assert.ok(text.includes('with Link = acp_link(client) { Link.send(r) }'));
  assert.ok(text.includes('listener.accept(1)'));
});

test('accept becomes on_arrival only in a file that imports the engine, and not for a socket', () => {
  const engineFile = 'import crew_harness.engine.{Engine}\nfn f(mut e Engine[ChatSession]) { e.accept(event) }\nfn g() { ro c = listener.accept() }\n';
  const other = 'fn f() { ro c = listener.accept() }\nfn g(e Thing) { e.accept(1) }\n';
  assert.ok(applyToText(map, engineFile).text.includes('e.on_arrival(event)'));
  assert.ok(applyToText(map, engineFile).text.includes('listener.accept()'));
  assert.ok(applyToText(map, engineFile).text.includes('Engine[ChatSession, ChatState]'));
  assert.equal(applyToText(map, other).text, other);
});

test('the script is idempotent: a second run changes nothing', () => {
  const sample = 'fn f(e Event) -> Option[Event] { with Agent = acp_agent(c) { Agent.receive() } }\n';
  const once = applyToText(map, sample).text;
  assert.equal(applyToText(map, once).text, once);
});

test('on a copy of src/ of the base commit the script gives the recorded result, and the files of the task that are renames alone', () => {
  const dir = materialize(map.base.commit);
  try {
    const tree = join(dir, 'src');
    const result = run({ tree, map: mapPath, skip: ['engine', 'chat'], dryRun: false });
    const changed = Object.fromEntries(result.changed.map((item) => [`src/${item.file}`, item]));
    assert.deepEqual(Object.keys(changed).sort(), Object.keys(map.files).sort(), 'the same files are changed');
    for (const [file, expected] of Object.entries(map.files)) {
      assert.deepEqual(changed[file].counts, expected.rules, `rules applied to ${file}`);
      const after = readFileSync(join(dir, file), 'utf8');
      assert.equal(sha(after), expected.sha256_after, `result of ${file}`);
    }
    // the second run changes nothing
    const again = run({ tree, map: mapPath, skip: ['engine', 'chat'], dryRun: false });
    assert.equal(again.changed.length, 0);
    // no old name is left in the files of the tree that the script owns (the word rules)
    for (const rule of map.rules.filter((r) => r.type === 'word')) {
      for (const file of Object.keys(map.files)) {
        const text = readFileSync(join(dir, file), 'utf8');
        const left = text.split('\n').filter((line) => {
          const probe = new RegExp(`(?<![A-Za-z0-9_])${rule.old}(?![A-Za-z0-9_])`);
          if (!probe.test(line)) return false;
          if ((rule.skip_preceded_by ?? []).some((p) => line.includes(`${p}${rule.old}`))) return false;
          if ((rule.skip_followed_by ?? []).some((p) => line.includes(`${rule.old}${p}`))) return false;
          return true;
        });
        // the comment of wire.nv names the old type on purpose
        const allowed = file === 'src/pgdb/wire.nv' ? left.filter((l) => !l.includes('ListenerMsg.Event')) : left;
        assert.deepEqual(allowed, [], `${rule.old} is left in ${file}`);
      }
    }
    // the report of the manual work names the files the map lists
    const sites = new Set(result.manual.map((m) => `src/${m.file}`));
    for (const file of map.manual_files) assert.ok(sites.has(file), `manual work in ${file}`);
    assert.ok(manualSites(map, 'let x StepOutput = 1\n').length === 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// If later work changes these files, the check below is the one to update: regenerate "files" of the map from the base commit.
test('the files of the task that are renames alone equal the result of the script', () => {
  const exact = Object.entries(map.files).filter(([, v]) => v.same_as_task_result);
  assert.ok(exact.length >= 6, 'at least six files are pure renames');
  for (const [file, expected] of exact) {
    const mine = join(repo, file);
    assert.ok(existsSync(mine), `${file} exists`);
    assert.equal(sha(readFileSync(mine, 'utf8')), expected.sha256_after, `${file} of the task is what the script gives`);
  }
});
