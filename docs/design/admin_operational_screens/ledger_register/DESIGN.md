---
name: Ledger Register (Admin Operational Screen)
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

Ledger Register is the third data-table-heavy **operational** admin screen to get a bespoke design pass, after Sales Register (`docs/design/admin_operational_screens/sales_register/`) and Cycle Management (`docs/design/admin_operational_screens/cycle_management/`). This design does not restart that system: same tokens, same `'Geist'`/`'Inter'`/`'JetBrains Mono'` stack, same `EditableTableComponent` (`readOnly`) usage shape, same pagination footer idiom. Per the brief for this dispatch, this screen is explicitly instructed to **mirror** Sales Register's pattern rather than invent new conventions — it is the plainest of the three, by design, not by omission.

Sales Register lets an admin *act* (record, void). Cycle Management lets an admin *act rarely, at high stakes* (close a cycle). Ledger Register never lets an admin act at all — Income/Ledger Unit 3's approved plan (`docs/superpowers/plans/2026-08-14-income-ledger-unit-3-admin-ledger-register-screen.md`) builds it against `LedgerRegisterComponent`'s produced interface, which exposes only four filter-change handlers and `goToPage` — no create, edit, void, or export path. It is a raw system-of-record view: every ledger entry ever posted, across every associate, exactly as the ledger engine wrote it, for cross-checking and dispute resolution. The design leans into that literalness as its one real distinguishing idea (see Signature element, below) rather than reaching for a motif borrowed from a screen with a different job.

## Layout concept

```
┌ ADMIN · LEDGER REGISTER  (eyebrow, mono, brand-primary)  ─────────────┐
│ Ledger Register                                                        │  <- operational-title, 28px
│ Every posted ledger entry, across every associate and cycle — a raw,   │
│ view-only audit trail. No entry here can be edited or removed.         │
├──────────────────────────────────────────────────────────────────────┤
│ ┌ filter strip (surface-raised, 16px radius) ─────────────────────┐   │
│ │ Associate ▾     Income Type ▾     Cycle ▾     Status ▾          │   │
│ └──────────────────────────────────────────────────────────────┘   │
│ [ inline-banner tone=danger — load error, when present ]              │
│ ┌ .card / .editable-table (ledger, no Actions column) ─────────────┐  │
│ │ ASSOCIATE | CYCLE PERIOD | INCOME TYPE | STATUS | NET AMOUNT |    │  │
│ │           SOURCE REF | CREATED AT                                │  │
│ │ ...rows, JetBrains Mono for net amount / dates / raw enum text... │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                    Page 2 of 9   [Previous] [Next]    │
└──────────────────────────────────────────────────────────────────────┘
```

Why no Reset-filters control, no date range, no `+ Add` button: `LedgerRegisterComponent`'s approved interface produces exactly `onAssociateIdChange` / `onIncomeTypeChange` / `onCycleIdChange` / `onStatusChange` / `goToPage` — no reset method, no create action, no row-action template. Sales Register's toolbar earns its "Reset filters" ghost button and date-range pair because it filters a high-volume transactional log by five independent axes including an open date range; Ledger Register filters by four closed-set dropdowns only (an admin picks "All associates" back out of the same select to clear it), so a dedicated reset control would be a decoration this screen's actual filter surface doesn't need — the same reasoning Cycle Management's DESIGN.md already applied when it dropped Sales Register's multi-field toolbar down to one field for its own, narrower filter surface.

## Signature element: the raw ledger

**Income Type and Status render as literal, unprettified enum text** — `SPONSOR_MATCHING`, not "Sponsor Matching"; `CARRIED_FORWARD`, not "Carried Forward" — set in uppercase `'JetBrains Mono'`, exactly as `LedgerEntry.incomeType`/`.status` are written by the ledger engine. Every other screen in this system translates or title-cases its enums for a human reader (Cycle Management's Status column, Sales Register's `RECORDED`/`VOIDED`). Ledger Register doesn't, on purpose: this is the screen an admin opens specifically to cross-check what the system *actually* wrote against a bank statement or a dispute claim, not a friendlier restatement of it. Showing the wire value verbatim is a real, functional choice for an audit tool — it removes one layer of "did the UI relabel this correctly?" doubt from a reconciliation workflow — not an aesthetic flourish. It costs nothing extra: `updateTableRows()` in the approved plan already passes `entry.incomeType`/`entry.status` straight through unmodified, so this design simply declines to add translation/title-casing on top rather than adding a new mechanism.

