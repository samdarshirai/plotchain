# Plot Payment Compare v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 per-plot cards with a summary table (plots as columns) plus one payment column per plot, for 2–4 compared plots, with a comparison that survives filter changes and a sticky "View comparison" bar.

**Architecture:** A pure `summarize()` in `booking-view.util.ts` computes the metrics. `BookingTableComponent` owns the selection as a `Map<string, BookingRow>` of snapshots (max 4) and the sticky bar. `PlotCompareComponent` is reworked to render the summary table, the payment columns and a type-to-filter add control.

**Tech Stack:** Angular standalone components, `@ngx-translate`, Karma/Jasmine, SCSS (no view encapsulation), native `IntersectionObserver`.

**Spec:** `docs/superpowers/specs/2026-11-22-plot-payment-compare-v2-design.md` (supersedes the layout in `2026-11-22-plot-payment-compare-design.md`; v1 code is already on master).

## Global Constraints

- CLAUDE.md: no table scrolls sideways at 390 / 800 / 1280px; no fixed `min-width` on tables or cells; no `overflow-x: auto` wrapper; plain `<thead>` + `<tbody>`; every `<td>` has `data-label`; money and IDs on one line; headers break between words only (use `overflow-wrap: normal` on compare headers, as v1 does).
- Max compared plots: `MAX_COMPARE = 4`. Panel shows from 2 plots.
- Compare stays opt-in via `[compare]`; with it off the table renders exactly as before (17 header cells, `colspan` 17).
- No backend or API change. Every new string in both `frontend/src/assets/i18n/en.json` and `hi.json`, under `plotBookings.compare` / `plotBookings.table`.
- Reuse `paymentsOf` and `isOverdueRow` from `booking-view.util.ts`; do not reimplement them.
- Tests: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/plot-bookings/**/*.spec.ts'`; full suite without `--include`.

## Review Focus

- Same plot number twice (cancel + rebook): the two columns must be distinguishable by buyer ID and booked date in heading and add-control label.
- Total of 0, or paid greater than total: paid % stays within 0–100, no NaN.
- Compared plot disappears from `rows` (filter or date change): it stays in the panel with its last data; no crash.
- Compared plot reappears in `rows`: its snapshot refreshes (e.g. a newly confirmed payment shows).
- At 4 plots: add control hidden, un-ticked boxes disabled, ticked boxes still untickable; clearing re-enables.
- Cancelled booking: Cancelled badge, refund shown, next due "—", payments still listed.

## File Structure

- Modify `frontend/src/app/plot-bookings/booking-view.util.ts`: add `summarize`, `PlotSummary`.
- Modify `frontend/src/app/plot-bookings/booking-table.component.ts` / `.scss`: row fields, snapshot selection, max 4, sticky bar.
- Rewrite `frontend/src/app/plot-bookings/plot-compare.component.ts`: summary table, payment columns, add control.
- Modify `frontend/src/assets/i18n/en.json`, `hi.json`.
- Tests: `booking-view.util.spec.ts`, `booking-table.component.spec.ts`, `plot-compare.component.spec.ts`.

---

### Task 1: `summarize` and extra row fields

**Files:**
- Modify: `frontend/src/app/plot-bookings/booking-view.util.ts`
- Modify: `frontend/src/app/plot-bookings/booking-table.component.ts` (`BookingRow`, `bookingRow`)
- Test: `booking-view.util.spec.ts`, `booking-table.component.spec.ts`

**Interfaces:**
- Produces:
  - `interface PlotSummary { paidPct: number; paymentCount: number; pendingCount: number; lastPaidAt: string | null; nextDue: { dueDate: string; amount: number } | null; overdueCount: number; overdueAmount: number }`
  - `summarize(row: { total: number; paid: number; installments?: EmiInstallment[] }): PlotSummary` — `paidPct` = rounded `paid/total*100` clamped 0–100 (0 when `total <= 0`); `paymentCount` = `paymentsOf(...).length`; `pendingCount` = those with status `ENTERED`; `lastPaidAt` = newest payment's `paidAt` or `null`; `nextDue` = earliest `dueDate` among `PENDING` installments (`{dueDate, amount}`) or `null`; `overdueCount` / `overdueAmount` = count / amount sum of installments where `isOverdueRow`.
  - `BookingRow` gains optional `status?: BookingStatus`, `refundAmount?: number | null`, `cancellationCharge?: number | null`; `bookingRow(b)` fills them from `b.status`, `b.refundAmount`, `b.cancellationCharge`.

