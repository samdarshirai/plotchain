# Plot Booking Unit 13: Associate View-Only Availability Grid + Extended Plot Bookings Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the body of the shipped Associate screen at `/plot-bookings` with two view-only tabs: **Availability** (a project's plots as a block-grouped tile grid with status/type filters and a read-only plot popover) and **My bookings** (booking cards with status, paid vs due, per-installment overdue flags, and an EMI schedule detail).

**Architecture:** `PlotBookingsComponent` shrinks to a host (title, subtitle, `app-tab-bar`) that mounts one of two new child components per tab, so My bookings still loads lazily on first open as it does today. `PlotAvailabilityComponent` owns the project picker, grid fetch, filters and popover and reuses unit 11's shared `app-plot-tile` and `plot-grid.util`. `MyBookingsComponent` owns the paged own-bookings fetch, master-detail cards and installment table; pure display maths lives in `booking-view.util.ts`. `PlotBookingsService` stays the screen's own thin read-only service. No write affordance exists anywhere.

**Tech Stack:** Angular 18 standalone components, `@ngx-translate/core`, `HttpClient`, Karma + Jasmine with `HttpClientTestingModule`/`HttpTestingController`, SCSS in `frontend/src/styles/_admin.scss` (where the sibling associate operational screens, e.g. Income Statement, already live). No new libraries.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` — "Screens" → Associate, Decision 10 (no buyer/booking data on the grid), Decision 12 (associate is view-only), Flows "Associate own view". Design: `docs/design/associate_operational_screens/plot_availability_bookings/DESIGN.md` (read fully first; `screen.png`, `screen-bookings.png`, `screen-mobile*.png`, and `code.html` are the visual reference). Tracked as row 13 of `docs/superpowers/plans/2026-10-01-plot-booking-units.md`.

## Prerequisites (hard)

- **Unit 1** (merged): `GET /api/associates/me/bookings` returns status, buyer, `paidAmount`, `dueAmount`, per-installment `status`/`paidAt`/`overdue` (the frontend `Booking` model already carries these).
- **Unit 10** (merged): `GET /api/projects/{id}/plots/grid`.
- **Unit 11 must be merged first** (agreed build order 11 → 13 → 12). This plan consumes, unchanged, what unit 11 builds: `shared/components/plot-tile/plot-tile.component.ts` (`app-plot-tile`), `shared/utils/plot-grid.util.ts` (`PlotGridItem`, `formatInr`, `formatLakh`, `formatArea`, `groupIntoBlocks`, `countByStatus`), the `--status-success-text`/`--status-warning-text` tokens and `.plot-tile` styles in `_shared-components.scss`, and the `plotTile.*` i18n block. If any of these is missing, stop: unit 11 has not landed.
- **Unit 14 is NOT required.** `plotNo`/`projectName` on the booking response don't exist yet; the screen falls back to the short plot id and omits the project line (Task 1 makes this a single function so unit 14 is a zero-touch upgrade).

## Global Constraints

- Frontend only, zero backend changes. Associate-only: route `plot-bookings` keeps `[authGuard, associateOnlyGuard]`; nav entry (`nav.plotBookings`, `grid_view`) is unchanged.
- **View-only, absolutely.** No `<form>`, no text `<input>`, no booking/pay/cancel/transfer/edit control. The only interactive controls are: tabs, project `<select>`, type `<select>`, status chips, "Clear filters", tiles, popover Close, booking cards, sheet Back, pager, Retry, "View availability". Tests pin this.
- **No buyer or booking data on the availability tab** (Decision 10). The grid response has none; the popover renders only grid fields.
- Endpoints (exact): projects `GET /api/company/projects` (existing); grid `GET /api/projects/{id}/plots/grid` → bare array `{plotId, plotNo, type, area, price, status}`; own bookings `GET /api/associates/me/bookings?page&size` → `{bookings, page, size, totalElements}`, server order is `booked_at DESC` (verified in `PlotBookingRepository.findByAssociateIdOrderByBookedAtDesc`), `size` clamped ≤100 server-side.
- `PlotBookingsService` stays its own thin read-only service (existing convention; do NOT import `ProjectsService`, which exposes write methods).
- Bookings page size stays `20`. Installments can be paid out of order; render in the order given.
- i18n: all new keys under `plotBookings.*` in `en.json`; `hi.json` gets the identical block in English (matches the existing pattern: screen bodies are not translated, only `nav.*`).
- Icons: `<span class="material-symbols-outlined" aria-hidden="true">name</span>`.
- No e2e (deferred per the e2e testing plan).

## Deviations from DESIGN.md (decided here; veto at plan review)

1. **Palette = live theme tokens, not violet/cyan** — same call and reasoning as unit 11 Deviation 1: every colour is already a `var(--token)`, the live theme is gold/oxblood, and a one-screen violet island would clash with its neighbours. The design's active tab, seal halo and focus ring map to `--brand-primary`; Ink tiles map to `--ink`. Re-skinning later is a scoped token override, not a component change.
2. **Tile look is unit 11's shared tile, not this design's variant.** DESIGN 13 draws SOLD as a solid Ink tile with a cyan number and BOOKED as an amber hatch; DESIGN 11 draws SOLD as dashed+hatched and BOOKED as a tint. One shared component can't be both without a `variant` input. Using unit 11's look keeps admin and associate grids reading the same; status is still carried by glyph + word + border style + fill. If the Ink-tile look is wanted, it is a `variant="ink"` input added to the shared tile in a follow-up.
3. **Popover is a fixed card, not anchored to the tile.** Anchoring needs measuring/positioning code and viewport-flip logic for one read-only row of facts. It renders as a fixed bottom-right card on desktop and a bottom sheet under 768px, with the specified a11y behaviour (focus moves to Close, Esc closes, focus returns to the tile). Tiles don't get `aria-haspopup`/`aria-expanded` (the shared tile doesn't expose them); the dialog is announced via the focus move.
4. **The project auto-selects the first project** on load (the design shows a populated grid by default) instead of the old "Select a project" placeholder.
5. **Seal count is derived from the grid** (AVAILABLE rows), not `Project.availablePlots`, so the figure always equals the chip count next to it.
6. **No `Hindi` translation of screen copy** (convention above); the design's own Decision 7 defers Hindi unit labels.

## Review Focus

1. **Grid leak guard**: nothing buyer/booking-related may ever render on the Availability tab, even if a future grid response grows extra fields. (Task 2.)
2. **Project switch races**: switching project quickly must not let a slow earlier grid response overwrite the newer one, and must clear filters and close the popover. (Task 2.)
3. **Filters that match nothing** must show "No plots match" + Clear filters, not a blank grid; **zero-plot project** shows the empty state. (Task 2.)
4. **Overdue is only ever shown on `PENDING` installments** where the server says `overdue`; a PAID or VOID row must never carry the badge even if a stale flag arrives. (Tasks 1, 3.)
5. **Cancelled and fully-paid bookings**: "No further dues" / "Fully paid", struck plot label, retained-paid note; never a "0 due" amount. (Task 3.)
6. **`totalAmount = 0` or `paidAmount > totalAmount`** must not produce NaN%/>100% bars. (Task 1.)
7. **Selecting a booking must not issue an HTTP call** (the schedule is already in the page). (Task 3.)
8. **Failed load of page N** keeps the previous page visible with a Retry banner. (Task 3.)

---

## File Structure

Create (under `frontend/src/app/plot-bookings/`):

| File | Responsibility |
|---|---|
| `booking-view.util.ts` + `.spec.ts` | Pure display helpers: `paidPercent`, `overdueCount`, `plotLabel`, `isOverdueRow`. |
| `plot-availability.component.ts` + `.spec.ts` | Availability tab: seal, picker, filters, block grid, popover, states. |
| `my-bookings.component.ts` + `.spec.ts` | My bookings tab: cards, detail, installment table, pager, states. |

Modify:

| File | Change |
|---|---|
| `plot-bookings.component.ts` + `.spec.ts` | Shrink to host + tabs; rewrite spec. |
| `plot-bookings.service.ts` + `.spec.ts` | Add `getGrid`; remove `listPlots` (no remaining caller). |
| `models/associate-booking-page.model.ts` | `Booking` gains optional `plotNo?`, `projectName?` (unit 14 forward-compat). |
| `src/styles/_admin.scss` | `.plot-bookings` styles (append). |
| `src/assets/i18n/en.json`, `hi.json` | Replace the `plotBookings` block. |
| `docs/superpowers/plans/2026-10-01-plot-booking-units.md` | Row 13 (coordinator, after merge). |

Commands run from `frontend/`. Single spec: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/plot-bookings/<file>.spec.ts'`. Folder: `--include='src/app/plot-bookings/**/*.spec.ts'`. Build: `npx ng build`.

---

### Task 1: Service `getGrid`, model fields, and booking display helpers

