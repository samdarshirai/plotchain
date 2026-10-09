---
name: Announcement Composer (Admin Operational Screen)
tokens:
  colors: { live: "Built directly on frontend/src/styles/_tokens.scss (gold/oxblood/parchment): --brand-primary/secondary/primary-bright/primary-soft, --surface-page/card/raised, --border-subtle, --text-primary/muted, --status-success/warning/danger (correction: the --status-*-text variants do NOT exist in the live styles; code.html's :root defines them for the mock only, and the implementation uses var(--status-danger) for the counter, asterisk and invalid border). No literal colours below :root in code.html. NO PORT NEEDED." }
  typography: { live: "Fraunces (--font-display: page title, panel title, notice titles, day numeral), Inter (--font-sans: body, controls), IBM Plex Mono (--font-mono: counter, month, timestamps, count)" }
  radius: { card: 20px, seal: 4px (double rule), control: var(--radius-sm) 2px, chip: 999px }
---

Unit 3 of `docs/superpowers/plans/2026-08-03-announcements-units.md`; spec `specs/role-capability/2026-08-03-announcements-domain-design.md`. Mock is written against the LIVE tokens (the support-tickets violet/cyan mock needed a deliberate port; this one does not). No new tokens, no new shared component: reuses `.brand-button`(`--secondary`), `.inline-banner--*`, `.field-error`, global input/textarea styles, the 20px list card, and the double-ruled seal panel from `.ticket-seal`. Page-specific rules are prefixed `.announcement-composer*` (all in `code.html`; copy them into `_admin.scss` or a component scss). Files: `code.html` (state switcher bottom-left, hide with `#clean`; hash `#list=ok|loading|empty|error&form=blank|long|publishing|server&flash=ok`), `screen.png` (success state, desktop), and `screen-blank|toolong|empty|loading|error|mobile|mobile-blank.png`.

## Layout (desktop, content max 1280)

```
System (eyebrow)
Announcements
Publish a notice that every associate sees ...
[ success banner after publish ]
┌ Published (card, 20px) ─────────────┐  ┌ New announcement (seal 420, sticky) ┐
│ 09 | Title (Fraunces)   [Just pub.] │  │ [warning: live now, can't change]    │
│ Oct| body, 3-line clamp, Show full   │  │ Title *               0 / 300        │
│ 2026| Published 9 Oct 2026, 14:02   │  │ Announcement *  (textarea)           │
│ ... newest first ...                │  │ [Publish announcement] [Clear]       │
│   Previous  Page 1 of 3 · 13  Next  │  └──────────────────────────────────────┘
└─────────────────────────────────────┘
```

Memorable element: the published list is a run of notices, not a table. Each has a Fraunces day numeral with a mono month/year beneath it in a left gutter, so newest-first order reads as a calendar and an admin sees at a glance what was said and when. Everything else stays quiet.

Nav: admin category `system` (`ADMIN_NAV_CATEGORIES` key `system`, sidebar sub-item after Support Tickets, label "Announcements", path `/settings/announcements`; i18n `announcements.*`). Page title/eyebrow: "Announcements" / "System" (nav label and page title match; unit file calls the screen "Announcement Composer").

## Compose form (seal)

- Always visible, one mode only (no edit, no audience, scheduling, expiry or pinning; none of those controls or hints exist).
- Permanent `inline-banner--warning` at the top (spec Decision 3 / Resolved decisions 1): "Goes live immediately and can't be changed. Every associate sees it as soon as you publish. There is no edit, delete or scheduling, so check the text first." Not dismissible. No confirm dialog (see question 1).
- Title: single line, required, live counter "n / 300" (mono, turns danger + bold above 300). No `maxlength`, so an over-limit paste stays visible and gets the error instead of being silently cut. Body: textarea (min 9rem), required, vertical resize, no limit (spec has none).
- Validation on submit (mirrors `@NotBlank`, `@Size(max=300)`; whitespace-only counts as blank): `Add a title.` / `Title must be 300 characters or fewer. Shorten it by N.` / `Add the announcement text.` Shown as `.field-error` (`role=alert`) under the field plus a danger border and `aria-invalid`; both fields validated in one pass; no request is sent. A server 400 shows its per-field message in the same slot (`ApiExceptionHandler` shape).
- Pending: button disabled with spinner, label "Publishing…", fields read-only, Clear disabled.
- Failure (network/5xx): danger banner inside the form, "The announcement wasn't published. Check your connection and try again. Nothing was sent to associates." Text is kept so the admin can retry.
- Success: form clears (fields empty, counter 0 / 300, errors gone, focus returns to Title); success banner above the grid "Announcement published. "{title}" is now live in every associate's feed." (dismissible, `role=status`); list reloads page 0 and the new top item carries the "Just published" chip plus soft-gold fill and gold left rule until the next navigation or reload. Verb stays one word through the flow: Publish announcement -> Publishing… -> Announcement published.

