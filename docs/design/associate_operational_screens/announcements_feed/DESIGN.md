---
name: Announcements Feed (Associate Operational Screen)
tokens:
  colors: {live tokens from frontend/src/styles/_tokens.scss, copied 1:1 -- surface-page/card/raised, border-subtle, text-primary/muted, brand-secondary (oxblood #5C1A2A), brand-primary (gold), status-danger}
  typography: {display: Fraunces (--font-display), body: Inter (--font-sans), labels/dates: IBM Plex Mono (--font-mono)}
  radius: {card: 20px (shared admin-screen card), mobile card: 16px, control: --radius-sm 2px}
  shadow: {card: "0 4px 20px -2px rgba(0,0,0,0.08)"}
---

## Scope

Unit 4 of `docs/superpowers/plans/2026-08-03-announcements-units.md`; spec `docs/superpowers/specs/role-capability/2026-08-03-announcements-domain-design.md`. View-only, paged, newest-first feed from `GET /api/announcements` (`title`, `body`, `publishedAt`; `audience` is not exposed). No actions: no create, edit, delete, read/unread, pin, filter. Style prefix: `.announcement-feed*`.

Built directly against the LIVE gold/oxblood tokens (lesson from support-tickets, where the earlier mock used violet/cyan). `code.html` copies `_tokens.scss` verbatim, loads the live fonts (Inter, Fraunces, IBM Plex Mono) and introduces no new token, hex, or custom property. Port is therefore class-for-class, no palette translation.

## Cards, not a table (decision)

Announcements are prose of unbounded length (title up to 300 chars, body shown in full, no detail endpoint). A table forces body into a narrow cell and a mobile restack; the sibling "quoted reply" cell was already the awkward part of the ticket table. A feed of cards lets the body use a readable measure (max 62ch) on every viewport, and reading order (date, title, body) is the natural one. Table affordances (sorting, column scan) have no value here: one fixed order, one date. Cost: not `EditableTableComponent`; this is a small bespoke template plus the existing pagination pattern.

## Layout (desktop > 768px)

```
ASSOCIATE · ANNOUNCEMENTS (mono, muted, like .ticket-history__eyebrow)
Announcements (Fraunces 1.75rem)
Updates from Viraj Acres, newest first.
[ inline-banner danger + Retry, when load fails ]
┌────────┬─────────────────────────────────────┐
│  6     │ Title (Fraunces 1.25rem/600)         │
│  OCT   │ Body in full, Inter 0.9375rem,       │
│  2026  │ pre-wrap, max 62ch                   │
└────────┴─────────────────────────────────────┘   one card per announcement, 1rem gap
                          Page 1 of 3 [Previous] [Next]
```

max-width 880px (narrower than siblings' 1040px: a prose measure, not a wide table). Left-aligned throughout.

## Signature element: the dateline gutter

Each card has a 7.5rem left gutter on `--surface-raised` with a hairline divider: day in Fraunces 2rem oxblood (`--brand-secondary`), month in mono, year muted. Reads like a dated entry in a ledger and gives the feed scan rhythm without badges. Oxblood is used here only, as the tokens file says it is a sparing-use accent. Gold is not used on this screen except focus ring. The date is a `<time datetime>`; no "New" marker (no read-state exists in the spec).

## States (all in code.html)

1. Loaded, three cards, page 1 of 3 (multi-paragraph body shown to prove `white-space: pre-wrap`).
2. Loading: 3 skeleton cards (`--surface-raised`, 1.2s pulse, off under `prefers-reduced-motion`), pagination disabled, `aria-busy`.
3. Empty: "No announcements yet" / "When Viraj Acres posts an update, it will appear here." No pagination, no CTA.
4. Error: danger `inline-banner` "Couldn't load announcements. Check your connection and try again." + underlined Retry (same link-style retry as the ticket screen); feed and pagination hidden.
5. Mobile (see below).

## Responsive (md = 768px, same as siblings)

- Below 768px the gutter collapses into a one-line mono dateline strip at the top of the card ("6 OCT 2026", day stays oxblood), then title, then body full width. Card radius 16px, padding 1.125rem 1.25rem, page padding 1rem.
- Pagination: Previous / indicator / Next spread across the row; buttons `min-height: 44px`.
- Designed for the collapsed-rail case: content width is 375 - 68 (rail) = ~307px minus 32px page padding, so ~275px of card. Titles wrap to 2-3 lines (`overflow-wrap: anywhere`), body wraps freely.
- Not verified: the known pinned-sidebar case (~127px content) is out of scope and was not designed or tested; at that width the card would be unreadable regardless of this screen. The mobile frame in `code.html` simulates 375px by mirroring the media rules under `.docs-frame--mobile`; standalone 375px viewport rendering was checked in Chromium. The real shell (rail/overlay behavior, sticky header offset) was NOT checked against the running app.

## Component mapping

| Need | Component |
|---|---|
| Feed | new `<ol class="announcement-feed__list">` of `<article>`; no shared primitive fits |
| Pagination | same Previous / "Page n of N" / Next markup and `%admin-screen-pagination*` placeholders as the ticket screen |
| Error | `InlineBannerComponent` tone="danger" + retry |
| Empty / loading | bespoke `__empty`, `__skeleton-card` |

## Out of scope

Compose (unit 3), edit/unpublish/delete (spec Decision 3), audience, unread badge, search, per-announcement page, dashboard teaser (removed, spec Context).

## Open questions

1. Very long bodies are shown unclamped (no detail endpoint). If real announcements run long, add a clamp with "Show more"; not designed.
2. Timezone: dateline renders `publishedAt` in the viewer's local time; confirm that, versus a fixed IST, is intended (a late-night announcement could show a different day).
3. Nav label/i18n: mockup uses "Announcements"; the subtitle copy ("Updates from Viraj Acres") hardcodes the brand name, which is tenant-themed. Confirm whether to use the tenant name or a neutral "Company updates".
4. Body is plain text with preserved line breaks (`pre-wrap`); URLs are not linkified. Confirm that is acceptable.
5. Page size: mockup assumes ~10 per page; spec clamps size at 100 but sets no default.
