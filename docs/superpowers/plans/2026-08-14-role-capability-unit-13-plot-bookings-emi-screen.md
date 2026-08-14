# Role Capability Unit 13: Associate "Plot Bookings + EMI Schedule" Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Associate a new, view-only screen — `/plot-bookings` — that lets them browse the plot/project catalog (already associate-reachable per unit 6) and view their own bookings with each booking's EMI installment schedule (unit 7's `GET /api/associates/me/bookings`). Closes the last unbuilt piece of the spec's "Plot / project inventory" row for the Associate column.

**Architecture:** A new top-level standalone-component feature folder, `frontend/src/app/plot-bookings/`, sibling to `sales-history/` and following that folder's exact shape: one thin `@Injectable({ providedIn: 'root' })` service with no business logic (three GET calls, one per endpoint), one plain interface-only model file, one component with an inline template, one component spec, one service spec. Two tabs inside the single component (`app-tab-bar`, already built and consumed elsewhere but never yet by an associate-facing screen): **Available Plots** (project picker → paginated plot list) and **My Bookings** (paginated booking list; clicking a row opens `app-side-panel` with that booking's EMI schedule, using data already embedded in the booking response — no extra HTTP call). No booking-creation form anywhere in this screen — see "Scope boundary" below, this is a hard constraint, not an oversight.

