---
name: Payout Approval (Admin Operational Screen)
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

Payout Approval is the fourth data-table-heavy **operational** admin screen to get a bespoke design pass, after Sales Register, Cycle Management, and Ledger Register (all in `docs/design/admin_operational_screens/`). It does not restart that system: same tokens, same `'Geist'`/`'Inter'`/`'JetBrains Mono'` stack, same `EditableTableComponent` (`readOnly`) usage shape, same pagination footer idiom, same `InlineBannerComponent`/`FieldErrorComponent`/`BrandButtonComponent` mapping every prior screen uses.

Where it differs from all three predecessors: it is the first screen whose rows carry **more than one possible action set**, and the first whose action set genuinely branches per row (Sales Register's rows only ever differ between "one input + one button" and "a static tag" — two shapes; Ledger Register has none; Cycle Management's row actions are uniform). This screen's rows carry up to **four** live states with different control counts (`REQUESTED`: 1 button + 1 input/button pair; `APPROVED`: two input/button pairs; `REJECTED`/`DISBURSED`: a static tag, no controls) drawn straight from the approved plan's `PayoutApprovalComponent` (`docs/superpowers/plans/2026-08-15-wallet-withdrawal-unit-10-admin-payout-approval-screen.md`, Task 4). The design problem this brief calls out explicitly — keeping that variability from reading as visual noise — is this screen's real job, and it's the one thing worth a signature treatment (see below) rather than reusing Sales Register's simpler two-shape Actions column unchanged.

Per the plan's own staging note (mirroring Cycle Management's precedent), the approved implementation plan builds this screen fully functional with zero bespoke CSS first; this artifact is the separate, later `superpowers:frontend-design` pass the plan explicitly deferred.

## Two components, one artifact

This unit ships two Angular components — `PayoutApprovalComponent` (the queue) and `SubmitWithdrawalComponent` (the separate submit-on-behalf-of route, no modal, same reasoning `RecordSaleComponent` used) — and this file covers both, the same way Sales Register's own `code.html` already combines its register table (`.sales-register`) and its `RecordSaleComponent`-equivalent form (`.record-sale`) in one file rather than two artifact sets. That is in fact the precedent this brief asked me to check for and reuse: **no standalone `RecordSaleComponent`-style form design exists elsewhere in `docs/design/`** — Sales Register's own `code.html` *is* that precedent, embedded in the same file as its list screen. `.submit-withdrawal` below mirrors `.record-sale`'s structure (eyebrow/title/subtitle/card-form/row-field/field-error idiom) exactly, just with the two-field form (`Associate`, `Amount`) this unit's plan actually specifies instead of Record Sale's dependent Project→Plot selects.

## Layout concept — queue

```
┌ ADMIN · PAYOUT APPROVAL  (eyebrow, mono, brand-primary)  ─────────────┐
│ Payout Approval                                  [+ Submit Withdrawal]│  <- operational-title, 28px
│ Review, approve, reject, and disburse associate withdrawal requests.  │
├─────────────────────────────────────────────────────────────────────┤
│ ┌ filter strip (surface-raised, 16px radius) ───────────────────┐    │
│ │ Associate ▾              Status ▾                             │    │
│ └────────────────────────────────────────────────────────────┘    │
│ [ inline-banner tone=danger — load error, when present ]             │
│ [ inline-banner tone=danger — action error, when present ]           │
│ ┌ .card / .editable-table (ledger) ──────────────────────────────┐  │
│ │ ASSOCIATE | AMOUNT | STATUS | REASON | BANK REF | REQUESTED AT │Actions
│ │ row (REQUESTED) ──────────────────────────  [Approve]           │  │
│ │                                     [reason...][Reject]          │  │
│ │ row (APPROVED)  ── [bankref....][Disburse]                       │  │
│ │                     [reason....][Cancel]                          │  │
│ │ row (REJECTED)  ──────────────────────────  ⬤ Rejected           │  │
│ │ row (DISBURSED) ──────────────────────────  ⬤ Disbursed          │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                    Page 1 of 4   [Previous] [Next]   │
└─────────────────────────────────────────────────────────────────────┘
```

