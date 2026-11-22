# Plot Payment Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Team / Left / Right plot-bookings screens, tick 2+ plots and see their totals and payment lists side by side as cards above the table.

**Architecture:** `BookingTableComponent` gets an opt-in `compare` input (tick column + selection `Set`). A new standalone `PlotCompareComponent` renders one card per selected row. The "what counts as a payment" rule moves from the table into one shared function so the popup and the cards cannot drift.

**Tech Stack:** Angular standalone components, `@ngx-translate`, Karma/Jasmine (`ng test`), SCSS (no view encapsulation).

**Spec:** `docs/superpowers/specs/2026-11-22-plot-payment-compare-design.md`

## Global Constraints

- No table may scroll sideways at 390 / 800 / 1280px (CLAUDE.md). No fixed `min-width` on tables or cells, no `overflow-x: auto` wrapper. Tables are plain `<thead>` + `<tbody>` so `table-fit.ts` can stack them. Money and IDs stay on one line.
- Compare is off by default. With `compare=false` the table must render exactly as today (17 header cells, 17 footer cells, `colspan="17"`).
- No backend or API change. Rows already carry `installments`.
- Every new string goes in both `frontend/src/assets/i18n/en.json` and `hi.json`.
- My Bookings and My Sales do not enable compare.
- Frontend tests run from `frontend/`: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/plot-bookings/**/*.spec.ts'`.

## Review Focus

- Only 1 plot ticked: no compare view, no empty cards.
- A ticked plot is hidden by the plot/associate filter: it stays ticked and stays compared.
- A ticked plot disappears from `rows` after a date-range reload: it drops out of the comparison, and the count shows only plots still present.
- A compared plot has zero payments: its card shows `plotBookings.payments.empty`, not a blank list.
- Rows without `installments` (My Sales shape): no tick box.

## File Structure

- Modify `frontend/src/app/plot-bookings/booking-view.util.ts`: add `paymentsOf`.
- Create `frontend/src/app/plot-bookings/plot-compare.component.ts`: the cards.
- Modify `frontend/src/app/plot-bookings/booking-table.component.ts`: `compare` input, tick column, selection, hosts the cards.
- Modify `frontend/src/app/plot-bookings/booking-table.component.scss`: card grid, tick column.
- Modify `frontend/src/app/plot-bookings/team-plot-bookings.component.ts`: pass `[compare]="true"`.
- Modify `frontend/src/assets/i18n/en.json`, `hi.json`: `plotBookings.compare.*`.
- Tests: `booking-view.util.spec.ts`, new `plot-compare.component.spec.ts`, `booking-table.component.spec.ts`, `team-plot-bookings.component.spec.ts`.

---

### Task 1: Shared `paymentsOf` rule

**Files:**
- Modify: `frontend/src/app/plot-bookings/booking-view.util.ts`
- Modify: `frontend/src/app/plot-bookings/booking-table.component.ts` (`payments(r)` method)
- Test: `frontend/src/app/plot-bookings/booking-view.util.spec.ts`

**Interfaces:**
- Produces: `paymentsOf(installments: EmiInstallment[] | undefined): EmiInstallment[]`. Keeps only status `ENTERED` or `PAID` with a non-null `paidAt`, sorted newest `paidAt` first. Does not mutate its input.

- [ ] **Step 1: Write the failing test** in `booking-view.util.spec.ts`, `describe('paymentsOf')`:
  - `keeps only ENTERED/PAID rows that have paidAt, newest first`: input installments 1 (PAID, paidAt `2026-10-02`), 2 (ENTERED, `2026-10-05`), 3 (PENDING, null), 4 (PAID, null); expect `installmentNumber`s `[2, 1]`.
  - `returns [] for undefined`.
  - `does not reorder the input array`: call on `[a(10-02), b(10-05)]`, expect the input still `[a, b]`.
- [ ] **Step 2: Run** the plot-bookings tests. Expected: FAIL, `paymentsOf` is not exported.
- [ ] **Step 3: Implement** `paymentsOf` in `booking-view.util.ts` by moving the filter+sort out of `BookingTableComponent.payments`. Copy the array before sorting. Make `payments(r)` return `paymentsOf(r.installments)`.
- [ ] **Step 4: Run** the plot-bookings tests. Expected: all PASS (existing popup tests still pass).
- [ ] **Step 5: Commit** `refactor(plot-bookings): share paymentsOf rule`.

