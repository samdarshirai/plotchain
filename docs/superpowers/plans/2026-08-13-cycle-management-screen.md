# Cycle Management Unit 11 — Admin "Cycle Management" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin "Cycle Management" screen — the one screen (per the role-capability spec's own Admin Screens list, and per the units file's explicit "one screen, not three" resolution) covering all three already-merged, ADMIN-only cycle endpoints: history list (`GET /api/admin/cycles`, unit 1), per-cycle detail drill-down (`GET /api/admin/cycles/{id}`, unit 2), and trigger/monitor a settlement close (`POST /api/admin/cycles/{id}/close`, unit 4). All three backend endpoints are merged and stable — this plan is frontend-only, no backend changes.

**Architecture:** One Angular standalone component + one HTTP service, following this codebase's established admin-screen conventions exactly (`SalesRegisterComponent`, `TreeExplorerComponent`, `KycQueueComponent`):
- `CycleManagementComponent` — single screen combining a filterable/paginated history table (`EditableTableComponent`), a per-row "View Detail" action that loads and displays a cycle's per-income-type breakdown in a `SidePanelComponent`, and a "Close Cycle" action surfaced against whichever cycle in the loaded history is currently `OPEN`, with the close response (or 409 error) shown inline via `InlineBannerComponent`. No second route, no modal — unlike Sales Register's separate `RecordSaleComponent` page, Cycle Management's "action" (close) needs no standalone form (it takes no input beyond the id already known from the list), so it stays embedded in the one screen, matching the units file's explicit resolution against a list/detail/action three-page split.
- `CycleManagementService` — one service with `list()`, `detail()`, `close()`, mirroring `SalesRegisterService`'s shape.

