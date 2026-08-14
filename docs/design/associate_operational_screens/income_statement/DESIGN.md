---
name: Income Statement (Associate Operational Screen)
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

Income Statement is the first **associate-facing** screen in this system's operational/ledger-domain design system to get a bespoke pass — every prior bespoke screen (Sales Register, Cycle Management, Ledger Register, all under `docs/design/admin_operational_screens/`) was built for an admin. This screen reuses that system wholesale — same tokens, same `'Geist'`/`'Inter'`/`'JetBrains Mono'` stack, same `EditableTableComponent` (`readOnly`) usage shape, same pagination-footer idiom, same mono-ledger-typography and raw-enum-text conventions the admin Ledger Register screen (`docs/design/admin_operational_screens/ledger_register/`) established for this exact domain. It does not invent a second visual language for the same data.

What's different is the *job*. Ledger Register is an audit tool: every entry, every associate, deliberately flat and unprettified, built for cross-checking against a bank statement. Income Statement is the opposite audience for the identical data shape — it's one associate looking at **their own money**: what they earned, split by income type, and exactly how each rupee got from gross to net. Income/Ledger Unit 4's approved plan (`docs/superpowers/plans/2026-08-14-income-ledger-unit-4-associate-income-statement-screen.md`) reflects that difference structurally: `IncomeStatementComponent` is built around `TabBarComponent` (income-type tabs, an already-proven pattern from `KycQueueComponent`) rather than a fifth filter dropdown, and its table carries all four of `grossAmount`/`tdsDeduction`/`adminDeduction`/`netAmount` as separate columns (Design Decision 4) rather than Ledger Register's single `netAmount` column — because "itemized breakdown" is this screen's whole reason to exist, not an audit-trail side effect.

## Layout concept

```
┌ ASSOCIATE · INCOME STATEMENT  (eyebrow, mono, brand-primary)  ─────────┐
│ Income Statement                                                        │  <- operational-title, 28px
│ Your itemized income history, by cycle and income type.                 │
├──────────────────────────────────────────────────────────────────────┤
│ ┌ tab-bar (segmented pill, brand-gradient active) ────────────────┐    │
│ │ [All] [Direct] [Matching] [Sponsor Matching] [Royalty] [Reward]  │    │
│ │ [Perk]                                    (scrolls on narrow vw) │    │
│ └──────────────────────────────────────────────────────────────┘    │
│ ┌ filter strip (surface-raised, 16px radius) — 2 fields, not 4 ────┐   │
│ │ Cycle ▾                       Status ▾                           │   │
│ └──────────────────────────────────────────────────────────────┘   │
│ [ inline-banner tone=danger — load error, when present ]              │
│ ┌ .card / .editable-table (statement, no Actions column) ───────────┐ │
│ │ INCOME TYPE | CYCLE PERIOD | STATUS | GROSS | TDS | ADMIN | NET |  │ │
│ │             SOURCE REF | CREATED AT                                │ │
│ │ ...rows: gross (muted) → −TDS (danger-tint) → −Admin (warning-tint)│ │
│ │     → Net (bold, brand-tinted chip) — the "payslip ladder"...      │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                    Page 1 of 3   [Previous] [Next]     │
└──────────────────────────────────────────────────────────────────────┘
```

Why the filter strip only has two fields where Ledger Register has four: `IncomeStatementComponent`'s approved interface produces `onCycleIdChange` / `onStatusChange` / `onTabChange` — income type moved out of the dropdown row entirely and into the tab bar (Design Decision 3: an "All" pseudo-tab plus the six `IncomeType` values), and there is no `associateId` filter at all because the endpoint (`GET /api/associates/me/ledger`) never takes one — it's always "my own" data (Global Constraints). The remaining two dropdowns — Cycle and Status — sit in the same `surface-raised` filter-strip idiom Ledger Register already established, just narrower, because there are fewer of them.

## Signature element: the payslip ladder

**The four money columns — Gross, TDS Deduction, Admin Deduction, Net — are typeset as a left-to-right subtraction, not four interchangeable numbers.** Gross Amount sits in muted mono, the plain starting figure. TDS Deduction and Admin Deduction are set smaller, each prefixed with a mono "−", and colored apart from each other — TDS in `--status-danger` (a statutory deduction that always applies), Admin Deduction in `--status-warning` (a platform-side cost, functionally different money even though both are subtractions) — so an associate can tell at a glance which kind of deduction ate into a given entry without reading the column header twice. Net Amount closes the row: bold, `tabular-nums`, sized up from the deduction columns, sitting on a soft `--brand-primary-soft` chip — the one number in the row that gets a background, because it's the one number the associate actually takes home.

