# Associate "Rewards & Perks Progress" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give any authenticated Associate a read-only view of their own rank progress and reward-tier achievement, consuming the already-merged `GET /api/associates/me/rank-progress` endpoint (role-capability unit 9). This is role-capability unit 15 — see `docs/superpowers/plans/2026-08-03-role-capability-units.md` row 15, depends on unit 9 (merged `c0fbf10..fd53e02`).

**Architecture:** A new top-level Angular feature folder `frontend/src/app/rewards/` (sibling to `dashboard/`/`sales-history/`, not nested under `admin/`/`settings/` — those are admin-only conventions). The endpoint returns one object (not a page), so `RewardsComponent` follows `DashboardComponent`'s `*ngIf="x as d"` / bare `error` flag shape — not `SalesHistoryComponent`'s paginated-table shape, which exists only because *that* backend endpoint is paginated. Two visual pieces:

1. **Rank progress bar** — same visual language as `dashboard/widgets/rank-progress/rank-progress.component.ts` (current rank name, a filled bar, next-rank label), but **not** a cross-import of that component. `AssociateRankProgressResponse` (this unit's payload) is a superset of `DashboardResponse.RankProgress` (adds `cumulativeMatchedVolume` and `rewardTiers`), so passing it into `RankProgressComponent`'s `data: RankProgress` input would work structurally, but doing so would make the `rewards` feature depend on the `dashboard` feature for a five-line piece of markup — this codebase already has a documented preference against exactly that kind of cross-package extraction for two independent per-feature aggregations (see `CompensationPlanService.getMyRankProgress`'s own comment: "matching this codebase's existing precedent of small per-feature duplication over cross-package extraction, e.g. `AdminSalePageResponse` vs. `AssociateSalePageResponse` in Sales unit 7"). This plan follows that same precedent: `RewardsComponent` renders its own small progress-bar markup, reusing the dashboard widget's proven `.rank-progress`/`.progress-bar`/`.progress-fill`/`.current-rank`/`.next-rank` class names for visual consistency, but the CSS for those class names is scoped `.dashboard .rank-progress ...` in `frontend/src/styles/_app-shell.scss:142-172` (verified by direct read) — it does **not** apply outside `.dashboard`. Task 7 adds a small `.rewards .rank-progress ...` mirror block so the new screen isn't unstyled.
2. **Reward tier list** — rendered through the existing `EditableTableComponent` in `[readOnly]="true"` mode, the exact same reuse `SalesHistoryComponent`/`AssociateDirectoryComponent`/`KycQueueComponent` already established for read-only tabular data. The `achieved` boolean is mapped to a translated "Achieved"/"Not yet reached" string cell (the table only renders `string | number` cells — same string-mapping approach `SalesHistoryComponent` already uses for its `status`/`legCredited` enum cells).
3. Two `StatTileComponent` instances (`frontend/src/app/shared/components/stat-tile/stat-tile.component.ts`, already used elsewhere for label/value/hint tiles) surface `cumulativeMatchedVolume` and `volumeToNextRank` — the two numeric fields the response carries that don't fit into either the bar or the tier table.

Route guarded exactly like `/dashboard` and `/sales-history` (`authGuard` + `associateOnlyGuard` — no `adminGuard`, since the backend endpoint 404s/409s for a caller with no `Associate` row, the same reason those two routes already exclude admin-family principals). A new nav link is added to the global header for non-admin-family users, positioned after "Sales History".

**Design Decision: no fresh `frontend-design` skill dispatch.** Same reasoning `2026-08-11-sales-associate-history-screen.md` used for Sales History, re-verified for this screen specifically:
- The spec (`docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` line 55) describes this screen identically to every other Associate report screen: *"Rewards & Perks progress (view-only)"* — no filters, no actions, no export named anywhere.
- The backend confirms this: `AssociateRankProgressController.getMyRankProgress` takes no query params at all (not even pagination) — a single self-scoped `GET`.
- This screen's two visual primitives — a labeled progress bar and a read-only tiered list — both already have a proven, un-designed precedent shipping in this exact codebase (`dashboard/widgets/rank-progress` for the bar; `EditableTableComponent` for the list). Inventing new presentational choices here (badges, colored achievement chips, a stepper) would be adding unbriefed design surface to a screen the spec and the backend both describe as a plain read-only report — same class of screen as Sales History, KYC Queue, and Associate Directory, none of which got a bespoke design pass either.

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`, global SCSS partials under `frontend/src/styles/`.

## Global Constraints

- Do not modify any backend file — `GET /api/associates/me/rank-progress` (role-capability unit 9, `c0fbf10..fd53e02`) is fully built and merged; this unit is frontend-only.
- API contract consumed (verified by direct read of the merged code, not assumed):
  - Route: `GET /api/associates/me/rank-progress`, bare `@RestController`, self-scoped from `@AuthenticationPrincipal UUID` — no path/query params.
  - Auth: any authenticated Associate (Bearer JWT); `401` with no token; `409 CONFLICT` with body `{"error": "..."}` if the caller has no rank assigned (in practice unreachable for a genuine `ASSOCIATE` row, since `chk_associate_rank_required` makes `rankId` mandatory for that role — but the frontend must still degrade to the generic error state rather than assume it can't happen).
  - `200` response body (`AssociateRankProgressResponse`):
    ```json
    {
      "currentRank": "Sales Associate",
      "currentRankOrder": 1,
      "nextRank": "Sales Executive",
      "progressPercent": 40,
      "cumulativeMatchedVolume": 4000,
      "volumeToNextRank": 6000,
      "rewardTiers": [
        { "tierLevel": 1, "volumeThreshold": 1000, "cashReward": 100, "perkDescription": "Tier 1", "achieved": true },
        { "tierLevel": 2, "volumeThreshold": 5000, "cashReward": 500, "perkDescription": "Tier 2", "achieved": false }
      ]
    }
    ```
    `nextRank` is `null` at the top rank (`progressPercent` is `100`, `volumeToNextRank` is `0` in that case). `rewardTiers` can be `[]` if the current compensation plan version has none configured. All `BigDecimal` fields (`cumulativeMatchedVolume`, `volumeToNextRank`, `volumeThreshold`, `cashReward`) serialize as plain JSON numbers, typed `number` on the frontend — same convention `Sale.amount` already uses (`frontend/src/app/admin/models/sale.model.ts:10`), not a string.
- Every new user-facing string goes through `@ngx-translate/core` — no hard-coded copy in templates. Add matching keys to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Per established precedent (`salesHistory.*`/`admin.salesRegister.*` in `hi.json`), leaving a newly-added feature bundle as the literal English string in `hi.json` is accepted practice — only `nav.rewards` needs a real Hindi translation.
- No new shared component beyond what already exists (`EditableTableComponent`, `StatTileComponent`). The progress-bar markup is small enough to inline in `RewardsComponent`'s own template (see Architecture) rather than extracting a new shared component for a single consumer.
- Test runner: `cd frontend && npx ng test --watch=false --include='<glob>'` for scoped runs.

---

## File Structure

- Create: `frontend/src/app/rewards/models/associate-rank-progress.model.ts` — `AssociateRankProgress`/`AssociateRewardTier` interfaces (mirror `AssociateRankProgressResponse`/`AssociateRewardTierDto` on the backend).
- Create: `frontend/src/app/rewards/rewards.service.ts` — `RewardsService.getMyRankProgress()`.
- Create: `frontend/src/app/rewards/rewards.service.spec.ts`
- Create: `frontend/src/app/rewards/rewards.component.ts` — `RewardsComponent`.
- Create: `frontend/src/app/rewards/rewards.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` — add the `rewards` route.
- Modify: `frontend/src/app/app.routes.spec.ts` — add a guard-coverage test for the new route.
- Modify: `frontend/src/app/app.component.html` — add the "Rewards" nav link for non-admin-family users, after "Sales History".
- Modify: `frontend/src/app/app.component.spec.ts` — update the nav-link assertion that currently expects `['Dashboard', 'Sales History']` for a plain associate role.
- Modify: `frontend/src/assets/i18n/en.json` — add `nav.rewards` and a new `rewards` bundle.
- Modify: `frontend/src/assets/i18n/hi.json` — same keys, Hindi nav string, English placeholder for the feature bundle.
- Modify: `frontend/src/styles/_app-shell.scss` — add a `.rewards .rank-progress ...` block mirroring `.dashboard .rank-progress ...` (lines 142-172), plus minimal layout rules for `.rewards__stats`/`.rewards__tiers-title`/`.rewards__load-error`.

---

### Task 1: `AssociateRankProgress` model

**Files:**
- Create: `frontend/src/app/rewards/models/associate-rank-progress.model.ts`

**Interfaces:**
- Consumes: nothing (leaf type file).
- Produces: `AssociateRewardTier` — `{ tierLevel: number; volumeThreshold: number; cashReward: number; perkDescription: string; achieved: boolean }`; `AssociateRankProgress` — `{ currentRank: string; currentRankOrder: number; nextRank: string | null; progressPercent: number; cumulativeMatchedVolume: number; volumeToNextRank: number; rewardTiers: AssociateRewardTier[] }`. Consumed by Task 2 (service) and Task 3 (component).

This is a type-only file (no runtime behavior), so there is no test step — TypeScript's compiler is the check. It compiles as part of Task 2/3's build.

- [ ] **Step 1: Create the model file**

```typescript
export interface AssociateRewardTier {
  tierLevel: number;
  volumeThreshold: number;
  cashReward: number;
  perkDescription: string;
  achieved: boolean;
}

export interface AssociateRankProgress {
  currentRank: string;
  currentRankOrder: number;
  nextRank: string | null;
  progressPercent: number;
  cumulativeMatchedVolume: number;
  volumeToNextRank: number;
  rewardTiers: AssociateRewardTier[];
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/rewards/models/associate-rank-progress.model.ts
git commit -m "feat(rewards): add AssociateRankProgress model"
```

---

### Task 2: `RewardsService`

**Files:**
- Create: `frontend/src/app/rewards/rewards.service.ts`
- Test: `frontend/src/app/rewards/rewards.service.spec.ts`

**Interfaces:**
- Consumes: `AssociateRankProgress` from Task 1.
- Produces: `RewardsService.getMyRankProgress(): Observable<AssociateRankProgress>`, consumed by Task 3 (component).

- [ ] **Step 1: Write the failing test**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RewardsService } from './rewards.service';
import { AssociateRankProgress } from './models/associate-rank-progress.model';

describe('RewardsService', () => {
  let service: RewardsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [RewardsService]
    });
    service = TestBed.inject(RewardsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own rank progress with no query params', () => {
    const mockResponse: AssociateRankProgress = {
      currentRank: 'Sales Associate', currentRankOrder: 1, nextRank: 'Sales Executive',
      progressPercent: 40, cumulativeMatchedVolume: 4000, volumeToNextRank: 6000, rewardTiers: []
    };

    service.getMyRankProgress().subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/associates/me/rank-progress');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/rewards.service.spec.ts'`
Expected: FAIL — `Cannot find module './rewards.service'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateRankProgress } from './models/associate-rank-progress.model';

@Injectable({ providedIn: 'root' })
export class RewardsService {
  private http = inject(HttpClient);

  getMyRankProgress(): Observable<AssociateRankProgress> {
    return this.http.get<AssociateRankProgress>('/api/associates/me/rank-progress');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/rewards.service.spec.ts'`
Expected: PASS (1 spec)

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/rewards/rewards.service.ts frontend/src/app/rewards/rewards.service.spec.ts
git commit -m "feat(rewards): add RewardsService.getMyRankProgress"
```

---

### Task 3: `RewardsComponent`

**Files:**
- Create: `frontend/src/app/rewards/rewards.component.ts`
- Test: `frontend/src/app/rewards/rewards.component.spec.ts`

**Interfaces:**
- Consumes: `RewardsService.getMyRankProgress()` from Task 2. `EditableTableComponent`/`EditableTableColumn` (`frontend/src/app/shared/components/editable-table/editable-table.component.ts`, unchanged). `StatTileComponent` (`frontend/src/app/shared/components/stat-tile/stat-tile.component.ts`, unchanged — `label`/`value`/`hint`/`tone` inputs). `AssociateRankProgress`/`AssociateRewardTier` from Task 1.
- Produces: `RewardsComponent` with public `progress: AssociateRankProgress | null`, `error: boolean`, `tierColumns: EditableTableColumn[]`, `tierRows: Record<string, string | number>[]` — consumed by Task 4's route wiring (as the routed component) and by this task's own spec.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RewardsComponent } from './rewards.component';

describe('RewardsComponent', () => {
  let fixture: ComponentFixture<RewardsComponent>;
  let httpMock: HttpTestingController;

  const flushProgress = (overrides: Partial<any> = {}) => {
    httpMock.expectOne('/api/associates/me/rank-progress').flush({
      currentRank: 'Sales Associate', currentRankOrder: 1, nextRank: 'Sales Executive',
      progressPercent: 40, cumulativeMatchedVolume: 4000, volumeToNextRank: 6000,
      rewardTiers: [
        { tierLevel: 1, volumeThreshold: 1000, cashReward: 100, perkDescription: 'Tier 1', achieved: true },
        { tierLevel: 2, volumeThreshold: 5000, cashReward: 500, perkDescription: 'Tier 2', achieved: false }
      ],
      ...overrides
    });
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RewardsComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(RewardsComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads and displays the current rank and progress bar width', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sales Associate');
    const fill: HTMLElement = fixture.nativeElement.querySelector('.progress-fill');
    expect(fill.style.width).toBe('40%');
  });

  it('renders the next rank name when present', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Sales Executive');
  });

  it('renders a max-rank message instead of a next-rank line when nextRank is null', () => {
    fixture.detectChanges();
    flushProgress({ nextRank: null, progressPercent: 100, volumeToNextRank: 0 });
    fixture.detectChanges();

    expect(fixture.componentInstance.progress?.nextRank).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('rewards.maxRankReached');
  });

  it('renders one row per reward tier with an achieved/not-yet label', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    expect(fixture.componentInstance.tierRows.length).toBe(2);
    expect(fixture.componentInstance.tierRows[0]['achieved']).toContain('rewards.achievedYes');
    expect(fixture.componentInstance.tierRows[1]['achieved']).toContain('rewards.achievedNo');
  });

  it('shows the reward-tier empty state when rewardTiers is empty', () => {
    fixture.detectChanges();
    flushProgress({ rewardTiers: [] });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('renders stat tiles for cumulative matched volume and volume to next rank', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    const values = Array.from(fixture.nativeElement.querySelectorAll('.stat-tile__value')).map(
      (el: any) => el.textContent.trim()
    );
    expect(values).toContain('4000');
    expect(values).toContain('6000');
  });

  it('shows a load error when the request fails, without silently doing nothing', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/rank-progress').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.error).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.rewards__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('renders no action column and no filter controls (view-only)', () => {
    fixture.detectChanges();
    flushProgress();
    fixture.detectChanges();

    expect(fixture.componentInstance.tierColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelector('select')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/rewards.component.spec.ts'`
Expected: FAIL — `Cannot find module './rewards.component'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RewardsService } from './rewards.service';
import { AssociateRankProgress } from './models/associate-rank-progress.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';

@Component({
  selector: 'app-rewards',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, StatTileComponent],
  template: `
    <div class="rewards card" *ngIf="progress as p">
      <h1 class="card-title">{{ 'rewards.title' | translate }}</h1>
      <p class="rewards__subtitle">{{ 'rewards.subtitle' | translate }}</p>

      <div class="rank-progress">
        <div class="current-rank">{{ p.currentRank }}</div>
        <div class="progress-bar"><div class="progress-fill" [style.width.%]="p.progressPercent"></div></div>
        <div class="next-rank" *ngIf="p.nextRank">
          {{ 'rewards.nextRank' | translate }}: {{ p.nextRank }} ({{ p.progressPercent }}%)
        </div>
        <div class="next-rank" *ngIf="!p.nextRank">{{ 'rewards.maxRankReached' | translate }}</div>
      </div>

      <div class="rewards__stats">
        <app-stat-tile [label]="'rewards.cumulativeVolumeLabel' | translate" [value]="p.cumulativeMatchedVolume + ''"></app-stat-tile>
        <app-stat-tile [label]="'rewards.volumeToNextRankLabel' | translate" [value]="p.volumeToNextRank + ''"></app-stat-tile>
      </div>

      <h2 class="rewards__tiers-title">{{ 'rewards.tiersTitle' | translate }}</h2>
      <app-editable-table
        [readOnly]="true"
        [columns]="tierColumns"
        [rows]="tierRows"
        [emptyStateLabel]="'rewards.tiersEmptyState' | translate"
      ></app-editable-table>
    </div>
    <div class="rewards__load-error" *ngIf="error">{{ 'rewards.loadError' | translate }}</div>
  `
})
export class RewardsComponent implements OnInit {
  private rewardsService = inject(RewardsService);
  private translate = inject(TranslateService);

  progress: AssociateRankProgress | null = null;
  error = false;
  tierColumns: EditableTableColumn[] = [];
  tierRows: Record<string, string | number>[] = [];

  ngOnInit(): void {
    this.tierColumns = [
      { key: 'tierLevel', label: this.translate.instant('rewards.columnTierLevel'), type: 'text' },
      { key: 'volumeThreshold', label: this.translate.instant('rewards.columnVolumeThreshold'), type: 'text' },
      { key: 'cashReward', label: this.translate.instant('rewards.columnCashReward'), type: 'text' },
      { key: 'perkDescription', label: this.translate.instant('rewards.columnPerkDescription'), type: 'text' },
      { key: 'achieved', label: this.translate.instant('rewards.columnAchieved'), type: 'text' }
    ];
    this.rewardsService.getMyRankProgress().subscribe({
      next: p => {
        this.progress = p;
        this.updateTierRows();
      },
      error: () => (this.error = true)
    });
  }

  private updateTierRows(): void {
    this.tierRows = (this.progress?.rewardTiers ?? []).map(t => ({
      tierLevel: t.tierLevel,
      volumeThreshold: t.volumeThreshold,
      cashReward: t.cashReward,
      perkDescription: t.perkDescription,
      achieved: this.translate.instant(t.achieved ? 'rewards.achievedYes' : 'rewards.achievedNo')
    }));
  }
}
```

Note: `[value]="p.cumulativeMatchedVolume + ''"` matches `StatTileComponent.value`'s `string`-typed `@Input` (it does not accept a raw `number`) — same coercion the component's own doc comment implies (`label`/`value` are both typed `string`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/rewards.component.spec.ts'`
Expected: PASS (8 specs)

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/rewards/rewards.component.ts frontend/src/app/rewards/rewards.component.spec.ts
git commit -m "feat(rewards): add RewardsComponent"
```

---

### Task 4: Route wiring + guard test

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `RewardsComponent` from Task 3. Existing `authGuard`/`associateOnlyGuard`, already used verbatim by the `dashboard` and `sales-history` routes.
- Produces: route `path: 'rewards'`, consumed by Task 5's nav link (`routerLink="/rewards"`).

- [ ] **Step 1: Write the failing test (append to `app.routes.spec.ts`)**

```typescript
  it('guards the rewards route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'rewards');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });
```

Place this new `it(...)` block directly after the existing `'guards the sales-history route with authGuard and associateOnlyGuard'` test (same `describe('routes', ...)` block, top level).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: FAIL — `route` is `undefined`.

- [ ] **Step 3: Add the route**

In `frontend/src/app/app.routes.ts`, add the import near the other top-level component imports:

```typescript
import { RewardsComponent } from './rewards/rewards.component';
```

Add the route entry directly after the existing `sales-history` route entry:

```typescript
  { path: 'sales-history', component: SalesHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'rewards', component: RewardsComponent, canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts
git commit -m "feat(rewards): route /rewards behind authGuard + associateOnlyGuard"
```

---

### Task 5: Global nav link

**Files:**
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: the `rewards` route from Task 4. Existing `isAdminFamily` getter and `app-nav__link`/`app-nav__link--active` classes.
- Produces: nothing new consumed elsewhere — final, user-visible wiring step.

- [ ] **Step 1: Write/update the failing test**

In `frontend/src/app/app.component.spec.ts`, update the existing associate-nav-links test (currently asserts `['Dashboard', 'Sales History']` per the sales-history unit's own change):

```typescript
  it('shows the Dashboard, Sales History, and Rewards nav links for a plain associate role', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'nav.dashboard': 'Dashboard',
        'nav.salesHistory': 'Sales History',
        'nav.rewards': 'Rewards',
        'nav.provisionAssociate': 'Provision Associate',
        'nav.settings': 'Settings',
        'auth.logout': 'Log Out'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav__link')).map(el => el.textContent?.trim());
    expect(links).toEqual(['Dashboard', 'Sales History', 'Rewards']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: FAIL — `links` is still `['Dashboard', 'Sales History']`.

- [ ] **Step 3: Add the nav link**

In `frontend/src/app/app.component.html`, add the new link directly after the Sales History link, still gated on `!isAdminFamily`:

```html
<header class="app-header" *ngIf="authService.isAuthenticated() && !isChromelessRoute">
  <nav class="app-nav">
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/dashboard" routerLinkActive="app-nav__link--active">{{ 'nav.dashboard' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/sales-history" routerLinkActive="app-nav__link--active">{{ 'nav.salesHistory' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/rewards" routerLinkActive="app-nav__link--active">{{ 'nav.rewards' | translate }}</a>
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
Expected: PASS. Verify the admin-family nav tests still pass unmodified, since the new link is also gated on `!isAdminFamily`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/app.component.html frontend/src/app/app.component.spec.ts
git commit -m "feat(rewards): add Rewards nav link for associates"
```

---

### Task 6: i18n keys (English + Hindi)

**Files:**
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: nothing (data-only).
- Produces: every translation key referenced by Task 3's template and Task 5's template. No JS/TS interface — resolved at runtime by `@ngx-translate/core`.

- [ ] **Step 1: Add the `rewards` bundle to `en.json`**

Insert as a new top-level key immediately after the closing `}` of the existing `"salesHistory": { ... }` block:

```json
  "rewards": {
    "title": "Rewards & Perks",
    "subtitle": "Your rank progress and reward tier achievement.",
    "nextRank": "Next rank",
    "maxRankReached": "You've reached the highest rank.",
    "cumulativeVolumeLabel": "Cumulative matched volume",
    "volumeToNextRankLabel": "Volume to next rank",
    "tiersTitle": "Reward tiers",
    "columnTierLevel": "Tier",
    "columnVolumeThreshold": "Volume threshold",
    "columnCashReward": "Cash reward",
    "columnPerkDescription": "Perk",
    "columnAchieved": "Status",
    "achievedYes": "Achieved",
    "achievedNo": "Not yet reached",
    "tiersEmptyState": "No reward tiers configured yet.",
    "loadError": "Something went wrong loading your rewards progress. Please try again."
  },
```

- [ ] **Step 2: Add `nav.rewards` to `en.json`**

Inside the existing `"nav": { ... }` block, add a new entry directly after `"salesHistory": "Sales History",`:

```json
    "rewards": "Rewards",
```

- [ ] **Step 3: Mirror both additions into `hi.json`**

Same `rewards` bundle (top-level key, same position, after `"salesHistory": { ... }`) — English placeholder values, matching the `salesHistory`/`admin.salesRegister` precedent already in this file:

```json
  "rewards": {
    "title": "Rewards & Perks",
    "subtitle": "Your rank progress and reward tier achievement.",
    "nextRank": "Next rank",
    "maxRankReached": "You've reached the highest rank.",
    "cumulativeVolumeLabel": "Cumulative matched volume",
    "volumeToNextRankLabel": "Volume to next rank",
    "tiersTitle": "Reward tiers",
    "columnTierLevel": "Tier",
    "columnVolumeThreshold": "Volume threshold",
    "columnCashReward": "Cash reward",
    "columnPerkDescription": "Perk",
    "columnAchieved": "Status",
    "achievedYes": "Achieved",
    "achievedNo": "Not yet reached",
    "tiersEmptyState": "No reward tiers configured yet.",
    "loadError": "Something went wrong loading your rewards progress. Please try again."
  },
```

Add the real Hindi nav entry inside `hi.json`'s existing `"nav": { ... }` block, directly after `"salesHistory": "बिक्री इतिहास",`:

```json
    "rewards": "रिवॉर्ड्स",
```

- [ ] **Step 4: Verify both files are valid JSON**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
python3 -c "import json; json.load(open('frontend/src/assets/i18n/en.json')); print('en.json OK')"
python3 -c "import json; json.load(open('frontend/src/assets/i18n/hi.json')); print('hi.json OK')"
```

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(rewards): add i18n copy for the Rewards & Perks screen"
```

---

### Task 7: Progress-bar CSS for the new screen

**Files:**
- Modify: `frontend/src/styles/_app-shell.scss`

**Interfaces:**
- Consumes: nothing (pure CSS).
- Produces: visual styling for the `.rewards .rank-progress` markup added in Task 3, plus `.rewards__stats`/`.rewards__tiers-title`/`.rewards__load-error`/`.rewards__subtitle` — consumed only visually, no TS interface.

`SalesHistoryComponent` needed zero screen-specific CSS because it used only pre-existing route-agnostic global classes (`.card`, `.editable-table`). This screen is the first non-dashboard consumer of the rank-progress bar visual, and that visual's CSS is scoped `.dashboard .rank-progress ...` (`frontend/src/styles/_app-shell.scss:142-172`, confirmed by direct read) — it will not apply under `.rewards`. This task is a deliberate, minimal exception to the "no new CSS" precedent, not an oversight.

- [ ] **Step 1: Add the mirror block**

In `frontend/src/styles/_app-shell.scss`, directly after the existing `.dashboard .rank-progress .next-rank { ... }` block (ends at line 172), add:

```scss
.rewards .rank-progress {
  padding: 1.5rem;
  background: var(--surface-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  margin-bottom: 1.5rem;
}

.rewards .rank-progress .current-rank {
  font-weight: 600;
  color: var(--text-primary);
}

.rewards .rank-progress .progress-bar {
  position: relative;
  height: 8px;
  margin: 0.75rem 0;
  background: var(--surface-raised);
  border-radius: 999px;
  overflow: hidden;
}

.rewards .rank-progress .progress-fill {
  height: 100%;
  background: var(--brand-gradient);
  border-radius: 999px;
}

.rewards .rank-progress .next-rank {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.rewards__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.rewards__tiers-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.rewards__subtitle {
  color: var(--text-muted);
  margin-bottom: 1.5rem;
}

.rewards__load-error {
  color: var(--color-danger, #c0392b);
}
```

(Values chosen to be byte-for-byte identical to the `.dashboard .rank-progress` block for the shared sub-selectors — same tokens, same visual result, different scope root only.)

- [ ] **Step 2: Visually verify (manual, no automated test)**

CSS has no unit-test coverage in this codebase (confirmed: no `.spec.ts` file asserts computed styles anywhere in the repo). Run `cd frontend && npx ng serve`, log in as an Associate, navigate to `/rewards`, and confirm the progress bar renders filled and styled (not a bare unstyled `<div>`).

- [ ] **Step 3: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/styles/_app-shell.scss
git commit -m "style(rewards): style the rank-progress bar outside the dashboard route"
```

---

### Task 8: Update the role-capability units tracker

**Files:**
- Modify: `docs/superpowers/plans/2026-08-03-role-capability-units.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Mark unit 15 merged**

In the units table, change unit 15's row from:

```
| 15 | **screen** | Associate "Rewards & Perks progress" screen | 9 | pending | — | — |
```

to:

```
| 15 | **screen** | Associate "Rewards & Perks progress" screen | 9 | **merged** | `docs/superpowers/plans/2026-08-14-role-capability-unit-15-rewards-screen.md` | `<first-commit-sha>`..`<last-commit-sha>` on `master` |
```

filling in real commit SHAs once this plan has actually been executed and merged (this step is done as the last step of implementation, not during planning).

- [ ] **Step 2: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add docs/superpowers/plans/2026-08-03-role-capability-units.md
git commit -m "docs: mark role-capability unit 15 merged"
```

---

## Final verification

- [ ] Run the full frontend suite: `cd frontend && npx ng test --watch=false`. Expect every existing spec plus this unit's new specs (Tasks 2, 3, 4, 5) green, no regressions in `dashboard`/`sales-history`/`associate-directory`/`kyc-queue` suites.
- [ ] Confirm no backend file changed — `git diff backend/` should be empty for this unit's commits.
- [ ] Manually confirm the route: `GET /rewards` (frontend) → `GET /api/associates/me/rank-progress` (backend, unit 9, unmodified) — matches the pattern `/dashboard` → `/api/associates/me/dashboard` and `/sales-history` → `/api/associates/me/sales` already established.

---

## Self-Review Notes (completed during planning)

- **Spec coverage:** The spec's only description of this screen (data-visibility spec line 55: *"Rewards & Perks progress (view-only)"*) maps entirely to Task 3 (rank progress bar + reward tier list, backed by the exact unit-9 endpoint's full response shape — every field in `AssociateRankProgressResponse` is rendered somewhere: `currentRank`/`progressPercent` in the bar, `nextRank` in the bar or the max-rank message, `cumulativeMatchedVolume`/`volumeToNextRank` in the two stat tiles, `rewardTiers` in the table). No filters, actions, or export are named for this screen anywhere in the spec, and the backend endpoint takes no query params, so none were added.
- **Drift/gap found vs. spec:** none in the API contract itself — unit 9's merged endpoint already matches this screen's needs exactly (it was in fact designed with this screen unit in mind, per unit 9's own plan header comment referencing the same data-visibility spec row). The one real gap found during planning was in the **frontend CSS layer**, not the spec: the rank-progress bar visual has no route-agnostic styling today (scoped `.dashboard .rank-progress`, confirmed by direct read of `_app-shell.scss`), so this is the first screen to need Task 7's small mirror block — flagged explicitly rather than silently reusing an unstyled `<div>` or silently cross-importing `dashboard`'s widget component (see Architecture section for why the latter was rejected).
- **Loading state:** this codebase has no spinner/skeleton precedent anywhere (checked `DashboardComponent`, `SalesHistoryComponent`, `KycQueueComponent` — all render nothing until the HTTP call resolves, only distinguishing a hard error). `RewardsComponent` follows the same convention (`*ngIf="progress as p"` renders nothing pre-load, `error` flag renders the error banner) rather than inventing a new loading-state pattern for this one screen.
- **Type consistency:** `AssociateRankProgress`/`AssociateRewardTier` (Task 1) used identically in `RewardsService.getMyRankProgress` (Task 2, return type `Observable<AssociateRankProgress>`) and `RewardsComponent.progress` (Task 3, type `AssociateRankProgress | null`). `tierColumns`/`tierRows` naming mirrors `SalesHistoryComponent`'s `historyColumns`/`historyRows` convention exactly.
- **Cross-unit file overlap:** this unit only reads from the already-merged unit-9 backend response shape (read-only, no backend edits) and touches the same three shared frontend files (`app.routes.ts`, `app.component.html`/`.spec.ts`, `en.json`/`hi.json`) that units 12-14 and 16 will also touch — sequencing/merge-order with sibling screen units (12, 13, 14, 16) should be checked at dispatch time the same way unit 6/10/11 were cross-checked on `SecurityConfigTest.java` overlap, but as of this plan's writing none of those sibling units have a plan file yet, so there is nothing to reconcile against today.
- **Placeholder scan:** No "TBD"/"handle appropriately" language; every step has literal code or exact JSON/SCSS to insert.