A `superpowers:frontend-design` dispatch runs against Part A of this plan (below) before Task 7, producing a design artifact this plan's last task consumes for visual polish. Tasks 1–6 build a fully functional, generically-styled screen first (same order this codebase already used for Sales Register — bespoke styling is consistently a separate, later pass).

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`, SCSS partials under `frontend/src/styles/`.

## Global Constraints

- Angular 18.2 standalone components only — no `NgModule`. (Matches every existing component in `frontend/src/app`.)
- No modal/dialog component exists anywhere in this codebase — do not introduce one. Detail drill-down uses `SidePanelComponent` (the existing precedent: `SettingsOverviewComponent`'s compensation-history panel); Close Cycle is a direct button click with no confirmation dialog, matching how Sales Register's Void action and KYC's reject action both submit directly with no confirm step.
- This screen lives inside `SettingsShellComponent` as a `settings` child route (same as `tree-explorer`, `kyc-queue`, `sales-register`, `audit-log`, `admin-stats`), inheriting `authGuard` + `adminGuard` + `launchedModeGuard` from the parent `settings` route — no new top-level route needed (unlike Sales Register, which needed `admin/sales/new` for its separate record-sale page; this screen has no such second page).
- Reuse `frontend/src/styles/_tokens.scss` CSS custom properties (`--surface-page`, `--surface-card`, `--surface-raised`, `--border-subtle`, `--text-primary`, `--text-muted`, `--status-success/warning/danger`, `--brand-primary`/`--brand-secondary`) everywhere. Never introduce a new hex color or a new custom property — the design artifact (Task 7) must map onto these existing tokens, not invent a palette.
- Every user-facing string goes through `TranslateModule`/`| translate` with a key added to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Precedent (`admin.kycQueue.*`, `admin.salesRegister.*` in `hi.json`) shows feature-copy blocks duplicate the English text verbatim in `hi.json` — only `settings.sections.*` nav labels get an actual Hindi translation (confirmed: `auditLog`/`adminStats`/`salesRegister` are real Hindi there, `associateDirectory`/`treeExplorer`/`kycQueue` are left in English — the newer entries get real translations, so `cycleManagement` gets one too). Follow that exact split.
- **The actual `POST /{id}/close` response shape is `CycleCloseResponse(cycleId: UUID, status: CycleStatus, legVolumeRowsWritten: int, newCycleId: UUID)`** (`backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java`) — **not** a full per-income-type "entries written per income type, total net amount" breakdown. That richer shape was the spec's aspirational language for a future `SettlementResult`; the code as merged (confirmed by reading `CycleCloseResponse.java`'s own doc comment and `CycleService.close()`'s final `return` statement) only reports `legVolumeRowsWritten` and `newCycleId` alongside the closed cycle's own `id`/`status`. Design and build the close-result UI against this real, current shape — do not invent fields that don't exist in the response.
- Page size: client requests `size=20` by default (matching `PAGE_SIZE` in every existing admin list component); the backend clamps `size` to 100 regardless (`CycleController.list`: `size = Math.min(size, 100)`).
- Dates: `Cycle.periodStart`/`periodEnd` are backend `LocalDate` fields with no custom Jackson config in this codebase (Spring Boot's default `jackson-datatype-jsr310` auto-config, `WRITE_DATES_AS_TIMESTAMPS` disabled by default) — they serialize as plain `"YYYY-MM-DD"` ISO date strings, so the frontend models type them `string`, exactly like `Sale.recordedAt` already does for `Instant`.
- No PAN, EMI, KYC-doc, matching/royalty income *computation* UI (only the already-computed net totals) — this screen surfaces the three merged endpoints' data as-is; it does not reimplement or preview any settlement math client-side.

---

## Part A — Design Brief (input to `superpowers:frontend-design`)

This section is the brief a separate `superpowers:frontend-design` dispatch will design against, before Task 7 runs. It is not itself a build task.

**Why this needs a fresh design pass, not reuse of an existing screen's design:** Cycle Management is the second data-table-heavy **operational** admin screen (after Sales Register) to get a bespoke design pass — every earlier screen (Associates Directory, KYC Review Queue, Tree Explorer) still ships with only generic `.card`/`.editable-table` styling. `docs/design/admin_operational_screens/sales_register/` is the one existing precedent in this exact category and establishes the pattern to extend, not restart: same token system (`frontend/src/styles/_tokens.scss`, already the single source of truth, confirmed 1:1 with `docs/design/stitch_premium_admin_setup_wizard/high_performance_enterprise/DESIGN.md`'s neutral palette), same typography stack (`'Geist'` headings / `'Inter'` body / `'JetBrains Mono'` for eyebrows and precision data), same four allowed shared components. Reuse the Sales Register design's *system* (tokens, ledger-typography-for-numeric-columns idiom, banner/pill conventions) — do not re-derive a new palette or invent new primitives.

**Target artifact path** (new leaf, sibling to `sales_register` under the same operational-screens category):
```
docs/design/admin_operational_screens/cycle_management/DESIGN.md
docs/design/admin_operational_screens/cycle_management/screen.png
docs/design/admin_operational_screens/cycle_management/code.html
```

**Token/typography constraints to state in the brief:**
- Colors: reuse `frontend/src/styles/_tokens.scss` CSS custom properties verbatim (`--surface-page`, `--surface-card`, `--surface-raised`, `--border-subtle`, `--text-primary`, `--text-muted`, `--brand-primary`, `--brand-secondary`, `--status-success`, `--status-warning`, `--status-danger`) — same set `docs/design/admin_operational_screens/sales_register/DESIGN.md` already mapped. Do not propose new hex values.
- Typography: `'Geist'` for headings, `'Inter'` for body copy, `'JetBrains Mono'` for eyebrow/uppercase labels and monetary/precision data (net totals, cycle id) — the exact stack Sales Register's design already establishes live in `frontend/src/styles/_admin.scss`.
- No new component primitives: the design must be expressible using `EditableTableComponent` (table + single `actionTemplate` action column), `InlineBannerComponent` (success/danger banners for the close result and errors), `SidePanelComponent` (the detail drill-down — same component `SettingsOverviewComponent`'s compensation-history panel already uses), `BrandButtonComponent` (primary/secondary/danger variants — danger for "Close Cycle", since it's the screen's one consequential, hard-to-undo action). Do not design a data-grid, dialog, toast, or confirmation-modal system.

**Screen states to design (all within the one component):**

1. **History — default/loaded state.** A status filter (`<select>`: All / Open / Calculating / Closed / Paid) above a table (columns: Period Start, Period End, Status, Actions) with Prev/Next pagination below, matching `Page {{page}} of {{totalPages}}` (same indicator idiom as Sales Register/KYC Queue).
2. **History — empty state.** No cycles match the current filter (reuses `EditableTableComponent`'s built-in empty-state row — design its copy/visual treatment only).
3. **Current Open Cycle panel.** A distinct card/strip above or beside the history table, shown only when the loaded history includes a cycle with `status === 'OPEN'`: its period, plus a "Close Cycle" button (`BrandButtonComponent` `variant="danger"`, since closing is consequential and effectively one-directional per Decision #2 of the domain-design spec — a closed cycle is never reopened). Absent entirely when no `OPEN` cycle is present in the currently-loaded page (a real but rare transient state, not an error).
4. **Close Cycle — success/monitor state.** `InlineBannerComponent` tone="success" showing the real `CycleCloseResponse` fields: closed cycle id, its new `status` (`CLOSED`), `legVolumeRowsWritten`, and the `newCycleId` of the cycle that opened next — this is literally the "monitor" half of "trigger/monitor/re-run" the spec calls for, and it must show only fields the backend actually returns (see Global Constraints — no invented per-income-type breakdown here). History reloads afterward so the newly-`CLOSED` row and newly-`OPEN` row both appear.
5. **Close Cycle — conflict/error state.** `InlineBannerComponent` tone="danger" for a 409 (`CycleAlreadyClosedException` — the cycle was already closed, e.g. by a concurrent request that resolved first) with copy distinguishing it from a generic failure, mirroring `RecordSaleComponent`'s `err.status === 409` branch.
6. **History load error.** `InlineBannerComponent` tone="danger", matching `sales-register__load-error`'s placement above the table.
7. **Detail drill-down — `SidePanelComponent`.** Opened by a row's "View Detail" action; shows the cycle's period/status plus a small breakdown list of `{ incomeType, totalNet }` for `DIRECT/MATCHING/SPONSOR_MATCHING/ROYALTY/REWARD` (in that fixed order, matching `CycleService.BREAKDOWN_INCOME_TYPES`) and the cycle's overall `totalNet`, styled as ledger-style monospace figures (same "JetBrains Mono, tabular-nums for money" idiom Sales Register's design already established for its Amount column). Include a detail-load-error state inside the panel body for when the drill-down fetch itself fails.

**Out of scope for the design brief:** any settlement-math preview/simulation before closing (not requested, no backend support), CSV/export of cycle history (not one of units 1/2/4's endpoints), associate-facing cycle reports (explicitly out of scope per the domain-design spec's Decision #13 — `GET /api/associates/me/dashboard` already covers that, no screen here).

---

## Part B — File Structure

**New files:**
- `frontend/src/app/admin/models/cycle.model.ts` — `CycleStatus`, `CycleSummary`, `CyclePage` interfaces (mirrors `CycleStatus.java`/`CycleSummaryResponse.java`/`CyclePageResponse.java`).
- `frontend/src/app/admin/models/cycle-detail.model.ts` — `CycleIncomeType`, `CycleIncomeTypeTotal`, `CycleDetail` interfaces (mirrors `IncomeType.java`'s breakdown subset/`CycleIncomeTypeTotal.java`/`CycleDetailResponse.java`).
- `frontend/src/app/admin/models/cycle-close-response.model.ts` — `CycleCloseResponse` interface (mirrors `CycleCloseResponse.java` exactly — 4 fields, not the aspirational `SettlementResult` shape).
- `frontend/src/app/admin/cycle-management/cycle-management.service.ts` + `.spec.ts`
- `frontend/src/app/admin/cycle-management/cycle-management.component.ts` + `.spec.ts`
- `docs/design/admin_operational_screens/cycle_management/{DESIGN.md,screen.png,code.html}` — produced by the `superpowers:frontend-design` dispatch, consumed (not created) by Task 7.

**Modified files:**
- `frontend/src/app/app.routes.ts` — add `settings/cycle-management` (child of the `settings` shell, `sectionKey: 'cycleManagement'`).
- `frontend/src/app/app.routes.spec.ts` — cover the new settings child route's `sectionKey` stamp (mirroring the existing `sales-register` child test).
- `frontend/src/app/settings/settings-nav-rail.component.ts` + `.spec.ts` — add the Cycle Management nav row (after the `salesRegister` row).
- `frontend/src/assets/i18n/en.json` / `hi.json` — new `admin.cycleManagement.*` block, plus `settings.sections.cycleManagement`.
- `frontend/src/styles/_admin.scss` — Task 7 only: bespoke `.cycle-management__*` rules, appended after the existing `.sales-register__*`/`.record-sale__*` block.

**No backend changes** — all three endpoints (`GET /api/admin/cycles`, `GET /api/admin/cycles/{id}`, `POST /api/admin/cycles/{id}/close`) are already merged (`CycleController`, `CycleService`, `CycleExceptionHandler`, verified directly from source in research for this plan).

---

## Task 1: Frontend Cycle models

**Files:**
- Create: `frontend/src/app/admin/models/cycle.model.ts`
- Create: `frontend/src/app/admin/models/cycle-detail.model.ts`
- Create: `frontend/src/app/admin/models/cycle-close-response.model.ts`

**Interfaces:**
- Produces: `CycleStatus`, `CycleSummary`, `CyclePage`, `CycleIncomeType`, `CycleIncomeTypeTotal`, `CycleDetail`, `CycleCloseResponse` — consumed by Task 2's service and Tasks 3–5's component.

These are plain type-only files (no logic to test) — mirror the backend records field-for-field, confirmed from `backend/src/main/java/com/plotchain/cycle/{CycleStatus,CycleSummaryResponse,CyclePageResponse,CycleDetailResponse,CycleIncomeTypeTotal,CycleCloseResponse}.java`.

- [ ] **Step 1: Write `cycle.model.ts`**

```typescript
export type CycleStatus = 'OPEN' | 'CALCULATING' | 'CLOSED' | 'PAID';

