---
name: Cycle Management (Admin Operational Screen)
tokens:
  colors:
    surface-page: var(--surface-page)       # #f8f9ff
    surface-card: var(--surface-card)       # #ffffff
    surface-raised: var(--surface-raised)   # #eff4ff
    border-subtle: var(--border-subtle)     # #c2c6d9
    text-primary: var(--text-primary)       # #0b1c30
    text-muted: var(--text-muted)           # #424656
    brand-primary: var(--brand-primary)     # #7C3AED
    brand-secondary: var(--brand-secondary) # #22D3EE
    brand-primary-soft: var(--brand-primary-soft)
    status-success: var(--status-success)   # #34D399
    status-warning: var(--status-warning)   # #F59E0B
    status-danger: var(--status-danger)     # #F87171
  typography:
    eyebrow: "'JetBrains Mono', monospace — 0.8125rem/500/uppercase/0.02em"
    operational-title: "'Geist', var(--font-sans) — 1.75rem/600/-0.01em"
    subtitle: "'Inter', var(--font-sans) — 1rem/400, color text-muted"
    field-label: "'JetBrains Mono', monospace — 0.6875–0.75rem/500/uppercase/0.02–0.04em, color text-muted"
    body: "'Inter', var(--font-sans) — 0.875rem/400"
    ledger-data: "'JetBrains Mono', monospace — 0.875rem/600, tabular-nums"
  radius:
    card: 20px
    panel: 16px
    control: 8-12px
    pill: 999px
  spacing:
    row-gap: 1.5rem
    card-padding: 2rem
    field-gap: 1.5rem
  shadow:
    card: "0 4px 20px -2px rgba(0, 0, 0, 0.08)"
---

## Why this screen, why now

Cycle Management is the second data-table-heavy **operational** admin screen to get a bespoke design pass, after Sales Register (`docs/design/admin_operational_screens/sales_register/`). Every earlier screen — Associate Directory, KYC Review Queue, Tree Explorer — still ships with generic `.card` + plain `.editable-table` styling and nothing else. This design does not restart the system Sales Register established: same tokens, same `'Geist'`/`'Inter'`/`'JetBrains Mono'` stack, same four allowed shared components (`EditableTableComponent`, `InlineBannerComponent`, `SidePanelComponent`, `BrandButtonComponent`), same ledger-typography-for-numeric-columns idiom. It extends that system with one addition specific to this screen's own content, described below.

Sales Register is a ledger an admin scans dozens of times a day. Cycle Management is a much rarer, higher-stakes screen — an admin opens it to check what settlement period is currently running and, occasionally, to pull the trigger on closing it. The design reflects that difference: fewer controls, a single consequential action rendered as a `danger` button, and a table that's mostly read history rather than a working surface.

## The one real fact this screen is built around

A `Cycle` moves through exactly four statuses, in exactly one direction, and never goes back — confirmed directly from `CycleService.close()`: `OPEN` → `CALCULATING` (set the instant close starts) → `CLOSED` (set once leg-volume rollup finishes) → `PAID` (set later, once a cycle's settlement is actually disbursed — outside this screen's three endpoints). The Global Constraints are explicit that a closed cycle is never reopened. That's not incidental copy — it's the actual state machine `CycleStatus.java` encodes, and it's the one piece of structure this design treats as load-bearing rather than decorative.

## Layout concept