- [ ] **Step 1: Write failing tests** in `booking-view.util.spec.ts`, `describe('summarize')`:
  - `computes paid percent, clamped, 0 when total is 0`: `{total:400,paid:100}` → 25; `{total:0,paid:0}` → 0; `{total:400,paid:500}` → 100.
  - `counts payments, pending ones and the newest paid date`: two PAID and one ENTERED rows with paidAt → `paymentCount` 3, `pendingCount` 1, `lastPaidAt` equals the newest `paidAt`.
  - `next due is the earliest PENDING installment`: PENDING with dueDates `2026-12-05` (amount 30000) and `2027-01-05` → `{dueDate:'2026-12-05', amount:30000}`; no PENDING → `null`.
  - `overdue count and amount come from isOverdueRow`: two PENDING with `overdue:true` (amounts 30000, 30000) and one PAID with `overdue:true` → `overdueCount` 2, `overdueAmount` 60000.
  - `handles missing installments`: `{total:100,paid:0}` → `paymentCount` 0, `nextDue` null, `lastPaidAt` null.
  In `booking-table.component.spec.ts`: `bookingRow maps status, refund and cancellation charge` — a `Booking` with `status:'CANCELLED', refundAmount:270000, cancellationCharge:30000` yields those on the row.
- [ ] **Step 2: Run** the plot-bookings tests. Expected: FAIL (not exported / missing fields).
- [ ] **Step 3: Implement** `summarize` and `PlotSummary` in `booking-view.util.ts` using `paymentsOf` and `isOverdueRow`; add the three optional fields and their mapping in `booking-table.component.ts`. Ruling recorded here: no `today` parameter (the spec allowed one) because the API already flags `overdue`.
- [ ] **Step 4: Run** the plot-bookings tests. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(plot-bookings): add summarize and cancellation fields on booking rows`.

---

### Task 2: Snapshot selection, max 4

**Files:**
- Modify: `frontend/src/app/plot-bookings/booking-table.component.ts`
- Test: `booking-table.component.spec.ts` (inside the existing `describe('compare mode')`)

**Interfaces:**
- Produces on `BookingTableComponent`:
  - `export const MAX_COMPARE = 4;`
  - `compared = new Map<string, BookingRow>()` (replaces the v1 `Set`)
  - `get comparedRows(): BookingRow[]` = map values in tick order
  - `get atMax(): boolean`
  - `toggleCompare(key: string): void` — removes if present; else adds a snapshot of the matching row from `rows` only when `compared.size < MAX_COMPARE` and the row exists
  - `removeCompared(key)`, `clearCompared()` unchanged in meaning
  - `ngOnChanges`: on `rows` change, for every key still present in `rows` replace its snapshot with the fresh row; keys not present are kept (replaces v1 pruning)
  - `availableRows`: rows with `installments` and not in `compared` (empty when `atMax`)
  - tick checkbox `[disabled]` when the row is not compared and `atMax`.

- [ ] **Step 1: Update and add tests** in `describe('compare mode')`:
  - Change `a ticked plot that leaves rows drops out of the comparison` to `a compared plot that leaves rows stays in the comparison`: tick b1, b2; set rows to `[b2, b3]`; `comparedRows.map(r => r.key)` equals `['b1','b2']` and 2 cards still render.
  - Change `a plot that left rows and returns later does not come back ticked` to `a compared plot that returns with new data gets a fresh snapshot`: tick b1, b2; set rows without b1; set rows with b1 whose `paid` is 999 → the snapshot for b1 has `paid` 999.
  - New `cannot compare more than 4 plots`: 5 rows with installments; tick 4 → `atMax` true, 5th checkbox `disabled`, ticked boxes not disabled; `toggleCompare` on the 5th does nothing; untick one → 5th enabled.
  - New `add dropdown is hidden at 4`: with 4 compared, no add control in the DOM.
  Keep `ticks survive a plot filter`, `removing from a card...` (assertions on `compared.size` still hold on a `Map`).
- [ ] **Step 2: Run** the plot-bookings tests. Expected: new/changed tests FAIL.
- [ ] **Step 3: Implement** as in Interfaces. The v1 `plot-compare` template still compiles against `rows`/`available`.
- [ ] **Step 4: Run** the plot-bookings tests. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(plot-bookings): keep compared plots across filters and cap at 4`.

