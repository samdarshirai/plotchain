# Wallet/Withdrawal Unit 11 — Associate "Payout History" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the associate-facing "Payout History" screen — a single view-only page showing the associate's current wallet balance (`GET /api/associates/me/wallet`, unit 2) alongside their own withdrawal-request history, filterable by status (`GET /api/associates/me/withdrawals`, unit 9). Both backend endpoints are merged and stable — this plan is frontend-only, no backend changes.

**Architecture:** One Angular standalone component (`PayoutHistoryComponent`) + one shared HTTP service (`PayoutHistoryService`), following this codebase's established associate-screen conventions exactly (`SalesHistoryComponent`, `IncomeStatementComponent`). The component makes two independent GET calls on init — a wallet-balance lookup and a filtered/paginated withdrawal-history load — mirroring `IncomeStatementComponent`'s "cycle-lookup vs. main table" pattern of two independent requests where a failure in the secondary one (here, the wallet balance) degrades gracefully without blocking or erroring the primary table. There is only one filter (status) and no tabs — this screen has no second dimension like income type to tab on, so it follows `SalesHistoryComponent`'s simpler single-filter shape rather than `IncomeStatementComponent`'s tab-bar shape.

This plan builds a fully functional, generically-styled screen only (`.card`/`.editable-table`/existing shared-component styling) — **no visual design artifact is produced here**; that is a separate `superpowers:frontend-design` phase after this plan is approved and implemented, matching how unit 10's plan (`docs/superpowers/plans/2026-08-15-wallet-withdrawal-unit-10-admin-payout-approval-screen.md`) and the Cycle Management screen plan before it both stopped at the same checkpoint.

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md`; unit sliced in `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md` section "### 11."

## Design decision: the PRD's "TDS/admin deducted" and "downloadable statement (PDF)"

The source PRD's §5.1 "Payout History" row (`mlm-land-platform-spec.md`) names four things: "Cycle, amount paid, TDS/admin deducted, bank reference, downloadable statement (PDF)." Two of those five — cycle and bank reference — map directly onto real fields (`AssociateWithdrawalResponse` has no `cycleId`, but `requestedAt`/`decidedAt`/`disbursedAt` plus `amount`/`bankReference` cover "amount paid" and "bank reference"). The other two do not exist anywhere in Scope:

- **`withdrawal_request` has no TDS/admin-deduction columns and never will need them.** Verified directly from the merged code: `WalletCreditingService.creditWalletsForCycle()` (`backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java:119`) credits the wallet with `entry.getNetAmount()` — the **already-net** amount, after `LedgerEntry`'s TDS and admin deductions have been applied. By the time money reaches the wallet (and therefore a withdrawal request debited from that wallet), the gross → TDS → admin-deduction → net arithmetic has already happened one layer up, on the income-ledger side. A withdrawal request is a debit against an already-net pool of money; there is no deduction left to apply or show at withdrawal time, and no field anywhere in `withdrawal_request`'s schema (`id`, `associate_id`, `amount`, `status`, `reason`, `bank_reference`, `requested_at`, `decided_at`, `disbursed_at`) to carry one even if there were.
- **No export/PDF endpoint exists anywhere in Scope.** Confirmed by the spec-slicer's own file-overlap check and Excluded section in `2026-08-04-wallet-withdrawal-units.md` — nothing resembling a statement-generation or file-download endpoint was sliced from the domain design doc.

**Decision: the screen ships without both, permanently out of scope for this unit — not deferred to a "later task in this same plan."** A future spec, if the product genuinely wants a per-cycle TDS/deduction breakdown *displayed on the withdrawal screen* (as opposed to where it already lives — Income Statement, unit 4), would need to either (a) add deduction-snapshot fields to `withdrawal_request` at request-creation time, or (b) join withdrawal rows against `LedgerEntry` data client-side, which the current endpoints don't support (a withdrawal isn't tied to a single cycle or a single ledger entry — it's a debit against an aggregate wallet balance funded by potentially many cycles' worth of credited entries, so there is no well-defined "the TDS for this withdrawal" to compute even server-side without new modeling work). Either way, that's new backend work outside this plan's scope (frontend-only, two already-merged endpoints).

**Is Income Statement's Gross/TDS/Admin Deduction/Net data relevant here? No — genuinely orthogonal, not just "different screen, same idea."** Income Statement (`docs/design/associate_operational_screens/income_statement/`) shows that breakdown *per ledger entry, per income type, per cycle* — it's where TDS/admin-deduction actually lives, structurally, in this domain (`LedgerEntry.tdsDeduction`/`adminDeduction`/`netAmount`). Payout History shows *withdrawal requests* — debits against the wallet, which is itself just a running balance funded by many already-net ledger credits. There's no way to attribute "this much of this specific withdrawal's amount came from this much TDS on this specific ledger entry" without inventing a settlement/allocation model this spec never built (a withdrawal amount is not scoped to a cycle at all — `CreateWithdrawalRequest` takes only `associateId`/`amount`/`reason`, no `cycleId`). The two screens answer different questions about the same money at different points in its lifecycle: Income Statement answers "how was this money calculated," Payout History answers "what have I done with money I already have." This plan does not attempt to bridge them.

## Global Constraints

- Angular 18.2 standalone components only — no `NgModule`. (Matches every existing component in `frontend/src/app`.)
- View-only, no actions of any kind — no form, no button that mutates state, matching the role-capability matrix's associate read-only posture for the wallet/withdrawal domain (this unit's own acceptance criteria) and mirroring `SalesHistoryComponent`'s/`IncomeStatementComponent`'s `[readOnly]="true"` `EditableTableComponent` usage with no `actionTemplate`.
- Every user-facing string goes through `TranslateModule`/`| translate` with a key added to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Precedent check: the immediately-preceding associate screen (`incomeStatement`) left its body-copy block in identical English text in both files and only translated the `nav.incomeStatement` entry into real Hindi. This plan follows that same precedent — `payoutHistory.*` body copy stays English in `hi.json` too; `nav.payoutHistory` gets a real Hindi translation, matching every other `nav.*` entry.
- Page size: client requests `size=20` by default (matching `PAGE_SIZE` in every existing associate list component); the backend clamps `size` to 100 regardless (`AssociateWithdrawalController.getMyWithdrawals`: `size = Math.min(size, 100)`).
- Dates: `WithdrawalRequest.requestedAt`/`decidedAt`/`disbursedAt` are backend `Instant` fields — they serialize as ISO-8601 timestamp strings (same as `Sale.recordedAt`, `AssociateLedgerEntry.createdAt`), so the frontend model types them `string` (`requestedAt`) or `string | null` (`decidedAt`/`disbursedAt`, which are `null` until a decision/disbursement happens).
- `WithdrawalRequestStatus` is a strict 4-value enum (`REQUESTED`, `APPROVED`, `REJECTED`, `DISBURSED`) with no fifth "hold" value anywhere in the backend (`WithdrawalRequestStatus.java`) — the status filter dropdown offers exactly these four plus an "All" option, nothing invented.
- `bankReference` is `null` on the backend until a request reaches `DISBURSED` (only `WithdrawalService.disburse()` ever sets it) — the frontend renders whatever the API returns (a dash for `null`) rather than re-deriving "is this DISBURSED" client-side to decide what to show.
- `associateId` is never sent by this screen — `GET /api/associates/me/withdrawals` and `GET /api/associates/me/wallet` both scope to the caller via the JWT server-side (`@AuthenticationPrincipal`); there is no `associateId` query parameter on either endpoint to omit or misuse.

---

## Part A — File Structure

**New files:**
- `frontend/src/app/payout-history/models/withdrawal-request.model.ts` — `WithdrawalRequestStatus`, `AssociateWithdrawalRequest` (mirrors `WithdrawalRequestStatus.java`/`AssociateWithdrawalResponse.java`).
- `frontend/src/app/payout-history/models/associate-withdrawal-page.model.ts` — `AssociateWithdrawalPage`, `AssociateWithdrawalFilters` (mirrors `AssociateWithdrawalPageResponse.java`).
- `frontend/src/app/payout-history/models/wallet-balance.model.ts` — `WalletBalance` (mirrors `WalletBalanceResponse.java`).
- `frontend/src/app/payout-history/payout-history.service.ts` + `.spec.ts`
- `frontend/src/app/payout-history/payout-history.component.ts` + `.spec.ts`

**Modified files:**
- `frontend/src/app/app.routes.ts` — add `{ path: 'payout-history', component: PayoutHistoryComponent, canActivate: [authGuard, associateOnlyGuard] }`, same shape as `income-statement`.
- `frontend/src/app/app.routes.spec.ts` — cover the new route.
- `frontend/src/app/app.component.html` — add the nav link after `income-statement`'s.
- `frontend/src/app/app.component.spec.ts` — extend the associate-nav-links list assertion and its translate-fake map with the new entry.
- `frontend/src/assets/i18n/en.json` / `hi.json` — new `payoutHistory.*` block, plus `nav.payoutHistory`.

**No backend changes** — both endpoints (`GET /api/associates/me/wallet`, `GET /api/associates/me/withdrawals`) are already merged (`WalletController`, `AssociateWithdrawalController` — verified directly from source in research for this plan).

---

## Task 1: Frontend withdrawal/wallet models

**Files:**
- Create: `frontend/src/app/payout-history/models/withdrawal-request.model.ts`
- Create: `frontend/src/app/payout-history/models/associate-withdrawal-page.model.ts`
- Create: `frontend/src/app/payout-history/models/wallet-balance.model.ts`

**Interfaces:**
- Produces: `WithdrawalRequestStatus`, `AssociateWithdrawalRequest`, `AssociateWithdrawalPage`, `AssociateWithdrawalFilters`, `WalletBalance` — consumed by Task 2's service and Task 3's component.

These are plain type-only files (no logic to test) — mirror the real merged backend records field-for-field, confirmed from `backend/src/main/java/com/plotchain/withdrawal/{WithdrawalRequestStatus,AssociateWithdrawalResponse,AssociateWithdrawalPageResponse}.java` and `backend/src/main/java/com/plotchain/wallet/WalletBalanceResponse.java`.

- [ ] **Step 1: Write `withdrawal-request.model.ts`**

```typescript
// frontend/src/app/payout-history/models/withdrawal-request.model.ts
// Mirrors backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestStatus.java and
// AssociateWithdrawalResponse.java (wallet/withdrawal unit 9). Deliberately no
// associateId/associateUserId/associateName fields -- every row returned by
// GET /api/associates/me/withdrawals is always the caller's own (Decision 14), so the backend
// response never carries them and this model doesn't invent them.
export type WithdrawalRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'DISBURSED';

