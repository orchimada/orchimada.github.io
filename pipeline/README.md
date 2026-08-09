# Pin pipeline

Capture from anywhere, publish everywhere, run nothing.

```
 iPhone share sheet ─┐
 Telegram desktop ───┼──▶  @your_bot  ──webhook──▶  Cloudflare Worker
 forwarded message ──┘                                    │
                                                          ├──▶ pins.json  (git commit → GitHub Pages)
                                                          ├──▶ Telegram channel
                                                          └──▶ Bluesky
```

You DM the bot a link with a note and some `#tags`. Seconds later the pin is on
[/pins.html](https://orchimada.github.io/pins.html), in the channel, and on Bluesky.

**Format** — order does not matter. Everything that is not the link and not a
hashtag becomes the note:

```
https://example.com/thing  the pointer-events trick nobody documents  #css #tools
```

- **Edit** the Telegram message → the pin and the channel post update.
- Reply **`/rm`** to it → the pin leaves the site and the channel.
- **Forwarding** a message works: its link is picked up, and a forwarded public
  channel post with no link of its own gets pinned as a `t.me` permalink.

## Setup

Roughly fifteen minutes, once.

### 0. Commit `pins.json` first

The Worker reads the file, appends, and writes it back. If it is not on the
published branch yet the first pin fails with `github read 404`. Push
`pins.html` and `pins.json` before pointing the bot at anything.

This repo publishes from **`master`**, not `main` — that is what `GH_BRANCH` in
[`wrangler.toml`](wrangler.toml) is set to.

### 1. The bot

Message [@BotFather](https://t.me/BotFather) → `/newbot` → keep the **token**.
Then `/setprivacy` → **Disable** only if you plan to post into a group; for a
one-to-one inbox leave it alone.

Get your numeric user id from [@userinfobot](https://t.me/userinfobot). This is
`TG_OWNER_ID` — the bot ignores everyone else.

### 2. The channel (optional)

Create a public channel, add the bot as an **administrator** with *Post
messages*, and use `@yourchannel` as `TG_CHANNEL_ID`. For a private channel use
the numeric `-100…` id instead.

### 3. GitHub token

[Fine-grained PAT](https://github.com/settings/personal-access-tokens/new) scoped
to **this repository only**, with **Repository permissions → Contents:
Read and write**. Nothing else. Set an expiry you are willing to rotate.

### 4. Bluesky (optional)

Settings → Privacy and security → **App passwords**. Use an app password, never
your account password.

### 5. Fill in the config

Edit [`wrangler.toml`](wrangler.toml) with `TG_OWNER_ID`, `TG_CHANNEL_ID` and
`BSKY_HANDLE`. These are not secrets and are fine in git.

### 6. Deploy

```bash
cd pipeline
npm install
npx wrangler login
npx wrangler deploy
```

Note the deployed URL, e.g. `https://pin-pipeline.<subdomain>.workers.dev`.

### 7. Secrets

Generate a webhook secret and store everything in Cloudflare — these are write-only
once set, and never touch the repo:

```bash
openssl rand -hex 32          # keep this, you need it in step 8

npx wrangler secret put TG_TOKEN            # from BotFather
npx wrangler secret put TG_WEBHOOK_SECRET   # the random hex above
npx wrangler secret put GH_TOKEN            # the fine-grained PAT
npx wrangler secret put BSKY_PASSWORD       # the app password (optional)
```

### 8. Point Telegram at the Worker

```bash
curl -X POST "https://api.telegram.org/bot<TG_TOKEN>/setWebhook" \
  -H 'Content-Type: application/json' \
  -d '{
        "url": "https://pin-pipeline.<subdomain>.workers.dev/",
        "secret_token": "<the random hex from step 7>",
        "allowed_updates": ["message", "edited_message"]
      }'
```

`secret_token` is what makes the endpoint yours. The Worker rejects any request
that does not carry it, so the URL being public costs you nothing.

Verify with `curl https://api.telegram.org/bot<TG_TOKEN>/getWebhookInfo` — you
want `pending_update_count: 0` and no `last_error_message`.

### 9. Send a pin

DM the bot a link. It replies `✓ pinned` with the fan-out status. If something
went wrong it replies with the reason instead of failing silently.

## Adding it to the iOS share sheet

No shortcut needed: Telegram's own share extension is already in the sheet. Share
→ Telegram → pick the bot → type the note and tags before sending. To skip the
picker, pin the bot chat to the top of your chat list.

## Operating it

```bash
npx wrangler tail          # live logs
npm test                   # message parsing, escaping, url safety — no network
```

`npm test` covers the parts that are awkward to check by hand: Telegram's UTF-16
entity offsets against emoji and Cyrillic, base64 round-tripping of non-ASCII
through the GitHub contents API, Bluesky's UTF-8 byte-offset facets, and whether
a hostile `og:title` can break out of the rendered card.

**Cost.** Cloudflare's free tier is 100k requests/day; a busy day here is maybe
fifty. GitHub Pages and the Telegram Bot API are free. Bluesky is free.

**Failure modes worth knowing.**

- Telegram redelivers an update if the Worker does not answer in time. The Worker
  always returns 200 and de-duplicates on the source message id, so a redelivery
  cannot double-post to the site.
- Two pins sent seconds apart both read-modify-write `pins.json`. The GitHub
  contents API takes the file `sha` as a compare-and-swap, so the loser re-reads
  and re-applies rather than clobbering the winner.
- Enrichment is best-effort. A site that blocks the fetch or serves no `og:` tags
  still pins — it just falls back to the hostname as the title.
- Removing a pin does not retract the Bluesky post. The bot says so when it happens.

**Rotating a leaked token.** BotFather `/revoke` for the bot, GitHub settings for
the PAT, Bluesky app passwords for the app password. Then `wrangler secret put`
the new value and, for the bot token, re-run `setWebhook`.

## Importing an existing bookmark file

[`tools/import-bookmarks.mjs`](tools/import-bookmarks.mjs) merges an Obsidian
bookmarks note into `pins.json`. It expects `## Section` headings followed by
`|Title|Summary|Theme|Type|Notes|` tables.

```bash
node tools/import-bookmarks.mjs ~/path/to/Bookmarks.md --dry      # preview
node tools/import-bookmarks.mjs ~/path/to/Bookmarks.md --images   # for real
```

It is **re-runnable**: pins already present are never touched, so after adding
bookmarks in Obsidian you can run it again and only the new rows come in. A link
that appears under two sections is not duplicated — its rubrics are merged.

Each row becomes a pin with two tags: the **section** as its rubric (`cs`, `swe`,
`ai`, `product`…) and a coarse **form** bucket from the Type column (`article`,
`tool`, `repo`, `book`, `interactive`…). `Summary` and `Notes` are joined with a
`·` into the note, so both what it is and why it was kept survive. The mapping is
the two tables at the top of the script; the `--dry` run prints every section
next to the rubric it resolved to and shouts if one is unmapped.

The file carries no dates, so everything is stamped at the source file's mtime,
one minute apart in document order — the curated sequence survives the sort and
every imported pin reads as the day it was imported.

`--images` fetches each page for an `og:image` at concurrency 8. It is
best-effort: roughly two thirds of pages yield one, and a page that blocks the
fetch still pins, just without a thumbnail.

## Extending it

The pin schema is deliberately small — [`pins.json`](../pins.json) is a flat array,
newest first:

```json
{
  "id": "k3f9a2b1",
  "ts": "2026-08-03T14:22:10Z",
  "tg": 4127,
  "url": "https://example.com/thing",
  "title": "The pointer-events trick",
  "site": "example.com",
  "note": "why it is worth keeping",
  "tags": ["css", "tools"],
  "image": "https://example.com/og.png",
  "ch": 88
}
```

`tg` is the source Telegram message id (how edit and `/rm` find the pin) and `ch`
is the mirrored channel message id. Both are bookkeeping; the view ignores them.

To add another platform, write one `postTo…()` in
[`src/index.js`](src/index.js) and push its result into the `fan` array in
`create()`. Mastodon is a single authenticated `POST /api/v1/statuses`.
