# Plot-Booking Reference-Gap U6 — Bookings & EMI Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD: write the spec, watch it fail, implement, watch it pass. **Do NOT edit any tracking file** (`*-units.md`, `spec-cycle-status.md`); the coordinator does that.

**Goal:** Turn `/settings/bookings-emi` into six tabs (Register, Unconfirmed, Confirmed, Overdue, Cancelled, EMI by last date), upgrade the Register, and rework `booking-seal` for the two-step (enter, then confirm) payment flow.

**Architecture:** All new screens are standalone, lazy-by-parent components under `frontend/src/app/admin/admin-bookings-emi/`, each with a per-screen BEM prefix and a tiny `ViewEncapsulation.None` SCSS. They reuse the register's already-global `.booking-register__*` table/list/empty/skeleton/field classes (loaded by the parent's `bookings-emi.component.scss`), so no big stylesheet is grown. One new shared-in-folder component (`report-filters`) holds the date-range + project filter used by four tabs. Services/models/pager/export helpers already exist from U5.

**Tech Stack:** Angular 18 standalone, `@ngx-translate`, Karma/Jasmine (`HttpClientTestingModule`), RxJS.

**Spec:** parent plan `docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md` (section U6 + "Design rules"), `/DESIGN.md`, `docs/design/plot-booking-vs-reference-video.md`, U5 plan `docs/superpowers/plans/2026-10-12-plot-booking-ref-gap-unit-5-fe-foundations.md` (its Decision 3 hands the seal rework to this unit).

Working dir for every command: `/Users/ronalisenapati/Ronali/plotchain/frontend`. Targeted run: `npx ng test --watch=false --browsers=ChromeHeadless --include=<spec path relative to frontend/>`. Admin-only screens (`/settings/bookings-emi` is already ADMIN-guarded); no associate-visible data is added.

## Global Constraints

- Tokens only, **no hex literals** in any new/edited SCSS (existing `#fff` in untouched rules stays; do not copy it). `--status-danger` for errors; Oxblood primary buttons with Bright Gold text only via `.brand-button`; ghost/secondary via `.brand-button--secondary`.
- Fraunces only for the page title (already in parent) and the single hero figure per screen (seal-card figure on Unconfirmed; receipt amount). Amounts/dates/IDs in `var(--font-mono)` with `font-variant-numeric: tabular-nums`.
- **One seal card per screen:** only Unconfirmed uses `app-seal-card`. No shadows beyond the 1px border (the seal/receipt double-rule pattern is the only exception), no gradients, no new animation. Material Symbols Outlined only.
- Per-screen BEM prefix + component SCSS with `ViewEncapsulation.None`: `.payment-queue`, `.payment-ledger`, `.payment-receipt`, `.cancelled-bookings`, `.last-emi`. **Do not touch `frontend/src/styles/_admin.scss`** (at bundle budget).
- Component-style budget (`angular.json` anyComponentStyle: warn 2kB / error 4kB). `bookings-emi.component.scss` (3028 B) and `booking-seal.component.scss` (3402 B) already warn: **do not grow either by more than 40 bytes**; each new SCSS stays under 2000 B. `booking-register.component.scss` (2069 B) currently does not warn; it must not newly warn.
- Mobile (<768px): every table row stacks with `data-label` on each `<td>` (the shared `.booking-register__table` rules do this; always add `class="booking-register__table"` to new tables).
- No `window.confirm`/`alert`: confirmation is inline. Every write locks inputs, buttons, filters and pager while in flight (`busy`).
- i18n: every new key goes in BOTH `src/assets/i18n/en.json` and `hi.json` (hi mirrors the English string, as in existing practice for `admin.bookingsEmi.*`).
- No new npm dependency. "Excel" = CSV via U5 `exportCsv`. Latest-request-wins (`seq` counter) for every list load, like `booking-register`.
- Keep all existing specs green except the ones this plan names for rewrite.

## Review Focus

1. **Bulk confirm fails (409 for a stale/duplicate row, network drop):** nothing is confirmed (all-or-nothing); UI must show the server-named offender, drop stale selections, reload the list, never claim success. Pinned in Task 6.
2. **Selection survives a page/filter change:** a checked row from page 1 must never be confirmed after the admin moved to page 2 or changed filters (silent mass-confirm risk). Selection is cleared on any page/filter/reload. Pinned in Task 6.
3. **Confirm of the booking's last needed payment flips the booking to CONFIRMED (AUTO_THRESHOLD):** single confirm shows the auto-confirm flash; bulk confirm reports how many bookings auto-confirmed; entering a payment never claims to confirm. Pinned in Tasks 5 and 6.
4. **Date range with From after To, or one end empty:** inline error and no request for inverted range; one-sided range allowed. Pinned in Task 3.
5. **Large datasets for Export CSV (more than 100 rows) and empty exports:** export walks all pages (size 100), is disabled while running, and an empty result exports a header-only file without crashing. Pinned in Tasks 2, 7, 8, 10, 11.
6. **ENTERED payment on a CONFIRMED booking:** backend allows confirming it; the seal must still show Confirm for ENTERED rows when the booking is ACTIVE or CONFIRMED (not CANCELLED). Pinned in Task 5.

## Backend contract (verified from merged source; read-only here)

- `PATCH /api/admin/bookings/{id}/installments/{n}/pay` body `{amount, paymentRef, paymentMode (required), paidAt?}` -> ENTERED only; booking stays ACTIVE.
- `POST /api/admin/bookings/{id}/installments/{n}/confirm` (empty body) -> `Booking`. Allowed on ACTIVE **or CONFIRMED** bookings, never CANCELLED; ACTIVE bookings run the AUTO_THRESHOLD check afterwards (response may be `status: 'CONFIRMED'`). 409 text `"... has no entered payment to confirm"` = `InstallmentNotEnteredException`; 409 `"Booking ... not ACTIVE"` = `BookingNotActiveException` (also returned for CANCELLED); 409 + `code: 'PLOT_NOT_AVAILABLE'` = plot drift; 404 booking/installment missing.
- `POST /api/admin/payments/confirm` `{items:[{bookingId, installmentNumber}]}` (1..200, all-or-nothing, duplicates -> 400 `"Duplicate item in request: ..."`) -> `Booking[]` ordered by ascending bookingId (**not request order**).
- `GET /api/admin/payments?status=ENTERED|PAID&from&to&projectId&page&size` -> `PaymentPage {payments, page, size, totalElements, pageTotal, grandTotal}`; `PaymentRow` fields as in `bookings-emi.model.ts`.
- `GET /api/admin/emi-reports/last-emi?from&to&projectId` -> plain `LastEmiRow[]` (not paged).
- `GET /api/admin/bookings` accepts `status, projectId, q, bookedFrom, bookedTo, cancelledFrom, cancelledTo, page, size`. `Booking` carries `buyerPhone, listPrice, discount, areaSqft, rate, cancelledAt, associateCode`.
- `BookingsEmiService` methods already exist (U5): `list, pay, confirmPayment, confirmPayments, payments, lastEmi, confirm, cancel, transfer, overdue, config, get`.

## Decisions

1. **Tab ids / order:** `register, unconfirmed, confirmed, overdue, cancelled, lastEmi`; labels reuse existing keys `admin.bookingsEmi.tab.*` (already present). Overdue keeps its `(count)` suffix. No count badges on the new tabs (YAGNI).
2. **No new service methods** (U5 Decision 1 stands): Cancelled = `list({status:'CANCELLED', cancelledFrom, cancelledTo, projectId, ...})`.
3. **`report-filters` component** (date range + project select + Reset) shared by Unconfirmed/Confirmed/Cancelled/EMI-by-last-date. Emits `{from, to, projectId}` (empty strings = unset). It owns the From>To validation. Register keeps its own richer filter bar.
4. **Register/Overdue keep their hand-rolled pagers** (existing specs pin `.booking-register__prev/next`); the new screens use `app-pager`. Open question for the owner whether to migrate them later.
5. **Seal rework:** `Mode` gains `'confirmPayment'`. `Pay` button label becomes "Enter payment"; the pay form gets a required payment-mode `<select>`. ENTERED rows show a `Confirm` button (booking ACTIVE or CONFIRMED). The pre-submit auto-confirm warning moves from the pay form to the confirm-payment form (entering never confirms). `ok.autoConfirm` is **wired correctly** (single confirm of the payment that takes an ACTIVE booking to CONFIRMED), not removed. The old `err.plotDriftPay` copy is dead (entering cannot hit plot drift) and is deleted in favour of `err.plotDriftConfirmPay`.
6. **ENTERED chip:** `.booking-register__chip--entered` (border + text `--status-warning` / `--status-warning-text`) added to `booking-register.component.scss` (that sheet is loaded wherever the seal renders); the seal installment-status cell renders a chip for every status so layout is uniform. Seal SCSS gains only `select` in the existing `input, textarea` selector (+8 B).
7. **Selection scope in the queue:** per loaded page only. Check All = all rows of the current page. Any page/filter/reload clears the selection (Review Focus 2). Selection key = `` `${bookingId}#${installmentNumber}` ``.
8. **Total row:** `pageTotal` in a `<tfoot>` row; the seal card carries `grandTotal` (all pending for the active filters) with a caption stating that. Both come from the server.
9. **Export:** `collectPages` util (Task 2) walks pages of size 100. CSV filenames: `bookings.csv`, `cancelled-bookings.csv`, `payments-confirmed.csv`, `emi-last-date.csv`. Print on Register prints the visible table (`printTable(tableEl)`; current page only, stated in the button `title`).
10. **EMI by last date** is unpaged server-side, so no pager; totals in a tfoot are summed client-side from the loaded rows.

## Design (per screen; replaces a separate mockup)

Shared look: Parchment `.booking-register__list` card (surface-card, 20px radius, from parent SCSS), mono uppercase table headers, `border-top` cells, section eyebrow flanking-rule is already supplied by the parent title block. Filter bar = `.booking-register__filters` (raised surface, wrap, 170px fields, mono uppercase labels). Empty/skeleton/error use `.booking-register__empty / __skeleton` and `app-inline-banner tone="danger"` with a Retry button (`.booking-register__retry`), identical to Register/Overdue.

**Register (upgrade).** Layout unchanged (list + 380px seal). Filter bar adds: *Booked from*, *Booked to* (native `<input type="date">`), and a *Search* text box (label `filter.search`, placeholder `filter.searchPlaceholder` = "Associate ID or plot no", applied on `change`/Enter). Buttons row at the end of the bar: *Export CSV* (secondary), *Print* (secondary), Reset. Table columns: Buyer (+plot/project), **Mobile**, Associate, Status, **Area** (sqft), **Rate**, **Discount**, Total, Paid, Due. Mono right-aligned numerics; null phone/area/rate/discount render an em dash. Table scrolls horizontally inside the card (already `overflow-x:auto`). States: unchanged (skeleton, empty-no-match with Reset, error banner). Mobile: stacked rows with data-label, buttons wrap.

**Unconfirmed (`payment-queue`).** Top to bottom: report-filters; ONE seal card (label "PENDING CONFIRMATION", Fraunces figure = `grandTotal` in INR, caption "N payments awaiting confirmation"; shown once data has loaded); action bar (left: *Check all* / *Uncheck all* ghost buttons; right: mono "N selected · ₹X" and *Confirm selected* primary, disabled at 0); when *Confirm selected* is pressed, an inline confirm panel replaces the bar (bordered Parchment panel: "Confirm 3 payments totalling ₹X? This cannot be undone." with *Confirm 3 payments* primary and *Back* secondary); banner (success/danger, dismissible) above the table; table columns: [checkbox], Payment date, Associate ID, Name, Project, Plot no, Mode, Amount; `<tfoot>` Total row (page total) with a 2px gold top rule. Pager below. States: loading skeleton; empty ("Nothing waiting for confirmation"); error banner with Retry; writing: everything `disabled`, confirm button shows "Confirming…", `aria-busy`. Mobile: checkbox row stacks first with data-label "Select"; action bar wraps, buttons min-height 44px.