export interface CycleSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: CycleStatus;
}

export interface CyclePage {
  cycles: CycleSummary[];
  page: number;
  size: number;
  totalElements: number;
}
```

- [ ] **Step 2: Write `cycle-detail.model.ts`**

```typescript
import { CycleStatus } from './cycle.model';

export type CycleIncomeType = 'DIRECT' | 'MATCHING' | 'SPONSOR_MATCHING' | 'ROYALTY' | 'REWARD';

export interface CycleIncomeTypeTotal {
  incomeType: CycleIncomeType;
  totalNet: number;
}

export interface CycleDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: CycleStatus;
  incomeTypeTotals: CycleIncomeTypeTotal[];
  totalNet: number;
}
```

- [ ] **Step 3: Write `cycle-close-response.model.ts`**

```typescript
import { CycleStatus } from './cycle.model';

// Mirrors backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java exactly. This is
// deliberately NOT a full "entries written per income type, total net amount" SettlementResult
// -- that richer shape was the domain-design spec's aspirational language for a future response;
// the merged CycleService.close() only ever returns these four fields. Do not add fields here
// that the backend doesn't send.
export interface CycleCloseResponse {
  cycleId: string;
  status: CycleStatus;
  legVolumeRowsWritten: number;
  newCycleId: string;
}
```

- [ ] **Step 4: Verify the project still compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors (these files aren't imported anywhere yet, so this just checks syntax).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/models/cycle.model.ts frontend/src/app/admin/models/cycle-detail.model.ts frontend/src/app/admin/models/cycle-close-response.model.ts
git commit -m "feat(cycle): add frontend Cycle models"
```

---

## Task 2: CycleManagementService

**Files:**
- Create: `frontend/src/app/admin/cycle-management/cycle-management.service.ts`
- Test: `frontend/src/app/admin/cycle-management/cycle-management.service.spec.ts`

**Interfaces:**
- Consumes: `CycleStatus`, `CyclePage`, `CycleDetail`, `CycleCloseResponse` (Task 1).
- Produces: `CycleManagementService` with `list(status: CycleStatus | '', page: number, size: number): Observable<CyclePage>`, `detail(id: string): Observable<CycleDetail>`, `close(id: string): Observable<CycleCloseResponse>` — consumed by Tasks 3–5.

- [ ] **Step 1: Write the failing test**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CycleManagementService } from './cycle-management.service';
import { CyclePage } from '../models/cycle.model';
import { CycleDetail } from '../models/cycle-detail.model';
import { CycleCloseResponse } from '../models/cycle-close-response.model';