export interface AssociateWithdrawalRequest {
  id: string;
  amount: number;
  status: WithdrawalRequestStatus;
  reason: string | null;
  bankReference: string | null;
  requestedAt: string;
  decidedAt: string | null;
  disbursedAt: string | null;
}
```

- [ ] **Step 2: Write `associate-withdrawal-page.model.ts`**

```typescript
// frontend/src/app/payout-history/models/associate-withdrawal-page.model.ts
// Mirrors backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalPageResponse.java --
// field named "requests" to match the real merged backend record field name verbatim (not
// "withdrawals" or "entries").
import { AssociateWithdrawalRequest, WithdrawalRequestStatus } from './withdrawal-request.model';

export interface AssociateWithdrawalPage {
  requests: AssociateWithdrawalRequest[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AssociateWithdrawalFilters {
  status?: WithdrawalRequestStatus;
}
```

- [ ] **Step 3: Write `wallet-balance.model.ts`**

```typescript
// frontend/src/app/payout-history/models/wallet-balance.model.ts
// Mirrors backend/src/main/java/com/plotchain/wallet/WalletBalanceResponse.java (wallet/withdrawal
// unit 2) -- a bare balance, no associateId, since GET /api/associates/me/wallet is always scoped
// to the caller.
export interface WalletBalance {
  balance: number;
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/payout-history/models/withdrawal-request.model.ts frontend/src/app/payout-history/models/associate-withdrawal-page.model.ts frontend/src/app/payout-history/models/wallet-balance.model.ts
git commit -m "feat(payout-history): add frontend models for wallet balance and withdrawal history"
```

---

## Task 2: `PayoutHistoryService`

**Files:**
- Create: `frontend/src/app/payout-history/payout-history.service.ts`
- Test: `frontend/src/app/payout-history/payout-history.service.spec.ts`

**Interfaces:**
- Consumes: `AssociateWithdrawalFilters`, `AssociateWithdrawalPage`, `WalletBalance` (Task 1).
- Produces: `PayoutHistoryService` with `getWallet(): Observable<WalletBalance>` and `list(filters: AssociateWithdrawalFilters, page: number, size: number): Observable<AssociateWithdrawalPage>` — consumed by Task 3.

- [ ] **Step 1: Write the failing service tests**

```typescript
// frontend/src/app/payout-history/payout-history.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PayoutHistoryService } from './payout-history.service';
import { AssociateWithdrawalPage } from './models/associate-withdrawal-page.model';
import { WalletBalance } from './models/wallet-balance.model';

describe('PayoutHistoryService', () => {
  let service: PayoutHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PayoutHistoryService]
    });
    service = TestBed.inject(PayoutHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the current wallet balance', () => {
    const mockResponse: WalletBalance = { balance: 12500 };

    service.getWallet().subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/associates/me/wallet');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('fetches my withdrawal history with a status filter and pagination as query params', () => {
    const mockResponse: AssociateWithdrawalPage = { requests: [], page: 0, size: 20, totalElements: 0 };

    service.list({ status: 'DISBURSED' }, 0, 20).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(
      r =>
        r.url === '/api/associates/me/withdrawals' &&
        r.params.get('status') === 'DISBURSED' &&
        r.params.get('page') === '0' &&
        r.params.get('size') === '20'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits the status param when unfiltered, sending only page/size', () => {
    service.list({}, 1, 100).subscribe();

    const req = httpMock.expectOne('/api/associates/me/withdrawals?page=1&size=100');
    req.flush({ requests: [], page: 1, size: 100, totalElements: 0 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-history.service.spec.ts'`
Expected: FAIL — `Cannot find module './payout-history.service'`

- [ ] **Step 3: Write the minimal implementation**

```typescript
// frontend/src/app/payout-history/payout-history.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateWithdrawalFilters, AssociateWithdrawalPage } from './models/associate-withdrawal-page.model';
import { WalletBalance } from './models/wallet-balance.model';

@Injectable({ providedIn: 'root' })
export class PayoutHistoryService {
  private http = inject(HttpClient);

  getWallet(): Observable<WalletBalance> {
    return this.http.get<WalletBalance>('/api/associates/me/wallet');
  }

  list(filters: AssociateWithdrawalFilters, page: number, size: number): Observable<AssociateWithdrawalPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AssociateWithdrawalPage>('/api/associates/me/withdrawals', { params });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-history.service.spec.ts'`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/payout-history/payout-history.service.ts frontend/src/app/payout-history/payout-history.service.spec.ts
git commit -m "feat(payout-history): add PayoutHistoryService for wallet balance and withdrawal history"
```

---

## Task 3: `PayoutHistoryComponent`

**Files:**
- Create: `frontend/src/app/payout-history/payout-history.component.ts`
- Test: `frontend/src/app/payout-history/payout-history.component.spec.ts`

**Interfaces:**
- Consumes: `PayoutHistoryService.getWallet()`/`.list()` (Task 2); `AssociateWithdrawalRequest`, `AssociateWithdrawalFilters`, `WalletBalance` (Task 1); `EditableTableComponent`, `InlineBannerComponent` (existing shared components, `frontend/src/app/shared/components/{editable-table,inline-banner}`).
- Produces: `PayoutHistoryComponent` with public `page: AssociateWithdrawalPage | null`, `walletBalance: number | null`, `loadError: boolean`, `historyColumns: EditableTableColumn[]`, `historyRows: Record<string, string>[]`, `onStatusChange(value: string): void`, `goToPage(page: number): void` — consumed only by the route config in Task 4 (no other task imports this component's internals).

- [ ] **Step 1: Write the failing component tests**

```typescript
// frontend/src/app/payout-history/payout-history.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PayoutHistoryComponent } from './payout-history.component';

describe('PayoutHistoryComponent', () => {
  let fixture: ComponentFixture<PayoutHistoryComponent>;
  let httpMock: HttpTestingController;

  const sampleRequest = {
    id: 'w1',
    amount: 5000,
    status: 'DISBURSED',
    reason: null,
    bankReference: 'REF-123',
    requestedAt: '2026-01-05T00:00:00Z',
    decidedAt: '2026-01-06T00:00:00Z',
    disbursedAt: '2026-01-07T00:00:00Z'
  };

  function flushInitialRequests(
    wallet: unknown = { balance: 12500 },
    history: unknown[] = [sampleRequest]
  ): void {
    httpMock.expectOne('/api/associates/me/wallet').flush(wallet);
    httpMock
      .expectOne(r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '0')
      .flush({ requests: history, page: 0, size: 20, totalElements: history.length });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PayoutHistoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PayoutHistoryComponent);
    httpMock = TestBed.inject(HttpTestingController);

    const translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.setTranslation('en', {
      payoutHistory: {
        title: 'Payout History',
        subtitle: 'Your wallet balance and withdrawal request history.',
        walletBalanceLabel: 'Wallet Balance',
        walletLoadError: '—',
        statusFilterLabel: 'Status',
        statusFilterAllOption: 'All statuses',
        statusRequestedOption: 'Requested',
        statusApprovedOption: 'Approved',
        statusRejectedOption: 'Rejected',
        statusDisbursedOption: 'Disbursed',
        columnAmount: 'Amount',
        columnStatus: 'Status',
        columnReason: 'Reason',
        columnBankReference: 'Bank Reference',
        columnRequestedAt: 'Requested At',
        columnDecidedAt: 'Decided At',
        columnDisbursedAt: 'Disbursed At',
        emptyValuePlaceholder: '—',
        loadError: 'Something went wrong loading your payout history. Please try again.',
        emptyState: 'No withdrawal requests to show yet.',
        previousPageAction: 'Previous',
        nextPageAction: 'Next',
        pageIndicator: 'Page {{page}} of {{totalPages}}'
      }
    });
    translateService.use('en');

    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('loads the wallet balance and the first unfiltered page of my withdrawal history on init', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.walletBalance).toBe(12500);
    expect(fixture.componentInstance.page?.requests.length).toBe(1);
  });

  it('displays the wallet balance as formatted currency', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const balanceEl: HTMLElement = fixture.nativeElement.querySelector('.payout-history__balance-value');
    expect(balanceEl.textContent).toContain('12,500');
  });

  it('degrades gracefully without blocking the table when the wallet lookup fails', () => {
    httpMock.expectOne('/api/associates/me/wallet').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '0')
      .flush({ requests: [sampleRequest], page: 0, size: 20, totalElements: 1 });
    fixture.detectChanges();

    expect(fixture.componentInstance.walletBalance).toBeNull();
    expect(fixture.componentInstance.loadError).toBe(false);
    expect(fixture.componentInstance.page?.requests.length).toBe(1);
  });

  it('reloads with the status filter when the status dropdown changes, resetting to page 0', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('REJECTED');

    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/withdrawals' && r.params.get('status') === 'REJECTED' && r.params.get('page') === '0'
    );
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
    expect(fixture.componentInstance.page?.requests.length).toBe(0);
  });

  it('renders a dash for a null reason, decidedAt, and disbursedAt', () => {
    flushInitialRequests({ balance: 0 }, [
      { ...sampleRequest, id: 'w2', status: 'REQUESTED', bankReference: null, decidedAt: null, disbursedAt: null }
    ]);
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('—');
  });

  it('shows a bank reference once a request is DISBURSED', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('REF-123');
  });

