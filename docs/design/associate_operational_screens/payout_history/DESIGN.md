---
name: Payout History (Associate Operational Screen)
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
    subtitle: "'Inter', var(--font-sans) — 0.9375rem/400, color text-muted"
    field-label: "'JetBrains Mono', monospace — 0.6875–0.75rem/500/uppercase/0.04em, color text-muted"
    body: "'Inter', var(--font-sans) — 0.875rem/400"
    ledger-data: "'JetBrains Mono', monospace — 0.75–0.875rem/600, tabular-nums"
    balance-figure: "'Geist', var(--font-sans) — 2.5rem/700/-0.01em, tabular-nums"
  radius:
    card: 20px
    ribbon: 20px
    panel: 16px
    control: 8-12px
  spacing:
    row-gap: 1.5rem
    ribbon-padding: 1.75rem 2rem 1.75rem 2.25rem
    field-gap: 1.25rem
  shadow:
    card: "0 4px 20px -2px rgba(0, 0, 0, 0.08)"
---

## Why this screen, why now

Payout History is the second **associate-facing** screen in this bespoke design system, after Income Statement, and it reuses that system wholesale: identical `:root` token block, identical `'Geist'`/`'Inter'`/`'JetBrains Mono'` stack, identical `.card`/`EditableTableComponent` (`readOnly`)/`InlineBannerComponent`/pagination-footer primitives every prior screen in `docs/design/` already established. Nothing in `code.html`'s tokens block deviates by a single hex value from Income Statement's or Sales Register's — verified line-for-line against both files.

Where it differs is structural, not stylistic, and both differences trace straight back to the approved plan (`docs/superpowers/plans/2026-08-15-wallet-withdrawal-unit-11-associate-payout-history-screen.md`):

- **One filter, no tabs.** Income Statement tabs on income type because that's a second real dimension of its data (`IncomeType`, six values). Withdrawal requests have no second dimension to tab on — just a status enum — so this screen follows `SalesHistoryComponent`'s simpler single-filter shape (a lone `Status` `<select>` in a `surface-raised` strip) rather than building a tab bar for a filter that doesn't exist.
- **A balance display, not a payslip ladder.** The plan's own "Design decision" section works through this explicitly and concludes there is nothing left to itemize here: by the time money reaches the wallet, `WalletCreditingService.creditWalletsForCycle()` has already credited the *net* amount — TDS and admin-deduction arithmetic happened one layer up, on the income-ledger side, and `withdrawal_request`'s schema (`amount`/`status`/`reason`/`bankReference`/`requestedAt`/`decidedAt`/`disbursedAt`) carries no deduction fields to ladder even if the design wanted to. A withdrawal is a plain debit against an already-net pool, so this screen earns its one signature move somewhere else — the wallet balance itself, which *is* the one number this screen exists to put in front of the associate first.

## Layout concept

```
┌ ASSOCIATE · PAYOUT HISTORY  (eyebrow, mono, brand-primary)  ──────────┐
│ Payout History                                                        │  <- operational-title, 28px
│ Your wallet balance and withdrawal request history.                   │
├────────────────────────────────────────────────────────────────────┤
│ ┌ Balance Ribbon (brand-tinted card, gradient rail, 20px radius) ──┐  │
│ │▐ WALLET BALANCE                                                  │  │
│ │▐ ₹12,500.00                                                      │  │
│ └──────────────────────────────────────────────────────────────┘  │
│ ┌ filter strip (surface-raised, 16px radius) — 1 field, not 2/4 ──┐  │
│ │ Status ▾                                                         │  │
│ └──────────────────────────────────────────────────────────────┘  │
│ [ inline-banner tone=danger — history load error, when present ]     │
│ ┌ .card / .editable-table (view-only, no Actions column) ─────────┐  │
│ │ AMOUNT | STATUS | REASON | BANK REF | REQUESTED | DECIDED | ...  │  │
│ │ row REQUESTED  ───────────────────────────────── —  —  —         │  │
│ │ row APPROVED   ───────────────────────────────── ...  —          │  │
│ │ row REJECTED   ───────────────────────────────── ...  —          │  │
│ │ row DISBURSED  ───────────────────────────── REF-88213  ...  ... │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                    Page 1 of 1   [Previous] [Next]   │
└────────────────────────────────────────────────────────────────────┘
```

Why the filter strip has one field where Income Statement has two and Ledger Register has four: `PayoutHistoryComponent`'s produced interface exposes exactly `onStatusChange`/`goToPage`, no cycle/associate/date filters — `GET /api/associates/me/withdrawals` is scoped to the caller server-side and a withdrawal isn't tied to a single cycle (Global Constraints, Design decision section), so there's nothing else to filter by. A one-field strip that still reads as a deliberate "filter panel" rather than an orphaned dropdown is why the strip keeps its full `surface-raised`/16px-radius/1.25rem-padding treatment instead of shrinking to a bare inline control.

## Signature element: the Balance Ribbon

**The wallet balance sits in its own card, visually distinct from the plain white `.card` the table uses, directly above the filter strip — the first thing on the page besides the title.** Three choices make it read as "the number that matters," proportionate to a screen whose entire second half is about how that number moves:

