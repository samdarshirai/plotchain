# Associate "Sales History" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give any authenticated Associate a read-only, paginated view of their own and their descendants' recorded/voided sales, consuming the already-merged `GET /api/associates/me/sales` endpoint (Sales unit 7). This is Sales unit 9 — the last unit in `docs/superpowers/plans/2026-08-03-sales-units.md`.

**Architecture:** A new top-level Angular feature folder `frontend/src/app/sales-history/` (sibling to `dashboard/`, not nested under `admin/` or `settings/` — those are admin-only conventions), following the exact `AssociateDirectoryComponent`/`KycQueueComponent` "zero screen-specific CSS" shape: a bare `.card` + `EditableTableComponent` in `readOnly` mode + plain unstyled pagination buttons, no toolbar, no filters, no per-row actions. A new `SalesHistoryService` calls the single existing endpoint with `page`/`size` only (the backend takes no other query params — self-scoping happens server-side from the JWT). The route is guarded exactly like `/dashboard` (`authGuard` + `associateOnlyGuard`), and a new nav link is added to the global header for non-admin-family users.

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`, global SCSS partials under `frontend/src/styles/` (no new partial needed — see Design Decision below).

## Design Decision: no fresh frontend-design dispatch

This screen does **not** need a `frontend-design` skill dispatch. Reasoning, confirmed by reading the actual code (not assumed):

- The source spec (`docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md`, flow "Associate own view") and the data-visibility spec (`docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` line 55) both describe this screen identically: *"Sales History (own + descendant, view-only)"* — no filters, no date range, no actions, no export. The backend confirms this: `AssociateSaleController.getMySales` (`backend/src/main/java/com/plotchain/sales/AssociateSaleController.java`) takes only `page`/`size` query params — no `associateId`/`status`/date filters like the admin endpoint has.
- `docs/design/admin_operational_screens/sales_register/DESIGN.md` is a bespoke design pass explicitly built for the **admin** register's extra surface (toolbar filters, void reason input, colored Voided tag, `InlineBannerComponent`) — its own "Out of scope" section states *"No associate-facing Sales History"* (line 135). Reusing that pass's specific presentational choices (banners, colored tags) here would be inventing new-for-this-screen design decisions without a brief backing them.
- The codebase already has a proven, un-designed "ledger" pattern for exactly this shape (read-only paginated table, no toolbar): `frontend/src/app/admin/associate-directory/associate-directory.component.ts` and `frontend/src/app/admin/kyc-queue/kyc-queue.component.ts` both ship with (per the sales-register DESIGN.md's own words) *"zero screen-specific CSS: they're `.card` + a plain `<table class="editable-table">` and nothing else"* — plain `<p>` error text, unstyled pagination `<button>`s, all styling coming from the global `.card`/`.card-title`/`.editable-table` classes in `frontend/src/styles/_cards.scss` / `_tables.scss`, which apply regardless of route (verified: `styles.scss` `@use`s these partials unconditionally, not gated by an `admin`/`settings` wrapper).
- Sales History is strictly simpler than either of those two precedents (no filters at all, vs. associate-directory's 5 filters and kyc-queue's filters), so the same zero-CSS pattern fully covers it.

**One deliberate content decision, flagged explicitly since it's not spelled out in the spec:** this view merges the caller's own sales with every descendant's sales into one flat, unfiltered list (per the spec's `findSelfAndDownlineIds` query). `SaleResponse` has no associate display name — only a raw `associateId` UUID. Rather than silently hiding which sales belong to the caller vs. a descendant, the table includes an **Associate ID** column showing the raw UUID. This adds one column to the same table shape the admin register already renders (`buyerName`/`buyerPhone`/`amount`/`legCredited`/`status`/`recordedAt`) — no new component, no new backend call, no new design primitive.

## Global Constraints

- Do not modify any backend file — `GET /api/associates/me/sales` (Sales unit 7) is fully built and merged; this unit is frontend-only.
- Reuse `Sale`/`SaleStatus` from `frontend/src/app/admin/models/sale.model.ts` verbatim — do not redefine them.
- Route path and guard must mirror `/dashboard`'s existing convention exactly: bare top-level route, `canActivate: [authGuard, associateOnlyGuard]` (no `adminGuard` — any authenticated associate may see their own sales; admin-family principals get redirected the same way `associateOnlyGuard` already redirects them away from `/dashboard`, since `GET /api/associates/me/sales` also depends on an `Associate` row admin-family principals don't have).
- Every new user-facing string goes through `@ngx-translate/core` — no hard-coded copy in templates. Add matching keys to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Precedent (`admin.salesRegister.*` in `hi.json`) shows leaving newly-added feature-bundle values as the literal English string in `hi.json` is accepted practice in this codebase for a new feature — only the top-level `nav.*` entry needs a real Hindi translation (every existing `nav.*` key is genuinely translated).
- No new shared component. Everything renders through the existing `EditableTableComponent` (`frontend/src/app/shared/components/editable-table/editable-table.component.ts`), used exactly the way `AssociateDirectoryComponent`/`KycQueueComponent`/`SalesRegisterComponent` already use it (`[readOnly]="true"`).
- Test runner: `cd frontend && npx ng test --watch=false --include='<glob>'` for scoped runs.

---

## File Structure

- Create: `frontend/src/app/sales-history/models/associate-sale-page.model.ts` — `AssociateSalePage` interface (mirrors `AssociateSalePageResponse` on the backend), importing `Sale` from `../../admin/models/sale.model`.
- Create: `frontend/src/app/sales-history/sales-history.service.ts` — `SalesHistoryService.getMySales(page, size)`.
- Create: `frontend/src/app/sales-history/sales-history.service.spec.ts`
- Create: `frontend/src/app/sales-history/sales-history.component.ts` — `SalesHistoryComponent`.
- Create: `frontend/src/app/sales-history/sales-history.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` — add the `sales-history` route.
- Modify: `frontend/src/app/app.routes.spec.ts` — add a guard-coverage test for the new route.
- Modify: `frontend/src/app/app.component.html` — add the "Sales History" nav link for non-admin-family users.
- Modify: `frontend/src/app/app.component.spec.ts` — update the nav-link assertion that currently expects exactly `['Dashboard']` for a plain associate role.
- Modify: `frontend/src/assets/i18n/en.json` — add `nav.salesHistory` and a new `salesHistory` bundle.
- Modify: `frontend/src/assets/i18n/hi.json` — same keys, Hindi nav string, English placeholder for the feature bundle (matching `admin.salesRegister` precedent).

---

### Task 1: `AssociateSalePage` model

**Files:**
- Create: `frontend/src/app/sales-history/models/associate-sale-page.model.ts`

**Interfaces:**
- Consumes: `Sale` from `frontend/src/app/admin/models/sale.model.ts` (existing — `{ id, plotId, associateId, buyerName, buyerPhone, buyerEmail, amount, cycleId, legCredited, status, voidReason, recordedAt }`).
- Produces: `AssociateSalePage` interface — `{ sales: Sale[]; page: number; size: number; totalElements: number }`, consumed by Task 2 (service) and Task 3 (component).

This is a type-only file (no runtime behavior), so there is no test step — TypeScript's compiler is the check. It compiles as part of Task 2/3's build.

- [ ] **Step 1: Create the model file**

```typescript
import { Sale } from '../../admin/models/sale.model';

