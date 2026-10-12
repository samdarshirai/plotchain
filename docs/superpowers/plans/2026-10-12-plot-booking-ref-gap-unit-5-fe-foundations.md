# Plot-Booking Reference-Gap U5 — Frontend Foundations Implementation Plan

> **For agentic workers:** use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes. TDD: write the spec, watch it fail, implement, watch it pass. **Do NOT edit any tracking file** (`*-units.md`, `spec-cycle-status.md`); the coordinator does that.

**Goal:** Land the shared frontend plumbing U6/U7/U8 build on: a pager component, CSV export + print helpers, extended TS models, `BookingsEmiService` methods for the merged U1-U3 backend, and i18n keys in both locales. No new screens.

**Parent plan:** `docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md` (section U5, Design rules). **Backend (merged on master, read-only here):** `backend/src/main/java/com/plotchain/booking/*`.

**Tech:** Angular 18 standalone, Karma/Jasmine, `@ngx-translate`. Working dir for all commands: `/Users/ronalisenapati/Ronali/plotchain/frontend`. Targeted run: `npx ng test --watch=false --browsers=ChromeHeadless --include=<spec path relative to frontend/>`.

**Hard constraints**
- No new npm dependency. "Excel" export = CSV.
- `frontend/src/styles/_admin.scss` is at bundle budget: do NOT touch it. Pager styling goes in its own component SCSS (`ViewEncapsulation.None`, BEM prefix `.pager`), tokens only (`--border-subtle`, `--text-muted`, `--font-mono`), no hex, no shadows.
- Every new i18n key goes in BOTH `src/assets/i18n/en.json` and `src/assets/i18n/hi.json` (hi.json currently carries English copy for `admin.bookingsEmi.*`; mirror the same English strings, same as existing practice).
- Keep existing specs green. Do not change behaviour of existing screens beyond what Task 6 states.

## Backend contract (verified from source)

- `BookingResponse` adds: `buyerPhone, listPrice, discount, areaSqft, rate, cancelledAt, associateCode` (all nullable; team view nulls phone/listPrice/areaSqft/rate). Existing: `plotNo, projectName, associateName`.
- `EmiInstallmentResponse`: `installmentNumber, amount, dueDate, status, paidAt, overdue, paymentMode (nullable), confirmedAt (nullable)`. `InstallmentStatus = PENDING|ENTERED|PAID|VOID` (`PAID` = confirmed).
- `PaymentMode = CASH|CHEQUE|UPI|BANK_TRANSFER|OTHER`.
- `PATCH /api/admin/bookings/{id}/installments/{n}/pay` body `{amount, paymentRef, paymentMode (REQUIRED), paidAt?}` — only ENTERS the payment (booking stays ACTIVE; never auto-confirms). Returns `BookingResponse`.
- `POST /api/admin/bookings/{id}/installments/{n}/confirm` (single confirm; body empty) -> `BookingResponse`. (Path per parent plan U2; verify with `grep -n "installments/{n}/confirm\|installments/{" backend/src/main/java/com/plotchain/booking/BookingController.java` — if the mapping differs, follow the controller and note it in the report.)
- `POST /api/admin/payments/confirm` body `{items:[{bookingId, installmentNumber}]}` (1..200 items, all-or-nothing) -> `BookingResponse[]` **ordered by ascending bookingId, NOT request order**.
- `GET /api/admin/payments?status=ENTERED|PAID(default ENTERED)&from&to&projectId&page&size` (dates `YYYY-MM-DD`; size clamped 1..100) -> `PaymentPageResponse {payments: PaymentRow[], page, size, totalElements, pageTotal, grandTotal}`; `PaymentRow {bookingId, installmentNumber, paymentDate, associateCode, associateName, projectName, plotNo, amount, paymentMode|null, paymentRef|null, entryBy|null, confirmBy|null, confirmedAt|null}`.
- `GET /api/admin/emi-reports/last-emi?from&to&projectId` -> plain **array** `LastEmiRow[] {bookingId, bookedAt, associateCode, associateName, buyerName, buyerPhone, plotNo, projectName, lastDueDate, discount, total, paid, rest}` (not paged).
- `GET /api/admin/bookings` new params: `bookedFrom, bookedTo, cancelledFrom, cancelledTo` (dates), `q` (string); existing `status, associateId, plotId, projectId, overdue, page, size`.

