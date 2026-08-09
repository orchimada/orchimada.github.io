/* Exercise the Worker's pure helpers against real Telegram update shapes. */
import fs from 'fs';

const src = fs.readFileSync(
  new URL('../src/index.js', import.meta.url), 'utf8'
);
// Drop the fetch handler; keep the helpers, then hand them back.
const body = src.replace(/export default \{[\s\S]*?\n\};/, '');
const H = new Function(`${body}
  return { parse, normalizeUrl, tagFacets, indexOfBytes, decodeB64, encodeB64,
           timingSafeEqual, escapeHtml, truncate, finishEnrich, channelBody, githubImage };`)();

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

/* ── parse: the everyday message ── */
const text1 = 'https://example.com/thing the pointer-events trick #css #tools';
eq('plain link + note + tags', H.parse({
  text: text1,
  entities: [
    { type: 'url', offset: 0, length: 25 },
    { type: 'hashtag', offset: text1.indexOf('#css'), length: 4 },
    { type: 'hashtag', offset: text1.indexOf('#tools'), length: 6 },
  ],
}), { url: 'https://example.com/thing', note: 'the pointer-events trick', tags: ['css', 'tools'] });

/* ── parse: tags first, link last ── */
const text2 = '#weird look at this https://example.com/x';
eq('tags before link', H.parse({
  text: text2,
  entities: [
    { type: 'hashtag', offset: 0, length: 6 },
    { type: 'url', offset: text2.indexOf('https'), length: 25 },
  ],
}), { url: 'https://example.com/x', note: 'look at this', tags: ['weird'] });

/* ── parse: emoji before the entities (UTF-16 offset handling) ── */
const text3 = '🔥🔥 https://example.com/y neat #x';
const off3 = text3.indexOf('https');   // in UTF-16 units, same as Telegram
eq('emoji does not shift offsets', H.parse({
  text: text3,
  entities: [
    { type: 'url', offset: off3, length: 'https://example.com/y'.length },
    { type: 'hashtag', offset: text3.indexOf('#x'), length: 2 },
  ],
}), { url: 'https://example.com/y', note: '🔥🔥 neat', tags: ['x'] });

/* ── parse: Cyrillic note ── */
const text4 = 'https://example.com/z любопытная штука #находки';
eq('cyrillic note and tag', H.parse({
  text: text4,
  entities: [
    { type: 'url', offset: 0, length: 'https://example.com/z'.length },
    { type: 'hashtag', offset: text4.indexOf('#находки'), length: 8 },
  ],
}), { url: 'https://example.com/z', note: 'любопытная штука', tags: ['находки'] });

/* ── parse: no link at all ── */
eq('no link yields empty url', H.parse({ text: 'just a thought #hm',
  entities: [{ type: 'hashtag', offset: 15, length: 3 }] }),
  { url: '', note: 'just a thought', tags: ['hm'] });

/* ── parse: forwarded channel post with no link ── */
eq('forwarded channel post becomes a t.me pin', H.parse({
  text: 'worth keeping #meta',
  entities: [{ type: 'hashtag', offset: 14, length: 5 }],
  forward_origin: { type: 'channel', chat: { username: 'durov' }, message_id: 42 },
}), { url: 'https://t.me/durov/42', note: 'worth keeping', tags: ['meta'] });

/* ── parse: caption on a photo, duplicate tags ── */
eq('caption entities + dedupe', H.parse({
  caption: 'https://example.com/a #x #x',
  caption_entities: [
    { type: 'url', offset: 0, length: 21 },
    { type: 'hashtag', offset: 22, length: 2 },
    { type: 'hashtag', offset: 25, length: 2 },
  ],
}), { url: 'https://example.com/a', note: '', tags: ['x'] });

/* ── parse: text_link keeps its anchor prose ── */
eq('text_link keeps anchor text in the note', H.parse({
  text: 'this writeup is great',
  entities: [{ type: 'text_link', offset: 0, length: 12, url: 'https://example.com/w' }],
}), { url: 'https://example.com/w', note: 'this writeup is great', tags: [] });

