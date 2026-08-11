# Sales Unit 8 — Admin "Sales Register" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Admin "Sales Register" screen — the one screen (per the spec's own Admin Screens framing) covering all three admin sale operations: list/filter the register (unit 6's `GET /api/admin/sales`), record a new sale (unit 3's `POST /api/admin/sales`), and void a sale with a reason (units 4/5's `POST /api/admin/sales/{id}/void`). All three backend endpoints are already merged on `master` — this plan is frontend-only.

**Architecture:** Two Angular standalone components sharing one HTTP service, following this codebase's existing admin-screen conventions exactly (Associates Directory, KYC Review Queue, Create Associate):
- `SalesRegisterComponent` — the register: filter bar + paginated table + inline void action (reusing `EditableTableComponent`, mirroring `AssociateDirectoryComponent`/`KycQueueComponent`).
- `RecordSaleComponent` — a **separate routed page** (not a modal — this codebase has no modal component anywhere; every existing create-flow, e.g. `CreateAssociateComponent` at `/admin/associates/new`, is its own route) for recording a new sale.
- `SalesRegisterService` — one service with `list()`, `record()`, `voidSale()`, mirroring how `AssociateDirectoryService` bundles a list method with several action methods.

A `superpowers:frontend-design` dispatch runs against Part A of this plan (below) before Task 7, producing a design artifact this plan's last task consumes for visual polish. Tasks 1–6 build a fully functional, generically-styled screen first (same order the codebase already used for Associates Directory/KYC Queue, which today have *zero* screen-specific CSS beyond `.card`/`.editable-table` — bespoke styling is consistently a separate, later pass in this codebase).

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`, SCSS partials under `frontend/src/styles/`.

## Global Constraints

- Angular 18.2 standalone components only — no `NgModule`. (Matches every existing component in `frontend/src/app`.)
- No modal/dialog component exists anywhere in this codebase (verified by repo-wide search) — do not introduce one. Record Sale is a separate route; Void's reason capture is an inline per-row input, matching KYC's inline reject-reason pattern (`frontend/src/app/admin/kyc-queue/kyc-queue.component.ts`), not a confirm dialog.
- All new routes require both `authGuard` and `adminGuard` (this is an ADMIN-only screen per the spec, `SecurityConfigTest` already enforces this server-side).
- Reuse `frontend/src/styles/_tokens.scss` CSS custom properties (`--surface-page`, `--surface-card`, `--surface-raised`, `--border-subtle`, `--text-primary`, `--text-muted`, `--status-success/warning/danger`, `--brand-primary`/`--brand-secondary`) everywhere. Never introduce a new hex color or a new custom property — the design artifact (Task 7) must map onto these existing tokens, not invent a palette.
- Every user-facing string goes through `TranslateModule`/`| translate` with a key added to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Precedent (`admin.kycQueue.*` in `hi.json`) shows feature-copy blocks may duplicate the English text verbatim in `hi.json` (only `settings.sections.*` labels get an actual Hindi translation) — follow that exact split.
- Backend's void endpoint accepts a blank/missing `reason` with no validation error (`docs/superpowers/plans/2026-08-03-sales-units.md`'s "Known scoping decision, not a bug (2026-08-10)" note: this was a deliberate choice, not an oversight). Do **not** add client-side "reason is required" validation that the backend doesn't enforce — that would be inventing a requirement the spec explicitly declined. Mirror `KycQueueComponent.reject()`, which submits `rejectReasons[id]` unconditionally, blank or not.
- Page size: client requests `size=20` by default (matching `PAGE_SIZE` in every existing admin list component); the backend clamps `size` to 100 regardless.
- No PAN, EMI, matching/royalty income, or cycle-management UI — all explicitly out of scope per the source spec's Scope section; nothing in this plan should surface them.

---

## Part A — Design Brief (input to `superpowers:frontend-design`)

This section is the brief a separate `superpowers:frontend-design` dispatch will design against, before Task 7 runs. It is not itself a build task.

**Why this needs a fresh design pass, not reuse of an existing screen's design:** No existing operational admin screen (Associates Directory, KYC Review Queue, Tree Explorer) has a `docs/design/` entry — they were built with only generic `.card`/`.editable-table`/button styling and never got a bespoke pass (confirmed: `grep` across `docs/superpowers/plans/*.md` for those screen names finds no `docs/design/` reference, and `frontend/src/styles/_shared-components.scss` / `_settings.scss` have no `.associate-directory__*` or `.kyc-queue__*` rules at all). This unit is the first data-table-heavy **operational** (post-launch) admin screen to get one. The only existing precedent in `docs/design/` is `stitch_premium_admin_setup_wizard/*` — Stitch mockups for the setup **wizard** (a different context: onboarding, not day-to-day ops). Reuse that palette/typography (it's already the single source baked into `frontend/src/styles/_tokens.scss`), but do not reuse its wizard-specific chrome (eyebrow labels, binary-tree visualizations, step nav) — this is an operational data screen, closer in spirit to a table/dashboard.

**Target artifact path** (new leaf under a new `docs/design/` category for operational screens, sibling to the wizard mockups):
```
docs/design/admin_operational_screens/sales_register/DESIGN.md
docs/design/admin_operational_screens/sales_register/screen.png
docs/design/admin_operational_screens/sales_register/code.html
```
This establishes the pattern future operational-screen redesigns (KYC Review, Associates Directory, a future Cycle History screen) can follow.

**Token/typography constraints to state in the brief:**
- Colors: reuse `docs/design/stitch_premium_admin_setup_wizard/high_performance_enterprise/DESIGN.md`'s palette verbatim — it's already 1:1 identical to `frontend/src/styles/_tokens.scss` (e.g. `on-surface: #0b1c30` = `--text-primary`, `background: #f8f9ff` = `--surface-page`, `outline-variant: #c2c6d9` = `--border-subtle`). Do not propose new hex values.
- Typography: 'Geist' for headings, 'Inter' for body copy, 'JetBrains Mono' for eyebrow/uppercase labels — the exact stack already used in `frontend/src/styles/_admin.scss`'s `.create-associate` rules (the only existing implementation of this token system in a live component today).
- No new component primitives: the design must be expressible using the existing shared components — `EditableTableComponent` (table+action-column), `InlineBannerComponent` (success/error banners), `BrandButtonComponent` (primary/secondary/ghost/danger button variants), `FieldErrorComponent` (form field errors). Do not design a data-grid, dialog, or toast system that doesn't map onto these.

**Screen states to design (all within the two components below):**

1. **Sales Register — default/loaded state.** Filter bar (Associate select, Status select: All/Recorded/Voided, Recorded-From date, Recorded-To date) above a table (columns: Buyer Name, Buyer Phone, Amount, Leg Credited, Status, Recorded At, Actions) with Prev/Next pagination below, matching the KYC Queue's `Page {{page}} of {{totalPages}}` indicator pattern.
2. **Sales Register — empty state.** No sales match the current filters (reuses `EditableTableComponent`'s built-in empty-state row — design its copy/visual treatment only, not new markup).
3. **Sales Register — row actions, split by status.** A `RECORDED` row's Actions cell shows an inline reason `<input>` + "Void" button (mirrors KYC's reject-reason inline input exactly — same interaction shape, this screen's own copy). A `VOIDED` row's Actions cell instead shows a static "Voided" tag/badge plus its `voidReason` (VOIDED rows have no controls — there's no un-void action per the spec).
4. **Sales Register — load error / action error banners** (reuses `InlineBannerComponent` tone="danger", matching `associate-directory__load-error`/`kyc-queue__decision-error`'s placement above the table).
5. **Record Sale — form default state.** A dedicated page (not embedded in the register) with: Project select → Plot select (dependent — plot list repopulates when project changes, filtered to `AVAILABLE` plots only), Associate select, Buyer Name, Buyer Phone, Buyer Email (optional) fields, submit button. Visually should read as a sibling of `docs/design/stitch_premium_admin_setup_wizard/new_associate` (the only existing "admin creates something" screen mockup) but simplified — no binary-placement visualization, since a sale has no tree topology.
6. **Record Sale — success state.** Inline success banner showing the recorded sale's id/amount/buyer name plus a "Record Another" action, mirroring `create-associate`'s temporary-password success banner shape (banner replaces/sits above a reset form).
7. **Record Sale — validation/conflict error states.** Per-field errors (`FieldErrorComponent`, for missing/blank required fields) plus a banner for 404 (unknown plot/associate) and 409 (`PlotNotAvailableException` — plot no longer available) conflicts, mirroring `create-associate`'s `messageForConflict` banner pattern.

**Out of scope for the design brief:** associate-facing "Sales History" (Sales unit 9 — a separate screen/unit), any cycle-monitoring UI, CSV export (spec's Admin row line mentions "export" but it is not one of units 3/4/5/6's shipped endpoints — do not design an export control; there is no backend support for it yet).

---

## Part B — File Structure

**New files:**
- `frontend/src/app/admin/models/sale.model.ts` — `Sale`, `SaleStatus` interfaces (mirrors `SaleResponse.java`/`SaleStatus.java`).
- `frontend/src/app/admin/models/admin-sale-page.model.ts` — `AdminSalePage`, `AdminSaleFilters` interfaces (mirrors `AdminSalePageResponse.java` + the controller's query params).
- `frontend/src/app/admin/models/create-sale-request.model.ts` — `CreateSaleRequest` interface (mirrors `CreateSaleRequest.java`).
- `frontend/src/app/admin/sales-register/sales-register.service.ts` + `.spec.ts`
- `frontend/src/app/admin/sales-register/sales-register.component.ts` + `.spec.ts`
- `frontend/src/app/admin/sales-register/record-sale.component.ts` + `.spec.ts`
- `docs/design/admin_operational_screens/sales_register/{DESIGN.md,screen.png,code.html}` — produced by the `superpowers:frontend-design` dispatch, consumed (not created) by Task 7.

**Modified files:**
- `frontend/src/app/app.routes.ts` — add `settings/sales-register` (child of the `settings` shell, `sectionKey: 'salesRegister'`) and `admin/sales/new` (top-level, `authGuard`+`adminGuard`, mirroring `admin/associates/new`).
- `frontend/src/app/app.routes.spec.ts` — cover the new `admin/sales/new` route's guards (mirroring the existing `admin/associates/new` test).
- `frontend/src/app/settings/settings-nav-rail.component.ts` + `.spec.ts` — add the Sales Register nav row.
- `frontend/src/assets/i18n/en.json` / `hi.json` — new `admin.salesRegister.*`, `admin.recordSale.*` blocks, plus `settings.sections.salesRegister`.
- `frontend/src/styles/_admin.scss` — Task 7 only: bespoke `.sales-register__*`/`.record-sale__*` rules, appended after the existing `.create-associate__*` block (this file is already this codebase's single accumulation point for admin-screen bespoke CSS — it is not split per screen today).

**No backend changes** — all three endpoints are already merged (`SaleController`, `SaleService`, verified directly from source in research for this plan).

---

## Task 1: Frontend Sale models

**Files:**
- Create: `frontend/src/app/admin/models/sale.model.ts`
- Create: `frontend/src/app/admin/models/admin-sale-page.model.ts`
- Create: `frontend/src/app/admin/models/create-sale-request.model.ts`

**Interfaces:**
- Produces: `Sale`, `SaleStatus`, `AdminSalePage`, `AdminSaleFilters`, `CreateSaleRequest` — consumed by Task 2's service and Tasks 3–5's components.

These are plain type-only files (no logic to test) — mirror the backend records field-for-field. No `VoidSaleRequest` model file: the void call only ever needs a single `reason` string, sent as an inline object literal from the service, matching how `KycQueueService.decide()` sends `{ decision, reason }` inline without a dedicated request-model file for its analogous reason param.

- [ ] **Step 1: Write `sale.model.ts`**

```typescript
export type SaleStatus = 'RECORDED' | 'VOIDED';

export interface Sale {
  id: string;
  plotId: string;
  associateId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string | null;
  amount: number;
  cycleId: string;
  legCredited: string;
  status: SaleStatus;
  voidReason: string | null;
  recordedAt: string;
}
```

- [ ] **Step 2: Write `admin-sale-page.model.ts`**

```typescript
import { Sale, SaleStatus } from './sale.model';

export interface AdminSalePage {
  sales: Sale[];
  page: number;
  size: number;
  totalElements: number;
}

export interface AdminSaleFilters {
  associateId?: string;
  status?: SaleStatus | '';
  recordedFrom?: string;
  recordedTo?: string;
}
```

- [ ] **Step 3: Write `create-sale-request.model.ts`**

```typescript
export interface CreateSaleRequest {
  plotId: string;
  associateId: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string;
}
```

- [ ] **Step 4: Verify the project still compiles**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors (these files aren't imported anywhere yet, so this just checks syntax).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/models/sale.model.ts frontend/src/app/admin/models/admin-sale-page.model.ts frontend/src/app/admin/models/create-sale-request.model.ts
git commit -m "feat(sales): add frontend Sale models"
```

---

## Task 2: SalesRegisterService

**Files:**
- Create: `frontend/src/app/admin/sales-register/sales-register.service.ts`
- Test: `frontend/src/app/admin/sales-register/sales-register.service.spec.ts`

**Interfaces:**
- Consumes: `Sale`, `AdminSalePage`, `AdminSaleFilters`, `CreateSaleRequest` (Task 1).
- Produces: `SalesRegisterService` with `list(filters: AdminSaleFilters, page: number, size: number): Observable<AdminSalePage>`, `record(request: CreateSaleRequest): Observable<Sale>`, `voidSale(id: string, reason: string): Observable<Sale>` — consumed by Tasks 3–5.

- [ ] **Step 1: Write the failing test**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SalesRegisterService } from './sales-register.service';
import { AdminSalePage } from '../models/admin-sale-page.model';
import { Sale } from '../models/sale.model';

describe('SalesRegisterService', () => {
  let service: SalesRegisterService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SalesRegisterService]
    });
    service = TestBed.inject(SalesRegisterService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists sales with filters and pagination as query params', () => {
    const mockResponse: AdminSalePage = { sales: [], page: 0, size: 20, totalElements: 0 };

    service.list({ associateId: 'a1', status: 'RECORDED' }, 0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne(
      r => r.url === '/api/admin/sales' && r.params.get('associateId') === 'a1' && r.params.get('status') === 'RECORDED'
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('omits filter params that are undefined or empty', () => {
    service.list({ status: '' }, 0, 20).subscribe();

    const req = httpMock.expectOne('/api/admin/sales?page=0&size=20');
    req.flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('records a sale', () => {
    const mockSale = { id: 's1', status: 'RECORDED' } as Sale;

    service
      .record({ plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999' })
      .subscribe(res => expect(res).toEqual(mockSale));

    const req = httpMock.expectOne('/api/admin/sales');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999' });
    req.flush(mockSale);
  });

  it('voids a sale with a reason', () => {
    const mockSale = { id: 's1', status: 'VOIDED', voidReason: 'Buyer cancelled' } as Sale;

    service.voidSale('s1', 'Buyer cancelled').subscribe(res => expect(res).toEqual(mockSale));

    const req = httpMock.expectOne('/api/admin/sales/s1/void');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Buyer cancelled' });
    req.flush(mockSale);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-register.service.spec.ts'`
Expected: FAIL — `Cannot find module './sales-register.service'`.

- [ ] **Step 3: Write the implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminSaleFilters, AdminSalePage } from '../models/admin-sale-page.model';
import { CreateSaleRequest } from '../models/create-sale-request.model';
import { Sale } from '../models/sale.model';

@Injectable({ providedIn: 'root' })
export class SalesRegisterService {
  private http = inject(HttpClient);

  list(filters: AdminSaleFilters, page: number, size: number): Observable<AdminSalePage> {
    let params = new HttpParams().set('page', page).set('size', size);
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params = params.set(key, value);
      }
    }
    return this.http.get<AdminSalePage>('/api/admin/sales', { params });
  }

  record(request: CreateSaleRequest): Observable<Sale> {
    return this.http.post<Sale>('/api/admin/sales', request);
  }

  voidSale(id: string, reason: string): Observable<Sale> {
    return this.http.post<Sale>(`/api/admin/sales/${id}/void`, { reason });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-register.service.spec.ts'`
Expected: PASS (4 specs).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/admin/sales-register/sales-register.service.ts frontend/src/app/admin/sales-register/sales-register.service.spec.ts
git commit -m "feat(sales): add SalesRegisterService"
```

---

## Task 3: SalesRegisterComponent — list, filter, pagination

**Files:**
- Create: `frontend/src/app/admin/sales-register/sales-register.component.ts`
- Test: `frontend/src/app/admin/sales-register/sales-register.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `SalesRegisterService.list()` (Task 2), `EditableTableComponent` (`readOnly`, `columns`, `rows`, `actionTemplate`, `emptyStateLabel`, `(rowClick)` — `frontend/src/app/shared/components/editable-table/editable-table.component.ts`), `AdminService.listAssociates()` (`frontend/src/app/admin/admin.service.ts`, returns `Observable<AssociateSummary[]>`, already used by `CreateAssociateComponent`).
- Produces: `SalesRegisterComponent` with public `page: AdminSalePage | null`, `loadError: boolean`, `registerColumns`, `registerRows`, `goToPage(page: number)` — Task 4 extends this same component/file with the void action; Task 6 routes to it as `sectionKey: 'salesRegister'`.

- [ ] **Step 1: Add the required i18n keys**

In `frontend/src/assets/i18n/en.json`, inside the top-level `"admin"` object (alongside the existing `kycQueue`/`associateDirectory` blocks), add:

```json
    "salesRegister": {
      "title": "Sales Register",
      "associateFilterLabel": "Associate",
      "associateFilterAllOption": "All associates",
      "statusFilterLabel": "Status",
      "statusFilterAllOption": "All statuses",
      "statusRecordedOption": "Recorded",
      "statusVoidedOption": "Voided",
      "recordedFromLabel": "Recorded from",
      "recordedToLabel": "Recorded to",
      "recordSaleLink": "+ Record Sale",
      "columnBuyerName": "Buyer",
      "columnBuyerPhone": "Phone",
      "columnAmount": "Amount",
      "columnLegCredited": "Leg",
      "columnStatus": "Status",
      "columnRecordedAt": "Recorded At",
      "columnActions": "Actions",
      "loadError": "Something went wrong loading the sales register. Please try again.",
      "actionError": "Could not save that action. Please try again.",
      "previousPageAction": "Previous",
      "nextPageAction": "Next",
      "pageIndicator": "Page {{page}} of {{totalPages}}",
      "emptyState": "No sales match these filters."
    },
```

Add the same block verbatim to `frontend/src/assets/i18n/hi.json` (matching the `kycQueue`/`associateDirectory` precedent there, which duplicates the English feature-copy rather than translating it).

- [ ] **Step 2: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SalesRegisterComponent } from './sales-register.component';

describe('SalesRegisterComponent', () => {
  let fixture: ComponentFixture<SalesRegisterComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      // RouterTestingModule is required because the template uses [routerLink] (the "+ Record
      // Sale" link) -- omitting it makes TestBed.createComponent throw NG02801 (no Router provider).
      imports: [SalesRegisterComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SalesRegisterComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([]);
    httpMock.expectOne('/api/admin/sales?page=0&size=20').flush({
      sales: [
        {
          id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999',
          buyerEmail: null, amount: 100000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
          voidReason: null, recordedAt: '2026-01-01T00:00:00Z'
        }
      ],
      page: 0, size: 20, totalElements: 1
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of sales on init', () => {
    expect(fixture.componentInstance.page?.sales.length).toBe(1);
  });

  it('reloads with the associateId filter when it changes', () => {
    fixture.componentInstance.onAssociateIdChange('a2');

    const req = httpMock.expectOne(r => r.url === '/api/admin/sales' && r.params.get('associateId') === 'a2');
    req.flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the status filter when it changes', () => {
    fixture.componentInstance.onStatusChange('VOIDED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/sales' && r.params.get('status') === 'VOIDED');
    req.flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with recordedFrom/recordedTo when the date filters change', () => {
    fixture.componentInstance.onRecordedFromChange('2026-01-01');
    httpMock.expectOne(r => r.params.get('recordedFrom') === '2026-01-01').flush({ sales: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onRecordedToChange('2026-01-31');
    httpMock.expectOne(r => r.params.get('recordedTo') === '2026-01-31').flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows a load error when the initial load fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/admin/sales?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.sales-register__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/admin/sales?page=1&size=20');
    req.flush({ sales: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when no sales match', () => {
    fixture.componentInstance.onStatusChange('VOIDED');
    httpMock.expectOne(r => r.params.get('status') === 'VOIDED').flush({ sales: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-register.component.spec.ts'`
Expected: FAIL — `Cannot find module './sales-register.component'`.

- [ ] **Step 4: Write the implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { SalesRegisterService } from './sales-register.service';
import { AdminSalePage, AdminSaleFilters } from '../models/admin-sale-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-sales-register',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="sales-register card">
      <div class="sales-register__header">
        <h1 class="card-title">{{ 'admin.salesRegister.title' | translate }}</h1>
        <a class="sales-register__record-link" [routerLink]="['/admin/sales/new']">
          {{ 'admin.salesRegister.recordSaleLink' | translate }}
        </a>
      </div>

      <div class="sales-register__filters">
        <label>
          {{ 'admin.salesRegister.associateFilterLabel' | translate }}
          <select (change)="onAssociateIdChange($any($event.target).value)">
            <option value="">{{ 'admin.salesRegister.associateFilterAllOption' | translate }}</option>
            <option *ngFor="let associate of associates" [value]="associate.id">
              {{ associate.userId }} — {{ associate.name }}
            </option>
          </select>
        </label>
        <label>
          {{ 'admin.salesRegister.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.salesRegister.statusFilterAllOption' | translate }}</option>
            <option value="RECORDED">{{ 'admin.salesRegister.statusRecordedOption' | translate }}</option>
            <option value="VOIDED">{{ 'admin.salesRegister.statusVoidedOption' | translate }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.salesRegister.recordedFromLabel' | translate }}
          <input type="date" (change)="onRecordedFromChange($any($event.target).value)" />
        </label>
        <label>
          {{ 'admin.salesRegister.recordedToLabel' | translate }}
          <input type="date" (change)="onRecordedToChange($any($event.target).value)" />
        </label>
      </div>

      <p *ngIf="loadError" class="sales-register__load-error">{{ 'admin.salesRegister.loadError' | translate }}</p>
      <p *ngIf="actionError" class="sales-register__action-error">{{ 'admin.salesRegister.actionError' | translate }}</p>

      <app-editable-table
        [readOnly]="true"
        [columns]="registerColumns"
        [rows]="registerRows"
        [emptyStateLabel]="'admin.salesRegister.emptyState' | translate"
      ></app-editable-table>

      <div class="sales-register__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.salesRegister.previousPageAction' | translate }}
        </button>
        <span class="sales-register__page-indicator">
          {{ 'admin.salesRegister.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.salesRegister.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class SalesRegisterComponent implements OnInit {
  private salesRegisterService = inject(SalesRegisterService);
  private adminService = inject(AdminService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);

  page: AdminSalePage | null = null;
  loadError = false;
  actionError = false;
  associates: AssociateSummary[] = [];
  registerColumns: EditableTableColumn[] = [];
  registerRows: Record<string, string>[] = [];
  private associateId = '';
  private status = '';
  private recordedFrom = '';
  private recordedTo = '';

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
      { key: 'buyerName', label: this.translate.instant('admin.salesRegister.columnBuyerName'), type: 'text' },
      { key: 'buyerPhone', label: this.translate.instant('admin.salesRegister.columnBuyerPhone'), type: 'text' },
      { key: 'amount', label: this.translate.instant('admin.salesRegister.columnAmount'), type: 'text' },
      { key: 'legCredited', label: this.translate.instant('admin.salesRegister.columnLegCredited'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.salesRegister.columnStatus'), type: 'text' },
      { key: 'recordedAt', label: this.translate.instant('admin.salesRegister.columnRecordedAt'), type: 'text' }
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

  onRecordedFromChange(value: string): void {
    this.recordedFrom = value;
    this.loadPage(0);
  }

  onRecordedToChange(value: string): void {
    this.recordedTo = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  protected loadPage(page: number): void {
    this.loadError = false;
    const filters: AdminSaleFilters = {};
    if (this.associateId) filters.associateId = this.associateId;
    if (this.status) filters.status = this.status as AdminSaleFilters['status'];
    if (this.recordedFrom) filters.recordedFrom = this.recordedFrom;
    if (this.recordedTo) filters.recordedTo = this.recordedTo;
    this.salesRegisterService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.registerRows = (this.page?.sales ?? []).map(sale => ({
      buyerName: sale.buyerName,
      buyerPhone: sale.buyerPhone,
      amount: String(sale.amount),
      legCredited: sale.legCredited,
      status: sale.status,
      recordedAt: this.datePipe.transform(sale.recordedAt, 'medium') ?? sale.recordedAt
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-register.component.spec.ts'`
Expected: PASS (7 specs).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/sales-register/sales-register.component.ts frontend/src/app/admin/sales-register/sales-register.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(sales): add SalesRegisterComponent list/filter/pagination"
```

---

## Task 4: SalesRegisterComponent — void action

**Files:**
- Modify: `frontend/src/app/admin/sales-register/sales-register.component.ts`
- Modify: `frontend/src/app/admin/sales-register/sales-register.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `SalesRegisterService.voidSale(id, reason)` (Task 2).
- Produces: adds `voidReasons: Record<string, string>` and `voidSale(id: string): void` to `SalesRegisterComponent` (Task 3) — no new consumers, this is the screen's terminal action.

The Actions column renders per-row: a `RECORDED` sale gets an inline reason input + Void button (mirroring `KycQueueComponent`'s reject-reason input exactly); a `VOIDED` sale gets a static tag showing its `voidReason` instead (there is no un-void action per the spec).

- [ ] **Step 1: Add the required i18n keys**

Add to the `admin.salesRegister` block in both `en.json` and `hi.json` (same duplication rule as Task 3):

```json
      "voidReasonPlaceholder": "Reason for voiding",
      "voidAction": "Void",
      "voidedTag": "Voided"
```

- [ ] **Step 2: Write the failing test (append to `sales-register.component.spec.ts`)**

```typescript
  it("includes the actions column and renders a reason input + Void button for a RECORDED row", () => {
    fixture.detectChanges();
    expect(fixture.componentInstance.registerColumns.some(c => c.key === 'actions')).toBeTrue();

    const input: HTMLInputElement | null = fixture.nativeElement.querySelector('.sales-register__void-reason-input');
    const button: HTMLButtonElement | null = fixture.nativeElement.querySelector('.sales-register__void-action');
    expect(input).toBeTruthy();
    expect(button).toBeTruthy();
  });

  it('renders a static Voided tag with the void reason for a VOIDED row instead of controls', () => {
    fixture.componentInstance.onStatusChange('VOIDED');
    httpMock.expectOne(r => r.params.get('status') === 'VOIDED').flush({
      sales: [{
        id: 's2', plotId: 'p2', associateId: 'a1', buyerName: 'Ravi', buyerPhone: '8888888888',
        buyerEmail: null, amount: 50000, cycleId: 'c1', legCredited: 'R', status: 'VOIDED',
        voidReason: 'Buyer cancelled', recordedAt: '2026-01-02T00:00:00Z'
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    const tag: HTMLElement | null = fixture.nativeElement.querySelector('.sales-register__voided-tag');
    expect(tag?.textContent).toContain('Buyer cancelled');
    expect(fixture.nativeElement.querySelector('.sales-register__void-action')).toBeFalsy();
  });

  it('voids a sale with the typed reason and reloads the page', () => {
    fixture.componentInstance.voidReasons['s1'] = 'Buyer cancelled';
    fixture.componentInstance.voidSale('s1');

    const req = httpMock.expectOne('/api/admin/sales/s1/void');
    expect(req.request.body).toEqual({ reason: 'Buyer cancelled' });
    req.flush({
      id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999',
      buyerEmail: null, amount: 100000, cycleId: 'c1', legCredited: 'L', status: 'VOIDED',
      voidReason: 'Buyer cancelled', recordedAt: '2026-01-01T00:00:00Z'
    });

    httpMock.expectOne('/api/admin/sales?page=0&size=20').flush({ sales: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.voidReasons['s1']).toBeUndefined();
  });

  it('shows an action error when void fails, without silently doing nothing', () => {
    fixture.componentInstance.voidSale('s1');

    const req = httpMock.expectOne('/api/admin/sales/s1/void');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.sales-register__action-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('sends an empty-string reason as-is when voiding without typing one (backend allows blank reasons)', () => {
    fixture.componentInstance.voidSale('s1');

    const req = httpMock.expectOne('/api/admin/sales/s1/void');
    expect(req.request.body).toEqual({ reason: '' });
    req.flush({ id: 's1', status: 'VOIDED' } as any);
    httpMock.expectOne('/api/admin/sales?page=0&size=20').flush({ sales: [], page: 0, size: 20, totalElements: 0 });
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-register.component.spec.ts'`
Expected: FAIL — `voidReasons`/`voidSale` undefined, no `.sales-register__void-action` element.

- [ ] **Step 4: Write the implementation**

Add `FormsModule` to the component's `imports`, add `voidReasons` state and `voidSale()`, add the actions column + `ng-template`:

```typescript
import { FormsModule } from '@angular/forms';
// ... existing imports

@Component({
  selector: 'app-sales-register',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, RouterLink, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="sales-register card">
      <!-- ...header, filters, error banners unchanged from Task 3... -->

      <app-editable-table
        [readOnly]="true"
        [columns]="registerColumns"
        [rows]="registerRows"
        [actionTemplate]="actionsTpl"
        [emptyStateLabel]="'admin.salesRegister.emptyState' | translate"
      ></app-editable-table>
      <ng-template #actionsTpl let-i="index">
        <ng-container *ngIf="page!.sales[i].status === 'RECORDED'; else voidedTpl">
          <input
            type="text"
            class="sales-register__void-reason-input"
            [(ngModel)]="voidReasons[page!.sales[i].id]"
            [placeholder]="'admin.salesRegister.voidReasonPlaceholder' | translate"
          />
          <button type="button" class="sales-register__void-action" (click)="voidSale(page!.sales[i].id)">
            {{ 'admin.salesRegister.voidAction' | translate }}
          </button>
        </ng-container>
        <ng-template #voidedTpl>
          <span class="sales-register__voided-tag">
            {{ 'admin.salesRegister.voidedTag' | translate }}: {{ page!.sales[i].voidReason }}
          </span>
        </ng-template>
      </ng-template>

      <!-- ...pagination unchanged from Task 3... -->
    </div>
  `
})
export class SalesRegisterComponent implements OnInit {
  // ...existing fields from Task 3...
  voidReasons: Record<string, string> = {};

  // ...existing methods from Task 3...

  voidSale(id: string): void {
    this.actionError = false;
    this.salesRegisterService.voidSale(id, this.voidReasons[id] ?? '').subscribe({
      next: () => {
        delete this.voidReasons[id];
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.actionError = true)
    });
  }
}
```

Also add `{ key: 'actions', label: this.translate.instant('admin.salesRegister.columnActions'), type: 'action' }` to `registerColumns` in `ngOnInit()`.

**Important — avoid the KYC regression** (`kyc-queue.component.spec.ts`'s "accumulates sequential keystrokes" test documents this): `registerColumns`/`registerRows` must stay plain fields reassigned imperatively in `updateTableRows()`, never getters that recompute a fresh array/object identity on every change-detection tick — with `ngModel` on the void-reason input and no `trackBy` override beyond `EditableTableComponent`'s own `trackByIndex`, a getter-based identity change would tear down and rebuild the row's `<input>` mid-keystroke.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-register.component.spec.ts'`
Expected: PASS (12 specs total).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/sales-register/sales-register.component.ts frontend/src/app/admin/sales-register/sales-register.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(sales): add inline void action to SalesRegisterComponent"
```

---

## Task 5: RecordSaleComponent

**Files:**
- Create: `frontend/src/app/admin/sales-register/record-sale.component.ts`
- Test: `frontend/src/app/admin/sales-register/record-sale.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `SalesRegisterService.record()` (Task 2); `AdminService.listAssociates()` (used by `CreateAssociateComponent` already); `ProjectsService.listProjects()` and `ProjectsService.listPlots(projectId, page, size)` (`frontend/src/app/setup/steps/projects/projects.service.ts`, returns `Observable<Project[]>` / `Observable<PlotPageResponse>`); `toFieldErrors()` (`frontend/src/app/core/api/field-errors.model.ts`); `FieldErrorComponent`, `InlineBannerComponent`, `BrandButtonComponent`.
- Produces: `RecordSaleComponent`, routed at `admin/sales/new` in Task 6.

**Design decision (no dedicated "available plots" endpoint exists):** `PlotController` only exposes `GET /api/company/projects/{projectId}/plots` (no cross-project or status-filter query param — verified from source). So plot selection is a dependent two-step picker: choose a Project, then choose an `AVAILABLE` Plot within it (fetched with `size=100`, filtered client-side to `status === 'AVAILABLE'`, refetched whenever the project selection changes). This mirrors `CreateAssociateComponent`'s dependent `parentId` dropdown (populated from a separate list call) rather than inventing a new picker component.

- [ ] **Step 1: Add the required i18n keys**

Add to `en.json`'s `"admin"` object:

```json
    "recordSale": {
      "title": "Record Sale",
      "subtitle": "Record a sale on behalf of an associate and credit their Direct Income.",
      "projectLabel": "Project",
      "projectPlaceholder": "Select a project",
      "plotLabel": "Plot",
      "plotPlaceholder": "Select an available plot",
      "plotEmptyOption": "No available plots in this project",
      "associateLabel": "Associate",
      "associatePlaceholder": "Select an associate",
      "buyerNameLabel": "Buyer Name",
      "buyerPhoneLabel": "Buyer Phone",
      "buyerEmailLabel": "Buyer Email",
      "optionalTagLabel": "Optional",
      "submitButton": "Record Sale",
      "recordAnotherButton": "Record Another",
      "successAmountLabel": "Amount",
      "successBuyerLabel": "Buyer",
      "successSaleIdLabel": "Sale ID",
      "validation": {
        "required": "This field is required.",
        "plotUnavailable": "That plot is no longer available. Choose a different plot.",
        "genericSaveError": "Could not record the sale. Check the details and try again."
      }
    },
```

Add the same block verbatim to `hi.json` (same duplication rule as prior tasks).

- [ ] **Step 2: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RecordSaleComponent } from './record-sale.component';

describe('RecordSaleComponent', () => {
  let fixture: ComponentFixture<RecordSaleComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordSaleComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(RecordSaleComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([]);
    httpMock.expectOne(req => req.url === '/api/company/projects' && req.method === 'GET')
      .flush([{ id: 'proj-1', name: 'Green Meadows', location: 'Pune', hasThumbnail: false, totalPlots: 2, availablePlots: 1, soldPlots: 1, createdAt: '2026-01-01' }]);
  });

  afterEach(() => httpMock.verify());

  it('loads available plots for the selected project, filtering out non-AVAILABLE plots', () => {
    fixture.componentInstance.onProjectChange('proj-1');

    const req = httpMock.expectOne('/api/company/projects/proj-1/plots?page=0&size=100');
    req.flush({
      plots: [
        { id: 'plot-1', plotNo: 'A1', plotType: 'NORMAL', areaSqft: 1200, rate: 100, price: 120000, status: 'AVAILABLE' },
        { id: 'plot-2', plotNo: 'A2', plotType: 'NORMAL', areaSqft: 1200, rate: 100, price: 120000, status: 'SOLD' }
      ],
      page: 0, size: 100, totalElements: 2
    });

    expect(fixture.componentInstance.availablePlots.length).toBe(1);
    expect(fixture.componentInstance.availablePlots[0].id).toBe('plot-1');
  });

  it('submits the form and shows a success banner with the recorded sale', () => {
    fixture.componentInstance.form.patchValue({
      plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/sales');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999', buyerEmail: undefined
    });
    req.flush({
      id: 'sale-1', plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999',
      buyerEmail: null, amount: 120000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
      voidReason: null, recordedAt: '2026-01-01T00:00:00Z'
    });

    expect(fixture.componentInstance.recorded?.id).toBe('sale-1');
    expect(fixture.componentInstance.submitError).toBeNull();
    expect(fixture.componentInstance.form.get('buyerName')!.value).toBeFalsy();
  });

  it('does not submit when the form is invalid', () => {
    fixture.componentInstance.form.patchValue({ plotId: '', associateId: '', buyerName: '', buyerPhone: '' });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/admin/sales');
    expect(fixture.componentInstance.recorded).toBeNull();
  });

  it('sets a submit error on a 409 plot-unavailable conflict', () => {
    fixture.componentInstance.form.patchValue({
      plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/sales');
    req.flush({ error: 'Plot is not available' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.submitError).toBeTruthy();
    expect(fixture.componentInstance.recorded).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/record-sale.component.spec.ts'`
Expected: FAIL — `Cannot find module './record-sale.component'`.

- [ ] **Step 4: Write the implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SalesRegisterService } from './sales-register.service';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Project, Plot } from '../../setup/models/project.model';
import { Sale } from '../models/sale.model';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../../shared/components/brand-button/brand-button.component';

const PLOT_PAGE_SIZE = 100;

@Component({
  selector: 'app-record-sale',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent, BrandButtonComponent],
  template: `
    <div class="record-sale">
      <div class="record-sale__intro">
        <h1 class="record-sale__title">{{ 'admin.recordSale.title' | translate }}</h1>
        <p class="record-sale__subtitle">{{ 'admin.recordSale.subtitle' | translate }}</p>
      </div>

      <app-inline-banner *ngIf="recorded" tone="success">
        <p>{{ 'admin.recordSale.successSaleIdLabel' | translate }}: <strong>{{ recorded.id }}</strong></p>
        <p>{{ 'admin.recordSale.successBuyerLabel' | translate }}: <strong>{{ recorded.buyerName }}</strong></p>
        <p>{{ 'admin.recordSale.successAmountLabel' | translate }}: <strong>{{ recorded.amount }}</strong></p>
        <app-brand-button type="button" variant="secondary" (clicked)="dismissBanner()">
          {{ 'admin.recordSale.recordAnotherButton' | translate }}
        </app-brand-button>
      </app-inline-banner>

      <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

      <form class="card record-sale__form" [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="record-sale__row">
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.projectLabel' | translate }}</label>
            <select (change)="onProjectChange($any($event.target).value)">
              <option value="">{{ 'admin.recordSale.projectPlaceholder' | translate }}</option>
              <option *ngFor="let project of projects" [value]="project.id">{{ project.name }}</option>
            </select>
          </div>
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.plotLabel' | translate }}</label>
            <select formControlName="plotId" (blur)="markTouched('plotId')">
              <option value="">{{ 'admin.recordSale.plotPlaceholder' | translate }}</option>
              <option *ngFor="let plot of availablePlots" [value]="plot.id">{{ plot.plotNo }} — {{ plot.price }}</option>
            </select>
            <app-field-error [message]="fieldError('plotId')"></app-field-error>
          </div>
        </div>

        <div class="record-sale__row">
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.associateLabel' | translate }}</label>
            <select formControlName="associateId" (blur)="markTouched('associateId')">
              <option value="">{{ 'admin.recordSale.associatePlaceholder' | translate }}</option>
              <option *ngFor="let associate of associates" [value]="associate.id">
                {{ associate.userId }} — {{ associate.name }}
              </option>
            </select>
            <app-field-error [message]="fieldError('associateId')"></app-field-error>
          </div>
        </div>

        <div class="record-sale__row">
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.buyerNameLabel' | translate }}</label>
            <input type="text" formControlName="buyerName" (blur)="markTouched('buyerName')" />
            <app-field-error [message]="fieldError('buyerName')"></app-field-error>
          </div>
          <div class="record-sale__field">
            <label>{{ 'admin.recordSale.buyerPhoneLabel' | translate }}</label>
            <input type="text" formControlName="buyerPhone" (blur)="markTouched('buyerPhone')" />
            <app-field-error [message]="fieldError('buyerPhone')"></app-field-error>
          </div>
        </div>

        <div class="record-sale__row">
          <div class="record-sale__field">
            <div class="record-sale__field-header">
              <label>{{ 'admin.recordSale.buyerEmailLabel' | translate }}</label>
              <span class="record-sale__optional-tag">{{ 'admin.recordSale.optionalTagLabel' | translate }}</span>
            </div>
            <input type="email" formControlName="buyerEmail" />
          </div>
        </div>

        <div class="record-sale__actions">
          <app-brand-button type="submit" variant="primary" [disabled]="form.invalid">
            {{ 'admin.recordSale.submitButton' | translate }}
          </app-brand-button>
        </div>
      </form>
    </div>
  `
})
export class RecordSaleComponent implements OnInit {
  private fb = inject(FormBuilder);
  private salesRegisterService = inject(SalesRegisterService);
  private adminService = inject(AdminService);
  private projectsService = inject(ProjectsService);
  private translate = inject(TranslateService);

  form = this.fb.nonNullable.group({
    plotId: ['', Validators.required],
    associateId: ['', Validators.required],
    buyerName: ['', Validators.required],
    buyerPhone: ['', Validators.required],
    buyerEmail: ['']
  });

  recorded: Sale | null = null;
  submitError: string | null = null;
  associates: AssociateSummary[] = [];
  projects: Project[] = [];
  availablePlots: Plot[] = [];
  private selectedProjectId = '';
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
    this.projectsService.listProjects().subscribe(projects => (this.projects = projects));
  }

  onProjectChange(projectId: string): void {
    this.selectedProjectId = projectId;
    this.availablePlots = [];
    this.form.patchValue({ plotId: '' });
    if (!projectId) {
      return;
    }
    this.projectsService.listPlots(projectId, 0, PLOT_PAGE_SIZE).subscribe(page => {
      this.availablePlots = page.plots.filter(plot => plot.status === 'AVAILABLE');
    });
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
      return this.translate.instant('admin.recordSale.validation.required');
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
    const { plotId, associateId, buyerName, buyerPhone, buyerEmail } = this.form.getRawValue();
    this.salesRegisterService
      .record({ plotId, associateId, buyerName, buyerPhone, buyerEmail: buyerEmail || undefined })
      .subscribe({
        next: sale => {
          this.recorded = sale;
          this.serverFieldErrors = {};
          this.submitError = null;
          this.form.reset();
          this.onProjectChange(this.selectedProjectId);
        },
        error: (err: HttpErrorResponse) => {
          this.recorded = null;
          const fields = toFieldErrors(err);
          if (Object.keys(fields).length > 0) {
            this.serverFieldErrors = fields;
            return;
          }
          if (err.status === 409) {
            this.submitError = this.translate.instant('admin.recordSale.validation.plotUnavailable');
          } else {
            this.submitError = this.translate.instant('admin.recordSale.validation.genericSaveError');
          }
        }
      });
  }

  dismissBanner(): void {
    this.recorded = null;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/record-sale.component.spec.ts'`
Expected: PASS (4 specs).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/admin/sales-register/record-sale.component.ts frontend/src/app/admin/sales-register/record-sale.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(sales): add RecordSaleComponent"
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
- Consumes: `SalesRegisterComponent`, `RecordSaleComponent` (Tasks 3–5); `authGuard`, `adminGuard`, `launchedModeGuard` (existing).
- Produces: reachable routes `/settings/sales-register` (`sectionKey: 'salesRegister'`) and `/admin/sales/new`.

- [ ] **Step 1: Add the nav-rail i18n key**

In `en.json`'s `"settings"."sections"` object, add `"salesRegister": "Sales Register"`. In `hi.json`'s same object (which does get real Hindi, matching `auditLog`/`adminStats`), add `"salesRegister": "बिक्री रजिस्टर"`.

- [ ] **Step 2: Write the failing routing test (append to `app.routes.spec.ts`)**

```typescript
  it('guards the admin record-sale route with both authGuard and adminGuard', () => {
    const route = routes.find(r => r.path === 'admin/sales/new');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(adminGuard);
  });

  describe('settings route', () => {
    it('has a sales-register child stamped with sectionKey salesRegister', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const salesRegisterChild = settingsRoute!.children!.find(c => c.path === 'sales-register');
      expect(salesRegisterChild).toBeTruthy();
      expect(salesRegisterChild!.data).toEqual({ sectionKey: 'salesRegister' });
    });
  });
```

(The first `describe('settings route', ...)` block already exists in the file for the `authGuard`/`adminGuard`/`launchedModeGuard` check — add this as a new `it` inside that existing block rather than a second `describe`, to avoid a duplicate block name.)

- [ ] **Step 3: Write the failing nav-rail test changes**

In `settings-nav-rail.component.spec.ts`, update the row-count assertion and the "last item" assertions to account for the new row (added after `adminStats`):

```typescript
  it('renders one row per section plus hardcoded associate directory, tree explorer, kyc queue, audit log, admin stats, and sales register rows', () => {
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items.length).toBe(Object.keys(SECTION_PATHS).length + 6);
  });

  it('marks the admin stats row active when the active section key is adminStats', () => {
    fixture.componentInstance.activeSectionKey = 'adminStats';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 2].classList).toContain('settings-nav-rail__item--active');
  });

  it('marks the sales register row active when the active section key is salesRegister', () => {
    fixture.componentInstance.activeSectionKey = 'salesRegister';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 1].classList).toContain('settings-nav-rail__item--active');
  });

  it('links each row to its section route so the shell can be navigated by clicking the rail', () => {
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item a');
    expect(links[0].getAttribute('href')).toBe('/settings/company-profile');
    expect(links[links.length - 2].getAttribute('href')).toBe('/settings/admin-stats');
    expect(links[links.length - 1].getAttribute('href')).toBe('/settings/sales-register');
  });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts' --include='**/settings-nav-rail.component.spec.ts'`