**Tech Stack:** Angular 18 standalone components, `@ngx-translate/core` 15 (`TranslateModule`/`TranslateService`), `HttpClient`, Karma + Jasmine (`ng test`), `HttpClientTestingModule`/`HttpTestingController` for service/component specs — all matching the existing `sales-history/` and `admin/associate-directory/` folders exactly, no new libraries.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` — "Screens" section, Associate list: *"Plot Bookings + EMI schedule (view-only)"* (line 55); "Data visibility matrix", Plot/project inventory row, Associate column: *"View available plots, own bookings + EMI schedule, view-only"* (line 38). Unit tracked in `docs/superpowers/plans/2026-08-03-role-capability-units.md` row 13, depends on units 6 and 7 (both merged).

## Scope boundary — no booking-creation UI in this screen (important, read before implementing)

The spec's data visibility matrix is explicit that plot booking is an Admin-on-behalf-of-associate action, not associate self-serve: *"Every associate-initiated action beyond editing their own profile ... booking a plot ... is performed by Admin on the associate's behalf, not self-serve in the associate app"* (Screens section) and Resolved Decision "Associate write scope, generally": *"plot booking is instead something Admin does on the associate's behalf."* This is corroborated by the actual merged backend, read directly: `POST /api/admin/bookings` (`BookingController`) is gated `hasAuthority("ADMIN")` in `SecurityConfig.java`, and `BookingControllerTest.createIsForbiddenForAnAssociateToken` proves an Associate JWT gets `403` on it. There is no associate-reachable booking-creation endpoint anywhere in the API.

So although this unit's own task-brief framing mentions "creating a booking" among the UI behaviors to plan, that is **out of scope for this screen** — building it would mean either (a) a form that always 403s for the only role this screen is guarded to, or (b) silently widening associate write scope, which contradicts an explicit, multiply-stated spec decision. This screen is read-only, full stop, matching every other Associate screen already built (`sales-history`) or planned (units 12, 15, 16). If an Admin-side "book a plot against an associate" screen is wanted, that is a **new, separate unit** against the Admin app (no such unit exists yet in the units-14-16 queue — flagged as a real gap in the queue, not something to fold into this plan).

## Global Constraints

- This screen is Associate-only: guarded by the existing `[authGuard, associateOnlyGuard]` pair, exactly like `/dashboard` and `/sales-history` — no new guard needed.
- Reuse `Project`, `Plot`, `PlotType`, `PlotStatus`, `PlotPageResponse` from the existing `frontend/src/app/setup/models/project.model.ts` rather than redeclaring them — confirmed by direct read that their shapes already match `ProjectResponse`/`PlotResponse`/`PlotPageResponse` (`backend/src/main/java/com/plotchain/projects/*.java`) field-for-field. Do not import anything else from `setup/steps/projects/projects.service.ts` (`ProjectsService`) — that service also exposes `createProject`/`deletePlot`/CSV-import methods that have no business being reachable from an associate-only bundle; this unit's own `PlotBookingsService` is a new, narrower, read-only service, the same "one thin service per screen" convention `sales-history/sales-history.service.ts` already established (it doesn't reuse `admin/sales-register/sales-register.service.ts` either, despite both hitting sale data).
- No server-side status filter exists on `GET /api/company/projects/{projectId}/plots` (confirmed by reading `PlotController.list(projectId, page, size)` — no status param). The plots table therefore shows all plots in the selected project (`AVAILABLE`/`BOOKED`/`SOLD`) with a `status` column, not just `AVAILABLE` ones — informational transparency, not a write capability, and consistent with `sales-history`'s own "no filter controls" simplicity (see its component spec: `'renders no action column and no filter controls (view-only)'`).
- `GET /api/associates/me/bookings`'s `BookingResponse` already embeds each booking's `installments: EmiInstallmentResponse[]` (confirmed in `backend/src/main/java/com/plotchain/booking/BookingResponse.java` and `BookingService.getMyBookings`, which attaches each booking's schedule server-side before returning the page). Clicking a booking row to view its EMI schedule must **not** issue a second HTTP call — the data is already in memory from the page load.
- `AssociateBookingPageResponse.bookings[].plotId` is a raw UUID with no joined `plotNo`/project name (confirmed by reading the DTO — `BookingResponse` carries `plotId: UUID` only, nothing richer). The bookings table and EMI side-panel show the raw plot ID for this unit; resolving it to a human-readable plot number would require either a new backend join/DTO field (out of scope, not this unit's endpoint to change) or an extra per-row `GET .../plots/{plotId}` fan-out call this plan deliberately avoids (N+1 pattern, no precedent for it anywhere else in this codebase's read-only list screens). Documented as a known limitation, not silently glossed over.
- Follow the i18n convention actually in use, not an idealized one: confirmed by reading both `en.json` and `hi.json` that `nav.*` keys are translated to Hindi but screen-body namespaces (`salesHistory.*` etc.) are **not** — `hi.json`'s `salesHistory` block is byte-for-byte identical English text to `en.json`'s. This plan's `hi.json` diff matches that: translate `nav.plotBookings`, leave `plotBookings.*` as English placeholders (matching, not fixing, the existing pattern — a from-scratch Hindi translation of screen copy is a separate, cross-cutting i18n effort, not this unit's job).

## Investigation findings (context for the implementer — not steps to redo)

1. **`sales-history/` is the exact structural precedent** for a top-level, Associate-only, view-only, paginated list screen: `sales-history.component.ts` (inline template, `EditableTableComponent` in `readOnly` mode, page/prev/next controls, a `loadError` flag rendered as a plain `<p>`), `sales-history.service.ts` (one `HttpClient` GET method, `HttpParams` for page/size), `models/associate-sale-page.model.ts` (thin page-wrapper interface importing the row type from `admin/models/`). This plan's `plot-bookings/` folder mirrors that shape task-for-task, with `admin/sales-register/sales-register.component.ts`'s newer `app-inline-banner` (dismissible, `tone="danger"`) used instead of the older plain-`<p>` error pattern `sales-history` still has — `sales-register` is the more current convention (`inline-banner` is a real, reusable shared component; the plain `<p>` predates it).
2. **`app-tab-bar`** (`shared/components/tab-bar/tab-bar.component.ts`) is already built and consumed once today, in `setup/steps/projects/projects-step.component.ts` (an Admin-only screen switching between a "plot list" and "CSV import" tab). This will be its first use in an Associate-facing screen. API: `[tabs]: TabDefinition[]` (`{id, label}`), `[activeTabId]: string|null`, `(tabChange): string`.
3. **`app-side-panel`** (`shared/components/side-panel/side-panel.component.ts`) is already used with the exact "click a read-only table row, open a detail panel with data already in memory" pattern this unit needs, in `admin/associate-directory/associate-directory.component.ts`: `<app-editable-table [readOnly]="true" ... (rowClick)="selectAssociate(page!.associates[$event].id)">` (there, `rowClick` emits the array index, and the handler is expected to have full local page data available already). This plan follows the same shape for `selectBooking(page!.bookings[$event])`, except no re-fetch is needed at all (associate-directory's version does one, for extra detail fields the list page doesn't carry — bookings already carry everything).
4. **Actual merged API contracts, read directly, not assumed:**
   - `GET /api/company/projects` → `ProjectController.list()` → `List<ProjectResponse>` (`id, name, location, hasThumbnail, totalPlots, availablePlots, soldPlots, createdAt`), **not paginated**.
   - `GET /api/company/projects/{projectId}/plots?page&size` → `PlotController.list()` → `PlotPageResponse` (`plots: PlotResponse[], page, size, totalElements`); `PlotResponse` = `id, plotNo, plotType, areaSqft, rate, price, status`.
   - `GET /api/associates/me/bookings?page&size` → `AssociateBookingController.getMyBookings()` → `AssociateBookingPageResponse` (`bookings: BookingResponse[], page, size, totalElements`); `BookingResponse` = `id, plotId, associateId, totalAmount, installmentCount, bookedAt, installments: EmiInstallmentResponse[]`; `EmiInstallmentResponse` = `installmentNumber, amount, dueDate`. Server clamps `page = max(page,0)`, `size = min(size,100)` — client always sends a sane `page>=0`/`size=20` anyway, clamping is a server-side safety net this plan doesn't need to replicate client-side.
   - All three routes are reachable by any authenticated token (unit 6's `SecurityConfig` split made the projects/plots `GET`s `.authenticated()`; the bookings `GET` needs no explicit matcher and falls through to `anyRequest().authenticated()` — confirmed in both units' merged plans and `SecurityConfigTest`).
5. **No frontend code exists yet for any of units 12–16** (`My Tree`, `Plot Bookings`, `Profile & Bank/KYC`, `Rewards & Perks`, `Digital ID Card`) — confirmed by `find` across `frontend/src/app`: no `associate/`, `plot-bookings/`, `my-tree/`, `rewards/`, `id-card/` directories exist. This is the first Associate-facing screen unit to actually land frontend code since `sales-history` (which predates this role-capability slice). The `role-capability-units.md` queue's own note that "units 12-16 (all screens) need a plan written from scratch" is accurate.

## Files

**Create:**
- `frontend/src/app/plot-bookings/models/associate-booking-page.model.ts`
- `frontend/src/app/plot-bookings/plot-bookings.service.ts`
- `frontend/src/app/plot-bookings/plot-bookings.service.spec.ts`
- `frontend/src/app/plot-bookings/plot-bookings.component.ts`
- `frontend/src/app/plot-bookings/plot-bookings.component.spec.ts`

**Modify:**
- `frontend/src/app/app.routes.ts` — add the `/plot-bookings` route.
- `frontend/src/app/app.routes.spec.ts` — add a guard test for it.
- `frontend/src/app/app.component.html` — add the nav link.
- `frontend/src/app/app.component.spec.ts` — extend the two existing nav-link-list assertions.
- `frontend/src/assets/i18n/en.json` — add `nav.plotBookings` + a new `plotBookings` namespace.
- `frontend/src/assets/i18n/hi.json` — add `nav.plotBookings` (translated) + the same `plotBookings` namespace (English, matching this file's existing partial-translation state).

---

### Task 1: Model + service (+ service spec)

**Files:**
- Create: `frontend/src/app/plot-bookings/models/associate-booking-page.model.ts`
- Create: `frontend/src/app/plot-bookings/plot-bookings.service.ts`
- Create: `frontend/src/app/plot-bookings/plot-bookings.service.spec.ts`

**Interfaces:**
- Consumes: `Project`, `PlotPageResponse` (existing, `frontend/src/app/setup/models/project.model.ts`).
- Produces: `EmiInstallment`, `Booking`, `AssociateBookingPage` interfaces; `PlotBookingsService.listProjects(): Observable<Project[]>`, `.listPlots(projectId, page, size): Observable<PlotPageResponse>`, `.getMyBookings(page, size): Observable<AssociateBookingPage>` — all consumed by Task 2's component.

- [ ] **Step 1: Write the model**

```typescript
// frontend/src/app/plot-bookings/models/associate-booking-page.model.ts
export interface EmiInstallment {
  installmentNumber: number;
  amount: number;
  dueDate: string;
}

export interface Booking {
  id: string;
  plotId: string;
  associateId: string;
  totalAmount: number;
  installmentCount: number;
  bookedAt: string;
  installments: EmiInstallment[];
}

export interface AssociateBookingPage {
  bookings: Booking[];
  page: number;
  size: number;
  totalElements: number;
}
```

- [ ] **Step 2: Write the service**

```typescript
// frontend/src/app/plot-bookings/plot-bookings.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Project, PlotPageResponse } from '../setup/models/project.model';
import { AssociateBookingPage } from './models/associate-booking-page.model';

// Deliberately its own thin service, not a reuse of setup/steps/projects/projects.service.ts
// (ProjectsService) -- that service also exposes create/update/delete/CSV-import methods with
// no business being reachable from this associate-only, read-only screen. Same "one service per
// screen" convention sales-history.service.ts already established.
@Injectable({ providedIn: 'root' })
export class PlotBookingsService {
  private http = inject(HttpClient);

  listProjects(): Observable<Project[]> {
    return this.http.get<Project[]>('/api/company/projects');
  }

  listPlots(projectId: string, page: number, size: number): Observable<PlotPageResponse> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PlotPageResponse>(`/api/company/projects/${projectId}/plots`, { params });
  }

  getMyBookings(page: number, size: number): Observable<AssociateBookingPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AssociateBookingPage>('/api/associates/me/bookings', { params });
  }
}
```

- [ ] **Step 3: Write the service spec**

```typescript
// frontend/src/app/plot-bookings/plot-bookings.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlotBookingsService } from './plot-bookings.service';
import { AssociateBookingPage } from './models/associate-booking-page.model';
import { PlotPageResponse } from '../setup/models/project.model';

describe('PlotBookingsService', () => {
  let service: PlotBookingsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PlotBookingsService]
    });
    service = TestBed.inject(PlotBookingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the project catalog with no query params (unpaginated endpoint)', () => {
    service.listProjects().subscribe(res => expect(res).toEqual([]));

    const req = httpMock.expectOne('/api/company/projects');
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('fetches a project\'s plots with page/size as query params', () => {
    const mockResponse: PlotPageResponse = { plots: [], page: 0, size: 20, totalElements: 0 };

    service.listPlots('project-1', 0, 20).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/company/projects/project-1/plots?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('fetches the caller\'s own bookings (with EMI schedules embedded) with page/size as query params', () => {
    const mockResponse: AssociateBookingPage = { bookings: [], page: 0, size: 20, totalElements: 0 };

    service.getMyBookings(0, 20).subscribe(res => expect(res).toEqual(mockResponse));

    const req = httpMock.expectOne('/api/associates/me/bookings?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });

  it('requests a later plots page with the requested page/size', () => {
    service.listPlots('project-1', 2, 10).subscribe();

    const req = httpMock.expectOne(
      r => r.url === '/api/company/projects/project-1/plots' && r.params.get('page') === '2' && r.params.get('size') === '10'
    );
    req.flush({ plots: [], page: 2, size: 10, totalElements: 0 });
  });
});
```

- [ ] **Step 4: Run the new spec**

Run: `cd frontend && npx ng test --watch=false --include='**/plot-bookings.service.spec.ts'`
Expected: all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/plot-bookings/models/associate-booking-page.model.ts \
        frontend/src/app/plot-bookings/plot-bookings.service.ts \
        frontend/src/app/plot-bookings/plot-bookings.service.spec.ts