This is the direct associate-facing counterpart to Ledger Register's "raw ledger" signature, and deliberately inverts its reasoning rather than copying it: Ledger Register's `REVERSED` status "gets no special color... because an audit view shows every status with equal weight" — nothing is pre-judged as more or less important than what the ledger engine recorded. Income Statement's money columns get the *opposite* treatment on purpose, because this is not an audit view. An associate reading their own income statement benefits from seeing the arithmetic, not just the inputs and the output — the same reason a real payslip shows gross, deductions, and net as a visible sequence rather than one flat number. Income Type and Status, by contrast, keep Ledger Register's exact convention (raw, uppercase, mono, uniform weight — see Component mapping below): those two columns are identifiers, not money, and the approved plan's `updateTableRows()` already passes `entry.incomeType`/`entry.status` straight through unmodified, same as Ledger Register's. The signature is scoped to the one place this screen is genuinely a different kind of document.

## Component mapping (no new primitives)

| Screen need | Component used | Notes |
|---|---|---|
| Income-type navigation | `TabBarComponent` (`app-tab-bar`) | Same segmented-pill component `KycQueueComponent` already uses (`.tab-bar`/`.tab-bar__tab`/`.tab-bar__tab--active` in `_shared-components.scss` — brand-gradient active state, no new CSS). Seven tabs (`All`, `Direct`, `Matching`, `Sponsor Matching`, `Royalty`, `Reward`, `Perk`) — more than any existing `TabBarComponent` consumer ships today, so this design adds one small, additive rule: the tab row scrolls horizontally with hidden native scrollbars below the width it needs, rather than wrapping to a second line or overflowing the viewport. No component change — a wrapper `overflow-x: auto` on the existing `.tab-bar` render, same technique the responsive section below uses for the table. |
| Statement table + pagination shell | `EditableTableComponent` (`readOnly`, no `actionTemplate`) | Columns: Income Type, Cycle Period, Status, Gross Amount, TDS Deduction, Admin Deduction, Net Amount, Source Ref, Created At. No Actions column — view-only, per Global Constraints. |
| Cycle / Status filters | Two plain `<select>`s inside a `surface-raised` strip | Same `*__filter-field` idiom as Ledger Register, income type omitted (lives in the tab bar instead — see Layout concept). Cycle options are the client-derived, deduped, newest-first list from Design Decision 1 of the approved plan — rendered here as period-range text (`1 Aug 2026 – 31 Aug 2026`), never a raw `cycleId`. |
| Load error | `InlineBannerComponent` tone="danger" | The approved plan's Task 3 code currently renders a plain `<p class="income-statement__load-error">`; this design recommends the same one-line upgrade every other bespoke-pass screen in this domain (Sales Register, Ledger Register) already made — swap for `<app-inline-banner tone="danger">`, keeping the CSS hook class name for the implementer to find. Per Design Decision 1, a *cycle-lookup* failure never triggers this banner (it only empties the Cycle dropdown) — only a failed main-table load does. |
| Empty state | `EditableTableComponent`'s built-in `emptyStateLabel` row | One centered, muted line via `.editable-table__empty`, same as Ledger Register — this component's `readOnly` empty-state branch takes a string, not a template slot. |

### Implementation constraint worth flagging (same one every prior screen in this system flags)

`EditableTableComponent`'s read-only data cells render `{{ row[column.key] }}` as plain text with no per-cell class hook. Every column's visual treatment below — including the payslip-ladder coloring — is therefore achieved via `nth-child` CSS on the table, the same technique Ledger Register's Net Amount and Sales Register's Amount column already use, not a component change. Income Type and Status stay uniform (mono, uppercase, muted) because, per this same constraint, there is no per-value color hook available for `REVERSED` (or any other value) without extending the shared component — out of scope per this brief, and consistent with Ledger Register's own documented reasoning for leaving `REVERSED` uncolored.

### A currency-formatting note for the implementer

The approved plan's `updateTableRows()` currently maps all four money fields as raw unformatted numbers (`grossAmount: String(entry.grossAmount)`, etc.). This design mocks them up as right-aligned, thousands-separated `₹` figures (`₹10,000`, `−₹500`, `−₹200`, `₹9,300`), matching the ledger-mono treatment Ledger Register's Net Amount column already established for the same data shape. Recommend threading a currency pipe through those four lines in Task 3 before merge, plus prefixing `tdsDeduction`/`adminDeduction` with the minus sign in the mapped string itself (this design's mockup below applies the "−" via CSS `content` on the `td`, which is a design-only shortcut — the real value has no sign today, so the implementer should add it in `updateTableRows()`, not rely on CSS to imply arithmetic the data doesn't literally carry).

