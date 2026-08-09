/* Exercise pins.html's pure view logic: escaping, url safety, filtering,
   and the rubric grouping's invariants against the real pins.json. */
import fs from 'fs';

const html = fs.readFileSync(new URL('../../pins.html', import.meta.url), 'utf8');
const js = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];

// Everything from the helpers down to (but not including) render(), which is DOM-bound.
const start = js.indexOf('/* ── helpers ── */');
const end = js.indexOf('  function render()');
if (start < 0 || end < 0) throw new Error('could not slice the view helpers');

const H = new Function(`
  var sel = [], q = '';
  ${js.slice(start, end)}
  return { esc, safeUrl, host, when, hilite, matches, card,
           setFilter: function(tags, s){ sel = [].concat(tags || []); q = s || ''; } };
`)();

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};
const truthy = (name, got) => eq(name, !!got, true);

/* ── url safety: pins.json is written by the pipeline, not by hand ── */
eq('rejects javascript:', H.safeUrl('javascript:alert(1)'), '');
eq('rejects data:', H.safeUrl('data:text/html,<script>alert(1)</script>'), '');
eq('rejects vbscript:', H.safeUrl('vbscript:msgbox(1)'), '');
eq('rejects nonsense', H.safeUrl('¯\\_(ツ)_/¯'), '');
eq('keeps https', H.safeUrl('https://ex.com/a?b=1#c'), 'https://ex.com/a?b=1#c');
eq('keeps http', H.safeUrl('http://ex.com/'), 'http://ex.com/');

/* ── escaping ── */
eq('escapes angle brackets', H.esc('<img src=x onerror=alert(1)>'),
  '&lt;img src=x onerror=alert(1)&gt;');
eq('escapes quotes and ampersands', H.esc(`a&b"c'd`), 'a&amp;b&quot;c&#39;d');
eq('null becomes empty', H.esc(null), '');

/* ── hilite must escape before it marks ── */
eq('hilite escapes the haystack', H.hilite('<b>hi</b>', ''), '&lt;b&gt;hi&lt;/b&gt;');
eq('hilite marks a plain match', H.hilite('hello world', 'world'), 'hello <mark>world</mark>');
truthy('hilite survives regex metacharacters in the needle',
  H.hilite('cost is $5 (net)', '$5 (').includes('<mark>'));
eq('a needle cannot inject markup', H.hilite('a<script>b', '<script>'), 'a&lt;script&gt;b');

/* ── a hostile pin cannot break out of the card ── */
const evil = H.card({
  url: 'https://ex.com/x" onmouseover="alert(1)',
  title: '<img src=x onerror=alert(1)>',
  note: '</a><script>alert(1)</script>',
  site: 'ex.com',
  ts: '2026-08-01T00:00:00Z',
  tags: ['<svg onload=alert(1)>'],
  image: 'javascript:alert(1)',
});
eq('no raw <script> in rendered card', /<script/i.test(evil), false);
eq('every tag in the card is one the template opened',
  (evil.match(/<\/?[a-z][^\s>]*/gi) || []).filter(t => !/^<\/?(a|span|img)$/i.test(t)), []);
eq('the href cannot be broken out of',
  /href="[^"]*"/.test(evil) && !/href="[^"]*[<>]/.test(evil), true);
eq('hostile image url is dropped', evil.includes('javascript:'), false);
truthy('hostile title is escaped', evil.includes('&lt;img src=x'));
eq('a card with an unusable url renders nothing',
  H.card({ url: 'javascript:alert(1)', title: 't', tags: [] }), '');

/* ── filtering: rubrics OR together, search ANDs on top ── */
const pins = [
  { url: 'https://a.com/1', title: 'Rust memory model', note: 'ownership', site: 'a.com', tags: ['cs', 'book'] },
  { url: 'https://b.com/2', title: 'CSS grid', note: 'subgrid at last', site: 'b.com', tags: ['design'] },
  { url: 'https://c.com/3', title: 'Ложка', note: 'любопытно', site: 'c.com', tags: ['ru', 'article'] },
  { url: 'https://d.com/4', title: 'Zed', note: 'fast editor', site: 'd.com', tags: ['swe', 'tool'] },
];
const titles = () => pins.filter(H.matches).map(p => p.title);

H.setFilter([], '');
eq('no selection passes everything', titles().length, 4);

H.setFilter(['design'], '');
eq('one rubric narrows', titles(), ['CSS grid']);

H.setFilter(['design', 'ru'], '');
eq('two rubrics are OR, not AND', titles(), ['CSS grid', 'Ложка']);

H.setFilter(['cs', 'swe', 'design'], '');
eq('a whole group selection is still OR', titles().length, 3);

H.setFilter(['design', 'ru'], 'subgrid');
eq('search ANDs on top of the OR', titles(), ['CSS grid']);

H.setFilter([], 'rust');
eq('search hits the tag', titles(), ['Rust memory model']);
H.setFilter([], 'a.com');
eq('search hits the host', titles(), ['Rust memory model']);
H.setFilter([], 'любопытно');
eq('search works in cyrillic', titles(), ['Ложка']);
H.setFilter(['design'], 'rust');
eq('a contradictory filter yields nothing', titles().length, 0);

/* ── host + dates ── */
H.setFilter([], '');
eq('host strips www', H.host({ url: 'https://www.ex.com/a' }), 'ex.com');
eq('host prefers the stored site', H.host({ url: 'https://x.io/a', site: 'www.Real.com' }), 'Real.com');
eq('host tolerates a broken url', H.host({ url: 'nope' }), '');
eq('undated pin renders no date', H.when(undefined), '');
eq('today', H.when(new Date().toISOString()), 'today');
eq('3 days ago', H.when(new Date(Date.now() - 3 * 864e5).toISOString()), '3d ago');
eq('2 weeks ago', H.when(new Date(Date.now() - 15 * 864e5).toISOString()), '2w ago');

/* ── grouping invariants: a rubric must be shown exactly once, never lost ──
   The groups are hand-written but the tags are generated by the pipeline and
   by whatever hashtag gets typed into Telegram, so the two drift by default. */
const GROUPS = new Function(
  js.slice(js.indexOf('var TAG_GROUPS'), js.indexOf('var CATCH_ALL')) + 'return TAG_GROUPS;'
)();

const listed = GROUPS.flatMap(g => g[1]);
eq('no tag is listed in two groups', listed.length - new Set(listed).size, 0);

const pinData = JSON.parse(fs.readFileSync(new URL('../../pins.json', import.meta.url), 'utf8'));
const live = [...new Set(pinData.flatMap(p => p.tags || []))];
const mapped = new Set(listed);
const orphans = live.filter(t => !mapped.has(t));

// Orphans are fine — they render under the catch-all — but every live tag must
// land in exactly one place, and that place must exist.
eq('every live tag is either grouped or an orphan (none lost)',
  live.length, live.filter(t => mapped.has(t)).length + orphans.length);
console.log(`       ${live.length} live rubrics: ${live.length - orphans.length} grouped, ` +
  `${orphans.length} under the catch-all${orphans.length ? ' → ' + orphans.join(', ') : ''}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