git commit -m "feat(plot-bookings): add PlotBookingsService and booking page model"
```

---

### Task 2: `PlotBookingsComponent` (+ component spec)

**Files:**
- Create: `frontend/src/app/plot-bookings/plot-bookings.component.ts`
- Create: `frontend/src/app/plot-bookings/plot-bookings.component.spec.ts`

**Interfaces:**
- Consumes: `PlotBookingsService` (Task 1); `EditableTableComponent`/`EditableTableColumn` (existing, `shared/components/editable-table/`); `TabBarComponent`/`TabDefinition` (existing, `shared/components/tab-bar/`); `SidePanelComponent` (existing, `shared/components/side-panel/`); `InlineBannerComponent` (existing, `shared/components/inline-banner/`).
- Produces: `PlotBookingsComponent`, standalone, selector `app-plot-bookings` — consumed by Task 3's route.

- [ ] **Step 1: Write the component**

```typescript
// frontend/src/app/plot-bookings/plot-bookings.component.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PlotBookingsService } from './plot-bookings.service';
import { Booking, AssociateBookingPage } from './models/associate-booking-page.model';
import { Project, PlotPageResponse } from '../setup/models/project.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { SidePanelComponent } from '../shared/components/side-panel/side-panel.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-plot-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, TabBarComponent, SidePanelComponent, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="plot-bookings card">
      <h1 class="card-title">{{ 'plotBookings.title' | translate }}</h1>
      <p class="plot-bookings__subtitle">{{ 'plotBookings.subtitle' | translate }}</p>

      <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="onTabChange($event)"></app-tab-bar>

      <div *ngIf="activeTab === 'availablePlots'" class="plot-bookings__available-plots">
        <app-inline-banner *ngIf="projectsLoadError" tone="danger" [dismissible]="true"
          class="plot-bookings__projects-load-error" (dismissed)="projectsLoadError = false">
          {{ 'plotBookings.projectsLoadError' | translate }}
        </app-inline-banner>

        <label class="plot-bookings__project-picker">
          {{ 'plotBookings.projectPickerLabel' | translate }}
          <select (change)="onProjectSelect($any($event.target).value)">
            <option value="">{{ 'plotBookings.projectPickerPlaceholder' | translate }}</option>
            <option *ngFor="let project of projects" [value]="project.id">{{ project.name }} — {{ project.location }}</option>
          </select>
        </label>

        <p *ngIf="!selectedProjectId" class="plot-bookings__select-project-hint">
          {{ 'plotBookings.selectProjectPrompt' | translate }}
        </p>

        <ng-container *ngIf="selectedProjectId">
          <app-inline-banner *ngIf="plotsLoadError" tone="danger" [dismissible]="true"
            class="plot-bookings__plots-load-error" (dismissed)="plotsLoadError = false">
            {{ 'plotBookings.plotsLoadError' | translate }}
          </app-inline-banner>

          <app-editable-table
            [readOnly]="true"
            [columns]="plotColumns"
            [rows]="plotRows"
            [emptyStateLabel]="'plotBookings.plotsEmptyState' | translate"
          ></app-editable-table>

          <div class="plot-bookings__plots-pagination" *ngIf="plotPage">
            <button type="button" class="brand-button brand-button--secondary"
              [disabled]="plotPage.page === 0" (click)="goToPlotsPage(plotPage.page - 1)">
              {{ 'plotBookings.previousPageAction' | translate }}
            </button>
            <span class="plot-bookings__plots-page-indicator">
              {{ 'plotBookings.pageIndicator' | translate: { page: currentPlotsPage, totalPages: totalPlotsPages } }}
            </span>
            <button type="button" class="brand-button brand-button--secondary"
              [disabled]="(plotPage.page + 1) * plotPage.size >= plotPage.totalElements" (click)="goToPlotsPage(plotPage.page + 1)">
              {{ 'plotBookings.nextPageAction' | translate }}
            </button>
          </div>
        </ng-container>
      </div>

      <div *ngIf="activeTab === 'myBookings'" class="plot-bookings__my-bookings">
        <app-inline-banner *ngIf="bookingsLoadError" tone="danger" [dismissible]="true"
          class="plot-bookings__bookings-load-error" (dismissed)="bookingsLoadError = false">
          {{ 'plotBookings.bookingsLoadError' | translate }}
        </app-inline-banner>

        <app-editable-table
          [readOnly]="true"
          [columns]="bookingColumns"
          [rows]="bookingRows"
          [emptyStateLabel]="'plotBookings.bookingsEmptyState' | translate"
          (rowClick)="selectBooking(bookingPage!.bookings[$event])"
        ></app-editable-table>

        <div class="plot-bookings__bookings-pagination" *ngIf="bookingPage">
          <button type="button" class="brand-button brand-button--secondary"
            [disabled]="bookingPage.page === 0" (click)="goToBookingsPage(bookingPage.page - 1)">
            {{ 'plotBookings.previousPageAction' | translate }}
          </button>
          <span class="plot-bookings__bookings-page-indicator">
            {{ 'plotBookings.pageIndicator' | translate: { page: currentBookingsPage, totalPages: totalBookingsPages } }}
          </span>
          <button type="button" class="brand-button brand-button--secondary"
            [disabled]="(bookingPage.page + 1) * bookingPage.size >= bookingPage.totalElements" (click)="goToBookingsPage(bookingPage.page + 1)">
            {{ 'plotBookings.nextPageAction' | translate }}
          </button>
        </div>
      </div>
    </div>

    <app-side-panel [open]="panelOpen" [title]="'plotBookings.emiScheduleTitle' | translate" (closed)="closePanel()">
      <div *ngIf="selectedBooking" class="plot-bookings__emi-schedule">
        <p class="plot-bookings__emi-summary">
          {{ 'plotBookings.emiSummary' | translate: { plotId: selectedBooking.plotId, count: selectedBooking.installmentCount } }}
        </p>
        <app-editable-table
          [readOnly]="true"
          [columns]="emiColumns"
          [rows]="emiRows"
          [emptyStateLabel]="'plotBookings.bookingsEmptyState' | translate"
        ></app-editable-table>
      </div>
    </app-side-panel>
  `
})
export class PlotBookingsComponent implements OnInit {
  private plotBookingsService = inject(PlotBookingsService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);

  activeTab: 'availablePlots' | 'myBookings' = 'availablePlots';

  projects: Project[] = [];
  projectsLoadError = false;
  selectedProjectId = '';
  plotPage: PlotPageResponse | null = null;
  plotsLoadError = false;
  plotColumns: EditableTableColumn[] = [];
  plotRows: Record<string, string>[] = [];

  bookingPage: AssociateBookingPage | null = null;
  bookingsLoadError = false;
  bookingColumns: EditableTableColumn[] = [];
  bookingRows: Record<string, string>[] = [];
  private bookingsLoaded = false;

  selectedBooking: Booking | null = null;
  panelOpen = false;
  emiColumns: EditableTableColumn[] = [];
  emiRows: Record<string, string>[] = [];

  get tabs(): TabDefinition[] {
    return [
      { id: 'availablePlots', label: this.translate.instant('plotBookings.tabAvailablePlots') },
      { id: 'myBookings', label: this.translate.instant('plotBookings.tabMyBookings') }
    ];
  }

  get currentPlotsPage(): number {
    return (this.plotPage?.page ?? 0) + 1;
  }

  get totalPlotsPages(): number {
    if (!this.plotPage || this.plotPage.size === 0) return 1;
    return Math.max(1, Math.ceil(this.plotPage.totalElements / this.plotPage.size));
  }

  get currentBookingsPage(): number {
    return (this.bookingPage?.page ?? 0) + 1;
  }

  get totalBookingsPages(): number {
    if (!this.bookingPage || this.bookingPage.size === 0) return 1;
    return Math.max(1, Math.ceil(this.bookingPage.totalElements / this.bookingPage.size));
  }

  ngOnInit(): void {
    this.plotColumns = [
      { key: 'plotNo', label: this.translate.instant('plotBookings.columnPlotNo'), type: 'text' },
      { key: 'plotType', label: this.translate.instant('plotBookings.columnPlotType'), type: 'text' },
      { key: 'areaSqft', label: this.translate.instant('plotBookings.columnAreaSqft'), type: 'text' },
      { key: 'rate', label: this.translate.instant('plotBookings.columnRate'), type: 'text' },
      { key: 'price', label: this.translate.instant('plotBookings.columnPrice'), type: 'text' },
      { key: 'status', label: this.translate.instant('plotBookings.columnStatus'), type: 'text' }
    ];
    this.bookingColumns = [
      { key: 'plotId', label: this.translate.instant('plotBookings.columnPlotId'), type: 'text' },
      { key: 'totalAmount', label: this.translate.instant('plotBookings.columnTotalAmount'), type: 'text' },
      { key: 'installmentCount', label: this.translate.instant('plotBookings.columnInstallmentCount'), type: 'text' },
      { key: 'bookedAt', label: this.translate.instant('plotBookings.columnBookedAt'), type: 'text' }
    ];
    this.emiColumns = [
      { key: 'installmentNumber', label: this.translate.instant('plotBookings.columnInstallmentNumber'), type: 'text' },
      { key: 'amount', label: this.translate.instant('plotBookings.columnInstallmentAmount'), type: 'text' },
      { key: 'dueDate', label: this.translate.instant('plotBookings.columnDueDate'), type: 'text' }
    ];
    this.loadProjects();
  }

  onTabChange(tabId: string): void {
    this.activeTab = tabId as 'availablePlots' | 'myBookings';
    // Lazy-load: My Bookings' first page only fetched the first time that tab is opened, not
    // eagerly on init alongside Available Plots -- avoids an unconditional extra request for
    // associates who never leave the default tab, and keeps the two tabs' loading independently
    // testable.
    if (this.activeTab === 'myBookings' && !this.bookingsLoaded) {
      this.loadBookingsPage(0);
    }
  }

  onProjectSelect(projectId: string): void {
    this.selectedProjectId = projectId;
    this.plotPage = null;
    this.plotRows = [];
    if (projectId) {
      this.loadPlotsPage(0);
    }
  }

  goToPlotsPage(page: number): void {
    this.loadPlotsPage(page);
  }

  goToBookingsPage(page: number): void {
    this.loadBookingsPage(page);
  }

  // No HTTP call: BookingResponse (and therefore AssociateBookingPage.bookings[]) already embeds
  // each booking's full installments array from the server -- see BookingService.getMyBookings on
  // the backend, which attaches the schedule before returning the page.
  selectBooking(booking: Booking): void {
    this.selectedBooking = booking;
    this.emiRows = booking.installments.map(installment => ({
      installmentNumber: String(installment.installmentNumber),
      amount: String(installment.amount),
      dueDate: this.datePipe.transform(installment.dueDate, 'mediumDate') ?? installment.dueDate
    }));
    this.panelOpen = true;
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  private loadProjects(): void {
    this.projectsLoadError = false;
    this.plotBookingsService.listProjects().subscribe({
      next: projects => (this.projects = projects),
      error: () => (this.projectsLoadError = true)
    });
  }

  private loadPlotsPage(page: number): void {
    if (!this.selectedProjectId) return;
    this.plotsLoadError = false;
    this.plotBookingsService.listPlots(this.selectedProjectId, page, PAGE_SIZE).subscribe({
      next: res => {
        this.plotPage = res;
        this.plotRows = res.plots.map(plot => ({
          plotNo: plot.plotNo,
          plotType: plot.plotType,
          areaSqft: String(plot.areaSqft),
          rate: String(plot.rate),
          price: String(plot.price),
          status: plot.status
        }));
      },
      error: () => (this.plotsLoadError = true)
    });
  }

  private loadBookingsPage(page: number): void {
    this.bookingsLoadError = false;
    this.plotBookingsService.getMyBookings(page, PAGE_SIZE).subscribe({
      next: res => {
        this.bookingsLoaded = true;
        this.bookingPage = res;
        this.bookingRows = res.bookings.map(booking => ({
          plotId: booking.plotId,
          totalAmount: String(booking.totalAmount),
          installmentCount: String(booking.installmentCount),
          bookedAt: this.datePipe.transform(booking.bookedAt, 'medium') ?? booking.bookedAt
        }));
      },
      error: () => (this.bookingsLoadError = true)
    });
  }
}
```