---

### Task 3: Rework `PlotCompareComponent`

**Files:**
- Rewrite: `frontend/src/app/plot-bookings/plot-compare.component.ts`
- Modify: `frontend/src/app/plot-bookings/booking-table.component.scss` (replace v1 `.plot-compare__*` card rules), `frontend/src/app/plot-bookings/booking-table.component.ts` (pass `[atMax]`)
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json`
- Test: `plot-compare.component.spec.ts` (rewrite), `booking-table.component.spec.ts` (dropdown test)

**Interfaces:**
- Consumes: `summarize`, `paymentsOf`, `BookingRow` (Task 1), `MAX_COMPARE` semantics via the `atMax` input.
- Produces: `app-plot-compare` with `@Input({required:true}) rows: BookingRow[]`, `@Input() available: BookingRow[] = []`, `@Input() atMax = false`, `@Output() add: string` (row key), `@Output() remove: string`, `@Output() clear: void`; `plotLabel(r: BookingRow): string` returning `"A-2 · VSA53628 · 20 Nov"` (plotNo, associateCode, `bookedAt` as `d MMM`), used for column headings' `data-label` and for the add control options.

Markup:
- Header: title ("Comparing N plots"), add control, Clear all. Add control is `<input list=… class="plot-compare__add">` with a `<datalist>` whose option values are `plotLabel(a)`; on `change`, find the `available` row whose label equals the input value, emit its key and clear the input. Hidden when `available` is empty or `atMax`; when `atMax` show the note `plotBookings.compare.maxNote`.
- Summary `<table class="plot-compare__summary">`: `thead` with an empty first `th` and one `th` per plot containing a colour dot (`plot-compare__dot--1..4`), a ✕ remove button, "plotNo · projectName", buyer `associateCode`, booked date, status badge (`Active` / `Cancelled`, from `r.status`). `tbody` rows (first cell `class="plot-compare__k"` with the metric label; each plot cell has `data-label` = `plotLabel(r)`): Total price · Paid (amount, `paidPct`%, a `<span class="plot-compare__bar">` filled to `paidPct`%) · Rest due (cancelled with `refundAmount` → "Refund {{amount}}") · Payments (count, "N pending" badge when `pendingCount`) · Last paid (`lastPaidAt | date:'d MMM y'` or "—") · Next due (`nextDue` date + amount; "Overdue · N EMIs · amount" badge when `overdueCount`; "—" when cancelled).
- Payment columns: `<div class="plot-compare__cols">` grid (`repeat(auto-fit, minmax(min(100%, 16rem), 1fr))`), one `<section>` per plot with an `<h3>` heading (dot + `plotLabel`) and `.plot-compare__scroll` (`max-height: 60vh; overflow-y: auto`) holding a `<table>` with columns Date (`paidAt`, `d MMM y`), Amount, Mode, Receipt No, Status (`Pending` for `ENTERED`, `Confirmed` for `PAID`); empty list shows `plotBookings.payments.empty`; every `td` has `data-label`; `th { overflow-wrap: normal }`.
- New i18n keys: `plotBookings.compare.{maxNote, status.ACTIVE, status.CANCELLED, metric.total, metric.paid, metric.rest, metric.payments, metric.lastPaid, metric.nextDue, refund, pendingCount, overdue, paymentStatus.ENTERED, paymentStatus.PAID, date}` with matching Hindi.

- [ ] **Step 1: Rewrite `plot-compare.component.spec.ts`** (rows built with `installments`):
  - `renders a summary column and a payment column per plot`: 2 rows → 2 `thead th` plot headings (plus the empty one) and 2 `.plot-compare__cols section`.
  - `tells two bookings of the same plot apart`: two rows `plotNo 'A-2'`, different `associateCode` and `bookedAt` → the two heading texts differ and both contain their buyer ID.
  - `summary shows total, paid percent and pending count`: row `total 1000, paid 250` with one ENTERED payment → text contains `25%` and the pending badge key/count.
  - `shows overdue and next due`: PENDING installment (due `2026-12-05`, 30000) and two overdue PENDING → next due and overdue badge visible.
  - `cancelled booking shows badge, refund and no next due`: `status:'CANCELLED', refundAmount:270000` → text has the `Cancelled` key and the refund amount, next-due cell is `—`.
  - `payments list newest first with status badge and ignores PENDING`: as v1 plus `Pending` badge for ENTERED.
  - `empty plot shows the empty text`.
  - `emits remove with the key and clear`.
  - `add control lists available plots by label and emits the chosen key`: `available` with two rows; set the input to the first option's label and dispatch `change` → `add` emits that key; input cleared.
  - `add control is hidden when nothing is available or at max, with the note at max`.
  In `booking-table.component.spec.ts` update the v1 dropdown test to use the input + datalist (`input.plot-compare__add`), keeping the assertions: options exclude compared plots and rows without installments, adding adds a column and ticks the row, control disappears when none left.
- [ ] **Step 2: Run** the plot-bookings tests. Expected: FAIL.
- [ ] **Step 3: Implement** the component, SCSS and i18n as above; pass `[atMax]="atMax"` from the table. Remove the v1 card styles.
- [ ] **Step 4: Run** the plot-bookings tests, then the full suite. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(plot-bookings): summary table and per-plot payment columns for compare`.