  it('formats the amount column as currency, not a raw number', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('5,000');
    expect(rowText).not.toContain('5000');
  });

  it('shows a load error banner when the withdrawal history load fails, without touching the wallet balance', () => {
    httpMock.expectOne('/api/associates/me/wallet').flush({ balance: 12500 });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '0')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    expect(fixture.componentInstance.walletBalance).toBe(12500);
    const bannerEl: HTMLElement | null = fixture.nativeElement.querySelector('app-inline-banner.payout-history__load-error');
    expect(bannerEl).toBeTruthy();
    expect(bannerEl?.querySelector('.inline-banner--danger')).toBeTruthy();
  });

  it('shows an empty-state row when no withdrawal requests match', () => {
    flushInitialRequests({ balance: 0 }, []);
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    flushInitialRequests();
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '1' && r.params.get('size') === '20'
    );
    req.flush({ requests: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('has no action column and no write inputs -- this screen is view-only', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.historyColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-history.component.spec.ts'`
Expected: FAIL — `Cannot find module './payout-history.component'`

- [ ] **Step 3: Write the minimal implementation**

```typescript
// frontend/src/app/payout-history/payout-history.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PayoutHistoryService } from './payout-history.service';
import { AssociateWithdrawalPage, AssociateWithdrawalFilters } from './models/associate-withdrawal-page.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-payout-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="payout-history">
      <div class="payout-history__intro">
        <h1 class="payout-history__title">{{ 'payoutHistory.title' | translate }}</h1>
        <p class="payout-history__subtitle">{{ 'payoutHistory.subtitle' | translate }}</p>
      </div>

      <div class="payout-history__wallet-balance card">
        <span class="payout-history__balance-label">{{ 'payoutHistory.walletBalanceLabel' | translate }}</span>
        <span class="payout-history__balance-value">{{ formattedWalletBalance }}</span>
      </div>

      <div class="payout-history__filters">
        <div class="payout-history__filter-field">
          <label>
            {{ 'payoutHistory.statusFilterLabel' | translate }}
            <select (change)="onStatusChange($any($event.target).value)">
              <option value="">{{ 'payoutHistory.statusFilterAllOption' | translate }}</option>
              <option value="REQUESTED">{{ 'payoutHistory.statusRequestedOption' | translate }}</option>
              <option value="APPROVED">{{ 'payoutHistory.statusApprovedOption' | translate }}</option>
              <option value="REJECTED">{{ 'payoutHistory.statusRejectedOption' | translate }}</option>
              <option value="DISBURSED">{{ 'payoutHistory.statusDisbursedOption' | translate }}</option>
            </select>
          </label>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="payout-history__load-error">
        {{ 'payoutHistory.loadError' | translate }}
      </app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="historyColumns"
          [rows]="historyRows"
          [emptyStateLabel]="'payoutHistory.emptyState' | translate"
        ></app-editable-table>
      </div>

      <div class="payout-history__pagination" *ngIf="page">
        <span class="payout-history__page-indicator">
          {{ 'payoutHistory.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'payoutHistory.previousPageAction' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'payoutHistory.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class PayoutHistoryComponent implements OnInit {
  private payoutHistoryService = inject(PayoutHistoryService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  private datePipe = inject(DatePipe);

  page: AssociateWithdrawalPage | null = null;
  walletBalance: number | null = null;
  loadError = false;
  historyColumns: EditableTableColumn[] = [];
  historyRows: Record<string, string>[] = [];
  private status = '';

  get formattedWalletBalance(): string {
    if (this.walletBalance === null) {
      return this.translate.instant('payoutHistory.walletLoadError');
    }
    return this.formatCurrency(this.walletBalance);
  }

  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.historyColumns = [
      { key: 'amount', label: this.translate.instant('payoutHistory.columnAmount'), type: 'text' },
      { key: 'status', label: this.translate.instant('payoutHistory.columnStatus'), type: 'text' },
      { key: 'reason', label: this.translate.instant('payoutHistory.columnReason'), type: 'text' },
      { key: 'bankReference', label: this.translate.instant('payoutHistory.columnBankReference'), type: 'text' },
      { key: 'requestedAt', label: this.translate.instant('payoutHistory.columnRequestedAt'), type: 'text' },
      { key: 'decidedAt', label: this.translate.instant('payoutHistory.columnDecidedAt'), type: 'text' },
      { key: 'disbursedAt', label: this.translate.instant('payoutHistory.columnDisbursedAt'), type: 'text' }
    ];
    this.loadWallet();
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  // A wallet-lookup failure only degrades the balance display to a placeholder -- it never sets
  // loadError, since it doesn't block the withdrawal-history table (same independent-failure
  // pattern IncomeStatementComponent's cycle lookup uses).
  private loadWallet(): void {
    this.payoutHistoryService.getWallet().subscribe({
      next: res => (this.walletBalance = res.balance),
      error: () => (this.walletBalance = null)
    });
  }

  private loadPage(page: number): void {
    this.loadError = false;
    const filters: AssociateWithdrawalFilters = {};
    if (this.status) {
      filters.status = this.status as AssociateWithdrawalFilters['status'];
    }
    this.payoutHistoryService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private formatCurrency(amount: number): string {
    return this.currencyPipe.transform(amount, 'INR', 'symbol', '1.0-2') ?? String(amount);
  }

  private formatOrDash(value: string | null): string {
    return value ?? this.translate.instant('payoutHistory.emptyValuePlaceholder');
  }

  private updateTableRows(): void {
    this.historyRows = (this.page?.requests ?? []).map(request => ({
      amount: this.formatCurrency(request.amount),
      status: request.status,
      reason: this.formatOrDash(request.reason),
      bankReference: this.formatOrDash(request.bankReference),
      requestedAt: this.datePipe.transform(request.requestedAt, 'medium') ?? request.requestedAt,
      decidedAt: request.decidedAt ? this.datePipe.transform(request.decidedAt, 'medium') ?? request.decidedAt : this.formatOrDash(null),
      disbursedAt: request.disbursedAt ? this.datePipe.transform(request.disbursedAt, 'medium') ?? request.disbursedAt : this.formatOrDash(null)
    }));
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-history.component.spec.ts'`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/payout-history/payout-history.component.ts frontend/src/app/payout-history/payout-history.component.spec.ts
git commit -m "feat(payout-history): add PayoutHistoryComponent for wallet balance + withdrawal history"
```

---

## Task 4: Route, nav link, and translations

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `PayoutHistoryComponent` (Task 3), existing `authGuard`/`associateOnlyGuard` (`frontend/src/app/auth/{auth.guard,associate-only.guard}.ts`).
- Produces: the `/payout-history` route and its nav link — nothing downstream consumes these beyond routing itself.

- [ ] **Step 1: Write the failing route test**

Add to `frontend/src/app/app.routes.spec.ts`, immediately after the existing `'guards the income-statement route...'` test (around line 71):

```typescript
  it('guards the payout-history route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'payout-history');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: FAIL — `route` is `undefined`, `expect(route).toBeTruthy()` fails.

- [ ] **Step 3: Add the route**

In `frontend/src/app/app.routes.ts`, add the import alongside the other associate-screen imports:

```typescript
import { PayoutHistoryComponent } from './payout-history/payout-history.component';
```

Add the route entry immediately after the `income-statement` route:

```typescript
  { path: 'income-statement', component: IncomeStatementComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'payout-history', component: PayoutHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 4: Run the route test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: PASS

- [ ] **Step 5: Write the failing nav-link test**

In `frontend/src/app/app.component.spec.ts`, extend the existing `'shows all associate nav links including Income Statement for a plain associate role'` test's translate-fake map and the expected `links` array:

```typescript
      spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'nav.dashboard': 'Dashboard',
        'nav.myTree': 'My Tree',
        'nav.salesHistory': 'Sales History',
        'nav.plotBookings': 'Plot Bookings',
        'nav.profileKyc': 'Profile',
        'nav.rewards': 'Rewards',
        'nav.digitalIdCard': 'Digital ID Card',
        'nav.incomeStatement': 'Income Statement',
        'nav.payoutHistory': 'Payout History',
        'nav.provisionAssociate': 'Provision Associate',
        'nav.settings': 'Settings',
        'auth.logout': 'Log Out'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav__link')).map(el => el.textContent?.trim());
    expect(links).toEqual([
      'Dashboard', 'My Tree', 'Sales History', 'Plot Bookings', 'Profile', 'Rewards', 'Digital ID Card', 'Income Statement', 'Payout History'
    ]);
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: FAIL — actual `links` array is missing `'Payout History'`.

- [ ] **Step 7: Add the nav link**

In `frontend/src/app/app.component.html`, add immediately after the `income-statement` link (currently the last associate link, line 10):

```html
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/income-statement" routerLinkActive="app-nav__link--active">{{ 'nav.incomeStatement' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/payout-history" routerLinkActive="app-nav__link--active">{{ 'nav.payoutHistory' | translate }}</a>
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: PASS

- [ ] **Step 9: Add translations**

In `frontend/src/assets/i18n/en.json`, add a new `payoutHistory` block immediately after the `incomeStatement` block (after line 192's closing `},`):

```json
  "payoutHistory": {
    "title": "Payout History",
    "subtitle": "Your wallet balance and withdrawal request history.",
    "walletBalanceLabel": "Wallet Balance",
    "walletLoadError": "—",
    "statusFilterLabel": "Status",
    "statusFilterAllOption": "All statuses",
    "statusRequestedOption": "Requested",
    "statusApprovedOption": "Approved",
    "statusRejectedOption": "Rejected",
    "statusDisbursedOption": "Disbursed",
    "columnAmount": "Amount",
    "columnStatus": "Status",
    "columnReason": "Reason",
    "columnBankReference": "Bank Reference",
    "columnRequestedAt": "Requested At",
    "columnDecidedAt": "Decided At",
    "columnDisbursedAt": "Disbursed At",
    "emptyValuePlaceholder": "—",
    "loadError": "Something went wrong loading your payout history. Please try again.",
    "emptyState": "No withdrawal requests to show yet.",
    "previousPageAction": "Previous",
    "nextPageAction": "Next",
    "pageIndicator": "Page {{page}} of {{totalPages}}"
  },
```

And add `"payoutHistory": "Payout History"` to the `nav` block immediately after `"incomeStatement": "Income Statement",`.

In `frontend/src/assets/i18n/hi.json`, add the identical `payoutHistory` block verbatim (same English text, per this plan's Global Constraints precedent decision), and add a real Hindi nav translation: `"payoutHistory": "भुगतान इतिहास"` immediately after `"incomeStatement": "आय विवरण",`.

- [ ] **Step 10: Run the full frontend test suite to verify nothing else broke**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, all suites green.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/app/app.component.html frontend/src/app/app.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(payout-history): wire up route, nav link, and translations"
```

---

## Self-Review

**Spec coverage:**
- "Screen shows the associate's current wallet balance (unit 2)" → Task 3's `loadWallet()` + `formattedWalletBalance` + `.payout-history__wallet-balance` template block.
- "alongside their own withdrawal request history — status, amount, bank reference once DISBURSED, filterable by status (unit 9)" → Task 3's `historyColumns` (amount, status, reason, bankReference, requestedAt, decidedAt, disbursedAt) + `onStatusChange()`.
- "View-only, matching the role-capability matrix's associate read-only posture" → Global Constraints + Task 3's `[readOnly]="true"`, no `actionTemplate`, no form, asserted directly by the "view-only" test.
- Open question (TDS/admin deducted, downloadable PDF statement) → resolved and documented in its own section above, with the orthogonality question against Income Statement's Gross/TDS/Admin/Net data explicitly answered (genuinely orthogonal — verified via `WalletCreditingService.creditWalletsForCycle()` crediting `entry.getNetAmount()`, confirming TDS/admin-deduction arithmetic is already resolved one layer up by the time money reaches a withdrawal request).

**Placeholder scan:** No TBD/TODO/"add appropriate handling" language anywhere above; every step has literal code or literal file content.

**Type consistency:** `AssociateWithdrawalRequest`/`AssociateWithdrawalPage`/`AssociateWithdrawalFilters`/`WalletBalance` (Task 1) are used with identical field names throughout Task 2's service and Task 3's component (`requests`, `balance`, `status`, `amount`, `reason`, `bankReference`, `requestedAt`, `decidedAt`, `disbursedAt`) — no renames introduced downstream. `PayoutHistoryService.getWallet()`/`.list()` signatures introduced in Task 2 are called identically in Task 3. `historyColumns`/`historyRows`/`walletBalance`/`loadError` names introduced in Task 3 are not renamed anywhere else in this plan.