- [ ] **Step 2: Write the component spec**

```typescript
// frontend/src/app/plot-bookings/plot-bookings.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotBookingsComponent } from './plot-bookings.component';

describe('PlotBookingsComponent', () => {
  let fixture: ComponentFixture<PlotBookingsComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlotBookingsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PlotBookingsComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/company/projects').flush([
      { id: 'proj-1', name: 'Green Valley', location: 'Hyderabad', hasThumbnail: false, totalPlots: 2, availablePlots: 1, soldPlots: 0, createdAt: '2026-01-01T00:00:00Z' }
    ]);
  });

  afterEach(() => httpMock.verify());

  it('defaults to the Available Plots tab and loads the project catalog on init', () => {
    expect(fixture.componentInstance.activeTab).toBe('availablePlots');
    expect(fixture.componentInstance.projects.length).toBe(1);
  });

  it('shows a load error when the project catalog fails to load, without silently doing nothing', () => {
    const errFixture = TestBed.createComponent(PlotBookingsComponent);
    errFixture.detectChanges();
    httpMock.expectOne('/api/company/projects').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    errFixture.detectChanges();

    expect(errFixture.componentInstance.projectsLoadError).toBe(true);
    const errorEl: HTMLElement | null = errFixture.nativeElement.querySelector('.plot-bookings__projects-load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows a hint and no plots table until a project is selected', () => {
    const hint: HTMLElement | null = fixture.nativeElement.querySelector('.plot-bookings__select-project-hint');
    expect(hint?.textContent?.trim()).toBeTruthy();
    expect(fixture.componentInstance.plotPage).toBeNull();
  });

  it('loads the selected project\'s first page of plots on selection', () => {
    fixture.componentInstance.onProjectSelect('proj-1');
    const req = httpMock.expectOne('/api/company/projects/proj-1/plots?page=0&size=20');
    req.flush({
      plots: [{ id: 'plot-1', plotNo: 'A-101', plotType: 'NORMAL', areaSqft: 1200, rate: 500, price: 600000, status: 'AVAILABLE' }],
      page: 0, size: 20, totalElements: 1
    });

    expect(fixture.componentInstance.plotRows.length).toBe(1);
    expect(fixture.componentInstance.plotRows[0]['status']).toBe('AVAILABLE');
  });

  it('shows a plots load error scoped to the selected project, without silently doing nothing', () => {
    fixture.componentInstance.onProjectSelect('proj-1');
    httpMock.expectOne('/api/company/projects/proj-1/plots?page=0&size=20')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.plotsLoadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.plot-bookings__plots-load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('does not load My Bookings until that tab is opened', () => {
    expect(fixture.componentInstance.bookingPage).toBeNull();
    httpMock.expectNone('/api/associates/me/bookings?page=0&size=20');
  });

  it('loads My Bookings the first time that tab is opened, and only once', () => {
    fixture.componentInstance.onTabChange('myBookings');
    httpMock.expectOne('/api/associates/me/bookings?page=0&size=20').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onTabChange('availablePlots');
    fixture.componentInstance.onTabChange('myBookings');
    httpMock.expectNone('/api/associates/me/bookings?page=0&size=20');
  });

  it('shows an empty state when the caller has no bookings yet', () => {
    fixture.componentInstance.onTabChange('myBookings');
    httpMock.expectOne('/api/associates/me/bookings?page=0&size=20').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('opens the EMI schedule side panel on row click, using embedded installments with no extra HTTP call', () => {
    fixture.componentInstance.onTabChange('myBookings');
    httpMock.expectOne('/api/associates/me/bookings?page=0&size=20').flush({
      bookings: [{
        id: 'b1', plotId: 'plot-1', associateId: 'a1', totalAmount: 600000, installmentCount: 2,
        bookedAt: '2026-01-01T00:00:00Z',
        installments: [
          { installmentNumber: 1, amount: 300000, dueDate: '2026-02-01' },
          { installmentNumber: 2, amount: 300000, dueDate: '2026-03-01' }
        ]
      }],
      page: 0, size: 20, totalElements: 1
    });

    fixture.componentInstance.selectBooking(fixture.componentInstance.bookingPage!.bookings[0]);
    httpMock.verify(); // no pending requests -- proves selectBooking made no HTTP call

    expect(fixture.componentInstance.panelOpen).toBe(true);
    expect(fixture.componentInstance.emiRows.length).toBe(2);
    expect(fixture.componentInstance.emiRows[0]['installmentNumber']).toBe('1');
  });

  it('closes the side panel via the close event', () => {
    fixture.componentInstance.selectedBooking = { id: 'b1', plotId: 'plot-1', associateId: 'a1', totalAmount: 1, installmentCount: 1, bookedAt: '', installments: [] };
    fixture.componentInstance.panelOpen = true;

    fixture.componentInstance.closePanel();

    expect(fixture.componentInstance.panelOpen).toBe(false);
  });

  it('renders no booking-creation form or action controls anywhere on this screen (view-only, per spec write-scope decision)', () => {
    expect(fixture.nativeElement.querySelector('form')).toBeFalsy();
    expect(fixture.componentInstance.plotColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.componentInstance.bookingColumns.some(c => c.type === 'action')).toBeFalse();
  });
});
```