```
┌ ADMIN · CYCLE MANAGEMENT  (eyebrow, mono, brand-primary)  ─────────────┐
│ Cycle Management                                                        │  <- operational-title, 28px
│ Every settlement cycle — its period, status, and close history.         │
├──────────────────────────────────────────────────────────────────────┤
│ ┌ Current Cycle strip (surface-raised, brand-primary-soft border) ───┐ │
│ │ CURRENT CYCLE                                                       │ │
│ │ 1 Aug 2026 – 31 Aug 2026        ○──●──○──○  Open           │ │
│ │                                  OPEN CALC CLOSED PAID  [Close Cycle]│ │  <- danger button
│ │                                  Closing rolls up leg volume and     │ │
│ │                                  opens the next cycle. Can't be undone.│
│ └──────────────────────────────────────────────────────────────────┘ │
│ [ inline-banner success — close result, when present ]                 │
│ [ inline-banner danger — close conflict/error, when present ]          │
│ [ inline-banner danger — history load error, when present ]            │
│ Status  [ All ▾ ]                                                       │  <- single-field filter strip
│ ┌ .card / .editable-table (history) ────────────────────────────────┐ │
│ │ PERIOD START | PERIOD END | STATUS  | ACTIONS                      │ │
│ │ 1 Aug 2026   | 31 Aug 2026| OPEN    | View Detail                  │ │
│ │ 1 Jul 2026   | 31 Jul 2026| CLOSED  | View Detail                  │ │
│ │ 1 Jun 2026   | 30 Jun 2026| PAID    | View Detail                  │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                        Page 1 of 3   [Prev] [Next]     │
└──────────────────────────────────────────────────────────────────────┘
                                                     ┌ side panel (420px) ┐
                                                     │ Cycle Detail    ✕ │
                                                     │ 1 Jul – 31 Jul     │
                                                     │ ○──●──○──○ Closed  │
                                                     │ DIRECT      ₹…    │
                                                     │ MATCHING    ₹…    │
                                                     │ SPONSOR MTCH ₹…   │
                                                     │ ROYALTY     ₹…    │
                                                     │ REWARD      ₹…    │
                                                     │ ──────────────    │
                                                     │ TOTAL NET   ₹…    │
                                                     └────────────────────┘
```

Why not reproduce Sales Register's multi-field toolbar: that screen filters a high-volume transaction log by associate/status/date-range because an admin is hunting for one sale among hundreds. Cycle Management's history is a handful of periods, filtered by one axis only (status) — per Part A of the plan, that's the whole filter surface. Giving it four toolbar fields it doesn't need would be decoration, not a choice made for this screen's actual content.

## Signature element: the Cycle Rail

**The Cycle Rail** — a small four-node horizontal track (`○──●──○──○`, labelled Open / Calculating / Closed / Paid) that renders a specific cycle's position in its own lifecycle. It appears in exactly two places: the Current Cycle strip and the Detail side panel header. Everywhere else (the history table's Status column, the close-result banner) uses plainer treatments deliberately, so the rail stays the one unmistakable thing this screen is remembered by rather than a motif repeated until it's wallpaper.

This isn't a numbered-marker default bolted onto arbitrary rows — `01 / 02 / 03` would be decoration here, because the plan's own reviewer note calls that out as *not* automatically appropriate. The Cycle Rail is different: it encodes the real, fixed `CycleStatus` sequence a cycle is guaranteed to pass through in one direction, confirmed from `CycleService.close()`'s own status transitions (see above). A viewer looking at a `CLOSED` cycle's rail sees exactly two filled nodes to the left (it passed through Open and Calculating) and one open node to the right (Paid, not yet reached) — that's true information about the cycle's history, not ornament. It's also a quiet nod to the product's own name (a *chain* of periods, each one closing to open the next) without spelling that out anywhere in copy — the metaphor is structural, not written.

It costs nothing extra in components: the rail is an `<ol>`/`<li>` list with dots and connector lines, styled entirely with existing tokens (`--brand-primary` for reached/current stages, `--border-subtle` for stages not yet reached). It lives inside markup the four allowed components already give full control over — the Current Cycle strip's own template and the side panel's `<ng-content>` body — never inside an `EditableTableComponent` data cell (see the Implementation constraint below for why that matters).

A second, much quieter echo of the same idea shows up in the close-success banner: two small monospace chips — `a3f9e21c · CLOSED` and `b71c0dfa · OPEN` — joined by an arrow, standing in for "this link closed, that one opened." It reuses the pill vocabulary Sales Register's `voided-tag` already established rather than introducing a new shape, and it's intentionally smaller and less staged than the full rail so the rail itself stays the one signature moment.

## Component mapping (no new primitives)