Expected: FAIL — route/nav row not found yet.

- [ ] **Step 5: Wire the routes**

In `frontend/src/app/app.routes.ts`, add the imports:

```typescript
import { SalesRegisterComponent } from './admin/sales-register/sales-register.component';
import { RecordSaleComponent } from './admin/sales-register/record-sale.component';
```

Add the top-level route next to `admin/associates/new`:

```typescript
  { path: 'admin/sales/new', component: RecordSaleComponent, canActivate: [authGuard, adminGuard] },
```

Add the `settings` child next to `kyc-queue`:

```typescript
      { path: 'sales-register', component: SalesRegisterComponent, data: { sectionKey: 'salesRegister' } },
```

- [ ] **Step 6: Wire the nav rail**

In `frontend/src/app/settings/settings-nav-rail.component.ts`, add a new `<li>` after the `adminStats` one:

```typescript
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'salesRegister'">
          <a [routerLink]="['/settings', 'sales-register']">{{ 'settings.sections.salesRegister' | translate }}</a>
        </li>
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts' --include='**/settings-nav-rail.component.spec.ts' --include='**/sales-register.component.spec.ts' --include='**/record-sale.component.spec.ts'`
Expected: PASS across all four spec files (confirms Tasks 3–5's components still compile now that they're imported by `app.routes.ts`).

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, no regressions in any other spec file.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/app/settings/settings-nav-rail.component.ts frontend/src/app/settings/settings-nav-rail.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(sales): route and link the Sales Register screen"
```

---

## Task 7: Apply the design artifact

**Blocked on:** the `superpowers:frontend-design` dispatch against Part A above having produced `docs/design/admin_operational_screens/sales_register/{DESIGN.md,screen.png,code.html}`. Do not start this task until that directory exists with real content (not this plan's placeholder path description).

**Files:**
- Read: `docs/design/admin_operational_screens/sales_register/DESIGN.md`, `screen.png`, `code.html`
- Modify: `frontend/src/styles/_admin.scss` (append — this file already holds every admin screen's bespoke CSS, e.g. `.create-associate__*`)
- Modify: `frontend/src/app/admin/sales-register/sales-register.component.ts`, `record-sale.component.ts` (template `class` attributes only — no logic changes)

**Interfaces:**
- Consumes: Tasks 3–6's working, functionally-complete-but-unstyled screens; the design artifact's `code.html` markup/class shapes and `DESIGN.md`'s documented tokens.
- Produces: no new public interface — this is a pure visual pass. Existing component tests (Tasks 3–5) must keep passing unmodified (they assert on functional CSS classes like `.sales-register__load-error`/`.sales-register__void-action`, which this task must not rename — add new classes alongside them, don't replace).

- [ ] **Step 1: Read the design artifact**

Read `docs/design/admin_operational_screens/sales_register/DESIGN.md` in full (colors/typography/spacing tokens) and `code.html` (exact markup shape, class names, layout structure for each of the 7 states from Part A). Confirm every color in `DESIGN.md` maps to an existing `frontend/src/styles/_tokens.scss` custom property — per this plan's Global Constraints, it must (the artifact was briefed to reuse `high_performance_enterprise`'s palette, which is already 1:1 with `_tokens.scss`). If it doesn't, stop and reconcile with the design artifact rather than inventing a new token.

- [ ] **Step 2: Add bespoke SCSS classes to `_admin.scss`**

Append a new section (after the existing `.create-associate__*` rules) with `.sales-register__*` and `.record-sale__*` classes translating `code.html`'s markup into rules using only `var(--...)` tokens — following the exact pattern already established by `.create-associate__title` (`font-family: 'Geist', var(--font-sans)`), `.create-associate__eyebrow` (`font-family: 'JetBrains Mono', monospace`), `.create-associate__field` (`border-radius: 12px` inputs), etc. Do not touch `.editable-table`/`table`/`th`/`td` rules in `_tables.scss` — those are shared across every admin list screen; screen-specific header/filter-bar/pagination/form chrome belongs in the new `_admin.scss` section instead.

- [ ] **Step 3: Apply the new classes in the two component templates**

Add `class="sales-register__filters"`-style bespoke classes from `code.html` onto the existing template elements in `sales-register.component.ts` and `record-sale.component.ts`, alongside (never replacing) the functional classes the Task 3–5 tests already assert on (`sales-register__load-error`, `sales-register__void-action`, `sales-register__void-reason-input`, `sales-register__voided-tag`, `sales-register__action-error`).

- [ ] **Step 4: Run the full frontend test suite to confirm no regressions**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS — identical pass count to the end of Task 6 (a pure styling pass changes zero test outcomes).

- [ ] **Step 5: Visual check against `screen.png`**

Run: `cd frontend && npx ng serve` and navigate to `/settings/sales-register` and `/admin/sales/new` (as an authenticated Admin). Compare against `screen.png` for each of the 7 states from Part A (loaded, empty, RECORDED-row actions, VOIDED-row tag, error banners, record-sale default, record-sale success). Confirm no new hex colors were introduced (`grep -n '#[0-9a-fA-F]\{3,6\}' frontend/src/styles/_admin.scss` should show no new matches beyond what already existed in the file before this task).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/styles/_admin.scss frontend/src/app/admin/sales-register/sales-register.component.ts frontend/src/app/admin/sales-register/record-sale.component.ts
git commit -m "style(sales): apply Sales Register design artifact"
```