## Decisions

1. **`cancelled()` service method (parent plan mentions it): NOT added.** Cancelled tab = `list()` with `status:'CANCELLED'` + `cancelledFrom/To` (U6). YAGNI.
2. **New `RegisterFilters` fields are optional** (`bookedFrom?, bookedTo?, cancelledFrom?, cancelledTo?, q?`) so `booking-register.component.ts` and its specs compile untouched; `list()` only sends a param when truthy.
3. **booking-seal.component.spec.ts "success emits the updated booking and an auto-confirm flash when status flips to CONFIRMED" (~L111-122):** it still passes mechanically (it flushes a mocked CONFIRMED response), but it encodes obsolete semantics (pay never confirms now). Minimal U5 change: make `submitPay()` send `paymentMode: 'CASH'` as a temporary default (needed because `PayRequest.paymentMode` becomes required and the real backend 400s without it), and rewrite that one spec to the new semantics (flush an ACTIVE booking with the instalment `ENTERED` -> expect the plain `admin.bookingsEmi.ok.pay` flash). Leave the `ok.autoConfirm` branch in the component and the other seal specs (warn-autoConfirm etc.) alone: **U6 owns** the payment-mode select, the Enter/Confirm button split, removal of the dead auto-confirm branch, and the remaining seal rework.
4. **Print:** `printTable(target)` marks the target with a transient class, injects a one-off `<style>` containing `@media print` rules (hide everything except the target) into `document.head`, calls `window.print()`, and removes both on `afterprint`/immediately after the (blocking) call. Styles are injected at runtime, so no global SCSS grows.
5. **CSV details:** UTF-8 BOM prefix (Excel needs it for ₹/Devanagari), CRLF line endings, RFC-4180 quoting (quote when value contains `,` `"` CR LF), and spreadsheet-formula guard: string cells starting with `= + - @` get a leading `'`; numbers are never altered.
6. **i18n scope:** only `admin.bookingsEmi.*` and new `shared.pager.*` now. `plotBookings.*` / `salesHistory.*` keys are added by U7/U8 when their screens exist (avoid speculative strings).

## File map

Create:
- `src/app/shared/components/pager/pager.component.ts`, `pager.component.scss`, `pager.component.spec.ts`
- `src/app/shared/utils/table-export.util.ts`, `table-export.util.spec.ts`

Modify:
- `src/app/plot-bookings/models/associate-booking-page.model.ts`
- `src/app/admin/admin-bookings-emi/bookings-emi.model.ts`
- `src/app/admin/admin-bookings-emi/bookings-emi.service.ts` + `bookings-emi.service.spec.ts`
- `src/app/admin/admin-bookings-emi/booking-seal.component.ts` + `booking-seal.component.spec.ts` (minimal, Decision 3)
- `src/assets/i18n/en.json`, `src/assets/i18n/hi.json`

---

## Task 1: Pager component (shared)

**Files:** create the three `pager.*` files under `src/app/shared/components/pager/`.

API (standalone, selector `app-pager`, imports `CommonModule, TranslateModule`):
- `@Input() page = 0` (zero-based), `@Input() size = 20`, `@Input() total = 0`, `@Input() disabled = false`
- `@Output() pageChange = new EventEmitter<number>()`
- getters `totalPages` (`max(1, ceil(total/size))`, guard `size<=0`), `from`/`to` (1-based range shown; `0..0` when `total===0`)
- Markup: root `<nav class="pager" aria-label>` hidden (`*ngIf`) when `total === 0`; Previous `button.pager__prev`, summary `span.pager__summary` using `'shared.pager.summary' | translate: {from,to,total,page:page+1,totalPages}`, Next `button.pager__next`. Buttons are `type="button" class="brand-button brand-button--secondary"` (reuse existing classes), `[disabled]="disabled || page<=0"` / `[disabled]="disabled || page>=totalPages-1"`. `go(p)` emits only when `p` is within `[0,totalPages-1]` and not disabled.
- SCSS: `.pager { display:flex; gap:.75rem; align-items:center; justify-content:flex-end; flex-wrap:wrap; padding-block:.75rem; border-top:1px solid var(--border-subtle) }` `.pager__summary { font-family:var(--font-mono); font-variant-numeric:tabular-nums; color:var(--text-muted) }`. Component uses `styleUrl: './pager.component.scss'` and `encapsulation: ViewEncapsulation.None`.

