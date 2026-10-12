# Plot-Booking Reference-Gap U8 — Associate Defects (#21-24) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. TDD: write the spec, watch it fail, implement, watch it pass. **Do NOT edit any tracking file** (`*-units.md`, `spec-cycle-status.md`); the coordinator does that.
>
> **Worktree base:** this plan must be committed on master before dispatch. In a worktree run `git log --oneline -1 -- docs/superpowers/plans/2026-10-12-plot-booking-ref-gap-unit-8-associate-defects.md`; if empty, run `git merge --ff-only master` first. Never `cd` into another worktree.

**Goal:** Fix the four associate-side UI defects from the reference-gap audit: admin wording in the View Plot empty state (#21), raw UUID / unformatted amounts in My Sales (#22), unstyled Team/Left/Right tables plus the unrouted My Bookings page (#23), and the missing "Select project" prompt in View Plot (#24).

**Architecture:** Frontend only; no backend change (see Decision 1). One early shared-files task (i18n + routes + nav) so the four screen tasks touch disjoint files and run in parallel. My Sales and Team get a register-style table in their own lazy `ViewEncapsulation.None` SCSS under new BEM prefixes; both use the shared `app-pager`. `_admin.scss` is not touched.

**Tech Stack:** Angular 18 standalone, `@ngx-translate`, Karma/Jasmine (`HttpClientTestingModule` / `provideHttpClientTesting`), RxJS.

**Spec:** parent plan `docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md` (U8 + "Design rules"), `/DESIGN.md`, `docs/design/plot-booking-vs-reference-video.md` (differences #21-24), U5/U6/U7 plans in this directory (conventions).

Working dir for every frontend command: `/Users/ronalisenapati/Ronali/plotchain/frontend`. Targeted run: `npx ng test --watch=false --browsers=ChromeHeadless --include=<spec path relative to frontend/>`.

## Global Constraints

- Tokens only, **no hex literals / no rgba shadows** in new SCSS. Table look = register look: header `font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted)`; cells `border-top: 1px solid var(--border-subtle)`; amounts/IDs `var(--font-mono)` + `font-variant-numeric: tabular-nums`, right-aligned for money; `<768px` header hidden and each `td` stacked with `content: attr(data-label)`. Card = 1px `--border-subtle` border, `--surface-card`, no shadow/gradient/animation. No seal card on these screens. Material Symbols Outlined only.
- Per-screen BEM prefixes: `.my-sales` (sales-history), `.team-bookings` (team-plot-bookings). Each in a NEW component `.scss` via `styleUrl` + `encapsulation: ViewEncapsulation.None`. **Do not touch `frontend/src/styles/_admin.scss`** (bundle budget). Each new SCSS < 2000 B (component-style budget warn 2 kB / error 4 kB). Neither component keeps an inline `styles: [...]` block.
- Currency: `formatInr` from `shared/utils/plot-grid.util.ts` (Intl INR, en-IN) is the app's money formatter; reuse it, do not add a pipe.
- Pagination: shared `app-pager` (`shared/components/pager/pager.component.ts`; inputs `page` (0-based), `size`, `total`, `disabled`; output `pageChange`). No hand-rolled pager remains in the two screens.
- Associate-only: new route uses `canActivate: [authGuard, associateOnlyGuard]` like every sibling `plot-bookings/*` route. No new write path; no endpoint change.
- i18n: every key in BOTH `src/assets/i18n/en.json` and `hi.json` (hi mirrors English, existing practice). No key added without a consumer; no key left unused (final grep in Task 6).
- No `window.confirm/alert`; no new npm dependency; keep every existing spec green.

## Review Focus

1. **Wrong ID shown in My Sales:** `Sale.associateId` is the associate row UUID; the human ID is `Sale.associateUserId` (e.g. `VP00001`), name is `Sale.associateName`. Either may be `null` (deleted/legacy associate) -> render an em dash, never `null`/`undefined`/UUID (Task 3).
2. **Raw number leaks:** `amount` 0, large (`15000000`) and decimal values must all pass through `formatInr` (Task 3).
3. **Team rows with blanked fields:** the team endpoint blanks `buyerPhone`, `rate`, `listPrice`, `areaSqft`; the new table must not show phone/rate columns or `undefined`. `plotNo`/`projectName`/`associateName` null -> em dash (Task 4).
4. **Pager vs. scope switch / stale pages:** `app-pager` must be disabled while loading and the existing stale-response guard (`p !== requestedPage || scope !== scope`) must survive the rewrite (Task 4).
5. **Mobile stacking:** every `td` has `data-label` (translated) or the <768px layout shows unlabeled values (Tasks 3, 4 assert it).
6. **Routed My Bookings dead button:** the empty-state "View availability" button emits to a host that no longer exists when routed; it must navigate to `/plot-bookings` instead of doing nothing (Task 2). Also: only one `<h1>` on the page.
7. **View Plot empty projects / placeholder:** with 2+ projects an associate must not silently land on an empty project (the Boring Road complaint); with exactly one project it auto-selects (no useless prompt); admin behaviour is unchanged (Task 5).

## Decisions

1. **No backend task.** `SaleResponse` already carries `associateUserId` + `associateName` (resolved in `SaleService` batch lookups; `Sale` model already has both fields) and U3 fixed the `getMyBookings` size clamp. The parent plan's "bind to associateId" wording is superseded: the UUID `associateId` column is dropped, `associateUserId` is the human ID. No `SecurityConfig` change (`/api/associates/me/**` already associate-scoped).
2. **My Sales leaves `app-editable-table`.** The shared table is text-only (no per-cell alignment/data-label), so My Sales gets its own `<table class="my-sales__table">` in `sales-history.component.scss`. This also deletes the `translate.get()` column-building / `onLangChange` plumbing: headers are plain `| translate` in the template (reactive by default). Columns: Buyer, Phone, Amount, Associate ID, Associate, Leg, Status, Recorded at. Status and Leg stay raw codes as today (out of scope).
3. **Associate ID/name labels:** reuse the existing `salesHistory.columnAssociateId` (text changed to "Associate ID") and add `salesHistory.columnAssociateName` ("Associate"). The three `salesHistory` hand-rolled pager keys are deleted (`previousPageAction`, `nextPageAction`, `pageIndicator`) because `app-pager` brings its own `shared.pager.*`. `plotBookings.previousPageAction/nextPageAction/pageIndicator` stay (still used by `my-bookings.component.ts`).
4. **Team table rewrite** keeps the same 8 columns and the same translated headers (`plotBookings.team.column.*`); only markup/styling/pager change. Money via `formatInr`, dates `date: 'mediumDate'`, status via `plotBookings.bookingStatus.*`.
5. **My Bookings route:** `{ path: 'plot-bookings/mine', loadComponent: ...MyBookingsComponent, canActivate: [authGuard, associateOnlyGuard] }`, lazy (keeps the initial bundle under budget), placed with the other `plot-bookings/*` routes (no `plot-bookings/:id` route exists, so order is not significant). Nav: new child `{ key: 'myBookings', labelKey: 'nav.myBookings', path: '/plot-bookings/mine' }` inserted **before `mySales`** (order: View Plot, Team, Left, Right, My Bookings, My Sales) so the associate's own pages sit together at the end.
   - `MyBookingsComponent` is styled today by `.my-bookings` rules in `_admin.scss` (global), so no new SCSS. It gains `@Input() heading = true` rendering `<h1 class="my-bookings__title">{{ 'plotBookings.myBookings.title' | translate }}</h1>`; the (orphaned, unrouted) `PlotBookingsComponent` host passes `[heading]="false"` because it already owns an `<h1>`. The empty-state button calls `onViewAvailability()`: if `viewAvailability.observed` it emits (host usage unchanged), else `router.navigate(['/plot-bookings'])`. (Open question 1 recommends deleting the orphan host later.)
6. **View Plot (#21):** read-only mode uses new associate keys for both empty states ("no projects" and "no plots"); admin keys/wording unchanged.
7. **View Plot (#24):** in read-only mode, when the project list has **more than one** project, nothing is auto-selected: a disabled `value=""` option "Select project" is shown and selected, and the main area shows a one-line prompt. With exactly one project it still auto-selects (placeholder option rendered only when `!selectedProject`). Admin keeps auto-selecting the first project (no placeholder), so no admin spec changes. The master list buttons (desktop) are unaffected.

## File map

| File | Task |
|---|---|
| `src/assets/i18n/en.json`, `hi.json`, `src/app/app.routes.ts`, `app.routes.spec.ts`, `associate-nav-items.model.ts`, new `associate-nav-items.model.spec.ts`, `shared/components/associate-sidebar/associate-sidebar.component.spec.ts` | 1 |
| `plot-bookings/my-bookings.component.ts/.spec.ts`, `plot-bookings/plot-bookings.component.ts` (+ its spec if it asserts the h1) | 2 |
| `sales-history/sales-history.component.ts/.spec.ts`, new `sales-history/sales-history.component.scss` | 3 |
| `plot-bookings/team-plot-bookings.component.ts/.spec.ts`, new `plot-bookings/team-plot-bookings.component.scss` | 4 |
| `admin/projects-plots/projects-plots.component.ts/.spec.ts` | 5 |
| none (verification) | 6 |

(Paths are under `frontend/src/app/` unless starting with `src/`.)

## Task map and parallelism

| # | Task | Depends on |
|---|------|-----------|
| 1 | i18n (en+hi) + route + nav item + route/nav/sidebar specs | none |
| 2 | Routed My Bookings (heading input, navigate fallback) | 1 (route/key) |
| 3 | My Sales: associate ID/name, formatInr, `.my-sales`, pager | 1 (keys) |
| 4 | Team pages: register table, `.team-bookings`, pager | 1 (keys) |
| 5 | View Plot: associate empty-state copy + "Select project" | 1 (keys) |
| 6 | Full ng test + ng build + manual checklist | 2-5 |

**Shared files:** `en.json`/`hi.json`, `app.routes.ts`, `associate-nav-items.model.ts` are edited **only in Task 1**, which is why it is first and sequential. After Task 1 merges, **Tasks 2, 3, 4, 5 touch pairwise-disjoint files and can run in parallel worktrees.** (Specs use `TranslateModule.forRoot()` with keys-as-text or register their own translations, so they do not read the JSON; Tasks 2-5 could even start before Task 1 merges, but they must rebase on it before Task 6.) Task 6 last.

---

### Task 1: i18n keys, route, nav item

**Files:** Modify `frontend/src/assets/i18n/en.json`, `hi.json`, `frontend/src/app/app.routes.ts`, `app.routes.spec.ts`, `associate-nav-items.model.ts`, `shared/components/associate-sidebar/associate-sidebar.component.spec.ts`; Create `frontend/src/app/associate-nav-items.model.spec.ts`.

**Interfaces:**
- Produces: route `plot-bookings/mine`; nav child key `myBookings`; the i18n keys below (consumers in parentheses).

Keys (exact; hi value = English text):
- `nav.myBookings` "My Bookings" (nav model).
- `plotBookings.myBookings.title` "My Bookings" (Task 2).
- `salesHistory.columnAssociateName` "Associate" (Task 3); **change text** of `salesHistory.columnAssociateId` to "Associate ID" (Task 3); **delete** `salesHistory.previousPageAction`, `salesHistory.nextPageAction`, `salesHistory.pageIndicator` (Task 3 stops using them).
- `admin.projectsPlots.empty.assocNoProjectsTitle` "No projects yet"; `assocNoProjectsBody` "Projects appear here once the company adds them."; `assocNoPlotsTitle` "No plots listed for this project yet"; `assocNoPlotsBody` "Plots appear here once the company adds them. Pick another project to see its plots."; `selectProjectPrompt` "Select a project to see its plots." (Task 5).
- `admin.projectsPlots.projectPlaceholder` "Select project" (Task 5).

- [ ] **Step 1: Write failing specs.**

In `app.routes.spec.ts`, after the `my-sales` guard test:

```ts
  it('guards the my-bookings route with authGuard and associateOnlyGuard, lazily', () => {
    const route = routes.find(r => r.path === 'plot-bookings/mine');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
    expect(route!.loadComponent).toBeDefined();
  });
```

Create `associate-nav-items.model.spec.ts`:

```ts
import { ASSOCIATE_NAV_ITEMS } from './associate-nav-items.model';

describe('ASSOCIATE_NAV_ITEMS', () => {
  const plotBookings = ASSOCIATE_NAV_ITEMS.find(i => i.key === 'plotBookings')!;

  it('lists My Bookings under Plot Bookings, before My Sales', () => {
    const keys = plotBookings.children!.map(c => c.key);
    expect(keys).toEqual(['viewPlot', 'teamPlots', 'leftPlots', 'rightPlots', 'myBookings', 'mySales']);
    const mine = plotBookings.children!.find(c => c.key === 'myBookings')!;
    expect(mine.path).toBe('/plot-bookings/mine');
    expect(mine.labelKey).toBe('nav.myBookings');
  });

  it('keeps every sub-item path inside its parent path', () => {
    for (const c of plotBookings.children!) {
      expect(c.path === plotBookings.path || c.path.startsWith(plotBookings.path + '/')).toBe(true);
    }
  });
});
```

In `associate-sidebar.component.spec.ts` add (same style as the My Account tests):

```ts
  it('renders the Plot Bookings sub-items including My Bookings when expanded', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.componentInstance.toggle('plotBookings');
    fixture.detectChanges();

    const hrefs = Array.from(fixture.nativeElement.querySelectorAll('.associate-sidebar__sublink') as NodeListOf<HTMLAnchorElement>)
      .map(a => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/plot-bookings', '/plot-bookings/team', '/plot-bookings/left', '/plot-bookings/right',
      '/plot-bookings/mine', '/plot-bookings/my-sales'
    ]);
  });
```

- [ ] **Step 2: Run, confirm FAIL.** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/app.routes.spec.ts --include=src/app/associate-nav-items.model.spec.ts --include=src/app/shared/components/associate-sidebar/associate-sidebar.component.spec.ts` -> 3 new specs fail.
- [ ] **Step 3: Implement.** `app.routes.ts` after the `plot-bookings/right` line:

```ts
  { path: 'plot-bookings/mine', loadComponent: () => import('./plot-bookings/my-bookings.component').then(m => m.MyBookingsComponent), canActivate: [authGuard, associateOnlyGuard] },
```

`associate-nav-items.model.ts`: insert `{ key: 'myBookings', labelKey: 'nav.myBookings', path: '/plot-bookings/mine' },` between `rightPlots` and `mySales`. Add/change/delete the i18n keys listed above in both JSON files.
- [ ] **Step 4: Validate JSON + parity.** `node -e "for (const f of ['en','hi']) JSON.parse(require('fs').readFileSync('src/assets/i18n/'+f+'.json','utf8'))"` (no output), and parity: `node -e "const k=(o,p='')=>Object.entries(o).flatMap(([a,b])=>typeof b==='object'?k(b,p+a+'.'):[p+a]); const e=k(require('./src/assets/i18n/en.json')),h=k(require('./src/assets/i18n/hi.json')); console.log(e.filter(x=>!h.includes(x)),h.filter(x=>!e.includes(x)))"` -> `[] []`.
- [ ] **Step 5: Re-run the three specs: PASS.** Also run `--include=src/app/app.component.spec.ts` (it stubs `nav.*`; must stay green).
- [ ] **Step 6: Commit.** `git add frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts frontend/src/app/associate-nav-items.model.ts frontend/src/app/associate-nav-items.model.spec.ts frontend/src/app/shared/components/associate-sidebar/associate-sidebar.component.spec.ts && git commit -m "feat(associate): My Bookings route + nav item and U8 i18n keys"`

### Task 2: Routed My Bookings (heading + navigate fallback)

**Files:** Modify `frontend/src/app/plot-bookings/my-bookings.component.ts`, `my-bookings.component.spec.ts`, `plot-bookings.component.ts`.

**Interfaces:** Produces `MyBookingsComponent.heading: boolean` (`@Input`, default `true`) and `onViewAvailability(): void`. Consumes `plotBookings.myBookings.title` (Task 1).

- [ ] **Step 1: Write failing specs** in `my-bookings.component.spec.ts` (reuse its existing `TestBed` setup/boot helper; add `provideRouter([])` to providers if absent and `import { Router } from '@angular/router';`). Use its existing way of flushing an empty page (`{ bookings: [], page: 0, size: 20, totalElements: 0 }`):

```ts
  it('renders a single page heading when routed (heading defaults on)', () => {
    const fixture = boot({ bookings: [], page: 0, size: 20, totalElements: 0 });
    const h1 = fixture.nativeElement.querySelectorAll('h1.my-bookings__title');
    expect(h1.length).toBe(1);
    expect(h1[0].textContent).toContain('plotBookings.myBookings.title');
  });

  it('omits the heading when a host owns it', () => {
    const fixture = boot({ bookings: [], page: 0, size: 20, totalElements: 0 }, c => (c.heading = false));
    expect(fixture.nativeElement.querySelector('h1')).toBeNull();
  });

  it('navigates to View Plot from the empty state when nothing listens to viewAvailability', () => {
    const fixture = boot({ bookings: [], page: 0, size: 20, totalElements: 0 });
    const nav = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.nativeElement.querySelector('.my-bookings__view-availability').click();
    expect(nav).toHaveBeenCalledWith(['/plot-bookings']);
  });

  it('emits viewAvailability instead of navigating when a host subscribes', () => {
    const fixture = boot({ bookings: [], page: 0, size: 20, totalElements: 0 });
    const nav = spyOn(TestBed.inject(Router), 'navigate');
    let emitted = 0;
    fixture.componentInstance.viewAvailability.subscribe(() => emitted++);
    fixture.nativeElement.querySelector('.my-bookings__view-availability').click();
    expect(emitted).toBe(1);
    expect(nav).not.toHaveBeenCalled();
  });
```

(If the spec has no `boot(page, configure?)` helper, create one in the describe: create the fixture, apply `configure(fixture.componentInstance)`, `detectChanges()`, flush the `getMyBookings` request with the page, `detectChanges()`, return the fixture. Match the file's existing HTTP test pattern.)
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/plot-bookings/my-bookings.component.spec.ts` -> new specs FAIL.
- [ ] **Step 3: Implement.** In `my-bookings.component.ts`: import `Input`, `Router`; `private router = inject(Router);` `@Input() heading = true;`. Template, first child inside `<div class="my-bookings" ...>`: `<h1 class="my-bookings__title" *ngIf="heading">{{ 'plotBookings.myBookings.title' | translate }}</h1>`. Change the button's `(click)` to `onViewAvailability()` and add:

```ts
  onViewAvailability(): void {
    if (this.viewAvailability.observed) { this.viewAvailability.emit(); } else { void this.router.navigate(['/plot-bookings']); }
  }
```

In `plot-bookings.component.ts` change the tag to `<app-my-bookings [heading]="false" *ngIf="activeTab === 'myBookings'" (viewAvailability)="onTabChange('availability')">`. `.my-bookings__title` needs no CSS (inherits the global `h1` rule); do not add `_admin.scss` rules.
- [ ] **Step 4: Run** the my-bookings spec and `--include=src/app/plot-bookings/plot-bookings.component.spec.ts` -> PASS.
- [ ] **Step 5: Commit** `git add frontend/src/app/plot-bookings/my-bookings.component.ts frontend/src/app/plot-bookings/my-bookings.component.spec.ts frontend/src/app/plot-bookings/plot-bookings.component.ts && git commit -m "feat(my-bookings): routed page heading and navigate fallback"`

### Task 3: My Sales — associate ID/name, INR amounts, `.my-sales`, pager

**Files:** Modify `frontend/src/app/sales-history/sales-history.component.ts`, `sales-history.component.spec.ts`; Create `frontend/src/app/sales-history/sales-history.component.scss`.

**Interfaces:** Consumes `Sale.associateUserId/associateName` (already on `admin/models/sale.model.ts`), `formatInr`, `PagerComponent`, keys from Task 1.

- [ ] **Step 1: Rewrite the spec** (`sales-history.component.spec.ts`). Keep the existing translation-registration and `expectOne('/api/associates/me/sales?page=0&size=20')` boot pattern; update `enTranslations.salesHistory` to the new key set (`columnAssociateId: 'Associate ID'`, add `columnAssociateName: 'Associate'`, drop the 3 pager keys) and add `shared: { pager: { label: 'Pagination', previous: 'Previous', next: 'Next', summary: '{{from}}-{{to}} of {{total}}' } }`. Flush a sale `{ id:'s1', plotId:'p1', associateId:'11111111-uuid', associateUserId:'VP00001', associateName:'Ravi Kumar', buyerName:'Jane', buyerPhone:'9999999999', buyerEmail:null, amount:1500000, cycleId:'c1', legCredited:'L', status:'RECORDED', voidReason:null, recordedAt:'2026-01-01T00:00:00Z', plotNo:null, projectName:null, note:'' }` and add:

```ts
  it('shows the associate login ID and name, never the row UUID', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('VP00001');
    expect(text).toContain('Ravi Kumar');
    expect(text).not.toContain('11111111-uuid');
  });

  it('formats the amount with the app INR formatter', () => {
    const cell = fixture.nativeElement.querySelector('.my-sales__num[data-label="Amount"]');
    expect(cell.textContent.trim()).toBe(formatInr(1500000));
    expect(cell.textContent).not.toBe('1500000');
  });

  it('renders an em dash when the associate ID or name is missing', () => {
    // reload page 0 with associateUserId: null, associateName: null (use the component's goToPage(0) + expectOne flush)
    expect(fixture.nativeElement.querySelector('.my-sales__id').textContent.trim()).toBe('—');
    expect(fixture.nativeElement.querySelector('.my-sales__name').textContent.trim()).toBe('—');
  });

  it('gives every cell a translated data-label for the stacked mobile layout', () => {
    const cells = fixture.nativeElement.querySelectorAll('.my-sales__table tbody td');
    expect(cells.length).toBe(8);
    cells.forEach((td: HTMLElement) => expect(td.getAttribute('data-label')).toBeTruthy());
  });

  it('uses the shared pager and no hand-rolled one', () => {
    expect(fixture.nativeElement.querySelector('app-pager')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.sales-history__pagination')).toBeNull();
  });

  it('requests the next page when the pager emits', () => {
    fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.pageChange.emit(1);
    httpMock.expectOne('/api/associates/me/sales?page=1&size=20').flush({ sales: [], page: 1, size: 20, totalElements: 25 });
  });

  it('shows the empty state when there are no sales', () => { /* flush sales: [] page; expect '.my-sales__empty' text 'No sales to show yet.' and no table */ });
```

Imports needed: `formatInr` (`../shared/utils/plot-grid.util`), `By` (`@angular/platform-browser`), `PagerComponent`. Write the two commented-body specs out fully (the pager one needs a `totalElements > size` first page so the pager renders: boot with `totalElements: 25`). Delete specs that assert the old column labels via `app-editable-table`/`onLangChange`; keep one language-switch spec that switches to `fr` and asserts a translated header (`Acheteur`) now appears via the template.
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/sales-history/sales-history.component.spec.ts` -> FAIL.
- [ ] **Step 3: Implement the component.** Imports: `CommonModule, TranslateModule, InlineBannerComponent?` (not needed; keep the existing `<p class="my-sales__load-error" role="alert">`), `PagerComponent`; add `encapsulation: ViewEncapsulation.None, styleUrl: './sales-history.component.scss'`; drop `EditableTableComponent`, `DatePipe` provider, `TranslateService`, `OnDestroy/Subject`, `buildColumns`, `historyColumns/historyRows`, `updateTableRows`, `currentPage/totalPages`. Keep `page`, `loadError`, `goToPage`, `loadPage`, `PAGE_SIZE = 20`, `money = formatInr`. Template:

```html
<div class="my-sales card" [attr.aria-busy]="!page && !loadError">
  <h1 class="card-title">{{ 'salesHistory.title' | translate }}</h1>
  <p class="my-sales__subtitle">{{ 'salesHistory.subtitle' | translate }}</p>
  <p *ngIf="loadError" class="my-sales__load-error" role="alert">{{ 'salesHistory.loadError' | translate }}</p>
  <p *ngIf="page && !page.sales.length" class="my-sales__empty" role="status">{{ 'salesHistory.emptyState' | translate }}</p>
  <div class="my-sales__scroll" *ngIf="page?.sales?.length">
    <table class="my-sales__table" [attr.aria-label]="'salesHistory.title' | translate">
      <thead><tr>
        <th scope="col">{{ 'salesHistory.columnBuyerName' | translate }}</th>
        <th scope="col">{{ 'salesHistory.columnBuyerPhone' | translate }}</th>
        <th scope="col" class="my-sales__num">{{ 'salesHistory.columnAmount' | translate }}</th>
        <th scope="col">{{ 'salesHistory.columnAssociateId' | translate }}</th>
        <th scope="col">{{ 'salesHistory.columnAssociateName' | translate }}</th>
        <th scope="col">{{ 'salesHistory.columnLegCredited' | translate }}</th>
        <th scope="col">{{ 'salesHistory.columnStatus' | translate }}</th>
        <th scope="col">{{ 'salesHistory.columnRecordedAt' | translate }}</th>
      </tr></thead>
      <tbody>
        <tr *ngFor="let s of page!.sales">
          <td [attr.data-label]="'salesHistory.columnBuyerName' | translate">{{ s.buyerName }}</td>
          <td class="my-sales__mono" [attr.data-label]="'salesHistory.columnBuyerPhone' | translate">{{ s.buyerPhone || '—' }}</td>
          <td class="my-sales__num" [attr.data-label]="'salesHistory.columnAmount' | translate">{{ money(s.amount) }}</td>
          <td class="my-sales__mono my-sales__id" [attr.data-label]="'salesHistory.columnAssociateId' | translate">{{ s.associateUserId || '—' }}</td>
          <td class="my-sales__name" [attr.data-label]="'salesHistory.columnAssociateName' | translate">{{ s.associateName || '—' }}</td>
          <td [attr.data-label]="'salesHistory.columnLegCredited' | translate">{{ s.legCredited }}</td>
          <td [attr.data-label]="'salesHistory.columnStatus' | translate">{{ s.status }}</td>
          <td class="my-sales__mono" [attr.data-label]="'salesHistory.columnRecordedAt' | translate">{{ s.recordedAt | date: 'medium' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
  <app-pager *ngIf="page" [page]="page.page" [size]="page.size" [total]="page.totalElements" (pageChange)="goToPage($event)"></app-pager>
</div>
```

(Note the Amount cell: the spec selector `.my-sales__num[data-label="Amount"]` matches the `td`, not the `th` which has no `data-label`.) `sales-history.component.scss` (tokens only, < 2 kB):

```scss
.my-sales {
  &__subtitle { color: var(--text-muted); margin: 0 0 1rem; }
  &__load-error { color: var(--status-danger); }
  &__empty { padding: 2rem 1rem; text-align: center; color: var(--text-muted); }
  &__scroll { overflow-x: auto; }
  &__table { width: 100%; border-collapse: collapse;
    th { text-align: left; padding: 0.75rem 0.5rem; font: 500 0.6875rem var(--font-mono); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }
    td { padding: 0.75rem 0.5rem; border-top: 1px solid var(--border-subtle); vertical-align: top; } }
  &__num { text-align: right; white-space: nowrap; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  &__mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
}
@media (max-width: 768px) {
  .my-sales__table thead { display: none; }
  .my-sales__table tr { display: block; padding: 0.5rem 0; border-top: 1px solid var(--border-subtle); }
  .my-sales__table td { display: flex; justify-content: space-between; gap: 1rem; border: 0; padding: 0.25rem 0; text-align: right; }
  .my-sales__table td::before { content: attr(data-label); font: 500 0.6875rem var(--font-mono); text-transform: uppercase; color: var(--text-muted); text-align: left; }
}
```

- [ ] **Step 4: Run** the sales-history spec and `--include=src/app/sales-history/sales-history.service.spec.ts` -> PASS. Also `--include=src/app/dashboard/widgets/recent-sales-table/recent-sales-table.component.spec.ts` (shares `salesHistory.*` keys; must stay green).
- [ ] **Step 5: Commit** `git add frontend/src/app/sales-history/sales-history.component.ts frontend/src/app/sales-history/sales-history.component.spec.ts frontend/src/app/sales-history/sales-history.component.scss && git commit -m "feat(my-sales): associate ID/name, INR amounts, register table and shared pager"`

### Task 4: Team / Left / Right — register table, `.team-bookings`, shared pager

**Files:** Modify `frontend/src/app/plot-bookings/team-plot-bookings.component.ts`, `team-plot-bookings.component.spec.ts`; Create `frontend/src/app/plot-bookings/team-plot-bookings.component.scss`.

**Interfaces:** Consumes `PagerComponent`, `formatInr`, existing `plotBookings.team.*` keys. Produces no new keys.

- [ ] **Step 1: Add failing specs** to the existing spec file (keep the two existing specs untouched). Add a helper `const bookings = { bookings: [{ id:'b1', plotNo:'A-1', projectName:'Green', associateName:'Ravi', buyerName:'Jane', bookedAt:'2026-01-01T00:00:00Z', totalAmount:1500000, paidAmount:100000, status:'ACTIVE', installments:[] }, { id:'b2', plotNo:null, projectName:null, associateName:null, buyerName:'Raj', bookedAt:'2026-01-02T00:00:00Z', totalAmount:0, paidAmount:0, status:'CANCELLED', installments:[] }], page: 0, size: 20, totalElements: 45 };` and a `boot()` that creates the fixture, flushes it, `detectChanges()`:

```ts
  it('renders the register-style table with labeled cells', () => {
    const fixture = boot();
    const table = fixture.nativeElement.querySelector('table.team-bookings__table');
    expect(table).toBeTruthy();
    expect(table.querySelectorAll('thead th[scope="col"]').length).toBe(8);
    table.querySelectorAll('tbody td').forEach((td: HTMLElement) => expect(td.getAttribute('data-label')).toBeTruthy());
  });

  it('formats money with formatInr and shows em dashes for missing plot/project/associate', () => {
    const fixture = boot();
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain(formatInr(1500000));
    expect(rows[1].textContent).toContain('—');
    expect(fixture.nativeElement.textContent).not.toMatch(/undefined|null/);
  });

  it('exposes no buyer phone or rate column (the endpoint blanks them)', () => {
    const fixture = boot();
    expect(fixture.nativeElement.textContent).not.toContain('plotBookings.team.column.phone');
    expect(fixture.nativeElement.querySelectorAll('thead th').length).toBe(8);
  });

  it('uses the shared pager and loads the requested page', () => {
    const fixture = boot();
    expect(fixture.nativeElement.querySelector('.team-bookings__pager')).toBeNull();
    fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.pageChange.emit(1);
    expect(http.expectOne(r => r.url === '/api/associates/me/team-bookings').request.params.get('page')).toBe('1');
  });

  it('disables the pager while a page is loading', () => {
    const fixture = boot();
    fixture.componentInstance.load(1);
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.disabled).toBe(true);
    http.expectOne(r => r.url === '/api/associates/me/team-bookings'); // outstanding request consumed
  });

  it('ignores a stale response after the leg changed', () => {
    const fixture = boot();
    fixture.componentInstance.load(1);
    data$.next({ scope: 'RIGHT' });
    const reqs = http.match(r => r.url === '/api/associates/me/team-bookings');
    reqs[0].flush({ ...bookings, page: 1 });              // stale (LEFT, page 1)
    reqs[1].flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });
```

`boot()` creates the fixture, `detectChanges()`, `http.expectOne(...).flush(bookings)`, `detectChanges()` and returns it. Imports: `By`, `PagerComponent`, `formatInr`.
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/plot-bookings/team-plot-bookings.component.spec.ts` -> new specs FAIL.
- [ ] **Step 3: Implement.** Component: add `encapsulation: ViewEncapsulation.None, styleUrl: './team-plot-bookings.component.scss'`, remove the inline `styles`, add `PagerComponent` to `imports`, drop the `totalPages` getter. Replace the table block with:

```html
<div class="team-bookings__scroll" *ngIf="page?.bookings?.length">
  <table class="team-bookings__table" [attr.aria-label]="'plotBookings.team.title.' + scope | translate">
    <thead><tr>
      <th scope="col">{{ 'plotBookings.team.column.plot' | translate }}</th>
      <th scope="col">{{ 'plotBookings.team.column.project' | translate }}</th>
      <th scope="col">{{ 'plotBookings.team.column.associate' | translate }}</th>
      <th scope="col">{{ 'plotBookings.team.column.buyer' | translate }}</th>
      <th scope="col">{{ 'plotBookings.team.column.bookedOn' | translate }}</th>
      <th scope="col" class="team-bookings__num">{{ 'plotBookings.team.column.total' | translate }}</th>
      <th scope="col" class="team-bookings__num">{{ 'plotBookings.team.column.paid' | translate }}</th>
      <th scope="col">{{ 'plotBookings.team.column.status' | translate }}</th>
    </tr></thead>
    <tbody>
      <tr *ngFor="let b of page!.bookings">
        <td class="team-bookings__mono" [attr.data-label]="'plotBookings.team.column.plot' | translate">{{ b.plotNo || '—' }}</td>
        <td [attr.data-label]="'plotBookings.team.column.project' | translate">{{ b.projectName || '—' }}</td>
        <td [attr.data-label]="'plotBookings.team.column.associate' | translate">{{ b.associateName || '—' }}</td>
        <td [attr.data-label]="'plotBookings.team.column.buyer' | translate"><strong>{{ b.buyerName }}</strong></td>
        <td class="team-bookings__mono" [attr.data-label]="'plotBookings.team.column.bookedOn' | translate">{{ b.bookedAt | date: 'mediumDate' }}</td>
        <td class="team-bookings__num" [attr.data-label]="'plotBookings.team.column.total' | translate">{{ money(b.totalAmount) }}</td>
        <td class="team-bookings__num" [attr.data-label]="'plotBookings.team.column.paid' | translate">{{ money(b.paidAmount) }}</td>
        <td [attr.data-label]="'plotBookings.team.column.status' | translate">{{ 'plotBookings.bookingStatus.' + b.status | translate }}</td>
      </tr>
    </tbody>
  </table>
</div>
<app-pager *ngIf="page" [page]="page.page" [size]="page.size" [total]="page.totalElements" [disabled]="loading" (pageChange)="load($event)"></app-pager>
```

(Wrap in the existing `<ng-container *ngIf="page?.bookings?.length">` if keeping it, with the pager inside; either way the pager must not render for an empty page.) Keep `load()`, `ngOnInit`, the stale guards and the banner/empty/loading paragraphs untouched. `team-plot-bookings.component.scss`: same rules as Task 3's SCSS with `.team-bookings` in place of `.my-sales` (`__scroll`, `__table` th/td, `__num`, `__mono`, and the <768px block); the `.team-bookings` root also gets `h1`/subtitle left to global styles. Remove the old `.team-bookings__pager` rule (it lived inline).
- [ ] **Step 4: Run** the team spec -> PASS.
- [ ] **Step 5: Commit** `git add frontend/src/app/plot-bookings/team-plot-bookings.component.ts frontend/src/app/plot-bookings/team-plot-bookings.component.spec.ts frontend/src/app/plot-bookings/team-plot-bookings.component.scss && git commit -m "feat(team-bookings): register-style table and shared pager"`

### Task 5: View Plot — associate empty-state copy and "Select project" placeholder

**Files:** Modify `frontend/src/app/admin/projects-plots/projects-plots.component.ts`, `projects-plots.component.spec.ts`.

**Interfaces:** Consumes keys from Task 1. Existing read-only spec block is near `projects-plots.component.spec.ts:948` (route stub `{ snapshot: { data: { readOnly: true } } }`); follow its boot style (flush `listProjects`, then the grid request).

- [ ] **Step 1: Write failing specs** in a new `describe('read-only (associate View Plot)', ...)` nested next to the existing read-only tests (reuse their boot helper; names below are what to assert):

```ts
  it('uses associate wording when there are no plots in the project', () => {
    // one project, grid flushes []
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('admin.projectsPlots.empty.assocNoPlotsTitle');
    expect(text).not.toContain('admin.projectsPlots.empty.noPlotsBody');
    expect(text).not.toContain('admin.projectsPlots.empty.noPlotsTitle');
  });

  it('uses associate wording when there are no projects', () => {
    // listProjects flushes []
    expect(fixture.nativeElement.textContent).toContain('admin.projectsPlots.empty.assocNoProjectsBody');
    expect(fixture.nativeElement.textContent).not.toContain('admin.projectsPlots.empty.noProjectsBody');
  });

  it('with several projects shows a Select project placeholder and loads nothing until chosen', () => {
    // listProjects flushes [p1, p2]
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('.projects-plots__project-select select');
    expect(select.options[0].value).toBe('');
    expect(select.options[0].disabled).toBe(true);
    expect(select.options[0].textContent).toContain('admin.projectsPlots.projectPlaceholder');
    expect(select.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain('admin.projectsPlots.empty.selectProjectPrompt');
    http.expectNone(r => r.url.includes('/plots/grid'));
    select.value = 'p2'; select.dispatchEvent(new Event('change'));
    http.expectOne('/api/projects/p2/plots/grid'); // use the exact URL the existing read-only specs expect
  });

  it('auto-selects the only project and renders no placeholder', () => {
    // listProjects flushes [p1]
    http.expectOne('/api/projects/p1/plots/grid');
    const select = fixture.nativeElement.querySelector('.projects-plots__project-select select') as HTMLSelectElement;
    expect(Array.from(select.options).some(o => o.value === '')).toBe(false);
  });
```

and, in the existing admin (non-read-only) describe, one guard spec: admin with 2 projects auto-selects the first (grid request for `p1` fires) and the select has no `value=""` option. Fill the commented bodies using the file's existing helpers/fixtures; replace the grid URL with whatever the neighbouring specs already `expectOne`. Any existing read-only spec that assumed the first of several projects auto-selects must be updated to select explicitly (note it in the commit message).
- [ ] **Step 2: Run** `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/admin/projects-plots/projects-plots.component.spec.ts` -> new specs FAIL.
- [ ] **Step 3: Implement.** (a) No-projects block: `<h2>{{ (readOnly ? 'admin.projectsPlots.empty.assocNoProjectsTitle' : 'admin.projectsPlots.empty.noProjectsTitle') | translate }}</h2>` and likewise `...assocNoProjectsBody` / `noProjectsBody` in the `<p>`. (b) No-plots block: same pattern with `assocNoPlotsTitle`/`noPlotsTitle` and `assocNoPlotsBody`/`noPlotsBody`. (c) Select: first child `<option value="" disabled [selected]="!selectedProject" *ngIf="!selectedProject">{{ 'admin.projectsPlots.projectPlaceholder' | translate }}</option>`. (d) Main-area prompt, a sibling of `<section class="projects-plots__main" *ngIf="selectedProject as sp">`: `<p class="projects-plots__empty" role="status" *ngIf="readOnly && !selectedProject && projects?.length">{{ 'admin.projectsPlots.empty.selectProjectPrompt' | translate }}</p>` (it must sit inside `.projects-plots__layout` so it lands beside the master list; check in the browser). (e) `reloadProjects`: replace `const next = list.find(p => p.id === keep) ?? list[0] ?? null;` with `const next = list.find(p => p.id === keep) ?? (this.readOnly && list.length > 1 ? null : list[0]) ?? null;` (when `next` is null `selectedProject` is assigned null by the existing else-branch; confirm `selectedProject` initialises to `null` so nothing else changes). Admin path is byte-for-byte the same.
- [ ] **Step 4: Run** the projects-plots spec (whole file) -> PASS.
- [ ] **Step 5: Commit** `git add frontend/src/app/admin/projects-plots/projects-plots.component.ts frontend/src/app/admin/projects-plots/projects-plots.component.spec.ts && git commit -m "fix(view-plot): associate empty-state copy and Select project prompt"`

### Task 6: Full verification and manual checklist

**Files:** none (fix-ups only to unit files).

- [ ] **Step 1: Unused-key sweep.** For each key added/deleted in Task 1, `grep -rn "<key>" frontend/src/app` must show a consumer (except `nav.myBookings`, `plotBookings.myBookings.title` consumers are the nav model and Task 2 template); `grep -rn "salesHistory.\(previousPageAction\|nextPageAction\|pageIndicator\)" frontend/src` -> no matches. Re-run the JSON parity one-liner from Task 1.
- [ ] **Step 2: No hex / no `_admin.scss` change.** `grep -nE "#[0-9a-fA-F]{3,8}\b" frontend/src/app/sales-history/sales-history.component.scss frontend/src/app/plot-bookings/team-plot-bookings.component.scss` -> none; `git diff --stat master -- frontend/src/styles/_admin.scss` -> empty.
- [ ] **Step 3: Full tests.** `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` -> all green.
- [ ] **Step 4: Build.** `npx ng build` -> succeeds; no new budget warnings (watch the 1 MB initial budget and the two new component styles < 2 kB).
- [ ] **Step 5: Manual checklist** (backend + DB up via the `run` skill; frontend on port 4201 since 4200 is TriageDesk; log in `VP00001` / `ChangeMe123!`; also try `admin` for the regression items):
  - View Plot (`/plot-bookings`): project dropdown (narrow window < 1024px) first shows "Select project"; main area says "Select a project to see its plots."; choosing an empty project shows "No plots listed for this project yet" with no "Add a plot manually / CSV template" text. Admin `/settings/projects-plots` still auto-selects the first project and keeps admin wording.
  - My Sales (`/plot-bookings/my-sales`): Associate ID `VP...` and name instead of a UUID; amounts as ₹15,00,000; register look (mono uppercase headers, borders only); pager shows "1-20 of N"; at 375px the table stacks with labels.
  - Team / Left / Right (`/plot-bookings/team|left|right`): same register look, no unstyled table, shared pager, switching between the three routes reloads and resets to page 1; stacked layout at 375px.
  - My Bookings: sidebar -> Plot Bookings now lists "My Bookings" before "My Sales"; `/plot-bookings/mine` loads the cards + EMI detail page with a single "My Bookings" heading; empty-state button (use an associate with no bookings) goes to View Plot; `admin` visiting `/plot-bookings/mine` is redirected by `associateOnlyGuard`.
  - Hindi toggle: all new labels appear (English text, by design); no raw keys visible anywhere above.
  - Screenshot My Sales and Team against DESIGN.md (Parchment, no shadows, gold/oxblood only on buttons).
- [ ] **Step 6:** If any fix-up was needed, commit it with the unit it belongs to (`git add <exact files>`), never `git add -A`.

## Self-review

- **Spec coverage:** #21 -> Task 5 (a,b); #22 -> Task 3; #23 -> Tasks 4 (table, pager, `.team-bookings`) and 1+2 (route, nav, specs incl. `app.routes.spec.ts`, nav-items spec, sidebar spec); #24 -> Task 5 (c,d,e). i18n en+hi, no unused keys -> Tasks 1 and 6. Tokens-only / `_admin.scss` untouched -> Global Constraints + Task 6 step 2.
- **Types/names:** `heading`, `onViewAvailability`, `.my-sales__*`, `.team-bookings__*`, `assocNo*`, `projectPlaceholder`, `selectProjectPrompt`, `columnAssociateName`, `myBookings.title`, `nav.myBookings` are used identically in Tasks 1-5.

## Open questions

1. `PlotBookingsComponent` (tab host: Availability + My bookings) is unrouted and now redundant with `/plot-bookings` + `/plot-bookings/mine`. Recommend a follow-up to delete it, `PlotAvailabilityComponent` (if also unrouted) and their keys; this unit only adds the `heading` input / `observed` fallback so it keeps compiling and passing.
2. #24 interpretation: placeholder + no auto-select when 2+ projects (chosen) vs. keep auto-select and merely add the option. Chosen because the audit complaint is landing on an empty project by default; revert point is one line in `reloadProjects`.
3. Associate nav `routerLinkActive` on `View Plot` (`/plot-bookings`): confirm it uses `exact` so it does not stay highlighted on `/plot-bookings/mine` (existing sibling routes share the issue, so assumed already handled; verify in the manual checklist).
4. Hindi strings remain English (existing practice); needs a translator pass later.