| Screen need | Component used | Notes |
|---|---|---|
| History table + pagination | `EditableTableComponent` (`readOnly`) | Columns: Period Start, Period End, Status, Actions. Same usage shape as `SalesRegisterComponent`. |
| Row's "View Detail" action | `EditableTableComponent`'s single `actionTemplate` | One `<app-brand-button variant="secondary">` per row, scoped by `row.id` — mirrors Sales Register's per-row `actionTemplate` usage. |
| Detail drill-down | `SidePanelComponent` | Same component (`[open]`, `[title]`, `(closed)`, body via `<ng-content>`) that the deleted `SettingsOverviewComponent`'s compensation-history panel used — that Company Settings Overview hub screen no longer exists (a mockup revision made it obsolete), but `SidePanelComponent` itself is unchanged and still in use. Title: "Cycle Detail". |
| Close result / errors | `InlineBannerComponent` tone="success" / tone="danger" | Success shows the four real `CycleCloseResponse` fields plus the chip transition. Two distinct danger banners: close-conflict (409) and history-load-error, placed exactly where Sales Register places `sales-register__load-error` — above the table. |
| "Close Cycle" | `BrandButtonComponent` `variant="danger"` | The screen's one consequential, effectively one-directional action — same reasoning Sales Register applied to "Void". |
| Status filter | Plain `<select>` inside a `surface-raised` strip | One field, not a toolbar — see Layout concept for why a full multi-field toolbar doesn't fit this screen's content. |

### Implementation constraint worth flagging (same one Sales Register's DESIGN.md flags)

`EditableTableComponent`'s read-only data cells render `{{ row[column.key] }}` as plain text — there's no per-cell class hook. That means the history table's **Status** column can be styled uniformly (mono, uppercase, muted — matching the `field-label` treatment) but **cannot** show the Cycle Rail or a per-value colored pill without extending the shared component, which this brief rules out. The Cycle Rail therefore only ever appears in markup the design *does* have full control over: the Current Cycle strip and the side panel body, both outside `EditableTableComponent`'s cell templates.

> **Stale rationale corrected (design-parity plan, final review).** The *conclusion* still describes shipped code — Cycle Management's history Status column is still `type: 'text'`, styled uniformly, and the Cycle Rail still lives only in the Current Cycle strip and the side panel. But the reason given is no longer accurate: `EditableTableComponent` has since gained a `type: 'badge'` column (a `badgeTone` value→tone mapper), which Sales Register, Ledger Register and Payout Approval all use to color their Status columns per value. So a per-value colored Status here is *available*, merely not taken; the Cycle Rail specifically remains out of reach because `badge` renders a value→color mapping, not arbitrary markup.

## Screen states