- [ ] **1.1 Write `pager.component.spec.ts` (RED).** Use a host or `setInput`; imports `[PagerComponent, TranslateModule.forRoot()]`. Specs (names exact):
  - `renders nothing when total is 0`
  - `disables Previous on the first page and Next on the last page`
  - `emits the next page index when Next is clicked` (page 0, size 20, total 45 -> emits 1)
  - `emits the previous page index when Previous is clicked`
  - `does not emit when disabled`
  - `computes totalPages, from and to` (total 45 size 20 page 2 -> from 41, to 45, totalPages 3; size 0 does not throw)
- [ ] **1.2 Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/shared/components/pager/pager.component.spec.ts` -> fails (module missing).
- [ ] **1.3 Implement** the component + SCSS. Add i18n keys `shared.pager.previous` ("Previous"), `shared.pager.next` ("Next"), `shared.pager.summary` ("{{from}}–{{to}} of {{total}} · Page {{page}} of {{totalPages}}") to both JSONs as a **new top-level `"shared": { "pager": {...} }`** object (Task 7 adds the rest; do the pager keys here so the spec/template are coherent). Use `previous`/`next` keys in the template.
- [ ] **1.4 Run the targeted spec** -> green.
- [ ] **1.5 Commit** (feature branch/worktree of the implementer): `feat(fe): shared pager component`.

## Task 2: CSV export + print helpers

**Files:** `src/app/shared/utils/table-export.util.ts`, `.spec.ts`.

Exports:
```
export interface ExportColumn<T> { header: string; value: (row: T) => string | number | null | undefined; }
export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string      // pure, tested directly
export function exportCsv<T>(rows: T[], columns: ExportColumn<T>[], filename: string): void
export function printTable(target: HTMLElement): void
```
- `toCsv`: header row from `columns[].header` (same quoting/guard), `\r\n` joins, BOM `﻿` prefix, null/undefined -> empty string, Decision 5 quoting + formula guard (strings only).
- `exportCsv`: `new Blob([toCsv(...)], {type:'text/csv;charset=utf-8'})`, `URL.createObjectURL`, create `<a>` with `href` + `download = filename` (append `.csv` if missing), append to body, `click()`, remove, `URL.revokeObjectURL`. No Angular DI (plain functions).
- `printTable`: Decision 4. Style content e.g. `@media print{body *{visibility:hidden!important}.table-export-print,.table-export-print *{visibility:visible!important}.table-export-print{position:absolute;left:0;top:0;width:100%}}`; class name constant `table-export-print`. Always clean up in a `try/finally`.

- [ ] **2.1 Write `table-export.util.spec.ts` (RED).** Specs (names exact):
  - `toCsv writes a BOM, a header row and CRLF-separated rows`
  - `toCsv quotes values containing commas, quotes and newlines and doubles embedded quotes`
  - `toCsv renders null and undefined as empty cells`
  - `toCsv neutralises spreadsheet formulas in string cells but leaves numbers alone` (`'=SUM(A1)'` -> `'=SUM(A1)`, number `-5` stays `-5`)
  - `exportCsv creates an object URL for a text/csv blob, clicks a download anchor with the filename, and revokes the URL` (spy `URL.createObjectURL` returning `'blob:x'`, `URL.revokeObjectURL`, and `HTMLAnchorElement.prototype.click`; capture the anchor via `document.body.appendChild` spy or a click spy's `this`; read blob text with `await blob.text()` and assert starts with BOM)
  - `exportCsv appends .csv when the filename has no extension`
  - `printTable calls window.print once, marks the target during the call, then removes the class and the injected style` (spy `window.print` with a fake that asserts the class and a `<style>` exist at call time)
  - `printTable cleans up even when print throws`
- [ ] **2.2 Run** `--include=src/app/shared/utils/table-export.util.spec.ts` -> red.
- [ ] **2.3 Implement.** **2.4 Run** -> green. **2.5 Commit** `feat(fe): CSV export and print table helpers`.

## Task 3: Models

**Files:** `plot-bookings/models/associate-booking-page.model.ts`, `admin/admin-bookings-emi/bookings-emi.model.ts`.

Type-only change; the compile is the test (verified by Tasks 4-6 specs and the final `ng build`).

- [ ] **3.1 `associate-booking-page.model.ts`:** `InstallmentStatus = 'PENDING' | 'ENTERED' | 'PAID' | 'VOID'`; add `export type PaymentMode = 'CASH' | 'CHEQUE' | 'UPI' | 'BANK_TRANSFER' | 'OTHER'` and `export const PAYMENT_MODES: PaymentMode[]` (the 5 values, for U6's select). `EmiInstallment` gains `paymentMode?: PaymentMode | null; confirmedAt?: string | null`. `Booking` gains optional `buyerPhone?: string | null; listPrice?: number | null; discount?: number | null; areaSqft?: number | null; rate?: number | null; cancelledAt?: string | null; associateCode?: string | null`. (All optional/nullable so existing spec fixtures like `bk()` still type-check.)
- [ ] **3.2 `bookings-emi.model.ts`:**
  - `RegisterFilters` add optional `bookedFrom?, bookedTo?, cancelledFrom?, cancelledTo?, q?: string`.
  - `PayRequest { amount: number; paymentRef: string; paymentMode: PaymentMode; paidAt?: string }` (import `PaymentMode`).
  - `export interface PaymentRow { bookingId: string; installmentNumber: number; paymentDate: string; associateCode: string | null; associateName: string | null; projectName: string | null; plotNo: string | null; amount: number; paymentMode: PaymentMode | null; paymentRef: string | null; entryBy: string | null; confirmBy: string | null; confirmedAt: string | null; }`
  - `export interface PaymentPage { payments: PaymentRow[]; page: number; size: number; totalElements: number; pageTotal: number; grandTotal: number; }`
  - `export interface PaymentFilters { from?: string; to?: string; projectId?: string; }`
  - `export interface PaymentRef { bookingId: string; installmentNumber: number; }`
  - `export interface LastEmiRow { bookingId: string; bookedAt: string; associateCode: string | null; associateName: string | null; buyerName: string; buyerPhone: string | null; plotNo: string | null; projectName: string | null; lastDueDate: string; discount: number | null; total: number; paid: number; rest: number; }`
  - `export interface LastEmiFilters { from?: string; to?: string; projectId?: string; }`
- [ ] **3.3** `npx tsc --noEmit -p tsconfig.app.json` — expect ONLY the `submitPay` error in `booking-seal.component.ts` (missing `paymentMode`); that is fixed in Task 6. Commit after Task 6 so every commit compiles (or commit models together with Task 6).

## Task 4: Service — `list()` filters, `pay()`, new methods

**Files:** `bookings-emi.service.ts`, `bookings-emi.service.spec.ts`.

- [ ] **4.1 Add RED specs** to `bookings-emi.service.spec.ts` (names exact):
  - `lists with the new date and search filters when set` — `bookedFrom, bookedTo, cancelledFrom, cancelledTo, q` appear as params with the given values.
  - `omits the new filters when blank` — update nothing in the two existing list specs (they use the old literal shape; optional fields keep them valid), add assertions in a new spec that `bookedFrom`, `bookedTo`, `cancelledFrom`, `cancelledTo`, `q` are absent when `''`/undefined.
  - `pays with paymentMode in the PATCH body` — body `{amount:100, paymentRef:'R1', paymentMode:'UPI'}`. **Update** the two existing pay specs to include `paymentMode: 'CASH'` in both the request and expected body (TypeScript now requires it).
  - `confirmPayment POSTs an empty body to the single-confirm URL` — `/api/admin/bookings/b1/installments/3/confirm` (path per contract check above).
  - `confirmPayments POSTs {items} to /api/admin/payments/confirm and returns the array` — flush two bookings, assert result length and that the service does not reorder.
  - `payments sends status, paging and only the set filters` — `s.payments('ENTERED', {from:'2026-10-01', to:'', projectId:'p1'}, 1, 50)`: params `status=ENTERED, page=1, size=50, from, projectId`; `to` absent. Second call with `'PAID'`.
  - `lastEmi sends only the set filters and returns an array` — GET `/api/admin/emi-reports/last-emi`, no params when `{}`.
- [ ] **4.2 Run** `--include=src/app/admin/admin-bookings-emi/bookings-emi.service.spec.ts` -> red.
- [ ] **4.3 Implement** in `bookings-emi.service.ts`:
  - `list()`: add `if (f.bookedFrom) ...`, etc. for the five new fields (same style as existing).
  - `pay()` unchanged shape (PayRequest now carries `paymentMode`).
  - `confirmPayment(id: string, n: number): Observable<Booking>` -> `this.http.post<Booking>(\`/api/admin/bookings/${id}/installments/${n}/confirm\`, {})`.
  - `confirmPayments(items: PaymentRef[]): Observable<Booking[]>` -> `post<Booking[]>('/api/admin/payments/confirm', { items })`. Add a one-line comment: response is ordered by bookingId, callers must key by id.
  - `payments(status: 'ENTERED' | 'PAID', f: PaymentFilters, page: number, size: number): Observable<PaymentPage>`.
  - `lastEmi(f: LastEmiFilters): Observable<LastEmiRow[]>`.
- [ ] **4.4 Run the spec** -> green (it will not compile alone if `submitPay` still errors — implement Task 6 step 6.2 first if needed, or run Tasks 4-6 compile-fix before the first green; order the commits accordingly).

## Task 5: i18n keys (en.json + hi.json)

**Files:** `src/assets/i18n/en.json`, `src/assets/i18n/hi.json`.

Add inside `admin.bookingsEmi` (merge into the existing objects, do not replace; keep JSON valid):
- `tab`: `unconfirmed` "Unconfirmed", `confirmed` "Confirmed", `cancelled` "Cancelled", `lastEmi` "EMI by last date" (keep `register`, `overdue`).
- `installment.ENTERED`: "Entered" (also fix the hi.json copy of `installment`).
- New object `paymentMode`: `CASH` "Cash", `CHEQUE` "Cheque", `UPI` "UPI", `BANK_TRANSFER` "Bank transfer", `OTHER` "Other"; plus `label` "Payment mode".
- `col` additions: `mobile` "Mobile", `area` "Area", `rate` "Rate", `discount` "Discount", `listPrice` "List price", `bookedOn` "Booked on", `cancelledOn` "Cancelled on", `associateId` "Associate ID", `project` "Project", `paymentDate` "Payment date", `mode` "Mode", `reference` "Reference", `entryBy` "Entry by", `confirmBy` "Confirm by", `confirmDate` "Confirm date", `lastDueDate` "Last EMI date", `rest` "Rest", `select` "Select".
- `filter` additions: `bookedFrom` "Booked from", `bookedTo` "Booked to", `cancelledFrom` "Cancelled from", `cancelledTo` "Cancelled to", `from` "From", `to` "To", `search` "Search", `searchPlaceholder` "Associate ID or plot no".
- `action` additions: `enterPayment` "Enter payment", `confirmPayment` "Confirm", `confirmSelected` "Confirm selected", `checkAll` "Check all", `uncheckAll` "Uncheck all", `exportCsv` "Export CSV", `print` "Print".
- `status`: leave `ACTIVE/CONFIRMED/CANCELLED`.
- `total`: top-level key under `bookingsEmi` named `totalRow` "Total" and `pendingTotal` "Pending confirmation".
- `shared.pager` already added in Task 1.

- [ ] **5.1 Edit both files.** Hindi file: same English strings under the same keys (existing practice in this file for `bookingsEmi`).
- [ ] **5.2 Verify** (JSON valid + key parity for what was added):
```
python3 - <<'PY'
import json
en=json.load(open('src/assets/i18n/en.json')); hi=json.load(open('src/assets/i18n/hi.json'))
def keys(d,p=''):
    for k,v in d.items():
        if isinstance(v,dict): yield from keys(v,p+k+'.')
        else: yield p+k
e=set(keys(en['admin']['bookingsEmi'])); h=set(keys(hi['admin']['bookingsEmi']))
print('missing in hi:',sorted(e-h)); print('missing in en:',sorted(h-e))
assert en['admin']['bookingsEmi']['installment']['ENTERED'] and hi['admin']['bookingsEmi']['installment']['ENTERED']
assert set(keys(en['shared']))==set(keys(hi['shared']))
PY
```
Expect both "missing" lists empty (if pre-existing drift exists, only the keys added by this task must be absent from the lists; report pre-existing drift, do not fix).
- [ ] **5.3** Commit `feat(fe): i18n keys for payments, filters, ENTERED`.

## Task 6: Keep booking-seal green (Decision 3)

**Files:** `booking-seal.component.ts` (one line), `booking-seal.component.spec.ts`.

- [ ] **6.1 Spec first (RED/adapt).**
  - In `pay sends amount from the instalment, trimmed ref, and ISO paidAt when given`, add `expect(req.request.body.paymentMode).toBe('CASH');`.
  - Replace the body of `success emits the updated booking and an auto-confirm flash when status flips to CONFIRMED` (rename to `success emits the updated booking and the plain payment flash; pay only enters the payment`): flush `bk({ paidAmount: 250, installments: [inst(1,{status:'PAID',paidAt:'2026-02-05T00:00:00Z'}), inst(2,{status:'ENTERED',paidAt:'2026-03-02T00:00:00Z',paymentMode:'CASH'}), inst(3), inst(4,{status:'VOID'})] })`; assert `updates.length` 1, flash key `admin.bookingsEmi.ok.pay`, `c().mode` `'detail'`. Do not touch any other spec.
  - Add spec `renders an ENTERED instalment with its status label and no Pay button`: booking with inst 2 `ENTERED`; assert the row text contains `admin.bookingsEmi.installment.ENTERED` and `.booking-seal__pay` count is 1 (only inst 3 PENDING; inst 2 overdue false here).
  - Run `--include=src/app/admin/admin-bookings-emi/booking-seal.component.spec.ts` -> the pay-body spec fails (RED).
- [ ] **6.2 Implement:** in `submitPay()` change `const req: PayRequest = { amount: target.amount, paymentRef: ref };` to include `paymentMode: 'CASH'` with the comment `// ponytail: U6 replaces this default with the payment-mode select`.
- [ ] **6.3 Run** the seal spec -> green; then also run `bookings-emi.component.spec.ts` and `booking-register.component.spec.ts` (touched types) -> green.
- [ ] **6.4 Commit** (with Tasks 3-4 changes if not yet committed): `feat(fe): models + service for two-step payments`.

## Task 7: Full verification

- [ ] **7.1** `npx ng test --watch=false --browsers=ChromeHeadless` -> all green (record counts; baseline is whatever master gives, expect zero failures — frontend has no known spurious failures).
- [ ] **7.2** `npx ng build` -> succeeds with no new budget warnings (check output for `_admin`/styles budget; the pager SCSS is component-level and small). If a budget warning appears that master does not have, move the pager styles to be leaner; never grow `_admin.scss`.
- [ ] **7.3** `git status` -> only files listed in the File map changed. Do not touch tracking files.
- [ ] **7.4** Report: commits, test counts, build result, the contract-path check from Backend contract (single-confirm URL), and any pre-existing i18n drift.

## Out of scope (belongs to later units)
Payment-mode select, Enter/Confirm button split and dead auto-confirm cleanup (U6); all new tab components, register columns, receipt (U6); plots table/discount form (U7); associate defects and `plotBookings.*`/`salesHistory.*` keys (U7/U8); Add-EMI reschedule (U4).