export interface AssociateSalePage {
  sales: Sale[];
  page: number;
  size: number;
  totalElements: number;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/sales-history/models/associate-sale-page.model.ts
git commit -m "feat(sales-history): add AssociateSalePage model"
```

---

### Task 2: `SalesHistoryService`

**Files:**
- Create: `frontend/src/app/sales-history/sales-history.service.ts`
- Test: `frontend/src/app/sales-history/sales-history.service.spec.ts`

**Interfaces:**
- Consumes: `AssociateSalePage` from Task 1 (`frontend/src/app/sales-history/models/associate-sale-page.model.ts`).
- Produces: `SalesHistoryService.getMySales(page: number, size: number): Observable<AssociateSalePage>`, consumed by Task 3 (component).

- [ ] **Step 1: Write the failing test**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SalesHistoryService } from './sales-history.service';
import { AssociateSalePage } from './models/associate-sale-page.model';

describe('SalesHistoryService', () => {
  let service: SalesHistoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SalesHistoryService]
    });
    service = TestBed.inject(SalesHistoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own and descendant sales with page/size as query params', () => {
    const mockResponse: AssociateSalePage = { sales: [], page: 0, size: 20, totalElements: 0 };

    service.getMySales(0, 20).subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/associates/me/sales?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('requests a later page with the requested page/size', () => {
    service.getMySales(2, 10).subscribe();

    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/sales' && r.params.get('page') === '2' && r.params.get('size') === '10'
    );
    req.flush({ sales: [], page: 2, size: 10, totalElements: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-history.service.spec.ts'`
Expected: FAIL — `Cannot find module './sales-history.service'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateSalePage } from './models/associate-sale-page.model';

@Injectable({ providedIn: 'root' })
export class SalesHistoryService {
  private http = inject(HttpClient);

  getMySales(page: number, size: number): Observable<AssociateSalePage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AssociateSalePage>('/api/associates/me/sales', { params });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-history.service.spec.ts'`
Expected: PASS (2 specs)

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/sales-history/sales-history.service.ts frontend/src/app/sales-history/sales-history.service.spec.ts
git commit -m "feat(sales-history): add SalesHistoryService.getMySales"
```

---

### Task 3: `SalesHistoryComponent`

**Files:**
- Create: `frontend/src/app/sales-history/sales-history.component.ts`
- Test: `frontend/src/app/sales-history/sales-history.component.spec.ts`

**Interfaces:**
- Consumes: `SalesHistoryService.getMySales(page, size)` from Task 2. `EditableTableComponent` (`frontend/src/app/shared/components/editable-table/editable-table.component.ts`, `EditableTableColumn` type, `[columns]`/`[rows]`/`[readOnly]`/`[emptyStateLabel]` inputs — already exists, no changes needed). `AssociateSalePage` from Task 1.
- Produces: `SalesHistoryComponent` with public `page: AssociateSalePage | null`, `loadError: boolean`, `historyColumns: EditableTableColumn[]`, `historyRows: Record<string, string>[]`, and `goToPage(page: number): void` — consumed by Task 4's route wiring (as the routed component) and by this task's own spec.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SalesHistoryComponent } from './sales-history.component';

describe('SalesHistoryComponent', () => {
  let fixture: ComponentFixture<SalesHistoryComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalesHistoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SalesHistoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/associates/me/sales?page=0&size=20').flush({
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

  it('loads the first page of my sales on init', () => {
    expect(fixture.componentInstance.page?.sales.length).toBe(1);
  });

  it('includes an Associate ID column so descendant sales are distinguishable from my own', () => {
    expect(fixture.componentInstance.historyColumns.some(c => c.key === 'associateId')).toBeTrue();
    expect(fixture.componentInstance.historyRows[0]['associateId']).toBe('a1');
  });

  it('shows a load error when the initial load fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/associates/me/sales?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.sales-history__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows an empty-state row when there are no sales yet', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/associates/me/sales?page=1&size=20').flush({ sales: [], page: 1, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/associates/me/sales?page=1&size=20');
    req.flush({ sales: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('renders no action column and no filter controls (view-only)', () => {
    expect(fixture.componentInstance.historyColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelector('select')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-history.component.spec.ts'`
Expected: FAIL — `Cannot find module './sales-history.component'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SalesHistoryService } from './sales-history.service';
import { AssociateSalePage } from './models/associate-sale-page.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-sales-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="sales-history card">
      <h1 class="card-title">{{ 'salesHistory.title' | translate }}</h1>
      <p class="sales-history__subtitle">{{ 'salesHistory.subtitle' | translate }}</p>

      <p *ngIf="loadError" class="sales-history__load-error">{{ 'salesHistory.loadError' | translate }}</p>

      <app-editable-table
        [readOnly]="true"
        [columns]="historyColumns"
        [rows]="historyRows"
        [emptyStateLabel]="'salesHistory.emptyState' | translate"
      ></app-editable-table>

      <div class="sales-history__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'salesHistory.previousPageAction' | translate }}
        </button>
        <span class="sales-history__page-indicator">
          {{ 'salesHistory.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'salesHistory.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class SalesHistoryComponent implements OnInit {
  private salesHistoryService = inject(SalesHistoryService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);

  page: AssociateSalePage | null = null;
  loadError = false;
  historyColumns: EditableTableColumn[] = [];
  historyRows: Record<string, string>[] = [];

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
      { key: 'buyerName', label: this.translate.instant('salesHistory.columnBuyerName'), type: 'text' },
      { key: 'buyerPhone', label: this.translate.instant('salesHistory.columnBuyerPhone'), type: 'text' },
      { key: 'amount', label: this.translate.instant('salesHistory.columnAmount'), type: 'text' },
      { key: 'associateId', label: this.translate.instant('salesHistory.columnAssociateId'), type: 'text' },
      { key: 'legCredited', label: this.translate.instant('salesHistory.columnLegCredited'), type: 'text' },
      { key: 'status', label: this.translate.instant('salesHistory.columnStatus'), type: 'text' },
      { key: 'recordedAt', label: this.translate.instant('salesHistory.columnRecordedAt'), type: 'text' }
    ];
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  private loadPage(page: number): void {
    this.loadError = false;
    this.salesHistoryService.getMySales(page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.historyRows = (this.page?.sales ?? []).map(sale => ({
      buyerName: sale.buyerName,
      buyerPhone: sale.buyerPhone,
      amount: String(sale.amount),
      associateId: sale.associateId,
      legCredited: sale.legCredited,
      status: sale.status,
      recordedAt: this.datePipe.transform(sale.recordedAt, 'medium') ?? sale.recordedAt
    }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/sales-history.component.spec.ts'`
Expected: PASS (5 specs)

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/sales-history/sales-history.component.ts frontend/src/app/sales-history/sales-history.component.spec.ts
git commit -m "feat(sales-history): add SalesHistoryComponent"
```

---

### Task 4: Route wiring + guard test

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `SalesHistoryComponent` from Task 3. Existing `authGuard` (`frontend/src/app/auth/auth.guard.ts`) and `associateOnlyGuard` (`frontend/src/app/auth/associate-only.guard.ts`) — both already used verbatim by the `dashboard` route.
- Produces: route `path: 'sales-history'`, consumed by Task 5's nav link (`routerLink="/sales-history"`).

- [ ] **Step 1: Write the failing test (append to `app.routes.spec.ts`)**

```typescript
  it('guards the sales-history route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'sales-history');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });
```

Place this new `it(...)` block directly after the existing `'guards the dashboard route with authGuard and associateOnlyGuard'` test (same `describe('routes', ...)` block, top level — not nested in `setup route`/`settings route`/`root route`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: FAIL — `route` is `undefined`, `Cannot read properties of undefined (reading 'canActivate')`.

- [ ] **Step 3: Add the route**

In `frontend/src/app/app.routes.ts`, add the import near the other top-level component imports:

```typescript
import { SalesHistoryComponent } from './sales-history/sales-history.component';
```

Add the route entry as a new top-level bare route, directly after the existing `dashboard` route entry:

```typescript
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'sales-history', component: SalesHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: PASS (all routes specs, including the new one)

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts
git commit -m "feat(sales-history): route /sales-history behind authGuard + associateOnlyGuard"
```

---

### Task 5: Global nav link

**Files:**
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: the `sales-history` route from Task 4. Existing `isAdminFamily` getter and `app-nav__link`/`app-nav__link--active` classes already used by the `dashboard`/`admin/associates/new`/`settings` links in `app.component.html`.
- Produces: nothing new consumed elsewhere — this is the final, user-visible wiring step.

- [ ] **Step 1: Write/update the failing test**

In `frontend/src/app/app.component.spec.ts`, update the existing test `'shows only the Dashboard nav link for a plain associate role'` (it currently asserts `['Dashboard']`, which will become stale once the new link renders):

```typescript
  it('shows the Dashboard and Sales History nav links for a plain associate role', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'nav.dashboard': 'Dashboard',
        'nav.salesHistory': 'Sales History',
        'nav.provisionAssociate': 'Provision Associate',
        'nav.settings': 'Settings',
        'auth.logout': 'Log Out'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav__link')).map(el => el.textContent?.trim());
    expect(links).toEqual(['Dashboard', 'Sales History']);
  });
```

(Replace the old test with this one — same `describe` block, same position.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: FAIL — `links` is still `['Dashboard']` (new link not in the template yet), so `toEqual(['Dashboard', 'Sales History'])` fails.

- [ ] **Step 3: Add the nav link**

In `frontend/src/app/app.component.html`, add the new link directly after the existing Dashboard link, still gated on `!isAdminFamily`:

```html
<header class="app-header" *ngIf="authService.isAuthenticated() && !isChromelessRoute">
  <nav class="app-nav">
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/dashboard" routerLinkActive="app-nav__link--active">{{ 'nav.dashboard' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/sales-history" routerLinkActive="app-nav__link--active">{{ 'nav.salesHistory' | translate }}</a>
    <ng-container *ngIf="isAdminFamily">
      <a class="app-nav__link" routerLink="/admin/associates/new" routerLinkActive="app-nav__link--active">{{ 'nav.provisionAssociate' | translate }}</a>
      <a class="app-nav__link" routerLink="/settings" routerLinkActive="app-nav__link--active">{{ 'nav.settings' | translate }}</a>
    </ng-container>
  </nav>
  <button type="button" class="logout" (click)="onLogout()">{{ 'auth.logout' | translate }}</button>
</header>
<router-outlet></router-outlet>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: PASS (all app.component specs, including the updated one). Verify the two other nav-link tests — `'shows Provision Associate and Settings but hides Dashboard for an admin-family role'` and `'hides the Dashboard nav link for every admin-family role'` — still pass unmodified, since the new link is also gated on `!isAdminFamily`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/app.component.html frontend/src/app/app.component.spec.ts
git commit -m "feat(sales-history): add Sales History nav link for associates"
```

---

### Task 6: i18n keys (English + Hindi)

**Files:**
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: nothing (data-only).
- Produces: every translation key referenced by Task 3's template (`salesHistory.title`, `.subtitle`, `.columnBuyerName`, `.columnBuyerPhone`, `.columnAmount`, `.columnAssociateId`, `.columnLegCredited`, `.columnStatus`, `.columnRecordedAt`, `.loadError`, `.emptyState`, `.previousPageAction`, `.nextPageAction`, `.pageIndicator`) and Task 5's template (`nav.salesHistory`). No JS/TS interface — resolved at runtime by `@ngx-translate/core`; verified via Karma's `TranslateModule.forRoot()` fallback (untranslated keys render as the key itself, which is why Tasks 3/5's tests pass even before this task runs — this task removes that fallback and supplies the real copy).

This is a JSON-only data task, so there is no red/green unit test cycle — the check is `ng test` (Tasks 3-5's specs use `TranslateModule.forRoot()`, which doesn't load these JSON files, so they don't fail without this task) plus a manual verification that JSON parses.

- [ ] **Step 1: Add the `salesHistory` bundle to `en.json`**

Insert this as a new top-level key immediately after the closing `}` of the existing `"dashboard": { ... }` block (before `"nav": {`):

```json
  "salesHistory": {
    "title": "Sales History",
    "subtitle": "Your own and your team's recorded sales.",
    "columnBuyerName": "Buyer",
    "columnBuyerPhone": "Phone",
    "columnAmount": "Amount",
    "columnAssociateId": "Associate",
    "columnLegCredited": "Leg",
    "columnStatus": "Status",
    "columnRecordedAt": "Recorded At",
    "loadError": "Something went wrong loading your sales history. Please try again.",
    "emptyState": "No sales to show yet.",
    "previousPageAction": "Previous",
    "nextPageAction": "Next",
    "pageIndicator": "Page {{page}} of {{totalPages}}"
  },
```

- [ ] **Step 2: Add `nav.salesHistory` to `en.json`**

Inside the existing `"nav": { ... }` block, add a new entry directly after `"dashboard": "Dashboard",`:

```json
    "salesHistory": "Sales History",
```

- [ ] **Step 3: Mirror both additions into `hi.json`**

Insert the same `salesHistory` bundle (top-level key, same position, after `"dashboard": { ... }`) — English placeholder values, matching the `admin.salesRegister` precedent already in this file:

```json
  "salesHistory": {
    "title": "Sales History",
    "subtitle": "Your own and your team's recorded sales.",
    "columnBuyerName": "Buyer",
    "columnBuyerPhone": "Phone",
    "columnAmount": "Amount",
    "columnAssociateId": "Associate",
    "columnLegCredited": "Leg",
    "columnStatus": "Status",
    "columnRecordedAt": "Recorded At",
    "loadError": "Something went wrong loading your sales history. Please try again.",
    "emptyState": "No sales to show yet.",
    "previousPageAction": "Previous",
    "nextPageAction": "Next",
    "pageIndicator": "Page {{page}} of {{totalPages}}"
  },
```

Add the real Hindi nav entry inside `hi.json`'s existing `"nav": { ... }` block, directly after `"dashboard": "डैशबोर्ड",`:

```json
    "salesHistory": "बिक्री इतिहास",
```

- [ ] **Step 4: Verify both files are valid JSON**

Run:
```bash
cd /Users/ronalisenapati/Ronali/plotchain
python3 -c "import json; json.load(open('frontend/src/assets/i18n/en.json')); print('en.json OK')"
python3 -c "import json; json.load(open('frontend/src/assets/i18n/hi.json')); print('hi.json OK')"
```
Expected: both print `OK` — no `JSONDecodeError`.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS — every existing spec plus this unit's new specs (Tasks 2-5) green, no regressions in `associate-directory`/`kyc-queue`/`sales-register`/`dashboard` suites.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(sales-history): add i18n copy for the Sales History screen"
```

---

### Task 7: Update the sales-units tracker

**Files:**
- Modify: `docs/superpowers/plans/2026-08-03-sales-units.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Mark unit 9 merged**

In the units table, change unit 9's row from:

```
| 9 | **screen** | Associate "Sales History" screen — own + descendant, view-only | 7 | pending | — | — |
```

to:

```
| 9 | **screen** | Associate "Sales History" screen — own + descendant, view-only | 7 | **merged** | `docs/superpowers/plans/2026-08-11-sales-associate-history-screen.md` | `<first-commit-sha>`..`<last-commit-sha>` on `master` |
```

filling in the real commit SHAs from Tasks 1-6 once this plan has actually been executed and merged (this step should be done as the last step of implementation, not during planning).

Also update the "Next pending unit" prose at the bottom of the file to note that all 9 units are now merged, matching how the file was updated after unit 8 (`afdf94a`, "docs: mark sales unit 8 merged, persist its plan file").

- [ ] **Step 2: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add docs/superpowers/plans/2026-08-03-sales-units.md
git commit -m "docs: mark sales unit 9 merged, persist its plan file"
```

---

## Self-Review Notes (completed during planning)

- **Spec coverage:** The spec's only description of this screen ("Associate own view", data-visibility spec line 55: "Sales History (own + descendant, view-only)") maps entirely to Task 3 (the paginated read-only table backed by the exact endpoint). No filters, actions, or export are named for this screen anywhere in either spec — confirmed absent from `AssociateSaleController`'s query params too, so none were added.
- **Testing section:** The sales-domain-design spec's own Testing section (lines 108-114) lists only backend tests (`SaleServiceTest`, `SaleControllerTest`, `SecurityConfigTest`, `AssociateRepositoryTest`) — all already covered by unit 7's merged plan. It has no frontend-testing bullet for this screen, so Tasks 2-5's Karma specs are this plan's own addition, sized to mirror the depth of `sales-register.component.spec.ts`'s non-filter, non-void tests (load, error, empty state, pagination).
- **Placeholder scan:** No "TBD"/"handle appropriately" language; every step has literal code or exact JSON to insert.
- **Type consistency:** `AssociateSalePage` (Task 1) is used identically in `SalesHistoryService.getMySales` (Task 2, return type `Observable<AssociateSalePage>`) and `SalesHistoryComponent.page` (Task 3, type `AssociateSalePage | null`) — same shape throughout. `historyColumns`/`historyRows` names are used consistently across Task 3's implementation and its own spec (no `salesColumns`/`saleRows` drift).
- **Cross-unit file overlap:** Per the task brief, no other unit is currently in flight, and this unit only reads `Sale`/`AssociateSalePageResponse`-shaped data — it adds no admin routes, touches no admin component, and the only shared file it imports from (`admin/models/sale.model.ts`) is read-only (type import, no edits).