describe('CycleManagementService', () => {
  let service: CycleManagementService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CycleManagementService]
    });
    service = TestBed.inject(CycleManagementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists cycles with pagination as query params, no status param when unset', () => {
    const mockResponse: CyclePage = { cycles: [], page: 0, size: 20, totalElements: 0 };

    service.list('', 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/admin/cycles?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('lists cycles with a status filter param when set', () => {
    service.list('OPEN', 0, 20).subscribe();

    const req = httpMock.expectOne(r => r.url === '/api/admin/cycles' && r.params.get('status') === 'OPEN');
    req.flush({ cycles: [], page: 0, size: 20, totalElements: 0 });
  });

  it('fetches a cycle detail by id', () => {
    const mockDetail: CycleDetail = {
      id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'CLOSED',
      incomeTypeTotals: [{ incomeType: 'DIRECT', totalNet: 100 }], totalNet: 100
    };

    service.detail('c1').subscribe(res => expect(res).toEqual(mockDetail));

    const req = httpMock.expectOne('/api/admin/cycles/c1');
    expect(req.request.method).toBe('GET');
    req.flush(mockDetail);
  });

  it('closes a cycle by id', () => {
    const mockResponse: CycleCloseResponse = { cycleId: 'c1', status: 'CLOSED', legVolumeRowsWritten: 3, newCycleId: 'c2' };

    service.close('c1').subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/admin/cycles/c1/close');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.service.spec.ts'`
Expected: FAIL — `Cannot find module './cycle-management.service'`.

- [ ] **Step 3: Write the implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CycleStatus, CyclePage } from '../models/cycle.model';
import { CycleDetail } from '../models/cycle-detail.model';
import { CycleCloseResponse } from '../models/cycle-close-response.model';

@Injectable({ providedIn: 'root' })
export class CycleManagementService {
  private http = inject(HttpClient);

  list(status: CycleStatus | '', page: number, size: number): Observable<CyclePage> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<CyclePage>('/api/admin/cycles', { params });
  }

  detail(id: string): Observable<CycleDetail> {
    return this.http.get<CycleDetail>(`/api/admin/cycles/${id}`);
  }

  close(id: string): Observable<CycleCloseResponse> {
    return this.http.post<CycleCloseResponse>(`/api/admin/cycles/${id}/close`, {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.service.spec.ts'`
Expected: PASS (4 specs).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/cycle-management/cycle-management.service.ts frontend/src/app/admin/cycle-management/cycle-management.service.spec.ts
git commit -m "feat(cycle): add CycleManagementService"
```

---

## Task 3: CycleManagementComponent — history list, filter, pagination

**Files:**
- Create: `frontend/src/app/admin/cycle-management/cycle-management.component.ts`
- Test: `frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `CycleManagementService.list()` (Task 2), `EditableTableComponent` (`readOnly`, `columns`, `rows`, `emptyStateLabel` — `frontend/src/app/shared/components/editable-table/editable-table.component.ts`), `InlineBannerComponent` (`frontend/src/app/shared/components/inline-banner/inline-banner.component.ts`).
- Produces: `CycleManagementComponent` with public `page: CyclePage | null`, `loadError: boolean`, `historyColumns`, `historyRows`, `goToPage(page: number)`, `onStatusChange(value: string)` — Task 4 extends this same component/file with the detail side panel; Task 5 extends it with the close action; Task 6 routes to it as `sectionKey: 'cycleManagement'`.

- [ ] **Step 1: Add the required i18n keys**

In `frontend/src/assets/i18n/en.json`, inside the top-level `"admin"` object (alongside the existing `salesRegister`/`kycQueue` blocks), add:

```json
    "cycleManagement": {
      "title": "Cycle Management",
      "subtitle": "Review past settlement cycles and trigger the close for the current one.",
      "statusFilterLabel": "Status",
      "statusFilterAllOption": "All statuses",
      "statusOpenOption": "Open",
      "statusCalculatingOption": "Calculating",
      "statusClosedOption": "Closed",
      "statusPaidOption": "Paid",
      "columnPeriodStart": "Period Start",
      "columnPeriodEnd": "Period End",
      "columnStatus": "Status",
      "columnActions": "Actions",
      "loadError": "Something went wrong loading cycle history. Please try again.",
      "previousPageAction": "Previous",
      "nextPageAction": "Next",
      "pageIndicator": "Page {{page}} of {{totalPages}}",
      "emptyState": "No cycles match this filter."
    },
```

Add the same block verbatim to `frontend/src/assets/i18n/hi.json` (matching the `kycQueue`/`salesRegister` precedent there, which duplicates the English text rather than translating it).

- [ ] **Step 2: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CycleManagementComponent } from './cycle-management.component';

describe('CycleManagementComponent', () => {
  let fixture: ComponentFixture<CycleManagementComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CycleManagementComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(CycleManagementComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/admin/cycles?page=0&size=20').flush({
      cycles: [
        { id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'CLOSED' },
        { id: 'c2', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'OPEN' }
      ],
      page: 0, size: 20, totalElements: 2
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of cycle history on init', () => {
    expect(fixture.componentInstance.page?.cycles.length).toBe(2);
  });

  it('reloads with the status filter when it changes', () => {
    fixture.componentInstance.onStatusChange('OPEN');

    const req = httpMock.expectOne(r => r.url === '/api/admin/cycles' && r.params.get('status') === 'OPEN');
    req.flush({ cycles: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows a load error when the initial load fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/admin/cycles?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.cycle-management__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/admin/cycles?page=1&size=20');
    req.flush({ cycles: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when no cycles match', () => {
    fixture.componentInstance.onStatusChange('PAID');
    httpMock.expectOne(r => r.params.get('status') === 'PAID').flush({ cycles: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.component.spec.ts'`
Expected: FAIL — `Cannot find module './cycle-management.component'`.

- [ ] **Step 4: Write the implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CycleManagementService } from './cycle-management.service';
import { CycleStatus, CyclePage } from '../models/cycle.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-cycle-management',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent],
  template: `
    <div class="cycle-management">
      <div class="cycle-management__header">
        <h1 class="card-title">{{ 'admin.cycleManagement.title' | translate }}</h1>
        <p class="cycle-management__subtitle">{{ 'admin.cycleManagement.subtitle' | translate }}</p>
      </div>

      <div class="cycle-management__filters">
        <label>
          {{ 'admin.cycleManagement.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.cycleManagement.statusFilterAllOption' | translate }}</option>
            <option value="OPEN">{{ 'admin.cycleManagement.statusOpenOption' | translate }}</option>
            <option value="CALCULATING">{{ 'admin.cycleManagement.statusCalculatingOption' | translate }}</option>
            <option value="CLOSED">{{ 'admin.cycleManagement.statusClosedOption' | translate }}</option>
            <option value="PAID">{{ 'admin.cycleManagement.statusPaidOption' | translate }}</option>
          </select>
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" class="cycle-management__load-error" (dismissed)="loadError = false">{{ 'admin.cycleManagement.loadError' | translate }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="historyColumns"
          [rows]="historyRows"
          [emptyStateLabel]="'admin.cycleManagement.emptyState' | translate"
        ></app-editable-table>
      </div>

      <div class="cycle-management__pagination" *ngIf="page">
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.cycleManagement.previousPageAction' | translate }}
        </button>
        <span class="cycle-management__page-indicator">
          {{ 'admin.cycleManagement.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.cycleManagement.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class CycleManagementComponent implements OnInit {
  private cycleManagementService = inject(CycleManagementService);
  private translate = inject(TranslateService);

  page: CyclePage | null = null;
  loadError = false;
  historyColumns: EditableTableColumn[] = [];
  historyRows: Record<string, string>[] = [];
  private status: CycleStatus | '' = '';

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
      { key: 'periodStart', label: this.translate.instant('admin.cycleManagement.columnPeriodStart'), type: 'text' },
      { key: 'periodEnd', label: this.translate.instant('admin.cycleManagement.columnPeriodEnd'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.cycleManagement.columnStatus'), type: 'text' }
    ];
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value as CycleStatus | '';
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  protected loadPage(page: number): void {
    this.loadError = false;
    this.cycleManagementService.list(this.status, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.historyRows = (this.page?.cycles ?? []).map(cycle => ({
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      status: cycle.status
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.component.spec.ts'`
Expected: PASS (5 specs).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/cycle-management/cycle-management.component.ts frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(cycle): add CycleManagementComponent history list/filter/pagination"
```

---

## Task 4: CycleManagementComponent — detail drill-down side panel

**Files:**
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.component.ts`
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `CycleManagementService.detail(id)` (Task 2), `SidePanelComponent` (`open`, `title`, `(closed)` — `frontend/src/app/shared/components/side-panel/side-panel.component.ts`, same component `SettingsOverviewComponent`'s compensation-history panel already uses).
- Produces: adds `selectedDetail: CycleDetail | null`, `detailPanelOpen: boolean`, `detailError: boolean`, `viewDetail(id: string): void`, `closeDetailPanel(): void` to `CycleManagementComponent` (Task 3) — no new consumers beyond this component.

Every history row gets a "View Detail" action (an `actionTemplate` column, same idiom `SalesRegisterComponent`'s void action and `KycQueueComponent`'s decision actions already use) that fetches and opens the side panel showing the cycle's per-income-type breakdown and overall net total.

- [ ] **Step 1: Add the required i18n keys**

Add to the `admin.cycleManagement` block in both `en.json` and `hi.json` (same duplication rule as Task 3):

```json
      "viewDetailAction": "View Detail",
      "detailPanelTitle": "Cycle Detail",
      "detailPeriodLabel": "Period",
      "detailStatusLabel": "Status",
      "detailBreakdownTitle": "Income Breakdown",
      "detailTotalNetLabel": "Total Net",
      "detailError": "Could not load this cycle's detail. Please try again.",
      "incomeTypeDirectLabel": "Direct",
      "incomeTypeMatchingLabel": "Matching",
      "incomeTypeSponsorMatchingLabel": "Sponsor Matching",
      "incomeTypeRoyaltyLabel": "Royalty",
      "incomeTypeRewardLabel": "Reward"
```

- [ ] **Step 2: Write the failing test (append to `cycle-management.component.spec.ts`)**

```typescript
  it('fetches and opens the detail side panel when View Detail is clicked', () => {
    fixture.detectChanges();
    fixture.componentInstance.viewDetail('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1');
    req.flush({
      id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'CLOSED',
      incomeTypeTotals: [
        { incomeType: 'DIRECT', totalNet: 500 },
        { incomeType: 'MATCHING', totalNet: 200 },
        { incomeType: 'SPONSOR_MATCHING', totalNet: 20 },
        { incomeType: 'ROYALTY', totalNet: 10 },
        { incomeType: 'REWARD', totalNet: 0 }
      ],
      totalNet: 730
    });

    expect(fixture.componentInstance.selectedDetail?.totalNet).toBe(730);
    expect(fixture.componentInstance.detailPanelOpen).toBe(true);
  });

  it('shows a detail error when the drill-down fetch fails, without silently doing nothing', () => {
    fixture.componentInstance.viewDetail('c1');

    const req = httpMock.expectOne('/api/admin/cycles/c1');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.detailError).toBe(true);
    expect(fixture.componentInstance.selectedDetail).toBeNull();
  });

  it('closes the detail panel via closeDetailPanel', () => {
    fixture.componentInstance.detailPanelOpen = true;
    fixture.componentInstance.closeDetailPanel();

    expect(fixture.componentInstance.detailPanelOpen).toBe(false);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.component.spec.ts'`
Expected: FAIL — `viewDetail`/`selectedDetail`/`detailPanelOpen`/`closeDetailPanel` undefined.

- [ ] **Step 4: Write the implementation**

Add `SidePanelComponent` to imports, add an Actions column to `historyColumns`, add the `actionTemplate` + side panel markup, and add the new state/methods:

```typescript
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';
import { CycleDetail } from '../models/cycle-detail.model';
// ... existing imports

@Component({
  selector: 'app-cycle-management',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent, SidePanelComponent],
  template: `
    <div class="cycle-management">
      <!-- ...header, filters, load-error banner unchanged from Task 3... -->

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="historyColumns"
          [rows]="historyRows"
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.cycleManagement.emptyState' | translate"
        ></app-editable-table>
      </div>
      <ng-template #actionsTpl let-i="index">
        <button type="button" class="cycle-management__view-detail-action brand-button brand-button--secondary" (click)="viewDetail(page!.cycles[i].id)">
          {{ 'admin.cycleManagement.viewDetailAction' | translate }}
        </button>
      </ng-template>

      <!-- ...pagination unchanged from Task 3... -->

      <app-side-panel
        [open]="detailPanelOpen"
        [title]="'admin.cycleManagement.detailPanelTitle' | translate"
        (closed)="closeDetailPanel()"
      >
        <app-inline-banner *ngIf="detailError" tone="danger" class="cycle-management__detail-error">{{ 'admin.cycleManagement.detailError' | translate }}</app-inline-banner>
        <div class="cycle-management__detail-body" *ngIf="selectedDetail as detail">
          <p><strong>{{ 'admin.cycleManagement.detailPeriodLabel' | translate }}:</strong> {{ detail.periodStart }} – {{ detail.periodEnd }}</p>
          <p><strong>{{ 'admin.cycleManagement.detailStatusLabel' | translate }}:</strong> {{ detail.status }}</p>
          <h3>{{ 'admin.cycleManagement.detailBreakdownTitle' | translate }}</h3>
          <ul class="cycle-management__breakdown-list">
            <li *ngFor="let row of detail.incomeTypeTotals" class="cycle-management__breakdown-row">
              <span>{{ 'admin.cycleManagement.incomeType' + incomeTypeLabelSuffix(row.incomeType) | translate }}</span>
              <span class="cycle-management__breakdown-amount">{{ row.totalNet }}</span>
            </li>
          </ul>
          <p class="cycle-management__detail-total"><strong>{{ 'admin.cycleManagement.detailTotalNetLabel' | translate }}:</strong> {{ detail.totalNet }}</p>
        </div>
      </app-side-panel>
    </div>
  `
})
export class CycleManagementComponent implements OnInit {
  // ...existing fields from Task 3...
  selectedDetail: CycleDetail | null = null;
  detailPanelOpen = false;
  detailError = false;

  // ...existing methods from Task 3...

  viewDetail(id: string): void {
    this.detailError = false;
    this.selectedDetail = null;
    this.cycleManagementService.detail(id).subscribe({
      next: detail => {
        this.selectedDetail = detail;
        this.detailPanelOpen = true;
      },
      error: () => (this.detailError = true)
    });
  }

  closeDetailPanel(): void {
    this.detailPanelOpen = false;
  }

  incomeTypeLabelSuffix(incomeType: string): string {
    // 'SPONSOR_MATCHING' -> 'SponsorMatching', matching the i18n key suffixes above.
    return incomeType
      .toLowerCase()
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') + 'Label';
  }
}
```

Also add `{ key: 'actions', label: this.translate.instant('admin.cycleManagement.columnActions'), type: 'action' }` to `historyColumns` in `ngOnInit()`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.component.spec.ts'`
Expected: PASS (8 specs total).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/cycle-management/cycle-management.component.ts frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(cycle): add detail drill-down side panel to CycleManagementComponent"
```

---

## Task 5: CycleManagementComponent — close action against the current OPEN cycle

**Files:**
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.component.ts`
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `CycleManagementService.close(id)` (Task 2), `BrandButtonComponent` (`variant`, `(clicked)` — `frontend/src/app/shared/components/brand-button/brand-button.component.ts`).
- Produces: adds `currentOpenCycle: CycleSummary | null` (derived from the loaded history page), `closeResult: CycleCloseResponse | null`, `closeError: 'conflict' | 'generic' | null`, `closeCycle(): void` to `CycleManagementComponent` (Tasks 3–4) — this is the screen's terminal action, no further consumers.

**Design decision (no dedicated "current open cycle" endpoint exists):** the backend never exposes "which cycle is open" as its own endpoint — only the paginated, `periodStart`-descending history list (unit 1). Since `CycleService.getOrOpenCurrent()` always keeps exactly one `OPEN` cycle, and it is always the newest by `periodStart` (the property the list already sorts by, descending), the `OPEN` cycle is derivable client-side as `page.cycles.find(c => c.status === 'OPEN')` from whichever unfiltered page-0 load is currently in memory — no new backend query is invented here. This recomputes after every unfiltered `loadPage(0)` (the initial load, and every reload after a close); it deliberately does **not** recompute on a *filtered* reload (e.g. a user viewing `status=CLOSED` only), since a filtered page's absence of an `OPEN` row is not information about whether one exists — `currentOpenCycle` is left as its last-known value in that case, keeping the "Close Cycle" affordance visible even while the admin is filtering the table to something else.

- [ ] **Step 1: Add the required i18n keys**

Add to the `admin.cycleManagement` block in both `en.json` and `hi.json` (same duplication rule as prior tasks):

```json
      "currentCycleTitle": "Current Cycle",
      "currentCyclePeriodLabel": "Period",
      "closeCycleAction": "Close Cycle",
      "closeSuccessTitle": "Cycle closed",
      "closeSuccessClosedCycleLabel": "Closed cycle",
      "closeSuccessLegVolumeRowsLabel": "Leg-volume rows written",
      "closeSuccessNewCycleLabel": "New cycle opened",
      "closeConflictError": "This cycle was already closed (possibly by a concurrent request). Refresh to see its current status.",
      "closeGenericError": "Could not close this cycle. Please try again."
```

- [ ] **Step 2: Write the failing test (append to `cycle-management.component.spec.ts`)**

```typescript
  it('derives the current OPEN cycle from the unfiltered history page and shows a Close Cycle button', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.currentOpenCycle?.id).toBe('c2');
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('.cycle-management__close-cycle-action');
    expect(button).toBeTruthy();
  });

  it('does not show a Close Cycle button when no OPEN cycle is present', () => {
    fixture.componentInstance.onStatusChange('CLOSED');
    httpMock.expectOne(r => r.params.get('status') === 'CLOSED').flush({
      cycles: [{ id: 'c1', periodStart: '2026-08-01', periodEnd: '2026-08-15', status: 'CLOSED' }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    // currentOpenCycle keeps its last-known value from the unfiltered load above (c2) --
    // filtering to CLOSED must not clear it, per this task's design decision.
    expect(fixture.componentInstance.currentOpenCycle?.id).toBe('c2');
  });

  it('closes the current cycle and shows the SettlementResult monitor banner', () => {
    fixture.detectChanges();
    fixture.componentInstance.closeCycle();

    const req = httpMock.expectOne('/api/admin/cycles/c2/close');
    expect(req.request.method).toBe('POST');
    req.flush({ cycleId: 'c2', status: 'CLOSED', legVolumeRowsWritten: 5, newCycleId: 'c3' });

    httpMock.expectOne('/api/admin/cycles?page=0&size=20').flush({
      cycles: [
        { id: 'c2', periodStart: '2026-08-16', periodEnd: '2026-08-31', status: 'CLOSED' },
        { id: 'c3', periodStart: '2026-09-01', periodEnd: '2026-09-15', status: 'OPEN' }
      ],
      page: 0, size: 20, totalElements: 2
    });

    expect(fixture.componentInstance.closeResult?.newCycleId).toBe('c3');
    expect(fixture.componentInstance.closeError).toBeNull();
  });

  it('shows a conflict error on a 409 without crashing', () => {
    fixture.detectChanges();
    fixture.componentInstance.closeCycle();

    const req = httpMock.expectOne('/api/admin/cycles/c2/close');
    req.flush({ error: 'Cycle is not open, cannot close' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.closeError).toBe('conflict');
    expect(fixture.componentInstance.closeResult).toBeNull();
  });

  it('shows a generic error on a non-409 close failure', () => {
    fixture.detectChanges();
    fixture.componentInstance.closeCycle();

    const req = httpMock.expectOne('/api/admin/cycles/c2/close');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.closeError).toBe('generic');
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.component.spec.ts'`
Expected: FAIL — `currentOpenCycle`/`closeCycle`/`closeResult`/`closeError` undefined, `.cycle-management__close-cycle-action` not found.

- [ ] **Step 4: Write the implementation**

Add `BrandButtonComponent` to imports, add the current-cycle card + result/error banners to the template, and add the new state/methods:

```typescript
import { BrandButtonComponent } from '../../shared/components/brand-button/brand-button.component';
import { CycleSummary } from '../models/cycle.model';
import { CycleCloseResponse } from '../models/cycle-close-response.model';
import { HttpErrorResponse } from '@angular/common/http';
// ... existing imports

@Component({
  selector: 'app-cycle-management',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent, SidePanelComponent, BrandButtonComponent],
  template: `
    <div class="cycle-management">
      <div class="cycle-management__header">
        <h1 class="card-title">{{ 'admin.cycleManagement.title' | translate }}</h1>
        <p class="cycle-management__subtitle">{{ 'admin.cycleManagement.subtitle' | translate }}</p>
      </div>

      <div class="cycle-management__current-cycle card" *ngIf="currentOpenCycle as open">
        <h2>{{ 'admin.cycleManagement.currentCycleTitle' | translate }}</h2>
        <p>{{ 'admin.cycleManagement.currentCyclePeriodLabel' | translate }}: {{ open.periodStart }} – {{ open.periodEnd }}</p>
        <app-brand-button variant="danger" class="cycle-management__close-cycle-action" (clicked)="closeCycle()">
          {{ 'admin.cycleManagement.closeCycleAction' | translate }}
        </app-brand-button>
      </div>

      <app-inline-banner *ngIf="closeResult as result" tone="success" [dismissible]="true" class="cycle-management__close-success" (dismissed)="closeResult = null">
        <p>{{ 'admin.cycleManagement.closeSuccessTitle' | translate }}</p>
        <p>{{ 'admin.cycleManagement.closeSuccessClosedCycleLabel' | translate }}: <strong>{{ result.cycleId }}</strong> ({{ result.status }})</p>
        <p>{{ 'admin.cycleManagement.closeSuccessLegVolumeRowsLabel' | translate }}: <strong>{{ result.legVolumeRowsWritten }}</strong></p>
        <p>{{ 'admin.cycleManagement.closeSuccessNewCycleLabel' | translate }}: <strong>{{ result.newCycleId }}</strong></p>
      </app-inline-banner>
      <app-inline-banner *ngIf="closeError === 'conflict'" tone="danger" [dismissible]="true" class="cycle-management__close-conflict-error" (dismissed)="closeError = null">{{ 'admin.cycleManagement.closeConflictError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="closeError === 'generic'" tone="danger" [dismissible]="true" class="cycle-management__close-generic-error" (dismissed)="closeError = null">{{ 'admin.cycleManagement.closeGenericError' | translate }}</app-inline-banner>

      <!-- ...filters, load-error banner, table, pagination, side panel unchanged from Tasks 3-4... -->
    </div>
  `
})
export class CycleManagementComponent implements OnInit {
  // ...existing fields from Tasks 3-4...
  currentOpenCycle: CycleSummary | null = null;
  closeResult: CycleCloseResponse | null = null;
  closeError: 'conflict' | 'generic' | null = null;

  // ...existing methods from Tasks 3-4...

  protected loadPage(page: number): void {
    this.loadError = false;
    this.cycleManagementService.list(this.status, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
        // Only an UNFILTERED load is informative about whether an OPEN cycle exists -- see
        // this task's "Design decision" note. A filtered page's absence of an OPEN row must not
        // clear a previously-known currentOpenCycle.
        if (!this.status) {
          this.currentOpenCycle = res.cycles.find(c => c.status === 'OPEN') ?? null;
        }
      },
      error: () => (this.loadError = true)
    });
  }

  closeCycle(): void {
    if (!this.currentOpenCycle) {
      return;
    }
    this.closeError = null;
    this.cycleManagementService.close(this.currentOpenCycle.id).subscribe({
      next: result => {
        this.closeResult = result;
        this.loadPage(0);
      },
      error: (err: HttpErrorResponse) => {
        this.closeResult = null;
        this.closeError = err.status === 409 ? 'conflict' : 'generic';
      }
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-management.component.spec.ts'`
Expected: PASS (13 specs total).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/cycle-management/cycle-management.component.ts frontend/src/app/admin/cycle-management/cycle-management.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(cycle): add close-cycle action to CycleManagementComponent"
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
- Consumes: `CycleManagementComponent` (Tasks 3–5); `authGuard`, `adminGuard`, `launchedModeGuard` (existing, already applied at the parent `settings` route).
- Produces: reachable route `/settings/cycle-management`.

- [ ] **Step 1: Add the nav-rail i18n key**

In `en.json`'s `"settings"."sections"` object, add `"cycleManagement": "Cycle Management"`. In `hi.json`'s same object (which gets real Hindi for the newer entries — `auditLog`, `adminStats`, `salesRegister` — per this plan's Global Constraints), add `"cycleManagement": "चक्र प्रबंधन"`.

- [ ] **Step 2: Write the failing routing test (append to `app.routes.spec.ts`'s existing `describe('settings route', ...)` block)**

```typescript
    it('has a cycle-management child stamped with sectionKey cycleManagement', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const cycleManagementChild = settingsRoute!.children!.find(c => c.path === 'cycle-management');
      expect(cycleManagementChild).toBeTruthy();
      expect(cycleManagementChild!.data).toEqual({ sectionKey: 'cycleManagement' });
    });
```

- [ ] **Step 3: Write the failing nav-rail test changes**

In `settings-nav-rail.component.spec.ts`, update the row-count assertion (now `+ 7`, one more than the current `+ 6`) and add active/link checks for the new last row:

```typescript
  it('renders one row per section plus hardcoded associate directory, tree explorer, kyc queue, audit log, admin stats, sales register, and cycle management rows', () => {
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items.length).toBe(Object.keys(SECTION_PATHS).length + 7);
  });

  it('marks the sales register row active when the active section key is salesRegister', () => {
    fixture.componentInstance.activeSectionKey = 'salesRegister';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 2].classList).toContain('settings-nav-rail__item--active');
  });

  it('marks the cycle management row active when the active section key is cycleManagement', () => {
    fixture.componentInstance.activeSectionKey = 'cycleManagement';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 1].classList).toContain('settings-nav-rail__item--active');
  });

  it('links each row to its section route so the shell can be navigated by clicking the rail', () => {
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item a');
    expect(links[0].getAttribute('href')).toBe('/settings/company-profile');
    expect(links[links.length - 2].getAttribute('href')).toBe('/settings/sales-register');
    expect(links[links.length - 1].getAttribute('href')).toBe('/settings/cycle-management');
  });
```

(This replaces the existing "marks the sales register row active"/"links each row..." assertions, which currently check `items.length - 1`/`links[links.length - 1]` for `salesRegister` — those shift to `- 2` now that `cycleManagement` is the new last row.)

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts' --include='**/settings-nav-rail.component.spec.ts'`
Expected: FAIL — route/nav row not found yet, and the updated row-count/index assertions fail against the pre-change nav rail.

- [ ] **Step 5: Wire the route**

In `frontend/src/app/app.routes.ts`, add the import:

```typescript
import { CycleManagementComponent } from './admin/cycle-management/cycle-management.component';
```

Add the `settings` child next to `sales-register`:

```typescript
      { path: 'cycle-management', component: CycleManagementComponent, data: { sectionKey: 'cycleManagement' } },
```

- [ ] **Step 6: Wire the nav rail**

In `frontend/src/app/settings/settings-nav-rail.component.ts`, add a new `<li>` after the `salesRegister` one:

```typescript
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'cycleManagement'">
          <a [routerLink]="['/settings', 'cycle-management']">{{ 'settings.sections.cycleManagement' | translate }}</a>
        </li>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts' --include='**/settings-nav-rail.component.spec.ts' --include='**/cycle-management.component.spec.ts'`
Expected: PASS across all three spec files (confirms Tasks 3–5's component still compiles now that it's imported by `app.routes.ts`).

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, no regressions in any other spec file.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/app/settings/settings-nav-rail.component.ts frontend/src/app/settings/settings-nav-rail.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(cycle): route and link the Cycle Management screen"
```

---

## Task 7: Apply the design artifact

**Blocked on:** the `superpowers:frontend-design` dispatch against Part A above having produced `docs/design/admin_operational_screens/cycle_management/{DESIGN.md,screen.png,code.html}`. Do not start this task until that directory exists with real content (not this plan's placeholder path description).

**Files:**
- Read: `docs/design/admin_operational_screens/cycle_management/DESIGN.md`, `screen.png`, `code.html`
- Modify: `frontend/src/styles/_admin.scss` (append — this file already holds every admin screen's bespoke CSS, e.g. `.sales-register__*`/`.record-sale__*`)
- Modify: `frontend/src/app/admin/cycle-management/cycle-management.component.ts` (template `class` attributes only — no logic changes)

**Interfaces:**
- Consumes: Tasks 3–6's working, functionally-complete-but-unstyled screen; the design artifact's `code.html` markup/class shapes and `DESIGN.md`'s documented tokens.
- Produces: no new public interface — this is a pure visual pass. Existing component tests (Tasks 3–5) must keep passing unmodified (they assert on functional CSS classes like `.cycle-management__load-error`/`.cycle-management__close-cycle-action`/`.cycle-management__view-detail-action`, which this task must not rename — add new classes alongside them, don't replace).

- [ ] **Step 1: Read the design artifact**

Read `docs/design/admin_operational_screens/cycle_management/DESIGN.md` in full (colors/typography/spacing tokens) and `code.html` (exact markup shape, class names, layout structure for each of the 7 states from Part A). Confirm every color in `DESIGN.md` maps to an existing `frontend/src/styles/_tokens.scss` custom property — per this plan's Global Constraints, it must (the artifact was briefed to reuse the same token set `sales_register`'s design already mapped). If it doesn't, stop and reconcile with the design artifact rather than inventing a new token.

- [ ] **Step 2: Add bespoke SCSS classes to `_admin.scss`**

Append a new section (after the existing `.sales-register__*`/`.record-sale__*` rules) with `.cycle-management__*` classes translating `code.html`'s markup into rules using only `var(--...)` tokens — following the exact pattern already established there (`'Geist'` for headings, `'JetBrains Mono'` for eyebrow/precision figures, `12-20px` radii, `color-mix(...)` pill backgrounds for status/tone badges). Do not touch `.editable-table`/`table`/`th`/`td` rules in `_tables.scss` — those are shared across every admin list screen; the current-cycle card, close-action banners, breakdown list, and side-panel body styling belong in the new `_admin.scss` section instead.

- [ ] **Step 3: Apply the new classes in the component template**

Add bespoke classes from `code.html` onto the existing template elements in `cycle-management.component.ts`, alongside (never replacing) the functional classes Tasks 3–5's tests already assert on (`cycle-management__load-error`, `cycle-management__view-detail-action`, `cycle-management__close-cycle-action`, `cycle-management__close-success`, `cycle-management__close-conflict-error`, `cycle-management__close-generic-error`, `cycle-management__detail-error`).

- [ ] **Step 4: Run the full frontend test suite to confirm no regressions**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS — identical pass count to the end of Task 6 (a pure styling pass changes zero test outcomes).

- [ ] **Step 5: Visual check against `screen.png`**

Run: `cd frontend && npx ng serve` and navigate to `/settings/cycle-management` (as an authenticated Admin). Compare against `screen.png` for each of the 7 states from Part A (history loaded, empty, current-open-cycle card, close success/monitor banner, close conflict error, history load error, detail side panel). Confirm no new hex colors were introduced (`grep -n '#[0-9a-fA-F]\{3,6\}' frontend/src/styles/_admin.scss` should show no new matches beyond what already existed in the file before this task).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/_admin.scss frontend/src/app/admin/cycle-management/cycle-management.component.ts
git commit -m "style(cycle): apply Cycle Management design artifact"
```

---

## Self-Review Notes

- **Spec coverage:** history list (unit 1, `GET /api/admin/cycles`) → Task 3; per-cycle detail/per-income-type breakdown (unit 2, `GET /api/admin/cycles/{id}`) → Task 4; trigger/monitor close (unit 4, `POST /api/admin/cycles/{id}/close`) → Task 5; "one screen, not three" resolution → satisfied by `CycleManagementComponent` owning list+filter+detail+close in a single route, with no second page (unlike Sales Register, which needed one because its record-sale action takes real form input; Close Cycle takes none). Admin-only guarding → inherited from the parent `settings` route's existing `authGuard`+`adminGuard`+`launchedModeGuard` (Task 6), matching how `tree-explorer`/`kyc-queue`/`sales-register` are already guarded, and matching `SecurityConfigTest`'s server-side ADMIN-only enforcement on all three cycle routes (already merged, out of scope here).
- **Real-response-shape discrepancy, resolved before writing tasks:** the task brief's prose ("Returns SettlementResult: entries written per income type, total net amount...") does not match the merged `CycleCloseResponse.java` (`cycleId, status, legVolumeRowsWritten, newCycleId` — confirmed by reading the actual file and its own doc comment, and `CycleControllerTest`'s `jsonPath` assertions). This plan's Global Constraints and Task 1/5 build against the real, current DTO — not the aspirational spec language. Flagged explicitly so nobody "corrects" the frontend to match the spec prose instead of the backend.
- **Explicitly out of scope, confirmed absent from every task:** associate-facing cycle reports (Decision #13 of the domain-design spec — already covered by the existing dashboard endpoint, no screen here), any client-side settlement-math preview/simulation, CSV export, a confirmation modal for Close Cycle (no modal component exists in this codebase — confirmed absent by grep, and Sales Register's plan already established this same constraint for its Void action).
- **Placeholder scan:** every task has concrete file paths, real TypeScript/HTML, and real test assertions — the only intentionally-deferred content is Task 7's design artifact itself (which cannot exist until the `frontend-design` dispatch runs; Task 7 is explicitly gated on it and instructs stopping rather than guessing at colors).
- **Type consistency:** `CycleManagementService.list/detail/close` signatures introduced in Task 2 are used identically in Tasks 3–5; `CycleSummary`/`CyclePage`/`CycleDetail`/`CycleIncomeTypeTotal`/`CycleCloseResponse` field names introduced in Task 1 are used identically everywhere downstream (matching the real backend record field names verbatim: `id`, `periodStart`, `periodEnd`, `status`, `incomeTypeTotals`, `totalNet`, `cycleId`, `legVolumeRowsWritten`, `newCycleId`); `historyColumns`/`historyRows`/`currentOpenCycle`/`selectedDetail`/`closeResult`/`closeError` names introduced in Tasks 3–5 are not renamed in Task 7.