**Files:**
- Modify: `src/app/plot-bookings/plot-bookings.service.ts`, `plot-bookings.service.spec.ts`
- Modify: `src/app/plot-bookings/models/associate-booking-page.model.ts`
- Create: `src/app/plot-bookings/booking-view.util.ts`, `booking-view.util.spec.ts`

**Interfaces:**
- Consumes: `PlotGridItem` (unit 11).
- Produces: `PlotBookingsService.getGrid(projectId): Observable<PlotGridItem[]>`; `Booking.plotNo?: string`, `Booking.projectName?: string`; `paidPercent(b)`, `overdueCount(b)`, `plotLabel(b)`, `isOverdueRow(i)`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/plot-bookings/booking-view.util.spec.ts
import { Booking, EmiInstallment } from './models/associate-booking-page.model';
import { isOverdueRow, overdueCount, paidPercent, plotLabel } from './booking-view.util';

const inst = (over: Partial<EmiInstallment> = {}): EmiInstallment =>
  ({ installmentNumber: 1, amount: 100, dueDate: '2026-01-01', status: 'PENDING', paidAt: null, overdue: false, ...over });
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', plotId: '123e4567-e89b-12d3-a456-426614174000', associateId: 'a', status: 'ACTIVE', buyerName: 'R',
  totalAmount: 400, installmentCount: 4, bookedAt: '2026-01-01T00:00:00Z', paidAmount: 100, dueAmount: 300,
  installments: [inst()], ...over
});

describe('booking-view.util', () => {
  it('computes a rounded paid percentage', () => {
    expect(paidPercent(booking())).toBe(25);
    expect(paidPercent(booking({ paidAmount: 133, totalAmount: 400 }))).toBe(33);
  });

  it('never returns NaN or more than 100 or less than 0', () => {
    expect(paidPercent(booking({ totalAmount: 0, paidAmount: 0 }))).toBe(0);
    expect(paidPercent(booking({ paidAmount: 500, totalAmount: 400 }))).toBe(100);
    expect(paidPercent(booking({ paidAmount: -5 }))).toBe(0);
  });

  it('counts overdue only on PENDING installments flagged overdue', () => {
    const b = booking({ installments: [
      inst({ overdue: true }), inst({ installmentNumber: 2, overdue: true }),
      inst({ installmentNumber: 3, status: 'PAID', overdue: true }),   // stale flag must not count
      inst({ installmentNumber: 4, status: 'VOID', overdue: true }),
      inst({ installmentNumber: 5 })
    ] });
    expect(overdueCount(b)).toBe(2);
    expect(isOverdueRow(b.installments[2])).toBeFalse();
    expect(isOverdueRow(b.installments[0])).toBeTrue();
  });

  it('labels the plot by plotNo when present, else the first 8 chars of the plot id', () => {
    expect(plotLabel(booking())).toBe('123e4567');
    expect(plotLabel(booking({ plotNo: 'A-12' }))).toBe('A-12');
  });
});
```

Append to `plot-bookings.service.spec.ts` (and delete any existing `listPlots` spec there):

```ts
  it('reads the plot grid from /api/projects/{id}/plots/grid', () => {
    service.getGrid('p1').subscribe(g => expect(g.length).toBe(1));
    const req = httpMock.expectOne('/api/projects/p1/plots/grid');
    expect(req.request.method).toBe('GET');
    req.flush([{ plotId: 'x', plotNo: 'A-1', type: 'NORMAL', area: 1, price: 2, status: 'AVAILABLE' }]);
  });
```

(Use the spec file's existing `service`/`httpMock` variable names — read the file first and match them.)

- [ ] **Step 2: Run to verify they fail** (`booking-view.util` missing; `getGrid` missing).

- [ ] **Step 3: Implement**

```ts
// src/app/plot-bookings/booking-view.util.ts
import { Booking, EmiInstallment } from './models/associate-booking-page.model';

export function paidPercent(b: Booking): number {
  if (!(b.totalAmount > 0)) { return 0; }
  return Math.min(100, Math.max(0, Math.round((b.paidAmount / b.totalAmount) * 100)));
}

// The API only flags overdue on PENDING installments of ACTIVE bookings, but the badge is
// re-guarded here so a stale flag on a PAID/VOID row can never render as overdue.
export const isOverdueRow = (i: EmiInstallment): boolean => i.overdue && i.status === 'PENDING';

export const overdueCount = (b: Booking): number => b.installments.filter(isOverdueRow).length;

// Unit 14 adds plotNo to the response; until then the short plot id is the best label we have.
export const plotLabel = (b: Booking): string => b.plotNo ?? b.plotId.slice(0, 8);
```

In `models/associate-booking-page.model.ts`, add to `Booking` (after `installments`):

```ts
  // Added by plot-booking unit 14 (read-model follow-up); absent until it lands.
  plotNo?: string;
  projectName?: string;
```

In `plot-bookings.service.ts`: add the import `import { PlotGridItem } from '../shared/utils/plot-grid.util';`, replace `listPlots` with

```ts
  // The grid path is /api/projects/..., not /api/company/projects/... (any-authenticated, unit 10).
  getGrid(projectId: string): Observable<PlotGridItem[]> {
    return this.http.get<PlotGridItem[]>(`/api/projects/${projectId}/plots/grid`);
  }
```

and remove the now-unused `PlotPageResponse` import (keep `Project`). Remove `HttpParams` only if no longer used — `getMyBookings` still uses it.

- [ ] **Step 4: Run both specs; expected PASS.** (The existing `plot-bookings.component.spec.ts` will fail to compile or run until Task 4 rewrites it — run only these two files here with `--include`.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/plot-bookings
git commit -m "feat(frontend): plot-bookings grid service method and booking display helpers (unit 13)"
```

---

### Task 2: `PlotAvailabilityComponent`

**Files:**
- Create: `src/app/plot-bookings/plot-availability.component.ts`, `plot-availability.component.spec.ts`
- Modify: `src/styles/_admin.scss` (append)

**Interfaces:**
- Consumes: `PlotBookingsService.listProjects()/getGrid()`, unit 11's `PlotTileComponent` (inputs `plotNo,type,area,price,status,selectable,selected`, output `tileSelect`), `groupIntoBlocks`, `countByStatus`, `formatInr`, `formatArea`.
- Produces: `<app-plot-availability>` (selector, no inputs/outputs), class `PlotAvailabilityComponent` with public `projects`, `projectId`, `grid`, `statusFilter`, `typeFilter`, `selected`, `selectProject(id)`, `setStatus(f)`, `setType(t)`, `clearFilters()`, `openPopover(p)`, `closePopover()`, `loadProjects()`, `loadGrid()`.

- [ ] **Step 1: Write the failing spec**

