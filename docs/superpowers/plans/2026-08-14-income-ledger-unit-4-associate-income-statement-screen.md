# Income/Ledger Unit 4 — Associate "Income Statement" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give any authenticated associate a read-only "Income Statement" screen — their own itemized ledger history, with tabs to filter by income type (Direct/Matching/Sponsor Matching/Royalty/Reward/Perk), a cycle filter, and a status filter — consuming `GET /api/associates/me/ledger` (unit 2).

**Architecture:** A new top-level Angular feature folder `frontend/src/app/income-statement/` (sibling to `dashboard/`, `sales-history/`, `rewards/` — the established associate-self-service convention, not nested under `admin/` or `settings/`). One `IncomeStatementComponent` combines three UI pieces already proven elsewhere in this codebase: `TabBarComponent` for the income-type tabs (same shape `KycQueueComponent` uses for its status tabs), a plain `<select>` filter bar for cycle/status (same shape `LedgerRegisterComponent`, unit 3, uses for its four filters), and `EditableTableComponent` in `readOnly` mode + plain pagination buttons for the itemized rows (same shape every associate-self-service screen uses). One `IncomeStatementService` wraps the single existing endpoint. The route is guarded exactly like `/dashboard` and `/sales-history` (`authGuard` + `associateOnlyGuard`), and a nav link is appended to the global header for non-admin-family users.

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`, global SCSS partials under `frontend/src/styles/` (no new partial needed — see Design Decisions below).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md` (Decisions 6, 9, 10, 11-13). Unit detail: `docs/superpowers/plans/2026-08-03-income-ledger-units.md`, section "### 4." API contract this plan is built against: `docs/superpowers/plans/2026-08-14-income-ledger-associate-history.md` (unit 2's approved plan — unit 2 itself was implemented in a separate, not-yet-merged worktree at plan-writing time; see the backend-contract risk note below).

## Global Constraints

- **Backend-contract risk — read before starting Task 1.** This screen is planned against unit 2's approved *plan* contract, not against unit 2's actual code (unit 2 was implemented in a parallel worktree, under code review, not yet merged, when this plan was written). The contract: `GET /api/associates/me/ledger` takes `incomeType` (enum, including `PERK`), `cycleId`, `status`, `page`, `size` (default `page=0`/`size=20`, `size` clamped to 100 server-side) — no `associateId` param, ever. Response is `AssociateLedgerPageResponse(entries, page, size, totalElements)` of `AssociateLedgerEntryResponse { id, incomeType, cycleId, cyclePeriodStart, cyclePeriodEnd, grossAmount, tdsDeduction, adminDeduction, netAmount, status, sourceRef, createdAt }` — no associate-identity fields. **Before Task 1, open the actual merged `backend/src/main/java/com/plotchain/income/AssociateLedgerEntryResponse.java` and `AssociateLedgerPageResponse.java` and diff their field names/types against Task 1's model below.** If any field name differs, fix Task 1's model before building Tasks 2-3 on top of it — same ordering-risk pattern unit 3's plan used successfully against unit 1.
- Angular 18.2 standalone components only — no `NgModule`.
- View-only screen — no create/edit/delete/void affordance of any kind, per the role-capability matrix's "Associate: view-only" for this domain. No export/report affordance either (out of scope per the spec's own Out-of-scope section).
- `incomeType` tab options include `PERK` (Decision 10 — un-hidden, no special-casing).
- `IncomeType` enum values (`backend/src/main/java/com/plotchain/income/IncomeType.java`): `DIRECT, MATCHING, SPONSOR_MATCHING, ROYALTY, REWARD, PERK` — six values, matching the PRD's "Direct/Matching/Sponsor/Royalty/Reward" tabs plus `PERK`.
- `LedgerEntryStatus` enum values (`backend/src/main/java/com/plotchain/income/LedgerEntryStatus.java`): `PENDING, CARRIED_FORWARD, PAID, REVERSED`.
- Do not modify any backend file — this unit is frontend-only.
- Do not import from `frontend/src/app/admin/**`. Unit 3 (the admin Ledger Register screen) is also still `planned`, not merged, at plan-writing time — this unit depends only on unit 2, so its own models must be self-contained rather than reusing unit 3's (possibly-not-yet-existing) `AdminLedgerEntry`/`AdminLedgerFilters` types.
- Every new user-facing string goes through `@ngx-translate/core` — no hard-coded copy in templates. Add matching keys to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Precedent (`salesHistory.*`/`admin.salesRegister.*` in `hi.json`) shows leaving newly-added feature-bundle values as the literal English string in `hi.json` is accepted practice here — only the top-level `nav.*` entry needs a real Hindi translation.
- No new shared component. Reuse `TabBarComponent` (`frontend/src/app/shared/components/tab-bar/tab-bar.component.ts`) and `EditableTableComponent` (`frontend/src/app/shared/components/editable-table/editable-table.component.ts`) exactly as `KycQueueComponent`/`LedgerRegisterComponent` already use them.
- Test runner: `cd frontend && npx ng test --watch=false --include='<glob>'` for scoped runs.
- This plan does not touch or mark `docs/superpowers/plans/2026-08-03-income-ledger-units.md`'s tracking table — marking a unit merged there is the coordinator's job, done after this plan is executed and reviewed, not a task inside the implementation plan itself.

