#!/usr/bin/env node
// rename.mjs - applies rename-map.json (task 102) to the Nova files of a tree: the names of the product after task 091
// become the names of the dictionary version 6. Node only, no npm. Safe by word boundaries: a name inside another name
// (`PgEvent`, `ChatEvent`, `AgentLink`) is never touched; `Agent Client Protocol` stays.
//
// Usage:
//   node rename.mjs <tree> [--map <rename-map.json>] [--skip <dir-or-file-prefix>]... [--dry-run] [--quiet] [--json]
//   <tree>   a folder with *.nv files (for example `src` of a branch); it is searched recursively
//   --skip   a path prefix relative to <tree> that is not touched (repeatable), for example `--skip engine --skip chat`
//   --dry-run  changes nothing, prints what would change
//   --json   prints the result as JSON (files changed with counts per rule, files with manual work)
//
// What it does: every rule of "rules" (word renames and regex rewrites) on every *.nv file, in the order of the map; it is
// idempotent (a second run changes nothing). What it cannot do: the structure changes of "manual" (a machine that gave
// StepOutput now gives its orders to the Environment; a journal line has an event instead of kind and text; ...) - it prints
// every remaining occurrence of "manual_patterns" per file, as `file:line: text`, for the developer to rewrite.
// Exit code: 0 (done, also with manual work left), 2 (bad arguments or map).
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function fail(message) {
  console.error(`rename.mjs: ${message}`);
  process.exit(2);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseArguments(argv) {
  const options = { tree: null, map: join(here, 'rename-map.json'), skip: [], dryRun: false, quiet: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--map') options.map = argv[++i];
    else if (arg === '--skip') options.skip.push(argv[++i]);
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--')) fail(`unknown option ${arg}`);
    else if (options.tree === null) options.tree = arg;
    else fail(`unexpected argument ${arg}`);
  }
  if (options.tree === null) fail('usage: node rename.mjs <tree> [--map file] [--skip prefix]... [--dry-run] [--quiet] [--json]');
  return options;
}

export function loadMap(path) {
  if (!existsSync(path)) fail(`the map ${path} does not exist`);
  let map;
  try {
    map = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`the map ${path} is not JSON: ${error.message}`);
  }
  if (!Array.isArray(map.rules)) fail('the map has no "rules"');
  return map;
}

// The function of one rule: text -> { text, count }.
export function compileRule(rule, fileText) {
  if (rule.only_if_file_matches && !new RegExp(rule.only_if_file_matches).test(fileText)) return null;
  if (rule.type === 'word') {
    const skip = (rule.skip_followed_by ?? []).map((phrase) => `(?!${escapeRegExp(phrase)})`).join('');
    const skipBefore = (rule.skip_preceded_by ?? []).map((phrase) => `(?<!${escapeRegExp(phrase)})`).join('');
    const pattern = new RegExp(`${skipBefore}(?<![A-Za-z0-9_])${escapeRegExp(rule.old)}(?![A-Za-z0-9_])${skip}`, 'g');
    return (text) => {
      let count = 0;
      const out = text.replace(pattern, () => {
        count += 1;
        return rule.new;
      });
      return { text: out, count };
    };
  }
  if (rule.type === 'regex') {
    const pattern = new RegExp(rule.pattern, 'g');
    const skipReceiver = rule.skip_receiver ? new RegExp(rule.skip_receiver) : null;
    return (text) => {
      let count = 0;
      const out = text.replace(pattern, (...groups) => {
        const whole = groups[0];
        if (skipReceiver && groups.length > 2 && typeof groups[1] === 'string' && skipReceiver.test(groups[1])) return whole;
        count += 1;
        // expand $1..$9 of the replacement by hand: the groups are the arguments after the whole match
        return rule.replace.replace(/\$(\d)/g, (_, n) => (typeof groups[Number(n)] === 'string' ? groups[Number(n)] : ''));
      });
      return { text: out, count };
    };
  }
  fail(`rule ${rule.id}: unknown type ${rule.type}`);
  return null;
}

function listFiles(root, skip) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === 'target' || name === '.git') continue;
      const full = join(dir, name);
      const rel = relative(root, full).split(sep).join('/');
      if (skip.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
      const info = statSync(full);
      if (info.isDirectory()) walk(full);
      else if (name.endsWith('.nv')) found.push({ full, rel });
    }
  };
  walk(root);
  found.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return found;
}

export function applyToText(map, text) {
  const counts = {};
  let current = text;
  for (const rule of map.rules) {
    const run = compileRule(rule, current);
    if (run === null) continue;
    const { text: next, count } = run(current);
    if (count > 0) counts[rule.id] = count;
    current = next;
  }
  return { text: current, counts };
}

export function manualSites(map, text) {
  const sites = [];
  const patterns = (map.manual_patterns ?? []).map((source) => new RegExp(source));
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('//')) return;
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        sites.push({ line: index + 1, text: line.trim().slice(0, 160) });
        break;
      }
    }
  });
  return sites;
}

export function run(options) {
  const map = loadMap(options.map);
  const files = listFiles(options.tree, options.skip);
  const changed = [];
  const manual = [];
  for (const file of files) {
    const original = readFileSync(file.full, 'utf8');
    const { text, counts } = applyToText(map, original);
    if (text !== original) {
      changed.push({ file: file.rel, counts });
      if (!options.dryRun) writeFileSync(file.full, text, 'utf8');
    }
    const sites = manualSites(map, text);
    if (sites.length > 0) manual.push({ file: file.rel, sites });
  }
  return { files: files.length, changed, manual };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = run(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!options.quiet) {
    for (const item of result.changed) {
      const counts = Object.entries(item.counts).map(([id, n]) => `${id} x${n}`).join(', ');
      console.log(`${options.dryRun ? 'would change' : 'changed'} ${item.file}: ${counts}`);
    }
    for (const item of result.manual) {
      for (const site of item.sites) console.log(`manual ${item.file}:${site.line}: ${site.text}`);
    }
  }
  console.log(`${result.files} files, ${result.changed.length} ${options.dryRun ? 'to change' : 'changed'}, ${result.manual.reduce((n, m) => n + m.sites.length, 0)} sites for manual work in ${result.manual.length} files`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\//g, sep)) main();