/* ── normalizeUrl ── */
eq('strips utm noise',
  H.normalizeUrl('https://ex.com/p?utm_source=tg&id=7&fbclid=abc'), 'https://ex.com/p?id=7');
eq('adds a scheme', H.normalizeUrl('ex.com/p'), 'https://ex.com/p');
eq('rejects javascript:', H.normalizeUrl('javascript:alert(1)'), '');
eq('rejects garbage', H.normalizeUrl('not a url at all'), '');

/* ── base64 round-trip through non-ASCII (this is what pins.json holds) ── */
const sample = JSON.stringify([{ note: 'любопытно — 🔥 "quoted"', title: 'Ünïcøde' }]);
eq('base64 round-trip survives unicode', H.decodeB64(H.encodeB64(sample)), sample);
eq('decodeB64 tolerates the newlines GitHub inserts',
  H.decodeB64(H.encodeB64(sample).replace(/(.{60})/g, '$1\n')), sample);

/* ── Bluesky facets are UTF-8 byte offsets ── */
const btext = 'любопытно\n\n#css #tools';
const facets = H.tagFacets(btext, ['css', 'tools']);
const bytes = new TextEncoder().encode(btext);
const slice = (f) => new TextDecoder().decode(bytes.slice(f.index.byteStart, f.index.byteEnd));
eq('facet count', facets.length, 2);
eq('facet 1 points at #css', slice(facets[0]), '#css');
eq('facet 2 points at #tools', slice(facets[1]), '#tools');
eq('facet start is a byte offset, not a char offset', facets[0].index.byteStart, 20);

/* ── timing-safe compare ── */
eq('secret matches', H.timingSafeEqual('abc123', 'abc123'), true);
eq('secret mismatch', H.timingSafeEqual('abc123', 'abc124'), false);
eq('empty configured secret never matches', H.timingSafeEqual('', ''), false);
eq('length mismatch', H.timingSafeEqual('abc', 'abcd'), false);

/* ── channel body shape ── */
eq('channel body collapses the blank gap when the note is empty',
  H.channelBody({ title: 'T', note: '', tags: [], url: 'https://e.com' }).text,
  '<b>T</b>\n\nhttps://e.com');
eq('channel body escapes html in the title',
  H.channelBody({ title: '<script>', note: '', tags: [], url: 'https://e.com' }).text.startsWith('<b>&lt;script&gt;</b>'), true);

/* ── enrich fallback ── */
eq('falls back to the hostname when a page has no og tags',
  H.finishEnrich({ title: '', site: '', image: 'not-a-url', description: '' }, 'https://www.example.com/a/b'),
  { title: 'example.com', site: 'example.com', image: '', description: '' });

/* ── thumbnails must survive being looked at later ── */
const ghPin = H.finishEnrich(
  { title: 'BitNet', site: '', image: 'https://repository-images.githubusercontent.com/x/signed?token=abc', description: '' },
  'https://github.com/microsoft/BitNet');
eq('a github repo gets the stable og image, not the signed one',
  ghPin.image, 'https://opengraph.githubassets.com/1/microsoft/BitNet');

eq('an expiring signed image is dropped',
  H.finishEnrich({ title: 't', site: '', image: 'https://repository-images.githubusercontent.com/1/a?token=b', description: '' },
    'https://example.com/x').image, '');

eq('an http thumbnail is dropped as mixed content',
  H.finishEnrich({ title: 't', site: '', image: 'http://cdn.example.com/og.png', description: '' },
    'https://example.com/x').image, '');

eq('an https thumbnail is kept',
  H.finishEnrich({ title: 't', site: '', image: 'https://cdn.example.com/og.png', description: '' },
    'https://example.com/x').image, 'https://cdn.example.com/og.png');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