> **Superseded (design-parity plan, final review).** The mockup is the authority here and it disagrees: `Viraj_Acres_Settings.dc.html`'s own `ledgerRows` render Income Type in Title Case (`Direct Income`, `Matching Income`, `Sponsor Bonus`) and Status as per-value *colored* text (`l.statusColor`). Both columns now go through the shared `titleCase()` helper (`frontend/src/app/shared/utils/title-case.ts`) in `updateTableRows()`, and Status is an `EditableTableComponent` `type: 'badge'` column with a `statusBadgeTone` mapper — the same override Sales Register's DESIGN.md records for its own Status column. The audit-fidelity argument above no longer holds as written: what an admin cross-checks is the value, and `Carried Forward` is the same value as `CARRIED_FORWARD`.

A quieter second expression of the same idea: **`REVERSED` gets no special color, icon, or badge**, even though it is the one status tied to a voided sale and therefore the "interesting" row an admin is often hunting for. Per the plan's Global Constraints, this is deliberate — an audit view shows every status with equal visual weight so nothing is pre-judged as more or less important than the ledger engine already recorded. (This also matches the load-bearing platform constraint both prior screens' DESIGN.md documents flag: `EditableTableComponent`'s read-only cells render plain `{{ row[column.key] }}` text with no per-cell class hook, so per-value coloring isn't achievable here without extending a shared component — out of scope per this brief.)

> **Superseded (design-parity plan, final review).** `EditableTableComponent` gained a `type: 'badge'` column (a `badgeTone` value→tone mapper rendering plain colored text via `--status-success`/`--status-warning`/`--status-danger`, no pill background), so per-value coloring *is* achievable without a bespoke primitive. Status is now colored per value on this screen, per the mockup's `l.statusColor`.

## Component mapping (no new primitives)

| Screen need | Component used | Notes |
|---|---|---|
| Register table + pagination shell | `EditableTableComponent` (`readOnly`, no `actionTemplate`) | Columns: Associate, Cycle Period, Income Type, Status, Net Amount, Source Ref, Created At. No Actions column — the one hard functional difference from Sales Register/Cycle Management's table shape, per this unit's view-only scope. |
| Associate / Income Type / Cycle / Status filters | Four plain `<select>`s inside a `surface-raised` strip | Matches Sales Register's `sales-register__filter-field` idiom, minus the date-range fields and Reset button (see Layout concept for why). |
| Load error | `InlineBannerComponent` tone="danger" | The approved plan's Task 3 code currently renders a plain `<p class="ledger-register__load-error">`; this design recommends the same one-line upgrade Sales Register's own DESIGN.md already made over `associate-directory__load-error`'s flat `<p>` — swap for `<app-inline-banner tone="danger">`, keeping the CSS hook class name for the implementer to find but wrapping the established banner component instead of a bare paragraph, so this screen's one feedback surface matches the convention every other bespoke-pass screen already established. |
| Empty state | `EditableTableComponent`'s built-in `emptyStateLabel` row | The component takes a single translated string, not a template slot — so unlike Sales Register's two-line title+hint empty state (which needed a bespoke inner `<div>`, not available here), Ledger Register's empty state is one centered, muted line via the base `.editable-table__empty` cell. This is a real capability difference, not an inconsistency: Sales Register's fancier empty state depends on markup this component's `readOnly` empty-state branch doesn't expose. |

### Implementation constraint worth flagging (same one Sales Register and Cycle Management both flag)

> **Superseded (design-parity plan, final review).** The "no per-cell class hook" constraint below is no longer true: `EditableTableComponent` now has a `type: 'badge'` column type. Ledger Register's Status column uses it; Income Type stays a `type: 'text'` column but is title-cased before it reaches the table. The rest of the paragraph (Net Amount's `nth-child` right-alignment) still describes shipped code.

