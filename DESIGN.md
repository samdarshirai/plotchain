# Viraj Acres — Design System

**Subject:** Viraj Acres, "Legacy Living" — a Patna-based land-sales company running an associate network on this platform.
**Audience:** associates (agents selling/recruiting) and company admins/finance staff, working inside a dense operational app — dashboards, genealogy trees, plot booking grids, income ledgers, payout approvals.
**The page's job, restated for an app rather than a landing page:** every screen should read as *this company's ledger*, not a generic SaaS console — while staying legible enough to work in for eight hours a day.

## 1. Reading the mark

The logo (`WhatsApp Image 2026-07-16 at 11.51.30 AM.jpeg`) is the source of truth for everything below. What it encodes:

- **Ink-black field.** The brand lives on near-black, like an engraved brass plaque, not a bright product surface.
- **Interlocked V + S monogram**, gold, in a slightly ornate serif-adjacent letterform with a subtle repeating micro-pattern inside the strokes (worked metal, not flat color).
- **A maroon "V"** behind the monogram, outlined in a thinner gold line — two brand colors, not one accent on black.
- **A minimal house glyph** (peaked roofline + a 2×2 window grid) sitting above the monogram — the only literal "real estate" cue, kept small and abstract.
- **Wordmark:** `— VIRAJ ACRES —`, wide-tracked small caps, flanked by hairline rules, with `LEGACY LIVING` beneath it in a smaller tracked caps line.

The flanking hairline rule and the tracked small-caps wordmark are the most distinctive, reusable *pieces* of this mark — more useful as UI material than the monogram itself, which stays a fixed asset.

This is a **legacy/old-money register**, not a startup one: land as a generational asset, sold by people who need to be trusted with someone's savings. That's the brief this system is designed for, and it's also why the current app tokens (`--brand-primary: #7C3AED` violet, `--brand-secondary: #22D3EE` cyan) read wrong today — they're the generic SaaS-gradient default, unrelated to the brand the company actually put on its logo.

## 2. Color

Six named colors, drawn from the mark, not a palette generator:

| Name | Hex | Role |
|---|---|---|
| **Ink** | `#0C0A0B` | Deep brand ground — app header, sidebar, footers, the "plaque" chrome |
| **Antique Gold** | `#C6A227` | Primary accent — primary buttons, active states, key figures, links |
| **Bright Gold** | `#EAD07D` | Gold's highlight step — hover/gradient partner for Antique Gold, never used alone |
| **Oxblood** | `#5C1A2A` | Secondary brand color — used sparingly for emphasis chips, selected states, the associate rank badge, never for body text |
| **Parchment** | `#F7F2E7` | Light operational surface (replaces the current cold `#f8f9ff`) — warm off-white, not sterile white |
| **Warm Charcoal** | `#201A15` | Primary text on Parchment — warm near-black, not pure `#000` |

Semantic colors are deliberately **not** built from Oxblood, so a red error state never gets mistaken for the brand maroon:

| Token | Hex | Note |
|---|---|---|
| `--status-success` | `#4B7A52` | muted olive-forest, warm-compatible with gold/parchment |
| `--status-warning` | `#B4790E` | bronze-amber, a shade of the gold family so it reads as "part of the system" |
| `--status-danger` | `#B23B32` | brick red, clearly distinct from Oxblood at a glance |
| `--border-subtle` | `#D9CFBC` | warm taupe, not slate gray |
| `--text-muted` | `#6B6153` | warm gray, not cool gray |

**Rule:** Ink is a chrome color, not a content-background color. Data-dense screens (tables, ledgers, forms) stay on Parchment for read-all-day legibility; Ink is reserved for the app shell and for one "seal" card per screen (see §5). Don't paint a whole dashboard black — that's how a legacy-luxury identity becomes a legibility problem.

**Exception:** the setup wizard's forward-progress "Next" CTA (`app-setup-shell-footer`) uses Oxblood, not Gold — a deliberate one-off distinguishing "advance the wizard" from every other primary button app-wide, which stays Gold per the rule above.

## 3. Typography

| Role | Typeface | Used for |
|---|---|---|
| **Display** | Fraunces (serif, high-contrast, slightly ornate at heavier weights) | Page titles, the "— SECTION —" flanking-rule headers, big standalone figures (total earnings, rank), certificate/PDF headers |
| **Body / UI** | Inter | Everything operational — nav, forms, table cells, buttons, labels |
| **Tabular / numeric** | Inter with `font-variant-numeric: tabular-nums`, or IBM Plex Mono for EMI/ledger columns that need strict alignment | Currency amounts, dates, IDs in tables |

Set Fraunces sparingly and at restraint: one page title, one hero figure, section eyebrows — never body copy or table content. It's the ornamental voice; Inter carries the actual work.

Section headers echo the wordmark's flanking rule directly:

```
──  CURRENT CYCLE  ──
```
small caps, tracked ~0.12em, Antique Gold hairlines either side, on both Ink and Parchment surfaces (invert rule color to Oxblood on Parchment, gold on Ink, for enough contrast).