**Confirmed (`payment-ledger`).** report-filters; header strip with *Export CSV* (right); table: Payment date, Associate ID, Name, Project, Plot no, Amount, Mode, Entry by, Confirm by, Confirm date, Receipt (*Print receipt* icon-less text button); Total row; pager. Clicking *Print receipt* opens `app-payment-receipt` inline above the table (not a modal): a double-ruled sheet with "── PAYMENT RECEIPT ──", receipt no, date, associate, project/plot, mode, reference, entry/confirm by, and the amount as the single Fraunces hero figure; below the sheet *Print* (primary) and *Close* (secondary). Printing hides everything but the sheet (via `printTable`) and the sheet uses a CSS `double` border so the rule survives print (no background graphics needed). States: skeleton, empty ("No confirmed payments in this range"), error+Retry. Mobile: stacked table; receipt sheet is full width.

**Cancelled (`cancelled-bookings`).** report-filters (labels *Cancelled from / to*); *Export CSV*; table: Booked on, Associate ID, Name, Buyer (+plot/project), Mobile, Cancelled on, Discount, Total, Paid (no Due: it is always "—" for cancelled, and no PLC); pager. Read-only (no seal). States as above, empty copy "No cancelled bookings in this range".

**EMI by last date (`last-emi`).** report-filters (labels *Last EMI from / to* reuse `filter.from/to`); *Export CSV*; table: Booked on, Associate ID, Name, Buyer, Mobile, Plot, Project, Last EMI date, Discount, Total, Paid, Rest; tfoot sums Discount? No: sums Total, Paid, Rest only. No pager. States as above, empty "No bookings have their last EMI in this range".

**Seal (rework).** Instalment table status cell = chip (`PENDING` plain, `ENTERED` warning, `PAID` success, `VOID` muted) + `· date · mode`. Row action: PENDING + booking ACTIVE -> *Enter payment*; ENTERED + booking not CANCELLED -> *Confirm*. *Enter payment* form: read-only amount, **Payment mode** select (required; first option disabled placeholder), reference, received-on. *Confirm payment* form: bullet "Moves ₹X from Entered to Paid.", warning banner when it will auto-confirm the booking, submit *Confirm payment*.

## File map

Create (all under `src/app/admin/admin-bookings-emi/`):
- `report-filters.component.ts` + `.spec.ts`
- `payment-queue.component.ts` + `.scss` + `.spec.ts`
- `payment-receipt.component.ts` + `.scss` + `.spec.ts`
- `payment-ledger.component.ts` + `.scss` + `.spec.ts`
- `cancelled-bookings.component.ts` + `.scss` + `.spec.ts`
- `last-emi.component.ts` + `.scss` + `.spec.ts`

Modify:
- `bookings-emi.util.ts` + `bookings-emi.util.spec.ts` (`collectPages`, `classifyError` extension, `exportDate` not needed)
- `booking-seal.component.ts` + `.spec.ts` (+ `.scss` select selector only)
- `booking-register.component.ts` + `.spec.ts` + `.scss` (chip modifier only)
- `bookings-emi.component.ts` + `.spec.ts`
- `src/app/shared/components/pager/pager.component.ts` + `.spec.ts` (aria-label nit)
- `src/assets/i18n/en.json`, `src/assets/i18n/hi.json`

---

## Task 1: i18n keys + pager aria-label nit (U5 review fold-in)

**Files:** `src/assets/i18n/en.json`, `src/assets/i18n/hi.json`, `src/app/shared/components/pager/pager.component.ts`, `pager.component.spec.ts`.

**Interfaces — Produces:** the keys below (used by every later task). Add under `admin.bookingsEmi` unless noted. Edit existing values where marked "change".

| Key | English |
|---|---|
| `shared.pager.label` | `Pagination` |
| `admin.bookingsEmi.validation.range` | `From date must be on or before To date.` |
| `admin.bookingsEmi.validation.mode` | `Choose a payment mode.` |
| `admin.bookingsEmi.seal.pay` (change) | `Enter payment` |
| `admin.bookingsEmi.seal.confirmPayment` | `Confirm payment` |
| `admin.bookingsEmi.action.payBtn` (change) | `Enter {{amount}}` |
| `admin.bookingsEmi.action.recording` (change) | `Saving…` |
| `admin.bookingsEmi.action.confirmPaymentBtn` | `Confirm payment` |
| `admin.bookingsEmi.action.confirmingPayment` | `Confirming…` |
| `admin.bookingsEmi.action.confirmPayment` (change) | `Confirm` (unchanged value; used by the ENTERED row button) |
| `admin.bookingsEmi.action.receipt` | `Print receipt` |
| `admin.bookingsEmi.action.close` | `Close` |
| `admin.bookingsEmi.ok.pay` (change) | `Payment entered. Instalment {{n}} of {{buyer}}'s booking ({{amount}}) is waiting for confirmation.` |
| `admin.bookingsEmi.ok.confirmPay` | `Payment confirmed. Instalment {{n}} of {{buyer}}'s booking, {{amount}} received.` |
| `admin.bookingsEmi.ok.autoConfirm` (change) | `Booking auto-confirmed. Confirming instalment {{n}} took {{buyer}} to {{pct}}% paid. The plot is now Sold and the sale is in the Sales Register.` |
| `admin.bookingsEmi.ok.confirmedMany` | `{{count}} payments confirmed.` |
| `admin.bookingsEmi.ok.confirmedManyAuto` | `{{count}} payments confirmed. {{auto}} of the affected bookings are now confirmed.` |
| `admin.bookingsEmi.err.notEntered` | `Instalment {{n}} has no entered payment to confirm. Reload to see its current status.` |
| `admin.bookingsEmi.err.plotDriftConfirmPay` | `Payment not confirmed. The plot is no longer marked Booked, and confirming this payment would take the booking past the auto-confirm threshold. Nothing was saved.` |
| `admin.bookingsEmi.err.confirmNetwork` | `We couldn't confirm whether the payment was confirmed. Reload to check instalment {{n}} before you try again.` |
| `admin.bookingsEmi.err.confirmMany` | `Nothing was confirmed. The list has been refreshed; review it and try again.` |
| `admin.bookingsEmi.err.confirmManyNetwork` | `We couldn't confirm whether the payments were confirmed. The list has been refreshed; check it before you try again.` |
| `admin.bookingsEmi.err.loadList` | `This list didn't load. Check your connection and try again.` |
| `admin.bookingsEmi.err.export` | `The export failed. Check your connection and try again.` |
| `admin.bookingsEmi.confirmPayEffects.0` | `Moves {{amount}} from Entered to Paid.` |
| `admin.bookingsEmi.queue.sealCaption` | `{{count}} payments awaiting confirmation` |
| `admin.bookingsEmi.queue.selected` | `{{count}} selected · {{amount}}` |
| `admin.bookingsEmi.queue.prompt` | `Confirm {{count}} payments totalling {{amount}}? This cannot be undone.` |
| `admin.bookingsEmi.queue.yes` | `Confirm {{count}} payments` |
| `admin.bookingsEmi.queue.note` | `Pending total covers every page for the current filters.` |
| `admin.bookingsEmi.empty.queueTitle` | `Nothing waiting for confirmation` |
| `admin.bookingsEmi.empty.queueBody` | `Entered payments appear here until an admin confirms them.` |
| `admin.bookingsEmi.empty.ledgerTitle` | `No confirmed payments in this range` |
| `admin.bookingsEmi.empty.cancelledTitle` | `No cancelled bookings in this range` |
| `admin.bookingsEmi.empty.lastEmiTitle` | `No bookings have their last EMI in this range` |
| `admin.bookingsEmi.receipt.title` | `Payment receipt` |
| `admin.bookingsEmi.receipt.no` | `Receipt no` |
| `admin.bookingsEmi.receipt.date` | `Payment date` |
| `admin.bookingsEmi.receipt.received` | `Amount received` |
| `admin.bookingsEmi.receipt.print` | `Print` |

Also **delete** `admin.bookingsEmi.err.plotDriftPay` (en + hi) once Task 5 lands (do the deletion in Task 5 so no screen references a missing key meanwhile).

- [ ] **Step 1: Write the failing pager spec.** In `pager.component.spec.ts` add:

```ts
it('labels the nav with the short pager label, not the summary text', () => {
  const t = TestBed.inject(TranslateService);
  t.setTranslation('en', { shared: { pager: { label: 'Pagination', summary: 'S {{from}}' } } });
  t.use('en');
  set({ page: 0, size: 20, total: 45 });
  expect(el().querySelector('nav.pager')!.getAttribute('aria-label')).toBe('Pagination');
});
```
Add `TranslateService` to the `@ngx-translate/core` import.

- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/shared/components/pager/pager.component.spec.ts` -> expected FAIL (label is the summary text).
- [ ] **Step 3: Implement.** In `pager.component.ts` change the `<nav>` attribute to `[attr.aria-label]="'shared.pager.label' | translate"`. Add all keys in the table to **both** `en.json` and `hi.json` (hi = same English strings), applying the "change" rows.
- [ ] **Step 4: Verify key parity and JSON validity:**
  `node -e "const f=o=>Object.keys(o).flatMap(k=>typeof o[k]==='object'?f(o[k]).map(x=>k+'.'+x):[k]);const a=f(require('./src/assets/i18n/en.json')),b=new Set(f(require('./src/assets/i18n/hi.json')));const m=a.filter(k=>!b.has(k));console.log(m.length?m:'parity ok');process.exit(m.length?1:0)"` -> `parity ok`.
- [ ] **Step 5: Run** the pager spec again -> PASS; run `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/admin-bookings-emi/booking-seal.component.spec.ts` -> still PASS (specs use translation keys, not values).
- [ ] **Step 6: Commit** `feat(fe): U6 i18n keys and pager aria-label`.

---

## Task 2: Util — `collectPages` and `classifyError` extension

**Files:** `bookings-emi.util.ts`, `bookings-emi.util.spec.ts`.

**Interfaces — Produces:**
```ts
export function collectPages<T>(
  load: (page: number) => Observable<{ rows: T[]; totalElements: number }>, size?: number /* default 100 */
): Observable<T[]>;
export type ErrorKind = ... | 'notEntered';           // added
classifyError(err, op: 'pay' | 'confirm' | 'confirmPayment' | 'cancel' | 'transfer')
```

- [ ] **Step 1: Write failing specs** appended to `bookings-emi.util.spec.ts` (import `of` from `rxjs`, `collectPages`):

```ts
describe('collectPages', () => {
  it('walks every page of size 100 and concatenates rows in order', (done) => {
    const calls: number[] = [];
    const load = (p: number) => { calls.push(p); return of({ rows: [`r${p}`], totalElements: 250 }); };
    collectPages(load, 100).subscribe(rows => { expect(rows).toEqual(['r0', 'r1', 'r2']); expect(calls).toEqual([0, 1, 2]); done(); });
  });
  it('makes one call when everything fits on the first page', (done) => {
    let n = 0;
    collectPages(() => { n++; return of({ rows: ['a'], totalElements: 1 }); }, 100).subscribe(rows => { expect(rows).toEqual(['a']); expect(n).toBe(1); done(); });
  });
  it('returns an empty array for an empty result', (done) => {
    collectPages(() => of({ rows: [] as string[], totalElements: 0 }), 100).subscribe(rows => { expect(rows).toEqual([]); done(); });
  });
  it('propagates a failure on a later page', (done) => {
    collectPages(p => (p === 1 ? throwError(() => new Error('x')) : of({ rows: ['a'], totalElements: 150 })), 100)
      .subscribe({ error: e => { expect(e.message).toBe('x'); done(); } });
  });
});

