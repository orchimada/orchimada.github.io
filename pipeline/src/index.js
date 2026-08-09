/* ============================================================
   PIN PIPELINE — Telegram → pins.json → channel + Bluesky
   One webhook. No server, no build, no database.

   Flow:  you DM the bot a link + a note + #tags
          → parse → enrich from og: tags → commit to the repo
          → mirror to the Telegram channel and Bluesky
          → bot replies with what it did
   ============================================================ */

const UA = 'orchimada-pin-pipeline/1.0 (+https://orchimada.github.io/pins.html)';
const FETCH_TIMEOUT = 8000;
const MAX_NOTE = 600;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check — also what you hit to confirm the deploy is live.
    if (request.method === 'GET' && url.pathname === '/') {
      return json({ ok: true, service: 'pin-pipeline' });
    }

    if (request.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }

    // Telegram signs every delivery with the secret registered at setWebhook
    // time. Without this check anyone who guesses the URL can post to the site.
    if (!timingSafeEqual(
      request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '',
      env.TG_WEBHOOK_SECRET || ''
    )) {
      return new Response('forbidden', { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response('bad json', { status: 400 });
    }

    // Always answer 200. A non-2xx makes Telegram redeliver the same update,
    // which would duplicate the pin — errors are reported in chat instead.
    try {
      await handle(update, env);
    } catch (err) {
      console.error('handler failed', err);
      const chat = (update.message || update.edited_message || {}).chat;
      if (chat) await tg(env, 'sendMessage', {
        chat_id: chat.id,
        text: '✗ ' + String(err.message || err).slice(0, 300),
      }).catch(() => {});
    }
    return new Response('ok');
  },
};

/* ════════════════════════════════════════════
   ROUTING
   ════════════════════════════════════════════ */

async function handle(update, env) {
  const msg = update.message || update.edited_message;
  if (!msg) return;

  // Only the owner may write to the site, whatever else finds the bot.
  if (String(msg.from?.id) !== String(env.TG_OWNER_ID)) {
    await tg(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: 'This bot is a private inbox.',
    });
    return;
  }

  const text = msg.text || msg.caption || '';

  if (/^\/(start|help)\b/.test(text)) return help(env, msg);
  if (/^\/rm\b/.test(text)) return remove(env, msg);

  if (update.edited_message) return edit(env, msg);
  return create(env, msg);
}

async function help(env, msg) {
  await tg(env, 'sendMessage', {
    chat_id: msg.chat.id,
    parse_mode: 'HTML',
    text: [
      '<b>Pin inbox</b>',
      '',
      'Send or forward anything with a link. Everything that is not the link',
      'and not a #tag becomes the note.',
      '',
      '<code>https://example.com  why it is worth keeping  #tools #weird</code>',
      '',
      '• <b>edit</b> the message → the pin updates',
      '• reply <code>/rm</code> to it → the pin is removed',
    ].join('\n'),
  });
}

/* ════════════════════════════════════════════
   PARSE
   ════════════════════════════════════════════ */

function parse(msg) {
  const text = msg.text || msg.caption || '';
  const entities = msg.entities || msg.caption_entities || [];

  const urls = [];
  const tags = [];
  const cuts = []; // [offset, length] spans to strip out of the note

  for (const e of entities) {
    // Telegram offsets are UTF-16 code units, which is what JS strings index in.
    const raw = text.substr(e.offset, e.length);
    if (e.type === 'url') {
      urls.push(raw);
      cuts.push([e.offset, e.length]);
    } else if (e.type === 'text_link') {
      urls.push(e.url);
      // The anchor text is prose — keep it in the note.
    } else if (e.type === 'hashtag') {
      tags.push(raw.slice(1).toLowerCase());
      cuts.push([e.offset, e.length]);
    }
  }

  // A forwarded public-channel post with no link of its own is still an
  // artifact — pin the post itself.
  if (!urls.length) {
    const o = msg.forward_origin;
    if (o?.type === 'channel' && o.chat?.username) {
      urls.push(`https://t.me/${o.chat.username}/${o.message_id}`);
    }
  }

  // Strip back-to-front so earlier offsets stay valid.
  let note = text;
  for (const [off, len] of cuts.sort((a, b) => b[0] - a[0])) {
    note = note.slice(0, off) + note.slice(off + len);
  }
  note = note.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);

  return {
    url: normalizeUrl(urls[0] || ''),
    note,
    tags: [...new Set(tags)],
  };
}

