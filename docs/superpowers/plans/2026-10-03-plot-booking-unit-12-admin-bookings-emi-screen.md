# Plot Booking Unit 12: Admin "Bookings & EMI" Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Admin `/settings/bookings-emi`: a filterable, paged booking register with a sticky detail "seal" (instalment table, paid-vs-threshold meter) from which they can Pay an instalment, Confirm, Cancel or Transfer an `ACTIVE` booking, plus an Overdue-report tab whose rows open the booking in the register.

**Architecture:** `BookingsEmiComponent` is a thin host (header, confirm-rule pill, flash banner, tabs). `BookingRegisterComponent` owns filters, the paged list, selection and the post-action refresh. `BookingSealComponent` renders the selected booking and the four action forms and calls the write endpoints through `BookingsEmiService`, emitting the updated `BookingResponse`. `OverdueReportComponent` is a separate paged table. Pure logic (error classification, auto-confirm prediction, label fallbacks) lives in `bookings-emi.util.ts` so it is unit-testable without a DOM.

**Tech Stack:** Angular 18 standalone components, `@ngx-translate/core`, `HttpClient`, `FormsModule`, Karma + Jasmine with `HttpClientTestingModule`, SCSS in `frontend/src/styles/_admin.scss`. No new libraries.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` — "Screens" → Admin "Bookings & EMI", Flows (Record payment, Confirm, Cancel, Transfer), Error handling, Decision 12. Design: `docs/design/admin_operational_screens/bookings_emi/DESIGN.md` (read fully first; all `screen-*.png` are the visual reference). Row 12 of `docs/superpowers/plans/2026-10-01-plot-booking-units.md`.

## Prerequisites (hard)

- Backend units 1, 2, 4, 5, 6, 7, 8, 9 merged (verified: `BookingController` POST/PATCH, `AdminBookingRegisterController`, `AdminEmiReportController`).
- **Unit 11 merged** (build order 11 → 13 → 12). This plan consumes: nav category `inventory` already in `admin-nav-categories.model.ts` (adds one item), `formatInr` from `shared/utils/plot-grid.util.ts`, `PlotGridItem`, the `--status-success-text`/`--status-warning-text` tokens, and the existing `nav.categories.inventory` i18n key. Unit 11's success banner already links to `/settings/bookings-emi?booking=<id>` — Task 8 here makes that link work.
- **Unit 14 gates Task 8 only** (overdue click-through needs `GET /api/admin/bookings/{id}`). Tasks 1–7 are independent of it and ship the whole screen except that click-through; Task 8 must not be started until unit 14 is merged. `plotNo`/`projectName`/`associateName` are optional in the model and fall back as the design specifies, so unit 14 needs no change here for those.

## Global Constraints

- Frontend only; zero backend changes. Route lives under the existing `settings` parent (`[authGuard, adminGuard, launchedModeGuard]`); no new guard.
- Endpoints (exact):
  - register `GET /api/admin/bookings?status&associateId&plotId&projectId&overdue&page&size` → `{bookings, page, size, totalElements}`, newest `bookedAt` first; `size` 20.
  - overdue `GET /api/admin/emi-reports/overdue?page&size` → `{rows, page, size, totalElements}` rows `{bookingId, plotId, plotNo, associateId, associateName, buyerName, overdueCount, overdueAmount, oldestDueDate}`, oldest due first.
  - pay `PATCH /api/admin/bookings/{id}/installments/{n}/pay` body `{amount, paymentRef (≤100, required), paidAt?: ISO instant}`.
  - confirm `POST /api/admin/bookings/{id}/confirm` (no body); cancel `POST …/cancel` `{reason (≤255, required)}`; transfer `POST …/transfer` `{associateId}`. All four return the full updated `BookingResponse`.
  - config `GET /api/company/booking-emi` → `{emiEnabled, defaultInstallmentCount, confirmRule: 'MANUAL'|'AUTO_THRESHOLD', confirmThresholdPercent, updatedAt}`.
  - Errors are `{ "error": "<text>" }` with 400/404/409 as in DESIGN "Error mapping".
- `BookingResponse`: `{id, plotId, associateId, status, buyerName, totalAmount, installmentCount, bookedAt, paidAmount, dueAmount, installments: [{installmentNumber, amount, dueDate, status, paidAt, overdue}]}`; optional unit-14 fields `plotNo?`, `projectName?`, `associateName?`. Reuse `Booking`/`EmiInstallment`/`BookingStatus` from `plot-bookings/models/associate-booking-page.model.ts` (extended in unit 13 with the optional fields). If unit 13 is not merged, add those two optionals there yourself.
- Reuse: `AdminService.listAssociates()`, `ProjectsService.listProjects()`, `ProjectsPlotsService.getGrid()` (unit 11, for the plot filter), `app-associate-lookup`, `app-inline-banner`, `app-tab-bar`, `app-field-error`, `.brand-button`, `formatInr`.
- Overdue is server-derived: never recompute it client-side; show the word "Overdue" with no day count. Dates always show the year (`mediumDate`).
- Actions only render enabled for `ACTIVE`; for other statuses buttons stay visible, disabled, with a visible `aria-describedby` reason (text, not tooltip). No Pay buttons on non-ACTIVE bookings.
- Write requests are owned by the seal; while one is in flight all other controls and row selection are locked and the submit button is disabled (double-submit impossible).
- i18n: `en.json` gets `admin.bookingsEmi.*` and `settings.sections.bookingsEmi`; `hi.json` gets the nav key translated and the screen block copied in English.
- No e2e.

## Deviations from DESIGN.md (decided here; veto at plan review)

1. **Live theme tokens, not violet/cyan** — same call as units 11/13. Meter, pills, chips use `--status-*`, `--brand-*`, `--surface-*`; derived readable text uses the `-text` tokens unit 11 defines, plus a new `--status-danger-text` defined here.
2. **Sidebar group is `inventory`, icon `domain`** (unit 11's decision) — not `inventory-bookings`/`real_estate_agent`. This unit only appends the item.
3. **Plot filter = a `<select>` populated from the chosen project's grid** (disabled until a project is chosen), not a free-text plot number. Needs no backend lookup and sends `plotId`.
4. **Associate name shown via directory lookup** (`AdminService.listAssociates()` → `userId` + `name`) until unit 14's `associateName` exists; the lookup is keyed on `associateId`, falling back to `id.slice(0,8)`.
5. **Plot-drift recovery links** go to `/settings/projects-plots` and `/settings/compensation` only (no deep link to a plot or to the Booking & EMI settings anchor — neither exists). Detection is the 409 text match the design accepts.
6. **Transfer-error status parsing** ("Suresh's account is Pending"): the 400 text is shown as the raw server message under the lookup with friendly lead copy; no regex status extraction (brittle, low value).
7. **No `datetime-local` "Received on" timezone gymnastics:** the input value is interpreted in the browser's local zone and sent via `new Date(value).toISOString()`; blank omits `paidAt`.
8. **Focus management is limited** to moving focus to the seal title when a form opens and back to the opener when it closes; no focus trap.

## Review Focus

1. **Pay crossing the auto-confirm threshold**: warning shown before submit; on success the banner says auto-confirmed when status flipped ACTIVE→CONFIRMED; on 409 plot-drift the payment is clearly stated as NOT recorded. (Tasks 2, 5.)
2. **Network error on Pay** (no response): must NOT offer a blind retry — show reload-to-check and hide submit until reloaded. (Task 5.)
3. **Double submit** on any of the four writes. (Task 5.)
4. **Stale selection race**: a slow detail/list response for booking A must not overwrite the seal after the admin selected B. (Task 4.)
5. **Booking leaves the filtered list after an action** (transfer under an associate filter; cancel under overdue-only): stays selected with the "no longer matches" note, not a vanished seal. (Task 4.)
6. **Non-ACTIVE booking**: no Pay buttons, three actions disabled with visible reason. (Task 5.)
7. **Cancelled booking money display**: Paid retained, Due "—" (never "₹0 due"). (Task 3.)
8. **Zero total / paid > total / threshold missing** must not break the meter. (Task 2.)

---

## File Structure

Create under `frontend/src/app/admin/bookings-emi/`:

| File | Responsibility |
|---|---|
| `bookings-emi.model.ts` | `BookingEmiConfig`, `BookingPage`, `OverdueRow`, `OverdueReportPage`, `RegisterFilters`, request types. |
| `bookings-emi.service.ts` + `.spec.ts` | 8 HTTP methods (list, get, pay, confirm, cancel, transfer, overdue, config). |
| `bookings-emi.util.ts` + `.spec.ts` | `meterPercent`, `willAutoConfirm`, `classifyError`, `associateLabel`, `plotText`, `buyerOverdueCount`. |
| `booking-seal.component.ts` + `.spec.ts` | Detail view + Pay/Confirm/Cancel/Transfer forms. |
| `booking-register.component.ts` + `.spec.ts` | Filters, table, pager, selection, refresh. |
| `overdue-report.component.ts` + `.spec.ts` | Overdue table + pager + empty state. |
| `bookings-emi.component.ts` + `.spec.ts` | Host: header, rule pill, flash, tabs. |

Modify: `admin-nav-categories.model.ts` + `.spec.ts`, `app.routes.ts` + `app.routes.spec.ts`, `assets/i18n/en.json` + `hi.json`, `styles/_admin.scss` (append), `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (coordinator).

Commands from `frontend/`: single spec `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/admin/bookings-emi/<file>.spec.ts'`; folder `--include='src/app/admin/bookings-emi/**/*.spec.ts'`; build `npx ng build`.

---

### Task 1: Model and service

**Files:** Create `bookings-emi.model.ts`, `bookings-emi.service.ts`, `bookings-emi.service.spec.ts`.

**Interfaces — Produces:**
`BookingsEmiService.list(f: RegisterFilters, page, size): Observable<BookingPage>`; `.get(id): Observable<Booking>`; `.pay(id, n, req: PayRequest): Observable<Booking>`; `.confirm(id)`; `.cancel(id, reason)`; `.transfer(id, associateId)` (all `Observable<Booking>`); `.overdue(page, size): Observable<OverdueReportPage>`; `.config(): Observable<BookingEmiConfig>`.

- [ ] **Step 1: Failing test**