```ts
// src/app/plot-bookings/plot-availability.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotAvailabilityComponent } from './plot-availability.component';

describe('PlotAvailabilityComponent', () => {
  let fixture: ComponentFixture<PlotAvailabilityComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  const project = (id: string, name = 'Green Valley') =>
    ({ id, name, location: 'Hyderabad', hasThumbnail: false, totalPlots: 3, availablePlots: 1, soldPlots: 1, createdAt: '2026-01-01T00:00:00Z' });
  const cell = (plotNo: string, status = 'AVAILABLE', type = 'NORMAL', over: Record<string, unknown> = {}) =>
    ({ plotId: 'id-' + plotNo, plotNo, type, area: 1200, price: 4500000, status, ...over });

  function boot(projects: unknown[] = [project('p1')], grid: unknown[] = [cell('A-2'), cell('A-1', 'BOOKED', 'CORNER'), cell('B-1', 'SOLD')]) {
    http.expectOne('/api/company/projects').flush(projects);
    if (projects.length) { http.expectOne('/api/projects/p1/plots/grid').flush(grid); }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlotAvailabilityComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(PlotAvailabilityComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('auto-selects the first project and renders its grid in natural block order', () => {
    boot();
    const blocks = el().querySelectorAll('.plot-availability__block');
    expect(blocks.length).toBe(2);
    expect(blocks[0].querySelectorAll('app-plot-tile')[0].textContent).toContain('A-1');
  });

  it('shows the seal figure from AVAILABLE rows only', () => {
    boot();
    expect(fixture.componentInstance.counts.AVAILABLE).toBe(1);
    expect(el().querySelector('.plot-availability__seal')!.textContent).toContain('plotBookings.seal.figure');
  });

  it('single-select status chips filter the grid and the shown-count', () => {
    boot();
    const chips = el().querySelectorAll<HTMLButtonElement>('.plot-availability__chip');
    chips[2].click(); // ALL, AVAILABLE, BOOKED, SOLD
    fixture.detectChanges();
    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
    expect(el().querySelectorAll('app-plot-tile').length).toBe(1);
    expect(el().querySelector('[aria-live="polite"]')!.textContent).toContain('plotBookings.shownCount');
  });

  it('filters by plot type', () => {
    boot();
    fixture.componentInstance.setType('CORNER');
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(1);
  });

  it('shows no-match with a working Clear filters when filters leave nothing', () => {
    boot([project('p1')], [cell('A-1')]);
    fixture.componentInstance.setStatus('SOLD');
    fixture.detectChanges();
    expect(el().textContent).toContain('plotBookings.noMatchTitle');
    el().querySelector<HTMLButtonElement>('.plot-availability__clear')!.click();
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(1);
  });

  it('shows the empty-project state for a project with no plots', () => {
    boot([project('p1')], []);
    expect(el().textContent).toContain('plotBookings.plotsEmptyTitle');
  });

  it('shows the projects error banner and Retry reloads', () => {
    http.expectOne('/api/company/projects').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('plotBookings.projectsLoadError');
    el().querySelector<HTMLButtonElement>('.plot-availability__retry')!.click();
    http.expectOne('/api/company/projects').flush([]);
  });

  it('keeps the last grid and shows a stale banner when a refresh fails', () => {
    boot();
    fixture.componentInstance.loadGrid();
    http.expectOne('/api/projects/p1/plots/grid').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelectorAll('app-plot-tile').length).toBe(3);
    expect(el().textContent).toContain('plotBookings.plotsRefreshError');
  });

  it('switching project clears filters, closes the popover, and ignores a late response for the old project', () => {
    boot([project('p1'), project('p2', 'Lake View')]);
    fixture.componentInstance.setStatus('BOOKED');
    fixture.componentInstance.openPopover(fixture.componentInstance.grid![0]);
    fixture.componentInstance.loadGrid();               // slow p1 refresh in flight
    const stale = http.expectOne('/api/projects/p1/plots/grid');
    fixture.componentInstance.selectProject('p2');
    http.expectOne('/api/projects/p2/plots/grid').flush([cell('Z-1')]);
    stale.flush([cell('OLD-1')]);                       // arrives late
    fixture.detectChanges();
    expect(fixture.componentInstance.statusFilter).toBe('ALL');
    expect(fixture.componentInstance.selected).toBeNull();
    expect(fixture.componentInstance.grid!.map(g => g.plotNo)).toEqual(['Z-1']);
  });

  it('opens a read-only popover with exact price and nothing about buyers or bookings', () => {
    boot();
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    fixture.detectChanges();
    const dialog = el().querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('₹45,00,000');
    expect(dialog.textContent).toContain('plotBookings.popover.hint');
    expect(dialog.textContent!.toLowerCase()).not.toContain('buyer');
    expect(dialog.querySelectorAll('input, form, textarea').length).toBe(0);
  });

  it('never renders extra grid fields even if the API adds them', () => {
    boot([project('p1')], [cell('A-1', 'BOOKED', 'NORMAL', { buyerName: 'SECRET', associateId: 'LEAK' })]);
    el().querySelector<HTMLButtonElement>('app-plot-tile button')!.click();
    fixture.detectChanges();
    expect(el().textContent).not.toContain('SECRET');
    expect(el().textContent).not.toContain('LEAK');
  });

  it('closes the popover on Escape and returns focus to the tile', async () => {
    document.body.appendChild(fixture.nativeElement);
    boot();
    const tile = el().querySelector<HTMLButtonElement>('app-plot-tile button')!;
    tile.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    await new Promise(r => setTimeout(r));
    expect(fixture.componentInstance.selected).toBeNull();
    expect(document.activeElement).toBe(tile);
    fixture.nativeElement.remove();
  });

  it('has no write controls on the tab', () => {
    boot();
    expect(el().querySelectorAll('form, input[type="text"], textarea').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** (module not found).

- [ ] **Step 3: Implement**

```ts
// src/app/plot-bookings/plot-availability.component.ts
import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Project, PlotStatus, PlotType } from '../setup/models/project.model';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { PlotTileComponent } from '../shared/components/plot-tile/plot-tile.component';
import {
  PlotBlock, PlotGridItem, StatusCounts, countByStatus, formatArea, formatInr, groupIntoBlocks
} from '../shared/utils/plot-grid.util';
import { PlotBookingsService } from './plot-bookings.service';

type StatusFilter = 'ALL' | PlotStatus;
type TypeFilter = 'ALL' | PlotType;

@Component({
  selector: 'app-plot-availability',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent, PlotTileComponent],
  template: `
    <div class="plot-availability" [attr.aria-busy]="loadingGrid">
      <app-inline-banner *ngIf="projectsError" tone="danger">
        {{ 'plotBookings.projectsLoadError' | translate }}
        <button type="button" class="plot-availability__retry" (click)="loadProjects()">{{ 'plotBookings.retryAction' | translate }}</button>
      </app-inline-banner>

      <ng-container *ngIf="projects.length">
        <div class="plot-availability__toolbar">
          <section class="plot-availability__seal" [attr.aria-label]="'plotBookings.seal.label' | translate">
            <span class="plot-availability__seal-label">{{ 'plotBookings.seal.label' | translate }}</span>
            <strong class="plot-availability__seal-figure">
              {{ grid ? ('plotBookings.seal.figure' | translate: { available: counts.AVAILABLE, total: grid.length }) : '—' }}
            </strong>
            <label class="plot-availability__field">
              {{ 'plotBookings.projectPickerLabel' | translate }}
              <select (change)="selectProject($any($event.target).value)">
                <option *ngFor="let p of projects" [value]="p.id" [selected]="p.id === projectId">{{ p.name }} — {{ p.location }}</option>
              </select>
            </label>
          </section>

          <div class="plot-availability__filters" *ngIf="grid?.length">
            <div class="plot-availability__chips" role="group">
              <button type="button" *ngFor="let f of statusFilters" class="plot-availability__chip"
                [class.plot-availability__chip--on]="statusFilter === f" [attr.aria-pressed]="statusFilter === f" (click)="setStatus(f)">
                {{ 'plotBookings.filter.' + f | translate }} <span class="plot-availability__chip-count">{{ countFor(f) }}</span>
              </button>
            </div>
            <label class="plot-availability__field">
              {{ 'plotBookings.filter.typeLabel' | translate }}
              <select (change)="setType($any($event.target).value)">
                <option value="ALL" [selected]="typeFilter === 'ALL'">{{ 'plotBookings.filter.typeAll' | translate }}</option>
                <option value="NORMAL" [selected]="typeFilter === 'NORMAL'">{{ 'plotBookings.filter.NORMAL' | translate }}</option>
                <option value="CORNER" [selected]="typeFilter === 'CORNER'">{{ 'plotBookings.filter.CORNER' | translate }}</option>
              </select>
            </label>
            <span class="plot-availability__legend">{{ 'plotBookings.legend.cornerPlot' | translate }}</span>
          </div>
        </div>

        <app-inline-banner *ngIf="gridError" tone="danger">
          {{ (grid ? 'plotBookings.plotsRefreshError' : 'plotBookings.plotsLoadError') | translate }}
          <button type="button" class="plot-availability__retry" (click)="loadGrid()">{{ 'plotBookings.retryAction' | translate }}</button>
        </app-inline-banner>

        <div class="plot-availability__skeleton" role="status" *ngIf="!grid && !gridError">
          <span class="plot-availability__sr">{{ 'plotBookings.loading' | translate }}</span>
          <span class="plot-availability__skeleton-tile" *ngFor="let i of [1,2,3,4,5,6,7,8,9,10,11,12]"></span>
        </div>

        <div class="plot-availability__empty" *ngIf="grid && !grid.length">
          <h2>{{ 'plotBookings.plotsEmptyTitle' | translate }}</h2>
          <p>{{ 'plotBookings.plotsEmptyBody' | translate }}</p>
        </div>

        <ng-container *ngIf="grid?.length">
          <p class="plot-availability__shown" aria-live="polite">
            {{ 'plotBookings.shownCount' | translate: { shown: shownCount, total: grid!.length } }}
          </p>
          <div class="plot-availability__empty" *ngIf="!blocks.length">
            <h2>{{ 'plotBookings.noMatchTitle' | translate }}</h2>
            <p>{{ 'plotBookings.noMatchBody' | translate }}</p>
            <button type="button" class="brand-button brand-button--secondary plot-availability__clear" (click)="clearFilters()">
              {{ 'plotBookings.clearFilters' | translate }}
            </button>
          </div>
          <section class="plot-availability__block" *ngFor="let b of blocks">
            <h3 class="plot-availability__block-heading" *ngIf="b.block">
              {{ 'plotBookings.blockHeader' | translate: { block: b.block, count: b.plots.length } }}
            </h3>
            <ul class="plot-availability__tiles">
              <li *ngFor="let p of b.plots">
                <app-plot-tile [attr.data-plot-id]="p.plotId" [plotNo]="p.plotNo" [type]="p.type" [area]="p.area" [price]="p.price"
                  [status]="p.status" [selected]="p.plotId === selected?.plotId" (tileSelect)="openPopover(p)"></app-plot-tile>
              </li>
            </ul>
          </section>
        </ng-container>
      </ng-container>

      <div class="plot-availability__scrim" *ngIf="selected" (click)="closePopover()"></div>
      <div class="plot-availability__popover" role="dialog" *ngIf="selected as s"
        [attr.aria-label]="'plotBookings.popover.title' | translate: { plotNo: s.plotNo }">
        <h2 class="plot-availability__popover-title">{{ 'plotBookings.popover.title' | translate: { plotNo: s.plotNo } }}</h2>
        <dl class="plot-availability__facts">
          <dt>{{ 'plotBookings.popover.status' | translate }}</dt><dd>{{ 'plotTile.status.' + s.status | translate }}</dd>
          <dt>{{ 'plotBookings.popover.type' | translate }}</dt><dd>{{ 'plotTile.type.' + s.type | translate }}</dd>
          <dt>{{ 'plotBookings.popover.area' | translate }}</dt><dd>{{ areaText(s.area) }}</dd>
          <dt>{{ 'plotBookings.popover.price' | translate }}</dt><dd>{{ priceText(s.price) }}</dd>
        </dl>
        <p class="plot-availability__hint">{{ 'plotBookings.popover.hint' | translate }}</p>
        <button #closeBtn type="button" class="brand-button brand-button--secondary plot-availability__close"
          [attr.aria-label]="'plotBookings.popover.closeLabel' | translate" (click)="closePopover()">
          {{ 'plotBookings.popover.closeLabel' | translate }}
        </button>
      </div>
    </div>
  `
})
export class PlotAvailabilityComponent implements OnInit {
  private service = inject(PlotBookingsService);