1. **History default / loaded**, combined with the **Current Cycle strip** (shown together because any realistic loaded page with an `OPEN` cycle present naturally renders both — same combination Sales Register's DESIGN.md uses for its states 1 & 3).
2. **History empty state** — reuses `EditableTableComponent`'s built-in empty-state row; the Current Cycle strip is absent here too, since an empty *filtered* page has no guaranteed `OPEN` row loaded.
3. **Close Cycle — success/monitor.** `InlineBannerComponent` tone="success" showing only `cycleId`, `status` (`CLOSED`), `legVolumeRowsWritten`, `newCycleId` — no invented per-income-type breakdown. History has reloaded beneath it: the just-closed cycle's row now reads `CLOSED`, a new `OPEN` row appears, and the Current Cycle strip now describes the new cycle.
4. **Close Cycle — conflict (409).** `InlineBannerComponent` tone="danger", copy distinguishing "someone else's request finished first" from a generic failure. The Current Cycle strip still shows the (now stale) cycle the admin was looking at, since the local page hasn't refreshed yet — a real, transient moment, not an error state for the whole screen.
5. **History load error.** `InlineBannerComponent` tone="danger" above the table, table falls back to its empty-state row underneath (nothing to show).
6. **Detail drill-down, loaded.** `SidePanelComponent` open over the history, header shows period + Cycle Rail, body lists `DIRECT / MATCHING / SPONSOR_MATCHING / ROYALTY / REWARD` each with a ledger-mono `totalNet`, a ruled-off Total Net row beneath.
7. **Detail drill-down, load error.** Same panel, `InlineBannerComponent` tone="danger" in place of the breakdown list — the panel itself still opens (title and close affordance intact), only the body's fetch failed.

## Colors

| Use | Token |
|---|---|
| Page background | `--surface-page` |
| Card / table / side-panel surface | `--surface-card` |
| Current Cycle strip, filter strip surface | `--surface-raised` |
| Current Cycle strip border (calls out "this needs attention") | `--brand-primary-soft` |
| Borders, table rules, rail's not-yet-reached nodes | `--border-subtle` |
| Headings, primary data | `--text-primary` |
| Labels, secondary data, hints, rail's not-yet-reached labels | `--text-muted` |
| Eyebrow, rail's reached/current nodes, "OPEN" chip in close banner | `--brand-primary` / `--brand-primary-soft` |
| Close Cycle button, conflict/error banners | `--status-danger` |
| Success banner (close result) | `--status-success` |

No new hex value or custom property appears anywhere in this design — every color above resolves to a `_tokens.scss` variable, the same set Sales Register's design already mapped.

## Typography

Reuses the exact live stack (`_admin.scss`'s `.create-associate__*`/`.sales-register__*` rules):
- **Geist** — screen title (1.75rem, matching Sales Register's list-screen sizing rather than a hero 2rem — this is also a screen an admin returns to routinely, not a one-time provisioning flow), Current Cycle period, side-panel period.
- **Inter** — body copy, table Period Start/Period End cells (tabular-nums, not monospace — matching Sales Register's own "Recorded At" column treatment for dates), filter label text content.
- **JetBrains Mono** — eyebrow, field labels, the Status column (uppercase, muted, uncolored per the Implementation constraint above), the Cycle Rail's stage labels, the close-result banner's cycle-id chips, and the Detail panel's `totalNet` ledger figures (`tabular-nums`, right-aligned) — the same "monospace for precision data" idiom Sales Register established for its Amount column, applied here to net totals and cycle ids instead of sale amounts.

## Shape, elevation, spacing

Reused verbatim from the live `.create-associate`/`.sales-register` rules: 20px card radius, `0 4px 20px -2px rgba(0,0,0,0.08)` card shadow, 16px panel radius (Current Cycle strip, filter strip), 8–12px control radius, 1.5rem row gaps, 2rem card padding where the card has visible padding (the history table card itself is zero-padding/overflow-hidden, same as Sales Register's ledger card).

## Responsive behavior

Same breakpoint Sales Register's design uses and names explicitly (`md` = 768px) for the dense history table:
- **Below 768px — history table**: rows collapse to one stacked card per row (`data-label` idiom, same one-line addition to `EditableTableComponent` Sales Register's design already flagged as a prerequisite — already shipped by the time this screen builds, so no second flag needed here). Period Start is the card title (Geist, 1rem/600); Period End and Status render as `label: value` pairs; Actions render full-width beneath.
- **Below 768px — Current Cycle strip**: period, rail, and Close Cycle button stack vertically instead of the desktop's row layout; Close Cycle becomes full-width (`fullWidth` input on `BrandButtonComponent`) to clear the 44px touch-target minimum.
- **Below 480px — Cycle Rail**: stage labels (`Open`/`Calculating`/`Closed`/`Paid`) hide, leaving only the dot-and-connector track — the rail still communicates position at a glance without needing horizontal space for four uppercase words.
- **Side panel**: unchanged from `SidePanelComponent`'s own live behavior (`width: min(420px, 100%)`), so it already goes full-width below ~420px with no additional CSS needed here.

## Out of scope

Settlement-math preview/simulation before closing. CSV/export of cycle history. Associate-facing cycle reports (covered elsewhere by `GET /api/associates/me/dashboard`, no screen here). Any per-income-type breakdown inside the close-result banner beyond the four real `CycleCloseResponse` fields.