`EditableTableComponent`'s read-only data cells render `{{ row[column.key] }}` as plain text with no per-cell class hook. Income Type and Status are therefore styled uniformly (mono, uppercase — see Signature element above) rather than per-value colored; Net Amount is right-aligned ledger-mono via an `nth-child` CSS rule, the same technique Sales Register's Amount column already uses, not a component change.

### A currency-formatting note for the implementer

The approved plan's `updateTableRows()` currently maps `netAmount: String(entry.netAmount)` — a raw unformatted number. This design mocks it up as a right-aligned, thousands-separated `₹` figure (`₹9,300`), matching the ledger-mono treatment Sales Register's Amount column already established for the exact same data shape (money, in the same currency, in the same visual system). Recommend threading a currency pipe through that one line in Task 3 before merge — a one-line fix in the same spirit as the `data-label` and inline-banner notes above, not a scope change.

## Screen states

1. **Register, default/loaded.** Filter strip at rest (all four selects on "All …"), full page of entries, pagination footer active.
2. **Empty state.** A filter combination (e.g. Status = Reversed, Associate = one with no reversed entries) returns zero rows; the table falls back to its single-line `emptyStateLabel` row, filter strip stays interactive above it.
3. **Load error.** Initial page load fails; `InlineBannerComponent` tone="danger" sits above the table, table shows its empty-state row beneath (nothing to show), same placement Sales Register and Cycle Management both use for their own load-error banners.

## Colors

| Use | Token |
|---|---|
| Page background | `--surface-page` |
| Card / table surface | `--surface-card` |
| Filter strip surface | `--surface-raised` |
| Borders, table rules | `--border-subtle` |
| Headings, primary data | `--text-primary` |
| Labels, secondary data, hints | `--text-muted` |
| Eyebrow, focus ring | `--brand-primary` / `--brand-primary-soft` |
| Load error banner | `--status-danger` |

No new hex value or custom property appears anywhere in this design — every color above resolves to the same `_tokens.scss` variables Sales Register and Cycle Management already mapped. This screen introduces no success/warning banner (it has no write action to succeed or warn about).

## Typography

Reuses the exact live stack (`_admin.scss`'s `.create-associate__*`/`.sales-register__*`/`.cycle-management__*` rules):
- **Geist** — screen title (1.75rem, matching the other two list screens' sizing, not a hero 2rem).
- **Inter** — body copy, filter label text content, Associate and Cycle Period cell values.
- **JetBrains Mono** — eyebrow, field labels, Income Type and Status columns (superseded — both now render Title Case, and Status is a colored `badge` column; see the Signature element note), Net Amount (`tabular-nums`, right-aligned, `₹` formatted — see currency note), and Created At (`tabular-nums`, muted) — the same "monospace for precision/ledger data" idiom Sales Register established for Amount/Recorded At, applied here across every numeric or enum-valued column since this entire screen is, structurally, a ledger.

## Shape, elevation, spacing

Reused verbatim from the live `.sales-register`/`.cycle-management` rules: 20px card radius, `0 4px 20px -2px rgba(0,0,0,0.08)` card shadow, 16px panel radius (filter strip), 8–12px control radius, 1.5rem row gaps, zero-padding/overflow-hidden table card (same as both precedents' ledger cards).

## Responsive behavior

Same breakpoint the other two screens use and name explicitly (`md` = 768px) for the dense register table, reusing the identical `data-label` stacked-card technique Sales Register's DESIGN.md flagged as a one-line `EditableTableComponent` addition (already shipped by the time this screen builds, so no second flag needed):

- **Below 768px — register table**: rows collapse to one stacked card per row. Associate is the card title (Geist, 1rem/600); Cycle Period, Income Type, Status, Net Amount, Source Ref, and Created At render as `label: value` pairs via `content: attr(data-label)`. No Actions row, since there is none.
- **Below 768px — filter strip**: the four selects stack full width, one per row.
- **Touch targets**: pagination buttons get explicit `min-height: 44px` below 768px — the base desktop-density padding doesn't clear 44px on its own.

## Out of scope (per Part A of the implementation plan)

No export/report affordance of any kind (no aggregate CSV/PDF "Total Income Report" — explicitly out of scope per the source spec). No create/edit/delete/void action. No PAN/EMI/matching-royalty income-calculation logic, cycle-close, or wallet/withdrawal UI.