function normalizeUrl(u) {
  if (!u) return '';
  const withScheme = /^https?:\/\//i.test(u) ? u : 'https://' + u;
  try {
    const p = new URL(withScheme);
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return '';
    // Strip the tracking noise that comes with every shared link.
    for (const k of [...p.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|yclid|igshid|si$|ref$|ref_src$)/i.test(k)) {
        p.searchParams.delete(k);
      }
    }
    return p.href;
  } catch {
    return '';
  }
}

/* ════════════════════════════════════════════
   ENRICH — read the page's own metadata
   ════════════════════════════════════════════ */

// A repo page's og:image is a *signed* repository-images URL that 401s once it
// expires; this form is stable and public, and saves the request entirely.
function githubImage(url) {
  const m = url.match(/^https?:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/i);
  return m ? `https://opengraph.githubassets.com/1/${m[1]}/${m[2].replace(/\.git$/, '')}` : '';
}

async function enrich(url) {
  const out = { title: '', site: '', image: '', description: '' };
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) {
      return finishEnrich(out, url);
    }

    const pick = (want, into) => ({
      element(el) {
        const key = (el.getAttribute('property') || el.getAttribute('name') || '').toLowerCase();
        const val = el.getAttribute('content');
        if (key === want && val && !out[into]) out[into] = val.trim();
      },
    });

    // <title> is collected apart from og:title: the rewriter fires handlers in
    // document order, so a first-wins race would let whichever tag the page
    // happens to put first decide — and og:title is the one that should.
    let docTitle = '';
    await new HTMLRewriter()
      .on('meta', pick('og:title', 'title'))
      .on('meta', pick('og:site_name', 'site'))
      .on('meta', pick('og:image', 'image'))
      .on('meta', pick('og:description', 'description'))
      .on('meta', pick('twitter:title', 'title'))
      .on('meta', pick('twitter:image', 'image'))
      .on('meta', pick('description', 'description'))
      .on('title', { text(t) { docTitle += t.text; } })
      .transform(res)
      .arrayBuffer();

    if (!out.title) out.title = docTitle;

    // og:image is often relative — resolve against where we actually landed.
    if (out.image) {
      try { out.image = new URL(out.image, res.url || url).href; }
      catch { out.image = ''; }
    }
  } catch (err) {
    console.warn('enrich failed', url, String(err));
  }
  return finishEnrich(out, url);
}

function finishEnrich(out, url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  out.site = (out.site || host).slice(0, 80);
  out.title = (out.title || host || url).replace(/\s+/g, ' ').trim().slice(0, 200);
  out.description = out.description.replace(/\s+/g, ' ').trim().slice(0, 300);

  // The site is HTTPS, so an http:// thumbnail is mixed content and gets
  // blocked; a signed GitHub image would 401 by the time anyone scrolled to it.
  const gh = githubImage(url);
  if (gh) out.image = gh;
  else if (!/^https:\/\//i.test(out.image)
           || /repository-images\.githubusercontent\.com/i.test(out.image)) {
    out.image = '';
  }
  return out;
}

/* ════════════════════════════════════════════
   CREATE / EDIT / REMOVE
   ════════════════════════════════════════════ */

