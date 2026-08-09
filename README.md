# orchimada.github.io

The personal site of **Artem Domozhakov** — product leader (personalization &
growth), and the home of a small design system the whole site is built on.

Live: **https://orchimada.github.io**

## What this is

One site, two voices, one design language. Built on Stripe's
one-brand-two-temperatures model, given Nothing's boldness and Teenage
Engineering's instrument metaphor. The motif is **figure / ground**, drawn as a
dot field; the one accent is a single signal red.

- **CONCEPT** pages sell: business, self-presentation (light, figure forward).
- **DEEPTECH** pages explain: engineering, the skills (dark insets, ground exposed).

The hero of each page is an operable "device" with a **CONCEPT ⟷ DEEPTECH** mode
switch. The full language lives in [`design-system/`](design-system/) — start
at [`design-system/GUIDELINES.md`](design-system/GUIDELINES.md).

## Structure

```
.
├── index.html                       # main page — self-presentation (CONCEPT)
├── judgement-skill.html             # skill page — the judgment filter (DEEPTECH)
├── diagram-skill.html               # skill page — technical-explanatory minimalism
├── sentinet.html                    # product page — macOS network monitor
├── cv.html                          # plain, ATS/LLM-readable classic CV
├── pins.html                        # mobile-first feed of saved curios (reads pins.json)
├── pins.json                        # the pin data — written by the pipeline, not by hand
├── skill.html / judgment-over-velocity.html   # redirects → judgement-skill.html
├── design-system/                   # the design language (single source of truth)
│   ├── GUIDELINES.md                #   idea, constraints, voice, tones, tokens, vocabulary
│   ├── references.md                #   what was taken from Stripe / Nothing / Teenage Engineering
│   ├── styles/system.css            #   tokens + components
│   ├── styles/system.js             #   dot grille, mode switch, filters, readouts
│   └── examples/                    #   reference pages (main, skill)
├── pipeline/                        # the pin capture pipeline (Cloudflare Worker)
│   ├── README.md                    #   setup runbook — bot, tokens, deploy, webhook
│   ├── src/index.js                 #   Telegram webhook → pins.json → channel + Bluesky
│   └── tools/                       #   import-bookmarks.mjs — Obsidian note → pins.json
└── assets/                          # favicon, portrait, skill bundles, downloads,
    └── diagrams/                    #   published interactive figures for diagram-skill
```

Every page is a flat file at the root (GitHub Pages serves them directly); skill
pages follow the `*-skill.html` naming.

Pages share `design-system/styles/system.{css,js}`; each adds only page-specific
styles inline.

## Local development

Serve over HTTP — **do not** open the files directly. Safari's `file://`
sandbox refuses to load a stylesheet from a parent directory (`../`), so
double-clicked pages render unstyled. Over HTTP the relative paths resolve
exactly as on GitHub Pages:

```bash
python3 -m http.server 8765
# then open http://localhost:8765/
```

## Pins

[/pins.html](https://orchimada.github.io/pins.html) is a running feed of links and
artifacts worth keeping, one line each on why. The page is static and reads
`pins.json` at load; nothing is written by hand.

Posting is a Telegram DM — a link, a note, some `#tags` — which a Cloudflare
Worker turns into a commit here plus a channel post and a Bluesky post. Setup and
operation live in [`pipeline/README.md`](pipeline/README.md). No secret is stored
in this repo; they all live in Worker secrets.

## The skills

Two of the highlighted projects are Claude skills, each in its own repo:

- **[judgment-over-velocity](https://github.com/orchimada/judgment-over-velocity)** — a product-judgment engine for deciding what *not* to build. Page: [/judgement-skill.html](https://orchimada.github.io/judgement-skill.html)
- **[technical-explanatory-minimalism](https://github.com/orchimada/technical-explanatory-minimalism)** — a technical-illustration skill (explorable figures). Page: [/diagram-skill.html](https://orchimada.github.io/diagram-skill.html)

## Not published

Some files are kept on disk but git-ignored (design explorations and
alternate-skin pages): `design-system-concepts/`, `teardown.html`, `wh40k.html`,
and the raw image originals in `assets/`.

— © 2026 Artem Domozhakov