Only two filters (`Associate`, `Status`), no Reset button — same reasoning Ledger Register's DESIGN.md already applied: `PayoutApprovalComponent`'s produced interface (`onAssociateIdChange`/`onStatusChange`/`goToPage`) exposes two closed-set filters and no reset method or date range, so a dedicated reset control would decorate a filter surface this screen doesn't have. Why no `SalesRegisterComponent`-style date-range pair: the approved plan's `PayoutApprovalService.list()` signature takes only `associateId`/`status`, no date params — there's nothing to filter by date.

## Signature element: the Action Stack

Every row's Actions cell renders the **same fixed scaffold** regardless of status: zero, one, or two vertically-stacked "action groups," each either a lone button or an inline `input + button` pair. The rule that keeps four different row shapes from feeling like four different designs:

- **The forward-moving action always sits in the top slot; the stopping action always sits in the bottom slot.** For a `REQUESTED` row, that's **Approve** (top, no input needed) over **Reject** (bottom, reason input + danger button). For an `APPROVED` row, that's **Disburse** (top, bank-reference input + button) over **Cancel** (bottom, reason input + danger button). The two rows have different controls, but the same *position* means the same *meaning* every time — an admin's eye learns "top keeps this moving, bottom ends it" once and it holds for every status that has two actions.
- **A hairline dashed rule separates the two groups** (`border-top: 1px dashed var(--border-subtle)` on the second group) — just enough to read as two distinct decisions living in the same cell, not a continuous form.
- **Terminal rows render neither slot** — just one small pill (`Rejected` / `Disbursed`), vertically top-aligned like every other Actions cell so it doesn't float oddly against a two-group neighbor. The column visibly *quiets down* as a request reaches its end: busy → busy → calm → calm reading down a realistic table (see State 1, which deliberately shows one row of each status together, the same combined-states technique Sales Register's own states 1&3 use). That quieting is a second, free expression of the state machine, on top of the Status column's own text — the same "let the layout carry information" idea Cycle Management's Cycle Rail and Ledger Register's raw-enum-text decisions each used in their own screens.
- **Color reuse across statuses is deliberate, not an oversight.** Approve and Disburse never appear on the same row (only one status is ever showing at a time per row) but both use `.brand-button` (gradient) because both are "keep this request moving forward" actions; Reject and Cancel both use `.brand-button--danger` because both are "stop this request" actions, even though `POST .../decision` is the literal same endpoint call under the hood for both (confirmed in the plan's Task 4 narrative — the backend tells REJECTED-from-REQUESTED and REJECTED-from-APPROVED apart purely from the row's prior status). The color encodes the *admin's intent*, consistently, independent of which lifecycle stage produced it.

This is the direct answer to the brief's "design this so the action area doesn't feel chaotic across different row states" — the chaos risk was real (four genuinely different control counts), and the fix is a single reusable scaffold with a fixed top/bottom semantic, not a bespoke layout per status.

## Component mapping (no new primitives)

| Screen need | Component used | Notes |
|---|---|---|
| Queue table + pagination shell | `EditableTableComponent` (`readOnly`) | Same usage shape as the three prior screens. Columns: Associate, Amount, Status, Reason, Bank Reference, Requested At, Actions. |
| REQUESTED row: Approve / Reject+reason | `EditableTableComponent`'s single `actionTemplate`, `*ngSwitchCase="'REQUESTED'"` | Approve calls `decide(id,'APPROVED')` with no input; Reject pairs a reason `<input>` with `decide(id,'REJECTED',reason)`, same per-row-keyed-map pattern (`decisionReasons`) `KycQueueComponent`/`SalesRegisterComponent` already use. |
| APPROVED row: Disburse+bankRef / Cancel+reason | Same `actionTemplate`, `*ngSwitchCase="'APPROVED'"` | Disburse pairs a bank-reference `<input>` with `disburse(id, bankReference)`; Cancel pairs a reason `<input>` with the identical `decide(id,'REJECTED',reason)` call Reject uses — same endpoint, different label, per the plan's Task 4 explanation. |
| REJECTED / DISBURSED row: static tag | Same `actionTemplate`, `*ngSwitchCase="'REJECTED'"` / `'DISBURSED'"` | No inputs or buttons — mirrors Sales Register's `VOIDED` else-branch, extended to two terminal statuses instead of one. |
| Load error / action error banners | `InlineBannerComponent` tone="danger" | Two independent banners, same placement Sales Register uses for its own load-error/void-error pair. |
| Submit Withdrawal / Submit Another | `BrandButtonComponent` (`primary`/`secondary`) | Structurally identical to Record Sale / Record Another. |
| Submit Withdrawal field errors | `FieldErrorComponent` | Same per-field pattern as Record Sale / `create-associate`. |
| Submit Withdrawal success | `InlineBannerComponent` tone="success" containing request details + a `BrandButtonComponent` (`secondary`) "Submit Another" | Structurally identical to Record Sale's success banner; extended with a small status chip (see below) since this unit's plan explicitly calls out that an admin needs to see an auto-approved outcome immediately. |