## 4. Layout

App shell stays split, deliberately:

```
┌─────────────────────────────────────────────┐
│  INK sidebar/header                          │
│  · gold VS mark, small, top-left             │
│  · nav items, Inter, gold on hover            │
│  · thin gold hairline under active item       │
├───────────────┬───────────────────────────────┤
│               │  PARCHMENT content             │
│               │  ┌───────────────────────┐    │
│               │  │  ── SEAL CARD ──       │    │  ← one per screen, see §5
│               │  │  Fraunces figure       │    │
│               │  └───────────────────────┘    │
│               │  [ordinary Parchment cards/    │
│               │   tables in Inter below]       │
└───────────────┴───────────────────────────────┘
```

- Ink chrome carries brand identity so associates recognize *whose* platform this is the moment it loads.
- Parchment content carries the actual work: genealogy tables, plot grids, EMI schedules. Contrast and density rules follow ordinary data-table practice — this system does not ask a spreadsheet to also look like a plaque.
- Cards, tables, forms, buttons keep their current structural shapes; only the color/type tokens change (see §6 for the concrete mapping).

## 5. Signature element: the Seal Card

The one place per screen allowed to look like the logo. A Parchment (or Ink, on the dashboard) card with:
- a double gold hairline border (echoing the wordmark's flanking rules, mitred not rounded past 4px)
- its header set as a flanking-rule small-caps label (`── RANK ──`, `── THIS CYCLE ──`)
- its primary figure in Fraunces, large, Antique Gold or Warm Charcoal depending on surface

Used for exactly one thing per screen: current-cycle earnings on the dashboard, the rank badge on the profile, the payout total on a payout-approval screen. If everything gets a seal, nothing reads as special — restrict it on purpose.

## 6. Motion

Minimal. One deliberate moment, not ambient effects:
- On first paint of a Seal Card, the double hairline border draws in left-to-right over ~400ms (mirrors a plaque being engraved), then settles. Respect `prefers-reduced-motion` — skip straight to the settled state.
- Everywhere else (nav, buttons, tables): standard fast UI transitions only (150ms color/opacity), no scroll-triggered reveals, no hover parallax. This is a work tool, not a marketing page.

## 7. Icons

Keep Material Symbols Outlined (already in use, `_tokens.scss` imports it) — outlined weight suits the hairline-and-restraint direction. Gold on Ink chrome, Warm Charcoal on Parchment content. Don't switch to filled icons; filled reads heavier than the mark's linework.

## 8. Migration from current tokens

`frontend/src/styles/_tokens.scss` currently ships the generic SaaS default this brief explicitly isn't. Concrete replacement:

| Current | Replace with |
|---|---|
| `--brand-primary: #7C3AED` | `--brand-primary: #C6A227` (Antique Gold) |
| `--brand-secondary: #22D3EE` | `--brand-secondary: #5C1A2A` (Oxblood) |
| `--brand-gradient` (violet→cyan) | Antique Gold → Bright Gold (`#C6A227` → `#EAD07D`) |
| `--surface-page: #f8f9ff` | `--surface-page: #F7F2E7` (Parchment) |
| `--surface-card: #ffffff` | `--surface-card: #FCFAF5` (slightly warmed white, not stark) |
| `--surface-raised: #eff4ff` | `--surface-raised: #F0E9D6` |
| `--border-subtle: #c2c6d9` | `--border-subtle: #D9CFBC` |
| `--text-primary: #0b1c30` | `--text-primary: #201A15` (Warm Charcoal) |
| `--text-muted: #424656` | `--text-muted: #6B6153` |
| `--status-success/warning/danger` | `#4B7A52` / `#B4790E` / `#B23B32` |
| `--font-sans` (system stack) | Inter, falling back to the current system stack |
| *(new)* | `--font-display: 'Fraunces', Georgia, serif;` |
| *(new)* | `--ink: #0C0A0B;` for shell/chrome surfaces |

This is a token swap, not a rebuild — every component (`_buttons.scss`, `_cards.scss`, `_tables.scss`, `_app-shell.scss`, `_admin.scss`, `_setup.scss`) already consumes these custom properties, so the brand can land by editing `_tokens.scss` plus adding the Ink-shell/Seal-card treatment to `_app-shell.scss` and `_cards.scss`, without restructuring existing screens.

## 9. Do / Don't

- **Do** keep 90% of every operational screen on Parchment with Warm Charcoal text — this is a working app, not a brand showcase.
- **Do** reserve Fraunces for titles and hero figures only.
- **Do** limit the Seal Card treatment to one card per screen.
- **Don't** use Oxblood for error/danger states — that's what `--status-danger` is for.
- **Don't** let Ink chrome creep into content areas; it kills table legibility.
- **Don't** add scroll animations, gradients-on-everything, or drop shadows beyond a subtle 1px card border — the restraint *is* the luxury cue here, not extra ornament.
