# Income/Ledger Unit 3 — Admin "Ledger Register" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin "Ledger Register" screen — a cross-associate, view-only, filterable, paginated raw-ledger-entry audit/reconciliation view backed by unit 1's `GET /api/admin/ledger`. No export/report affordance (out of scope per the source spec).

**Architecture:** One Angular standalone component + one thin HTTP service, following the exact frontend pattern this codebase already established for admin cross-user register/audit screens (`SalesRegisterComponent`/`SalesRegisterService`, `docs/superpowers/plans/2026-08-11-sales-admin-register-screen.md`) — minus that screen's create/void actions, since this unit is list/filter/paginate only:
- `LedgerRegisterComponent` — filter bar (Associate, Income Type, Cycle, Status) + a read-only paginated table (reusing `EditableTableComponent` with `readOnly=true`, no action column), mirroring `SalesRegisterComponent`'s Task 3 shape.
- `LedgerRegisterService` — one service with a single `list(filters, page, size)` method, mirroring `SalesRegisterService.list()`.
- The Cycle filter dropdown reuses the **already-merged** `CycleManagementService.list()` (`GET /api/admin/cycles`, admin-only, from the merged Cycle Management spec) rather than inventing a new lookup — this sidesteps the source spec's Decision 9 ("no list-cycles endpoint") because that decision is scoped to the *associate*-facing screen (unit 4); an admin-only cycle-listing endpoint already exists and ships today.

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`, SCSS partials under `frontend/src/styles/`.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md`, unit 3 in `docs/superpowers/plans/2026-08-03-income-ledger-units.md`.

## Global Constraints