async function create(env, msg) {
  const { url, note, tags } = parse(msg);
  if (!url) {
    await tg(env, 'sendMessage', {
      chat_id: msg.chat.id,
      reply_to_message_id: msg.message_id,
      text: '✗ no link in that message. Send /help for the format.',
    });
    return;
  }

  const meta = await enrich(url);
  const pin = {
    id: shortId(),
    ts: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    tg: msg.message_id,
    url,
    title: meta.title,
    site: meta.site,
    note,
    tags,
    image: meta.image,
  };

  // Fan out first so the pin we commit carries the channel message id,
  // which is what makes a later edit or removal able to reach it.
  const fan = [];
  const channelId = await postToChannel(env, pin).catch((e) => {
    fan.push('channel ✗ ' + short(e)); return null;
  });
  if (channelId) { pin.ch = channelId; fan.push('channel ✓'); }

  await postToBluesky(env, pin)
    .then((did) => did && fan.push('bluesky ✓'))
    .catch((e) => fan.push('bluesky ✗ ' + short(e)));

  const result = await commit(env, `pin: ${pin.title}`, (pins) => {
    // Telegram redelivers on timeout; the message id keeps that idempotent.
    if (pins.some((p) => p.tg === pin.tg && p.tg !== 0)) return null;
    return [pin, ...pins];
  });

  if (result === null) return; // already pinned, nothing to say

  await tg(env, 'sendMessage', {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    text: [
      `✓ <b>pinned</b> — ${escapeHtml(pin.site)}`,
      tags.length ? tags.map((t) => '#' + t).join(' ') : '<i>no rubric</i>',
      `<a href="${escapeHtml(siteUrl(env))}">${escapeHtml(result)} pins on the site</a>`,
      fan.length ? '· ' + fan.join(' · ') : '',
    ].filter(Boolean).join('\n'),
  });
}

async function edit(env, msg) {
  const { url, note, tags } = parse(msg);
  if (!url) return;

  let touched = null;
  await commit(env, 'pin: edit', (pins) => {
    const i = pins.findIndex((p) => p.tg === msg.message_id);
    if (i === -1) return null;
    // Re-enrichment is skipped on edit: an edit is almost always about the
    // note or the tags, and the title you already saw is the one you kept.
    pins[i] = { ...pins[i], url, note, tags };
    touched = pins[i];
    return pins;
  });

  if (!touched) return;

  if (touched.ch && env.TG_CHANNEL_ID) {
    await tg(env, 'editMessageText', {
      chat_id: env.TG_CHANNEL_ID,
      message_id: touched.ch,
      parse_mode: 'HTML',
      ...channelBody(touched),
    }).catch(() => {});
  }

  await tg(env, 'sendMessage', {
    chat_id: msg.chat.id,
    reply_to_message_id: msg.message_id,
    text: '✓ updated',
  });
}

async function remove(env, msg) {
  const target = msg.reply_to_message?.message_id;
  if (!target) {
    await tg(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: '✗ reply /rm to the message you pinned.',
    });
    return;
  }

  let gone = null;
  await commit(env, 'pin: remove', (pins) => {
    const i = pins.findIndex((p) => p.tg === target);
    if (i === -1) return null;
    gone = pins[i];
    pins.splice(i, 1);
    return pins;
  });

  if (gone?.ch && env.TG_CHANNEL_ID) {
    await tg(env, 'deleteMessage', {
      chat_id: env.TG_CHANNEL_ID,
      message_id: gone.ch,
    }).catch(() => {});
  }

  await tg(env, 'sendMessage', {
    chat_id: msg.chat.id,
    // Bluesky is append-only here — say so rather than imply a full retraction.
    text: gone
      ? '✓ removed from the site and the channel' + (env.BSKY_HANDLE ? ' (Bluesky post stays)' : '')
      : '✗ that message is not a pin',
  });
}

/* ════════════════════════════════════════════
   GITHUB — read-modify-write pins.json
   ════════════════════════════════════════════ */