---

### Task 2: `PlotCompareComponent`

**Files:**
- Create: `frontend/src/app/plot-bookings/plot-compare.component.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json`
- Modify: `frontend/src/app/plot-bookings/booking-table.component.scss`
- Test: create `frontend/src/app/plot-bookings/plot-compare.component.spec.ts`

**Interfaces:**
- Consumes: `paymentsOf` (Task 1); `BookingRow` from `booking-table.component.ts` via `import type` (the interface is erased, so no import cycle with Task 3).
- Produces: standalone component, selector `app-plot-compare`, `ViewEncapsulation.None`:
  - `@Input({ required: true }) rows: BookingRow[]`
  - `@Output() remove = new EventEmitter<string>()` (emits the row `key`)
  - `@Output() clear = new EventEmitter<void>()`
- i18n keys under `plotBookings.compare`: `title` ("Comparing {{count}} plots"), `clear` ("Clear all"), `remove` ("Remove {{plot}}"), `total`, `paid`, `rest` (reuse labels from `plotBookings.table.*` values), `payments` ("Payments").

Markup: a header (title + Clear button), then a `<div class="plot-compare__grid">` with one `<article class="plot-compare__card">` per row. Each card has: `<h3>` "{{projectName}} · {{plotNo}}" and a remove button (`aria-label` = `plotBookings.compare.remove`); a `<dl>` with total / paid / rest via `formatInr` (use the same `money` helper pattern as `BookingTableComponent`); then a payments `<table>` with `<thead>`/`<tbody>` and the same six columns and cell formats as the Details popup (payment date `confirmedAt` shown with `date: 'd MMM y, h:mm:ss a' : '+0530'`, amount, receipt no, mode via `'admin.projectsPlots.paymentMode.' + mode`, instrument no `paymentRef`, date `paidAt` `mediumDate`), every `<td>` with `data-label`. Empty list shows one row with `plotBookings.payments.empty`.

SCSS: `.plot-compare__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 1rem; }`. Cards use `var(--surface-card)` and `var(--border-subtle)`. Card payment table: `width: 100%`, no `min-width`, `white-space: normal` on `th`, `nowrap` on money/IDs cells. Under `.booking-page`, `app-plot-compare { display: block; order: 3; }`.

- [ ] **Step 1: Write the failing tests** in `plot-compare.component.spec.ts` (`TranslateModule.forRoot()`, set `rows` input):
  - `renders one card per row, headed by project and plot no`: 2 rows (`A-1`/`Green`, `B-2`/`Sun`), expect 2 `.plot-compare__card` and first heading text `Green · A-1`.
  - `lists each plot's payments newest first and ignores PENDING rows`: row with PAID (10-02, `receiptNo: 'R-1'`), ENTERED (10-05, `'R-2'`), PENDING; expect 2 body rows, first cell with `data-label="plotBookings.payments.receiptNo"` is `R-2` then `R-1`.
  - `shows the empty text for a plot with no payments`: card body contains `plotBookings.payments.empty`.
  - `emits remove with the row key and clear`: click the card's remove button, expect `remove` emitted `'b1'`; click Clear, expect `clear` emitted once.
- [ ] **Step 2: Run** the plot-bookings tests. Expected: FAIL, component does not exist.
- [ ] **Step 3: Implement** the component, i18n keys (English and Hindi, Hindi next to the existing `plotBookings.payments` block) and SCSS as above.
- [ ] **Step 4: Run** the plot-bookings tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(plot-bookings): add side-by-side plot compare cards`.

---

### Task 3: Compare mode on `BookingTableComponent`

**Files:**
- Modify: `frontend/src/app/plot-bookings/booking-table.component.ts`
- Modify: `frontend/src/app/plot-bookings/booking-table.component.scss`
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json` (key `plotBookings.compare.select`: "Compare {{plot}}" for the tick box `aria-label`, and `plotBookings.table.compare`: "Compare" for the column header)
- Test: `frontend/src/app/plot-bookings/booking-table.component.spec.ts`

