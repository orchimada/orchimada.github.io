/* ============================================================
   Import an Obsidian bookmarks table into pins.json.

   Reads a markdown file of `## Section` headings followed by
   |Title|Summary|Theme|Type|Notes| tables, and merges each row into
   pins.json as a pin. Existing pins are never touched — a row whose URL
   is already pinned is skipped, so re-running after adding bookmarks
   imports only what is new.

     node tools/import-bookmarks.mjs <file.md> [--images] [--dry]

     --images   fetch each page for an og:image (slow, best-effort)
     --dry      print what would happen, write nothing
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const SRC = args.find((a) => !a.startsWith('--'));
const WANT_IMAGES = args.includes('--images');
const DRY = args.includes('--dry');
const PINS = new URL('../../pins.json', import.meta.url).pathname;

if (!SRC) {
  console.error('usage: node tools/import-bookmarks.mjs <file.md> [--images] [--dry]');
  process.exit(1);
}

/* ── section heading → the rubric it becomes ── */
const SECTION_TAGS = [
  [/computer science|algorithm/i,        'cs'],
  [/software engineering|dev tools/i,    'swe'],
  [/^ai |artificial|machine learning/i,  'ai'],
  // Before the hardware rule: "Keyboards & hardware projects" matches both.
  [/keyboard/i,                          'keyboards'],
  [/electronics|hardware projects/i,     'hardware'],
  [/mathematics|physics/i,               'math'],
  // \b, or "Productivity & tools" lands here on the substring "product".
  [/business|\bproducts?\b|startup/i,    'product'],
  [/security|privacy/i,                  'security'],
  [/learning|cognition/i,                'learning'],
  [/design & creative|creative/i,        'design'],
  [/writing|ideas|culture/i,             'ideas'],
  [/music/i,                             'music'],
  [/games|interactive/i,                 'games'],
  [/robotics|simulation/i,               'robotics'],
  [/data|analytics|a\/b/i,               'data'],
  [/productivity/i,                      'productivity'],
  [/ux research|design ops/i,            'ux'],
  [/russian/i,                           'ru'],
  [/claude|coding agent/i,               'claude'],
];

/* ── Type column → a coarse bucket, most specific first ── */
const TYPE_TAGS = [
  [/interactive|demo/i,          'interactive'],
  [/book|zine|magazine/i,        'book'],
  [/repo/i,                      'repo'],
  [/course/i,                    'course'],
  [/paper|preprint|primary/i,    'paper'],
  [/podcast/i,                   'podcast'],
  [/talk|interview/i,            'talk'],
  [/tutorial|guide|playbook/i,   'guide'],
  [/reference|documentation|doc/i, 'reference'],
  [/tool|platform|app|product|project/i, 'tool'],
  [/artwork|album|fanfic/i,      'media'],
  [/newsletter|blog/i,           'blog'],
  [/article|essay|analysis|review|post/i, 'article'],
];

const firstMatch = (rules, text, fallback) => {
  for (const [re, tag] of rules) if (re.test(text)) return tag;
  return fallback;
};

/* ── markdown table parsing ── */

// Obsidian escapes parens inside link targets; unescape so the URL parses.
const unescapeMd = (s) => s.replace(/\\([()[\]|\\])/g, '$1');

function splitRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

function parseBookmarks(md) {
  const rows = [];
  let section = '';

  for (const raw of md.split('\n')) {
    const line = raw.trim();

    const heading = line.match(/^##\s+(.*)$/);
    if (heading) { section = heading[1].trim(); continue; }

    if (!line.startsWith('|')) continue;
    if (/^\|[\s|:-]+\|$/.test(line)) continue;          // the --- separator row

    const cells = splitRow(line);
    if (cells.length < 2) continue;

    const link = cells[0].match(/\[([^\]]+)\]\(([^)]*(?:\\\)[^)]*)*)\)/);
    if (!link) continue;                                 // header row, or prose

    const url = unescapeMd(link[2]).trim();
    if (!/^https?:\/\//i.test(url)) continue;

    rows.push({
      section,
      title: unescapeMd(link[1]).replace(/\s+/g, ' ').trim(),
      url,
      summary: (cells[1] || '').trim(),
      theme: (cells[2] || '').trim(),
      type: (cells[3] || '').trim(),
      notes: (cells[4] || '').trim(),
    });
  }
  return rows;
}

/* ── row → pin ── */