async function commit(env, message, mutate) {
  const path = env.GH_PATH || 'pins.json';
  const branch = env.GH_BRANCH || 'master';   // this repo publishes from master
  const base = `https://api.github.com/repos/${env.GH_REPO}/contents/${path}`;

  // The sha makes the write a compare-and-swap. Two pins sent seconds apart
  // collide on it rather than silently overwriting each other, so we re-read
  // and re-apply instead of retrying blind.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await gh(env, `${base}?ref=${encodeURIComponent(branch)}`);
    if (!res.ok) throw new Error(`github read ${res.status}`);
    const file = await res.json();

    let pins;
    try {
      pins = JSON.parse(decodeB64(file.content));
    } catch {
      throw new Error('pins.json is not valid JSON');
    }
    if (!Array.isArray(pins)) throw new Error('pins.json must be an array');

    const next = mutate(pins);
    if (next === null) return null; // no-op, decided by the caller

    const put = await gh(env, base, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: encodeB64(JSON.stringify(next, null, 2) + '\n'),
        sha: file.sha,
        branch,
      }),
    });

    if (put.ok) return next.length;
    if (put.status === 409 || put.status === 422) continue; // someone else won, redo
    throw new Error(`github write ${put.status}: ${short(await put.text())}`);
  }
  throw new Error('github write kept conflicting');
}

function gh(env, url, init = {}) {
  return fetch(url, {
    ...init,
    headers: {
      'Authorization': `Bearer ${env.GH_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': UA,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
}

/* ════════════════════════════════════════════
   FAN-OUT
   ════════════════════════════════════════════ */

function channelBody(pin) {
  const tags = pin.tags.map((t) => '#' + t).join(' ');
  return {
    text: [
      `<b>${escapeHtml(pin.title)}</b>`,
      pin.note ? escapeHtml(pin.note) : '',
      '',
      tags,
      escapeHtml(pin.url),
    ].filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n'),
  };
}

async function postToChannel(env, pin) {
  if (!env.TG_CHANNEL_ID) return null;
  const res = await tg(env, 'sendMessage', {
    chat_id: env.TG_CHANNEL_ID,
    parse_mode: 'HTML',
    ...channelBody(pin),
  });
  return res.result?.message_id || null;
}

async function postToBluesky(env, pin) {
  if (!env.BSKY_HANDLE || !env.BSKY_PASSWORD) return null;
  const host = env.BSKY_HOST || 'https://bsky.social';

  const auth = await fetch(`${host}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: env.BSKY_HANDLE, password: env.BSKY_PASSWORD }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!auth.ok) throw new Error(`session ${auth.status}`);
  const { accessJwt, did } = await auth.json();

  // The link lives in the embed card, so the text stays note + rubrics.
  const body = pin.note || pin.title;
  const tagLine = pin.tags.map((t) => '#' + t).join(' ');
  let text = [truncate(body, 280 - tagLine.length), tagLine].filter(Boolean).join('\n\n');

  const post = await fetch(`${host}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessJwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: pin.ts,
        facets: tagFacets(text, pin.tags),
        embed: {
          $type: 'app.bsky.embed.external',
          external: {
            uri: pin.url,
            title: truncate(pin.title, 300),
            description: truncate(pin.note || pin.site, 300),
          },
        },
      },
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  if (!post.ok) throw new Error(`post ${post.status}: ${short(await post.text())}`);
  return did;
}

// Bluesky facet ranges are UTF-8 byte offsets, not character offsets.
function tagFacets(text, tags) {
  const bytes = new TextEncoder().encode(text);
  const facets = [];
  for (const tag of tags) {
    const needle = new TextEncoder().encode('#' + tag);
    const at = indexOfBytes(bytes, needle);
    if (at === -1) continue;
    facets.push({
      index: { byteStart: at, byteEnd: at + needle.length },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag }],
    });
  }
  return facets;
}

function indexOfBytes(hay, needle) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/* ════════════════════════════════════════════
   SMALL PARTS
   ════════════════════════════════════════════ */

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description || res.status}`);
  return data;
}

function decodeB64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodeB64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function timingSafeEqual(a, b) {
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function shortId() {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 8);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(s, n) {
  s = String(s ?? '');
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…';
}

function short(e) {
  return String(e?.message || e || '').slice(0, 120);
}

function siteUrl(env) {
  return env.SITE_URL || 'https://orchimada.github.io/pins.html';
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json' },
  });
}