  readonly statusFilters: StatusFilter[] = ['ALL', 'AVAILABLE', 'BOOKED', 'SOLD'];
  projects: Project[] = [];
  projectsError = false;
  projectId = '';
  grid: PlotGridItem[] | null = null;
  gridError = false;
  loadingGrid = false;
  statusFilter: StatusFilter = 'ALL';
  typeFilter: TypeFilter = 'ALL';
  selected: PlotGridItem | null = null;
  counts: StatusCounts = { AVAILABLE: 0, BOOKED: 0, SOLD: 0 };
  blocks: PlotBlock[] = [];
  shownCount = 0;

  // Focus Close the moment the popover renders (DESIGN Accessibility).
  @ViewChild('closeBtn') set closeBtn(ref: ElementRef<HTMLButtonElement> | undefined) {
    ref?.nativeElement.focus();
  }

  areaText = formatArea;
  priceText = formatInr;

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.projectsError = false;
    this.service.listProjects().subscribe({
      next: list => {
        this.projects = list;
        if (list.length && !this.projectId) { this.selectProject(list[0].id); }
      },
      error: () => (this.projectsError = true)
    });
  }

  selectProject(id: string): void {
    this.projectId = id;
    this.statusFilter = 'ALL';
    this.typeFilter = 'ALL';
    this.selected = null;
    this.grid = null;
    this.gridError = false;
    this.rebuild();
    this.loadGrid();
  }

  // Keeps the last good grid on a failed refresh; drops a response for a project that is no longer selected.
  loadGrid(): void {
    const id = this.projectId;
    if (!id) { return; }
    this.loadingGrid = true;
    this.service.getGrid(id).subscribe({
      next: grid => {
        if (id !== this.projectId) { return; }
        this.loadingGrid = false;
        this.gridError = false;
        this.grid = grid;
        this.rebuild();
      },
      error: () => {
        if (id !== this.projectId) { return; }
        this.loadingGrid = false;
        this.gridError = true;
      }
    });
  }

  setStatus(f: StatusFilter): void { this.statusFilter = f; this.rebuild(); }
  setType(t: string): void { this.typeFilter = t as TypeFilter; this.rebuild(); }
  clearFilters(): void { this.statusFilter = 'ALL'; this.typeFilter = 'ALL'; this.rebuild(); }

  countFor(f: StatusFilter): number {
    return f === 'ALL' ? (this.grid?.length ?? 0) : this.counts[f];
  }

  private rebuild(): void {
    const all = this.grid ?? [];
    this.counts = countByStatus(all);
    const shown = all.filter(p =>
      (this.statusFilter === 'ALL' || p.status === this.statusFilter) &&
      (this.typeFilter === 'ALL' || p.type === this.typeFilter));
    this.shownCount = shown.length;
    this.blocks = groupIntoBlocks(shown);
  }

  openPopover(p: PlotGridItem): void { this.selected = p; }

  closePopover(): void {
    const id = this.selected?.plotId;
    this.selected = null;
    if (id) {
      setTimeout(() => document.querySelector<HTMLElement>(`[data-plot-id="${id}"] button`)?.focus());
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.selected) { this.closePopover(); }
  }
}
```

Styles — append to `_admin.scss`:

```scss
// ---- Plot Bookings (associate; plot-booking unit 13) -----------------------------------------
.plot-availability {
  display: flex; flex-direction: column; gap: 1.25rem; padding-top: 1rem;

  &__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  &__toolbar { display: grid; grid-template-columns: 1.1fr 1.9fr; gap: 1.25rem; align-items: stretch; }

  &__seal {
    display: flex; flex-direction: column; gap: 0.5rem; padding: 1.25rem 1.5rem; background: var(--surface-card);
    border: 2px solid var(--brand-primary); border-radius: 20px;
    box-shadow: 0 0 0 6px var(--brand-primary-soft), 0 4px 20px -2px rgba(0, 0, 0, 0.08);
  }
  &__seal-label { font: 500 0.75rem var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
  &__seal-figure { font: 600 1.75rem var(--font-mono); font-variant-numeric: tabular-nums; }

  &__field { display: flex; flex-direction: column; gap: 0.375rem; margin: 0;
    font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted);
    select { min-height: 44px; border-radius: 10px; } }

  &__filters { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1rem; padding: 1.25rem 1.5rem; background: var(--surface-raised); border-radius: 16px; }
  &__chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  &__chip {
    display: inline-flex; gap: 0.5rem; align-items: center; min-height: 44px; padding: 0 1rem; border-radius: 999px; cursor: pointer;
    background: var(--surface-card); border: 1px solid var(--border-subtle); font-weight: 600;
    &--on { background: var(--ink); color: #fff; border-color: var(--ink); }
    &:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
  }
  &__chip-count { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  &__legend { font-size: 0.8125rem; color: var(--text-muted); }

  &__shown { margin: 0; font-size: 0.875rem; color: var(--text-muted); }
  &__block-heading {
    display: flex; align-items: center; gap: 0.75rem; margin: 0.5rem 0; font: 600 0.75rem var(--font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted);
    &::before, &::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
  }
  &__tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 0.625rem; list-style: none; margin: 0; padding: 0; }

  &__empty { padding: 2.5rem 1rem; text-align: center; background: var(--surface-card); border: 1px dashed var(--border-subtle); border-radius: 16px;
    h2 { margin: 0 0 0.5rem; font: 600 1.125rem var(--font-sans); } p { margin: 0 0 1rem; color: var(--text-muted); } }
  &__retry { margin-left: 0.75rem; background: none; border: 0; text-decoration: underline; cursor: pointer; color: inherit; font-weight: 600; min-height: 44px; }

  &__skeleton { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 0.625rem; }
  &__skeleton-tile { height: 92px; border-radius: 10px; background: linear-gradient(90deg, var(--surface-raised), var(--surface-card), var(--surface-raised)); background-size: 200% 100%; animation: plot-availability-shimmer 1.4s linear infinite; }

  &__scrim { display: none; }
  &__popover {
    position: fixed; right: 1.5rem; bottom: 1.5rem; z-index: 40; width: min(340px, calc(100vw - 2rem)); display: flex; flex-direction: column; gap: 0.75rem;
    padding: 1.25rem; background: var(--surface-card); border-radius: 20px; box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.25);
  }
  &__popover-title { margin: 0; font: 700 1.125rem var(--font-mono); }
  &__facts { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; margin: 0;
    dt { font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); align-self: center; }
    dd { margin: 0; font: 600 0.9375rem var(--font-mono); font-variant-numeric: tabular-nums; } }
  &__hint { margin: 0; font-size: 0.875rem; color: var(--text-muted); }
  &__close { min-height: 44px; }
}
@keyframes plot-availability-shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .plot-availability__skeleton-tile { animation: none; } }
@media (max-width: 959px) { .plot-availability__toolbar { grid-template-columns: 1fr; } }
@media (max-width: 767px) {
  .plot-availability__tiles, .plot-availability__skeleton { grid-template-columns: repeat(2, 1fr); }
  .plot-availability__scrim { display: block; position: fixed; inset: 0; z-index: 30; background: rgba(0, 0, 0, 0.35); }
  .plot-availability__popover { left: 0; right: 0; bottom: 0; width: auto; border-radius: 20px 20px 0 0; }
}
```

- [ ] **Step 4: Run the spec; expected PASS (13 specs).** The Escape/focus spec appends the fixture to `document.body` so `focus()` is real — keep that.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): associate availability tab — block grid, filters, read-only plot popover (unit 13)"
```