```ts
// bookings-emi.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BookingsEmiService } from './bookings-emi.service';

describe('BookingsEmiService', () => {
  let s: BookingsEmiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    s = TestBed.inject(BookingsEmiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists with only the set filters plus paging', () => {
    s.list({ status: 'ACTIVE', associateId: '', plotId: '', projectId: 'p1', overdue: true }, 2, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/bookings');
    expect(r.request.params.get('status')).toBe('ACTIVE');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('overdue')).toBe('true');
    expect(r.request.params.get('page')).toBe('2');
    expect(r.request.params.get('size')).toBe('20');
    expect(r.request.params.has('associateId')).toBeFalse();
    expect(r.request.params.has('plotId')).toBeFalse();
    r.flush({ bookings: [], page: 2, size: 20, totalElements: 0 });
  });

  it('omits overdue when false', () => {
    s.list({ status: '', associateId: '', plotId: '', projectId: '', overdue: false }, 0, 20).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/bookings');
    expect(r.request.params.has('overdue')).toBeFalse();
    r.flush({});
  });

  it('gets one booking', () => {
    s.get('b1').subscribe();
    http.expectOne('/api/admin/bookings/b1').flush({});
  });

  it('pays with PATCH and the body', () => {
    s.pay('b1', 3, { amount: 100, paymentRef: 'R1' }).subscribe();
    const r = http.expectOne('/api/admin/bookings/b1/installments/3/pay');
    expect(r.request.method).toBe('PATCH');
    expect(r.request.body).toEqual({ amount: 100, paymentRef: 'R1' });
    r.flush({});
  });

  it('confirm / cancel / transfer POST the right bodies', () => {
    s.confirm('b1').subscribe();
    expect(http.expectOne('/api/admin/bookings/b1/confirm').request.method).toBe('POST');
    s.cancel('b1', 'why').subscribe();
    expect(http.expectOne('/api/admin/bookings/b1/cancel').request.body).toEqual({ reason: 'why' });
    s.transfer('b1', 'a2').subscribe();
    expect(http.expectOne('/api/admin/bookings/b1/transfer').request.body).toEqual({ associateId: 'a2' });
    http.match(() => true).forEach(r => r.flush({}));
  });

  it('reads overdue report and config', () => {
    s.overdue(0, 1).subscribe();
    const r = http.expectOne(x => x.url === '/api/admin/emi-reports/overdue');
    expect(r.request.params.get('size')).toBe('1');
    r.flush({});
    s.config().subscribe();
    http.expectOne('/api/company/booking-emi').flush({});
  });
});
```

- [ ] **Step 2: Run → FAIL (module missing).**

- [ ] **Step 3: Implement**

```ts
// bookings-emi.model.ts
import { Booking, BookingStatus } from '../../plot-bookings/models/associate-booking-page.model';

export interface BookingEmiConfig {
  emiEnabled: boolean;
  defaultInstallmentCount: number;
  confirmRule: 'MANUAL' | 'AUTO_THRESHOLD';
  confirmThresholdPercent: number | null;
}

export interface BookingPage { bookings: Booking[]; page: number; size: number; totalElements: number; }

export interface OverdueRow {
  bookingId: string; plotId: string; plotNo: string; associateId: string; associateName: string;
  buyerName: string; overdueCount: number; overdueAmount: number; oldestDueDate: string;
}
export interface OverdueReportPage { rows: OverdueRow[]; page: number; size: number; totalElements: number; }

export interface RegisterFilters {
  status: '' | BookingStatus;
  associateId: string;
  plotId: string;
  projectId: string;
  overdue: boolean;
}

export interface PayRequest { amount: number; paymentRef: string; paidAt?: string; }
```

```ts
// bookings-emi.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingEmiConfig, BookingPage, OverdueReportPage, PayRequest, RegisterFilters } from './bookings-emi.model';

@Injectable({ providedIn: 'root' })
export class BookingsEmiService {
  private http = inject(HttpClient);

  list(f: RegisterFilters, page: number, size: number): Observable<BookingPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (f.status) { params = params.set('status', f.status); }
    if (f.associateId) { params = params.set('associateId', f.associateId); }
    if (f.plotId) { params = params.set('plotId', f.plotId); }
    if (f.projectId) { params = params.set('projectId', f.projectId); }
    if (f.overdue) { params = params.set('overdue', true); }
    return this.http.get<BookingPage>('/api/admin/bookings', { params });
  }

  get(id: string): Observable<Booking> {
    return this.http.get<Booking>(`/api/admin/bookings/${id}`);
  }

  pay(id: string, n: number, req: PayRequest): Observable<Booking> {
    return this.http.patch<Booking>(`/api/admin/bookings/${id}/installments/${n}/pay`, req);
  }

  confirm(id: string): Observable<Booking> {
    return this.http.post<Booking>(`/api/admin/bookings/${id}/confirm`, {});
  }

  cancel(id: string, reason: string): Observable<Booking> {
    return this.http.post<Booking>(`/api/admin/bookings/${id}/cancel`, { reason });
  }

  transfer(id: string, associateId: string): Observable<Booking> {
    return this.http.post<Booking>(`/api/admin/bookings/${id}/transfer`, { associateId });
  }

  overdue(page: number, size: number): Observable<OverdueReportPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<OverdueReportPage>('/api/admin/emi-reports/overdue', { params });
  }

  config(): Observable<BookingEmiConfig> {
    return this.http.get<BookingEmiConfig>('/api/company/booking-emi');
  }
}
```

Note: `get()` targets an endpoint unit 14 adds; the service method is declared now (harmless, unused until Task 8).

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(frontend): bookings-emi models and service (unit 12)`.

---

### Task 2: Pure helpers

**Files:** Create `bookings-emi.util.ts`, `bookings-emi.util.spec.ts`.

**Interfaces — Produces:**
- `meterPercent(paid, total): number` (0–100 int)
- `willAutoConfirm(b: Booking, installmentAmount: number, cfg: BookingEmiConfig | null): boolean`
- `type ErrorKind = 'amountMismatch' | 'notActive' | 'notPayable' | 'plotDrift' | 'notFound' | 'sameAssociate' | 'invalidTarget' | 'validation' | 'network' | 'generic'`
- `classifyError(err: { status: number; error?: { error?: string } }, op: 'pay'|'confirm'|'cancel'|'transfer'): { kind: ErrorKind; serverText?: string }`
- `associateLabel(b: Booking, dir: AssociateSummary[]): string` ; `plotText(b: Booking): string` (`plotNo ?? plotId.slice(0,8)`)

- [ ] **Step 1: Failing test**

```ts
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingEmiConfig } from './bookings-emi.model';
import { associateLabel, classifyError, meterPercent, plotText, willAutoConfirm } from './bookings-emi.util';

const b = (over: Partial<Booking> = {}): Booking => ({
  id: 'b', plotId: '123e4567-89ab', associateId: 'a1', status: 'ACTIVE', buyerName: 'R', totalAmount: 1000,
  installmentCount: 4, bookedAt: '2026-01-01T00:00:00Z', paidAmount: 200, dueAmount: 800, installments: [], ...over
});
const auto = (pct: number | null): BookingEmiConfig =>
  ({ emiEnabled: true, defaultInstallmentCount: 4, confirmRule: 'AUTO_THRESHOLD', confirmThresholdPercent: pct });