**Interfaces:**
- Consumes: `PlotCompareComponent` (Task 2), its `remove` and `clear` outputs.
- Produces on `BookingTableComponent`:
  - `@Input() compare = false`
  - `compared = new Set<string>()` (row keys)
  - `get comparedRows(): BookingRow[]` = `this.rows.filter(r => compared.has(r.key))`, so a key no longer in `rows` drops out and ignores the filters
  - `toggleCompare(key: string): void`, `removeCompared(key: string): void`, `clearCompared(): void`
  - `get colCount(): number` = `17 + (compare ? 1 : 0)`, used for the empty-row `colspan`.

Template changes, all behind `*ngIf="compare"`: a first `<th scope="col" class="booking-table__tick">` ("Compare" label) in the header; a first `<td [attr.data-label]>` in each body row holding `<input type="checkbox">` only when `r.installments` exists (checked = `compared.has(r.key)`, `aria-label` = `plotBookings.compare.select` with the plot no); one extra empty `<td>` at the start of the `tfoot` row. Above the `.booking-table__scroll` div add `<app-plot-compare *ngIf="comparedRows.length >= 2" [rows]="comparedRows" (remove)="removeCompared($event)" (clear)="clearCompared()">`. The existing `row--selected` highlight is unrelated and stays.

- [ ] **Step 1: Write the failing tests** in `booking-table.component.spec.ts` (a helper builds rows with `installments: []` unless stated):
  - `compare off: no tick column` (default): `thead th` count is 17 and no `input[type=checkbox]` exists.
  - `compare on: ticks appear only on rows with installments`: 2 rows with `installments: []`, 1 without; expect 2 checkboxes, header count 18, footer cell count 18.
  - `no compare view with one plot ticked, cards appear at two, a third adds a card`: tick row 1 → no `app-plot-compare`; tick row 2 → 2 cards; tick row 3 → 3 cards.
  - `ticks survive a plot filter`: tick rows 1 and 2, set `plotFilter` to a value matching only row 3, `detectChanges`; compare view still shows 2 cards.
  - `a ticked plot that leaves rows drops out of the comparison`: tick 1 and 2, set `rows` to only row 2 and 3 → `comparedRows.length` is 1 and no compare view.
  - `removing from a card unticks it and clearing empties the selection`: call `removeCompared('b1')` → checkbox for `b1` unchecked; `clearCompared()` → `compared.size` 0.
  - `empty-state colspan follows the column count`: compare on, no rows → `td[colspan]` is `18`; compare off → `17`.
- [ ] **Step 2: Run** the plot-bookings tests. Expected: new tests FAIL.
- [ ] **Step 3: Implement** the input, state, methods, template changes and `colCount` as above. Import `PlotCompareComponent` in the component's `imports`. Add SCSS for `.booking-table__tick` (narrow, centred, `width: 1%`; no `min-width`).
- [ ] **Step 4: Run** the plot-bookings tests. Expected: all PASS, including the original 17-column tests.
- [ ] **Step 5: Commit** `feat(plot-bookings): opt-in compare mode on booking table`.

---

### Task 4: Enable on Team / Left / Right, and verify widths

**Files:**
- Modify: `frontend/src/app/plot-bookings/team-plot-bookings.component.ts` (template line with `<app-booking-table ...>`)
- Test: `frontend/src/app/plot-bookings/team-plot-bookings.component.spec.ts`

**Interfaces:**
- Consumes: `BookingTableComponent` `compare` input (Task 3).

- [ ] **Step 1: Write the failing test** `shows a compare tick box on rows that have installments`: same flush shape as the existing first test but with `installments: []`; expect one `input[type=checkbox]` in the table.
- [ ] **Step 2: Run** the plot-bookings tests. Expected: FAIL (no checkbox).
- [ ] **Step 3: Add `[compare]="true"`** to the `<app-booking-table>` in the team template.
- [ ] **Step 4: Run** the plot-bookings tests. Expected: all PASS.
- [ ] **Step 5: Width check** per CLAUDE.md (a real browser, with the dev backend or mocked data): on `/plot-bookings/team` tick 2, then 3 plots. At 390px, 800px and 1280px, for the compare grid, each card's payment table, the main table container and the page, confirm `scrollWidth <= clientWidth`. At 390px the cards must be one column.
- [ ] **Step 6: Commit** `feat(plot-bookings): enable plot compare on team/left/right`.
