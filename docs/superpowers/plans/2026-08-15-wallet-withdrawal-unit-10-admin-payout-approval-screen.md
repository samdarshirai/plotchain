# Wallet/Withdrawal Unit 10 — Admin "Ledger / Payout Approval" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin "Ledger / Payout Approval" screen — the single screen covering all four merged withdrawal-request lifecycle endpoints: submit on an associate's behalf (`POST /api/admin/withdrawals`, unit 5), view the paginated/filterable approval queue (`GET /api/admin/withdrawals`, unit 6), approve/reject/cancel-after-approval with a reason (`POST /api/admin/withdrawals/{id}/decision`, unit 7), and disburse an approved request with a manually-entered bank reference (`POST /api/admin/withdrawals/{id}/disburse`, unit 8). All four backend endpoints are merged and stable — this plan is frontend-only, no backend changes.

**Architecture:** Two Angular standalone components + one shared HTTP service, following this codebase's established admin-screen conventions exactly (`SalesRegisterComponent`/`RecordSaleComponent`, `KycQueueComponent`, `LedgerRegisterComponent`, `CycleManagementComponent`):
- `PayoutApprovalComponent` — the queue screen: associate/status filters, a paginated table (`EditableTableComponent`) with a per-row `actionTemplate` whose buttons change based on that row's `status` (`REQUESTED` → Approve / Reject+reason; `APPROVED` → Cancel+reason / Disburse+bank-reference; `REJECTED`/`DISBURSED` → a static status tag, no actions), plus a link to the separate submission page. This mirrors `SalesRegisterComponent`'s status-conditional `actionTemplate` (`RECORDED` → Void+reason / `VOIDED` → tag) extended to four states instead of two.
- `SubmitWithdrawalComponent` — a separate route/page for "submit a withdrawal on a named associate's behalf," a reactive form mirroring `RecordSaleComponent` exactly (same reason a standalone page is right here, not a modal: the action takes real form input — an associate and an amount — the same justification `RecordSaleComponent`'s plan used to split it out of `SalesRegisterComponent`). No modal/dialog component exists anywhere in this codebase (confirmed absent by grep) — this plan does not introduce one.
- `PayoutApprovalService` — one service with `list()`, `submit()`, `decide()`, `disburse()`, mirroring `SalesRegisterService`'s shape (`list()`, `record()`, `voidSale()`) of combining the queue-screen and submission-page calls in one file since both components consume the same withdrawal-request resource.

This plan builds a fully functional, generically-styled screen only (`.card`/`.editable-table`/existing shared-component styling, same bare-bones state every admin screen ships in before its own bespoke design pass) — **no visual design artifact is produced here**; that is a separate `superpowers:frontend-design` phase after this plan is approved and implemented, matching how `docs/superpowers/plans/2026-08-13-cycle-management-screen.md` explicitly staged "Tasks 1–6 build a fully functional, generically-styled screen first... bespoke styling is consistently a separate, later pass" — this plan stops at that same checkpoint and does not include an equivalent "Task 7."

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md`; unit sliced in `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md` section "### 10."

## Global Constraints

- Angular 18.2 standalone components only — no `NgModule`. (Matches every existing component in `frontend/src/app`.)
- No modal/dialog component exists anywhere in this codebase — do not introduce one. The submission flow is a separate route/page (`SubmitWithdrawalComponent`), same precedent as `RecordSaleComponent`; decisions and disbursement are direct inline row actions with no confirmation dialog, matching how `SalesRegisterComponent`'s Void action and `KycQueueComponent`'s reject action both submit directly with no confirm step.
- The queue screen lives inside `SettingsShellComponent` as a `settings` child route (same as `sales-register`, `ledger-register`, `kyc-queue`, `cycle-management`), inheriting `authGuard` + `adminGuard` + `launchedModeGuard` from the parent `settings` route. The submission page needs its own top-level route guarded directly by `authGuard` + `adminGuard` — same shape as `admin/sales/new` (`RecordSaleComponent`) — since pages outside the `settings` shell aren't nested under it.
- Every user-facing string goes through `TranslateModule`/`| translate` with a key added to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Confirmed precedent: feature-copy blocks (`admin.kycQueue.*`, `admin.salesRegister.*`, `admin.recordSale.*`) duplicate the English text verbatim in `hi.json`; `settings.sections.*` nav labels are mixed in practice (`auditLog`/`adminStats`/`salesRegister`/`cycleManagement` got real Hindi, but `associateDirectory`/`treeExplorer`/`kycQueue`/**`ledgerRegister`** — the single most-recently-merged nav entry before this one — were left in English). Since the precedent is genuinely inconsistent and this plan has no reliable Hindi translation to offer, follow the immediately-preceding entry (`ledgerRegister`): leave `settings.sections.payoutApproval` as the English string in `hi.json` too, rather than fabricating a translation.
- Page size: client requests `size=20` by default (matching `PAGE_SIZE` in every existing admin list component); the backend clamps `size` to 100 regardless (`WithdrawalController.list`: `size = Math.min(size, 100)`).
- Dates: `WithdrawalRequest.requestedAt`/`decidedAt`/`disbursedAt` are backend `Instant` fields — they serialize as ISO-8601 timestamp strings (same as `Sale.recordedAt`, `AdminLedgerEntry.createdAt`), so the frontend models type them `string` (nullable for `decidedAt`/`disbursedAt`, which are `null` until a decision/disbursement happens).
- `WithdrawalRequestStatus` is a strict 4-value enum (`REQUESTED`, `APPROVED`, `REJECTED`, `DISBURSED`) with no fifth "hold" value anywhere in the backend (`WithdrawalRequestStatus.java`, Decision 8) — do not add a client-side "hold" affordance or status. There is no bulk-approve/bulk-hold endpoint anywhere in this spec — do not add bulk selection/action UI.
- **Design decision — the PRD's "KYC-blocked list" and "bulk approve/hold" (see spec-slicer's flagged open question):** neither is built. Decision: **omit both entirely, and surface a KYC-blocked associate as an inline 409 error at the point of action** (submission-time via `SubmitWithdrawalComponent`, decision-time via `PayoutApprovalComponent`'s Approve action) rather than synthesizing a client-side "blocked list" view. Justification: there is no backing query anywhere in this spec for "which associates are currently KYC-blocked" — the only way to discover that fact is to attempt a mutating action (submit a withdrawal, or approve one) against a specific associate and see whether `KycNotVerifiedException` comes back. A synthetic "blocked list" screen would have to either (a) invent a client-side re-derivation of KYC status from data this screen has no reason to fetch (duplicating `KycQueueComponent`'s job, which already owns that view), or (b) probe every associate with a real submission attempt just to observe which ones 409 — which is actively unsafe, since a successful submission is not read-only: it atomically **debits the associate's wallet balance** (Decision 10, unit 5). Probing for blocked status by attempting submissions would create real financial side effects as a byproduct of a "just checking" UI action. Bulk approve/hold is omitted for the simpler reason that no bulk endpoint exists at all (`WithdrawalController` only exposes single-`{id}` decision/disburse methods) — inventing bulk client-side by looping individual `POST .../decision` calls was considered and rejected, since partial-failure semantics (3 of 5 approved, 2 failed) have no spec-defined UX and would be scope creep beyond "plan unit 10," not a faithful implementation of a feature this spec never designed.

---

## Part A — File Structure

**New files:**
- `frontend/src/app/admin/models/withdrawal-request.model.ts` — `WithdrawalRequestStatus`, `AdminWithdrawalRequest` (mirrors `WithdrawalRequestStatus.java`/`AdminWithdrawalResponse.java`).
- `frontend/src/app/admin/models/admin-withdrawal-page.model.ts` — `AdminWithdrawalPage`, `AdminWithdrawalFilters` (mirrors `AdminWithdrawalPageResponse.java`).
- `frontend/src/app/admin/models/create-withdrawal-request.model.ts` — `CreateWithdrawalRequest` (mirrors `CreateWithdrawalRequest.java`).
- `frontend/src/app/admin/payout-approval/payout-approval.service.ts` + `.spec.ts`
- `frontend/src/app/admin/payout-approval/payout-approval.component.ts` + `.spec.ts`
- `frontend/src/app/admin/payout-approval/submit-withdrawal.component.ts` + `.spec.ts`

**Modified files:**
- `frontend/src/app/app.routes.ts` — add `admin/withdrawals/new` (top-level, mirrors `admin/sales/new`) and `settings/payout-approval` (child of the `settings` shell, `sectionKey: 'payoutApproval'`).
- `frontend/src/app/app.routes.spec.ts` — cover both new routes.
- `frontend/src/app/settings/settings-nav-rail.component.ts` + `.spec.ts` — add the Payout Approval nav row (after the `ledgerRegister` row, currently the last one).
- `frontend/src/assets/i18n/en.json` / `hi.json` — new `admin.payoutApproval.*` and `admin.submitWithdrawal.*` blocks, plus `settings.sections.payoutApproval`.

**No backend changes** — all four endpoints (`POST /api/admin/withdrawals`, `GET /api/admin/withdrawals`, `POST /api/admin/withdrawals/{id}/decision`, `POST /api/admin/withdrawals/{id}/disburse`) are already merged (`WithdrawalController`, `WithdrawalService`, `WithdrawalExceptionHandler` — verified directly from source in research for this plan).

---

## Task 1: Frontend withdrawal-request models

**Files:**
- Create: `frontend/src/app/admin/models/withdrawal-request.model.ts`
- Create: `frontend/src/app/admin/models/admin-withdrawal-page.model.ts`
- Create: `frontend/src/app/admin/models/create-withdrawal-request.model.ts`

**Interfaces:**
- Produces: `WithdrawalRequestStatus`, `AdminWithdrawalRequest`, `AdminWithdrawalPage`, `AdminWithdrawalFilters`, `CreateWithdrawalRequest` — consumed by Task 2's service and Tasks 3–5's components.

These are plain type-only files (no logic to test) — mirror the real merged backend records field-for-field, confirmed from `backend/src/main/java/com/plotchain/withdrawal/{WithdrawalRequestStatus,AdminWithdrawalResponse,AdminWithdrawalPageResponse,CreateWithdrawalRequest}.java`.

- [ ] **Step 1: Write `withdrawal-request.model.ts`**

```typescript
// Field names mirror the merged backend/src/main/java/com/plotchain/withdrawal/
// AdminWithdrawalResponse.java and WithdrawalRequestStatus.java (wallet/withdrawal units 5/6,
// Decision 14) -- verified field-for-field against the real merged files before this was
// written. reason/bankReference/decidedAt/disbursedAt are all nullable: a fresh REQUESTED row
// has no reason/bankReference/decidedAt/disbursedAt yet; an APPROVED row has decidedAt but not
// bankReference/disbursedAt; only a DISBURSED row has all fields populated.
export type WithdrawalRequestStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'DISBURSED';

export interface AdminWithdrawalRequest {
  id: string;
  associateId: string;
  associateUserId: string;
  associateName: string;
  amount: number;
  status: WithdrawalRequestStatus;
  reason: string | null;
  bankReference: string | null;
  requestedAt: string;
  decidedAt: string | null;
  disbursedAt: string | null;
}
```

- [ ] **Step 2: Write `admin-withdrawal-page.model.ts`**

```typescript
import { AdminWithdrawalRequest, WithdrawalRequestStatus } from './withdrawal-request.model';

// Mirrors backend/src/main/java/com/plotchain/withdrawal/AdminWithdrawalPageResponse.java --
// field named "requests" (not "entries"), per that file's own doc comment on unit 6.
export interface AdminWithdrawalPage {
  requests: AdminWithdrawalRequest[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminWithdrawalFilters {
  associateId?: string;
  status?: WithdrawalRequestStatus | '';
}
```

- [ ] **Step 3: Write `create-withdrawal-request.model.ts`**

```typescript
// Mirrors backend/src/main/java/com/plotchain/withdrawal/CreateWithdrawalRequest.java exactly.
export interface CreateWithdrawalRequest {
  associateId: string;
  amount: number;
}
```

- [ ] **Step 4: Verify the project still compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors (these files aren't imported anywhere yet, so this just checks syntax).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/models/withdrawal-request.model.ts frontend/src/app/admin/models/admin-withdrawal-page.model.ts frontend/src/app/admin/models/create-withdrawal-request.model.ts
git commit -m "feat(withdrawal): add frontend withdrawal-request models"
```

---

## Task 2: PayoutApprovalService

**Files:**
- Create: `frontend/src/app/admin/payout-approval/payout-approval.service.ts`
- Test: `frontend/src/app/admin/payout-approval/payout-approval.service.spec.ts`

**Interfaces:**
- Consumes: `AdminWithdrawalFilters`, `AdminWithdrawalPage`, `AdminWithdrawalRequest`, `CreateWithdrawalRequest`, `WithdrawalRequestStatus` (Task 1).
- Produces: `PayoutApprovalService` with `list(filters: AdminWithdrawalFilters, page: number, size: number): Observable<AdminWithdrawalPage>`, `submit(request: CreateWithdrawalRequest): Observable<AdminWithdrawalRequest>`, `decide(id: string, decision: 'APPROVED' | 'REJECTED', reason?: string): Observable<AdminWithdrawalRequest>`, `disburse(id: string, bankReference: string): Observable<AdminWithdrawalRequest>` — consumed by Tasks 3–5.

- [ ] **Step 1: Write the failing test**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PayoutApprovalService } from './payout-approval.service';
import { AdminWithdrawalPage } from '../models/admin-withdrawal-page.model';
import { AdminWithdrawalRequest } from '../models/withdrawal-request.model';

describe('PayoutApprovalService', () => {
  let service: PayoutApprovalService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PayoutApprovalService]
    });
    service = TestBed.inject(PayoutApprovalService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists withdrawal requests with filters and pagination as query params', () => {
    const mockResponse: AdminWithdrawalPage = { requests: [], page: 0, size: 20, totalElements: 0 };

    service.list({ associateId: 'a1', status: 'REQUESTED' }, 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/withdrawals' && r.params.get('associateId') === 'a1' && r.params.get('status') === 'REQUESTED'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined or empty', () => {
    service.list({ status: '' }, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/withdrawals?page=0&size=20');
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('submits a withdrawal request on an associate\'s behalf', () => {
    const mockRequest = { id: 'w1', status: 'REQUESTED' } as AdminWithdrawalRequest;

    service.submit({ associateId: 'a1', amount: 5000 }).subscribe(res => expect(res).toEqual(mockRequest));

    const req = httpMock.expectOne('/api/admin/withdrawals');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ associateId: 'a1', amount: 5000 });
    req.flush(mockRequest);
  });

  it('decides (approves) a withdrawal request with no reason', () => {
    const mockRequest = { id: 'w1', status: 'APPROVED' } as AdminWithdrawalRequest;

    service.decide('w1', 'APPROVED').subscribe(res => expect(res).toEqual(mockRequest));

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ decision: 'APPROVED', reason: undefined });
    req.flush(mockRequest);
  });

  it('decides (rejects/cancels) a withdrawal request with a reason', () => {
    const mockRequest = { id: 'w1', status: 'REJECTED' } as AdminWithdrawalRequest;

    service.decide('w1', 'REJECTED', 'Duplicate request').subscribe(res => expect(res).toEqual(mockRequest));

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Duplicate request' });
    req.flush(mockRequest);
  });

  it('disburses an approved withdrawal request with a bank reference', () => {
    const mockRequest = { id: 'w1', status: 'DISBURSED' } as AdminWithdrawalRequest;

    service.disburse('w1', 'NEFT-12345').subscribe(res => expect(res).toEqual(mockRequest));

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/disburse');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ bankReference: 'NEFT-12345' });
    req.flush(mockRequest);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-approval.service.spec.ts'`
Expected: FAIL — `Cannot find module './payout-approval.service'`.

- [ ] **Step 3: Write the implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminWithdrawalFilters, AdminWithdrawalPage } from '../models/admin-withdrawal-page.model';
import { AdminWithdrawalRequest } from '../models/withdrawal-request.model';
import { CreateWithdrawalRequest } from '../models/create-withdrawal-request.model';

@Injectable({ providedIn: 'root' })
export class PayoutApprovalService {
  private http = inject(HttpClient);

  list(filters: AdminWithdrawalFilters, page: number, size: number): Observable<AdminWithdrawalPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminWithdrawalPage>('/api/admin/withdrawals', { params });
  }

  submit(request: CreateWithdrawalRequest): Observable<AdminWithdrawalRequest> {
    return this.http.post<AdminWithdrawalRequest>('/api/admin/withdrawals', request);
  }

  decide(id: string, decision: 'APPROVED' | 'REJECTED', reason?: string): Observable<AdminWithdrawalRequest> {
    return this.http.post<AdminWithdrawalRequest>(`/api/admin/withdrawals/${id}/decision`, { decision, reason });
  }

  disburse(id: string, bankReference: string): Observable<AdminWithdrawalRequest> {
    return this.http.post<AdminWithdrawalRequest>(`/api/admin/withdrawals/${id}/disburse`, { bankReference });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-approval.service.spec.ts'`
Expected: PASS (6 specs).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/payout-approval/payout-approval.service.ts frontend/src/app/admin/payout-approval/payout-approval.service.spec.ts
git commit -m "feat(withdrawal): add PayoutApprovalService"
```

---

## Task 3: PayoutApprovalComponent — queue list, filters, pagination

**Files:**
- Create: `frontend/src/app/admin/payout-approval/payout-approval.component.ts`
- Test: `frontend/src/app/admin/payout-approval/payout-approval.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `PayoutApprovalService.list()` (Task 2), `AdminService.listAssociates()` (existing, `frontend/src/app/admin/admin.service.ts`), `EditableTableComponent` (`readOnly`, `columns`, `rows`, `emptyStateLabel` — `frontend/src/app/shared/components/editable-table/editable-table.component.ts`), `InlineBannerComponent` (`frontend/src/app/shared/components/inline-banner/inline-banner.component.ts`).
- Produces: `PayoutApprovalComponent` with public `page: AdminWithdrawalPage | null`, `loadError: boolean`, `associates: AssociateSummary[]`, `registerColumns`, `registerRows`, `goToPage(page: number)`, `onAssociateIdChange(value: string)`, `onStatusChange(value: string)` — Task 4 extends this same component/file with per-row actions; Task 6 routes to it as `sectionKey: 'payoutApproval'`.

- [ ] **Step 1: Add the required i18n keys**

In `frontend/src/assets/i18n/en.json`, inside the top-level `"admin"` object (alongside the existing `salesRegister`/`ledgerRegister` blocks), add:

```json
    "payoutApproval": {
      "title": "Payout Approval",
      "subtitle": "Review, approve, reject, and disburse associate withdrawal requests.",
      "submitLink": "+ Submit Withdrawal",
      "associateFilterLabel": "Associate",
      "associateFilterAllOption": "All associates",
      "statusFilterLabel": "Status",
      "statusFilterAllOption": "All statuses",
      "statusRequestedOption": "Requested",
      "statusApprovedOption": "Approved",
      "statusRejectedOption": "Rejected",
      "statusDisbursedOption": "Disbursed",
      "columnAssociate": "Associate",
      "columnAmount": "Amount",
      "columnStatus": "Status",
      "columnReason": "Reason",
      "columnBankReference": "Bank Reference",
      "columnRequestedAt": "Requested At",
      "columnActions": "Actions",
      "noReason": "—",
      "noBankReference": "—",
      "loadError": "Something went wrong loading the payout approval queue. Please try again.",
      "previousPageAction": "Previous",
      "nextPageAction": "Next",
      "pageIndicator": "Page {{page}} of {{totalPages}}",
      "emptyState": "No withdrawal requests match these filters."
    },
```

Add the same block verbatim to `frontend/src/assets/i18n/hi.json` (matching the `kycQueue`/`salesRegister`/`ledgerRegister` precedent there, which duplicates the English text rather than translating it — see this plan's Global Constraints).

- [ ] **Step 2: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PayoutApprovalComponent } from './payout-approval.component';

describe('PayoutApprovalComponent', () => {
  let fixture: ComponentFixture<PayoutApprovalComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PayoutApprovalComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PayoutApprovalComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([
      { id: 'a1', userId: 'VP00001', name: 'Jane Doe' }
    ]);
    httpMock.expectOne('/api/admin/withdrawals?page=0&size=20').flush({
      requests: [
        {
          id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
          amount: 5000, status: 'REQUESTED', reason: null, bankReference: null,
          requestedAt: '2026-08-15T00:00:00Z', decidedAt: null, disbursedAt: null
        }
      ],
      page: 0, size: 20, totalElements: 1
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of the queue on init', () => {
    expect(fixture.componentInstance.page?.requests.length).toBe(1);
  });

  it('reloads with the associate filter when it changes', () => {
    fixture.componentInstance.onAssociateIdChange('a1');

    const req = httpMock.expectOne(r => r.url === '/api/admin/withdrawals' && r.params.get('associateId') === 'a1');
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the status filter when it changes', () => {
    fixture.componentInstance.onStatusChange('APPROVED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/withdrawals' && r.params.get('status') === 'APPROVED');
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('combines associate and status filters', () => {
    fixture.componentInstance.onAssociateIdChange('a1');
    httpMock.expectOne(r => r.params.get('associateId') === 'a1').flush({ requests: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onStatusChange('DISBURSED');
    const req = httpMock.expectOne(
      r => r.url === '/api/admin/withdrawals' && r.params.get('associateId') === 'a1' && r.params.get('status') === 'DISBURSED'
    );
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows a load error when the reload fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/admin/withdrawals?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.payout-approval__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/admin/withdrawals?page=1&size=20');
    req.flush({ requests: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when no requests match', () => {
    fixture.componentInstance.onStatusChange('REJECTED');
    httpMock.expectOne(r => r.params.get('status') === 'REJECTED').flush({ requests: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('formats the associate column as "userId — name"', () => {
    expect(fixture.componentInstance.registerRows[0]['associate']).toBe('VP00001 — Jane Doe');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-approval.component.spec.ts'`
Expected: FAIL — `Cannot find module './payout-approval.component'`.

- [ ] **Step 4: Write the implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { PayoutApprovalService } from './payout-approval.service';
import { AdminWithdrawalPage, AdminWithdrawalFilters } from '../models/admin-withdrawal-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-payout-approval',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="payout-approval">
      <div class="payout-approval__header">
        <h1 class="card-title">{{ 'admin.payoutApproval.title' | translate }}</h1>
        <p class="payout-approval__subtitle">{{ 'admin.payoutApproval.subtitle' | translate }}</p>
        <a class="payout-approval__submit-link brand-button" [routerLink]="['/admin/withdrawals/new']">
          {{ 'admin.payoutApproval.submitLink' | translate }}
        </a>
      </div>

      <div class="payout-approval__filters">
        <label>
          {{ 'admin.payoutApproval.associateFilterLabel' | translate }}
          <select (change)="onAssociateIdChange($any($event.target).value)">
            <option value="">{{ 'admin.payoutApproval.associateFilterAllOption' | translate }}</option>
            <option *ngFor="let associate of associates" [value]="associate.id">
              {{ associate.userId }} — {{ associate.name }}
            </option>
          </select>
        </label>
        <label>
          {{ 'admin.payoutApproval.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.payoutApproval.statusFilterAllOption' | translate }}</option>
            <option value="REQUESTED">{{ 'admin.payoutApproval.statusRequestedOption' | translate }}</option>
            <option value="APPROVED">{{ 'admin.payoutApproval.statusApprovedOption' | translate }}</option>
            <option value="REJECTED">{{ 'admin.payoutApproval.statusRejectedOption' | translate }}</option>
            <option value="DISBURSED">{{ 'admin.payoutApproval.statusDisbursedOption' | translate }}</option>
          </select>
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" class="payout-approval__load-error" (dismissed)="loadError = false">{{ 'admin.payoutApproval.loadError' | translate }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="registerColumns"
          [rows]="registerRows"
          [emptyStateLabel]="'admin.payoutApproval.emptyState' | translate"
        ></app-editable-table>
      </div>

      <div class="payout-approval__pagination" *ngIf="page">
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.payoutApproval.previousPageAction' | translate }}
        </button>
        <span class="payout-approval__page-indicator">
          {{ 'admin.payoutApproval.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.payoutApproval.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class PayoutApprovalComponent implements OnInit {
  private payoutApprovalService = inject(PayoutApprovalService);
  private adminService = inject(AdminService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  protected datePipe = inject(DatePipe);

  page: AdminWithdrawalPage | null = null;
  loadError = false;
  associates: AssociateSummary[] = [];
  registerColumns: EditableTableColumn[] = [];
  registerRows: Record<string, string>[] = [];
  private associateId = '';
  private status = '';

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
    this.registerColumns = [
      { key: 'associate', label: this.translate.instant('admin.payoutApproval.columnAssociate'), type: 'text' },
      { key: 'amount', label: this.translate.instant('admin.payoutApproval.columnAmount'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.payoutApproval.columnStatus'), type: 'text' },
      { key: 'reason', label: this.translate.instant('admin.payoutApproval.columnReason'), type: 'text' },
      { key: 'bankReference', label: this.translate.instant('admin.payoutApproval.columnBankReference'), type: 'text' },
      { key: 'requestedAt', label: this.translate.instant('admin.payoutApproval.columnRequestedAt'), type: 'text' }
    ];
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
    this.loadPage(0);
  }

  onAssociateIdChange(value: string): void {
    this.associateId = value;
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  protected loadPage(page: number): void {
    this.loadError = false;
    const filters: AdminWithdrawalFilters = {};
    if (this.associateId) filters.associateId = this.associateId;
    if (this.status) filters.status = this.status as AdminWithdrawalFilters['status'];
    this.payoutApprovalService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.registerRows = (this.page?.requests ?? []).map(request => ({
      associate: `${request.associateUserId} — ${request.associateName}`,
      amount: this.currencyPipe.transform(request.amount, 'INR', 'symbol', '1.0-2') ?? String(request.amount),
      status: request.status,
      reason: request.reason ?? this.translate.instant('admin.payoutApproval.noReason'),
      bankReference: request.bankReference ?? this.translate.instant('admin.payoutApproval.noBankReference'),
      requestedAt: this.datePipe.transform(request.requestedAt, 'medium') ?? request.requestedAt
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-approval.component.spec.ts'`
Expected: PASS (8 specs).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/payout-approval/payout-approval.component.ts frontend/src/app/admin/payout-approval/payout-approval.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(withdrawal): add PayoutApprovalComponent queue list/filter/pagination"
```

---

## Task 4: PayoutApprovalComponent — per-row status-driven actions (approve/reject/cancel/disburse)

**Files:**
- Modify: `frontend/src/app/admin/payout-approval/payout-approval.component.ts`
- Modify: `frontend/src/app/admin/payout-approval/payout-approval.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `PayoutApprovalService.decide()`, `PayoutApprovalService.disburse()` (Task 2).
- Produces: adds `actionError: boolean`, `decisionReasons: Record<string, string>`, `bankReferences: Record<string, string>`, `approve(id: string): void`, `reject(id: string): void`, `disburse(id: string): void` to `PayoutApprovalComponent` (Task 3) — no further consumers beyond this component; Task 6 routes to the finished component.

This is the state-machine-driven part of the screen (per this unit's acceptance criteria: "View reflects the actual state machine... no distinct 'hold' affordance, no bulk approve/hold action"). The `actionsTpl` branches on each row's live `status`:
- `REQUESTED` → an **Approve** button (`decide(id, 'APPROVED')`, no reason needed — `WithdrawalDecisionRequest.reason` is only required by the backend when `decision === REJECTED`) and a **Reject** button with a reason input (`decide(id, 'REJECTED', reason)`).
- `APPROVED` → a **Cancel** button with a reason input (same call, `decide(id, 'REJECTED', reason)` — the backend's `InvalidWithdrawalStateException`/audit-log distinguish "rejected" vs "cancelled after approval" purely from the row's prior status server-side, so the UI just needs a differently-labeled button calling the identical endpoint) and a **Disburse** button with a bank-reference input (`disburse(id, bankReference)`).
- `REJECTED` / `DISBURSED` → a static status tag, no inputs or buttons (mirrors `SalesRegisterComponent`'s `voidedTpl` else-branch for its terminal `VOIDED` state).

Reason/bank-reference inputs are kept in row-keyed maps (`decisionReasons`, `bankReferences`), the same pattern `KycQueueComponent.rejectReasons` and `SalesRegisterComponent.voidReasons` already use — confirmed by that codebase's own regression test (`kyc-queue.component.spec.ts`, "accumulates sequential keystrokes... (regression)") that `rows`/`columns` must stay stable references across change-detection cycles for `ngModel`-bound inputs inside `*ngFor` rows to keep focus; this task's `updateTableRows()` (from Task 3) is a plain method assigning a new array once per load, not a getter recomputed every CD tick, so it does not reintroduce that bug.

- [ ] **Step 1: Add the required i18n keys**

Add to the `admin.payoutApproval` block in both `en.json` and `hi.json` (same duplication rule as Task 3):

```json
      "approveAction": "Approve",
      "rejectAction": "Reject",
      "cancelAction": "Cancel",
      "disburseAction": "Disburse",
      "rejectReasonPlaceholder": "Reason for rejection",
      "cancelReasonPlaceholder": "Reason for cancellation",
      "bankReferencePlaceholder": "Bank reference",
      "rejectedTag": "Rejected",
      "disbursedTag": "Disbursed",
      "actionError": "Could not save that action. Please try again."
```

- [ ] **Step 2: Write the failing test (append to `payout-approval.component.spec.ts`)**

```typescript
  it('shows Approve and Reject actions for a REQUESTED row', () => {
    fixture.detectChanges();
    const approveButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.payout-approval__approve-action');
    const rejectButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.payout-approval__reject-action');
    expect(approveButton).toBeTruthy();
    expect(rejectButton).toBeTruthy();
  });

  it('approves a REQUESTED row with no reason and reloads the page', () => {
    fixture.componentInstance.approve('w1');

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    expect(req.request.body).toEqual({ decision: 'APPROVED', reason: undefined });
    req.flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'APPROVED', reason: null, bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
    });

    const reload = httpMock.expectOne('/api/admin/withdrawals?page=0&size=20');
    reload.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('rejects a REQUESTED row with a reason', () => {
    fixture.componentInstance.decisionReasons['w1'] = 'Duplicate request';
    fixture.componentInstance.reject('w1');

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Duplicate request' });
    req.flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REJECTED', reason: 'Duplicate request', bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
    });

    const reload = httpMock.expectOne('/api/admin/withdrawals?page=0&size=20');
    reload.flush({ requests: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.decisionReasons['w1']).toBeUndefined();
  });

  it('shows Cancel and Disburse actions for an APPROVED row', () => {
    fixture.componentInstance.onStatusChange('APPROVED');
    httpMock.expectOne(r => r.params.get('status') === 'APPROVED').flush({
      requests: [{
        id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
        amount: 5000, status: 'APPROVED', reason: null, bankReference: null,
        requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    const cancelButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.payout-approval__cancel-action');
    const disburseButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.payout-approval__disburse-action');
    expect(cancelButton).toBeTruthy();
    expect(disburseButton).toBeTruthy();
  });

  it('cancels an APPROVED row with a reason using the same decide() call as reject', () => {
    fixture.componentInstance.decisionReasons['w2'] = 'Associate requested cancellation';
    fixture.componentInstance.reject('w2');

    const req = httpMock.expectOne('/api/admin/withdrawals/w2/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Associate requested cancellation' });
    req.flush({
      id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REJECTED', reason: 'Associate requested cancellation', bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
    });

    httpMock.expectOne('/api/admin/withdrawals?page=0&size=20').flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('disburses an APPROVED row with a bank reference', () => {
    fixture.componentInstance.bankReferences['w2'] = 'NEFT-99887';
    fixture.componentInstance.disburse('w2');

    const req = httpMock.expectOne('/api/admin/withdrawals/w2/disburse');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ bankReference: 'NEFT-99887' });
    req.flush({
      id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'DISBURSED', reason: null, bankReference: 'NEFT-99887',
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: '2026-08-15T02:00:00Z'
    });

    httpMock.expectOne('/api/admin/withdrawals?page=0&size=20').flush({ requests: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.bankReferences['w2']).toBeUndefined();
  });

  it('shows no action buttons for a REJECTED or DISBURSED row', () => {
    fixture.componentInstance.onStatusChange('REJECTED');
    httpMock.expectOne(r => r.params.get('status') === 'REJECTED').flush({
      requests: [{
        id: 'w3', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
        amount: 5000, status: 'REJECTED', reason: 'No longer needed', bankReference: null,
        requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.payout-approval__approve-action')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.payout-approval__reject-action')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.payout-approval__cancel-action')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.payout-approval__disburse-action')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.payout-approval__status-tag')?.textContent?.trim()).toBeTruthy();
  });

  it('shows an action error when a decision fails, without silently doing nothing', () => {
    fixture.componentInstance.approve('w1');

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.payout-approval__action-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows an action error when a disburse fails, without silently doing nothing', () => {
    fixture.componentInstance.bankReferences['w2'] = 'NEFT-99887';
    fixture.componentInstance.disburse('w2');

    const req = httpMock.expectOne('/api/admin/withdrawals/w2/disburse');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError).toBe(true);
  });

  it('keeps each row\'s reason/bank-reference state independent', () => {
    fixture.componentInstance.decisionReasons['w1'] = 'Reason for w1';
    fixture.componentInstance.decisionReasons['w2'] = 'Reason for w2';
    fixture.componentInstance.bankReferences['w2'] = 'NEFT-1';

    fixture.componentInstance.reject('w1');
    httpMock.expectOne('/api/admin/withdrawals/w1/decision').flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REJECTED', reason: 'Reason for w1', bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
    });
    httpMock.expectOne('/api/admin/withdrawals?page=0&size=20').flush({ requests: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.decisionReasons['w1']).toBeUndefined();
    expect(fixture.componentInstance.decisionReasons['w2']).toBe('Reason for w2');
    expect(fixture.componentInstance.bankReferences['w2']).toBe('NEFT-1');
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-approval.component.spec.ts'`
Expected: FAIL — `approve`/`reject`/`disburse`/`decisionReasons`/`bankReferences`/`actionError` undefined, action-button/status-tag selectors not found.

- [ ] **Step 4: Write the implementation**

Add an Actions column, an `actionsTpl`, a status-tag else-branch, and the new state/methods:

```typescript
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
// ... existing imports from Task 3

@Component({
  selector: 'app-payout-approval',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, RouterLink, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="payout-approval">
      <!-- ...header, filters unchanged from Task 3... -->

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" class="payout-approval__load-error" (dismissed)="loadError = false">{{ 'admin.payoutApproval.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="actionError" tone="danger" [dismissible]="true" class="payout-approval__action-error" (dismissed)="actionError = false">{{ 'admin.payoutApproval.actionError' | translate }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="registerColumns"
          [rows]="registerRows"
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.payoutApproval.emptyState' | translate"
        ></app-editable-table>
      </div>
      <ng-template #actionsTpl let-i="index">
        <ng-container [ngSwitch]="page!.requests[i].status">
          <ng-container *ngSwitchCase="'REQUESTED'">
            <button type="button" class="payout-approval__approve-action brand-button brand-button--secondary" (click)="approve(page!.requests[i].id)">
              {{ 'admin.payoutApproval.approveAction' | translate }}
            </button>
            <input
              type="text"
              class="payout-approval__reason-input"
              [(ngModel)]="decisionReasons[page!.requests[i].id]"
              [placeholder]="'admin.payoutApproval.rejectReasonPlaceholder' | translate"
            />
            <button type="button" class="payout-approval__reject-action brand-button brand-button--danger" (click)="reject(page!.requests[i].id)">
              {{ 'admin.payoutApproval.rejectAction' | translate }}
            </button>
          </ng-container>
          <ng-container *ngSwitchCase="'APPROVED'">
            <input
              type="text"
              class="payout-approval__reason-input"
              [(ngModel)]="decisionReasons[page!.requests[i].id]"
              [placeholder]="'admin.payoutApproval.cancelReasonPlaceholder' | translate"
            />
            <button type="button" class="payout-approval__cancel-action brand-button brand-button--danger" (click)="reject(page!.requests[i].id)">
              {{ 'admin.payoutApproval.cancelAction' | translate }}
            </button>
            <input
              type="text"
              class="payout-approval__bank-reference-input"
              [(ngModel)]="bankReferences[page!.requests[i].id]"
              [placeholder]="'admin.payoutApproval.bankReferencePlaceholder' | translate"
            />
            <button type="button" class="payout-approval__disburse-action brand-button brand-button--secondary" (click)="disburse(page!.requests[i].id)">
              {{ 'admin.payoutApproval.disburseAction' | translate }}
            </button>
          </ng-container>
          <span *ngSwitchCase="'REJECTED'" class="payout-approval__status-tag">{{ 'admin.payoutApproval.rejectedTag' | translate }}</span>
          <span *ngSwitchCase="'DISBURSED'" class="payout-approval__status-tag">{{ 'admin.payoutApproval.disbursedTag' | translate }}</span>
        </ng-container>
      </ng-template>

      <!-- ...pagination unchanged from Task 3... -->
    </div>
  `
})
export class PayoutApprovalComponent implements OnInit {
  // ...existing injects/fields from Task 3...
  actionError = false;
  decisionReasons: Record<string, string> = {};
  bankReferences: Record<string, string> = {};

  ngOnInit(): void {
    this.registerColumns = [
      // ...same columns as Task 3...
      { key: 'associate', label: this.translate.instant('admin.payoutApproval.columnAssociate'), type: 'text' },
      { key: 'amount', label: this.translate.instant('admin.payoutApproval.columnAmount'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.payoutApproval.columnStatus'), type: 'text' },
      { key: 'reason', label: this.translate.instant('admin.payoutApproval.columnReason'), type: 'text' },
      { key: 'bankReference', label: this.translate.instant('admin.payoutApproval.columnBankReference'), type: 'text' },
      { key: 'requestedAt', label: this.translate.instant('admin.payoutApproval.columnRequestedAt'), type: 'text' },
      { key: 'actions', label: this.translate.instant('admin.payoutApproval.columnActions'), type: 'action' }
    ];
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
    this.loadPage(0);
  }

  // ...existing onAssociateIdChange/onStatusChange/goToPage/loadPage/updateTableRows from Task 3...

  approve(id: string): void {
    this.actionError = false;
    this.payoutApprovalService.decide(id, 'APPROVED').subscribe({
      next: () => this.loadPage(this.page?.page ?? 0),
      error: () => (this.actionError = true)
    });
  }

  reject(id: string): void {
    this.actionError = false;
    this.payoutApprovalService.decide(id, 'REJECTED', this.decisionReasons[id]).subscribe({
      next: () => {
        delete this.decisionReasons[id];
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.actionError = true)
    });
  }

  disburse(id: string): void {
    this.actionError = false;
    this.payoutApprovalService.disburse(id, this.bankReferences[id] ?? '').subscribe({
      next: () => {
        delete this.bankReferences[id];
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.actionError = true)
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/payout-approval.component.spec.ts'`
Expected: PASS (18 specs total).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/payout-approval/payout-approval.component.ts frontend/src/app/admin/payout-approval/payout-approval.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(withdrawal): add status-driven row actions to PayoutApprovalComponent"
```

---

## Task 5: SubmitWithdrawalComponent — submit a withdrawal on an associate's behalf

**Files:**
- Create: `frontend/src/app/admin/payout-approval/submit-withdrawal.component.ts`
- Test: `frontend/src/app/admin/payout-approval/submit-withdrawal.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `PayoutApprovalService.submit()` (Task 2), `AdminService.listAssociates()` (existing), `toFieldErrors` (existing, `frontend/src/app/core/api/field-errors.model.ts`), `FieldErrorComponent`, `InlineBannerComponent`, `BrandButtonComponent` (existing shared components).
- Produces: `SubmitWithdrawalComponent` — a standalone route target consumed only by Task 6's routing (no other component depends on it).

Mirrors `RecordSaleComponent` exactly: a reactive form (`associateId`, `amount`), a success banner showing the created request (including its `status`, since an auto-approved request per the domain spec's `AUTO_UNDER_LIMIT` mode comes back already `APPROVED`, not `REQUESTED` — the admin needs to see that distinction immediately rather than assume every submission lands in the queue as pending), and error handling split three ways: (1) 400 field-level validation errors via `toFieldErrors` exactly like `RecordSaleComponent`; (2) a 409 conflict, where **this task shows the backend's own message text** (`err.error?.error`) rather than a generic string — this is the concrete resolution of this unit's "KYC-blocked" open question (see this plan's Global Constraints): `KycNotVerifiedException`/`AssociateSuspendedException`/`BelowMinimumWithdrawalException`/`InsufficientWalletBalanceException` all produce a specific, actionable, already-human-readable message server-side, and showing it directly here means an admin who tries to submit for a KYC-blocked associate finds out exactly why at the one interaction that matters, without this plan building a separate always-there "blocked list" nobody asked the backend to support; (3) any other failure gets a generic message, same pattern as `RecordSaleComponent`'s final `else` branch.

- [ ] **Step 1: Add the required i18n keys**

In `frontend/src/assets/i18n/en.json`, inside the top-level `"admin"` object, add:

```json
    "submitWithdrawal": {
      "title": "Submit Withdrawal",
      "subtitle": "Submit a withdrawal request on an associate's behalf.",
      "associateLabel": "Associate",
      "associatePlaceholder": "Select an associate",
      "amountLabel": "Amount",
      "submitButton": "Submit Withdrawal",
      "submitAnotherButton": "Submit Another",
      "successIdLabel": "Request ID",
      "successAssociateLabel": "Associate",
      "successAmountLabel": "Amount",
      "successStatusLabel": "Status",
      "validation": {
        "required": "This field is required.",
        "genericSubmitError": "Could not submit this withdrawal. Please try again."
      }
    },
```

Add the same block verbatim to `frontend/src/assets/i18n/hi.json`.

- [ ] **Step 2: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SubmitWithdrawalComponent } from './submit-withdrawal.component';

describe('SubmitWithdrawalComponent', () => {
  let fixture: ComponentFixture<SubmitWithdrawalComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubmitWithdrawalComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SubmitWithdrawalComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET')
      .flush([{ id: 'a1', userId: 'VP00001', name: 'Jane Doe' }]);
  });

  afterEach(() => httpMock.verify());

  it('submits the form and shows a success banner with the created request, including its status', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ associateId: 'a1', amount: 5000 });
    req.flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REQUESTED', reason: null, bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: null, disbursedAt: null
    });

    expect(fixture.componentInstance.submitted?.id).toBe('w1');
    expect(fixture.componentInstance.submitted?.status).toBe('REQUESTED');
    expect(fixture.componentInstance.submitError).toBeNull();
  });

  it('shows an auto-approved status when the backend returns one', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 100 });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/admin/withdrawals').flush({
      id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 100, status: 'APPROVED', reason: null, bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T00:00:00Z', disbursedAt: null
    });

    expect(fixture.componentInstance.submitted?.status).toBe('APPROVED');
  });

  it('does not submit when the form is invalid', () => {
    fixture.componentInstance.form.patchValue({ associateId: '', amount: null });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/admin/withdrawals');
    expect(fixture.componentInstance.submitted).toBeNull();
  });

  it('shows field errors on a 400 validation failure', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    req.flush({ error: 'Validation failed', fields: { amount: 'Amount must be positive' } }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.fieldError('amount')).toBe('Amount must be positive');
  });

  it('shows the backend\'s own message on a 409 conflict (e.g. KYC not verified) so a blocked associate is discoverable at the point of action', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    req.flush({ error: 'Associate KYC is not verified: a1' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.submitError).toBe('Associate KYC is not verified: a1');
  });

  it('shows a generic error on a non-400/409 failure', () => {
    fixture.componentInstance.form.patchValue({ associateId: 'a1', amount: 5000 });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/withdrawals');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    // No translateService.setTranslation() call in this spec's beforeEach (matching
    // record-sale.component.spec.ts's own convention) -- TranslateModule.forRoot() with no
    // loaded translations makes translate.instant() return the key itself, not real English
    // text, so this asserts presence/truthiness rather than an exact string.
    expect(fixture.componentInstance.submitError).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/submit-withdrawal.component.spec.ts'`
Expected: FAIL — `Cannot find module './submit-withdrawal.component'`.

- [ ] **Step 4: Write the implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PayoutApprovalService } from './payout-approval.service';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { AdminWithdrawalRequest } from '../models/withdrawal-request.model';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../../shared/components/brand-button/brand-button.component';

@Component({
  selector: 'app-submit-withdrawal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent, BrandButtonComponent],
  template: `
    <div class="submit-withdrawal">
      <div class="submit-withdrawal__intro">
        <h1 class="submit-withdrawal__title">{{ 'admin.submitWithdrawal.title' | translate }}</h1>
        <p class="submit-withdrawal__subtitle">{{ 'admin.submitWithdrawal.subtitle' | translate }}</p>
      </div>

      <app-inline-banner *ngIf="submitted" tone="success">
        <p>{{ 'admin.submitWithdrawal.successIdLabel' | translate }}: <strong>{{ submitted.id }}</strong></p>
        <p>{{ 'admin.submitWithdrawal.successAssociateLabel' | translate }}: <strong>{{ submitted.associateUserId }} — {{ submitted.associateName }}</strong></p>
        <p>{{ 'admin.submitWithdrawal.successAmountLabel' | translate }}: <strong>{{ submitted.amount }}</strong></p>
        <p>{{ 'admin.submitWithdrawal.successStatusLabel' | translate }}: <strong>{{ submitted.status }}</strong></p>
        <app-brand-button type="button" variant="secondary" (clicked)="dismissBanner()">
          {{ 'admin.submitWithdrawal.submitAnotherButton' | translate }}
        </app-brand-button>
      </app-inline-banner>

      <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

      <form class="card submit-withdrawal__form" [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="submit-withdrawal__field">
          <label>{{ 'admin.submitWithdrawal.associateLabel' | translate }}</label>
          <select formControlName="associateId" (blur)="markTouched('associateId')">
            <option value="">{{ 'admin.submitWithdrawal.associatePlaceholder' | translate }}</option>
            <option *ngFor="let associate of associates" [value]="associate.id">
              {{ associate.userId }} — {{ associate.name }}
            </option>
          </select>
          <app-field-error [message]="fieldError('associateId')"></app-field-error>
        </div>

        <div class="submit-withdrawal__field">
          <label>{{ 'admin.submitWithdrawal.amountLabel' | translate }}</label>
          <input type="number" formControlName="amount" (blur)="markTouched('amount')" />
          <app-field-error [message]="fieldError('amount')"></app-field-error>
        </div>

        <div class="submit-withdrawal__actions">
          <app-brand-button type="submit" variant="primary" [disabled]="form.invalid">
            {{ 'admin.submitWithdrawal.submitButton' | translate }}
          </app-brand-button>
        </div>
      </form>
    </div>
  `
})
export class SubmitWithdrawalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private payoutApprovalService = inject(PayoutApprovalService);
  private adminService = inject(AdminService);
  private translate = inject(TranslateService);

  form = this.fb.nonNullable.group({
    associateId: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]]
  });

  submitted: AdminWithdrawalRequest | null = null;
  submitError: string | null = null;
  associates: AssociateSummary[] = [];
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
  }

  markTouched(name: string): void {
    this.form.get(name)?.markAsTouched();
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('admin.submitWithdrawal.validation.required');
    }
    return undefined;
  }

  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { associateId, amount } = this.form.getRawValue();
    this.payoutApprovalService.submit({ associateId, amount: amount as number }).subscribe({
      next: request => {
        this.submitted = request;
        this.serverFieldErrors = {};
        this.submitError = null;
        this.form.reset();
      },
      error: (err: HttpErrorResponse) => {
        this.submitted = null;
        const fields = toFieldErrors(err);
        if (Object.keys(fields).length > 0) {
          this.serverFieldErrors = fields;
          return;
        }
        if (err.status === 409) {
          // Resolves this unit's "KYC-blocked" open question: show the backend's own message
          // (AssociateSuspendedException / KycNotVerifiedException / BelowMinimumWithdrawalException /
          // InsufficientWalletBalanceException all produce a specific, human-readable reason) rather
          // than a generic string or a separate synthesized "blocked list" screen.
          const body = err.error as { error?: string } | null;
          this.submitError = body?.error ?? this.translate.instant('admin.submitWithdrawal.validation.genericSubmitError');
        } else {
          this.submitError = this.translate.instant('admin.submitWithdrawal.validation.genericSubmitError');
        }
      }
    });
  }

  dismissBanner(): void {
    this.submitted = null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/submit-withdrawal.component.spec.ts'`
Expected: PASS (6 specs).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/payout-approval/submit-withdrawal.component.ts frontend/src/app/admin/payout-approval/submit-withdrawal.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(withdrawal): add SubmitWithdrawalComponent"
```

---

## Task 6: Routing, navigation, and i18n wiring

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `PayoutApprovalComponent` (Tasks 3–4), `SubmitWithdrawalComponent` (Task 5); `authGuard`, `adminGuard`, `launchedModeGuard` (existing).
- Produces: reachable routes `/admin/withdrawals/new` and `/settings/payout-approval`.

- [ ] **Step 1: Add the nav-rail i18n key**

In `en.json`'s `"settings"."sections"` object, add `"payoutApproval": "Payout Approval"`. In `hi.json`'s same object, add the same English string (per this plan's Global Constraints — following the `ledgerRegister` precedent, the single most-recently-merged nav entry, which was also left untranslated).

- [ ] **Step 2: Write the failing routing tests**

Add near the existing `admin/sales/new` guard test in `app.routes.spec.ts`:

```typescript
  it('guards the admin submit-withdrawal route with both authGuard and adminGuard', () => {
    const route = routes.find(r => r.path === 'admin/withdrawals/new');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(adminGuard);
  });
```

Append inside the existing `describe('settings route', ...)` block:

```typescript
    it('has a payout-approval child stamped with sectionKey payoutApproval', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const payoutApprovalChild = settingsRoute!.children!.find(c => c.path === 'payout-approval');
      expect(payoutApprovalChild).toBeTruthy();
      expect(payoutApprovalChild!.data).toEqual({ sectionKey: 'payoutApproval' });
    });
```

- [ ] **Step 3: Write the failing nav-rail test changes**

In `settings-nav-rail.component.spec.ts`: update the row-count assertion from `+ 8` to `+ 9`, and update the `ledgerRegister` active-row and link-index assertions since it is no longer the last row; add new assertions for `payoutApproval` as the new last row:

```typescript
  it('renders one row per section plus hardcoded associate directory, tree explorer, kyc queue, audit log, admin stats, sales register, cycle management, ledger register, and payout approval rows', () => {
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items.length).toBe(Object.keys(SECTION_PATHS).length + 9);
  });
```

```typescript
  it('marks the ledger register row active when the active section key is ledgerRegister', () => {
    fixture.componentInstance.activeSectionKey = 'ledgerRegister';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 2].classList).toContain('settings-nav-rail__item--active');
  });

  it('marks the payout approval row active when the active section key is payoutApproval', () => {
    fixture.componentInstance.activeSectionKey = 'payoutApproval';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 1].classList).toContain('settings-nav-rail__item--active');
  });

  it('links each row to its section route so the shell can be navigated by clicking the rail', () => {
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item a');
    expect(links[0].getAttribute('href')).toBe('/settings/company-profile');
    expect(links[links.length - 2].getAttribute('href')).toBe('/settings/ledger-register');
    expect(links[links.length - 1].getAttribute('href')).toBe('/settings/payout-approval');
  });
```

(This replaces the existing "marks the ledger register row active"/"links each row..." assertions, which currently check `items.length - 1`/`links[links.length - 1]` for `ledgerRegister` — those shift to `- 2` now that `payoutApproval` is the new last row.)

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts' --include='**/settings-nav-rail.component.spec.ts'`
Expected: FAIL — routes/nav row not found yet, and the updated row-count/index assertions fail against the pre-change nav rail.

- [ ] **Step 5: Wire the routes**

In `frontend/src/app/app.routes.ts`, add the imports:

```typescript
import { PayoutApprovalComponent } from './admin/payout-approval/payout-approval.component';
import { SubmitWithdrawalComponent } from './admin/payout-approval/submit-withdrawal.component';
```

Add the top-level route next to `admin/sales/new`:

```typescript
  { path: 'admin/withdrawals/new', component: SubmitWithdrawalComponent, canActivate: [authGuard, adminGuard] },
```

Add the `settings` child next to `ledger-register`:

```typescript
      { path: 'payout-approval', component: PayoutApprovalComponent, data: { sectionKey: 'payoutApproval' } },
```

- [ ] **Step 6: Wire the nav rail**

In `frontend/src/app/settings/settings-nav-rail.component.ts`, add a new `<li>` after the `ledgerRegister` one:

```typescript
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'payoutApproval'">
          <a [routerLink]="['/settings', 'payout-approval']">{{ 'settings.sections.payoutApproval' | translate }}</a>
        </li>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts' --include='**/settings-nav-rail.component.spec.ts' --include='**/payout-approval.component.spec.ts' --include='**/submit-withdrawal.component.spec.ts'`
Expected: PASS across all four spec files (confirms Tasks 3–5's components still compile now that they're imported by `app.routes.ts`).

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, no regressions in any other spec file.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/app/settings/settings-nav-rail.component.ts frontend/src/app/settings/settings-nav-rail.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(withdrawal): route and link the Payout Approval screen"
```

---

## Self-Review Notes

- **Spec coverage:** submit on an associate's behalf (unit 5, `POST /api/admin/withdrawals`) → Task 5 (`SubmitWithdrawalComponent`); paginated/filterable approval queue by associate and status (unit 6, `GET /api/admin/withdrawals`) → Task 3; approve/reject/cancel-after-approval with a reason (unit 7, `POST .../decision`) → Task 4; disburse with a manually-entered bank reference (unit 8, `POST .../disburse`) → Task 4. Resolved associate name (not a raw UUID) per unit 6's batch-loaded response shape → `updateTableRows()`'s `associate` field in Task 3 reads `associateUserId`/`associateName` directly off `AdminWithdrawalResponse`, which the backend already resolves server-side (no client-side batch-lookup needed, unlike screens working off entities that don't carry these fields). State machine fidelity (no "hold," no bulk) → Task 4's `actionsTpl` only ever renders the four real statuses, and this plan's Global Constraints explicitly rule out inventing either. The KYC-blocked/bulk-approve open question → resolved and documented in Global Constraints and re-justified inline in Task 5.
- **Explicitly out of scope, confirmed absent from every task:** any modal/dialog (none exists in this codebase, confirmed by grep), a client-side "KYC-blocked list" view, any bulk-selection/bulk-action UI, a distinct "hold" status or button, real payment-gateway integration (disburse stays a manual bank-reference entry, matching the backend's own scope), per-associate bank account capture, withdrawal frequency limits, the visual design pass (deliberately deferred to a separate `superpowers:frontend-design` phase per the task brief).
- **Placeholder scan:** every task has concrete file paths, real TypeScript/HTML, and real test assertions — no "TBD," no "add appropriate error handling," no unwritten test code.
- **Type consistency:** `PayoutApprovalService.list/submit/decide/disburse` signatures introduced in Task 2 are used identically in Tasks 3–5; `AdminWithdrawalRequest`/`AdminWithdrawalPage`/`AdminWithdrawalFilters`/`CreateWithdrawalRequest`/`WithdrawalRequestStatus` field names introduced in Task 1 are used identically everywhere downstream (matching the real backend record field names verbatim: `id`, `associateId`, `associateUserId`, `associateName`, `amount`, `status`, `reason`, `bankReference`, `requestedAt`, `decidedAt`, `disbursedAt`); `registerColumns`/`registerRows`/`decisionReasons`/`bankReferences`/`actionError` names introduced in Tasks 3–4 are not renamed in later tasks.
