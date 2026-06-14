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
├── judgment-over-velocity.html      # skill page — the judgment filter (DEEPTECH)
├── sentinet.html                    # product page — macOS network monitor
├── cv.html                          # plain, ATS/LLM-readable classic CV
├── skill.html                       # redirect → judgment-over-velocity.html
├── design-system/                   # the design language (single source of truth)
│   ├── GUIDELINES.md                #   idea, constraints, voice, tones, tokens, vocabulary
│   ├── references.md                #   what was taken from Stripe / Nothing / Teenage Engineering
│   ├── styles/system.css            #   tokens + components
│   ├── styles/system.js             #   dot grille, mode switch, filters, readouts
│   └── examples/                    #   reference pages (main, skill)
├── technical-explanatory-minimalism/# skill landing + its published interactive figures
└── assets/                          # favicon, portrait, skill bundles, downloads, archive/
```

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

## The skills

Two of the highlighted projects are Claude skills, each in its own repo:

- **[judgment-over-velocity](https://github.com/orchimada/judgment-over-velocity)** — a product-judgment engine for deciding what *not* to build. Page: [/judgment-over-velocity.html](https://orchimada.github.io/judgment-over-velocity.html)
- **[technical-explanatory-minimalism](https://github.com/orchimada/technical-explanatory-minimalism)** — a technical-illustration skill (explorable figures). Page: [/technical-explanatory-minimalism/](https://orchimada.github.io/technical-explanatory-minimalism/)

## Not published

Some files are kept on disk but git-ignored (design explorations and
alternate-skin pages): `design-system-concepts/`, `teardown.html`, `wh40k.html`,
and the raw image originals in `assets/`.

— © 2026 Artem Domozhakov