function toPin(row, stampMs) {
  const tags = [];

  const sec = firstMatch(SECTION_TAGS, row.section, null);
  if (sec) tags.push(sec);

  const type = firstMatch(TYPE_TAGS, `${row.type} ${row.theme}`, null);
  if (type && type !== sec) tags.push(type);

  // Russian-language items are scattered outside the Russian section too.
  if (/in russian|\(ru\)|russian-language/i.test(`${row.type} ${row.notes} ${row.section}`)
      && !tags.includes('ru')) {
    tags.push('ru');
  }

  // Summary says what it is; Notes says why it was kept. Both are worth having.
  const note = [row.summary, row.notes === '—' ? '' : row.notes]
    .filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();

  let site = '';
  try { site = new URL(row.url).hostname.replace(/^www\./, ''); } catch {}

  return {
    id: idFor(row.url),
    ts: new Date(stampMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    tg: 0,                       // 0 means "not from Telegram" — no edit/rm handle
    url: row.url,
    title: row.title,
    site,
    note,
    tags,
    image: '',
  };
}

// Deterministic id from the URL, so a re-import cannot produce a second id
// for a bookmark that was already brought in.
function idFor(url) {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(0, 8);
}

/* ── best-effort og:image ── */

// The page is served over HTTPS, so an http:// thumbnail is mixed content and
// the browser blocks it. GitHub is worse than useless here: og:image on a repo
// page is a *signed* repository-images URL that 401s once it expires, while
// opengraph.githubassets.com/1/<owner>/<repo> is stable and public.
function pinImage(pin, candidate) {
  if (!/^https:\/\//i.test(candidate)) return;
  if (/repository-images\.githubusercontent\.com/i.test(candidate)) return;
  pin.image = candidate;
}

function githubImage(url) {
  const m = url.match(/^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return '';
  return `https://opengraph.githubassets.com/1/${m[1]}/${m[2].replace(/\.git$/, '')}`;
}

async function fetchImage(pin) {
  const gh = githubImage(pin.url);
  if (gh) { pin.image = gh; return; }   // no request needed, and always valid

  try {
    const res = await fetch(pin.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; orchimada-pin-import/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) return;

    // Only the head matters, and some pages are enormous.
    const html = (await res.text()).slice(0, 200_000);
    const m = html.match(
      /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i
    );
    if (!m) return;
    const c = m[0].match(/content=["']([^"']+)["']/i);
    if (!c) return;

    pinImage(pin, new URL(c[1], res.url || pin.url).href);
  } catch {
    /* a bookmark that blocks us still pins — it just has no thumbnail */
  }
}

async function pool(items, size, worker) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
      if (++done % 20 === 0) process.stderr.write(`   …${done}/${items.length}\n`);
    }
  }));
}

/* ── main ── */

const md = fs.readFileSync(SRC, 'utf8');
const rows = parseBookmarks(md);
console.log(`parsed ${rows.length} bookmarks from ${path.basename(SRC)}`);

const existing = JSON.parse(fs.readFileSync(PINS, 'utf8'));
const seen = new Map();
for (const p of existing) seen.set(normUrl(p.url), p);

function normUrl(u) {
  try {
    const p = new URL(u);
    return (p.hostname.replace(/^www\./, '') + p.pathname.replace(/\/$/, '') + p.search).toLowerCase();
  } catch { return String(u).toLowerCase(); }
}

// The file has no dates. Stamp everything at the source file's mtime, one
// minute apart in document order, so the curated sequence survives the sort
// and every imported pin reads as the same day it was imported.
const base = fs.statSync(SRC).mtimeMs;

const fresh = [];
const dupes = [];
for (let i = 0; i < rows.length; i++) {
  const key = normUrl(rows[i].url);
  if (seen.has(key)) {
    // Same link listed under two sections: merge the rubrics, don't duplicate.
    const target = seen.get(key);
    const added = toPin(rows[i], 0).tags.filter((t) => !target.tags.includes(t));
    if (added.length) target.tags.push(...added);
    dupes.push(rows[i].title);
    continue;
  }
  const pin = toPin(rows[i], base - i * 60_000);
  seen.set(key, pin);
  fresh.push(pin);
}

console.log(`${fresh.length} new, ${dupes.length} already present or duplicated in-file`);
if (dupes.length) for (const d of dupes) console.log(`   merged tags: ${d}`);

if (WANT_IMAGES && fresh.length) {
  console.log(`fetching og:image for ${fresh.length} pins…`);
  await pool(fresh, 8, fetchImage);
  console.log(`   ${fresh.filter((p) => p.image).length} of ${fresh.length} have a thumbnail`);
}

const merged = [...existing, ...fresh]
  .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

// Every section must land on exactly one rubric, and the counts must add up.
// An unmapped section silently loses its rubric, so surface it loudly.
const bySection = new Map();
for (const r of rows) {
  const e = bySection.get(r.section) || { n: 0, tag: firstMatch(SECTION_TAGS, r.section, null) };
  e.n++;
  bySection.set(r.section, e);
}
console.log('\nsection → rubric');
let unmapped = 0;
for (const [name, { n, tag }] of bySection) {
  if (!tag) unmapped++;
  console.log(`  ${String(n).padStart(3)}  ${(tag || '‼ UNMAPPED').padEnd(13)} ${name}`);
}
if (unmapped) console.log(`\n‼ ${unmapped} section(s) have no rubric — add a rule to SECTION_TAGS`);

const tagCounts = {};
for (const p of merged) for (const t of p.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
console.log('\nrubrics: ' + Object.entries(tagCounts)
  .sort((a, b) => b[1] - a[1])
  .map(([t, n]) => `${t}(${n})`).join(' '));

if (DRY) {
  console.log(`\n--dry: pins.json unchanged (would hold ${merged.length})`);
} else {
  fs.writeFileSync(PINS, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nwrote ${merged.length} pins to pins.json`);
}