---

### Task 3: `MyBookingsComponent`

**Files:**
- Create: `src/app/plot-bookings/my-bookings.component.ts`, `my-bookings.component.spec.ts`
- Modify: `src/styles/_admin.scss` (append)

**Interfaces:**
- Consumes: `PlotBookingsService.getMyBookings(page, size)`, `paidPercent`, `overdueCount`, `plotLabel`, `isOverdueRow`, `formatInr`, `Booking`/`AssociateBookingPage`.
- Produces: `<app-my-bookings (viewAvailability)>`; class `MyBookingsComponent` with `page`, `selected`, `sheetOpen`, `select(b)`, `back()`, `goTo(p)`, `load(p)`.

- [ ] **Step 1: Write the failing spec**

```ts
// src/app/plot-bookings/my-bookings.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MyBookingsComponent } from './my-bookings.component';

describe('MyBookingsComponent', () => {
  let fixture: ComponentFixture<MyBookingsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  const inst = (n: number, over: Record<string, unknown> = {}) =>
    ({ installmentNumber: n, amount: 100000, dueDate: '2026-03-01', status: 'PENDING', paidAt: null, overdue: false, ...over });
  const booking = (id: string, over: Record<string, unknown> = {}) => ({
    id, plotId: '123e4567-e89b-12d3-a456-426614174000', associateId: 'a', status: 'ACTIVE', buyerName: 'Rohit Kulkarni',
    totalAmount: 400000, installmentCount: 4, bookedAt: '2026-02-01T00:00:00Z', paidAmount: 100000, dueAmount: 300000,
    installments: [inst(1, { status: 'PAID', paidAt: '2026-02-05T00:00:00Z' }), inst(2, { overdue: true }), inst(3), inst(4)], ...over
  });
  const pageOf = (bookings: unknown[], page = 0, total = bookings.length) => ({ bookings, page, size: 20, totalElements: total });

  function boot(bookings: unknown[] = [booking('b1'), booking('b2', { status: 'CANCELLED', paidAmount: 100000, dueAmount: 0, installments: [inst(1, { status: 'PAID' }), inst(2, { status: 'VOID' })] })]) {
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush(pageOf(bookings));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyBookingsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(MyBookingsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders a card per booking in server order with the plot label fallback', () => {
    boot();
    const cards = el().querySelectorAll('.my-bookings__card');
    expect(cards.length).toBe(2);
    expect(cards[0].textContent).toContain('123e4567');
    expect(cards[0].textContent).toContain('Rohit Kulkarni');
  });

  it('uses plotNo and shows the project line when the response carries them', () => {
    boot([booking('b1', { plotNo: 'A-12', projectName: 'Green Valley' })]);
    expect(el().querySelector('.my-bookings__card')!.textContent).toContain('A-12');
    expect(el().querySelector('.my-bookings__detail')!.textContent).toContain('Green Valley');
  });

  it('shows the paid bar with an aria-label percent and the printed amounts', () => {
    boot();
    const bar = el().querySelector('.my-bookings__bar')!;
    expect(bar.getAttribute('role')).toBe('img');
    expect(bar.getAttribute('aria-label')).toContain('plotBookings.progressLabel');
    expect(el().querySelector('.my-bookings__card')!.textContent).toContain('plotBookings.paidOfTotal');
  });

  it('shows an overdue-count badge only when there are overdue installments', () => {
    boot();
    const cards = el().querySelectorAll('.my-bookings__card');
    expect(cards[0].querySelector('.my-bookings__badge--overdue')).not.toBeNull();
    expect(cards[1].querySelector('.my-bookings__badge--overdue')).toBeNull();
  });

  it('selects the first booking by default and shows its installments with overdue only on pending rows', () => {
    boot();
    const rows = el().querySelectorAll('.my-bookings__detail tbody tr');
    expect(rows.length).toBe(4);
    expect(rows[1].classList).toContain('my-bookings__row--overdue');
    expect(rows[0].classList).not.toContain('my-bookings__row--overdue');
  });

  it('selecting another booking swaps the detail without any HTTP call', () => {
    boot();
    el().querySelectorAll<HTMLButtonElement>('.my-bookings__card')[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected!.id).toBe('b2');
    expect(el().querySelectorAll('.my-bookings__detail tbody tr')[1].classList).toContain('my-bookings__row--void');
    // afterEach http.verify() proves no request was issued
  });

  it('a cancelled booking shows "no further dues", the retained-paid note and a struck plot label', () => {
    boot();
    el().querySelectorAll<HTMLButtonElement>('.my-bookings__card')[1].click();
    fixture.detectChanges();
    expect(el().querySelector('.my-bookings__card--cancelled .my-bookings__plot--struck')).not.toBeNull();
    expect(el().textContent).toContain('plotBookings.noFurtherDues');
    expect(el().textContent).toContain('plotBookings.cancelledNote');
    expect(el().textContent).not.toContain('plotBookings.dueAmount');
  });

  it('a fully paid confirmed booking shows "fully paid" and the confirmed note', () => {
    boot([booking('b1', { status: 'CONFIRMED', paidAmount: 400000, dueAmount: 0, installments: [inst(1, { status: 'PAID' })] })]);
    expect(el().textContent).toContain('plotBookings.fullyPaid');
    expect(el().textContent).toContain('plotBookings.confirmedNote');
  });

  it('opens the detail as a sheet on select and Back closes it', () => {
    boot();
    el().querySelectorAll<HTMLButtonElement>('.my-bookings__card')[1].click();
    fixture.detectChanges();
    expect(el().querySelector('.my-bookings__detail')!.classList).toContain('my-bookings__detail--open');
    el().querySelector<HTMLButtonElement>('.my-bookings__back')!.click();
    fixture.detectChanges();
    expect(el().querySelector('.my-bookings__detail')!.classList).not.toContain('my-bookings__detail--open');
  });

  it('shows the empty state and "View availability" emits', () => {
    boot([]);
    expect(el().textContent).toContain('plotBookings.bookingsEmptyTitle');
    let emitted = false;
    fixture.componentInstance.viewAvailability.subscribe(() => (emitted = true));
    el().querySelector<HTMLButtonElement>('.my-bookings__view-availability')!.click();
    expect(emitted).toBeTrue();
  });

  it('shows an error banner with Retry when the first load fails', () => {
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('plotBookings.bookingsLoadError');
    el().querySelector<HTMLButtonElement>('.my-bookings__retry')!.click();
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush(pageOf([]));
  });

  it('pages with Next/Previous and keeps the previous page visible if the next load fails', () => {
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush(pageOf([booking('b1')], 0, 25));
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.my-bookings__next')!.click();
    const req = http.expectOne(r => r.url === '/api/associates/me/bookings');
    expect(req.request.params.get('page')).toBe('1');
    req.flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelectorAll('.my-bookings__card').length).toBe(1);
    expect(el().textContent).toContain('plotBookings.bookingsLoadError');
  });

  it('exposes no write controls', () => {
    boot();
    expect(el().querySelectorAll('form, input, textarea, select').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Implement**

```ts
// src/app/plot-bookings/my-bookings.component.ts
import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { formatInr } from '../shared/utils/plot-grid.util';
import { AssociateBookingPage, Booking } from './models/associate-booking-page.model';
import { isOverdueRow, overdueCount, paidPercent, plotLabel } from './booking-view.util';
import { PlotBookingsService } from './plot-bookings.service';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="my-bookings" [attr.aria-busy]="loading">
      <app-inline-banner *ngIf="error" tone="danger">
        {{ 'plotBookings.bookingsLoadError' | translate }}
        <button type="button" class="my-bookings__retry" (click)="load(requestedPage)">{{ 'plotBookings.retryAction' | translate }}</button>
      </app-inline-banner>

      <div class="my-bookings__skeleton" role="status" *ngIf="!page && !error">
        <span class="my-bookings__sr">{{ 'plotBookings.loading' | translate }}</span>
        <span class="my-bookings__skeleton-card" *ngFor="let i of [1,2,3]"></span>
      </div>

      <div class="my-bookings__empty" *ngIf="page && !page.bookings.length">
        <h2>{{ 'plotBookings.bookingsEmptyTitle' | translate }}</h2>
        <p>{{ 'plotBookings.bookingsEmptyBody' | translate }}</p>
        <button type="button" class="brand-button brand-button--secondary my-bookings__view-availability" (click)="viewAvailability.emit()">
          {{ 'plotBookings.viewAvailability' | translate }}
        </button>
      </div>

      <ng-container *ngIf="page?.bookings?.length">
        <p class="my-bookings__note">{{ 'plotBookings.bookingsNote' | translate }}</p>
        <div class="my-bookings__split">
          <ul class="my-bookings__cards">
            <li *ngFor="let b of page!.bookings">
              <button type="button" class="my-bookings__card" [class.my-bookings__card--selected]="b.id === selected?.id"
                [class.my-bookings__card--cancelled]="b.status === 'CANCELLED'" [class.my-bookings__card--confirmed]="b.status === 'CONFIRMED'"
                [attr.aria-pressed]="b.id === selected?.id" (click)="select(b)">
                <span class="my-bookings__card-head">
                  <span class="my-bookings__plot" [class.my-bookings__plot--struck]="b.status === 'CANCELLED'">{{ label(b) }}</span>
                  <span class="my-bookings__badge my-bookings__badge--{{ b.status | lowercase }}">{{ 'plotBookings.bookingStatus.' + b.status | translate }}</span>
                  <span class="my-bookings__badge my-bookings__badge--overdue" *ngIf="overdue(b) as n">{{ 'plotBookings.overdueCount' | translate: { count: n } }}</span>
                </span>
                <span class="my-bookings__buyer">{{ 'plotBookings.buyerLine' | translate: { buyer: b.buyerName, date: (b.bookedAt | date: 'mediumDate') } }}</span>
                <span class="my-bookings__bar" role="img" [attr.aria-label]="'plotBookings.progressLabel' | translate: { percent: percent(b) }">
                  <span class="my-bookings__bar-fill" [style.width.%]="percent(b)"></span>
                </span>
                <span class="my-bookings__paid">{{ 'plotBookings.paidOfTotal' | translate: { paid: money(b.paidAmount), total: money(b.totalAmount) } }}</span>
                <span class="my-bookings__due">{{ dueKey(b) | translate: { amount: money(b.dueAmount) } }}</span>
              </button>
            </li>
          </ul>

          <article class="my-bookings__detail" [class.my-bookings__detail--open]="sheetOpen" *ngIf="selected as s">
            <button type="button" class="brand-button brand-button--secondary my-bookings__back" (click)="back()">
              {{ 'plotBookings.backToBookings' | translate }}
            </button>
            <h2 class="my-bookings__detail-title" [class.my-bookings__plot--struck]="s.status === 'CANCELLED'">{{ label(s) }}</h2>
            <p class="my-bookings__detail-sub" *ngIf="s.projectName">{{ s.projectName }}</p>
            <p class="my-bookings__detail-sub">{{ 'plotBookings.buyerLabel' | translate: { buyer: s.buyerName } }}</p>
            <dl class="my-bookings__facts">
              <div><dt>{{ 'plotBookings.facts.total' | translate }}</dt><dd>{{ money(s.totalAmount) }}</dd></div>
              <div><dt>{{ 'plotBookings.facts.paid' | translate }}</dt><dd>{{ money(s.paidAmount) }}</dd></div>
              <div><dt>{{ 'plotBookings.facts.due' | translate }}</dt><dd>{{ money(s.dueAmount) }}</dd></div>
              <div><dt>{{ 'plotBookings.facts.installments' | translate }}</dt><dd>{{ s.installmentCount }}</dd></div>
            </dl>
            <span class="my-bookings__bar my-bookings__bar--large" role="img" [attr.aria-label]="'plotBookings.progressLabel' | translate: { percent: percent(s) }">
              <span class="my-bookings__bar-fill" [style.width.%]="percent(s)"></span>
            </span>
            <p class="my-bookings__status-note" *ngIf="s.status === 'CONFIRMED'">{{ 'plotBookings.confirmedNote' | translate }}</p>
            <p class="my-bookings__status-note" *ngIf="s.status === 'CANCELLED'">{{ 'plotBookings.cancelledNote' | translate }}</p>
            <table class="my-bookings__table">
              <thead>
                <tr>
                  <th>{{ 'plotBookings.column.no' | translate }}</th>
                  <th>{{ 'plotBookings.column.dueDate' | translate }}</th>
                  <th>{{ 'plotBookings.column.amount' | translate }}</th>
                  <th>{{ 'plotBookings.column.status' | translate }}</th>
                  <th>{{ 'plotBookings.column.paidOn' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let i of s.installments" [class.my-bookings__row--overdue]="isOverdue(i)" [class.my-bookings__row--void]="i.status === 'VOID'">
                  <td><span class="my-bookings__cell-label">{{ 'plotBookings.column.no' | translate }}</span>{{ i.installmentNumber }}</td>
                  <td><span class="my-bookings__cell-label">{{ 'plotBookings.column.dueDate' | translate }}</span>{{ i.dueDate | date: 'mediumDate' }}</td>
                  <td class="my-bookings__amount"><span class="my-bookings__cell-label">{{ 'plotBookings.column.amount' | translate }}</span>{{ money(i.amount) }}</td>
                  <td>
                    <span class="my-bookings__cell-label">{{ 'plotBookings.column.status' | translate }}</span>
                    <span class="my-bookings__badge my-bookings__badge--{{ i.status | lowercase }}">{{ 'plotBookings.installmentStatus.' + i.status | translate }}</span>
                    <span class="my-bookings__badge my-bookings__badge--overdue" *ngIf="isOverdue(i)">{{ 'plotBookings.overdue' | translate }}</span>
                  </td>
                  <td><span class="my-bookings__cell-label">{{ 'plotBookings.column.paidOn' | translate }}</span>{{ i.paidAt ? (i.paidAt | date: 'mediumDate') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </article>
        </div>

        <div class="my-bookings__pager">
          <button type="button" class="brand-button brand-button--secondary my-bookings__prev" [disabled]="page!.page === 0" (click)="goTo(page!.page - 1)">
            {{ 'plotBookings.previousPageAction' | translate }}
          </button>
          <span>{{ 'plotBookings.pageIndicator' | translate: { page: page!.page + 1, totalPages: totalPages } }}</span>
          <button type="button" class="brand-button brand-button--secondary my-bookings__next" [disabled]="page!.page + 1 >= totalPages" (click)="goTo(page!.page + 1)">
            {{ 'plotBookings.nextPageAction' | translate }}
          </button>
        </div>
      </ng-container>
    </div>
  `
})
export class MyBookingsComponent implements OnInit {
  private service = inject(PlotBookingsService);
  @Output() viewAvailability = new EventEmitter<void>();

  page: AssociateBookingPage | null = null;
  selected: Booking | null = null;
  sheetOpen = false;
  loading = false;
  error = false;
  requestedPage = 0;

  money = formatInr;
  percent = paidPercent;
  overdue = overdueCount;
  label = plotLabel;
  isOverdue = isOverdueRow;

  get totalPages(): number {
    if (!this.page || this.page.size === 0) { return 1; }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void { this.load(0); }

  // The previous page stays on screen if this load fails (error banner + Retry above it).
  load(p: number): void {
    this.requestedPage = p;
    this.loading = true;
    this.error = false;
    this.service.getMyBookings(p, PAGE_SIZE).subscribe({
      next: res => {
        this.loading = false;
        this.page = res;
        this.selected = res.bookings[0] ?? null;
        this.sheetOpen = false;
      },
      error: () => { this.loading = false; this.error = true; }
    });
  }

  goTo(p: number): void { this.load(p); }

  // No HTTP: each booking already embeds its installments (BookingService.getMyBookings).
  select(b: Booking): void { this.selected = b; this.sheetOpen = true; }
  back(): void { this.sheetOpen = false; }

  dueKey(b: Booking): string {
    if (b.status === 'CANCELLED') { return 'plotBookings.noFurtherDues'; }
    return b.dueAmount === 0 ? 'plotBookings.fullyPaid' : 'plotBookings.dueAmount';
  }
}
```

Styles — append to `_admin.scss`:

```scss
.my-bookings {
  display: flex; flex-direction: column; gap: 1rem; padding-top: 1rem;
  &__sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  &__note { margin: 0; font-size: 0.875rem; color: var(--text-muted); }
  &__split { display: grid; grid-template-columns: 5fr 7fr; gap: 1.5rem; align-items: start; }
  &__cards { display: flex; flex-direction: column; gap: 0.75rem; list-style: none; margin: 0; padding: 0; }
  &__card {
    display: flex; flex-direction: column; gap: 0.375rem; width: 100%; padding: 1rem 1.125rem; text-align: left; cursor: pointer;
    background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: 16px;
    &--selected { border-color: var(--brand-primary); box-shadow: inset 4px 0 0 var(--brand-primary); }
    &--cancelled { box-shadow: inset 4px 0 0 var(--text-muted); .my-bookings__bar-fill { background: var(--text-muted); } }
    &--confirmed { box-shadow: inset 4px 0 0 var(--status-success); }
    &:focus-visible { outline: 2px solid var(--brand-primary); outline-offset: 2px; }
  }
  &__card-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
  &__plot { font: 700 1rem var(--font-mono); &--struck { text-decoration: line-through; color: var(--text-muted); } }
  &__buyer, &__due { font-size: 0.8125rem; color: var(--text-muted); }
  &__paid { font: 600 0.8125rem var(--font-mono); font-variant-numeric: tabular-nums; }

  &__badge {
    display: inline-flex; align-items: center; padding: 0.125rem 0.625rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
    border: 1px solid var(--border-subtle); background: var(--surface-card);
    &--active { border-color: var(--brand-primary); color: var(--brand-primary); }
    &--confirmed, &--paid { background: color-mix(in srgb, var(--status-success) 14%, var(--surface-card)); border-color: var(--status-success); color: var(--status-success-text); }
    &--cancelled, &--void { background: var(--surface-raised); color: var(--text-muted); }
    &--pending { color: var(--text-primary); }
    &--overdue { background: var(--status-danger); border-color: var(--status-danger); color: #fff; }
  }

  &__bar { display: block; height: 8px; border-radius: 999px; overflow: hidden; background: var(--border-subtle); &--large { height: 12px; } }
  &__bar-fill { display: block; height: 100%; background: var(--status-success); }

  &__detail { display: flex; flex-direction: column; gap: 0.75rem; padding: 1.5rem; background: var(--surface-card); border-radius: 20px; box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08); }
  &__detail-title { margin: 0; font: 700 1.25rem var(--font-mono); }
  &__detail-sub { margin: 0; color: var(--text-muted); }
  &__facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin: 0;
    dt { font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
    dd { margin: 0; font: 600 0.9375rem var(--font-mono); font-variant-numeric: tabular-nums; } }
  &__status-note { margin: 0; padding: 0.75rem 1rem; background: var(--surface-raised); border-radius: 10px; font-size: 0.875rem; }
  &__back { display: none; min-height: 44px; align-self: flex-start; }

  &__table { width: 100%; border-collapse: collapse;
    th { text-align: left; font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); padding: 0.5rem; }
    td { padding: 0.625rem 0.5rem; border-top: 1px solid var(--border-subtle); } }
  &__amount { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  &__cell-label { display: none; }
  &__row--overdue { box-shadow: inset 3px 0 0 var(--status-danger); background: color-mix(in srgb, var(--status-danger) 8%, transparent); }
  &__row--void { background: repeating-linear-gradient(45deg, var(--surface-raised) 0 6px, transparent 6px 12px); .my-bookings__amount { text-decoration: line-through; } }

  &__empty { padding: 2.5rem 1rem; text-align: center; background: var(--surface-card); border: 1px dashed var(--border-subtle); border-radius: 16px;
    h2 { margin: 0 0 0.5rem; font: 600 1.125rem var(--font-sans); } p { margin: 0 0 1rem; color: var(--text-muted); } }
  &__retry { margin-left: 0.75rem; background: none; border: 0; text-decoration: underline; cursor: pointer; color: inherit; font-weight: 600; min-height: 44px; }
  &__pager { display: flex; align-items: center; justify-content: center; gap: 1rem; .brand-button { min-height: 44px; } }
  &__skeleton { display: flex; flex-direction: column; gap: 0.75rem; }
  &__skeleton-card { height: 112px; border-radius: 16px; background: linear-gradient(90deg, var(--surface-raised), var(--surface-card), var(--surface-raised)); background-size: 200% 100%; animation: plot-availability-shimmer 1.4s linear infinite; }
}
@media (prefers-reduced-motion: reduce) { .my-bookings__skeleton-card { animation: none; } }
@media (max-width: 959px) {
  .my-bookings__split { grid-template-columns: 1fr; }
  .my-bookings__detail { display: none; }
  .my-bookings__detail--open { display: flex; position: fixed; inset: 0; z-index: 50; overflow-y: auto; border-radius: 0; }
  .my-bookings__back { display: inline-flex; }
}
@media (max-width: 767px) {
  .my-bookings__facts { grid-template-columns: repeat(2, 1fr); }
  .my-bookings__table thead { display: none; }
  .my-bookings__table tr { display: block; padding: 0.5rem 0; border-top: 1px solid var(--border-subtle); }
  .my-bookings__table td { display: flex; justify-content: space-between; gap: 1rem; border: 0; padding: 0.25rem 0.5rem; }
  .my-bookings__cell-label { display: inline; font: 500 0.6875rem var(--font-mono); text-transform: uppercase; color: var(--text-muted); }
}
```

- [ ] **Step 4: Run the spec; expected PASS (13 specs).**

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): associate my-bookings tab — cards, paid/due, overdue flags, EMI schedule (unit 13)"
```

---

### Task 4: Host rewrite, i18n, retire the old table UI

**Files:**
- Modify: `src/app/plot-bookings/plot-bookings.component.ts`, `plot-bookings.component.spec.ts` (full rewrite of both)
- Modify: `src/assets/i18n/en.json`, `hi.json`

**Interfaces:**
- Consumes: `PlotAvailabilityComponent` (Task 2), `MyBookingsComponent` (Task 3), `TabBarComponent`.
- Produces: `PlotBookingsComponent` (selector `app-plot-bookings`, unchanged), `activeTab: 'availability' | 'myBookings'`.

- [ ] **Step 1: Write the failing host spec (replace the whole file)**

```ts
// src/app/plot-bookings/plot-bookings.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotBookingsComponent } from './plot-bookings.component';

describe('PlotBookingsComponent', () => {
  let fixture: ComponentFixture<PlotBookingsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlotBookingsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(PlotBookingsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne('/api/company/projects').flush([]);
  });
  afterEach(() => http.verify());

  it('opens on Availability and does not fetch bookings until the My bookings tab is opened', () => {
    expect(el().querySelector('app-plot-availability')).not.toBeNull();
    expect(el().querySelector('app-my-bookings')).toBeNull();
    http.expectNone(r => r.url === '/api/associates/me/bookings');
  });

  it('switching to My bookings mounts it and loads the first page once', () => {
    fixture.componentInstance.onTabChange('myBookings');
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    expect(el().querySelector('app-my-bookings')).not.toBeNull();
    expect(el().querySelector('app-plot-availability')).toBeNull();
  });

  it('the empty-state "View availability" link switches back to the Availability tab', () => {
    fixture.componentInstance.onTabChange('myBookings');
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.my-bookings__view-availability')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.activeTab).toBe('availability');
    http.expectOne('/api/company/projects').flush([]); // Availability re-mounts and reloads
  });

  it('renders the title and subtitle keys', () => {
    expect(el().textContent).toContain('plotBookings.title');
    expect(el().textContent).toContain('plotBookings.subtitle');
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

- [ ] **Step 3: Rewrite the host**

```ts
// src/app/plot-bookings/plot-bookings.component.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { PlotAvailabilityComponent } from './plot-availability.component';
import { MyBookingsComponent } from './my-bookings.component';

type Tab = 'availability' | 'myBookings';

// Host only: each tab is its own component and is mounted only while active, so My bookings
// still loads lazily on first open and Availability re-fetches fresh data when returned to
// (the grid is a snapshot; there is no polling).
@Component({
  selector: 'app-plot-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule, TabBarComponent, PlotAvailabilityComponent, MyBookingsComponent],
  template: `
    <div class="plot-bookings">
      <h1 class="plot-bookings__title">{{ 'plotBookings.title' | translate }}</h1>
      <p class="plot-bookings__subtitle">{{ 'plotBookings.subtitle' | translate }}</p>
      <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="onTabChange($event)"></app-tab-bar>
      <app-plot-availability *ngIf="activeTab === 'availability'"></app-plot-availability>
      <app-my-bookings *ngIf="activeTab === 'myBookings'" (viewAvailability)="onTabChange('availability')"></app-my-bookings>
    </div>
  `
})
export class PlotBookingsComponent {
  private translate = inject(TranslateService);
  activeTab: Tab = 'availability';

  get tabs(): TabDefinition[] {
    return [
      { id: 'availability', label: this.translate.instant('plotBookings.tabAvailability') },
      { id: 'myBookings', label: this.translate.instant('plotBookings.tabMyBookings') }
    ];
  }

  onTabChange(tabId: string): void {
    this.activeTab = tabId as Tab;
  }
}
```

Add host styles to `_admin.scss`:

```scss
.plot-bookings {
  max-width: 1180px; margin: 0 auto; padding: 1.5rem 2rem; font-family: 'Inter', var(--font-sans);
  &__title { @extend %admin-screen-title; margin: 0; }
  &__subtitle { @extend %admin-screen-subtitle; margin: 0.375rem 0 1rem; }
}
@media (max-width: 767px) { .plot-bookings { padding-inline: 1rem; } }
```

- [ ] **Step 4: Replace the `plotBookings` block in `en.json` and copy it verbatim to `hi.json`**

In `en.json` replace the whole `"plotBookings": { ... }` object (currently lines ~152–183) with:

```json
  "plotBookings": {
    "title": "Plot Bookings",
    "subtitle": "See which plots are open in a project, and follow your own bookings and EMI payments. This page is view-only.",
    "tabAvailability": "Availability",
    "tabMyBookings": "My bookings",
    "loading": "Loading",
    "seal": { "label": "Open now", "figure": "{{available}} of {{total}} plots" },
    "projectPickerLabel": "Project",
    "filter": {
      "ALL": "All", "AVAILABLE": "Available", "BOOKED": "Booked", "SOLD": "Sold",
      "typeLabel": "Plot type", "typeAll": "All types", "NORMAL": "Normal", "CORNER": "Corner"
    },
    "legend": { "cornerPlot": "Notched tiles are corner plots." },
    "blockHeader": "Block {{block}} · {{count}} plots",
    "shownCount": "Showing {{shown}} of {{total}} plots. Select a plot for details.",
    "popover": {
      "title": "Plot {{plotNo}}",
      "status": "Status", "type": "Type", "area": "Area (sq ft)", "price": "Price",
      "closeLabel": "Close plot details",
      "hint": "To book this plot, contact the company office."
    },
    "noMatchTitle": "No plots match these filters",
    "noMatchBody": "Try a different status or plot type.",
    "clearFilters": "Clear filters",
    "plotsEmptyTitle": "No plots in this project yet",
    "plotsEmptyBody": "Plots appear here once the company adds them. Pick another project to see its plots.",
    "projectsLoadError": "Couldn't load projects. Check your connection and try again.",
    "plotsLoadError": "Couldn't load the plot grid. Check your connection and try again.",
    "plotsRefreshError": "Couldn't refresh the plot grid. Showing the last loaded plots; availability may be out of date.",
    "bookingsLoadError": "Couldn't load your bookings. Check your connection and try again.",
    "retryAction": "Try again",
    "bookingsEmptyTitle": "No bookings yet",
    "bookingsEmptyBody": "When the company books a plot for you, it appears here with its EMI schedule. Check the Availability tab to see which plots are open.",
    "viewAvailability": "View availability",
    "bookingsNote": "Bookings are shown newest first.",
    "bookingStatus": { "ACTIVE": "Active", "CONFIRMED": "Confirmed", "CANCELLED": "Cancelled" },
    "installmentStatus": { "PENDING": "Pending", "PAID": "Paid", "VOID": "Void" },
    "overdue": "Overdue",
    "overdueCount": "{{count}} overdue",
    "paidOfTotal": "{{paid}} paid of {{total}}",
    "dueAmount": "{{amount}} due",
    "fullyPaid": "Fully paid",
    "noFurtherDues": "No further dues",
    "buyerLine": "{{buyer}} · booked {{date}}",
    "buyerLabel": "Buyer: {{buyer}}",
    "facts": { "total": "Total", "paid": "Paid", "due": "Due", "installments": "Installments" },
    "column": { "no": "No.", "dueDate": "Due date", "amount": "Amount", "status": "Status", "paidOn": "Paid on" },
    "confirmedNote": "Booking confirmed. This plot is now yours as a completed sale.",
    "cancelledNote": "Booking cancelled. Unpaid installments were voided. The amount already paid stays on record.",
    "backToBookings": "Bookings",
    "progressLabel": "{{percent}}% paid",
    "previousPageAction": "Previous",
    "nextPageAction": "Next",
    "pageIndicator": "Page {{page}} of {{totalPages}}"
  },
```

Notes: `legend.cornerPlot` text intentionally follows unit 11's "Notched tiles are corner plots" so it matches the shared tile; the old keys (`tabAvailablePlots`, `projectPickerPlaceholder`, `selectProjectPrompt`, `plotsEmptyState`, `column*`, `emiScheduleTitle`, `emiSummary`, `bookingsEmptyState`) are dropped. `hi.json`: same block verbatim (English), keeping the file's other keys untouched.

Verify no dangling references and JSON validity:

```bash
grep -rn "plotBookings\.\(tabAvailablePlots\|projectPickerPlaceholder\|selectProjectPrompt\|plotsEmptyState\|column[A-Z]\|emiScheduleTitle\|emiSummary\|bookingsEmptyState\)" src/app
node -e "for (const f of ['en','hi']) JSON.parse(require('fs').readFileSync('src/assets/i18n/'+f+'.json','utf8')); console.log('ok')"
```

Expected: grep prints nothing; node prints `ok`. Also confirm `nav.plotBookings` is untouched in both files.

- [ ] **Step 5: Run the whole folder, then everything**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include='src/app/plot-bookings/**/*.spec.ts'` → PASS.
Run: `npx ng test --watch=false --browsers=ChromeHeadless` and `npx ng build` → both clean. If `app.routes.spec.ts` or a sidebar spec referenced the old tab ids/keys, fix the spec, not the implementation.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): Plot Bookings becomes a two-tab view-only screen — availability grid and my bookings (unit 13)"
```

---

### Task 5: Real-app verification and tracking

- [ ] **Step 1: Run the app (per the `run` skill)**, log in as an associate who has bookings (seed via an admin booking on a plot if none: `POST /api/admin/bookings`), and check at 1280px, 900px and 390px:
  - Availability: seal figure equals the Available chip count; chips/type filter/Clear filters; tile click opens the popover with exact INR price and the contact hint, nothing about buyers; Esc closes and focus returns to the tile; switching project resets filters.
  - My bookings: newest first; overdue badge only on cards that have overdue pending installments; cancelled card struck with "No further dues"; selecting a card shows the schedule with no network request (check the network panel); below 960px the detail is a full-screen sheet with Back; below 768px installments are stacked label/value cards.
  - An admin token hitting `/plot-bookings` is still redirected by `associateOnlyGuard`.
  - Take screenshots and compare to `screen.png`, `screen-bookings.png`, `screen-mobile*.png`; differences beyond Deviations 1–3 are bugs.

- [ ] **Step 2: Commit any fixes found, then tracking (coordinator, after merge)** — update row 13 of `docs/superpowers/plans/2026-10-01-plot-booking-units.md`: plan path `2026-10-03-plot-booking-unit-13-associate-availability-bookings-screen.md`, status `merged`, commit range. Carry-forward note for unit 14: once the booking response carries `plotNo`/`projectName`, `plotLabel()` and the detail's project line light up with no frontend change (the `Booking` model already has the optional fields).

---

## Self-Review

**Spec coverage** (units-file row 13):
- View-only grid (plot number, type, area, price, status) from unit 10, no buyer/booking data → Task 2 (leak-guard spec + popover spec + no-write-controls spec).
- Existing Plot Bookings screen shows booking status, paid/due amounts, and overdue badges per installment (unit 1) → Task 3.
- No write affordance anywhere → pinned in Tasks 2 and 3 specs and in Global Constraints.
- Component/service specs, no e2e → Tasks 1–4.
- DESIGN states: loading (skeletons), empty (both tabs), error (both tabs), partial/stale grid, no-match + Clear filters, project-switch reset, 0-overdue hides badge, `dueAmount=0` copy, cancelled/confirmed notes, out-of-order payments (rendered in given order), 404 unknown project (surfaces as the grid error banner) → all covered by tests in Tasks 2–3 except 404, which shares the error-path test.
- Cut/changed items are listed under Deviations 1–6.

**Placeholder scan:** none; every step has full code or an exact command.

**Type consistency:** `PlotGridItem`, `StatusCounts`, `PlotBlock` come from unit 11's `plot-grid.util`; `Booking`/`EmiInstallment`/`AssociateBookingPage` come from the existing model (extended with optional `plotNo`, `projectName`); helper names `paidPercent`/`overdueCount`/`plotLabel`/`isOverdueRow` are defined in Task 1 and used with the same names in Task 3. `PlotBookingsComponent.activeTab` values (`'availability' | 'myBookings'`) match the tab ids and the host spec. The old `listPlots` method is removed in Task 1 and has no remaining caller once the old host is rewritten in Task 4 (between those tasks the old host spec/component won't compile — Task 1 runs only its own two specs, and Tasks 2–3 only their own; the full suite is first run in Task 4).

**Known risk:** the shared tile's `selected` input and `data-plot-id` host attribute are assumed from unit 11's plan (Task 2 there). If unit 11 shipped different names, adjust Task 2's template here — the specs will fail loudly on the first run.
