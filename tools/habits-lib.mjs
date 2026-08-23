/**
 * habits-lib.mjs — the one parser both the exporter and the live server use.
 *
 * collect(vaultDailyDir) → { days, issues }
 *
 * Reads the YAML frontmatter of every YYYY-MM-DD.md note, cleans it, and
 * refuses anything out of range (the refusals land in `issues` and on the
 * dashboard's instrument check). Booleans and numbers only — never note text.
 * Fields in EXCLUDE are never exported even though the template has them;
 * the published site is public.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const DEFAULT_VAULT = join(
  homedir(),
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/Orchilux/Journal/Daily'
);

const BOOLS = [
  'lights_out_ok', 'career_floor', 'product_floor', 'wellness_floor', 'hobby_floor',
  'decision_journal', 'said_no_today', 'judgment_drill', 'systems_reps',
  'meditation', 'journalled', 'sport', 'family_time',
  'morning_routine', 'movement', 'reading', 'watercolor', 'trumpet',
];
const COUNTS  = ['conversations', 'messages_sent', 'predictions'];            // int ≥ 0
const MINUTES = ['artifact_min', 'career_min', 'craft_min', 'mcu_min'];       // int ≥ 0
const SCALES  = ['sleep_quality', 'mood', 'energy', 'focus'];                 // 1–5 only
const HOURS   = ['sleep_hours'];                                              // 0–14
const TIMES   = ['sleep_at', 'wake_at'];                                      // "HH:MM"

const EXCLUDE = new Set(['therapy']);

function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (!kv) continue;
    out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

// "01:10 AM" | "1:15 am" | "00:43" | "23:55" → minutes-of-day, or null
function parseTime(raw) {
  if (!raw) return null;
  const m = String(raw).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23) return null;
  return h * 60 + min;
}
const hhmm = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

export function collect(vaultDaily) {
  const issues = [];
  const flag = (date, field, value, why) =>
    issues.push({ date, field, value: String(value), why });

  const names = readdirSync(vaultDaily)
    .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort();

  const days = [];
  for (const name of names) {
    const date = name.slice(0, -3);
    const fm = frontmatter(readFileSync(join(vaultDaily, name), 'utf8'));
    if (!fm) { flag(date, '(file)', '—', 'no frontmatter'); continue; }

    const d = { date };
    const has = (k) => fm[k] !== undefined && fm[k] !== '';

    for (const k of BOOLS) if (!EXCLUDE.has(k) && has(k)) d[k] = fm[k] === 'true';

    for (const k of [...COUNTS, ...MINUTES]) {
      if (EXCLUDE.has(k) || !has(k)) continue;
      const n = Number(fm[k]);
      if (!Number.isInteger(n) || n < 0 || n > 24 * 60) { flag(date, k, fm[k], 'not a count ≥ 0 — dropped'); continue; }
      d[k] = n;
    }

    for (const k of SCALES) {
      if (EXCLUDE.has(k) || !has(k)) continue;
      const n = Number(fm[k]);
      if (!Number.isFinite(n) || n < 1 || n > 5) { flag(date, k, fm[k], 'outside 1–5 — dropped'); continue; }
      d[k] = n;
    }

    for (const k of HOURS) {
      if (EXCLUDE.has(k) || !has(k)) continue;
      const n = Number(fm[k]);
      if (!Number.isFinite(n) || n <= 0 || n > 14) { flag(date, k, fm[k], 'not plausible hours — dropped'); continue; }
      d[k] = n;
    }

    for (const k of TIMES) {
      if (EXCLUDE.has(k) || !has(k)) continue;
      const mins = parseTime(fm[k]);
      if (mins === null) { flag(date, k, fm[k], 'unreadable time — dropped'); continue; }
      d[k] = hhmm(mins);
      if (k === 'sleep_at') {
        // bedtime relative to midnight: 23:30 → −30, 02:15 → +135 (evening = 18:00+)
        d.sleep_at_rel = mins >= 18 * 60 ? mins - 24 * 60 : mins;
      }
    }

    d.green = !!(d.career_floor && d.product_floor && d.wellness_floor);
    days.push(d);
  }

  return { days, issues };
}

export function payload(vaultDaily) {
  const { days, issues } = collect(vaultDaily);
  return {
    generated: new Date().toISOString(),
    source: 'Journal/Daily frontmatter — booleans and numbers only, no note text',
    days,
    issues,
  };
}