- **A soft brand-gradient wash** (`linear-gradient(135deg, var(--brand-primary-soft), var(--surface-card) 60%)`) instead of the flat white every other card in this system uses, plus a 5px solid gradient rail down the left edge (`::before`, `var(--brand-gradient)`). Both are existing tokens recombined, not new color — the same gradient variable Income Statement's active tab and every screen's primary button already use, just applied to a card for the first time in this domain.
- **A size jump the table never gets**: the balance figure is set at 2.5rem `'Geist'` 700 — a full step above the 1.75rem screen title above it and roughly triple the table's own 0.875rem body size. Nothing else on the page competes with it at that scale.
- **A mono, uppercase, letter-spaced label** (`WALLET BALANCE`, `'JetBrains Mono'`, 0.75rem) sitting directly above the figure — the same field-label idiom every filter and column header in this system already uses, so the ribbon reads as "one big data point," not an unrelated banner or hero graphic dropped onto an otherwise plain operational screen.

This is the direct associate-facing counterpart to Income Statement's payslip ladder, and it deliberately does *not* copy that pattern: Income Statement earns a multi-column arithmetic sequence because itemizing gross→TDS→admin→net *is* that screen's reason to exist. Payout History has one number worth foregrounding and seven columns of plain history beneath it — so the design puts all of its signature weight into making that one number unmissable, rather than inventing a breakdown the data doesn't have. Ledger Register's own "raw ledger, no signature colors" restraint and Income Statement's "signature scoped to the one place this screen is genuinely different" reasoning both point the same direction here: match the ambition of the treatment to what the data actually supports.

**Degraded state (State 5).** Because the wallet-balance lookup and the withdrawal-history load are independent requests (per the plan's Task 3, mirroring Income Statement's cycle-lookup/main-table split), a failed balance lookup must never block or blank the table. `code.html` recommends a `--degraded` modifier — same card, gradient rail replaced with `var(--border-subtle)`, figure shrunk to 1.75rem/500/muted, wash removed — plus one short hint line ("Couldn't load your balance right now. Your request history below is unaffected."). This is flagged inline in `code.html` (lines 126–132) as a **recommended addition beyond the plan's literal template**: the plan's own `formattedWalletBalance` getter already returns the translated `payoutHistory.walletLoadError` string ("—") on failure, but doesn't specify a dimmed card treatment or hint copy. Implementing it needs one new i18n key (`payoutHistory.walletLoadErrorHint`) and one class binding (`[class.payout-history__wallet-balance--degraded]="walletBalance === null"`) — the same "one string, one binding" idiom Payout Approval's DESIGN.md used for its own auto-approved-hint recommendation.

## Component mapping (no new primitives)

| Screen need | Component used | Notes |
|---|---|---|
| History table + pagination shell | `EditableTableComponent` (`readOnly`, no `actionTemplate`) | Columns: Amount, Status, Reason, Bank Reference, Requested At, Decided At, Disbursed At — the exact seven fields on `AssociateWithdrawalRequest`. No Actions column at all, matching the plan's "view-only, no actions of any kind" constraint (the associate read-only posture for this domain) — unlike Payout Approval's admin queue, this table's `actionTemplate` input is simply never passed. |
| Status filter | One plain `<select>` inside a `surface-raised` strip | Same `*__filter-field` idiom as Income Statement/Ledger Register, just a single field. Options are the plan's exact closed set — All / Requested / Approved / Rejected / Disbursed — no invented fifth "hold" value, per Global Constraints. |
| Wallet balance | Bespoke `.payout-history__wallet-balance.card` (Balance Ribbon) | Not a shared component — a contextual variant of `.card`, same technique every prior screen's bespoke blocks use (Income Statement's filter strip, Sales Register's record form). |
| History load error | `InlineBannerComponent` tone="danger" | Matches the plan's Task 3 template verbatim (`<app-inline-banner *ngIf="loadError" tone="danger">`). Per the plan's independent-failure design, this banner reflects only the withdrawal-history load failing — a wallet-lookup failure never triggers it (State 5 shows the inverse: banner absent, table populated, balance degraded). |
| Empty state | `EditableTableComponent`'s built-in `emptyStateLabel` row | Single centered, muted line via `.editable-table__empty`, same as every prior screen — `readOnly` mode's empty branch takes a string, not a template slot. |

### Implementation constraint worth flagging (same one every prior screen in this system flags)

`EditableTableComponent`'s read-only cells render `{{ row[column.key] }}` as plain text with no per-cell class hook. Status therefore stays uniform (mono, uppercase, muted) rather than color-coded per value — same documented limitation Payout Approval's DESIGN.md calls out for its own Status column, and the same reason this screen puts no colored pill anywhere: unlike Payout Approval, there's no `actionTemplate` here to carry one instead (this screen has none — it's view-only). The Reason and Bank Reference columns' `is-empty` italic-dash treatment (`nth-child(3).is-empty`) is mocked the same way Payout Approval's own `code.html` already mocks its Reason/Bank Reference `is-empty` cells — a static demonstration of the intended look, not something `updateTableRows()`'s current plain-string mapping can produce on its own without an implementer adding an `is-empty` class hook alongside the existing `formatOrDash()` helper.