describe('classifyError confirmPayment', () => {
  const e = (status: number, error?: string, code?: string) => ({ status, error: { error, code } });
  it('maps "no entered payment to confirm" 409 to notEntered', () => {
    expect(classifyError(e(409, 'Installment 2 of booking b has no entered payment to confirm'), 'confirmPayment').kind).toBe('notEntered');
  });
  it('maps plot drift, not ACTIVE, 404 and network like the other ops', () => {
    expect(classifyError(e(409, 'x', 'PLOT_NOT_AVAILABLE'), 'confirmPayment').kind).toBe('plotDrift');
    expect(classifyError(e(409, 'Booking b is not ACTIVE'), 'confirmPayment').kind).toBe('notActive');
    expect(classifyError(e(404, 'gone'), 'confirmPayment').kind).toBe('notFound');
    expect(classifyError({ status: 0 }, 'confirmPayment').kind).toBe('network');
  });
});
```
(`throwError` from `rxjs`; add imports.)

- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/admin-bookings-emi/bookings-emi.util.spec.ts` -> FAIL (compile: `collectPages` missing).
- [ ] **Step 3: Implement** in `bookings-emi.util.ts`:

```ts
import { EMPTY, Observable, expand, reduce } from 'rxjs';

export function collectPages<T>(
  load: (page: number) => Observable<{ rows: T[]; totalElements: number }>, size = 100
): Observable<T[]> {
  return load(0).pipe(
    expand((res, i) => ((i + 1) * size < res.totalElements ? load(i + 1) : EMPTY)),
    reduce((acc, res) => acc.concat(res.rows), [] as T[])
  );
}
```
`expand`/`reduce` import: `import { expand, reduce } from 'rxjs/operators'` if the installed rxjs version lacks root operator exports (check `grep '"rxjs"' package.json`; rxjs >= 7.2 exports them from `'rxjs'`). Add `'notEntered'` to `ErrorKind`; widen the `op` union to include `'confirmPayment'`; in the 409 branch, before the `'not ACTIVE'` check add `if (text?.includes('no entered payment')) { return done('notEntered'); }`.
- [ ] **Step 4: Run** the util spec -> PASS. Run `--include=src/app/admin/admin-bookings-emi/booking-seal.component.spec.ts` -> PASS (type widening only).
- [ ] **Step 5: Commit** `feat(fe): collectPages util and notEntered error kind`.

---

## Task 3: `report-filters` component (date range + project)

**Files:** create `report-filters.component.ts`, `report-filters.component.spec.ts`. No SCSS (uses global `.booking-register__filters/__field`).

**Interfaces — Produces:**
```ts
export interface ReportFilterValue { from: string; to: string; projectId: string; }
// selector app-report-filters
@Input() locked = false;
@Output() filtersChange = new EventEmitter<ReportFilterValue>();   // empty string = unset
```
Loads projects itself via `ProjectsService.listProjects()` (`../../setup/steps/projects/projects.service`); a load failure leaves only "All projects".

- [ ] **Step 1: Write failing spec** `report-filters.component.spec.ts`:

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ReportFiltersComponent, ReportFilterValue } from './report-filters.component';

describe('ReportFiltersComponent', () => {
  let fixture: ComponentFixture<ReportFiltersComponent>;
  let http: HttpTestingController;
  let emitted: ReportFilterValue[];
  const el = () => fixture.nativeElement as HTMLElement;
  const input = (name: string, v: string) => { const i = el().querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!; i.value = v; i.dispatchEvent(new Event('change')); fixture.detectChanges(); };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ReportFiltersComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(ReportFiltersComponent);
    http = TestBed.inject(HttpTestingController);
    emitted = [];
    fixture.componentInstance.filtersChange.subscribe(v => emitted.push(v));
    fixture.detectChanges();
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('lists projects and emits the full value when the project changes', () => {
    input('projectId', 'p1');
    expect(emitted.at(-1)).toEqual({ from: '', to: '', projectId: 'p1' });
  });
  it('emits a one-sided date range', () => {
    input('from', '2026-03-01');
    expect(emitted.at(-1)).toEqual({ from: '2026-03-01', to: '', projectId: '' });
  });
  it('shows the range error and emits nothing when From is after To', () => {
    input('from', '2026-03-10');
    emitted.length = 0;
    input('to', '2026-03-01');
    expect(emitted.length).toBe(0);
    expect(el().textContent).toContain('admin.bookingsEmi.validation.range');
  });
  it('clears the range error once the range is valid again', () => {
    input('from', '2026-03-10'); input('to', '2026-03-01'); input('to', '2026-03-12');
    expect(el().textContent).not.toContain('admin.bookingsEmi.validation.range');
    expect(emitted.at(-1)).toEqual({ from: '2026-03-10', to: '2026-03-12', projectId: '' });
  });
  it('Reset clears everything and emits the empty value', () => {
    input('projectId', 'p1');
    el().querySelector<HTMLButtonElement>('.report-filters__reset')!.click();
    expect(emitted.at(-1)).toEqual({ from: '', to: '', projectId: '' });
  });
  it('disables every control while locked', () => {
    fixture.componentRef.setInput('locked', true); fixture.detectChanges();
    el().querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button').forEach(c => expect(c.disabled).toBeTrue());
  });
  it('still renders when the project list fails to load', () => {
    const f2 = TestBed.createComponent(ReportFiltersComponent);
    f2.detectChanges();
    http.expectOne('/api/company/projects').flush('x', { status: 500, statusText: 'err' });
    f2.detectChanges();
    expect(f2.nativeElement.querySelector('[name="projectId"]')).not.toBeNull();
  });
});
```
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/admin-bookings-emi/report-filters.component.spec.ts` -> FAIL (missing file).
- [ ] **Step 3: Implement** `report-filters.component.ts`:

```ts
import { Component, EventEmitter, Input, OnInit, Output, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Project } from '../../setup/models/project.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';

export interface ReportFilterValue { from: string; to: string; projectId: string; }

@Component({
  selector: 'app-report-filters',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [CommonModule, TranslateModule, FieldErrorComponent],
  template: `
    <div class="booking-register__filters report-filters">
      <label class="booking-register__field">{{ fromKey | translate }}
        <input name="from" type="date" [disabled]="locked" [value]="v.from" [attr.max]="v.to || null" (change)="set({ from: $any($event.target).value })" /></label>
      <label class="booking-register__field">{{ toKey | translate }}
        <input name="to" type="date" [disabled]="locked" [value]="v.to" [attr.min]="v.from || null" (change)="set({ to: $any($event.target).value })" /></label>
      <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.project' | translate }}
        <select name="projectId" [disabled]="locked" (change)="set({ projectId: $any($event.target).value })">
          <option value="" [selected]="!v.projectId">{{ 'admin.bookingsEmi.filter.allProjects' | translate }}</option>
          <option *ngFor="let p of projects" [value]="p.id" [selected]="v.projectId === p.id">{{ p.name }}</option>
        </select></label>
      <button type="button" class="brand-button brand-button--secondary report-filters__reset" [disabled]="locked" (click)="reset()">{{ 'admin.bookingsEmi.filter.reset' | translate }}</button>
      <app-field-error [message]="rangeError ? ('admin.bookingsEmi.validation.range' | translate) : undefined"></app-field-error>
    </div>
  `
})
export class ReportFiltersComponent implements OnInit {
  private projectsService = inject(ProjectsService);
  @Input() locked = false;
  @Input() fromKey = 'admin.bookingsEmi.filter.from';
  @Input() toKey = 'admin.bookingsEmi.filter.to';
  @Output() filtersChange = new EventEmitter<ReportFilterValue>();
  v: ReportFilterValue = { from: '', to: '', projectId: '' };
  projects: Project[] = [];
  rangeError = false;

  ngOnInit(): void { this.projectsService.listProjects().subscribe({ next: p => (this.projects = p), error: () => undefined }); }
  set(part: Partial<ReportFilterValue>): void {
    this.v = { ...this.v, ...part };
    this.rangeError = !!this.v.from && !!this.v.to && this.v.from > this.v.to; // ISO dates compare lexically
    if (!this.rangeError) { this.filtersChange.emit(this.v); }
  }
  reset(): void { this.v = { from: '', to: '', projectId: '' }; this.rangeError = false; this.filtersChange.emit(this.v); }
}
```
Confirm `FieldErrorComponent` accepts `[message]` (it does in `booking-seal`); `listProjects()` URL is `/api/company/projects` (confirm with the existing register spec; adjust the spec URL if different).
- [ ] **Step 4: Run** the spec -> PASS.
- [ ] **Step 5: Commit** `feat(fe): report-filters component`.

---

## Task 4: Seal — payment-mode select on "Enter payment"

**Files:** `booking-seal.component.ts`, `booking-seal.component.spec.ts`, `booking-seal.component.scss` (selector only).

**Interfaces — Consumes:** `PAYMENT_MODES`, `PaymentMode` from `../../plot-bookings/models/associate-booking-page.model`; `PayRequest` (mode required). **Produces:** component field `paymentMode: PaymentMode | ''`.

- [ ] **Step 1: Update/add specs** in `booking-seal.component.spec.ts`:
  - Add helper beside `type`: `const pick = (name: string, v: string) => { const s = el().querySelector<HTMLSelectElement>(`[name="${name}"]`)!; s.value = v; s.dispatchEvent(new Event('change')); };`
  - Every existing pay-flow spec that does `type('paymentRef', 'R'); await fixture.whenStable(); submit();` (about 12: pay sends amount…, success emits…, success without status flip, 409 plot drift on pay, network error on pay, 409 not ACTIVE asks reload, second submit in flight, network error leaves no way to resubmit, 409 plot drift states NOT recorded, submit disabled while in flight, shows paise, paying the last instalment out of order, pay 409 not ACTIVE flash) must call `pick('paymentMode', 'CASH');` before `submit()`.
  - Change `pay sends amount from the instalment…`: `pick('paymentMode', 'UPI')` and `expect(req.request.body.paymentMode).toBe('UPI')` (was `'CASH'`).
  - New specs:

```ts
it('pay form lists the five payment modes behind a placeholder and starts unset', () => {
  setup();
  c().open('pay', c().booking!.installments[1]); fixture.detectChanges();
  const opts = Array.from(el().querySelectorAll<HTMLOptionElement>('select[name="paymentMode"] option')).map(o => o.value);
  expect(opts).toEqual(['', 'CASH', 'CHEQUE', 'UPI', 'BANK_TRANSFER', 'OTHER']);
  expect(el().querySelector<HTMLSelectElement>('select[name="paymentMode"]')!.value).toBe('');
});
it('pay requires a payment mode: error shown, aria-invalid set, nothing sent', async () => {
  setup();
  c().open('pay', c().booking!.installments[1]); fixture.detectChanges();
  type('paymentRef', 'R'); await fixture.whenStable(); submit(); fixture.detectChanges();
  expect(el().textContent).toContain('admin.bookingsEmi.validation.mode');
  expect(el().querySelector('select[name="paymentMode"]')!.getAttribute('aria-invalid')).toBe('true');
  http.expectNone(r => r.url.includes('/pay'));
});
it('the Pay row button reads "Enter payment"', () => {
  setup();
  expect(el().querySelector('.booking-seal__pay')!.textContent).toContain('admin.bookingsEmi.action.enterPayment');
});
```
  - **Delete** the three specs encoding pay-time auto-confirm: `warns before paying when the payment will auto-confirm`, `does not warn under MANUAL`, `the warning appears before submit with before/after amounts and states the rollback`. They are re-created against the confirm-payment form in Task 5.
  - Rewrite `auto-confirm warning and meter tick do not depend on emiEnabled` to keep only the meter-tick assertion (open pay form, close, expect `.booking-seal__meter-tick` non-null).
  - `409 plot drift on pay states the payment is NOT recorded…`: delete (entering cannot raise plot drift now); equivalent coverage returns in Task 5.
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/admin-bookings-emi/booking-seal.component.spec.ts` -> FAIL (no select, still sends CASH).
- [ ] **Step 3: Implement** in `booking-seal.component.ts`:
  - import `PAYMENT_MODES, PaymentMode` from the model file; add `readonly modes = PAYMENT_MODES; paymentMode: PaymentMode | '' = '';` and reset it to `''` in `open()`.
  - Row button label `'admin.bookingsEmi.action.enterPayment'` (also in `aria-label`).
  - In the pay fieldset, after the amount hint insert:
```html
<label>{{ 'admin.bookingsEmi.paymentMode.label' | translate }}
  <select name="paymentMode" [attr.aria-invalid]="modeInvalid ? 'true' : null" aria-describedby="seal-mode-error" (change)="paymentMode = $any($event.target).value">
    <option value="" disabled [selected]="!paymentMode">{{ 'admin.bookingsEmi.paymentMode.label' | translate }}</option>
    <option *ngFor="let m of modes" [value]="m" [selected]="paymentMode === m">{{ 'admin.bookingsEmi.paymentMode.' + m | translate }}</option>
  </select></label>