- **Backend dependency risk — read before starting implementation.** This screen is planned against unit 1's *contract* (`GET /api/admin/ledger` → `AdminLedgerPageResponse(entries, page, size, totalElements)`, each `AdminLedgerEntryResponse` including `associateUserId`/`associateName`, `cyclePeriodStart`/`cyclePeriodEnd`, `incomeType`, `status`, nullable `sourceRef`, plus `LedgerEntry`'s standard fields), because unit 1 is being planned in parallel and had not been implemented at plan-writing time. **Before Task 1, open the actual merged `backend/src/main/java/com/plotchain/income/AdminLedgerEntryResponse.java` (and `AdminLedgerPageResponse.java`) and diff its field names/types against Task 1's `AdminLedgerEntry` model below.** If any field name differs (e.g. `netAmount` vs `amount`, camelCase mismatches), fix the model in Task 1 before writing Task 2/3 — do not implement Tasks 2–3 against a model you haven't reconciled first.
- Angular 18.2 standalone components only — no `NgModule`. (Matches every existing component in `frontend/src/app`.)
- View-only screen — no export/report affordance, no create/edit/delete/void action of any kind. An aggregate CSV/PDF "Total Income Report" is explicitly out of scope per the spec's own Out-of-scope section; nothing in this plan should surface one.
- No modal/dialog component exists anywhere in this codebase — do not introduce one (not needed here; there's no write action to confirm).
- Reuse `frontend/src/styles/_tokens.scss` CSS custom properties (`--surface-page`, `--surface-card`, `--surface-raised`, `--border-subtle`, `--text-primary`, `--text-muted`, `--status-success/warning/danger`, `--brand-primary`/`--brand-secondary`) everywhere. Never introduce a new hex color or a new custom property.
- Every user-facing string goes through `TranslateModule`/`| translate` with a key added to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Precedent (`admin.salesRegister.*` in `hi.json`) shows feature-copy blocks may duplicate the English text verbatim in `hi.json` — follow that exact split.
- Page size: client requests `size=20` by default (matching `PAGE_SIZE` in every existing admin list component); the backend clamps `size` to 100 regardless (unit 1 Decision 8).
- `incomeType` filter options include `PERK` (spec Decision 10 — un-hidden, no special-casing).
- `status` filter options are all four `LedgerEntryStatus` enum values (`PENDING`, `CARRIED_FORWARD`, `PAID`, `REVERSED`) — this is an audit view, so `REVERSED` (used by voided-sale-linked entries) is shown like any other status, not hidden.
- This plan does not produce `docs/design/*/screen.png`/`DESIGN.md` — that's a separate `superpowers:frontend-design` dispatch that runs after this plan is approved, same as the Sales Register precedent's Task 7. Tasks 1–4 here build a fully functional, generically-styled screen first.
- No PAN, EMI, matching/royalty income-calculation logic, cycle-close, or wallet/withdrawal UI — all out of scope per the source spec's own Scope section; nothing in this plan should surface them.

---

## Part A — File Structure

**New files:**
- `frontend/src/app/admin/models/ledger-entry.model.ts` — `IncomeType`, `LedgerEntryStatus`, `AdminLedgerEntry` interfaces (mirrors `AdminLedgerEntryResponse.java` — **verify field names against the merged file first**, see Global Constraints).
- `frontend/src/app/admin/models/admin-ledger-page.model.ts` — `AdminLedgerPage`, `AdminLedgerFilters` interfaces (mirrors `AdminLedgerPageResponse.java` + the controller's query params).
- `frontend/src/app/admin/ledger-register/ledger-register.service.ts` + `.spec.ts`
- `frontend/src/app/admin/ledger-register/ledger-register.component.ts` + `.spec.ts`
- `docs/design/admin_operational_screens/ledger_register/{DESIGN.md,screen.png,code.html}` — **not created by this plan**; produced by a later `superpowers:frontend-design` dispatch, out of scope here (listed only so a future plan/reviewer knows where it will land, following the Sales Register precedent's path shape).

**Modified files:**
- `frontend/src/app/app.routes.ts` — add a `ledger-register` child route under the existing `settings` shell, `sectionKey: 'ledgerRegister'` (mirrors the existing `sales-register` child).
- `frontend/src/app/app.routes.spec.ts` — cover the new child route's `sectionKey` data.
- `frontend/src/app/settings/settings-nav-rail.component.ts` + `.spec.ts` — add the Ledger Register nav row (appended after Cycle Management, the current last row).
- `frontend/src/assets/i18n/en.json` / `hi.json` — new `admin.ledgerRegister.*` block, plus `settings.sections.ledgerRegister`.

**No backend changes** — this plan builds only against unit 1's contract; unit 1 itself ships separately.

---

## Task 1: Frontend Ledger models

**Files:**
- Create: `frontend/src/app/admin/models/ledger-entry.model.ts`
- Create: `frontend/src/app/admin/models/admin-ledger-page.model.ts`

**Interfaces:**
- Produces: `IncomeType`, `LedgerEntryStatus`, `AdminLedgerEntry`, `AdminLedgerPage`, `AdminLedgerFilters` — consumed by Task 2's service and Task 3's component.

These are plain type-only files (no logic to test) — mirror the backend records field-for-field, per the current contract in `docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md` (Decisions 11–13) and `docs/superpowers/plans/2026-08-03-income-ledger-units.md` unit 1's acceptance criteria. **Before writing these, complete the Global Constraints verification step** — if unit 1's actual merged `AdminLedgerEntryResponse.java` uses different field names, use those instead of the ones below.

- [ ] **Step 1: Write `ledger-entry.model.ts`**

```typescript
// Field names below mirror the income-ledger spec's unit 1 contract as planned
// (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decisions 11-13) plus LedgerEntry.java's own fields. Unit 1 was still in planning when this
// file was written -- if AdminLedgerEntryResponse.java's actual field names differ once merged,
// update this file to match before building on top of it.
export type IncomeType = 'DIRECT' | 'MATCHING' | 'SPONSOR_MATCHING' | 'ROYALTY' | 'REWARD' | 'PERK';

export type LedgerEntryStatus = 'PENDING' | 'CARRIED_FORWARD' | 'PAID' | 'REVERSED';

export interface AdminLedgerEntry {
  id: string;
  associateId: string;
  associateUserId: string;
  associateName: string;
  incomeType: IncomeType;
  cycleId: string;
  cyclePeriodStart: string;
  cyclePeriodEnd: string;
  grossAmount: number;
  tdsDeduction: number;
  adminDeduction: number;
  netAmount: number;
  status: LedgerEntryStatus;
  sourceRef: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write `admin-ledger-page.model.ts`**

```typescript
import { AdminLedgerEntry, IncomeType, LedgerEntryStatus } from './ledger-entry.model';

export interface AdminLedgerPage {
  entries: AdminLedgerEntry[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminLedgerFilters {
  associateId?: string;
  incomeType?: IncomeType | '';
  cycleId?: string;
  status?: LedgerEntryStatus | '';
}
```

- [ ] **Step 3: Verify the project still compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors (these files aren't imported anywhere yet, so this just checks syntax).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/admin/models/ledger-entry.model.ts frontend/src/app/admin/models/admin-ledger-page.model.ts
git commit -m "feat(income-ledger): add frontend AdminLedgerEntry models"
```

---

## Task 2: LedgerRegisterService

**Files:**
- Create: `frontend/src/app/admin/ledger-register/ledger-register.service.ts`
- Test: `frontend/src/app/admin/ledger-register/ledger-register.service.spec.ts`

**Interfaces:**
- Consumes: `AdminLedgerFilters`, `AdminLedgerPage` (Task 1).
- Produces: `LedgerRegisterService` with `list(filters: AdminLedgerFilters, page: number, size: number): Observable<AdminLedgerPage>` — consumed by Task 3.

- [ ] **Step 1: Write the failing test**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LedgerRegisterService } from './ledger-register.service';
import { AdminLedgerPage } from '../models/admin-ledger-page.model';

describe('LedgerRegisterService', () => {
  let service: LedgerRegisterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LedgerRegisterService]
    });
    service = TestBed.inject(LedgerRegisterService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists ledger entries with filters and pagination as query params', () => {
    const mockResponse: AdminLedgerPage = { entries: [], page: 0, size: 20, totalElements: 0 };

    service
      .list({ associateId: 'a1', incomeType: 'PERK', cycleId: 'c1', status: 'PAID' }, 0, 20)
      .subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne(
      r =>
        r.url === '/api/admin/ledger' &&
        r.params.get('associateId') === 'a1' &&
        r.params.get('incomeType') === 'PERK' &&
        r.params.get('cycleId') === 'c1' &&
        r.params.get('status') === 'PAID'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined or empty', () => {
    service.list({ incomeType: '', status: '' }, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/ledger?page=0&size=20');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/ledger-register.service.spec.ts'`
Expected: FAIL — `Cannot find module './ledger-register.service'`.

- [ ] **Step 3: Write the implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminLedgerFilters, AdminLedgerPage } from '../models/admin-ledger-page.model';

@Injectable({ providedIn: 'root' })
export class LedgerRegisterService {
  private http = inject(HttpClient);

  list(filters: AdminLedgerFilters, page: number, size: number): Observable<AdminLedgerPage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminLedgerPage>('/api/admin/ledger', { params });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/ledger-register.service.spec.ts'`
Expected: PASS (2 specs).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/ledger-register/ledger-register.service.ts frontend/src/app/admin/ledger-register/ledger-register.service.spec.ts
git commit -m "feat(income-ledger): add LedgerRegisterService"
```

---

## Task 3: LedgerRegisterComponent — filter bar, table, pagination

**Files:**
- Create: `frontend/src/app/admin/ledger-register/ledger-register.component.ts`
- Test: `frontend/src/app/admin/ledger-register/ledger-register.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `LedgerRegisterService.list()` (Task 2); `EditableTableComponent` (`readOnly`, `columns`, `rows`, `emptyStateLabel` — `frontend/src/app/shared/components/editable-table/editable-table.component.ts`); `AdminService.listAssociates()` (`frontend/src/app/admin/admin.service.ts`, returns `Observable<AssociateSummary[]>`, already used by `SalesRegisterComponent`); `CycleManagementService.list(status, page, size)` (`frontend/src/app/admin/cycle-management/cycle-management.service.ts`, returns `Observable<CyclePage>` of `CycleSummary { id, periodStart, periodEnd, status }` — already merged, hits the admin-only `GET /api/admin/cycles`).
- Produces: `LedgerRegisterComponent` with public `page: AdminLedgerPage | null`, `loadError: boolean`, `associates: AssociateSummary[]`, `cycles: CycleSummary[]`, `registerColumns`, `registerRows`, `onAssociateIdChange(value: string)`, `onIncomeTypeChange(value: string)`, `onCycleIdChange(value: string)`, `onStatusChange(value: string)`, `goToPage(page: number)` — routed in Task 4 as `sectionKey: 'ledgerRegister'`. No action-related members: this screen has no write path.

- [ ] **Step 1: Add the required i18n keys**

In `frontend/src/assets/i18n/en.json`, inside the top-level `"admin"` object (alongside the existing `salesRegister`/`kycQueue`/`cycleManagement` blocks), add:

```json
    "ledgerRegister": {
      "title": "Ledger Register",
      "associateFilterLabel": "Associate",
      "associateFilterAllOption": "All associates",
      "incomeTypeFilterLabel": "Income Type",
      "incomeTypeFilterAllOption": "All income types",
      "incomeTypeDirectOption": "Direct",
      "incomeTypeMatchingOption": "Matching",
      "incomeTypeSponsorMatchingOption": "Sponsor Matching",
      "incomeTypeRoyaltyOption": "Royalty",
      "incomeTypeRewardOption": "Reward",
      "incomeTypePerkOption": "Perk",
      "cycleFilterLabel": "Cycle",
      "cycleFilterAllOption": "All cycles",
      "statusFilterLabel": "Status",
      "statusFilterAllOption": "All statuses",
      "statusPendingOption": "Pending",
      "statusCarriedForwardOption": "Carried Forward",
      "statusPaidOption": "Paid",
      "statusReversedOption": "Reversed",
      "columnAssociate": "Associate",
      "columnCyclePeriod": "Cycle Period",
      "columnIncomeType": "Income Type",
      "columnStatus": "Status",
      "columnNetAmount": "Net Amount",
      "columnSourceRef": "Source Ref",
      "columnCreatedAt": "Created At",
      "noSourceRef": "—",
      "loadError": "Something went wrong loading the ledger register. Please try again.",
      "previousPageAction": "Previous",
      "nextPageAction": "Next",
      "pageIndicator": "Page {{page}} of {{totalPages}}",
      "emptyState": "No ledger entries match these filters."
    },
```

Add the same block verbatim to `frontend/src/assets/i18n/hi.json` (matching the `salesRegister`/`kycQueue` precedent there, which duplicates the English feature-copy rather than translating it).

- [ ] **Step 2: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { LedgerRegisterComponent } from './ledger-register.component';

describe('LedgerRegisterComponent', () => {
  let fixture: ComponentFixture<LedgerRegisterComponent>;
  let httpMock: HttpTestingController;

  const sampleEntry = {
    id: 'l1',
    associateId: 'a1',
    associateUserId: 'PC-0001',
    associateName: 'Jane Doe',
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

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LedgerRegisterComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(LedgerRegisterComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([]);
    httpMock
      .expectOne(req => req.url === '/api/admin/cycles' && req.method === 'GET')
      .flush({ cycles: [], page: 0, size: 100, totalElements: 0 });
    httpMock.expectOne('/api/admin/ledger?page=0&size=20').flush({
      entries: [sampleEntry],
      page: 0,
      size: 20,
      totalElements: 1
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of ledger entries on init', () => {
    expect(fixture.componentInstance.page?.entries.length).toBe(1);
  });

  it('shows the resolved associate name and cycle period dates, not raw UUIDs', () => {
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Jane Doe');
    expect(rowText).not.toContain('a1');
    expect(rowText).not.toContain('c1');
  });

  it('reloads with the associateId filter when it changes', () => {
    fixture.componentInstance.onAssociateIdChange('a2');

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('associateId') === 'a2');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the incomeType filter when it changes', () => {
    fixture.componentInstance.onIncomeTypeChange('PERK');

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('incomeType') === 'PERK');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the cycleId filter when it changes', () => {
    fixture.componentInstance.onCycleIdChange('c2');

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('cycleId') === 'c2');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the status filter when it changes', () => {
    fixture.componentInstance.onStatusChange('REVERSED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/ledger' && r.params.get('status') === 'REVERSED');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows a load error when the initial load fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/admin/ledger?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.ledger-register__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/admin/ledger?page=1&size=20');
    req.flush({ entries: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when no entries match', () => {
    fixture.componentInstance.onStatusChange('REVERSED');
    httpMock.expectOne(r => r.params.get('status') === 'REVERSED').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('renders a dash for a null sourceRef instead of blank or "null"', () => {
    fixture.componentInstance.onStatusChange('PENDING');
    httpMock.expectOne(r => r.params.get('status') === 'PENDING').flush({
      entries: [{ ...sampleEntry, id: 'l2', sourceRef: null, status: 'PENDING' }],
      page: 0,
      size: 20,
      totalElements: 1
    });
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('—');
  });

  it('has no action column and no row actions — this screen is view-only', () => {
    expect(fixture.componentInstance.registerColumns.some(c => c.type === 'action')).toBeFalse();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/ledger-register.component.spec.ts'`
Expected: FAIL — `Cannot find module './ledger-register.component'`.

- [ ] **Step 4: Write the implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LedgerRegisterService } from './ledger-register.service';
import { AdminLedgerPage, AdminLedgerFilters } from '../models/admin-ledger-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { CycleManagementService } from '../cycle-management/cycle-management.service';
import { CycleSummary } from '../models/cycle.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;
const CYCLE_LOOKUP_SIZE = 100;

@Component({
  selector: 'app-ledger-register',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="ledger-register card">
      <h1 class="card-title">{{ 'admin.ledgerRegister.title' | translate }}</h1>

      <div class="ledger-register__filters">
        <label>
          {{ 'admin.ledgerRegister.associateFilterLabel' | translate }}
          <select (change)="onAssociateIdChange($any($event.target).value)">
            <option value="">{{ 'admin.ledgerRegister.associateFilterAllOption' | translate }}</option>
            <option *ngFor="let associate of associates" [value]="associate.id">
              {{ associate.userId }} — {{ associate.name }}
            </option>
          </select>
        </label>
        <label>
          {{ 'admin.ledgerRegister.incomeTypeFilterLabel' | translate }}
          <select (change)="onIncomeTypeChange($any($event.target).value)">
            <option value="">{{ 'admin.ledgerRegister.incomeTypeFilterAllOption' | translate }}</option>
            <option value="DIRECT">{{ 'admin.ledgerRegister.incomeTypeDirectOption' | translate }}</option>
            <option value="MATCHING">{{ 'admin.ledgerRegister.incomeTypeMatchingOption' | translate }}</option>
            <option value="SPONSOR_MATCHING">{{ 'admin.ledgerRegister.incomeTypeSponsorMatchingOption' | translate }}</option>
            <option value="ROYALTY">{{ 'admin.ledgerRegister.incomeTypeRoyaltyOption' | translate }}</option>
            <option value="REWARD">{{ 'admin.ledgerRegister.incomeTypeRewardOption' | translate }}</option>
            <option value="PERK">{{ 'admin.ledgerRegister.incomeTypePerkOption' | translate }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.ledgerRegister.cycleFilterLabel' | translate }}
          <select (change)="onCycleIdChange($any($event.target).value)">
            <option value="">{{ 'admin.ledgerRegister.cycleFilterAllOption' | translate }}</option>
            <option *ngFor="let cycle of cycles" [value]="cycle.id">
              {{ datePipe.transform(cycle.periodStart, 'mediumDate') }} – {{ datePipe.transform(cycle.periodEnd, 'mediumDate') }}
            </option>
          </select>
        </label>
        <label>
          {{ 'admin.ledgerRegister.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.ledgerRegister.statusFilterAllOption' | translate }}</option>
            <option value="PENDING">{{ 'admin.ledgerRegister.statusPendingOption' | translate }}</option>
            <option value="CARRIED_FORWARD">{{ 'admin.ledgerRegister.statusCarriedForwardOption' | translate }}</option>
            <option value="PAID">{{ 'admin.ledgerRegister.statusPaidOption' | translate }}</option>
            <option value="REVERSED">{{ 'admin.ledgerRegister.statusReversedOption' | translate }}</option>
          </select>
        </label>
      </div>

      <p *ngIf="loadError" class="ledger-register__load-error">{{ 'admin.ledgerRegister.loadError' | translate }}</p>

      <app-editable-table
        [readOnly]="true"
        [columns]="registerColumns"
        [rows]="registerRows"
        [emptyStateLabel]="'admin.ledgerRegister.emptyState' | translate"
      ></app-editable-table>

      <div class="ledger-register__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.ledgerRegister.previousPageAction' | translate }}
        </button>
        <span class="ledger-register__page-indicator">
          {{ 'admin.ledgerRegister.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.ledgerRegister.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class LedgerRegisterComponent implements OnInit {
  private ledgerRegisterService = inject(LedgerRegisterService);
  private adminService = inject(AdminService);
  private cycleManagementService = inject(CycleManagementService);
  private translate = inject(TranslateService);
  protected datePipe = inject(DatePipe);

  page: AdminLedgerPage | null = null;
  loadError = false;
  associates: AssociateSummary[] = [];
  cycles: CycleSummary[] = [];
  registerColumns: EditableTableColumn[] = [];
  registerRows: Record<string, string>[] = [];
  private associateId = '';
  private incomeType = '';
  private cycleId = '';
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
      { key: 'associate', label: this.translate.instant('admin.ledgerRegister.columnAssociate'), type: 'text' },
      { key: 'cyclePeriod', label: this.translate.instant('admin.ledgerRegister.columnCyclePeriod'), type: 'text' },
      { key: 'incomeType', label: this.translate.instant('admin.ledgerRegister.columnIncomeType'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.ledgerRegister.columnStatus'), type: 'text' },
      { key: 'netAmount', label: this.translate.instant('admin.ledgerRegister.columnNetAmount'), type: 'text' },
      { key: 'sourceRef', label: this.translate.instant('admin.ledgerRegister.columnSourceRef'), type: 'text' },
      { key: 'createdAt', label: this.translate.instant('admin.ledgerRegister.columnCreatedAt'), type: 'text' }
    ];
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
    this.cycleManagementService.list('', 0, CYCLE_LOOKUP_SIZE).subscribe(res => (this.cycles = res.cycles));
    this.loadPage(0);
  }

  onAssociateIdChange(value: string): void {
    this.associateId = value;
    this.loadPage(0);
  }

  onIncomeTypeChange(value: string): void {
    this.incomeType = value;
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

  protected loadPage(page: number): void {
    this.loadError = false;
    const filters: AdminLedgerFilters = {};
    if (this.associateId) filters.associateId = this.associateId;
    if (this.incomeType) filters.incomeType = this.incomeType as AdminLedgerFilters['incomeType'];
    if (this.cycleId) filters.cycleId = this.cycleId;
    if (this.status) filters.status = this.status as AdminLedgerFilters['status'];
    this.ledgerRegisterService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.registerRows = (this.page?.entries ?? []).map(entry => ({
      associate: `${entry.associateUserId} — ${entry.associateName}`,
      cyclePeriod: `${this.datePipe.transform(entry.cyclePeriodStart, 'mediumDate')} – ${this.datePipe.transform(entry.cyclePeriodEnd, 'mediumDate')}`,
      incomeType: entry.incomeType,
      status: entry.status,
      netAmount: String(entry.netAmount),
      sourceRef: entry.sourceRef ?? this.translate.instant('admin.ledgerRegister.noSourceRef'),
      createdAt: this.datePipe.transform(entry.createdAt, 'medium') ?? entry.createdAt
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/ledger-register.component.spec.ts'`
Expected: PASS (11 specs).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/ledger-register/ledger-register.component.ts frontend/src/app/admin/ledger-register/ledger-register.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(income-ledger): add LedgerRegisterComponent list/filter/pagination"
```

---

## Task 4: Routing, nav rail, and settings i18n

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `LedgerRegisterComponent` (Task 3).
- Produces: the screen is reachable at `/settings/ledger-register`, guarded by the existing `settings` shell's `authGuard`+`adminGuard`+`launchedModeGuard` (no per-route guard needed — the parent route already enforces it, same as every other `settings` child).

- [ ] **Step 1: Add the `settings.sections.ledgerRegister` i18n key**

In `frontend/src/assets/i18n/en.json`, inside `"settings"."sections"` (after `"cycleManagement"`):

```json
      "cycleManagement": "Cycle Management",
      "ledgerRegister": "Ledger Register"
```

Add the same key/value verbatim to `frontend/src/assets/i18n/hi.json`.

- [ ] **Step 2: Write the failing route test**

Append to `frontend/src/app/app.routes.spec.ts`, inside the existing `describe('settings route', ...)` block (after the `cycle-management` child test):

```typescript
    it('has a ledger-register child stamped with sectionKey ledgerRegister', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const ledgerRegisterChild = settingsRoute!.children!.find(c => c.path === 'ledger-register');
      expect(ledgerRegisterChild).toBeTruthy();
      expect(ledgerRegisterChild!.data).toEqual({ sectionKey: 'ledgerRegister' });
    });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: FAIL — `ledgerRegisterChild` is `undefined` (`Cannot read properties of undefined`).

- [ ] **Step 4: Add the route**

In `frontend/src/app/app.routes.ts`, add the import near the existing `SalesRegisterComponent` import:

```typescript
import { LedgerRegisterComponent } from './admin/ledger-register/ledger-register.component';
```

Add the child route inside the `settings` shell's `children` array, after the existing `cycle-management` entry:

```typescript
      { path: 'cycle-management', component: CycleManagementComponent, data: { sectionKey: 'cycleManagement' } },
      { path: 'ledger-register', component: LedgerRegisterComponent, data: { sectionKey: 'ledgerRegister' } },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Write the failing nav-rail tests**

In `frontend/src/app/settings/settings-nav-rail.component.spec.ts`:

Update the row-count test (the new row shifts the count from `+7` to `+8`):

```typescript
  it('renders one row per section plus hardcoded associate directory, tree explorer, kyc queue, audit log, admin stats, sales register, cycle management, and ledger register rows', () => {
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items.length).toBe(Object.keys(SECTION_PATHS).length + 8);
  });
```

Update the cycle-management active-row test (ledger register is now the new last row, so cycle management is `length - 2`, not `length - 1`):

```typescript
  it('marks the cycle management row active when the active section key is cycleManagement', () => {
    fixture.componentInstance.activeSectionKey = 'cycleManagement';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 2].classList).toContain('settings-nav-rail__item--active');
  });
```

Add a new test for the ledger-register active row:

```typescript
  it('marks the ledger register row active when the active section key is ledgerRegister', () => {
    fixture.componentInstance.activeSectionKey = 'ledgerRegister';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 1].classList).toContain('settings-nav-rail__item--active');
  });
```

Update the last link-href assertion in the `'links each row to its section route...'` test:

```typescript
    expect(links[links.length - 1].getAttribute('href')).toBe('/settings/ledger-register');
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/settings-nav-rail.component.spec.ts'`
Expected: FAIL — count mismatch (missing row), and the new/updated active-row assertions fail because there's no `ledgerRegister` `<li>` yet.

- [ ] **Step 8: Add the nav row**

In `frontend/src/app/settings/settings-nav-rail.component.ts`, add a new `<li>` immediately after the existing Cycle Management row:

```html
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'cycleManagement'">
          <a [routerLink]="['/settings', 'cycle-management']">{{ 'settings.sections.cycleManagement' | translate }}</a>
        </li>
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'ledgerRegister'">
          <a [routerLink]="['/settings', 'ledger-register']">{{ 'settings.sections.ledgerRegister' | translate }}</a>
        </li>
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/settings-nav-rail.component.spec.ts'`
Expected: PASS.

- [ ] **Step 10: Full frontend test suite and typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx ng test --watch=false`
Expected: no new TypeScript errors; full suite green.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/app/settings/settings-nav-rail.component.ts frontend/src/app/settings/settings-nav-rail.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(income-ledger): route and nav-link the Ledger Register screen"
```

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** "lists ledger entries across all associates, filterable by associate/income type (incl. PERK)/cycle/status, sorted newest-first, paginated" → Task 2 (service) + Task 3 (filter bar, `createdAt DESC` comes from the backend, not re-sorted client-side). "Each row shows the resolved associate name and cycle period dates (not raw UUIDs)" → Task 3's `updateTableRows()` + the explicit test asserting `a1`/`c1` never appear in row text. "View-only — no export/report-generation affordance" → Global Constraints + the explicit "no action column" test in Task 3 + no void/create/export code anywhere in this plan.
- **Backend-contract risk:** flagged explicitly at the top of Global Constraints and repeated in Task 1 — this is the single highest-risk item in this plan given unit 1 was still being planned in parallel.