### Implementation constraint worth flagging (same one every prior screen in this system flags)

`EditableTableComponent`'s read-only data cells render `{{ row[column.key] }}` as plain text with no per-cell class hook, and its single `actionTemplate` input has no way to know which column invoked it — so, as with Sales Register/Cycle Management/Ledger Register, the **Status** column (plain text) is styled uniformly (mono, uppercase, muted) but cannot be colored per value. The functional REQUESTED/APPROVED/REJECTED/DISBURSED distinction lives entirely in the **Actions** column's Action Stack, which does have full template control — same idiom Sales Register used to put its RECORDED/VOIDED distinction in Actions rather than Status.

> **Superseded (design-parity plan, final review).** Only the `actionTemplate` half of this still holds. `EditableTableComponent` gained a `type: 'badge'` column (a `badgeTone` value→tone mapper rendering plain colored text via `--status-success`/`--status-warning`/`--status-danger`, no pill background), so the Status column *can* be — and now is — colored per value: `PayoutApprovalComponent` declares `status` as `type: 'badge'` with `statusBadgeTone`, and title-cases the wire enum through the shared `titleCase()` helper (`frontend/src/app/shared/utils/title-case.ts`) first. Same override Sales Register's and Ledger Register's DESIGN.md documents now record. The Actions column's Action Stack remains a second, independent expression of the same state, not the only one.

### A detail for the implementer: the auto-approved status chip

The approved plan's Task 5 (`SubmitWithdrawalComponent`) reads: *"the admin needs to see that distinction immediately rather than assume every submission lands in the queue as pending."* States 5–6 below mock up the concrete resolution: the success banner's Status row renders a small colored chip (`submit-withdrawal__status-chip--requested` = neutral/muted, `--approved` = brand-tinted) instead of plain text, plus one italic hint line when the status comes back `APPROVED` ("Auto-approved — under the manual review threshold..."). This hint line and its copy are **not** in the plan's Task 5 i18n block (which only specifies `successStatusLabel` + the raw status value) — flagging this here as a recommended one-string addition (`admin.submitWithdrawal.autoApprovedHint`) for whoever implements the styling task, the same spirit as Ledger Register's DESIGN.md flagging a one-line currency-formatting fix.

## Colors