---

### Task 4: Sticky "View comparison" bar

**Files:**
- Modify: `frontend/src/app/plot-bookings/booking-table.component.ts` / `.scss`
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json` (`plotBookings.compare.{stickyTitle, view}`)
- Test: `booking-table.component.spec.ts`

**Interfaces:**
- Produces on `BookingTableComponent`: `panelVisible = true`; `setPanelVisible(v: boolean): void`; `viewComparison(): void` (scrolls the panel host into view with `scrollIntoView({ behavior: 'smooth', block: 'start' })`). A `@ViewChild(PlotCompareComponent, { read: ElementRef })` setter (re)observes the host with an `IntersectionObserver` and calls `setPanelVisible`; disconnect in `ngOnDestroy`; if `IntersectionObserver` is undefined, leave `panelVisible` as `true` so the bar is simply never shown. Bar element `<div class="booking-compare-bar">` is the last flow child, `position: sticky; bottom: 0; flex: 1 1 100%; order: 9`, shown only when `comparedRows.length >= 2 && !panelVisible`, containing the title ("Comparing N plots"), a "View comparison ↑" button and a Clear all button.

- [ ] **Step 1: Write failing tests**:
  - `no sticky bar while the panel is visible`: tick 2 → `.booking-compare-bar` absent.
  - `sticky bar shows when the panel is out of view`: tick 2, `setPanelVisible(false)`, detect → bar present with the count; with fewer than 2 compared it stays absent.
  - `View comparison scrolls the panel into view`: spy on `scrollIntoView` of the `app-plot-compare` element, call the button → spy called once.
  - `Clear all in the bar empties the selection and removes the bar`.
- [ ] **Step 2: Run** the plot-bookings tests. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the plot-bookings tests, then the full suite. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(plot-bookings): sticky view-comparison bar for compare`.

---

### Task 5: Browser verification and fixes

**Files:** none planned; fixes go to the files above with a failing test first when they are logic, otherwise SCSS.

- [ ] **Step 1: Run the full suite.** Expected: all PASS.
- [ ] **Step 2: Start a throwaway test setup** per the `run` skill without touching the real dev DB or the IDE's backend on 8081: clone the dev DB (`create database plotchain_verify template plotchain`), give the test associate a known password and a downline whose bookings include a cancelled one, two bookings of the same plot, one booking with 9+ payments and one with 0, backend on `SERVER_PORT=8082`, `ng serve --port 4201 --proxy-config` pointing at 8082. Chrome cannot go below 500px, so use same-origin iframes of 390 / 800 / 1280px.
- [ ] **Step 3: Check** with 2, 3 and 4 plots at each width: page, panel, summary table and each `.plot-compare__scroll` have `scrollWidth <= clientWidth`; summary table stacks on phone; payment columns stack one per row on phone; no header breaks mid-word; the sticky bar appears after ticking a row far down the list and scrolls back up; at 4 plots the add control is hidden and extra ticks are disabled; comparison survives a date-range change.
- [ ] **Step 4: Fix** what the check finds (test first where logic), re-run Step 1.
- [ ] **Step 5: Clean up** (stop only the servers started here, drop `plotchain_verify`) and commit `fix(plot-bookings): compare v2 width fixes` if anything changed.