## Design Decisions (flagged explicitly — none of these are prescribed by the unit detail or spec)

**1. Cycle picker: derive it client-side from a dedicated unfiltered lookup call, not from dashboard/rank-progress data.**
Decision 9 in the spec means there is no associate-facing "list cycles" endpoint. Two candidate sources were checked and rejected:
- `AssociateRankProgressResponse` (`backend/src/main/java/com/plotchain/compensation/AssociateRankProgressResponse.java`) carries `currentRank`/`nextRank`/`progressPercent`/volume fields — no cycle data at all.
- `DashboardResponse` (`frontend/src/app/dashboard/models/dashboard-response.model.ts`) carries `cycleIncome.cycleId` and `cycleCountdown.cycleId` — only the *current* cycle's bare id, no period dates, and no way to see past cycles.

Neither gives a usable multi-cycle picker. Instead, `IncomeStatementComponent` makes one extra, independent call to the same `GET /api/associates/me/ledger` endpoint it already uses — unfiltered, `page=0`, `size=100` (the server's own max clamp) — purely to build the cycle dropdown, on `ngOnInit` only (never re-fetched when tab/filter state changes, so the dropdown's option list doesn't shift under the user as they filter). From the up-to-100 most-recent entries returned, it dedupes by `cycleId`, keeps `cyclePeriodStart`/`cyclePeriodEnd`, skips any entry where the batch cycle-lookup missed (`cyclePeriodStart`/`cyclePeriodEnd` null — Decisions 11 says this leaves fields null rather than erroring), and sorts the result newest-first by `cyclePeriodStart`.

**Tradeoffs, accepted deliberately:**
- This only shows cycles the associate actually has ledger entries in, not every cycle that has ever existed platform-wide — which is the *correct* scope for "my income statement" (a cycle picker listing cycles with zero rows for this associate would be a dead end).
- It's capped to the 100 most-recent entries. An associate with more than 100 ledger rows spanning many cycles will only see cycles present within that most-recent slice in the picker (though older rows remain reachable by paging the main table without a cycle filter). This is an acceptable v1 limitation — a real "list my cycles" affordance is explicitly deferred to a future spec per Decision 9's own text.
- If the lookup call itself fails (network error, 500), the cycle dropdown silently degrades to only its "All cycles" option — it does **not** set the main screen's `loadError` state, since a failed filter-population call shouldn't block the (independently-loaded) itemized table underneath it.

**2. Status filter offers all four `LedgerEntryStatus` values, not just the three the unit detail's prose names.**
The unit detail's acceptance criteria text reads "Status (`PAID`/`PENDING`/`CARRIED_FORWARD`) visible per row and filterable" — but Decision 6 itself says only "Associate filters are `incomeType`, `cycleId`, `status`" with no value-level restriction, and the endpoint accepts any `LedgerEntryStatus` value. `REVERSED` entries (e.g. from a voided sale) can and do appear as rows in an associate's own ledger. Hiding `REVERSED` from the filter dropdown while it can still appear as an unfiltered row's status would be inconsistent — an associate who spots a `REVERSED` row would have no way to isolate just those. This plan reads the unit detail's three-status list as illustrative (the common/expected ones), not an exhaustive allow-list, and offers all four, mirroring unit 3's identical choice for the admin screen.

**3. An "All" pseudo-tab is added as the default landing tab, ahead of the six income-type tabs.**
The unit detail says "tabs/filter by income type" but doesn't say whether a combined view is available. Landing an associate directly on a single income type (e.g. `DIRECT`) with no way to see everything at once would be a worse first experience than an "All" default — and costs nothing extra, since `incomeType` is simply omitted from the query when "All" is active. `TabBarComponent`'s `activeTabId` starts as `'ALL'`.

**4. The itemized row shows the full gross/TDS/admin-deduction/net breakdown, not just net amount.**
Unit 3's admin Ledger Register table (an audit view) shows only `netAmount`. This screen is explicitly the PRD's "itemized breakdown" — so `IncomeStatementComponent`'s table includes `grossAmount`, `tdsDeduction`, `adminDeduction`, and `netAmount` as four separate columns, all already present on `AssociateLedgerEntryResponse`, at no extra backend cost.

---

## File Structure

**New files:**
- `frontend/src/app/income-statement/models/associate-ledger-entry.model.ts` — `IncomeType`, `LedgerEntryStatus` type unions, `AssociateLedgerEntry` interface (mirrors `AssociateLedgerEntryResponse.java` — **verify field names against the merged file first**, per Global Constraints).
- `frontend/src/app/income-statement/models/associate-ledger-page.model.ts` — `AssociateLedgerPage`, `AssociateLedgerFilters` interfaces.
- `frontend/src/app/income-statement/income-statement.service.ts` + `.spec.ts`
- `frontend/src/app/income-statement/income-statement.component.ts` + `.spec.ts`

**Modified files:**
- `frontend/src/app/app.routes.ts` — add the top-level `income-statement` route.
- `frontend/src/app/app.routes.spec.ts` — cover the new route's guards.
- `frontend/src/app/app.component.html` — append the "Income Statement" nav link for non-admin-family users.
- `frontend/src/app/app.component.spec.ts` — update the nav-link assertions that enumerate the full associate link set.
- `frontend/src/assets/i18n/en.json` / `hi.json` — new `incomeStatement` bundle, plus `nav.incomeStatement`.

**No backend changes.**

---

## Task 1: Frontend models

**Files:**
- Create: `frontend/src/app/income-statement/models/associate-ledger-entry.model.ts`
- Create: `frontend/src/app/income-statement/models/associate-ledger-page.model.ts`

**Interfaces:**
- Produces: `IncomeType`, `LedgerEntryStatus`, `AssociateLedgerEntry`, `AssociateLedgerPage`, `AssociateLedgerFilters` — consumed by Task 2's service and Task 3's component.

These are plain type-only files (no logic to test) — mirror `AssociateLedgerEntryResponse.java`/`AssociateLedgerPageResponse.java` field-for-field per the contract in Global Constraints. **Before writing these, complete the backend-contract verification step** — if the actual merged files use different field names, use those instead of the ones below.

- [ ] **Step 1: Write `associate-ledger-entry.model.ts`**

```typescript
// Field names below mirror unit 2's approved contract
// (docs/superpowers/plans/2026-08-14-income-ledger-associate-history.md, Task 1's
// AssociateLedgerEntryResponse) as planned -- unit 2 was implemented in a separate,
// not-yet-merged worktree when this file was written. If AssociateLedgerEntryResponse.java's
// actual field names differ once merged, update this file to match before building on top of it.
export type IncomeType = 'DIRECT' | 'MATCHING' | 'SPONSOR_MATCHING' | 'ROYALTY' | 'REWARD' | 'PERK';

export type LedgerEntryStatus = 'PENDING' | 'CARRIED_FORWARD' | 'PAID' | 'REVERSED';

export interface AssociateLedgerEntry {
  id: string;
  incomeType: IncomeType;
  cycleId: string;
  cyclePeriodStart: string | null;
  cyclePeriodEnd: string | null;
  grossAmount: number;
  tdsDeduction: number;
  adminDeduction: number;
  netAmount: number;
  status: LedgerEntryStatus;
  sourceRef: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write `associate-ledger-page.model.ts`**

```typescript
import { AssociateLedgerEntry, IncomeType, LedgerEntryStatus } from './associate-ledger-entry.model';

export interface AssociateLedgerPage {
  entries: AssociateLedgerEntry[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AssociateLedgerFilters {
  incomeType?: IncomeType;
  cycleId?: string;
  status?: LedgerEntryStatus;
}
```

- [ ] **Step 3: Verify the project still compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors (these files aren't imported anywhere yet, so this just checks syntax).

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/income-statement/models/associate-ledger-entry.model.ts \
        frontend/src/app/income-statement/models/associate-ledger-page.model.ts
git commit -m "feat(income-statement): add frontend AssociateLedgerEntry models"
```

---

## Task 2: `IncomeStatementService`

**Files:**
- Create: `frontend/src/app/income-statement/income-statement.service.ts`
- Test: `frontend/src/app/income-statement/income-statement.service.spec.ts`

**Interfaces:**
- Consumes: `AssociateLedgerFilters`, `AssociateLedgerPage` (Task 1).
- Produces: `IncomeStatementService.list(filters: AssociateLedgerFilters, page: number, size: number): Observable<AssociateLedgerPage>` — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { IncomeStatementService } from './income-statement.service';
import { AssociateLedgerPage } from './models/associate-ledger-page.model';

describe('IncomeStatementService', () => {
  let service: IncomeStatementService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [IncomeStatementService]
    });
    service = TestBed.inject(IncomeStatementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches my ledger entries with filters and pagination as query params', () => {
    const mockResponse: AssociateLedgerPage = { entries: [], page: 0, size: 20, totalElements: 0 };

    service
      .list({ incomeType: 'PERK', cycleId: 'c1', status: 'PAID' }, 0, 20)
      .subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(
      r =>
        r.url === '/api/associates/me/ledger' &&
        r.params.get('incomeType') === 'PERK' &&
        r.params.get('cycleId') === 'c1' &&
        r.params.get('status') === 'PAID' &&
        r.params.get('page') === '0' &&
        r.params.get('size') === '20'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined, sending only page/size when unfiltered', () => {
    service.list({}, 1, 100).subscribe();

    const req = httpMock.expectOne('/api/associates/me/ledger?page=1&size=100');
    req.flush({ entries: [], page: 1, size: 100, totalElements: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/income-statement.service.spec.ts'`
Expected: FAIL — `Cannot find module './income-statement.service'`.

- [ ] **Step 3: Write the implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateLedgerFilters, AssociateLedgerPage } from './models/associate-ledger-page.model';

@Injectable({ providedIn: 'root' })
export class IncomeStatementService {
  private http = inject(HttpClient);

  list(filters: AssociateLedgerFilters, page: number, size: number): Observable<AssociateLedgerPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AssociateLedgerPage>('/api/associates/me/ledger', { params });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/income-statement.service.spec.ts'`
Expected: PASS (2 specs).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/income-statement/income-statement.service.ts \
        frontend/src/app/income-statement/income-statement.service.spec.ts
git commit -m "feat(income-statement): add IncomeStatementService.list"
```

---

## Task 3: `IncomeStatementComponent` — tabs, cycle/status filters, itemized table, pagination

**Files:**
- Create: `frontend/src/app/income-statement/income-statement.component.ts`
- Test: `frontend/src/app/income-statement/income-statement.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `IncomeStatementService.list()` (Task 2); `TabBarComponent`/`TabDefinition` (`frontend/src/app/shared/components/tab-bar/tab-bar.component.ts` — `[tabs]`, `[activeTabId]`, `(tabChange)`, already exists, no changes needed); `EditableTableComponent`/`EditableTableColumn` (already exists, no changes needed).
- Produces: `IncomeStatementComponent` with public `page: AssociateLedgerPage | null`, `loadError: boolean`, `cycles: CycleOption[]`, `activeIncomeType: string`, `statementColumns: EditableTableColumn[]`, `statementRows: Record<string, string>[]`, `onTabChange(id: string): void`, `onCycleIdChange(value: string): void`, `onStatusChange(value: string): void`, `goToPage(page: number): void` — consumed by Task 4's route wiring (as the routed component) and by this task's own spec.

- [ ] **Step 1: Add the required i18n keys**

In `frontend/src/assets/i18n/en.json`, insert a new top-level `incomeStatement` block (alongside `salesHistory`/`plotBookings`/`rewards`), directly after the existing `"digitalIdCard": { ... }` block and before `"nav": {`:

```json
  "incomeStatement": {
    "title": "Income Statement",
    "subtitle": "Your itemized income history, by cycle and income type.",
    "tabAll": "All",
    "tabDirect": "Direct",
    "tabMatching": "Matching",
    "tabSponsorMatching": "Sponsor Matching",
    "tabRoyalty": "Royalty",
    "tabReward": "Reward",
    "tabPerk": "Perk",
    "cycleFilterLabel": "Cycle",
    "cycleFilterAllOption": "All cycles",
    "statusFilterLabel": "Status",
    "statusFilterAllOption": "All statuses",
    "statusPendingOption": "Pending",
    "statusCarriedForwardOption": "Carried Forward",
    "statusPaidOption": "Paid",
    "statusReversedOption": "Reversed",
    "columnIncomeType": "Income Type",
    "columnCyclePeriod": "Cycle Period",
    "columnStatus": "Status",
    "columnGrossAmount": "Gross Amount",
    "columnTdsDeduction": "TDS Deduction",
    "columnAdminDeduction": "Admin Deduction",
    "columnNetAmount": "Net Amount",
    "columnSourceRef": "Source Ref",
    "columnCreatedAt": "Created At",
    "noSourceRef": "—",
    "loadError": "Something went wrong loading your income statement. Please try again.",
    "emptyState": "No income entries match these filters.",
    "previousPageAction": "Previous",
    "nextPageAction": "Next",
    "pageIndicator": "Page {{page}} of {{totalPages}}"
  },
```

Add the same block verbatim to `frontend/src/assets/i18n/hi.json` (English feature-copy duplicated, matching the `salesHistory`/`admin.salesRegister` precedent).

Also add `"incomeStatement": "Income Statement"` to both files' `"nav": { ... }` block, directly after the existing `"digitalIdCard": "Digital ID Card",` entry (real Hindi translation required in `hi.json`'s nav block only, per the existing convention — use `"आय विवरण"`).

- [ ] **Step 2: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { IncomeStatementComponent } from './income-statement.component';

describe('IncomeStatementComponent', () => {
  let fixture: ComponentFixture<IncomeStatementComponent>;
  let httpMock: HttpTestingController;

  const sampleEntry = {
    id: 'l1',
    incomeType: 'DIRECT',
    cycleId: 'c1',
    cyclePeriodStart: '2026-01-01',
    cyclePeriodEnd: '2026-01-31',
    grossAmount: 10000,
    tdsDeduction: 500,
    adminDeduction: 200,
    netAmount: 9300,
    status: 'PAID',
    sourceRef: 's1',
    createdAt: '2026-01-05T00:00:00Z'
  };

  const otherCycleEntry = {
    ...sampleEntry,
    id: 'l2',
    cycleId: 'c2',
    cyclePeriodStart: '2025-12-01',
    cyclePeriodEnd: '2025-12-31'
  };

  function flushInitialRequests(lookupEntries: unknown[] = [sampleEntry, otherCycleEntry]): void {
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '100')
      .flush({ entries: lookupEntries, page: 0, size: 100, totalElements: lookupEntries.length });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '20')
      .flush({ entries: [sampleEntry], page: 0, size: 20, totalElements: 1 });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncomeStatementComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(IncomeStatementComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('loads the first unfiltered page of my ledger on init, with the All tab active', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.page?.entries.length).toBe(1);
    expect(fixture.componentInstance.activeIncomeType).toBe('ALL');
  });

  it('derives the cycle filter options from the unfiltered lookup, deduped by cycleId, newest first', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.cycles.map(c => c.cycleId)).toEqual(['c1', 'c2']);
  });

  it('omits a cycle option when its period dates are missing from the batch lookup', () => {
    flushInitialRequests([sampleEntry, { ...otherCycleEntry, cyclePeriodStart: null, cyclePeriodEnd: null }]);
    expect(fixture.componentInstance.cycles.map(c => c.cycleId)).toEqual(['c1']);
  });

  it('leaves the cycle dropdown empty without blocking the main table when the cycle lookup fails', () => {
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '100')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '20')
      .flush({ entries: [sampleEntry], page: 0, size: 20, totalElements: 1 });

    expect(fixture.componentInstance.cycles).toEqual([]);
    expect(fixture.componentInstance.loadError).toBe(false);
  });

  it('selecting an income type tab reloads with the incomeType filter and resets to page 0', () => {
    flushInitialRequests();
    fixture.componentInstance.onTabChange('PERK');

    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/ledger' && r.params.get('incomeType') === 'PERK' && r.params.get('page') === '0'
    );
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    expect(fixture.componentInstance.activeIncomeType).toBe('PERK');
  });

  it('reloads with the cycleId filter when the cycle dropdown changes', () => {
    flushInitialRequests();
    fixture.componentInstance.onCycleIdChange('c2');

    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('cycleId') === 'c2');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the status filter when the status dropdown changes', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('REVERSED');

    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('status') === 'REVERSED');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('combines tab, cycle, and status filters into one request', () => {
    flushInitialRequests();
    fixture.componentInstance.onTabChange('MATCHING');
    httpMock.expectOne(r => r.params.get('incomeType') === 'MATCHING').flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onCycleIdChange('c1');
    httpMock.expectOne(r => r.params.get('cycleId') === 'c1').flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onStatusChange('PAID');
    const req = httpMock.expectOne(
      r => r.params.get('incomeType') === 'MATCHING' && r.params.get('cycleId') === 'c1' && r.params.get('status') === 'PAID'
    );
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows the resolved cycle period dates in each row, not a raw cycle UUID', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Jan 1, 2026');
    expect(rowText).not.toContain('c1');
  });

  it('renders a dash for a null sourceRef instead of blank or "null"', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('PENDING');
    httpMock.expectOne(r => r.params.get('status') === 'PENDING').flush({
      entries: [{ ...sampleEntry, id: 'l3', sourceRef: null, status: 'PENDING' }],
      page: 0,
      size: 20,
      totalElements: 1
    });
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('—');
  });

  it('shows a load error when the initial page load fails, without silently doing nothing', () => {
    httpMock.expectOne(r => r.params.get('size') === '100').flush({ entries: [], page: 0, size: 100, totalElements: 0 });
    httpMock
      .expectOne(r => r.params.get('size') === '20')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.income-statement__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows an empty-state row when no entries match', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('REVERSED');
    httpMock.expectOne(r => r.params.get('status') === 'REVERSED').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    flushInitialRequests();
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('page') === '1' && r.params.get('size') === '20');
    req.flush({ entries: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('has no action column and no write inputs — this screen is view-only', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.statementColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/income-statement.component.spec.ts'`
Expected: FAIL — `Cannot find module './income-statement.component'`.

- [ ] **Step 4: Write the implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { IncomeStatementService } from './income-statement.service';
import { AssociateLedgerPage, AssociateLedgerFilters } from './models/associate-ledger-page.model';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;
const CYCLE_LOOKUP_SIZE = 100;

export interface CycleOption {
  cycleId: string;
  cyclePeriodStart: string;
  cyclePeriodEnd: string;
}

@Component({
  selector: 'app-income-statement',
  standalone: true,
  imports: [CommonModule, TranslateModule, TabBarComponent, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="income-statement card">
      <h1 class="card-title">{{ 'incomeStatement.title' | translate }}</h1>
      <p class="income-statement__subtitle">{{ 'incomeStatement.subtitle' | translate }}</p>

      <app-tab-bar [tabs]="tabs" [activeTabId]="activeIncomeType" (tabChange)="onTabChange($event)"></app-tab-bar>

      <div class="income-statement__filters">
        <label>
          {{ 'incomeStatement.cycleFilterLabel' | translate }}
          <select (change)="onCycleIdChange($any($event.target).value)">
            <option value="">{{ 'incomeStatement.cycleFilterAllOption' | translate }}</option>
            <option *ngFor="let cycle of cycles" [value]="cycle.cycleId">
              {{ datePipe.transform(cycle.cyclePeriodStart, 'mediumDate') }} – {{ datePipe.transform(cycle.cyclePeriodEnd, 'mediumDate') }}
            </option>
          </select>
        </label>
        <label>
          {{ 'incomeStatement.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'incomeStatement.statusFilterAllOption' | translate }}</option>
            <option value="PENDING">{{ 'incomeStatement.statusPendingOption' | translate }}</option>
            <option value="CARRIED_FORWARD">{{ 'incomeStatement.statusCarriedForwardOption' | translate }}</option>
            <option value="PAID">{{ 'incomeStatement.statusPaidOption' | translate }}</option>
            <option value="REVERSED">{{ 'incomeStatement.statusReversedOption' | translate }}</option>
          </select>
        </label>
      </div>

      <p *ngIf="loadError" class="income-statement__load-error">{{ 'incomeStatement.loadError' | translate }}</p>

      <app-editable-table
        [readOnly]="true"
        [columns]="statementColumns"
        [rows]="statementRows"
        [emptyStateLabel]="'incomeStatement.emptyState' | translate"
      ></app-editable-table>

      <div class="income-statement__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'incomeStatement.previousPageAction' | translate }}
        </button>
        <span class="income-statement__page-indicator">
          {{ 'incomeStatement.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'incomeStatement.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class IncomeStatementComponent implements OnInit {
  private incomeStatementService = inject(IncomeStatementService);
  private translate = inject(TranslateService);
  protected datePipe = inject(DatePipe);

  page: AssociateLedgerPage | null = null;
  loadError = false;
  cycles: CycleOption[] = [];
  activeIncomeType = 'ALL';
  statementColumns: EditableTableColumn[] = [];
  statementRows: Record<string, string>[] = [];
  private cycleId = '';
  private status = '';

  get tabs(): TabDefinition[] {
    return [
      { id: 'ALL', label: this.translate.instant('incomeStatement.tabAll') },
      { id: 'DIRECT', label: this.translate.instant('incomeStatement.tabDirect') },
      { id: 'MATCHING', label: this.translate.instant('incomeStatement.tabMatching') },
      { id: 'SPONSOR_MATCHING', label: this.translate.instant('incomeStatement.tabSponsorMatching') },
      { id: 'ROYALTY', label: this.translate.instant('incomeStatement.tabRoyalty') },
      { id: 'REWARD', label: this.translate.instant('incomeStatement.tabReward') },
      { id: 'PERK', label: this.translate.instant('incomeStatement.tabPerk') }
    ];
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
    this.statementColumns = [
      { key: 'incomeType', label: this.translate.instant('incomeStatement.columnIncomeType'), type: 'text' },
      { key: 'cyclePeriod', label: this.translate.instant('incomeStatement.columnCyclePeriod'), type: 'text' },
      { key: 'status', label: this.translate.instant('incomeStatement.columnStatus'), type: 'text' },
      { key: 'grossAmount', label: this.translate.instant('incomeStatement.columnGrossAmount'), type: 'text' },
      { key: 'tdsDeduction', label: this.translate.instant('incomeStatement.columnTdsDeduction'), type: 'text' },
      { key: 'adminDeduction', label: this.translate.instant('incomeStatement.columnAdminDeduction'), type: 'text' },
      { key: 'netAmount', label: this.translate.instant('incomeStatement.columnNetAmount'), type: 'text' },
      { key: 'sourceRef', label: this.translate.instant('incomeStatement.columnSourceRef'), type: 'text' },
      { key: 'createdAt', label: this.translate.instant('incomeStatement.columnCreatedAt'), type: 'text' }
    ];
    this.loadCycleOptions();
    this.loadPage(0);
  }

  onTabChange(id: string): void {
    this.activeIncomeType = id;
    this.loadPage(0);
  }

  onCycleIdChange(value: string): void {
    this.cycleId = value;
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  // Design Decision 1 (see plan header): a dedicated, unfiltered, one-time lookup -- independent
  // of the main filtered/paginated load below -- so the cycle dropdown's option list doesn't
  // shift as the user changes tabs/filters. A lookup failure only degrades this dropdown to its
  // "All cycles" option; it never sets loadError, since it doesn't block the itemized table.
  private loadCycleOptions(): void {
    this.incomeStatementService.list({}, 0, CYCLE_LOOKUP_SIZE).subscribe({
      next: res => {
        const byCycleId = new Map<string, CycleOption>();
        for (const entry of res.entries) {
          if (!entry.cyclePeriodStart || !entry.cyclePeriodEnd) {
            continue;
          }
          if (!byCycleId.has(entry.cycleId)) {
            byCycleId.set(entry.cycleId, {
              cycleId: entry.cycleId,
              cyclePeriodStart: entry.cyclePeriodStart,
              cyclePeriodEnd: entry.cyclePeriodEnd
            });
          }
        }
        this.cycles = Array.from(byCycleId.values()).sort((a, b) => b.cyclePeriodStart.localeCompare(a.cyclePeriodStart));
      },
      error: () => {
        this.cycles = [];
      }
    });
  }

  private loadPage(page: number): void {
    this.loadError = false;
    const filters: AssociateLedgerFilters = {};
    if (this.activeIncomeType !== 'ALL') {
      filters.incomeType = this.activeIncomeType as AssociateLedgerFilters['incomeType'];
    }
    if (this.cycleId) {
      filters.cycleId = this.cycleId;
    }
    if (this.status) {
      filters.status = this.status as AssociateLedgerFilters['status'];
    }
    this.incomeStatementService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.statementRows = (this.page?.entries ?? []).map(entry => ({
      incomeType: entry.incomeType,
      cyclePeriod: `${this.datePipe.transform(entry.cyclePeriodStart, 'mediumDate')} – ${this.datePipe.transform(entry.cyclePeriodEnd, 'mediumDate')}`,
      status: entry.status,
      grossAmount: String(entry.grossAmount),
      tdsDeduction: String(entry.tdsDeduction),
      adminDeduction: String(entry.adminDeduction),
      netAmount: String(entry.netAmount),
      sourceRef: entry.sourceRef ?? this.translate.instant('incomeStatement.noSourceRef'),
      createdAt: this.datePipe.transform(entry.createdAt, 'medium') ?? entry.createdAt
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/income-statement.component.spec.ts'`
Expected: PASS (14 specs).

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/income-statement/income-statement.component.ts \
        frontend/src/app/income-statement/income-statement.component.spec.ts \
        frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(income-statement): add IncomeStatementComponent tabs/filters/table/pagination"
```

---

## Task 4: Route wiring + guard test

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `IncomeStatementComponent` (Task 3). Existing `authGuard` (`frontend/src/app/auth/auth.guard.ts`) and `associateOnlyGuard` (`frontend/src/app/auth/associate-only.guard.ts`) — both already used verbatim by the `dashboard`/`sales-history` routes.
- Produces: route `path: 'income-statement'`, consumed by Task 5's nav link (`routerLink="/income-statement"`).

- [ ] **Step 1: Write the failing test (append to `app.routes.spec.ts`)**

```typescript
  it('guards the income-statement route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'income-statement');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });
```

Place this new `it(...)` block directly after the existing `'guards the sales-history route with authGuard and associateOnlyGuard'` test (same top-level `describe('routes', ...)` block).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: FAIL — `route` is `undefined`, `Cannot read properties of undefined (reading 'canActivate')`.

- [ ] **Step 3: Add the route**

In `frontend/src/app/app.routes.ts`, add the import directly after the existing `DigitalIdCardComponent` import:

```typescript
import { IncomeStatementComponent } from './income-statement/income-statement.component';
```

Add the route entry as a new top-level bare route, directly after the existing `digital-id-card` route entry:

```typescript
  { path: 'digital-id-card', component: DigitalIdCardComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'income-statement', component: IncomeStatementComponent, canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: PASS (all routes specs, including the new one).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts
git commit -m "feat(income-statement): route /income-statement behind authGuard + associateOnlyGuard"
```

---

## Task 5: Global nav link

**Files:**
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: the `income-statement` route from Task 4. Existing `isAdminFamily` getter and `app-nav__link`/`app-nav__link--active` classes already used by every other associate-facing link in `app.component.html`.
- Produces: nothing new consumed elsewhere — this is the final, user-visible wiring step.

- [ ] **Step 1: Write/update the failing test**

In `frontend/src/app/app.component.spec.ts`, update the existing test that enumerates the full associate nav-link set (currently expects `['Dashboard', 'My Tree', 'Sales History', 'Plot Bookings', 'Profile', 'Rewards', 'Digital ID Card']`):

```typescript
  it('shows all associate nav links including Income Statement for a plain associate role', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
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
      'Dashboard', 'My Tree', 'Sales History', 'Plot Bookings', 'Profile', 'Rewards', 'Digital ID Card', 'Income Statement'
    ]);
  });
```

(Replace the old test with this one — same `describe` block, same position. `of` must already be imported at the top of this spec file from `rxjs`, per the existing test's usage.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: FAIL — `links` doesn't include `'Income Statement'` yet.

- [ ] **Step 3: Add the nav link**

In `frontend/src/app/app.component.html`, add the new link directly after the existing Digital ID Card link, still gated on `!isAdminFamily`:

```html
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/digital-id-card" routerLinkActive="app-nav__link--active">{{ 'nav.digitalIdCard' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/income-statement" routerLinkActive="app-nav__link--active">{{ 'nav.incomeStatement' | translate }}</a>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: PASS (all app.component specs, including the updated one). Verify the admin-family nav tests still pass unmodified, since the new link is also gated on `!isAdminFamily`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/app.component.html frontend/src/app/app.component.spec.ts
git commit -m "feat(income-statement): add Income Statement nav link for associates"
```

---

## Task 6: Full frontend suite verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck and run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx ng test --watch=false`
Expected: no new TypeScript errors; full suite green, including every existing screen's specs (no regressions in `dashboard`/`sales-history`/`rewards`/`digital-id-card`/`admin/**`/`settings/**`).

- [ ] **Step 2: Verify both i18n JSON files still parse**

Run:
```bash
cd /Users/ronalisenapati/Ronali/plotchain
python3 -c "import json; json.load(open('frontend/src/assets/i18n/en.json')); print('en.json OK')"
python3 -c "import json; json.load(open('frontend/src/assets/i18n/hi.json')); print('hi.json OK')"
```
Expected: both print `OK`.

No commit for this task — it's a verification checkpoint spanning all prior tasks' committed changes.

---

## Self-Review Notes (completed during planning)

- **Spec coverage:** "lists the caller's own ledger entries, itemized per cycle, with tabs/filter by income type" → Task 3's `tabs` getter + `onTabChange`. "Filter by cycle via unit 2's `cycleId` filter" → Task 3's cycle `<select>` + Design Decision 1's client-derived option list. "Status visible per row and filterable" → Task 3's `columnStatus` + status `<select>` (Design Decision 2 explains offering all four values). "Pagination controls matching unit 2's page/size contract" → Task 3's `goToPage`/pagination template, `PAGE_SIZE = 20`. "View-only — no write affordances" → Global Constraints + the explicit "no action column, no write inputs" test in Task 3.
- **Open question resolved:** the unit detail's flagged "open question — cycle picker" is resolved by Design Decision 1 above, not deferred further — a concrete client-side-derivation approach is specified, implemented, and tested (including its lookup-failure and null-period-miss edge cases).
- **No placeholders:** every step has literal code or exact JSON to insert, no "TBD"/"handle appropriately" language.
- **Type consistency:** `AssociateLedgerEntry`/`AssociateLedgerPage`/`AssociateLedgerFilters` field names and order are identical between Task 1 (model definitions), Task 2 (`IncomeStatementService.list` signature and its test's mock responses), and Task 3 (`IncomeStatementComponent`'s `filters` construction, `updateTableRows`, and its test's `sampleEntry` fixture). `CycleOption`'s shape (`cycleId`/`cyclePeriodStart`/`cyclePeriodEnd`) is used identically in Task 3's `loadCycleOptions` and its own component tests.
- **Cross-unit file overlap:** this unit only creates files under a new `frontend/src/app/income-statement/` folder and touches the same four shared files (`app.routes.ts`, `app.routes.spec.ts`, `app.component.html`, `app.component.spec.ts`, `en.json`, `hi.json`) every prior associate-screen unit has touched — same append-only pattern, no edit collision with unit 3 (admin-only files) or any other in-flight unit.