<app-field-error id="seal-mode-error" [message]="modeInvalid ? ('admin.bookingsEmi.validation.mode' | translate) : undefined"></app-field-error>
```
  - `get modeInvalid(): boolean { return this.tried && !this.paymentMode; }`
  - `submitPay()`: after the ref check add `if (!this.paymentMode) { return; }`; replace the `ponytail:` comment + `'CASH'` with `paymentMode: this.paymentMode`. Flash: always `ok.pay` (delete the `before.status === 'ACTIVE' && res.status === 'CONFIRMED'` autoConfirm branch from `submitPay` — it moves to Task 5). `run()` signature unchanged.
  - Remove the pay-form `predicts` warning banner block (`<app-inline-banner tone="warning" … *ngIf="predicts">` inside `mode === 'pay'`); keep the `predicts` getter for Task 5.
  - Remove the `plotDriftPay` case from the `ngSwitch` and make `bannerKey` return `'plotDriftConfirm'` for plotDrift in every mode for now (Task 5 refines).
  - SCSS: change `input, textarea { min-height: 44px; ...}` to `input, textarea, select { ... }`.
- [ ] **Step 4: Run** the seal spec -> PASS.
- [ ] **Step 5: Commit** `feat(fe): payment mode select on Enter payment`.

---

## Task 5: Seal — ENTERED rows get Confirm; auto-confirm wiring; ENTERED chip

**Files:** `booking-seal.component.ts`, `booking-seal.component.spec.ts`, `booking-register.component.scss` (one rule), `en.json`/`hi.json` (delete `err.plotDriftPay`).

**Interfaces — Consumes:** `BookingsEmiService.confirmPayment(id, n)`, `classifyError(..., 'confirmPayment')`, `willAutoConfirm`. **Produces:** `Mode` gains `'confirmPayment'`; `open('confirmPayment', installment)`; seal `data-opener="confirmPayment-<n>"`.

- [ ] **Step 1: Write failing specs** in `booking-seal.component.spec.ts`:

```ts
const entered = (n: number) => inst(n, { status: 'ENTERED', paidAt: '2026-03-02T00:00:00Z', paymentMode: 'UPI' });
const withEntered = (over: Record<string, unknown> = {}) =>
  bk({ paidAmount: 250, installments: [inst(1, { status: 'PAID', paidAt: '2026-02-05T00:00:00Z' }), entered(2), inst(3), inst(4, { status: 'VOID' })], ...over });

it('ENTERED rows get a Confirm button on an ACTIVE booking', () => {
  setup(withEntered());
  expect(el().querySelectorAll('.booking-seal__confirm-pay').length).toBe(1);
});
it('ENTERED rows still get Confirm on a CONFIRMED booking', () => {
  setup(withEntered({ status: 'CONFIRMED' }));
  expect(el().querySelectorAll('.booking-seal__confirm-pay').length).toBe(1);
});
it('no Confirm button on a CANCELLED booking', () => {
  setup(withEntered({ status: 'CANCELLED', dueAmount: 0 }));
  expect(el().querySelectorAll('.booking-seal__confirm-pay').length).toBe(0);
});
```

```ts
it('shows the ENTERED status as a warning chip with its mode and date', () => {
  setup(withEntered());
  const chip = el().querySelector('.booking-register__chip--entered')!;
  expect(chip.textContent).toContain('admin.bookingsEmi.installment.ENTERED');
  expect(el().textContent).toContain('admin.bookingsEmi.paymentMode.UPI');
});
it('confirm-payment form states the effect and posts to the single-confirm endpoint', () => {
  setup(withEntered(), { ...auto, confirmThresholdPercent: 90 });
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  expect(el().textContent).toContain('admin.bookingsEmi.confirmPayEffects.0');
  submit();
  const req = http.expectOne('/api/admin/bookings/b1/installments/2/confirm');
  expect(req.request.method).toBe('POST');
  req.flush(withEntered({ paidAmount: 500, installments: [inst(1, { status: 'PAID' }), inst(2, { status: 'PAID', confirmedAt: '2026-03-03T00:00:00Z' }), inst(3), inst(4, { status: 'VOID' })] }));
});
it('warns before confirming when this payment will auto-confirm the booking', () => {
  setup(withEntered(), { ...auto, confirmThresholdPercent: 50 }); // 250 paid + 250 = 50%
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  expect(el().textContent).toContain('admin.bookingsEmi.warn.autoConfirm');
  expect(el().textContent).toContain('admin.bookingsEmi.warn.autoConfirmDetail');
});
it('does not warn under MANUAL or when the threshold is not reached', () => {
  setup(withEntered(), { ...auto, confirmRule: 'MANUAL' });
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  expect(el().textContent).not.toContain('admin.bookingsEmi.warn.autoConfirm');
});
it('does not warn on a CONFIRMED booking (no second auto-confirm)', () => {
  setup(withEntered({ status: 'CONFIRMED' }), { ...auto, confirmThresholdPercent: 50 });
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  expect(el().textContent).not.toContain('admin.bookingsEmi.warn.autoConfirm');
});
it('emits the auto-confirm flash when confirming flips ACTIVE to CONFIRMED', () => {
  setup(withEntered(), { ...auto, confirmThresholdPercent: 50 });
  const flashes: { key: string; params?: any }[] = []; c().flash.subscribe(f => flashes.push(f));
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  submit();
  http.expectOne('/api/admin/bookings/b1/installments/2/confirm').flush(withEntered({ status: 'CONFIRMED', paidAmount: 500 }));
  expect(flashes[0].key).toBe('admin.bookingsEmi.ok.autoConfirm');
  expect(flashes[0].params.n).toBe(2);
});
it('emits the plain confirm-payment flash when the status does not flip', () => {
  setup(withEntered(), { ...auto, confirmThresholdPercent: 90 });
  const flashes: { key: string }[] = []; c().flash.subscribe(f => flashes.push(f));
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  submit();
  http.expectOne('/api/admin/bookings/b1/installments/2/confirm').flush(withEntered({ paidAmount: 500 }));
  expect(flashes[0].key).toBe('admin.bookingsEmi.ok.confirmPay');
});
it('409 "no entered payment" shows notEntered and asks the register to reload', () => {
  setup(withEntered());
  let reloads = 0; c().reloadRequested.subscribe(() => reloads++);
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  submit();
  http.expectOne('/api/admin/bookings/b1/installments/2/confirm').flush({ error: 'Installment 2 of booking b1 has no entered payment to confirm' }, { status: 409, statusText: 'Conflict' });
  fixture.detectChanges();
  expect(el().textContent).toContain('admin.bookingsEmi.err.notEntered');
  expect(reloads).toBe(1);
});
it('409 plot drift on confirm-payment says NOT confirmed and links to the fix pages', () => {
  setup(withEntered());
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  submit();
  http.expectOne('/api/admin/bookings/b1/installments/2/confirm').flush({ error: 'Plot is not available for booking: x', code: 'PLOT_NOT_AVAILABLE' }, { status: 409, statusText: 'Conflict' });
  fixture.detectChanges();
  expect(el().textContent).toContain('admin.bookingsEmi.err.plotDriftConfirmPay');
  expect(el().querySelector('a[href="/settings/projects-plots"]')).not.toBeNull();
  expect(el().querySelector('a[href="/settings/payments-kyc"]')).not.toBeNull();
});
it('network error on confirm-payment hides submit until the booking refreshes', () => {
  setup(withEntered());
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  submit();
  http.expectOne('/api/admin/bookings/b1/installments/2/confirm').error(new ProgressEvent('error'));
  fixture.detectChanges();
  expect(el().textContent).toContain('admin.bookingsEmi.err.confirmNetwork');
  expect(el().querySelector('.booking-seal__submit')).toBeNull();
});
it('closes the confirm-payment form when the booking becomes CANCELLED or the instalment is no longer ENTERED', () => {
  setup(withEntered());
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  fixture.componentRef.setInput('booking', withEntered({ installments: [inst(1, { status: 'PAID' }), inst(2, { status: 'PAID' }), inst(3), inst(4, { status: 'VOID' })] }));
  fixture.detectChanges();
  expect(c().mode).toBe('detail');
});
it('a CONFIRMED booking keeps the confirm-payment form open when refreshed', () => {
  setup(withEntered({ status: 'CONFIRMED' }));
  c().open('confirmPayment', c().booking!.installments[1]); fixture.detectChanges();
  fixture.componentRef.setInput('booking', withEntered({ status: 'CONFIRMED' }));
  fixture.detectChanges();
  expect(c().mode).toBe('confirmPayment');
});
```
Also update the existing spec `renders an ENTERED instalment with its status label and no Pay button`: it now has one Pay button (inst 3) — keep its assertions, add `expect(el().querySelectorAll('.booking-seal__confirm-pay').length).toBe(1)`.
- [ ] **Step 2: Run** the seal spec -> FAIL (no confirmPayment mode).
- [ ] **Step 3: Implement** in `booking-seal.component.ts`:
  - `type Mode = 'detail' | 'pay' | 'confirmPayment' | 'confirm' | 'cancel' | 'transfer';`
  - `open()` accepts `'confirmPayment'`; opener string: `mode === 'pay' || mode === 'confirmPayment' ? `${mode}-${i!.installmentNumber}` : mode`. Title: `'admin.bookingsEmi.seal.' + (mode === 'detail' ? 'detail' : mode)` already works with the new `seal.confirmPayment` key.
  - Installment status cell (replace the plain-text cell):
```html
<td><span class="booking-register__chip booking-register__chip--{{ i.status | lowercase }}">{{ 'admin.bookingsEmi.installment.' + i.status | translate }}</span>
  <ng-container *ngIf="(i.status === 'ENTERED' || i.status === 'PAID') && i.paidAt"> · {{ i.paidAt | date: 'mediumDate' }}</ng-container>
  <ng-container *ngIf="i.paymentMode"> · {{ 'admin.bookingsEmi.paymentMode.' + i.paymentMode | translate }}</ng-container></td>
```
  - Action cell: keep the Enter-payment button; add
```html
<button type="button" class="brand-button booking-seal__confirm-pay" *ngIf="b.status !== 'CANCELLED' && i.status === 'ENTERED'" [disabled]="busy"
  [attr.aria-label]="('admin.bookingsEmi.action.confirmPayment' | translate) + ' ' + i.installmentNumber"
  [attr.data-opener]="'confirmPayment-' + i.installmentNumber" (click)="open('confirmPayment', i)">{{ 'admin.bookingsEmi.action.confirmPayment' | translate }}</button>
```
  - New form block (sibling of the `mode === 'pay'` block):
```html
<ng-container *ngIf="mode === 'confirmPayment' && payTarget">
  <app-inline-banner tone="warning" role="status" *ngIf="predicts">
    <strong>{{ 'admin.bookingsEmi.warn.autoConfirm' | translate }}</strong>
    {{ 'admin.bookingsEmi.warn.autoConfirmDetail' | translate: { before: money(b.paidAmount), after: money(b.paidAmount + payTarget.amount) } }}
  </app-inline-banner>
  <ul class="booking-seal__effects"><li>{{ 'admin.bookingsEmi.confirmPayEffects.0' | translate: { amount: money(payTarget.amount) } }}</li></ul>
