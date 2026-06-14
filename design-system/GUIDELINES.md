# AD·OS — Design Guidelines

The design language for orchimada.github.io. One system, two tones. Built on
Stripe's model (one brand, run light to sell and dark to explain), given
Nothing's boldness and Teenage Engineering's physicality.

---

## 1. The idea

Every problem is a **figure standing on a ground**, and the ground decides the
answer. Gestalt (figure/ground), signal processing (signal, carrier, noise
floor), and TRIZ (a problem only makes sense inside its system) are three
vocabularies for one truth. The site does not decorate with this idea, it
**performs** it.

**The motif is the dot field.** A grid of dots is the ground: the system, the
noise, the context. Meaning is **the dots that light up**: the figure, the
signal. It is the same object Nothing builds a phone out of, and it carries the
idea literally, the way Stripe's stripe carries theirs.

---

## 2. The constraints (scarcity is the brief)

The scarce resource on a screen is **attention**. Honor it and three rules fall
out.

- **One idea per view.** Exactly one figure is bright at a time. Every screen
  answers one question; the rest is quiet ground, one scroll away.
- **One paint.** Monochrome by default, plus a single **signal red** (`#ff2d2d`),
  spent only on what matters. Scarce color always means something.
- **One hand-made detail per page.** Against vibe-coded sameness, every page
  earns one deliberate, hand-tuned detail. Proof a human was here.

---

## 3. Voice

The words obey the same discipline as the pixels.

- **Speak in principles, not in the self.** Imperative voice. Drop "I" where it
  is possible. Write "Read the ground, identify the figure," not "I read the
  ground." The claim belongs to the reader, not the author.
- **No em-dashes.** Use a comma, a colon, or a full stop. The em-dash is a hedge;
  commit to the cut.

---

## 4. The two tones, on one dial

Business and engineering pages are not two systems, they are two settings of
one. The **MODE switch** on the hero device is the temperature made physical.
Flipping it coordinates seven decisions in lockstep, which is what makes the two
languages read as one machine doing two jobs.

| Decision | CONCEPT (figure forward) | DEEPTECH (ground exposed) |
|---|---|---|
| Surface | warm cream panel | graphite carbon panel |
| Display | claim + big stats, calm grille | live readout, LEDs, dense grille |
| Controls | hidden, one CTA only | full deck: buttons, LEDs, knob |
| Type | Space Grotesk, humanist | mono + dot-matrix segments |
| Label density | sparse, one idea | silkscreen everywhere, the why |
| Accent | one highlight | status LEDs, live values |
| Motion | calm | reactive, metering |

A page picks its home tone (the main page lives in CONCEPT, the skill page in
DEEPTECH) but the switch always reaches the other.

---

## 5. Tokens

- **Palette.** Paper `#eceae3`, card `#ffffff`, ink `#141416`, soft `#54545c`,
  line `#dcdbd3`, grey `#8c8c84`. Dark inset: carbon `#0e0e10` / `#1a1b1e`,
  text `#eceef2`. One paint: signal red `#ff2d2d`.
- **Type.** Inter (body), Space Grotesk (display), DotGothic16 (dot-matrix
  numerals and signal moments), JetBrains Mono (silkscreen labels, data).
- **Layout.** Light page canvas; engineering depth shown as **dark inset
  panels** (like a dark screen on a light device), never by turning whole
  reading pages dark.

---

## 6. The instrument vocabulary

The site is an instrument; these are its parts. Each turns an abstraction into
something you can read or operate. Use a part only where it carries real meaning.

- **Dot grille** — signal from ground (cursor-reactive, idle is static).
- **Segment display** — the one value that matters.
- **Button + LED** — discrete state (filters, navigation).
- **Knob** — continuous control (focus, strictness).
- **Fader** — magnitude.
- **Patch jack** — connection and signal routing.
- **VU meter** — live magnitude.
- **Mode switch** — the two tones, flippable.

**Rule:** the literal device chassis appears in the **hero block only**. The rest
of the page uses the language (dots, segments, LEDs, one paint, silkscreen
labels) without becoming a panel.

---

## 7. Files

- `styles/system.css`, `styles/system.js` — the single source of truth.
- `examples/main.html` — the business (CONCEPT-home) page.
- `examples/skill.html` — the engineering (DEEPTECH-home) page.
- `references.md` — what was taken from Stripe, Nothing, Teenage Engineering.
- Earlier explorations are archived in `../design-system-concepts/`.