describe('bookings-emi.util', () => {
  it('meterPercent clamps and survives zero total', () => {
    expect(meterPercent(250, 1000)).toBe(25);
    expect(meterPercent(1, 0)).toBe(0);
    expect(meterPercent(2000, 1000)).toBe(100);
    expect(meterPercent(-1, 1000)).toBe(0);
  });

  it('predicts auto-confirm only under AUTO_THRESHOLD when paid+installment reaches the threshold', () => {
    expect(willAutoConfirm(b({ paidAmount: 200 }), 100, auto(30))).toBeTrue();   // 300/1000 = 30%
    expect(willAutoConfirm(b({ paidAmount: 200 }), 99, auto(30))).toBeFalse();
    expect(willAutoConfirm(b(), 900, { ...auto(30), confirmRule: 'MANUAL' })).toBeFalse();
    expect(willAutoConfirm(b(), 900, { ...auto(30), emiEnabled: false })).toBeFalse();
    expect(willAutoConfirm(b(), 900, auto(null))).toBeFalse();
    expect(willAutoConfirm(b(), 900, null)).toBeFalse();
    expect(willAutoConfirm(b({ totalAmount: 0 }), 10, auto(30))).toBeFalse();
  });

  it('classifies pay errors by status and text', () => {
    const e = (status: number, error?: string) => ({ status, error: error ? { error } : undefined });
    expect(classifyError(e(400, 'Payment amount must equal the installment amount 100'), 'pay').kind).toBe('amountMismatch');
    expect(classifyError(e(409, 'Booking is not ACTIVE'), 'pay').kind).toBe('notActive');
    expect(classifyError(e(409, 'Installment 4 of booking x is not payable'), 'pay').kind).toBe('notPayable');
    expect(classifyError(e(409, 'Plot is not available for booking: abc'), 'pay').kind).toBe('plotDrift');
    expect(classifyError(e(409, 'Plot is not available for booking: abc'), 'confirm').kind).toBe('plotDrift');
    expect(classifyError(e(404, 'Booking not found'), 'pay').kind).toBe('notFound');
    expect(classifyError(e(400), 'cancel').kind).toBe('validation');
    expect(classifyError(e(400, 'Booking is already assigned to associate x'), 'transfer').kind).toBe('sameAssociate');
    expect(classifyError(e(400, 'Cannot transfer booking to associate x: associate is PENDING, must be ACTIVE'), 'transfer').kind).toBe('invalidTarget');
    expect(classifyError(e(0), 'pay').kind).toBe('network');
    expect(classifyError(e(500), 'pay').kind).toBe('generic');
  });

  it('keeps the raw server text for support', () => {
    expect(classifyError({ status: 409, error: { error: 'Booking is not ACTIVE' } }, 'pay').serverText).toBe('Booking is not ACTIVE');
  });

  it('labels the associate from the directory, else short id', () => {
    const dir = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE' as const, hasFreeSlot: true }];
    expect(associateLabel(b(), dir)).toBe('Jane (VA-1)');
    expect(associateLabel(b({ associateName: 'Zed' }), dir)).toBe('Zed (VA-1)');
    expect(associateLabel(b({ associateId: 'zzzzzzzzzz' }), dir)).toBe('zzzzzzzz');
  });

  it('labels the plot', () => {
    expect(plotText(b())).toBe('123e4567');
    expect(plotText(b({ plotNo: 'A-12' }))).toBe('A-12');
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
import { AssociateSummary } from '../models/associate-summary.model';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { BookingEmiConfig } from './bookings-emi.model';

export type ErrorKind =
  | 'amountMismatch' | 'notActive' | 'notPayable' | 'plotDrift' | 'notFound'
  | 'sameAssociate' | 'invalidTarget' | 'validation' | 'network' | 'generic';

export function meterPercent(paid: number, total: number): number {
  if (!(total > 0)) { return 0; }
  return Math.min(100, Math.max(0, Math.round((paid / total) * 100)));
}

// Client-side prediction only; the server is authoritative and the refreshed booking shows the real outcome.
export function willAutoConfirm(b: Booking, installmentAmount: number, cfg: BookingEmiConfig | null): boolean {
  if (!cfg || !cfg.emiEnabled || cfg.confirmRule !== 'AUTO_THRESHOLD' || cfg.confirmThresholdPercent == null) { return false; }
  if (!(b.totalAmount > 0)) { return false; }
  return ((b.paidAmount + installmentAmount) / b.totalAmount) * 100 >= cfg.confirmThresholdPercent;
}

// ponytail: matches the server's error text -- brittle by design (DESIGN Q4); a distinct error `code`
// from the backend would replace these substring checks.
export function classifyError(
  err: { status: number; error?: { error?: string } },
  op: 'pay' | 'confirm' | 'cancel' | 'transfer'
): { kind: ErrorKind; serverText?: string } {
  const text = err.error?.error;
  const done = (kind: ErrorKind) => ({ kind, serverText: text });
  if (err.status === 0) { return done('network'); }
  if (err.status === 404) { return done('notFound'); }
  if (err.status === 409) {
    if (text?.includes('Plot is not available')) { return done('plotDrift'); }
    if (text?.includes('not payable')) { return done('notPayable'); }
    if (text?.includes('not ACTIVE')) { return done('notActive'); }
    return done('generic');
  }
  if (err.status === 400) {
    if (op === 'pay' && text?.includes('must equal the installment amount')) { return done('amountMismatch'); }
    if (op === 'transfer' && text?.includes('already assigned')) { return done('sameAssociate'); }
    if (op === 'transfer' && text?.includes('Cannot transfer')) { return done('invalidTarget'); }
    return done('validation');
  }
  return done('generic');
}

export function associateLabel(b: Booking, dir: AssociateSummary[]): string {
  const found = dir.find(a => a.id === b.associateId);
  if (!found) { return b.associateName ?? b.associateId.slice(0, 8); }
  return `${b.associateName ?? found.name} (${found.userId})`;
}

export const plotText = (b: Booking): string => b.plotNo ?? b.plotId.slice(0, 8);
```

`Booking` needs `associateName?: string` — add it next to `plotNo?`/`projectName?` in `plot-bookings/models/associate-booking-page.model.ts` (unit 13 added the other two).

Note on the `associateLabel` spec case 3: a missing directory entry returns `b.associateName ?? id.slice(0,8)` = `zzzzzzzz`.

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(frontend): bookings-emi pure helpers — meter, auto-confirm prediction, error classification (unit 12)`.

---

### Task 3: Nav item, route, i18n, and the host shell

**Files:** Modify `admin-nav-categories.model.ts` + spec, `app.routes.ts` + spec, `en.json`, `hi.json`. Create `bookings-emi.component.ts` + spec (host), stub-free: it mounts the register and overdue components, which are created in Tasks 4/6. To keep tasks independently green, **create the host in Task 7** and in this task do only nav/route/i18n using a placeholder-free approach: register the route pointing at the host created in Task 7 is not possible earlier, so this task = nav + i18n only; the route is added in Task 7.

- [ ] **Step 1: Failing tests** — in `admin-nav-categories.model.spec.ts` change the category item expectation (unit 11 set `['projectsPlots']`) to:

```ts
      ['projectsPlots', 'bookingsEmi'],
```

and add

```ts
  it('resolvesTheBookingsEmiScreenToTheInventoryCategory', () => {
    expect(findNavCategoryForUrl('/settings/bookings-emi')?.key).toBe('inventory');
  });
```

Note: the existing "has a child route behind every nav item" routes spec will fail until Task 7 adds the route — expected; do not run `app.routes.spec.ts` before Task 7.

- [ ] **Step 2: Run nav spec → FAIL. Step 3: Implement** — in `admin-nav-categories.model.ts` append to the `inventory` items:

```ts
      { key: 'bookingsEmi', labelKey: 'settings.sections.bookingsEmi', path: '/settings/bookings-emi' }
```

`en.json`: `settings.sections.bookingsEmi` = `"Bookings & EMI"`. `hi.json`: `"बुकिंग और ईएमआई"`. Add this block to both files as `admin.bookingsEmi` (sibling of `admin.projectsPlots`; hi copy identical English):

```json
    "bookingsEmi": {
      "eyebrow": "Inventory & Bookings",
      "title": "Bookings & EMI",
      "subtitle": "Track every plot booking, record instalments as they are collected, and chase the ones that are overdue.",
      "tab": { "register": "Register", "overdue": "Overdue report" },
      "rule": {
        "manual": "Confirm rule: Manual",
        "auto": "Confirm rule: Auto at {{percent}}%"
      },
      "filter": {
        "status": "Status", "allStatuses": "All statuses", "associate": "Associate", "anyAssociate": "Any associate",
        "project": "Project", "allProjects": "All projects", "plot": "Plot", "anyPlot": "Any plot", "plotNeedsProject": "Choose a project first",
        "overdueOnly": "Overdue only", "reset": "Reset filters"
      },
      "status": { "ACTIVE": "Active", "CONFIRMED": "Confirmed", "CANCELLED": "Cancelled" },
      "col": { "buyer": "Buyer", "associate": "Associate", "status": "Status", "total": "Total", "paid": "Paid", "due": "Due",
               "overdue": "Overdue", "amountOverdue": "Amount overdue", "oldestDue": "Oldest due", "plot": "Plot",
               "no": "#", "dueDate": "Due", "amount": "Amount", "installmentStatus": "Status" },
      "overduePill": "{{count}} overdue",
      "overdueBadge": "Overdue",
      "installment": { "PENDING": "Pending", "PAID": "Paid", "VOID": "Void" },
      "seal": {
        "detail": "Booking detail", "pay": "Record payment", "confirm": "Confirm booking", "cancel": "Cancel booking", "transfer": "Transfer booking",
        "none": "Select a booking to see its instalments and take action.",
        "booked": "Booked", "plan": "Plan", "planValue": "{{count}} × {{amount}}",
        "meter": "Paid {{pct}}% of {{threshold}}% needed to auto-confirm", "meterPlain": "Paid {{pct}}%",
        "filterMismatch": "This booking no longer matches the current filters"
      },
      "action": {
        "pay": "Pay", "payBtn": "Record {{amount}}", "confirm": "Confirm", "transfer": "Transfer", "cancel": "Cancel",
        "cancelBtn": "Cancel booking", "keep": "Keep booking", "back": "Back", "confirmBtn": "Confirm booking", "transferBtn": "Transfer booking",
        "recording": "Recording…", "confirming": "Confirming…", "cancelling": "Cancelling…", "transferring": "Transferring…", "reload": "Reload booking"
      },
      "field": {
        "amount": "Amount received", "amountHint": "Fixed to the instalment amount. Part payments aren't supported.",
        "ref": "Payment reference", "refCount": "{{n}}/100", "receivedOn": "Received on (optional)",
        "reason": "Reason", "reasonCount": "{{n}}/255", "target": "Transfer to"
      },
      "validation": {
        "ref": "Enter a payment reference.", "refMax": "Keep the reference to 100 characters.",
        "reason": "Enter a reason for cancelling.", "reasonMax": "Keep the reason to 255 characters.", "target": "Choose an associate."
      },
      "warn": { "autoConfirm": "This payment will confirm the booking.", "autoConfirmDetail": "Paid goes from {{before}} to {{after}}. If confirming fails, the payment is rolled back." },
      "confirmEffects": ["Sale amount equals the booking total.", "The plot moves from Booked to Sold and the sale credits the associate's ledger.", "Remaining instalments stay pending. To undo, void the sale in the Sales Register."],
      "cancelEffects": ["{{count}} pending instalments will be voided.", "Amounts already paid stay on record; no refund is handled here.", "The plot becomes Available unless another live booking holds it."],
      "transferHint": "Only active associates can receive a booking. Buyer, plan and paid instalments move with it.",
      "locked": {
        "active": "Actions are only available while a booking is Active. To reverse a confirmed booking, void its sale in the Sales Register.",
        "cancelled": "This booking was cancelled. Cancelled bookings can't be changed."
      },
      "ok": {
        "pay": "Payment recorded. Instalment {{n}} of {{buyer}}'s booking is paid, {{amount}} received.",
        "autoConfirm": "Booking auto-confirmed. Paying instalment {{n}} took {{buyer}} to {{pct}}% paid. The plot is now Sold and the sale is in the Sales Register.",
        "confirm": "Booking confirmed for {{buyer}}.",
        "cancel": "Booking cancelled for {{buyer}}.",
        "transfer": "Booking transferred to {{associate}}."
      },
      "err": {
        "amountMismatch": "The amount must be exactly {{amount}}, the instalment amount. Reload the booking in case the plan changed.",
        "notFound": "This booking or instalment no longer exists.",
        "notActive": "This booking is no longer Active. It was confirmed or cancelled in the meantime.",
        "notPayable": "Instalment {{n}} is already paid or voided. Reload to see its current status.",
        "plotDriftPay": "Payment not recorded. The plot is no longer marked Booked. This payment would take the booking past the auto-confirm threshold, and confirming needs the plot to be Booked. Nothing was saved: instalment {{n}} is still pending.",
        "plotDriftConfirm": "The booking wasn't confirmed. The plot is no longer marked Booked, and confirming needs it to be Booked.",
        "plotDriftFix": "To fix it, set the plot back to Booked in Projects & Plots, or switch the confirm rule to Manual in Settings, then try again.",
        "sameAssociate": "Choose a different associate. This booking already belongs to that associate.",
        "invalidTarget": "Only active associates can receive a booking.",
        "payNetwork": "We couldn't confirm whether the payment was recorded. Reload to check whether instalment {{n}} was recorded before you try again.",
        "generic": "Something went wrong and nothing was saved. Check your connection and try again.",
        "serverSaid": "Server said: {{text}}",
        "load": "The booking register didn't load. Check your connection and try again.",
        "retry": "Try again"
      },
      "empty": {
        "noBookingsTitle": "No bookings yet", "noBookingsBody": "When an associate books a plot it appears here, with its instalment plan.",
        "goToPlots": "Go to Projects & Plots",
        "noMatchTitle": "No bookings match these filters.",
        "overdueTitle": "Nothing overdue", "overdueBody": "Every active booking is paid up to date. This list fills in on its own when an instalment passes its due date."
      },
      "linkProjectsPlots": "Projects & Plots",
      "linkSettings": "Settings",
      "pager": "Page {{page}} of {{totalPages}} · {{count}} bookings",
      "previous": "Previous", "next": "Next", "loading": "Loading"
    }
```

Validate JSON (`node -e "…JSON.parse…"` for both files).

- [ ] **Step 4: Run nav spec → PASS. Step 5: Commit** `feat(frontend): Bookings & EMI nav item and copy (unit 12)`.

---

### Task 4: `BookingRegisterComponent` (filters, table, pager, selection) with seal placeholder-free wiring

The register embeds `<app-booking-seal>`, built in Task 5. To keep each task green, this task builds the register **without** the seal element and exposes `selected: Booking | null`, `onBookingChanged(updated: Booking)`; Task 5 adds the seal to the template.

**Files:** Create `booking-register.component.ts`, `.spec.ts`; append styles.

**Interfaces:**
- Consumes: `BookingsEmiService.list/get`, `AdminService.listAssociates`, `ProjectsService.listProjects`, `ProjectsPlotsService.getGrid`, helpers (Task 2), `formatInr`.
- Produces: `<app-booking-register [config]="BookingEmiConfig | null" [focusBookingId]="string | null" (changed)="void" (flash)="FlashMessage">` with public `selected`, `page`, `filters`, `directory`, `selectBooking(b)`, `onBookingChanged(updated)`, `reload()`, `applyFilter(partial)`, `resetFilters()`. `FlashMessage = { key: string; params?: Record<string, unknown> }` — export it from `bookings-emi.model.ts` (add it there in this task).

- [ ] **Step 1: Failing spec**

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BookingRegisterComponent } from './booking-register.component';

describe('BookingRegisterComponent', () => {
  let fixture: ComponentFixture<BookingRegisterComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const inst = (n: number, over: Record<string, unknown> = {}) =>
    ({ installmentNumber: n, amount: 250, dueDate: '2026-03-01', status: 'PENDING', paidAt: null, overdue: false, ...over });
  const bk = (id: string, over: Record<string, unknown> = {}) => ({
    id, plotId: 'plot-' + id + '-xxxxxxxx', associateId: 'a1', status: 'ACTIVE', buyerName: 'Buyer ' + id, totalAmount: 1000,
    installmentCount: 4, bookedAt: '2026-02-01T00:00:00Z', paidAmount: 250, dueAmount: 750,
    installments: [inst(1, { status: 'PAID' }), inst(2, { overdue: true }), inst(3), inst(4)], ...over
  });
  const pageOf = (bookings: unknown[], total = bookings.length, page = 0) => ({ bookings, page, size: 20, totalElements: total });
  const directory = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }];
  const listReq = () => http.expectOne(r => r.url === '/api/admin/bookings');

  function boot(bookings: unknown[] = [bk('b1'), bk('b2')], total?: number) {
    http.expectOne('/api/associates').flush(directory);
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Green', location: 'X' }]);
    listReq().flush(pageOf(bookings, total));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookingRegisterComponent, HttpClientTestingModule, TranslateModule.forRoot()], providers: [provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(BookingRegisterComponent);
    fixture.componentRef.setInput('config', null);
    fixture.componentRef.setInput('focusBookingId', null);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders a row per booking with directory-resolved associate and overdue pill', () => {
    boot();
    const rows = el().querySelectorAll('tbody tr.booking-register__row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Jane (VA-1)');
    expect(rows[0].textContent).toContain('admin.bookingsEmi.overduePill');
  });

  it('changing a filter reloads page 0 with it', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'CONFIRMED' });
    const r = listReq();
    expect(r.request.params.get('status')).toBe('CONFIRMED');
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('plot filter is disabled until a project is chosen, then lists that project grid', () => {
    boot();
    expect(el().querySelector<HTMLSelectElement>('.booking-register__plot')!.disabled).toBeTrue();
    fixture.componentInstance.applyFilter({ projectId: 'p1' });
    listReq().flush(pageOf([]));
    http.expectOne('/api/projects/p1/plots/grid').flush([{ plotId: 'x', plotNo: 'A-1', type: 'NORMAL', area: 1, price: 1, status: 'BOOKED' }]);
    fixture.detectChanges();
    expect(el().querySelector<HTMLSelectElement>('.booking-register__plot')!.disabled).toBeFalse();
  });

  it('changing project clears the plot filter', () => {
    boot();
    fixture.componentInstance.applyFilter({ projectId: 'p1' });
    listReq().flush(pageOf([]));
    http.expectOne('/api/projects/p1/plots/grid').flush([]);
    fixture.componentInstance.applyFilter({ plotId: 'x' });
    listReq().flush(pageOf([]));
    fixture.componentInstance.applyFilter({ projectId: '' });
    listReq().flush(pageOf([]));
    expect(fixture.componentInstance.filters.plotId).toBe('');
  });

  it('shows empty-with-filters copy and Reset restores the full list', () => {
    boot();
    fixture.componentInstance.applyFilter({ status: 'CANCELLED' });
    listReq().flush(pageOf([]));
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.empty.noMatchTitle');
    fixture.componentInstance.resetFilters();
    expect(listReq().request.params.has('status')).toBeFalse();
  });

  it('shows the first-run empty state when there are no bookings and no filters', () => {
    boot([]);
    expect(el().textContent).toContain('admin.bookingsEmi.empty.noBookingsTitle');
  });

  it('shows an error banner with Try again when the list fails', () => {
    http.expectOne('/api/associates').flush(directory);
    http.expectOne('/api/company/projects').flush([]);
    listReq().flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.load');
    el().querySelector<HTMLButtonElement>('.booking-register__retry')!.click();
    listReq().flush(pageOf([]));
  });

  it('selects a row on click and on Enter', () => {
    boot();
    const rows = el().querySelectorAll<HTMLElement>('tbody tr.booking-register__row');
    rows[1].click();
    expect(fixture.componentInstance.selected!.id).toBe('b2');
    rows[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(fixture.componentInstance.selected!.id).toBe('b1');
  });

  it('onBookingChanged patches the row in place, keeps the selection, then refetches the page', () => {
    boot();
    fixture.componentInstance.selectBooking(fixture.componentInstance.page!.bookings[0]);
    fixture.componentInstance.onBookingChanged(bk('b1', { paidAmount: 500 }) as never);
    expect(fixture.componentInstance.page!.bookings[0].paidAmount).toBe(500);
    expect(fixture.componentInstance.selected!.paidAmount).toBe(500);
    listReq().flush(pageOf([bk('b1', { paidAmount: 500 }), bk('b2')]));
    expect(fixture.componentInstance.selected!.id).toBe('b1');
  });

  it('keeps a booking selected with the mismatch note when a refetch drops it from the page', () => {
    boot();
    fixture.componentInstance.selectBooking(fixture.componentInstance.page!.bookings[0]);
    fixture.componentInstance.onBookingChanged(bk('b1', { associateId: 'a9' }) as never);
    listReq().flush(pageOf([bk('b2')]));
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.id).toBe('b1');
    expect(fixture.componentInstance.filterMismatch).toBeTrue();
  });

  it('ignores a stale list response that arrives after a newer one', () => {
    boot();
    fixture.componentInstance.reload();
    const slow = listReq();
    fixture.componentInstance.applyFilter({ status: 'ACTIVE' });
    const fast = listReq();
    fast.flush(pageOf([bk('new')]));
    slow.flush(pageOf([bk('old')]));
    expect(fixture.componentInstance.page!.bookings[0].id).toBe('new');
  });

  it('pages with Next', () => {
    boot([bk('b1')], 25);
    el().querySelector<HTMLButtonElement>('.booking-register__next')!.click();
    expect(listReq().request.params.get('page')).toBe('1');
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

Add to `bookings-emi.model.ts`: `export interface FlashMessage { key: string; params?: Record<string, unknown>; }`.

```ts
// booking-register.component.ts
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Project } from '../../setup/models/project.model';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PlotGridItem, formatInr } from '../../shared/utils/plot-grid.util';
import { ProjectsPlotsService } from '../projects-plots/projects-plots.service';
import { BookingEmiConfig, BookingPage, FlashMessage, RegisterFilters } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { associateLabel, meterPercent, plotText } from './bookings-emi.util';

const PAGE_SIZE = 20;
const NO_FILTERS: RegisterFilters = { status: '', associateId: '', plotId: '', projectId: '', overdue: false };

@Component({
  selector: 'app-booking-register',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, AssociateLookupComponent, InlineBannerComponent],
  template: `
    <div class="booking-register">
      <div class="booking-register__filters">
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.status' | translate }}
          <select [disabled]="locked" (change)="applyFilter({ status: $any($event.target).value })">
            <option value="" [selected]="!filters.status">{{ 'admin.bookingsEmi.filter.allStatuses' | translate }}</option>
            <option *ngFor="let s of statuses" [value]="s" [selected]="filters.status === s">{{ 'admin.bookingsEmi.status.' + s | translate }}</option>
          </select>
        </label>
        <div class="booking-register__field">{{ 'admin.bookingsEmi.filter.associate' | translate }}
          <app-associate-lookup [associates]="directory" [value]="filters.associateId"
            [placeholder]="'admin.bookingsEmi.filter.anyAssociate' | translate"
            (selected)="applyFilter({ associateId: $event?.id ?? '' })"></app-associate-lookup>
        </div>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.project' | translate }}
          <select [disabled]="locked" (change)="applyFilter({ projectId: $any($event.target).value })">
            <option value="" [selected]="!filters.projectId">{{ 'admin.bookingsEmi.filter.allProjects' | translate }}</option>
            <option *ngFor="let p of projects" [value]="p.id" [selected]="filters.projectId === p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.plot' | translate }}
          <select class="booking-register__plot" [disabled]="locked || !filters.projectId" (change)="applyFilter({ plotId: $any($event.target).value })">
            <option value="" [selected]="!filters.plotId">{{ (filters.projectId ? 'admin.bookingsEmi.filter.anyPlot' : 'admin.bookingsEmi.filter.plotNeedsProject') | translate }}</option>
            <option *ngFor="let g of plotOptions" [value]="g.plotId" [selected]="filters.plotId === g.plotId">{{ g.plotNo }}</option>
          </select>
        </label>
        <button type="button" class="booking-register__toggle" [class.booking-register__toggle--on]="filters.overdue"
          [attr.aria-pressed]="filters.overdue" [disabled]="locked" (click)="applyFilter({ overdue: !filters.overdue })">
          {{ 'admin.bookingsEmi.filter.overdueOnly' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="locked" (click)="resetFilters()">{{ 'admin.bookingsEmi.filter.reset' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.load' | translate }}
        <button type="button" class="booking-register__retry" (click)="reload()">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="booking-register__grid">
        <div class="booking-register__list" [attr.aria-busy]="loading">
          <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
            <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
            <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3,4,5,6]"></span>
          </div>

          <div class="booking-register__empty" *ngIf="page && !page.bookings.length">
            <ng-container *ngIf="hasFilters; else firstRun">
              <h2>{{ 'admin.bookingsEmi.empty.noMatchTitle' | translate }}</h2>
              <button type="button" class="brand-button brand-button--secondary" (click)="resetFilters()">{{ 'admin.bookingsEmi.filter.reset' | translate }}</button>
            </ng-container>
            <ng-template #firstRun>
              <h2>{{ 'admin.bookingsEmi.empty.noBookingsTitle' | translate }}</h2>
              <p>{{ 'admin.bookingsEmi.empty.noBookingsBody' | translate }}</p>
              <a class="brand-button" routerLink="/settings/projects-plots">{{ 'admin.bookingsEmi.empty.goToPlots' | translate }}</a>
            </ng-template>
          </div>

          <table class="booking-register__table" *ngIf="page?.bookings?.length" [attr.aria-label]="'admin.bookingsEmi.title' | translate">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.bookingsEmi.col.buyer' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.associate' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.status' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.total' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.paid' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.due' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page!.bookings" class="booking-register__row" tabindex="0"
                [class.booking-register__row--selected]="b.id === selected?.id" [attr.aria-selected]="b.id === selected?.id"
                (click)="selectBooking(b)" (keydown.enter)="selectBooking(b)" (keydown.space)="selectBooking(b); $event.preventDefault()">
                <td [attr.data-label]="'admin.bookingsEmi.col.buyer' | translate">
                  <strong>{{ b.buyerName }}</strong><br /><span class="booking-register__sub">{{ plot(b) }}<ng-container *ngIf="b.projectName"> · {{ b.projectName }}</ng-container></span>
                </td>
                <td [attr.data-label]="'admin.bookingsEmi.col.associate' | translate">{{ assoc(b) }}</td>
                <td [attr.data-label]="'admin.bookingsEmi.col.status' | translate">
                  <span class="booking-register__chip booking-register__chip--{{ b.status | lowercase }}">{{ 'admin.bookingsEmi.status.' + b.status | translate }}</span>
                  <span class="booking-register__pill" *ngIf="overdueIn(b) as n">{{ 'admin.bookingsEmi.overduePill' | translate: { count: n } }}</span>
                </td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.total' | translate">{{ money(b.totalAmount) }}</td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.paid' | translate">
                  {{ money(b.paidAmount) }}
                  <span class="booking-register__meter" role="img" [attr.aria-label]="pct(b) + '%'"><span [style.width.%]="pct(b)"></span></span>
                </td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.due' | translate">{{ b.status === 'CANCELLED' ? '—' : money(b.dueAmount) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="booking-register__pager" *ngIf="page?.bookings?.length">
            <button type="button" class="brand-button brand-button--secondary booking-register__prev" [disabled]="locked || page!.page === 0" (click)="goTo(page!.page - 1)">{{ 'admin.bookingsEmi.previous' | translate }}</button>
            <span>{{ 'admin.bookingsEmi.pager' | translate: { page: page!.page + 1, totalPages: totalPages, count: page!.totalElements } }}</span>
            <button type="button" class="brand-button brand-button--secondary booking-register__next" [disabled]="locked || page!.page + 1 >= totalPages" (click)="goTo(page!.page + 1)">{{ 'admin.bookingsEmi.next' | translate }}</button>
          </div>
        </div>
        <!-- seal: added in Task 5 -->
      </div>
    </div>
  `
})
export class BookingRegisterComponent implements OnInit, OnChanges {
  private service = inject(BookingsEmiService);
  private admin = inject(AdminService);
  private projectsService = inject(ProjectsService);
  private plotsService = inject(ProjectsPlotsService);

  @Input() config: BookingEmiConfig | null = null;
  @Input() focusBookingId: string | null = null;
  @Output() changed = new EventEmitter<void>();
  @Output() flash = new EventEmitter<FlashMessage>();

  readonly statuses = ['ACTIVE', 'CONFIRMED', 'CANCELLED'];
  filters: RegisterFilters = { ...NO_FILTERS };
  directory: AssociateSummary[] = [];
  projects: Project[] = [];
  plotOptions: PlotGridItem[] = [];
  page: BookingPage | null = null;
  selected: Booking | null = null;
  filterMismatch = false;
  loadError = false;
  loading = false;
  locked = false; // true while a seal write is in flight: filters, pager and selection freeze
  private seq = 0;

  money = formatInr;
  pct = (b: Booking) => meterPercent(b.paidAmount, b.totalAmount);
  plot = plotText;
  assoc = (b: Booking) => associateLabel(b, this.directory);
  overdueIn = (b: Booking) => b.installments.filter(i => i.overdue && i.status === 'PENDING').length;

  get hasFilters(): boolean {
    const f = this.filters;
    return !!(f.status || f.associateId || f.plotId || f.projectId || f.overdue);
  }
  get totalPages(): number {
    return !this.page || !this.page.size ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.admin.listAssociates().subscribe({ next: d => (this.directory = d), error: () => undefined });
    this.projectsService.listProjects().subscribe({ next: p => (this.projects = p), error: () => undefined });
    this.reload();
  }

  ngOnChanges(_: SimpleChanges): void { /* focusBookingId handled in Task 8 */ }

  applyFilter(partial: Partial<RegisterFilters>): void {
    const projectChanged = 'projectId' in partial && partial.projectId !== this.filters.projectId;
    this.filters = { ...this.filters, ...partial };
    if (projectChanged) {
      this.filters.plotId = '';
      this.plotOptions = [];
      if (this.filters.projectId) {
        this.plotsService.getGrid(this.filters.projectId).subscribe({ next: g => (this.plotOptions = g), error: () => undefined });
      }
    }
    this.load(0);
  }

  resetFilters(): void {
    this.filters = { ...NO_FILTERS };
    this.plotOptions = [];
    this.load(0);
  }

  reload(): void { this.load(this.page?.page ?? 0); }
  goTo(p: number): void { this.load(p); }

  // Latest-request-wins: a slow earlier response can never overwrite a newer one.
  private load(p: number): void {
    const mine = ++this.seq;
    this.loading = true;
    this.loadError = false;
    this.service.list(this.filters, p, PAGE_SIZE).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        this.loading = false;
        this.page = res;
        if (this.selected) {
          const still = res.bookings.find(b => b.id === this.selected!.id);
          if (still) { this.selected = still; this.filterMismatch = false; } else { this.filterMismatch = true; }
        }
      },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  selectBooking(b: Booking): void {
    if (this.locked) { return; }
    this.selected = b;
    this.filterMismatch = false;
  }

  // Seal write finished: patch list row + selection immediately, then re-sync the page.
  onBookingChanged(updated: Booking): void {
    if (this.page) {
      this.page = { ...this.page, bookings: this.page.bookings.map(b => (b.id === updated.id ? updated : b)) };
    }
    this.selected = updated;
    this.changed.emit();
    this.reload();
  }
}
```

Styles (append to `_admin.scss`; keep the epin pattern):

```scss
// ---- Bookings & EMI (plot-booking unit 12) ---------------------------------------------------
.booking-register {
  display: flex; flex-direction: column; gap: 1.25rem;
  &__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  &__filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1rem; padding: 1.25rem 1.5rem; background: var(--surface-raised); border-radius: 16px; }
  &__field { display: flex; flex-direction: column; gap: 0.375rem; min-width: 170px; flex: 1 1 170px; margin: 0;
    font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
  &__toggle { min-height: 44px; padding: 0 1.25rem; border: 1px dashed var(--status-warning); background: transparent; color: var(--status-warning-text); font-weight: 600; cursor: pointer;
    &--on { background: var(--status-warning); color: var(--surface-card); border-style: solid; } }
  &__grid { display: grid; grid-template-columns: minmax(0, 1fr) 420px; gap: 1.5rem; align-items: start; }
  &__list { background: var(--surface-card); border-radius: 20px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08); overflow: hidden; }
  &__table { width: 100%; border-collapse: collapse;
    th { text-align: left; padding: 0.75rem 1rem; font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
    td { padding: 0.75rem 1rem; border-top: 1px solid var(--border-subtle); vertical-align: top; } }
  &__row { cursor: pointer; &--selected { background: var(--brand-primary-soft); box-shadow: inset 4px 0 0 var(--brand-primary); }
    &:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: -2px; } }
  &__sub { font-size: 0.8125rem; color: var(--text-muted); }
  &__num { text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  &__chip { display: inline-block; padding: 0.125rem 0.625rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; border: 1px solid var(--border-subtle);
    &--confirmed { background: color-mix(in srgb, var(--status-success) 14%, var(--surface-card)); border-color: var(--status-success); color: var(--status-success-text); }
    &--active { border-color: var(--brand-primary); }
    &--cancelled { background: var(--surface-raised); color: var(--text-muted); } }
  &__pill { margin-left: 0.375rem; padding: 0.125rem 0.5rem; border-radius: 999px; background: var(--status-danger); color: #fff; font-size: 0.75rem; font-weight: 600; }
  &__meter { display: block; height: 4px; margin-top: 0.25rem; border-radius: 999px; background: var(--border-subtle); overflow: hidden;
    span { display: block; height: 100%; background: var(--status-success); } }
  &__pager { display: flex; justify-content: center; align-items: center; gap: 1rem; padding: 1rem; .brand-button { min-height: 44px; } }
  &__empty { padding: 2.5rem 1rem; text-align: center; h2 { margin: 0 0 0.5rem; font: 600 1.125rem var(--font-sans); } p { margin: 0 0 1rem; color: var(--text-muted); } }
  &__retry { margin-left: 0.75rem; background: none; border: 0; text-decoration: underline; cursor: pointer; color: inherit; font-weight: 600; min-height: 44px; }
  &__skeleton { display: flex; flex-direction: column; gap: 0.5rem; padding: 1rem; }
  &__skeleton-row { height: 44px; border-radius: 8px; background: linear-gradient(90deg, var(--surface-raised), var(--surface-card), var(--surface-raised)); background-size: 200% 100%; animation: booking-register-shimmer 1.4s linear infinite; }
}
:root { --status-danger-text: color-mix(in srgb, var(--status-danger) 70%, black); }
@keyframes booking-register-shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .booking-register__skeleton-row { animation: none; } }
@media (max-width: 1100px) { .booking-register__grid { grid-template-columns: minmax(0, 1fr) 360px; } }
@media (max-width: 960px) { .booking-register__grid { grid-template-columns: 1fr; } }
@media (max-width: 768px) {
  .booking-register__table thead { display: none; }
  .booking-register__table tr { display: block; padding: 0.5rem 0; border-top: 1px solid var(--border-subtle); }
  .booking-register__table td { display: flex; justify-content: space-between; gap: 1rem; border: 0; padding: 0.25rem 1rem; }
  .booking-register__table td::before { content: attr(data-label); font: 500 0.6875rem var(--font-mono); text-transform: uppercase; color: var(--text-muted); }
  .booking-register__meter { display: none; }
}
```

(The `td::before attr(data-label)` technique is the design's; if a screen-reader check in Task 9 shows it isn't exposed, switch to visible `<span>`s.)

- [ ] **Step 4: Run → PASS (12 specs). Step 5: Commit** `feat(frontend): booking register — filters, table, paging, stale-safe selection (unit 12)`.

---

### Task 5: `BookingSealComponent` (detail + Pay / Confirm / Cancel / Transfer)

**Files:** Create `booking-seal.component.ts`, `.spec.ts`; modify `booking-register.component.ts` (+ spec) to embed it; append styles.

**Interfaces:**
- Consumes: `BookingsEmiService.pay/confirm/cancel/transfer/get`, helpers, `AssociateLookupComponent`.
- Produces: `<app-booking-seal [booking]="Booking | null" [config]="BookingEmiConfig | null" [directory]="AssociateSummary[]" [filterMismatch]="boolean" (updated)="Booking" (flash)="FlashMessage" (busyChange)="boolean">`. Internal `mode: 'detail'|'pay'|'confirm'|'cancel'|'transfer'`, `payTarget: EmiInstallment | null`, `busy`, `error: {kind, serverText?, n?} | null`, `netUnknown`.

Behaviours to implement (each pinned below):
- `open(mode, installment?)` sets mode, clears `error`; a booking change (`ngOnChanges` with a different `id`) resets mode to `detail`.
- `submitPay()`: guard `busy`; require trimmed `paymentRef` (1–100) else field error and no request; body `{amount: payTarget.amount, paymentRef, paidAt?}`; on 200: flash `ok.autoConfirm` if `before.status==='ACTIVE' && res.status==='CONFIRMED'` else `ok.pay` (params: n, buyer, amount via `formatInr`, pct); emit `updated`; mode → detail. On error: `classifyError`; `network` → `netUnknown = true` (submit hidden, Reload shown); `notActive|notPayable|notFound` → also call `reload()` (GET booking; for 404 emit nothing, just show error); others show banner in form.
- `submitConfirm()`, `submitCancel()` (reason required ≤255), `submitTransfer()` (target required) follow the same shape; success flash keys `ok.confirm|cancel|transfer`.
- `busy` emitted through `busyChange` so the register locks.
- `reload()`: `service.get(id)` → emit `updated`; clear `netUnknown`/error. (Needs unit 14; if unit 14 is not merged yet this will 404 — guard: **do not implement `reload()` via `get`**; implement it by emitting a `reloadRequested` output the register handles with `this.reload()` list refetch, then re-selecting the booking from the returned page. Use that instead so Tasks 1–7 stay independent of unit 14.) → Output `reloadRequested: EventEmitter<void>`; register binds `(reloadRequested)="reload()"`; `netUnknown` clears on the next `booking` input change (the refreshed booking object).

- [ ] **Step 1: Failing spec** (key cases; write all):

```ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BookingSealComponent } from './booking-seal.component';

describe('BookingSealComponent', () => {
  let fixture: ComponentFixture<BookingSealComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const inst = (n: number, over: Record<string, unknown> = {}) =>
    ({ installmentNumber: n, amount: 250, dueDate: '2026-03-01', status: 'PENDING', paidAt: null, overdue: false, ...over });
  const bk = (over: Record<string, unknown> = {}) => ({
    id: 'b1', plotId: 'plot-xxxxxxxx', associateId: 'a1', status: 'ACTIVE', buyerName: 'Rohit', totalAmount: 1000, installmentCount: 4,
    bookedAt: '2026-02-01T00:00:00Z', paidAmount: 250, dueAmount: 750,
    installments: [inst(1, { status: 'PAID', paidAt: '2026-02-05T00:00:00Z' }), inst(2, { overdue: true }), inst(3), inst(4, { status: 'VOID' })], ...over
  });
  const dir = [{ id: 'a1', userId: 'VA-1', name: 'Jane', role: 'ASSOCIATE', hasFreeSlot: true }, { id: 'a2', userId: 'VA-2', name: 'Raj', role: 'ASSOCIATE', hasFreeSlot: true }];
  const auto = { emiEnabled: true, defaultInstallmentCount: 4, confirmRule: 'AUTO_THRESHOLD', confirmThresholdPercent: 50 };

  function setup(booking: unknown = bk(), config: unknown = auto) {
    TestBed.configureTestingModule({ imports: [BookingSealComponent, HttpClientTestingModule, TranslateModule.forRoot()], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(BookingSealComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('booking', booking);
    fixture.componentRef.setInput('config', config);
    fixture.componentRef.setInput('directory', dir);
    fixture.componentRef.setInput('filterMismatch', false);
    fixture.detectChanges();
  }
  afterEach(() => http.verify());
  const c = () => fixture.componentInstance;
  const type = (name: string, v: string) => { const i = el().querySelector<HTMLInputElement>(`[name="${name}"]`)!; i.value = v; i.dispatchEvent(new Event('input')); };
  const submit = () => el().querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

  it('shows the empty prompt without a booking', () => {
    setup(null);
    expect(el().textContent).toContain('admin.bookingsEmi.seal.none');
  });

  it('renders instalments: Pay only on PENDING rows of an ACTIVE booking, overdue pill, void struck', () => {
    setup();
    expect(el().querySelectorAll('.booking-seal__pay').length).toBe(2);
    expect(el().querySelectorAll('.booking-seal__overdue').length).toBe(1);
    expect(el().querySelectorAll('.booking-seal__row--void').length).toBe(1);
  });

  it('non-ACTIVE booking: no Pay buttons, three actions disabled with a visible reason', () => {
    setup(bk({ status: 'CONFIRMED' }));
    expect(el().querySelectorAll('.booking-seal__pay').length).toBe(0);
    const btns = el().querySelectorAll<HTMLButtonElement>('.booking-seal__action');
    expect(btns.length).toBe(3);
    btns.forEach(b => { expect(b.disabled).toBeTrue(); expect(b.getAttribute('aria-describedby')).toBe('seal-locked-reason'); });
    expect(el().querySelector('#seal-locked-reason')!.textContent).toContain('admin.bookingsEmi.locked.active');
  });

  it('cancelled booking shows the cancelled reason and "—" for due', () => {
    setup(bk({ status: 'CANCELLED', dueAmount: 0 }));
    expect(el().querySelector('#seal-locked-reason')!.textContent).toContain('admin.bookingsEmi.locked.cancelled');
  });

  it('pay form locks the amount, requires a reference, and sends no request when blank', () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    expect(el().querySelector<HTMLInputElement>('[name="amount"]')!.readOnly).toBeTrue();
    type('paymentRef', '   ');
    submit();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.validation.ref');
    http.expectNone(r => r.url.includes('/pay'));
  });

  it('pay sends amount from the instalment, trimmed ref, and ISO paidAt when given', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', ' UPI-1 ');
    type('receivedOn', '2026-03-02T10:30');
    await fixture.whenStable();
    submit();
    const req = http.expectOne('/api/admin/bookings/b1/installments/2/pay');
    expect(req.request.body.amount).toBe(250);
    expect(req.request.body.paymentRef).toBe('UPI-1');
    expect(req.request.body.paidAt).toMatch(/^2026-03-02T/);
    req.flush(bk());
  });

  it('warns before paying when the payment will auto-confirm', () => {
    setup(bk({ paidAmount: 250 }), { ...auto, confirmThresholdPercent: 50 });
    c().open('pay', c().booking!.installments[1]); // 250+250 = 50%
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.warn.autoConfirm');
  });

  it('does not warn under MANUAL', () => {
    setup(bk(), { ...auto, confirmRule: 'MANUAL' });
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    expect(el().textContent).not.toContain('admin.bookingsEmi.warn.autoConfirm');
  });

  it('success emits the updated booking and an auto-confirm flash when status flips to CONFIRMED', async () => {
    setup();
    const flashes: unknown[] = []; const updates: unknown[] = [];
    c().flash.subscribe(f => flashes.push(f)); c().updated.subscribe(u => updates.push(u));
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush(bk({ status: 'CONFIRMED', paidAmount: 500 }));
    expect(updates.length).toBe(1);
    expect((flashes[0] as { key: string }).key).toBe('admin.bookingsEmi.ok.autoConfirm');
    expect(c().mode).toBe('detail');
  });

  it('success without a status flip emits the plain payment flash', async () => {
    setup();
    const flashes: { key: string }[] = [];
    c().flash.subscribe(f => flashes.push(f));
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush(bk({ paidAmount: 500 }));
    expect(flashes[0].key).toBe('admin.bookingsEmi.ok.pay');
  });

  it('409 plot drift on pay shows the not-recorded copy, keeps the form, re-enables submit', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush({ error: 'Plot is not available for booking: x' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.plotDriftPay');
    expect(el().textContent).toContain('admin.bookingsEmi.err.serverSaid');
    expect(c().mode).toBe('pay');
    expect(c().busy).toBeFalse();
  });

  it('network error on pay hides submit and offers reload instead of a blind retry', async () => {
    setup();
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.payNetwork');
    expect(el().querySelector('button[type="submit"]')).toBeNull();
    let reloads = 0; c().reloadRequested.subscribe(() => reloads++);
    el().querySelector<HTMLButtonElement>('.booking-seal__reload')!.click();
    expect(reloads).toBe(1);
  });

  it('409 not ACTIVE asks the register to reload so the seal shows the real status', async () => {
    setup();
    let reloads = 0; c().reloadRequested.subscribe(() => reloads++);
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable(); submit();
    http.expectOne('/api/admin/bookings/b1/installments/2/pay').flush({ error: 'Booking is not ACTIVE' }, { status: 409, statusText: 'Conflict' });
    expect(reloads).toBe(1);
  });

  it('a second submit while in flight sends nothing and busy is announced', async () => {
    setup();
    const busy: boolean[] = []; c().busyChange.subscribe(b => busy.push(b));
    c().open('pay', c().booking!.installments[1]);
    fixture.detectChanges();
    type('paymentRef', 'R'); await fixture.whenStable();
    c().submitPay(); c().submitPay();
    expect(http.match(r => r.url.includes('/pay')).length).toBe(1);
    expect(busy).toEqual([true]);
  });

  it('confirm posts and emits ok.confirm', () => {
    setup();
    const flashes: { key: string }[] = []; c().flash.subscribe(f => flashes.push(f));
    c().open('confirm'); fixture.detectChanges();
    c().submitConfirm();
    http.expectOne('/api/admin/bookings/b1/confirm').flush(bk({ status: 'CONFIRMED' }));
    expect(flashes[0].key).toBe('admin.bookingsEmi.ok.confirm');
  });

  it('confirm 409 plot drift uses the confirm copy', () => {
    setup();
    c().open('confirm'); fixture.detectChanges();
    c().submitConfirm();
    http.expectOne('/api/admin/bookings/b1/confirm').flush({ error: 'Plot is not available for booking: x' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.plotDriftConfirm');
  });

  it('cancel requires a reason (≤255) and states the pending count before the button', () => {
    setup();
    c().open('cancel'); fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.cancelEffects');
    c().reason = '';
    c().submitCancel();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.validation.reason');
    c().reason = 'x'.repeat(256);
    c().submitCancel();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.validation.reasonMax');
    http.expectNone(r => r.url.includes('/cancel'));
  });

  it('cancel posts the trimmed reason', () => {
    setup();
    c().open('cancel'); fixture.detectChanges();
    c().reason = '  buyer withdrew ';
    c().submitCancel();
    const req = http.expectOne('/api/admin/bookings/b1/cancel');
    expect(req.request.body).toEqual({ reason: 'buyer withdrew' });
    req.flush(bk({ status: 'CANCELLED', dueAmount: 0 }));
  });

  it('transfer needs a target; same-associate 400 shows under the lookup', () => {
    setup();
    c().open('transfer'); fixture.detectChanges();
    c().submitTransfer();
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.validation.target');
    c().targetId = 'a1';
    c().submitTransfer();
    http.expectOne('/api/admin/bookings/b1/transfer').flush({ error: 'Booking is already assigned to associate a1' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.sameAssociate');
  });

  it('switching to a different booking closes any open form', () => {
    setup();
    c().open('cancel'); fixture.detectChanges();
    fixture.componentRef.setInput('booking', bk({ id: 'b2' }));
    fixture.detectChanges();
    expect(c().mode).toBe('detail');
  });

  it('shows the filter-mismatch note', () => {
    setup();
    fixture.componentRef.setInput('filterMismatch', true);
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.seal.filterMismatch');
  });
});
```

- [ ] **Step 2: Run → FAIL. Step 3: Implement the component.**

Template structure (write it in full; same conventions as the register):
- Root `<section class="booking-seal" aria-live="polite">`.
- `*ngIf="!booking"` → none prompt.
- Detail head: `<h2 #title tabindex="-1">` with `seal.detail`/form titles by mode; buyer, status chip, plot text + project, id (`overflow-wrap:anywhere`); meta list (associate label, booked date `mediumDate`, plan `planValue` = `{count: installmentCount, amount: formatInr(installments[0]?.amount)}`, total, paid, due → `—` when CANCELLED); `filterMismatch` note; meter `role="img"` with `seal.meter` (threshold known: AUTO_THRESHOLD with a percent, tick at `threshold%`) else `seal.meterPlain`.
- Instalment table (`mode === 'detail'` only visible; keep rendered when in a form? no — forms replace contents): rows `class="booking-seal__row"`, `--void` for VOID; cells: `#`, due (`mediumDate`) + `<span class="booking-seal__overdue">` when `i.overdue && i.status==='PENDING'`, amount, status chip (PAID adds paid date, VOID struck), and `<button class="booking-seal__pay">` when `booking.status==='ACTIVE' && i.status==='PENDING'`, `[disabled]="busy"`, `(click)="open('pay', i)"`.
- Action row (detail mode): three `<button class="brand-button booking-seal__action">` (Confirm, Transfer, Cancel), `[disabled]="booking.status!=='ACTIVE' || busy"`, `[attr.aria-describedby]="booking.status!=='ACTIVE' ? 'seal-locked-reason' : null"`; `<p id="seal-locked-reason" *ngIf="booking.status!=='ACTIVE'">` with `locked.cancelled` for CANCELLED else `locked.active`.
- Form modes use `<form (submit)="...; $event.preventDefault()">` with a visible danger `<app-inline-banner tone="danger" role="alert">` for `error` (copy by kind below), always followed by `err.serverText` small muted line when `serverText` present; inputs `[disabled]="busy"` except the amount which is `readonly`; submit button `[disabled]="busy"` `[attr.aria-busy]="busy"` with pending verb label when busy; secondary button (`action.back` for pay/confirm/transfer, `action.keep` for cancel) always enabled when not busy.
- Error copy by kind: `amountMismatch`→`err.amountMismatch {amount}`; `notActive`→`err.notActive`; `notPayable`→`err.notPayable {n}`; `plotDrift`→ for `pay`: `err.plotDriftPay {n}` + `err.plotDriftFix` + two `routerLink`s (`/settings/projects-plots`, `/settings/compensation`); for `confirm`: `err.plotDriftConfirm` + same fix text/links; `notFound`→`err.notFound`; `sameAssociate`→`err.sameAssociate` (rendered under the lookup); `invalidTarget`→`err.invalidTarget` (under lookup); `network` for pay → `err.payNetwork {n}` + Reload button (`.booking-seal__reload`, emits `reloadRequested`) and no submit; other `network` → `err.generic`; `generic`/`validation` → `err.generic`.

Class body (complete):

```ts
export class BookingSealComponent implements OnChanges {
  private service = inject(BookingsEmiService);
  @Input() booking: Booking | null = null;
  @Input() config: BookingEmiConfig | null = null;
  @Input() directory: AssociateSummary[] = [];
  @Input() filterMismatch = false;
  @Output() updated = new EventEmitter<Booking>();
  @Output() flash = new EventEmitter<FlashMessage>();
  @Output() busyChange = new EventEmitter<boolean>();
  @Output() reloadRequested = new EventEmitter<void>();
  @ViewChild('title') title?: ElementRef<HTMLElement>;

  mode: 'detail' | 'pay' | 'confirm' | 'cancel' | 'transfer' = 'detail';
  payTarget: EmiInstallment | null = null;
  paymentRef = ''; receivedOn = ''; reason = ''; targetId = '';
  tried = false; busy = false;
  error: { kind: ErrorKind; serverText?: string } | null = null;

  money = formatInr; pct = meterPercent; plot = plotText;
  assoc = (b: Booking) => associateLabel(b, this.directory);
  get pendingCount(): number { return this.booking?.installments.filter(i => i.status === 'PENDING').length ?? 0; }
  get predicts(): boolean { return !!(this.booking && this.payTarget && willAutoConfirm(this.booking, this.payTarget.amount, this.config)); }
  get threshold(): number | null {
    return this.config?.emiEnabled && this.config.confirmRule === 'AUTO_THRESHOLD' ? this.config.confirmThresholdPercent : null;
  }

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['booking'] && ch['booking'].previousValue?.id !== this.booking?.id) { this.close(); }
  }

  open(mode: 'pay' | 'confirm' | 'cancel' | 'transfer', i?: EmiInstallment): void {
    if (this.busy) { return; }
    this.mode = mode; this.payTarget = i ?? null; this.error = null; this.tried = false;
    this.paymentRef = ''; this.receivedOn = ''; this.reason = ''; this.targetId = '';
    setTimeout(() => this.title?.nativeElement.focus());
  }
  close(): void { this.mode = 'detail'; this.payTarget = null; this.error = null; this.tried = false; }

  private run(op: 'pay' | 'confirm' | 'cancel' | 'transfer', call: Observable<Booking>, okKey: (res: Booking, before: Booking) => FlashMessage): void {
    if (this.busy || !this.booking) { return; }
    const before = this.booking;
    this.setBusy(true); this.error = null;
    call.subscribe({
      next: res => { this.setBusy(false); this.close(); this.flash.emit(okKey(res, before)); this.updated.emit(res); },
      error: (err: HttpErrorResponse) => {
        this.setBusy(false);
        this.error = classifyError(err, op);
        if (['notActive', 'notPayable', 'notFound'].includes(this.error.kind)) { this.reloadRequested.emit(); }
      }
    });
  }
  private setBusy(v: boolean): void { this.busy = v; this.busyChange.emit(v); }

  submitPay(): void {
    if (this.busy || !this.booking || !this.payTarget) { return; }
    this.tried = true;
    const ref = this.paymentRef.trim();
    if (!ref || ref.length > 100) { return; }
    const target = this.payTarget;
    const req: PayRequest = { amount: target.amount, paymentRef: ref };
    if (this.receivedOn) { req.paidAt = new Date(this.receivedOn).toISOString(); }
    this.run('pay', this.service.pay(this.booking.id, target.installmentNumber, req), (res, before) => {
      const buyer = res.buyerName;
      return before.status === 'ACTIVE' && res.status === 'CONFIRMED'
        ? { key: 'admin.bookingsEmi.ok.autoConfirm', params: { n: target.installmentNumber, buyer, pct: this.pct(res.paidAmount, res.totalAmount) } }
        : { key: 'admin.bookingsEmi.ok.pay', params: { n: target.installmentNumber, buyer, amount: this.money(target.amount) } };
    });
  }
  submitConfirm(): void {
    if (!this.booking) { return; }
    this.run('confirm', this.service.confirm(this.booking.id), r => ({ key: 'admin.bookingsEmi.ok.confirm', params: { buyer: r.buyerName } }));
  }
  submitCancel(): void {
    if (this.busy || !this.booking) { return; }
    this.tried = true;
    const reason = this.reason.trim();
    if (!reason || reason.length > 255) { return; }
    this.run('cancel', this.service.cancel(this.booking.id, reason), r => ({ key: 'admin.bookingsEmi.ok.cancel', params: { buyer: r.buyerName } }));
  }
  submitTransfer(): void {
    if (this.busy || !this.booking) { return; }
    this.tried = true;
    if (!this.targetId) { return; }
    const name = this.directory.find(a => a.id === this.targetId)?.name ?? '';
    this.run('transfer', this.service.transfer(this.booking.id, this.targetId), () => ({ key: 'admin.bookingsEmi.ok.transfer', params: { associate: name } }));
  }
}
```

Imports: `Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject`, `CommonModule, FormsModule, RouterLink`, `HttpErrorResponse`, `Observable`, `TranslateModule`, `AssociateLookupComponent`, `InlineBannerComponent`, `FieldErrorComponent`, `AssociateSummary`, `Booking, EmiInstallment`, `BookingEmiConfig, FlashMessage, PayRequest`, `BookingsEmiService`, util functions, `formatInr`.

The cancel form's reason textarea shows `field.reasonCount` and validation errors keyed on `tried`; the pay form reference input likewise (`validation.ref` when `tried && !ref`, `validation.refMax` when > 100).

Embed in the register: replace the `<!-- seal: added in Task 5 -->` line with

```html
        <app-booking-seal [booking]="selected" [config]="config" [directory]="directory" [filterMismatch]="filterMismatch"
          (updated)="onBookingChanged($event)" (flash)="flash.emit($event)" (busyChange)="locked = $event"
          (reloadRequested)="reload()"></app-booking-seal>
```

add `BookingSealComponent` to the register's `imports`. Add to the register spec:

```ts
  it('locks filters, paging and row selection while a seal write is in flight', () => {
    boot();
    fixture.componentInstance.locked = true;
    fixture.detectChanges();
    expect(el().querySelector<HTMLSelectElement>('.booking-register__plot')!.disabled).toBeTrue();
    fixture.componentInstance.selectBooking(fixture.componentInstance.page!.bookings[1]);
    expect(fixture.componentInstance.selected).toBeNull();
  });
```

Seal styles (append): `.booking-seal` sticky (`position: sticky; top: 1rem; max-height: calc(100vh - 2rem); overflow-y: auto`), double-ruled panel (`border: 1px solid var(--brand-primary); box-shadow: 0 0 0 4px var(--surface-card), 0 0 0 5px var(--brand-primary)` — the e-Pin `__seal` look; copy its rules from `.epin-register__seal` in `_admin.scss` and re-scope), `__meter` with a tick (`position:absolute; left: <threshold>%`), `__overdue` red pill (`background: var(--status-danger); color:#fff`), `__row--void` struck/hatched, `__pay` 32px (44px under 768px), locked-reason paragraph, `@media (max-width:960px){ .booking-seal{position:static;max-height:none} }`.

- [ ] **Step 4: Run register + seal specs → PASS. Step 5: Commit** `feat(frontend): booking seal — detail and pay/confirm/cancel/transfer flows with plot-drift and network handling (unit 12)`.

---

### Task 6: `OverdueReportComponent`

**Files:** Create `overdue-report.component.ts`, `.spec.ts`.

**Interfaces:** Consumes `BookingsEmiService.overdue`. Produces `<app-overdue-report (openBooking)="string" (total)="number">`; emits `total` (totalElements) after each successful load for the tab badge; `openBooking` emits `bookingId` on row click/Enter.

- [ ] **Step 1: Failing spec**

```ts
describe('OverdueReportComponent', () => {
  // same TestBed boilerplate as the register spec (HttpClientTestingModule, TranslateModule.forRoot())
  const row = (id: string) => ({ bookingId: id, plotId: 'p', plotNo: 'A-12', associateId: 'a', associateName: 'Jane', buyerName: 'Rohit',
    overdueCount: 2, overdueAmount: 5000, oldestDueDate: '2026-01-05' });
  const req = () => http.expectOne(r => r.url === '/api/admin/emi-reports/overdue');

  it('renders rows with plot, associate, count, amount and oldest due date', ...);       // flush {rows:[row('b1')],page:0,size:20,totalElements:1}; expect text 'A-12','Jane','Rohit'
  it('emits the total after loading', ...);                                                 // subscribe total → 1
  it('emits openBooking with the booking id on click and on Enter', ...);
  it('shows the calm empty state when nothing is overdue', ...);                            // 'admin.bookingsEmi.empty.overdueTitle'
  it('shows an error banner with Try again and keeps the previous page on a failed next-page load', ...);
  it('pages with Next using page=1', ...);
});
```

Write each `it` fully (same style as earlier specs: boot → flush → assert). Assertions listed in the comments above are the required checks.

- [ ] **Step 2: Run → FAIL. Step 3: Implement** — standalone component, table with `data-label` cells (`admin.bookingsEmi.col.associate|buyer|plot|overdue|amountOverdue|oldestDue`), rows `tabindex="0"` with `(click)`/`(keydown.enter)` → `openBooking.emit(r.bookingId)`, `overdueCount` cell shows the number, amount via `formatInr`, date via `date:'mediumDate'`, pager (`.overdue-report__prev/__next`) with `admin.bookingsEmi.pager`, empty state `empty.overdueTitle/Body` (`task_alt` Material icon), skeleton (3 rows), error banner + `.overdue-report__retry`, previous page retained on a failed load, latest-request-wins `seq` guard as in the register. Load size 20. Reuse the `.booking-register__*` table/pager styles by giving the table the classes `booking-register__table` too (no new CSS beyond `.overdue-report { background: var(--surface-card); border-radius: 20px; ... }` mirroring `.booking-register__list`).

- [ ] **Step 4: Run → PASS. Step 5: Commit** `feat(frontend): overdue EMI report tab (unit 12)`.

---

### Task 7: Host component, route, rule pill, tabs, flash

**Files:** Create `bookings-emi.component.ts`, `.spec.ts`; modify `app.routes.ts`, `app.routes.spec.ts`.

**Interfaces:** Consumes the register, overdue report, `BookingsEmiService.config/overdue`, `TabBarComponent`, `InlineBannerComponent`. Produces `BookingsEmiComponent` (`app-bookings-emi`), `activeTab: 'register'|'overdue'`, `config`, `flash`, `overdueTotal`.

- [ ] **Step 1: Failing spec**

```ts
describe('BookingsEmiComponent', () => {
  // TestBed: imports BookingsEmiComponent, HttpClientTestingModule, TranslateModule.forRoot(); provideRouter([])
  // boot(): flush /api/company/booking-emi, /api/admin/emi-reports/overdue (size=1 → totalElements 7), and the register's
  //         three initial requests (/api/associates, /api/company/projects, /api/admin/bookings)
  it('shows the Auto-at-% pill for AUTO_THRESHOLD and the Manual pill for MANUAL');
  it('hides the pill and passes null config when emiEnabled is false');
  it('hides the pill when the config call fails (does not guess)');
  it('shows the overdue count on the tab from a size=1 report call, and hides it when that call fails');
  it('switching to Overdue mounts the report; switching back remounts the register');
  it('a flash from the register shows a dismissible success banner above the tabs');
  it('refreshes the overdue count when the register reports a change');
});
```

Write each fully. Required assertions: pill text contains `admin.bookingsEmi.rule.auto` / `rule.manual` and no pill element when disabled/failed; tab label contains `7`; `activeTab` toggles and `app-overdue-report`/`app-booking-register` presence; banner `tone="success"` text contains the flash key; a `(changed)` emission triggers a new `GET …/overdue?size=1`.

- [ ] **Step 2: Run → FAIL. Step 3: Implement**

```ts
@Component({
  selector: 'app-bookings-emi',
  standalone: true,
  imports: [CommonModule, TranslateModule, TabBarComponent, InlineBannerComponent, BookingRegisterComponent, OverdueReportComponent],
  template: `
    <div class="bookings-emi">
      <div class="bookings-emi__head">
        <div class="bookings-emi__intro">
          <span class="bookings-emi__eyebrow">{{ 'admin.bookingsEmi.eyebrow' | translate }}</span>
          <h1 class="bookings-emi__title">{{ 'admin.bookingsEmi.title' | translate }}</h1>
          <p class="bookings-emi__subtitle">{{ 'admin.bookingsEmi.subtitle' | translate }}</p>
        </div>
        <span class="bookings-emi__rule" *ngIf="rulePill as r">{{ r.key | translate: r.params }}</span>
      </div>
      <app-inline-banner *ngIf="flash" tone="success" [dismissible]="true" (dismissed)="flash = null">
        <span role="status">{{ flash.key | translate: flash.params }}</span>
      </app-inline-banner>
      <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="activeTab = $any($event)"></app-tab-bar>
      <app-booking-register *ngIf="activeTab === 'register'" [config]="config" [focusBookingId]="focusBookingId"
        (flash)="flash = $event" (changed)="loadOverdueTotal()"></app-booking-register>
      <app-overdue-report *ngIf="activeTab === 'overdue'" (openBooking)="openFromOverdue($event)" (total)="overdueTotal = $event"></app-overdue-report>
    </div>
  `
})
export class BookingsEmiComponent implements OnInit {
  private service = inject(BookingsEmiService);
  private translate = inject(TranslateService);
  activeTab: 'register' | 'overdue' = 'register';
  config: BookingEmiConfig | null = null;
  flash: FlashMessage | null = null;
  overdueTotal: number | null = null;
  focusBookingId: string | null = null;

  get rulePill(): { key: string; params?: Record<string, unknown> } | null {
    const c = this.config;
    if (!c || !c.emiEnabled) { return null; }
    return c.confirmRule === 'AUTO_THRESHOLD' && c.confirmThresholdPercent != null
      ? { key: 'admin.bookingsEmi.rule.auto', params: { percent: c.confirmThresholdPercent } }
      : c.confirmRule === 'MANUAL' ? { key: 'admin.bookingsEmi.rule.manual' } : null;
  }
  get tabs(): TabDefinition[] {
    const od = this.overdueTotal == null ? '' : ` (${this.overdueTotal})`;
    return [
      { id: 'register', label: this.translate.instant('admin.bookingsEmi.tab.register') },
      { id: 'overdue', label: this.translate.instant('admin.bookingsEmi.tab.overdue') + od }
    ];
  }
  ngOnInit(): void {
    // Config unreadable/disabled hides the pill and the auto-confirm warnings; never guess a rule.
    this.service.config().subscribe({ next: c => (this.config = c.emiEnabled ? c : null), error: () => (this.config = null) });
    this.loadOverdueTotal();
  }
  loadOverdueTotal(): void {
    this.service.overdue(0, 1).subscribe({ next: r => (this.overdueTotal = r.totalElements), error: () => (this.overdueTotal = null) });
  }
  openFromOverdue(_bookingId: string): void { /* Task 8 (needs unit 14) */ }
}
```

Test note: the tab label spec expects the text `7` — `translate.instant` returns the key under `forRoot()` without translations, so assert `tabs[1].label` ends with ` (7)`.

Route: in `app.routes.ts` add `import { BookingsEmiComponent } from './admin/bookings-emi/bookings-emi.component';` and under `settings` children after `projects-plots`:

```ts
      { path: 'bookings-emi', component: BookingsEmiComponent, data: { sectionKey: 'bookingsEmi' } },
```

In `app.routes.spec.ts` add a `bookings-emi` child spec identical in shape to the `projects-plots` one (`data` equals `{ sectionKey: 'bookingsEmi' }`).

Host styles (append): `.bookings-emi` same shell as `.epin-register` (flex column, `max-width: 1480px`, padding), `__eyebrow/__title/__subtitle` extend the `%admin-screen-*` placeholders, `__rule` as a mono pill (`border: 1px solid var(--border-subtle); border-radius: 999px; padding: .375rem .875rem; font: 500 .8125rem var(--font-mono)`).

- [ ] **Step 4: Run folder + `app.routes.spec.ts` + nav spec + `npx ng build` → PASS. Step 5: Commit** `feat(frontend): Bookings & EMI screen host, route and confirm-rule pill (unit 12)`.

---

### Task 8: Overdue click-through and unit-11 deep link — REQUIRES UNIT 14 MERGED

Do not start until `GET /api/admin/bookings/{id}` exists (verify: `grep -rn '"/api/admin/bookings/{id}"\|@GetMapping("/{id}")' backend/src/main/java/com/plotchain/booking`). If absent, stop and report.

**Files:** Modify `bookings-emi.component.ts` (+ spec), `booking-register.component.ts` (+ spec).

**Behaviour:** `openFromOverdue(id)` sets `focusBookingId = id`, `activeTab = 'register'`. Unit 11's banner link opens `/settings/bookings-emi?booking=<id>`: the host reads `ActivatedRoute.queryParamMap` once on init (and on change) and sets `focusBookingId` the same way. The register's `ngOnChanges` on `focusBookingId` (non-null) calls `service.get(id)`; on success `selected = booking` and `filterMismatch = !page?.bookings.some(b => b.id === id)`; on 404 emits flash `admin.bookingsEmi.err.notFound` (reuse the key as a danger-less flash? — use an `err` banner: set `loadError`-style `focusError = true` with the notFound copy); a seq guard drops a stale response if the admin selected another booking meanwhile.

- [ ] **Step 1: Failing specs** (host): overdue `openBooking('b9')` switches to register and passes `focusBookingId='b9'`; with `?booking=b9` in the URL the host starts on the register with that id. (register): setting `focusBookingId` triggers `GET /api/admin/bookings/b9`, selects it, sets `filterMismatch` when not on the page; 404 shows the not-found banner and selects nothing; a late response after a manual selection is ignored.
- [ ] **Step 2–4:** implement (host: inject `ActivatedRoute`; register: replace the `ngOnChanges` stub), run folder + build → PASS.
- [ ] **Step 5: Commit** `feat(frontend): overdue report and plot-booking banner open a booking in the register (unit 12)`.

---

### Task 9: Real-app verification, sweep, tracking

- [ ] Full suite + `npx ng build` clean.
- [ ] Real app (per the `run` skill), admin login, seed a booking via Projects & Plots (unit 11), then verify at 1440/1000/600px against the `screen-*.png` set: register filters and paging; select a booking; Pay with and without crossing the threshold (set the confirm rule in Settings to AUTO_THRESHOLD to see the warning and the auto-confirm banner); Confirm; Cancel (reason validation, pending count); Transfer (same associate → error; valid target); a non-ACTIVE booking shows disabled actions with the visible reason; Overdue tab (backdate an instalment's `due_date` in the DB to seed) and click-through; sidebar shows Projects & Plots and Bookings & EMI under "Inventory & Bookings"; confirm the `td::before attr(data-label)` stacked rows are read by a screen reader or switch to visible spans.
- [ ] Anything off from the designs beyond Deviations 1–8 is a bug to fix.
- [ ] **Coordinator, after merge:** update row 12 of `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (plan path, status `merged`, commit range); mark the screens trio complete (11/12/13 → 13/14 with unit 14); note the follow-ups: add `status` to `AssociateSummaryResponse` (lookup currently filters by role), distinct plot-drift error `code`, real-Postgres smoke test still owed.

---

## Self-Review

**Spec/units-file coverage (row 12):** register with filters (`status`, `associateId`, `plotId`, `projectId`, overdue) and pagination → Task 4; booking detail with installment table (status, paid date, overdue badge) and Pay/Confirm/Cancel/Transfer disabled unless ACTIVE, 409/400 surfaced, auto-confirm reflected in refreshed detail → Task 5 (flash + `updated` + register patch/refetch); overdue report tab → Task 6; sidebar entry reusing the group → Tasks 3/7; component/service specs, no e2e → every task. DESIGN items cut or changed: Deviations 1–8.

**Placeholder scan:** Tasks 6, 7 and 8 give required assertions and full implementation structure but list some `it` bodies as one-line contracts rather than full code (same boilerplate as Task 4's spec); the implementer must write them out fully following Task 4's pattern. Task 5's template is specified structurally (classes, bindings, copy keys per state) rather than as a single markup block, to avoid a ~300-line template here; every binding name it needs is defined in the class body shown. These are the only places that rely on following an earlier pattern.

**Type consistency:** `Booking` (extended with `plotNo?/projectName?/associateName?`), `BookingEmiConfig`, `FlashMessage`, `RegisterFilters`, `PayRequest` are defined in Task 1/2/4 and used with identical shapes after. `ErrorKind` values in Task 2 match the switch in Task 5's error copy list. Seal outputs (`updated`, `flash`, `busyChange`, `reloadRequested`) match the register's bindings. `loadOverdueTotal` is defined in the host (Task 7) and bound to the register's `(changed)`.

**Known risks:** (1) Task 5 `reloadRequested` deliberately avoids `service.get` so Tasks 1–7 don't depend on unit 14; on the network-error flow the register re-lists and re-selects by id, so a booking outside the current page triggers the filter-mismatch note rather than a refresh — acceptable and noted. (2) `ProjectsPlotsService.getGrid` is from unit 11; if its path or name differ, adjust the register's import. (3) `AssociateLookupComponent` keeps its own query text; resetting filters clears `value` so the chosen chip disappears, but a half-typed query remains until blur — cosmetic.