- [ ] **Step 3: Run the new specs**

Run: `cd frontend && npx ng test --watch=false --include='**/plot-bookings.component.spec.ts'`
Expected: all tests green.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/plot-bookings/plot-bookings.component.ts \
        frontend/src/app/plot-bookings/plot-bookings.component.spec.ts
git commit -m "feat(plot-bookings): add PlotBookingsComponent (Available Plots + My Bookings tabs)"
```

---

### Task 3: Route + nav wiring

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: `PlotBookingsComponent` (Task 2), `authGuard`/`associateOnlyGuard` (existing).
- Produces: the `/plot-bookings` route, reachable from the header nav for non-admin-family roles only.

- [ ] **Step 1: Add the route**

In `frontend/src/app/app.routes.ts`, add the import next to `SalesHistoryComponent`'s:

```typescript
import { PlotBookingsComponent } from './plot-bookings/plot-bookings.component';
```

Add the route immediately after the existing `sales-history` route:

```typescript
  { path: 'sales-history', component: SalesHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'plot-bookings', component: PlotBookingsComponent, canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 2: Add the route guard test**

In `frontend/src/app/app.routes.spec.ts`, add immediately after the existing `'guards the sales-history route...'` test:

```typescript
  it('guards the plot-bookings route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'plot-bookings');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });
```

- [ ] **Step 3: Add the nav link**

In `frontend/src/app/app.component.html`, add immediately after the existing `sales-history` link, inside the same `*ngIf="!isAdminFamily"` group:

```html
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/dashboard" routerLinkActive="app-nav__link--active">{{ 'nav.dashboard' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/sales-history" routerLinkActive="app-nav__link--active">{{ 'nav.salesHistory' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/plot-bookings" routerLinkActive="app-nav__link--active">{{ 'nav.plotBookings' | translate }}</a>
```

- [ ] **Step 4: Update the nav-link assertions**

In `frontend/src/app/app.component.spec.ts`:

- In the `'shows the Dashboard and Sales History nav links for a plain associate role'` test, add `'nav.plotBookings': 'Plot Bookings'` to the `translations` map and change the final assertion to `expect(links).toEqual(['Dashboard', 'Sales History', 'Plot Bookings']);`. Rename the test to `'shows the Dashboard, Sales History, and Plot Bookings nav links for a plain associate role'` so its name still matches what it asserts.
- The admin-family test (`'shows Provision Associate and Settings but hides Dashboard for an admin-family role'`) needs no change — it already asserts the admin-family link list exactly, and `/plot-bookings` is never shown to admin-family roles.
- The `'hides the Dashboard nav link for every admin-family role'` test needs no change — it only asserts on `a[href="/dashboard"]`, unaffected by this new link.

- [ ] **Step 5: Run the affected specs**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts' --include='**/app.component.spec.ts'`
Expected: all tests green, including the renamed/updated one.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts \
        frontend/src/app/app.component.html frontend/src/app/app.component.spec.ts
git commit -m "feat(plot-bookings): wire /plot-bookings into routing and the associate nav"
```

---

### Task 4: i18n keys

**Files:**
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Produces: `nav.plotBookings` + a `plotBookings` namespace, consumed by Task 2's component and Task 3's nav link.

- [ ] **Step 1: Add to `en.json`**

Add `"plotBookings": "Plot Bookings"` to the existing `"nav"` object (alongside `dashboard`/`salesHistory`/`provisionAssociate`/`settings`).

Add a new top-level `"plotBookings"` object (placed near `"salesHistory"`, matching this file's existing per-screen grouping):

```json
"plotBookings": {
  "title": "Plot Bookings",
  "subtitle": "Browse available plots and view your bookings' EMI schedules.",
  "tabAvailablePlots": "Available Plots",
  "tabMyBookings": "My Bookings",
  "projectsLoadError": "Something went wrong loading projects. Please try again.",
  "projectPickerLabel": "Project",
  "projectPickerPlaceholder": "Select a project",
  "selectProjectPrompt": "Select a project above to view its plots.",
  "plotsLoadError": "Something went wrong loading plots. Please try again.",
  "plotsEmptyState": "No plots in this project yet.",
  "columnPlotNo": "Plot No.",
  "columnPlotType": "Type",
  "columnAreaSqft": "Area (sqft)",
  "columnRate": "Rate",
  "columnPrice": "Price",
  "columnStatus": "Status",
  "bookingsLoadError": "Something went wrong loading your bookings. Please try again.",
  "bookingsEmptyState": "No bookings yet.",
  "columnPlotId": "Plot",
  "columnTotalAmount": "Total Amount",
  "columnInstallmentCount": "Installments",
  "columnBookedAt": "Booked At",
  "emiScheduleTitle": "EMI Schedule",
  "emiSummary": "Plot {{plotId}} — {{count}} installments",
  "columnInstallmentNumber": "#",
  "columnInstallmentAmount": "Amount",
  "columnDueDate": "Due Date",
  "previousPageAction": "Previous",
  "nextPageAction": "Next",
  "pageIndicator": "Page {{page}} of {{totalPages}}"
}
```

- [ ] **Step 2: Add to `hi.json`**

Add `"plotBookings": "प्लॉट बुकिंग"` to the existing `"nav"` object — matching this file's established pattern of translating nav labels (confirmed by reading its current `nav.dashboard`/`nav.salesHistory`/etc., all in Hindi).

Add the identical `"plotBookings"` object from Step 1 (same English strings, byte-for-byte) — matching this file's established pattern of **not** yet translating screen-body namespaces (confirmed by reading its current `salesHistory` block, which is untranslated English identical to `en.json`'s). This is not a shortcut being taken by this plan; it is this repository's actual, current, consistent state for every screen-body namespace that exists today.

- [ ] **Step 3: Verify both files are valid JSON**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/assets/i18n/en.json'))" && node -e "JSON.parse(require('fs').readFileSync('src/assets/i18n/hi.json'))"`
Expected: no output, exit code 0 (no parse errors).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(plot-bookings): add plotBookings and nav.plotBookings i18n keys"
```

---

## Final verification

- [ ] **Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: all existing tests still green, plus every new test from Tasks 1–3. No pre-existing failures are expected on the frontend side (unlike the backend's known JDK21/25 Mockito noise) — per the units queue's own running log, the frontend suite was last confirmed fully green (489/489 after unit 4, 473/473 after unit 3). Diff against a clean baseline if anything unexpected shows up, per the lesson logged for unit 2's near-miss — don't assume any red is pre-existing without checking.

- [ ] **Manual smoke check (optional but recommended given this is the first screen to exercise `app-tab-bar` + `app-side-panel` together)**

Run `cd frontend && npx ng serve`, log in as an Associate with at least one project/plot and one booking seeded, navigate to `/plot-bookings`, confirm: project picker populates, selecting a project loads its plots with a visible `status` column, switching to My Bookings loads the booking list exactly once, clicking a booking row opens the side panel with its EMI schedule with no visible network request (devtools Network tab), closing the panel works.

## Explicit non-goals (do not implement these — no acceptance criterion asks for them)

- **No booking-creation form or "book this plot" action anywhere in this screen** — see "Scope boundary" above. This is the single most important non-goal in this plan; do not add one even if it looks like an obvious next feature.
- No admin-facing "book a plot against an associate" screen. That capability's backend (`POST /api/admin/bookings`) is merged, but no unit in the queue (12–16) covers its Admin-side UI — a real gap, flagged for a future unit, not silently absorbed into this one.
- No plot-detail drill-down beyond the plots table row itself — `PlotResponse`'s fields (`plotNo, plotType, areaSqft, rate, price, status`) are already fully shown as table columns, so `GET /api/company/projects/{projectId}/plots/{plotId}` is never called from this screen; there is nothing that endpoint would add.
- No client-side `AVAILABLE`-only filtering of the plots table — see Global Constraints; the status column carries that information instead.
- No resolution of `plotId` to a human-readable plot number on the bookings table or EMI panel — the backend response doesn't carry one; see Global Constraints for why this plan doesn't fan out a per-row lookup to get one.
- No edits to `PlotBookingsService`'s three consumed endpoints, `SecurityConfig.java`, or any other backend file — this is a pure frontend-consumption unit against already-merged, already-tested backend contracts (units 6 and 7).

## Self-review notes

- **Spec coverage**: matrix's Associate "Plot / project inventory" row — "View available plots" (Available Plots tab, `GET /api/company/projects` + `.../plots`) and "own bookings + EMI schedule, view-only" (My Bookings tab + side panel, `GET /api/associates/me/bookings`) — both covered, both strictly read-only, matching "view-only" twice over in the row's own wording.
- **Drift found and resolved during planning, not left implicit**: the task-brief's own framing (asking to plan "creating a booking"/"a booking form") conflicts with the spec's explicit, multiply-stated Associate write-scope decision and the actual merged backend's `ADMIN`-only gate on `POST /api/admin/bookings`. Resolved in favor of the spec and the real API contract (read directly, not assumed) — documented prominently in "Scope boundary" rather than silently dropped, so a reviewer or future reader isn't left wondering why a plan brief's "booking form" mention never shows up in the file list.
- **Type/name consistency**: `Project`/`PlotPageResponse` reused verbatim from `setup/models/project.model.ts` (no shadow redeclaration); `Booking`/`EmiInstallment`/`AssociateBookingPage` field names match `BookingResponse`/`EmiInstallmentResponse`/`AssociateBookingPageResponse` exactly, confirmed against the actual merged Java records, not the plan-7 draft snippets (which matched anyway, per unit 7's "clean review, 0 spec findings" merge note — but verified independently here regardless).
- **Placeholder scan**: no TBD/TODO; every task has literal, complete code, not a description of code.