## Screen states

Five states, documented in `code.html`:

1. **Default/loaded, all statuses.** Wallet balance loaded, one row per status (REQUESTED/APPROVED/REJECTED/DISBURSED) shown together — the same combined-states technique Sales Register and Payout Approval's own State 1 use to demonstrate the full range of row shapes in one realistic table.
2. **Status filter applied (Disbursed).** Confirms the filter narrows the table and resets pagination to page 1, per `onStatusChange()`'s documented behavior.
3. **Empty state.** A filter with no matches (Rejected, zero balance) falls back to the table's single-line empty message; wallet balance and filter strip stay interactive above it.
4. **History load error, wallet balance unaffected (independent failure, direction 1).** `loadError` true, banner shown, balance still renders normally — proves the wallet lookup doesn't get dragged down by a history-table failure.
5. **Wallet balance degraded, history loads normally (independent failure, direction 2).** The inverse: balance card shows the degraded treatment + hint line, table renders its rows exactly as it would on a clean load — proves the history table doesn't get blocked by a wallet-lookup failure.

Both directions of the independent-failure design get their own state, rather than one state standing in for "something failed" — the whole point of the plan's two-independent-requests architecture is that either can fail alone, so the design shows both alone.

## Colors

| Use | Token |
|---|---|
| Page background | `--surface-page` |
| Card / table surface | `--surface-card` |
| Filter strip surface | `--surface-raised` |
| Borders, table rules | `--border-subtle` |
| Headings, primary data, Amount | `--text-primary` |
| Labels, secondary data (Status, Reason, Bank Reference, dates) | `--text-muted` |
| Eyebrow, focus ring, Balance Ribbon gradient rail/wash | `--brand-primary` / `--brand-gradient` / `--brand-primary-soft` |
| History load error banner | `--status-danger` |

No new hex value or custom property appears anywhere in this design — every color resolves to the same `_tokens.scss` variables Income Statement and Sales Register already map. `--status-success`/`--status-warning` are declared in the tokens block (inherited wholesale, unmodified) but unused on this screen — there's no success/warning surface here, only a plain history table and one danger-tone error banner.

## Typography

Reuses the exact live stack, extended here under a `.payout-history__*` namespace:
- **Geist** — screen title (1.75rem, matching every other operational screen) and the Balance Ribbon figure (2.5rem/700, the one place this screen goes larger than any prior screen's type scale — justified by being the screen's single most important number).
- **Inter** — body copy, subtitle, filter label text content.
- **JetBrains Mono** — eyebrow, field labels, the Balance Ribbon's `WALLET BALANCE` label, Amount (`tabular-nums`, right-aligned, same money treatment Sales Register/Income Statement/Payout Approval all use), Status (uppercase, muted, per the Implementation constraint above), Bank Reference (code/reference face, dash until DISBURSED per Global Constraints), and Requested/Decided/Disbursed At (`tabular-nums`, muted).

## Shape, elevation, spacing

Reused verbatim from the live `.income-statement`/`.sales-register` rules: 20px card radius, `0 4px 20px -2px rgba(0,0,0,0.08)` card shadow, 16px panel radius (filter strip), 8–12px control radius, 1.5rem row gaps, zero-padding/overflow-hidden table card. The Balance Ribbon reuses the same 20px radius and shadow as the table card so the two read as siblings in the same visual family, distinguished by fill (gradient wash vs. flat white) rather than shape.

## Responsive behavior

Same `md` = 768px breakpoint every prior screen in this system names explicitly:

- **Below 768px — Balance Ribbon**: padding tightens (`1.5rem 1.5rem 1.5rem 1.75rem`), figure steps down to 2rem — still visibly the largest text on the page, just scaled for a narrower viewport.
- **Below 768px — history table**: rows collapse to one stacked card per row via the shared `data-label` technique (the same `EditableTableComponent` addition Sales Register/Income Statement/Payout Approval all rely on). Amount is the card's lead value (Geist, 1.0625rem/600, right-aligned) since there's no title-worthy identifier column on this table (no associate name — every row is already the caller's own); the remaining six fields render as `label: value` pairs.
- **Below 768px — filter strip**: the single Status select goes full width — there's no second field to stack against.
- **Touch targets**: pagination buttons get explicit `min-height: 44px` below 768px, same as every prior screen.

## Out of scope (per the approved plan's Design decision and Global Constraints)

No TDS/admin-deduction breakdown anywhere on this screen — verified against the plan's own research that `withdrawal_request` has no deduction columns and never will, since `WalletCreditingService` credits only the already-net amount. No downloadable PDF statement — no export endpoint exists in scope. No actions of any kind (no approve/reject/disburse/cancel controls) — this is the associate's read-only view of a queue the admin-facing Payout Approval screen (`docs/design/admin_operational_screens/payout_approval/`) already handles the mutating side of. No fifth "hold" status — `WithdrawalRequestStatus` is a strict 4-value enum. No cycle or date-range filter — a withdrawal isn't scoped to a single cycle at all.