</ng-container>
```
  - `predicts`: `!!(this.booking && this.payTarget && this.mode === 'confirmPayment' && willAutoConfirm(...))` (`willAutoConfirm` already returns false unless the booking is ACTIVE).
  - `bannerKey`: `network` -> `pay: 'payNetwork'`, `confirmPayment: 'confirmNetwork'`, else `'generic'`; `plotDrift` -> `confirmPayment ? 'plotDriftConfirmPay' : 'plotDriftConfirm'`. `ngSwitch` cases: add `'confirmNetwork'` (with the Reload button, `n: payTarget?.installmentNumber`), `'plotDriftConfirmPay'`, `'notEntered'` (`n` param). The plot-drift link block: `(mode === 'confirmPayment' ? plotDriftFix : plotDriftFixConfirm)` and the settings link for `mode === 'confirmPayment'` (was `'pay'`).
  - `submitLabel`: add `confirmPayment: ['confirmPaymentBtn', 'confirmingPayment']` to the label map.
  - `onSubmit`: `else if (this.mode === 'confirmPayment') { this.submitConfirmPayment(); }`.
  - `run()`: widen `op` union with `'confirmPayment'`; `if (this.error.kind === 'network' && (op === 'pay' || op === 'confirmPayment')) { this.netUnknown = true; }`; reload-trigger kinds add `'notEntered'`.
  - `open()`: `this.error = this.netUnknown && (mode === 'pay' || mode === 'confirmPayment') ? { kind: 'network' } : null`.
  - `submitConfirmPayment()`:
```ts
submitConfirmPayment(): void {
  if (this.busy || this.netUnknown || !this.booking || !this.payTarget) { return; }
  const target = this.payTarget;
  this.run('confirmPayment', this.service.confirmPayment(this.booking.id, target.installmentNumber), (res, before) =>
    before.status === 'ACTIVE' && res.status === 'CONFIRMED'
      ? { key: 'admin.bookingsEmi.ok.autoConfirm', params: { n: target.installmentNumber, buyer: res.buyerName, pct: this.pct(res.paidAmount, res.totalAmount) } }
      : { key: 'admin.bookingsEmi.ok.confirmPay', params: { n: target.installmentNumber, buyer: res.buyerName, amount: this.money(target.amount) } });
}
```
  - `ngOnChanges` (same booking refreshed): compute
```ts
const fresh = (this.mode === 'pay' || this.mode === 'confirmPayment') ? this.booking?.installments.find(i => i.installmentNumber === this.payTarget?.installmentNumber) : null;
const needStatus = this.mode === 'pay' ? 'PENDING' : 'ENTERED';
const gone = this.mode === 'confirmPayment' ? this.booking?.status === 'CANCELLED' : this.booking?.status !== 'ACTIVE';
if (gone || ((this.mode === 'pay' || this.mode === 'confirmPayment') && fresh?.status !== needStatus)) { ...existing close + flash block... }
else if (fresh) { this.payTarget = fresh; }
```
    and extend the flash condition kinds to include `'notEntered'`.
  - `pendingCount` unchanged. Remove the now-dead `ok.autoConfirm` usage from `submitPay` (done in Task 4).
  - `booking-register.component.scss`: add inside the `&__chip` block `&--entered { border-color: var(--status-warning); color: var(--status-warning-text); }` and `&--paid { border-color: var(--status-success); color: var(--status-success-text); }` and `&--void, &--pending {}`? **No**: only these two rules; `pending`/`void` use the base chip. Check `--status-warning-text` / `--status-success-text` exist (they are already used in this file).
  - Delete `admin.bookingsEmi.err.plotDriftPay` from `en.json` and `hi.json`; `grep -rn plotDriftPay src` must return nothing.
- [ ] **Step 4: Run** the seal spec -> PASS; `--include=src/app/admin/admin-bookings-emi/booking-register.component.spec.ts` -> PASS.
- [ ] **Step 5: Budget check:** `wc -c src/app/admin/admin-bookings-emi/booking-seal.component.scss src/app/admin/admin-bookings-emi/booking-register.component.scss` (seal <= 3410 B). Run `npx ng build 2>&1 | grep -i "booking-register.component.scss\|booking-seal"`; the register SCSS must not appear as a new warning. If it does, shorten existing declarations in that file (for example drop the unused `&--cancelled` duplicate color or compress whitespace) until it is under budget again.
- [ ] **Step 6: Commit** `feat(fe): confirm ENTERED instalments from the booking seal`.

---

## Task 6: `payment-queue` (Unconfirmed tab)

Split in two commits: 6A load/render, 6B selection and confirm.

**Files:** create `payment-queue.component.ts`, `payment-queue.component.scss`, `payment-queue.component.spec.ts`.

**Interfaces — Consumes:** `BookingsEmiService.payments('ENTERED', f, page, size)`, `.confirmPayments(items)`; `PaymentPage`, `PaymentRow`, `PaymentRef`, `PaymentFilters`; `ReportFiltersComponent`; `SealCardComponent` (`label`, `value`, `caption`); `PagerComponent`; `InlineBannerComponent`; `formatMoney`, `classifyError`. **Produces:** selector `app-payment-queue`; `@Output() changed` (emits after a successful confirm).

### 6A — load, render, filters, pager

- [ ] **Step 1: Write failing spec** (`payment-queue.component.spec.ts`) with this fixture and the 6A specs:

```ts
const row = (b: string, n: number, amount = 250, over: Record<string, unknown> = {}) => ({
  bookingId: b, installmentNumber: n, paymentDate: '2026-03-02T00:00:00Z', associateCode: 'VA-1', associateName: 'Jane', projectName: 'Alpha',
  plotNo: 'A-1', amount, paymentMode: 'UPI', paymentRef: 'R', entryBy: 'staff', confirmBy: null, confirmedAt: null, ...over });
const pageOf = (rows: any[], over: Record<string, unknown> = {}) => ({ payments: rows, page: 0, size: 20, totalElements: rows.length, pageTotal: rows.reduce((s, r) => s + r.amount, 0), grandTotal: 9999, ...over });
const flushProjects = () => http.expectOne('/api/company/projects').flush([]);
const listReq = () => http.expectOne(r => r.url === '/api/admin/payments');
```
  Specs (names exact):
  - `loads ENTERED payments page 0 size 20 on init`: `listReq()` params `status=ENTERED`, `page=0`, `size=20`, no from/to/projectId.
  - `shows ONE seal card whose figure is the server grandTotal in INR` (`app-seal-card` count 1, text contains `₹9,999`) `and the pending count caption`.
  - `renders a row per payment with data-labels on every cell` (each `tbody td` has `data-label`).
  - `renders the Total row from pageTotal` (`tfoot` text contains `₹500` for two 250 rows).
  - `shows a skeleton until the first response`.
  - `shows the empty state when there are no payments` (`admin.bookingsEmi.empty.queueTitle`, no seal-card figure of stale data: seal card still shown with ₹0? **decision:** hide the seal card when `totalElements === 0`).
  - `shows an error banner with Retry when the load fails, and Retry reloads`.
  - `a filter change reloads page 0 with from, to and projectId` (call `fixture.debugElement.query(By.directive(ReportFiltersComponent)).componentInstance.filtersChange.emit({from:'2026-03-01',to:'2026-03-31',projectId:'p1'})`).
  - `paging requests the chosen page` (pager `pageChange.emit(1)`).
  - `ignores a stale response that arrives after a newer one`.
  - `has no hex colours and no window.confirm` is **not** a spec; verified in Task 11.
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/admin-bookings-emi/payment-queue.component.spec.ts` -> FAIL.
- [ ] **Step 3: Implement** `payment-queue.component.ts` (6A part; 6B adds the selection/confirm members):

```ts
import { Component, EventEmitter, OnInit, Output, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PagerComponent } from '../../shared/components/pager/pager.component';
import { SealCardComponent } from '../../shared/components/seal-card/seal-card.component';
import { FlashMessage, PaymentFilters, PaymentPage, PaymentRow } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { classifyError, formatMoney } from './bookings-emi.util';
import { ReportFiltersComponent, ReportFilterValue } from './report-filters.component';

const PAGE_SIZE = 20;
export const rowKey = (r: { bookingId: string; installmentNumber: number }): string => `${r.bookingId}#${r.installmentNumber}`;

@Component({
  selector: 'app-payment-queue',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./payment-queue.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, PagerComponent, SealCardComponent, ReportFiltersComponent],
  template: `
    <div class="payment-queue" [attr.aria-busy]="loading || busy">
      <app-report-filters [locked]="busy" (filtersChange)="onFilters($event)"></app-report-filters>

      <app-seal-card *ngIf="page && page.totalElements > 0" [label]="'admin.bookingsEmi.pendingTotal' | translate"
        [value]="money(page.grandTotal)" [caption]="'admin.bookingsEmi.queue.sealCaption' | translate: { count: page.totalElements }"></app-seal-card>

      <app-inline-banner *ngIf="banner" [tone]="banner.tone" [dismissible]="true" (dismissed)="banner = null">
        <span [attr.role]="banner.tone === 'danger' ? 'alert' : 'status'">{{ banner.msg.key | translate: banner.msg.params }}</span>
        <div class="payment-queue__server" *ngIf="banner.serverText">{{ 'admin.bookingsEmi.err.serverSaid' | translate: { text: banner.serverText } }}</div>
      </app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.loadList' | translate }}
        <button type="button" class="booking-register__retry" [disabled]="busy" (click)="reload()">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="payment-queue__bar" *ngIf="page?.payments?.length && !asking">
        <span class="payment-queue__bulk">
          <button type="button" class="brand-button brand-button--secondary payment-queue__check-all" [disabled]="busy" (click)="checkAll()">{{ 'admin.bookingsEmi.action.checkAll' | translate }}</button>
          <button type="button" class="brand-button brand-button--secondary payment-queue__uncheck-all" [disabled]="busy || !selected.size" (click)="uncheckAll()">{{ 'admin.bookingsEmi.action.uncheckAll' | translate }}</button>
        </span>
        <span class="payment-queue__selected" role="status">{{ 'admin.bookingsEmi.queue.selected' | translate: { count: selected.size, amount: money(selectedTotal) } }}</span>
        <button type="button" class="brand-button payment-queue__confirm" [disabled]="busy || !selected.size" (click)="ask()">{{ 'admin.bookingsEmi.action.confirmSelected' | translate }}</button>
      </div>
      <div class="payment-queue__prompt" role="alertdialog" aria-labelledby="payment-queue-prompt" *ngIf="asking">
        <span id="payment-queue-prompt">{{ 'admin.bookingsEmi.queue.prompt' | translate: { count: selected.size, amount: money(selectedTotal) } }}</span>
        <button type="button" class="brand-button payment-queue__yes" [disabled]="busy" [attr.aria-busy]="busy" (click)="doConfirm()">
          {{ (busy ? 'admin.bookingsEmi.action.confirming' : 'admin.bookingsEmi.queue.yes') | translate: { count: selected.size } }}</button>
        <button type="button" class="brand-button brand-button--secondary payment-queue__back" [disabled]="busy" (click)="asking = false">{{ 'admin.bookingsEmi.action.back' | translate }}</button>
      </div>

      <div class="booking-register__list">
        <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
          <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
          <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3,4]"></span>
        </div>
        <div class="booking-register__empty" *ngIf="page && !page.payments.length">
          <h2>{{ 'admin.bookingsEmi.empty.queueTitle' | translate }}</h2>
          <p>{{ 'admin.bookingsEmi.empty.queueBody' | translate }}</p>
        </div>
        <table class="booking-register__table payment-queue__table" *ngIf="page?.payments?.length" [attr.aria-label]="'admin.bookingsEmi.tab.unconfirmed' | translate">
          <thead><tr>
            <th scope="col" class="payment-queue__check">{{ 'admin.bookingsEmi.col.select' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.paymentDate' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.associateId' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.associate' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.project' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.plot' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.mode' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.amount' | translate }}</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let r of page!.payments">
              <td class="payment-queue__check" [attr.data-label]="'admin.bookingsEmi.col.select' | translate">
                <input type="checkbox" [checked]="selected.has(key(r))" [disabled]="busy" (change)="toggle(r)"
                  [attr.aria-label]="('admin.bookingsEmi.col.select' | translate) + ' ' + (r.associateCode || '') + ' ' + (r.plotNo || '') + ' #' + r.installmentNumber" /></td>
              <td [attr.data-label]="'admin.bookingsEmi.col.paymentDate' | translate">{{ r.paymentDate | date: 'mediumDate' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.associateId' | translate">{{ r.associateCode || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.associate' | translate">{{ r.associateName || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.project' | translate">{{ r.projectName || '—' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.plot' | translate">{{ r.plotNo || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.mode' | translate">{{ r.paymentMode ? ('admin.bookingsEmi.paymentMode.' + r.paymentMode | translate) : '—' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.amount' | translate">{{ money(r.amount) }}</td>
            </tr>
          </tbody>
          <tfoot><tr class="payment-queue__total">
            <td colspan="7">{{ 'admin.bookingsEmi.totalRow' | translate }}</td>
            <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.amount' | translate">{{ money(page!.pageTotal) }}</td>
          </tr></tfoot>
        </table>
        <app-pager [page]="page?.page ?? 0" [size]="PAGE_SIZE" [total]="page?.totalElements ?? 0" [disabled]="busy" (pageChange)="goTo($event)"></app-pager>
      </div>
    </div>
  `
})
export class PaymentQueueComponent implements OnInit {
  private service = inject(BookingsEmiService);
  @Output() changed = new EventEmitter<void>();
  readonly PAGE_SIZE = PAGE_SIZE;
  money = formatMoney; key = rowKey;
  page: PaymentPage | null = null;
  filters: PaymentFilters = {};
  loading = false; loadError = false; busy = false; asking = false;
  banner: { tone: 'success' | 'danger'; msg: FlashMessage; serverText?: string } | null = null;
  selected = new Set<string>();
  private seq = 0; private currentPage = 0;