## Published list

- `GET /api/announcements?page&size` (unit 2; default size 10, clamp per spec), `publishedAt` DESC, title/body/publishedAt only (audience is never shown). Header shows `{totalElements} announcements`.
- Item: day + month/year (gutter), title (Fraunces 600, wraps anywhere), body (`white-space: pre-wrap`, clamped to 3 lines), "Show full text" / "Show less" toggle (`aria-expanded`, shown only when the body is long), mono "Published {date, time}" (en-IN locale pipes, never concatenated by hand).
- Pager: `Previous` / "Page n of m · N announcements" / `Next`, same pattern as Support Tickets (`.support-tickets__pager`); Previous disabled on page 1. A page change while a load is in flight is ignored (support-tickets lesson).
- Loading: header count reads "Loading…", three skeleton rows, `aria-busy`; the form stays usable.
- Empty: megaphone glyph, "Nothing published yet", "Your first announcement will appear here, newest first, and in every associate's feed." No CTA button (the form is already beside it).
- Load error: danger banner in the card, "The published list didn't load. Check your connection and try again. You can still publish a new announcement." + Retry. A publish that succeeds while the list is errored still shows the success banner and retries the list load.
- Nothing is selectable or clickable on a notice (no detail route, no edit/delete affordance).

## Responsive and a11y

- <=1100: seal narrows to 360px. <=960: sidebar becomes the topbar, grid is one column, seal is static and moves ABOVE the list (compose is the primary job; CSS `order: -1`, DOM order stays list then seal for desktop reading order, so an implementer must keep the focus order sensible). <=768: page padding 1rem, notice gutter collapses to an inline row ("09 Oct 2026" above the title), actions stack full width (Publish then Clear), 44px targets everywhere.
- Warning banner and counter stay visible on mobile; counter text is not the only error cue (text message + border + `aria-invalid`). Errors `role=alert`; success `role=status`; list region `aria-live=polite`. Visible gold focus ring; labels tied to inputs; spinner and skeleton stop under `prefers-reduced-motion`.

## Copy

Sentence case. Page: "Announcements". Panel: "New announcement". Fields: "Title", "Announcement". Actions: "Publish announcement", "Clear". Hindi strings go under the `announcements` i18n namespace like the associate feed (unit 4).

## What was verified and what was not

Verified in headless Chrome (1440px): success, blank-validation, over-300 validation, empty + publishing, loading, error + server-failure states. Mobile (390px) verified by rendering `code.html` inside a 390px-wide iframe (headless Chrome will not shrink its own window that far): success state and the stacked layout; `screen-mobile-blank.png` is the validation state at that width. Not verified: real-device touch behaviour, the Show full text toggle visually (JS only, logic exercised in the mock), Material Symbols loaded from Google Fonts (needs network; verified it rendered), real sidebar (sketched, not part of this unit).

## Open design questions

1. Confirm step: warning banner only, per spec; do we also want a "Publish to all associates?" confirm dialog given there is no undo? Not designed (no new component).
2. Nav label/path: designed as "Announcements" under System (the unit file calls it "Announcement Composer"); confirm label and `/settings/announcements`.
3. Should the composer carry a "Preview as associate" affordance? Not designed (scope).
4. Page size for the admin list (10 here; spec only fixes the clamp of 100): confirm with unit 4's feed.
5. Body has no max length in the spec; a very long body will only be clamped visually. Add a limit server-side?
6. Mobile puts compose above the list; confirm vs. list-first.