| Use | Token |
|---|---|
| Page background | `--surface-page` |
| Card / table surface | `--surface-card` |
| Filter strip / toolbar surface | `--surface-raised` |
| Borders, table rules, group divider | `--border-subtle` |
| Headings, primary data | `--text-primary` |
| Labels, secondary data, hints | `--text-muted` |
| Eyebrow, primary CTA, Approve, Disburse, focus ring | `--brand-primary` / `--brand-gradient` / `--brand-primary-soft` |
| Reject, Cancel, load/action error banners | `--status-danger` |
| Submit Withdrawal success banner, Disbursed tag | `--status-success` |
| Rejected tag | `--status-danger` (16% tint, same recipe Sales Register's Voided tag uses) |

No new hex value or custom property appears anywhere in this design — every color resolves to the same `_tokens.scss` variables the three prior screens already mapped.

## Typography

Reuses the exact live stack (`_admin.scss`'s `.create-associate__*`/`.sales-register__*`/`.cycle-management__*`/`.ledger-register__*` rules):
- **Geist** — screen titles (1.75rem, matching the other three list screens' sizing).
- **Inter** — body copy, Associate cell values, Reason prose, form labels' input text.
- **JetBrains Mono** — eyebrow, field labels, Amount (`tabular-nums`, right-aligned — the same money treatment Sales Register/Ledger Register use), Status (uppercase, muted, per the Implementation constraint above), Bank Reference (treated as a code/reference value, same face `_admin.scss` reserves "for IDs, code snippets, precision"), Requested At (`tabular-nums`, muted), and every status pill/chip (Rejected/Disbursed tags, Requested/Approved success chips).

## Shape, elevation, spacing

Reused verbatim from the live `.sales-register`/`.cycle-management`/`.ledger-register` rules: 20px card radius, `0 4px 20px -2px rgba(0,0,0,0.08)` card shadow, 16px panel radius (filter strip), 8–12px control radius, 1.5rem row gaps, zero-padding/overflow-hidden table card. Submit Withdrawal's form card uses the same 20px/shadow treatment as Record Sale's, at a narrower 640px max-width (vs. Record Sale's 760px) since this form only ever has two fields — matching Record Sale's own precedent of sizing the form container to its actual field count rather than a fixed width.

## Screen states

Eight states across both components, documented in `code.html`:

1. **Queue, default/loaded** — one row per status (REQUESTED/APPROVED/REJECTED/DISBURSED), demonstrating the full Action Stack scaffold in a single realistic table.
2. **Queue, empty state** — a filter combination with no matches; `EditableTableComponent`'s single-line `emptyStateLabel` row (not a two-line title+hint like Sales Register's own bespoke empty state — this screen's approved plan passes a single translated string, so the design matches what the component actually renders, same reasoning Ledger Register's DESIGN.md gave for its own simpler empty state).
3. **Queue, error banners** — load error and action error stacked, same placement/tone as every prior screen.
4. **Submit Withdrawal, form default.**
5. **Submit Withdrawal, success — queued** (`REQUESTED`) — the ordinary case; a neutral status chip.
6. **Submit Withdrawal, success — auto-approved** (`APPROVED`) — a brand-tinted status chip plus the auto-approve hint line (see implementer note above).
7. **Submit Withdrawal, field validation errors** (400) — `FieldErrorComponent` under each invalid field, same pattern as Record Sale.
8. **Submit Withdrawal, 409 conflict** — the concrete resolution of the plan's "KYC-blocked" open question: no separate blocked-list screen was built (per the plan's Global Constraints, probing for blocked status would create real financial side effects); instead, the backend's own message (`"Associate KYC is not verified: ..."`) renders directly in an `inline-banner--danger`, in place, at the point of action — same treatment Sales Register's own 409 "plot no longer available" banner uses.

## Responsive behavior

Same breakpoints every prior screen in this system uses and names explicitly:
- **Below 768px — queue table**: rows collapse to one stacked card per row via the shared `data-label` technique (Sales Register/Ledger Register/Cycle Management's shipped `EditableTableComponent` addition). Associate is the card title (Geist, 1rem/600); Amount/Status/Reason/Bank Reference/Requested At render as `label: value` pairs. The Action Stack renders full-width beneath, unchanged in structure — its two groups and divider still stack vertically, they just span the row's full width instead of a fixed 240px column.
- **Below 768px — filter strip**: the two selects stack full width, one per row (no Reset button to reposition, unlike Sales Register).
- **Below 720px — Submit Withdrawal form**: the two-column `Associate`/`Amount` row collapses to one column, matching Record Sale's own `@media (max-width: 720px)` breakpoint.
- **Touch targets**: action-group buttons, pagination buttons, and Submit Withdrawal's submit button get explicit `min-height: 44px` below 768px, same as every prior screen.

## Out of scope (per the approved implementation plan's Global Constraints)

No KYC-blocked list view (surfaced as a 409 banner at the point of action instead — State 8). No bulk approve/hold (no backing endpoint exists). No fifth "hold" status or affordance (`WithdrawalRequestStatus` is a strict 4-value enum). No modal/dialog (none exists in this codebase; reason/bank-reference capture is inline in the Action Stack, per the plan's explicit constraint). No CSV export, no real payment-gateway integration (disburse stays a manually-entered bank reference, matching the backend's own scope).