---

## Self-Review Notes

- **Spec coverage:** list/filter (unit 6) → Task 3; record (unit 3) → Task 5; void with reason (units 4/5) → Task 4; "one screen, not three pages" framing → satisfied by `SalesRegisterComponent` owning list+filter+void, with Record Sale as a separate routed page (matching the codebase's own precedent for every other admin create-flow, per the task instructions' explicit "decide based on the codebase's existing convention"). Admin-only guarding → `authGuard`+`adminGuard` on both new routes (Task 6), matching `SecurityConfigTest`'s server-side enforcement noted in the spec.
- **Explicitly out of scope, confirmed absent from every task:** CSV export (no backend endpoint exists for it despite the spec's Admin-row prose mentioning it — flagged in Part A), associate-facing Sales History (Sales unit 9, separate), cycle monitoring UI, EMI/matching/royalty income.
- **Placeholder scan:** every task has concrete file paths, real TypeScript/HTML, and real test assertions — the only intentionally-deferred content is Task 7's design artifact itself (which cannot exist until the `frontend-design` dispatch runs; Task 7 is explicitly gated on it and instructs stopping rather than guessing at colors).
- **Type consistency:** `SalesRegisterService.list/record/voidSale` signatures introduced in Task 2 are used identically in Tasks 3–5; `AdminSaleFilters`/`CreateSaleRequest`/`Sale` field names introduced in Task 1 are used identically everywhere downstream; `registerColumns`/`registerRows`/`voidReasons` names introduced in Task 3/4 are not renamed in Task 7.