## Screen states

1. **Statement, default/loaded.** "All" tab active, both filters at rest ("All cycles" / "All statuses"), full page of entries across every income type, pagination footer active.
2. **Single income-type tab active.** E.g. "Perk" selected — tab bar shows the active pill, table reloads to only that `incomeType`, filters remain independently applied on top (Design Decision 3's "All" default plus Global Constraints' un-hidden `PERK` tab).
3. **Empty state.** A filter/tab combination (e.g. Status = Reversed on a tab with no reversed entries) returns zero rows; the table falls back to its single-line `emptyStateLabel` row, tab bar and filter strip stay interactive above it.
4. **Load error.** Initial page load fails; `InlineBannerComponent` tone="danger" sits above the table, table shows its empty-state row beneath, same placement every other bespoke-pass screen in this domain uses.

## Colors

| Use | Token |
|---|---|
| Page background | `--surface-page` |
| Card / table surface | `--surface-card` |
| Filter strip surface | `--surface-raised` |
| Borders, table rules | `--border-subtle` |
| Headings, primary data, Net Amount | `--text-primary` |
| Labels, secondary data, Gross/Cycle/Source/Created At | `--text-muted` |
| Eyebrow, focus ring, active tab, Net Amount chip | `--brand-primary` / `--brand-primary-soft` |
| TDS Deduction | `--status-danger` |
| Admin Deduction | `--status-warning` |
| Load error banner | `--status-danger` |

No new hex value or custom property appears anywhere in this design — every color above resolves to the same `_tokens.scss` variables every other screen in this system already maps, including the two deduction colors, which reuse the existing `--status-danger`/`--status-warning` tokens rather than introducing new ones.

## Typography

Reuses the exact live stack (`_admin.scss`'s `.sales-register__*`/`.ledger-register__*` rules, extended here under an `.income-statement__*` namespace):
- **Geist** — screen title (1.75rem, matching every other operational screen's sizing, not a hero 2rem).
- **Inter** — body copy, filter label text content, subtitle.
- **JetBrains Mono** — eyebrow, field labels, tab-bar labels (inherits `.tab-bar__tab`'s existing `'Inter'` — the *component's* font, not overridden here, since this design changes no shared component), Income Type and Status columns (uppercase, raw enum text, same convention as Ledger Register), Cycle Period and Created At (`tabular-nums`, muted), Source Ref (mono, muted, dash for null), and all four money columns (`tabular-nums`, right-aligned, `₹` formatted, weight and size stepped per the payslip-ladder signature above).

## Shape, elevation, spacing

Reused verbatim from the live `.sales-register`/`.ledger-register` rules: 20px card radius, `0 4px 20px -2px rgba(0,0,0,0.08)` card shadow, 16px panel radius (filter strip), 8–12px control radius, 999px pill radius (tab bar, inherited from `.tab-bar`'s existing rules), 1.5rem row gaps, zero-padding/overflow-hidden table card.

## Responsive behavior

Same `md` = 768px breakpoint every prior screen in this system names explicitly, reusing the identical `data-label` stacked-card technique for the dense statement table:

- **Below 768px — tab bar**: stays a single horizontally-scrolling row (`overflow-x: auto`, `-webkit-overflow-scrolling: touch`, scrollbar hidden) rather than wrapping — the seven tabs keep their pill shape and don't reflow into a second line, which would push the filter strip and table down unpredictably depending on tab-label length.
- **Below 768px — statement table**: rows collapse to one stacked card per row. Income Type is the card title (Geist, 1rem/600, uppercase mono per the raw-enum convention); Cycle Period, Status, Gross Amount, TDS Deduction, Admin Deduction, Net Amount, Source Ref, and Created At render as `label: value` pairs via `content: attr(data-label)`. The payslip-ladder coloring (muted gross, danger TDS, warning admin, chip net) survives the stack — it's per-value color, not a row-relative layout effect. No Actions row, since there is none.
- **Below 768px — filter strip**: the two selects stack full width, one per row.
- **Touch targets**: pagination buttons and tab-bar pills get explicit `min-height: 44px` below 768px — the base desktop-density padding doesn't clear 44px on its own.

## Out of scope (per Global Constraints of the source plan)

No export/report affordance of any kind. No create/edit/delete/void action — this is strictly view-only, matching the role-capability matrix's "Associate: view-only" for this domain. No PAN/EMI/matching-royalty income-calculation logic, cycle-close, or wallet/withdrawal UI.