  ngOnInit(): void { this.load(0); }
  onFilters(f: ReportFilterValue): void { if (this.busy) { return; } this.filters = { from: f.from, to: f.to, projectId: f.projectId }; this.load(0); }
  goTo(p: number): void { if (!this.busy) { this.load(p); } }
  reload(): void { this.load(this.currentPage); }

  // Latest-request-wins. Any (re)load clears the selection and the confirm prompt: a checked row must never outlive its page.
  private load(p: number): void {
    const mine = ++this.seq;
    this.currentPage = p; this.loading = true; this.loadError = false;
    this.selected.clear(); this.asking = false;
    this.service.payments('ENTERED', this.filters, p, PAGE_SIZE).subscribe({
      next: res => { if (mine === this.seq) { this.loading = false; this.page = res; } },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }
}
```
  (6B adds `checkAll, uncheckAll, toggle, ask, doConfirm, selectedTotal`; add stubs in 6A so the template compiles: `get selectedTotal(): number { return 0; } checkAll(): void {} uncheckAll(): void {} toggle(r: PaymentRow): void {} ask(): void {} doConfirm(): void {}` — **replace them in 6B; do not leave them.**)
  `payment-queue.component.scss` (tokens only, < 2000 B):

```scss
// Unconfirmed payments tab (plot-booking ref-gap U6): reuses the register's table/list/empty/skeleton classes.
.payment-queue {
  display: flex; flex-direction: column; gap: 1.25rem;
  &__bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
  &__bulk { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  &__selected { font: 500 0.8125rem var(--font-mono); font-variant-numeric: tabular-nums; color: var(--text-muted); }
  &__prompt { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; background: var(--surface-card); border: 1px solid var(--brand-primary); border-radius: 4px;
    span { flex: 1 1 18rem; font-weight: 500; } }
  &__check { width: 3rem; input { width: 1.25rem; height: 1.25rem; accent-color: var(--brand-secondary); } }
  &__total td { border-top: 2px solid var(--brand-primary); font-weight: 600; }
  &__server { margin-top: 0.375rem; font-size: 0.8125rem; color: var(--text-muted); }
  .brand-button { min-height: 44px; }
}
```
- [ ] **Step 4: Run** the queue spec -> PASS. **Step 5: Commit** `feat(fe): payment queue list`.

### 6B — selection and bulk confirm

- [ ] **Step 6: Write failing specs** (append, with `import { By }`, `PagerComponent`, `ReportFiltersComponent` imports as needed; helper `rows = [row('b1',1), row('b2',1), row('b3',2,500)]`, boot with `pageOf(rows)`):
  - `Check all selects every row on the page and shows count and amount` (`3 selected` key params: assert `component.selected.size === 3` and `selectedTotal === 1000`).
  - `Uncheck all clears the selection`.
  - `toggling a checkbox selects and unselects one row`.
  - `Confirm selected is disabled with nothing selected`.
  - `Confirm selected opens the inline prompt and sends nothing yet` (`.payment-queue__prompt` present, `http.expectNone(/payments/confirm)`, and `window.confirm` spy not called).
  - `Back closes the prompt and keeps the selection`.
  - `confirming posts every selected {bookingId, installmentNumber} and, on success, shows the success banner with the count, clears the selection and reloads the list` (flush `[]` for confirm; then `listReq()` again; banner `ok.confirmedMany`, `emit changed` once).
  - `reports how many bookings auto-confirmed` (flush `[{id:'b1',status:'CONFIRMED'},{id:'b2',status:'ACTIVE'}]` -> banner key `ok.confirmedManyAuto` with `auto: 1`).
  - `locks checkboxes, buttons, filters, pager while the write is in flight` (before flushing: every `input[type=checkbox]` disabled, `.payment-queue__yes` disabled + `aria-busy`, `app-report-filters` `locked` true, pager `disabled` true; second click sends nothing: `http.expectOne` only once).
  - `409 (stale row) shows the danger banner with the server-named offender, reloads the list, and nothing is reported as confirmed` (flush 409 `{error:'Installment 1 of booking b2 has no entered payment to confirm'}`; banner text key `err.notEntered`... for bulk use `err.confirmMany`; `serverText` shown; then `listReq()`).
  - `network error says the outcome is unknown, reloads the list, and does not show success` (`err.confirmManyNetwork`).
  - `selection is cleared by a page change` (check all, pager `pageChange.emit(1)`, flush page, `selected.size === 0`).
  - `selection is cleared by a filter change`.
  - `selection is cleared by Retry/reload`.
  - `rows that disappeared after a reload cannot stay selected` (covered by the clear-on-load; assert after reload the confirm button is disabled).
- [ ] **Step 7: Run** -> FAIL.
- [ ] **Step 8: Implement** (replace the 6A stubs):

```ts
get selectedRows(): PaymentRow[] { return (this.page?.payments ?? []).filter(r => this.selected.has(rowKey(r))); }
get selectedTotal(): number { return this.selectedRows.reduce((s, r) => s + r.amount, 0); }
checkAll(): void { if (!this.busy) { (this.page?.payments ?? []).forEach(r => this.selected.add(rowKey(r))); } }
uncheckAll(): void { if (!this.busy) { this.selected.clear(); this.asking = false; } }
toggle(r: PaymentRow): void {
  if (this.busy) { return; }
  const k = rowKey(r);
  if (!this.selected.delete(k)) { this.selected.add(k); }
  if (!this.selected.size) { this.asking = false; }
}
ask(): void { if (!this.busy && this.selected.size) { this.asking = true; } }

doConfirm(): void {
  if (this.busy || !this.selected.size) { return; }
  const items = this.selectedRows.map(r => ({ bookingId: r.bookingId, installmentNumber: r.installmentNumber }));
  this.busy = true; this.banner = null;
  this.service.confirmPayments(items).subscribe({
    next: res => {
      // The response is ordered by bookingId, not request order: only count it, never zip it with the request.
      const auto = res.filter(b => b.status === 'CONFIRMED').length;
      this.busy = false;
      this.banner = { tone: 'success', msg: auto
        ? { key: 'admin.bookingsEmi.ok.confirmedManyAuto', params: { count: items.length, auto } }
        : { key: 'admin.bookingsEmi.ok.confirmedMany', params: { count: items.length } } };
      this.changed.emit();
      this.load(this.currentPage);
    },
    error: err => {
      const e = classifyError(err, 'confirmPayment');
      this.busy = false;
      this.banner = { tone: 'danger', msg: { key: 'admin.bookingsEmi.err.' + (e.kind === 'network' ? 'confirmManyNetwork' : 'confirmMany') }, serverText: e.serverText };
      this.load(this.currentPage); // stale rows are the usual cause; show the truth
    }
  });
}
```
  Note `load()` clears `selected` and `asking` — intended after both outcomes. Reload keeps the banner (banner is not reset by `load`).
  The auto-count caveat: only ACTIVE bookings can reach CONFIRMED in this response if they were ACTIVE before; a booking already CONFIRMED before (ENTERED on a CONFIRMED booking) would be counted. To avoid over-counting, remember the status per booking before the call: build `const before = new Map(this.page!.payments...)` is not possible (rows lack booking status). **Decision:** the count is "bookings in the response that are CONFIRMED" and the banner copy says "reached the auto-confirm threshold and are now confirmed" — which can over-claim for already-confirmed bookings. Hence the `ok.confirmedManyAuto` copy in Task 1 says "{{auto}} of the affected bookings are now confirmed" (open question 2).
- [ ] **Step 9: Run** the queue spec -> PASS. **Step 10:** `wc -c payment-queue.component.scss` (< 2000). **Step 11: Commit** `feat(fe): payment queue bulk confirm`.

---

## Task 7: `payment-receipt` + `payment-ledger` (Confirmed tab)

### 7A — `payment-receipt`

**Files:** `payment-receipt.component.ts`, `.scss`, `.spec.ts`.

**Interfaces — Produces:** selector `app-payment-receipt`, `@Input({required:true}) row: PaymentRow`, `@Output() closed`.

- [ ] **Step 1: Write failing spec:**
  - `renders the receipt fields: receipt number, date, associate, project, plot, mode, reference, entry by, confirm by and date`.
  - `shows the amount in INR as the hero figure` (`.payment-receipt__amount` text contains `₹250`).
  - `Print calls printTable with the sheet element only` (spy on `table-export.util` via `spyOn(tableExport, 'printTable')`; **import the module namespace**: `import * as tableExport from '../../shared/utils/table-export.util'` — if the build forbids spying on ES module exports, instead spy `window.print` and assert the sheet gets class `table-export-print` during the call, as the U5 util spec does).
  - `Close emits closed`.
  - `focuses the title when it appears`.
  - `renders dashes for null entry/confirm fields`.
- [ ] **Step 2: Run** `--include=src/app/admin/admin-bookings-emi/payment-receipt.component.spec.ts` -> FAIL.
- [ ] **Step 3: Implement.** Template: wrapper `.payment-receipt`; `<article #sheet class="payment-receipt__sheet">` containing `<div class="payment-receipt__rule">── {{ 'admin.bookingsEmi.receipt.title' | translate | uppercase }} ──</div>`, `<h2 #title tabindex="-1" class="payment-receipt__title">…</h2>` (sans-serif, not Fraunces), `<dl class="payment-receipt__meta">` (receipt no = `row.bookingId.slice(0, 8).toUpperCase() + '-' + row.installmentNumber`, date, associate `code · name`, project, plot, mode, reference, entry by, confirm by, confirm date), `<div class="payment-receipt__amount">` (`receipt.received` label + figure). Buttons row **outside** the article: `.payment-receipt__print.brand-button` and `.payment-receipt__close.brand-button--secondary`. `ngAfterViewInit`: `queueMicrotask(() => this.title.nativeElement.focus())`. `print()` calls `printTable(this.sheet.nativeElement)` (import from `../../shared/utils/table-export.util`).
  SCSS (tokens only; the print double rule uses a CSS `double` border so it survives printers that drop backgrounds/shadows):
```scss
// Payment receipt (plot-booking ref-gap U6): seal-style double rule; printed through table-export printTable.
.payment-receipt {
  display: flex; flex-direction: column; gap: 0.75rem; max-width: 26rem;
  &__sheet { padding: 1.5rem; background: var(--surface-card); border: 1px solid var(--brand-primary); border-radius: 4px;
    box-shadow: 0 0 0 4px var(--surface-card), 0 0 0 5px var(--brand-primary); }
  &__rule { text-align: center; font: 600 0.75rem var(--font-sans); letter-spacing: 0.12em; color: var(--brand-secondary); }
  &__title { margin: 0.5rem 0 1rem; text-align: center; font: 600 1.125rem var(--font-sans); &:focus { outline: none; } }
  &__meta { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; margin: 0 0 1rem;
    dt { font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
    dd { margin: 0; text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; } }
  &__amount { text-align: center; border-top: 1px solid var(--border-subtle); padding-top: 1rem;
    span { display: block; font: 500 0.6875rem var(--font-mono); text-transform: uppercase; color: var(--text-muted); }
    strong { font: 600 2rem var(--font-display); color: var(--text-primary); } }
  &__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; .brand-button { min-height: 44px; } }
}
@media print { .payment-receipt__sheet { box-shadow: none; border: 4px double var(--brand-primary); max-width: 26rem; margin: 1rem; } }
@media (max-width: 768px) { .payment-receipt { max-width: none; } }
```
- [ ] **Step 4: Run** -> PASS. **Step 5: Commit** `feat(fe): payment receipt`.

### 7B — `payment-ledger`

**Files:** `payment-ledger.component.ts`, `.scss`, `.spec.ts`.

**Interfaces — Consumes:** `payments('PAID', f, page, size)`, `collectPages`, `exportCsv`/`ExportColumn`, `PaymentReceiptComponent`, `ReportFiltersComponent`, `PagerComponent`.

- [ ] **Step 6: Write failing specs** (fixture as in Task 6 with `confirmBy: 'admin'`, `confirmedAt: '2026-03-03T00:00:00Z'`):
  - `loads status=PAID page 0 size 20 on init`.
  - `renders Entry by, Confirm by and Confirm date columns` (header keys `col.entryBy/confirmBy/confirmDate`).
  - `renders the Total row from pageTotal`.
  - `has no seal card` (`app-seal-card` null).
  - `filter change reloads page 0 with the range and project`; `paging requests that page`.
  - `skeleton, empty (empty.ledgerTitle) and error+Retry states`.
  - `Print receipt opens the receipt for that row only` (`app-payment-receipt` present with `row.bookingId` of the clicked row; clicking another row's button swaps it; Close removes it).
  - `Export CSV walks every page with size 100 and exports the confirmed rows` (spy `exportCsv` via the namespace import or capture the Blob like the U5 util spec: `spyOn(URL, 'createObjectURL')`; first request `size=100,page=0,status=PAID,totalElements=150`, then page 1; assert the CSV text has 151 lines incl. header and the BOM and that `filename` is `payments-confirmed.csv`).
  - `Export CSV button is disabled while exporting and a failed export shows err.export without crashing`.
  - `Export CSV on an empty result still downloads a header-only file`.
  - `stale list response is ignored`.
- [ ] **Step 7: Run** -> FAIL. **Step 8: Implement** following the Task 6A structure: `loading/loadError/seq`, `filters`, `page`; template = filters, bar with `Export CSV` button (`.payment-ledger__export`, `brand-button--secondary`, `[disabled]="exporting"`), `.booking-register__list` with skeleton/empty/table/pager, optional `<app-payment-receipt *ngIf="receipt" [row]="receipt" (closed)="receipt = null">` placed **above** the list. Columns: paymentDate, associateId, associate, project, plot, amount, mode, entryBy, confirmBy, confirmDate (`r.confirmedAt | date: 'mediumDate'`), and a last cell with `<button type="button" class="booking-register__retry payment-ledger__receipt-btn" (click)="receipt = r">{{ 'admin.bookingsEmi.action.receipt' | translate }}</button>`. `tfoot` Total row (`colspan` 5 label, amount, then empty). Export:

```ts
exportCsv_(): void {
  if (this.exporting) { return; }
  this.exporting = true; this.banner = null;
  collectPages<PaymentRow>(p => this.service.payments('PAID', this.filters, p, 100).pipe(map(r => ({ rows: r.payments, totalElements: r.totalElements }))))
    .subscribe({
      next: rows => { exportCsv(rows, this.columns, 'payments-confirmed.csv'); this.exporting = false; },
      error: () => { this.exporting = false; this.exportError = true; }
    });
}
```
  with `columns: ExportColumn<PaymentRow>[]` = Payment date (`r.paymentDate.slice(0, 10)`), Associate ID, Name, Project, Plot, Amount (number), Mode, Reference, Entry by, Confirm by, Confirm date (`r.confirmedAt?.slice(0, 10)`). Show `err.export` in a danger `app-inline-banner` when `exportError`. SCSS `payment-ledger.component.scss` (< 2000 B): `.payment-ledger { display:flex; flex-direction:column; gap:1.25rem; &__bar { display:flex; justify-content:flex-end; } &__total td { border-top: 2px solid var(--brand-primary); font-weight: 600; } .brand-button { min-height: 44px; } }`.
- [ ] **Step 9: Run** `--include=src/app/admin/admin-bookings-emi/payment-ledger.component.spec.ts` -> PASS. **Step 10: Commit** `feat(fe): payment ledger tab with receipt and CSV`.

---

## Task 8: `cancelled-bookings` (Cancelled tab)

**Files:** `cancelled-bookings.component.ts`, `.scss`, `.spec.ts`.

**Interfaces — Consumes:** `BookingsEmiService.list({status:'CANCELLED', associateId:'', plotId:'', projectId, overdue:false, cancelledFrom, cancelledTo}, page, 20)`; `collectPages`; `exportCsv`.

- [ ] **Step 1: Write failing specs:**
  - `requests status=CANCELLED page 0 size 20 and never sends PLC or overdue params` (`params.get('status')==='CANCELLED'`, no `overdue`).
  - `filter change sends cancelledFrom, cancelledTo and projectId and returns to page 0`.
  - `renders Booked on, Associate ID, Name, Buyer, Mobile, Cancelled on, Discount, Total, Paid` and dashes for null mobile/discount/cancelledAt; `no Due column`.
  - `uses the report-filters labels "Cancelled from / to"` (component input `fromKey` = `admin.bookingsEmi.filter.cancelledFrom`).
  - `pages with app-pager`; `skeleton, empty (empty.cancelledTitle), error+Retry`; `stale response ignored`.
  - `Export CSV walks all pages (size 100) with the same filters and file name cancelled-bookings.csv`; `export error shows err.export`; `empty export yields a header-only file`.
  - `has no seal card and no row click handler` (read-only tab).
- [ ] **Step 2: Run** -> FAIL. **Step 3: Implement** modeled on Task 7B (no receipt). Row cells: `bookedAt | date`, `associateCode || '—'`, `associateName || '—'`, buyer (+`plotText(b)` · project sub-line), `buyerPhone || '—'`, `cancelledAt | date` or `—`, `discount != null ? money : '—'`, `money(totalAmount)`, `money(paidAmount)`. Filter template: `<app-report-filters fromKey="admin.bookingsEmi.filter.cancelledFrom" toKey="admin.bookingsEmi.filter.cancelledTo" …>`. SCSS: same minimal block with prefix `.cancelled-bookings`.
- [ ] **Step 4: Run** `--include=src/app/admin/admin-bookings-emi/cancelled-bookings.component.spec.ts` -> PASS. **Step 5: Commit** `feat(fe): cancelled bookings tab`.

---

## Task 9: `last-emi` (EMI by last date tab)

**Files:** `last-emi.component.ts`, `.scss`, `.spec.ts`.

**Interfaces — Consumes:** `BookingsEmiService.lastEmi({from,to,projectId})` (plain array), `exportCsv`, `ReportFiltersComponent`.

- [ ] **Step 1: Write failing specs:**
  - `loads on init with no params` (`/api/admin/emi-reports/last-emi`, no query).
  - `a filter change sends from, to and projectId`.
  - `renders Booked on, Associate ID, Name, Buyer, Mobile, Plot, Project, Last EMI date, Discount, Total, Paid, Rest` with dash for null mobile/discount.
  - `the footer sums Total, Paid and Rest client-side` (two rows -> sums).
  - `has no pager` (`app-pager` null).
  - `skeleton, empty (empty.lastEmiTitle), error+Retry; stale response ignored`.
  - `Export CSV exports the loaded rows to emi-last-date.csv without another request` (no extra HTTP call; header-only when empty).
- [ ] **Step 2: Run** -> FAIL. **Step 3: Implement** like Task 8 without pager/`collectPages`; `tfoot` `<td colspan="9">Total</td>` then three num cells. SCSS `.last-emi` block (< 2000 B) with the same pattern.
- [ ] **Step 4: Run** `--include=src/app/admin/admin-bookings-emi/last-emi.component.spec.ts` -> PASS. **Step 5: Commit** `feat(fe): EMI by last date tab`.

---

## Task 10: Register upgrade (columns, filters, export, print)

**Files:** `booking-register.component.ts`, `booking-register.component.spec.ts` (touch `booking-register.component.scss` only if Task 5 did not already).

**Interfaces — Consumes:** `RegisterFilters` new optional fields; `collectPages`, `exportCsv`, `printTable`; **Produces:** none.

- [ ] **Step 1: Write failing specs** (extend the existing fixture helpers; booking fixtures get `buyerPhone, areaSqft, rate, discount`):
  - `renders Mobile, Area, Rate and Discount columns and dashes when null`.
  - `Booked from / to date inputs reload page 0 with bookedFrom and bookedTo`.
  - `the search box sends q on change (trimmed) and on Enter, reloads page 0`; `an empty search clears q`.
  - `From after To shows validation.range and sends no request`.
  - `Reset clears the dates and the search`; `hasFilters is true for dates and q (shows the no-match empty state)`.
  - `Export CSV walks all pages of the current filters (size 100) and downloads bookings.csv with mobile, area, rate, discount columns`; `disabled while exporting and while locked`; `failed export shows err.export banner`; `empty result exports header only`.
  - `Print calls printTable with the register table` (spy `window.print`; assert the table gets the print class during the call).
  - `filters/search/export/print are disabled while a seal write locks the register`.
- [ ] **Step 2: Run** `--include=src/app/admin/admin-bookings-emi/booking-register.component.spec.ts` -> FAIL.
- [ ] **Step 3: Implement.** In the filter bar add (before the overdue toggle):
```html
<label class="booking-register__field">{{ 'admin.bookingsEmi.filter.bookedFrom' | translate }}
  <input name="bookedFrom" type="date" [disabled]="locked" [value]="filters.bookedFrom || ''" [attr.max]="filters.bookedTo || null" (change)="applyDate({ bookedFrom: $any($event.target).value })" /></label>
<label class="booking-register__field">{{ 'admin.bookingsEmi.filter.bookedTo' | translate }}
  <input name="bookedTo" type="date" [disabled]="locked" [value]="filters.bookedTo || ''" [attr.min]="filters.bookedFrom || null" (change)="applyDate({ bookedTo: $any($event.target).value })" /></label>
<label class="booking-register__field">{{ 'admin.bookingsEmi.filter.search' | translate }}
  <input name="q" type="search" [disabled]="locked" [value]="filters.q || ''" [placeholder]="'admin.bookingsEmi.filter.searchPlaceholder' | translate"
    (change)="applyFilter({ q: $any($event.target).value.trim() })" (keydown.enter)="applyFilter({ q: $any($event.target).value.trim() })" /></label>
```
  and after Reset: `Export CSV` (`.booking-register__export`, `[disabled]="locked || exporting"`) and `Print` (`.booking-register__print`, `[disabled]="locked || !page?.bookings?.length"`, `title` = a translated "prints the visible page" is **not** added: skip the title, YAGNI). Add `<app-field-error [message]="rangeError ? (… validation.range …) : undefined">` under the bar. `applyDate(partial)`: merges, sets `rangeError`, and calls `applyFilter({})`-equivalent only when valid (reuse `applyFilter(partial)` after checking the merged range). Add `FieldErrorComponent` to `imports`. `hasFilters` also checks `bookedFrom/bookedTo/q`. `NO_FILTERS` gains `bookedFrom: '', bookedTo: '', q: ''`. Table: insert header+cell for Mobile (after Buyer), and Area, Rate, Discount (after Status, before Total): `b.buyerPhone || '—'`; `b.areaSqft != null ? b.areaSqft : '—'`; `b.rate != null ? money(b.rate) : '—'`; `b.discount != null ? money(b.discount) : '—'`, numeric cells use `booking-register__num`. Table gets `#regTable`; `print(): void { if (this.regTable) { printTable(this.regTable.nativeElement); } }` via `@ViewChild('regTable') regTable?: ElementRef<HTMLElement>`. Export:
```ts
exportAll(): void {
  if (this.locked || this.exporting) { return; }
  this.exporting = true; this.exportError = false;
  collectPages<Booking>(p => this.service.list(this.filters, p, 100).pipe(map(r => ({ rows: r.bookings, totalElements: r.totalElements }))))
    .subscribe({ next: rows => { exportCsv(rows, this.exportColumns, 'bookings.csv'); this.exporting = false; }, error: () => { this.exporting = false; this.exportError = true; } });
}
```
  `exportColumns`: Booked on, Associate ID, Associate, Buyer, Mobile, Project, Plot, Area, Rate, Discount, Total, Paid, Due, Status (null -> empty cell, numbers as numbers).
- [ ] **Step 4: Run** the register spec -> PASS (all existing register specs still pass). **Step 5:** `wc -c booking-register.component.scss` unchanged by this task. **Step 6: Commit** `feat(fe): register mobile/area/rate/discount columns, date and text filters, CSV and print`.

---

## Task 11: Wire the six tabs into `bookings-emi.component`

**Files:** `bookings-emi.component.ts`, `bookings-emi.component.spec.ts`. (Do not touch the SCSS.)

- [ ] **Step 1: Write failing specs** (extend `bookings-emi.component.spec.ts`; `flushRegister()` helper exists):
  - `shows six tabs in order Register, Unconfirmed, Confirmed, Overdue, Cancelled, EMI by last date` (labels from `TabBarComponent.tabs`; use `.map(t => t.id)` = `['register','unconfirmed','confirmed','overdue','cancelled','lastEmi']`).
  - `switching to Unconfirmed mounts the queue and unmounts the register` (flush projects + `/api/admin/payments?status=ENTERED`); back to Register remounts.
  - `switching to Confirmed requests status=PAID`; `Cancelled requests status=CANCELLED`; `EMI by last date requests /emi-reports/last-emi`.
  - `only the active tab's component exists` (each switch).
  - `switching tabs clears the flash` (existing spec still passes).
  - `overdue tab keeps its count suffix` (existing).
  - `opening a booking from Overdue still switches to the register` (existing).
- [ ] **Step 2: Run** `--include=src/app/admin/admin-bookings-emi/bookings-emi.component.spec.ts` -> FAIL.
- [ ] **Step 3: Implement.** Imports for the four components; `type TabId = 'register' | 'unconfirmed' | 'confirmed' | 'overdue' | 'cancelled' | 'lastEmi'; activeTab: TabId = 'register';` `tabs` getter in the order above (labels `tab.unconfirmed`, `tab.confirmed`, `tab.cancelled`, `tab.lastEmi`). Template additions after the overdue line:
```html
<app-payment-queue *ngIf="activeTab === 'unconfirmed'"></app-payment-queue>
<app-payment-ledger *ngIf="activeTab === 'confirmed'"></app-payment-ledger>
<app-cancelled-bookings *ngIf="activeTab === 'cancelled'"></app-cancelled-bookings>
<app-last-emi *ngIf="activeTab === 'lastEmi'"></app-last-emi>
```
  Change the `(tabChange)` handler to `activeTab = $any($event)` (already). `openBooking()` still sets `'register'`.
- [ ] **Step 4: Run** the parent spec and then the whole folder: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/admin-bookings-emi/**/*.spec.ts'` -> PASS. **Step 5: Commit** `feat(fe): bookings-emi six-tab shell`.

---

## Task 12: Full verification

- [ ] **Step 1: Full unit suite:** `npx ng test --watch=false --browsers=ChromeHeadless` -> all green (record counts; the baseline is the count on master 7c67c15, run `git stash`-free by comparing with the last green run in the U5 report).
- [ ] **Step 2: Production build and budget check:** `npx ng build 2>&1 | tee ../tmp-build.log | grep -i "warn\|error\|bookings-emi\|booking-seal\|booking-register\|payment-\|cancelled-\|last-emi"` (write the log to the scratchpad, not the repo). Expected: no errors; the only SCSS warnings are the pre-existing `bookings-emi.component.scss` (3028 B -> not larger) and `booking-seal.component.scss` (<= +40 B vs 3402 B, same warning line, byte difference reported); the new component styles produce **no** warning; `booking-register.component.scss` must not newly appear. Initial-bundle warning is pre-existing (1.10 MB, lazy chunk grows only).
- [ ] **Step 3: Hygiene greps (all must be empty):**
  - `grep -nE '#[0-9a-fA-F]{3,8}\b' src/app/admin/admin-bookings-emi/{payment-queue,payment-ledger,payment-receipt,cancelled-bookings,last-emi}.component.scss`
  - `grep -rn "window.confirm\|confirm(" src/app/admin/admin-bookings-emi --include=*.ts | grep -v spec | grep -v "confirm(id\|\.confirm(\|confirmPayment\|confirmed\|confirmSelected"` (manual eyeball for any `window.confirm`)
  - `grep -rn "plotDriftPay\|'CASH'" src/app/admin/admin-bookings-emi --include=*.ts | grep -v "spec"` (no temporary CASH default left)
  - `git diff --stat master -- src/styles/_admin.scss` -> empty.
- [ ] **Step 4: Parity:** re-run the Task 1 key-parity `node -e` command -> `parity ok`; every `'admin.bookingsEmi.…'` literal used in the new components exists (spot check with `grep -oh "admin.bookingsEmi\.[A-Za-z0-9_.]*" <files> | sort -u` against `en.json`).
- [ ] **Step 5: Manual verification (live, port 4201; port 4200 is another project).** Follow the `run` skill for DB + backend (`cd backend`; backend on its configured port), then `cd frontend && npx ng serve --port 4201`. Log in `admin` / `ChangeMe123!` and open `/settings/bookings-emi`. Checklist:
  1. Six tabs appear in order Register, Unconfirmed, Confirmed, Overdue (with count), Cancelled, EMI by last date; keyboard Tab/Arrow reaches each; switching clears the flash.
  2. **Register:** columns Mobile, Area, Rate, Discount populated for new bookings, dashes for legacy rows; Booked from/to filter; search "Associate ID or plot no" by an associate login ID and by a plot no; From>To shows the inline error and sends no request (Network tab); Export CSV opens in Excel with ₹/Devanagari intact and all pages (>100 rows if seeded); Print shows only the table.
  3. **Seal:** open a booking with a PENDING instalment: button reads *Enter payment*; submit without a mode shows the mode error; enter with mode UPI -> row shows a bronze ENTERED chip with mode/date and the booking stays ACTIVE with Paid unchanged; click *Confirm* on that row -> Paid/Due update; with an AUTO_THRESHOLD config that this payment crosses, the warning appears before submit and the auto-confirm flash appears after, booking turns CONFIRMED; an ENTERED row on a CONFIRMED booking still shows *Confirm*; no Confirm on a CANCELLED booking.
  4. **Unconfirmed:** exactly one seal card (pending total in the Fraunces figure, count caption); filters by date and project; Check all / Uncheck all; selected count and amount; *Confirm selected* shows the inline panel (no browser dialog), *Back* keeps selection; confirm -> green banner with count, rows leave, seal total drops; double-click cannot double-submit (controls locked, `aria-busy`); change page or filter with rows checked -> selection is cleared; make one selected row stale (confirm it from another tab or via the seal) then bulk confirm -> red banner with server text, nothing confirmed, list refreshed.
  5. **Confirmed:** confirmed payments with Entry by, Confirm by, Confirm date; *Print receipt* opens the receipt sheet; browser print preview shows only the double-ruled sheet (no nav, no table); Close returns focus; Export CSV downloads `payments-confirmed.csv`.
  6. **Cancelled:** cancel a booking that has an ENTERED payment (it voids) and one with none; it appears with Cancelled on; the cancel-date range filter includes/excludes correctly; Export CSV.
  7. **EMI by last date:** a booking whose last instalment falls in the range appears with Total/Paid/Rest; footer sums; empty state for an empty range.
  8. **Mobile (resize to 390px):** every new table stacks with data-labels, action bars wrap, buttons >= 44px, no horizontal page scroll (tables only scroll inside their card).
  9. **DESIGN.md:** one seal card on Unconfirmed only; Oxblood/Bright Gold primary buttons; red only for errors; mono tabular numerals; Fraunces only on the page title, seal-card figure and receipt amount. Take screenshots of each tab (desktop + 390px) and attach to the PR/report.
  10. Switch to Hindi: new strings render (English copy is expected, same as existing keys), no raw key names visible.
- [ ] **Step 6:** Report: test counts, build warnings diff, screenshots, any deviations. Do not edit tracking files.

---

## Self-review

- **Spec coverage:** tabs (T11); Register columns/filters/q/export/print (T10); Unconfirmed seal card, filters, checkbox table, Total row, Check/Uncheck/Confirm, inline confirm, banners, lock, pager (T6); Confirmed columns, receipt print, CSV (T7); Cancelled (T8); Last EMI (T9); seal payment-mode select, Confirm button, ENTERED warning chip, autoConfirm wiring, obsolete specs (T4/T5); pager aria-label nit (T1); budgets/hex/_admin.scss/mobile (Global Constraints + T12).
- **Placeholders:** none intended; Tasks 8-10 describe row/column specifics in prose against the fully coded Task 6/7 patterns.
- **Type consistency:** `ReportFilterValue` (T3) used in T6-T9; `rowKey` exported from `payment-queue.component.ts`; `collectPages` signature (T2) used in T7/T8/T10; `Mode` includes `confirmPayment` (T5); `ErrorKind.notEntered` (T2) used in T5/T6.

## Open questions

1. Migrate Register/Overdue to `app-pager` (would rewrite specs that pin `.booking-register__prev/next`)? Plan leaves them.
2. Bulk-confirm banner counts bookings that are CONFIRMED in the response; this can include bookings that were already CONFIRMED before (ENTERED on a CONFIRMED booking). Copy was softened to "are now confirmed"; exact count would need the backend to flag newly auto-confirmed bookings.
3. Selection is per page by design (safety). Should "Check all" ever span all pages for the filter (needs a server-side confirm-by-filter endpoint)?
4. Should the Confirmed ledger also offer a whole-table Print (reference lists have print icons), in addition to the per-row receipt?
5. EMI-by-last-date endpoint is unpaged; fine for current volume, but needs pagination server-side if bookings exceed a few thousand.
