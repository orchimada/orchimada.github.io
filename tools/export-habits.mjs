#!/usr/bin/env node
/**
 * export-habits.mjs — Obsidian daily notes → habits.json
 *
 *   node tools/export-habits.mjs           # write habits.json (only if data changed)
 *   node tools/export-habits.mjs --dry     # print the summary, write nothing
 *
 * Parsing lives in habits-lib.mjs (shared with serve-habits.mjs, the live
 * local server). The write is idempotent: if nothing but the timestamp would
 * change, the file is left untouched — so the auto-publish watcher's
 * `git diff --quiet habits.json` genuinely means "nothing new".
 *
 * Publish = commit. Set HABITS_VAULT to override the vault location.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { payload, DEFAULT_VAULT } from './habits-lib.mjs';

const VAULT = process.env.HABITS_VAULT ?? DEFAULT_VAULT;
const OUT = fileURLToPath(new URL('../habits.json', import.meta.url));

let out;
try {
  out = payload(VAULT);
} catch (e) {
  console.error(`Cannot read ${VAULT}\n(${e.message})\nSet HABITS_VAULT to the Journal/Daily folder.`);
  process.exit(1);
}

const greens = out.days.filter((d) => d.green).length;
console.log(`${out.days.length} days · ${greens} green · ${out.issues.length} data issue(s)`);
for (const i of out.issues) console.log(`  ⚑ ${i.date} ${i.field}: ${i.value} — ${i.why}`);

if (process.argv.includes('--dry')) {
  console.log('(dry run — nothing written)');
  process.exit(0);
}

// idempotence: compare against the existing file with both timestamps blanked
let previous = null;
try { previous = JSON.parse(readFileSync(OUT, 'utf8')); } catch { /* first run */ }
const strip = (o) => JSON.stringify({ ...o, generated: null });
if (previous && strip(previous) === strip(out)) {
  console.log('no change — habits.json left untouched');
  process.exit(0);
}

writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`→ ${OUT}`);
