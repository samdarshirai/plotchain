# Role-Capability Unit 12: Associate "My Tree" Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an Associate a "My Tree" screen at `/my-tree` that renders their own subtree — self as root, own direct downline, full L/R descendants down to depth 3, vacant slots shown for open positions — view-only, matching the spec's Associate Screens list entry: "My Tree (own subtree, view-only)".

**Architecture:** One new standalone Angular route/component (`MyTreeComponent`) backed by one thin service (`MyTreeService`), following this codebase's established associate-self-service screen pattern (mirrors `SalesHistoryComponent`/`SalesHistoryService` — a bare top-level route guarded by `authGuard` + `associateOnlyGuard`, no shell/nav-rail wrapper, added to the global header nav next to Dashboard and Sales History). The component consumes the already-merged, self-scoped `GET /api/associates/me/tree` endpoint (role-capability unit 5, `AssociateTreeController`) — no backend work in this unit.

For the actual tree canvas (node cards, links, pan/zoom, legend), this plan reuses rather than reimplements: it imports the existing `TreeNode` model, the pure `buildTreeLayout`/`linkPathD`/`px`/`py` layout functions, and the pure `PanZoomState`/`zoomAround`/`panBy`/`pinchZoom`/`computeFitTransform` math — all already extracted as framework-free, side-effect-free modules under `frontend/src/app/admin/models/` and `frontend/src/app/admin/tree-explorer/` for the admin-only Tree Explorer screen (role-model-collapse era). None of those modules are Admin-specific in what they compute; `TreeExplorerService.subtree()`'s own controller-level self-scoping (unit 5) is what makes the *data* Associate-safe, not anything about these modules. This mirrors an existing precedent in this codebase: `SalesHistoryComponent`'s own model (`AssociateSalePage`) already imports `Sale` from `admin/models/sale.model.ts` cross-folder rather than duplicating it.

The DOM-level pan/zoom *event wiring* (`attachCanvasListeners`/pointer/wheel handlers, ~140 lines in `TreeExplorerComponent`) is **not** extracted into a shared helper — see Decisions & Rationale below. It is duplicated into the new component. This is a deliberate, documented tradeoff, not an oversight.

**Tech Stack:** Angular (standalone components), `@ngx-translate/core` for i18n, `HttpClientTestingModule` + Jasmine/Karma (`ng test`) for tests — same stack every existing associate-facing screen already uses.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` — matrix row "Tree / genealogy": *"Subtree rooted at self only — own direct downline + full L/R descendants. No visibility into ancestors above self or siblings' other branches."* Screens section: *"Associate ... My Tree (own subtree, view-only)"*. Reconciliation table: *"No 'my subtree' endpoint for an Associate at all"* — that gap was closed by unit 5 on the backend; this unit closes the matching frontend gap.

## Global Constraints

- The screen must never let the caller specify whose tree to view — no associate-ID input, no route param, no query param exposed in the UI. The component always calls `MyTreeService.getMyTree()` with no ID argument; the caller is scoped entirely by the JWT on the backend (already true of the unit-5 endpoint — this constraint is about not adding a UI affordance that would suggest otherwise).
- View-only: no edit, no create-associate, no record-sale-style action anywhere on this screen (spec: "the rest are pure reports" — Tree/genealogy is not the one write-enabled Associate screen; Profile is).
- Depth is not user-configurable in the UI. Mirrors `TreeExplorerComponent`'s own existing convention exactly (`DEFAULT_DEPTH = 3` is hardcoded there too, with no depth selector control) — introducing a depth control here would be new UX this unit has no product ask for, and would inconsistently outpace the admin screen it's modeled on.
- `frontend/src/app/admin/tree-explorer/tree-explorer.component.ts`, `tree-explorer-layout.ts`, `tree-explorer-pan-zoom.ts`, `tree-explorer.service.ts`, and every one of their existing spec files are **not modified** by this unit. They are only imported from. Zero regression risk to the already-shipped, already-tested admin Tree Explorer screen.
- `backend/**` is not touched. `GET /api/associates/me/tree` already exists, merged, tested (role-capability unit 5) — this is a pure frontend-consumption unit.

---

## Decisions & Rationale

**1. Reuse `TreeNode`, `buildTreeLayout`, `linkPathD`/`px`/`py`, and the pan-zoom math modules by direct cross-folder import; do not duplicate or move them.**
All five are pure, framework-agnostic (no Angular, no HTTP, no "admin" concept baked into their logic — `buildTreeLayout` operates on a generic `TreeNode` tree shape) and already have their own passing spec files (`tree-explorer-layout.spec.ts`, `tree-explorer-pan-zoom.spec.ts`) that this unit does not need to touch or re-verify. Duplicating ~240 lines of layout/geometry math into a second copy would be a straightforward DRY violation with no offsetting benefit — there's no reason `MyTreeComponent`'s tree should be laid out or pan/zoomed differently than `TreeExplorerComponent`'s. Consistent with the standing precedent of `SalesHistoryComponent`'s `AssociateSalePage` model importing `Sale` from `admin/models/sale.model.ts`.

**2. Reuse the existing `.tree-explorer__*` CSS classes verbatim (defined globally in `frontend/src/styles/_admin.scss`) instead of writing a new stylesheet or renaming to a neutral prefix.**
Angular components in this codebase do not use `styleUrls`/view-encapsulated CSS for these screens — `SalesHistoryComponent`, `DashboardComponent`, and `TreeExplorerComponent` all render with zero or near-zero dedicated CSS, relying on globally-loaded partials declared in `src/styles.scss`. `.tree-explorer__canvas-wrap`'s base rule (`height: min(70vh, 640px)`, no `.settings-shell__content--full` ancestor needed) already works standalone outside the Settings shell — exactly the context `/my-tree` renders in (a bare top-level route, not nested in `SettingsShellComponent`), confirmed by reading `_admin.scss` lines 1264–1276 directly. Same visual language for the same underlying concept (a binary-tree node/link canvas) is a feature, not a naming leak: the admin's Tree Explorer and the associate's My Tree are visually the same kind of screen with a different data scope, and a returning admin-turned-associate-reviewer or a support screenshot comparison benefits from that consistency.
*Considered and rejected:* extracting a neutral `_tree-canvas.scss` partial + renaming ~40 selectors in `_admin.scss` and their corresponding template bindings in the already-shipped `TreeExplorerComponent`. Rejected because it requires modifying a merged, tested admin component/stylesheet for a class-naming concern with zero behavior change — real regression risk for a purely cosmetic motivation, out of proportion to this unit's actual scope (add one associate screen). Worth revisiting only if a third tree-canvas consumer appears.

**3. Do NOT extract the pointer/wheel DOM event-wiring (`attachCanvasListeners`/`detachCanvasListeners`/`applyTransform`/`zoomAtCenter`, ~140 lines) into a shared helper. Duplicate it into `MyTreeComponent`.**
This is real, non-trivial logic (pointer capture, single-finger pan vs. two-finger pinch state machine, wheel-zoom-around-cursor) and duplicating it is a genuine, acknowledged cost — a future bug fix here (e.g., a Safari pointer-capture quirk) will need to land in two places. The alternative — extracting it into a shared directive/controller that both `TreeExplorerComponent` and `MyTreeComponent` depend on — was considered and rejected for this unit specifically because it requires modifying `TreeExplorerComponent` itself (the component's `ngOnInit`/`ViewChild` wiring would need to change to consume the new shared helper), which reintroduces the same "touching merged, tested admin code for a unit whose scope is 'add an associate screen'" problem as Decision 2, this time with actual behavioral risk (pointer-event regressions are the kind of thing that only surfaces on real touch devices, not unit tests — `tree-explorer.component.spec.ts` itself has zero pointer/wheel interaction tests today, meaning a refactor here would ship with no safety net). **Flagged as a follow-up**, not performed: if a third tree-canvas consumer is ever added, extract `attachCanvasListeners` into a shared `frontend/src/app/shared/tree-canvas/` helper at that point and migrate both existing consumers together, under its own unit with its own test plan.

**4. No new `TreeNode`-shaped model file, no new "My Tree" tree-search model.** The unit-5 endpoint's response (`TreeNodeResponse`) is already exactly what the existing `TreeNode` frontend interface models field-for-field (`id, userId, name, rankName, kycStatus, position, leftLegVolume, rightLegVolume, skewedLegsFlag, stagnantFlag, children`) — verified by direct comparison against `backend/src/main/java/com/plotchain/tree/TreeNodeResponse.java`. There is no search endpoint on the associate side (`TreeSearchResponse`/`TreeSearchResult` are admin-only, `GET /api/admin/tree/search` — not built for associates and out of scope here per the spec's "Subtree rooted at self only," which structurally rules out searching for anyone else).

---

## Files

- Create: `frontend/src/app/my-tree/my-tree.service.ts` — thin HTTP wrapper for `GET /api/associates/me/tree`.
- Create: `frontend/src/app/my-tree/my-tree.service.spec.ts`
- Create: `frontend/src/app/my-tree/my-tree.component.ts` — the screen itself; auto-loads on init (no search step, unlike the admin Tree Explorer).
- Create: `frontend/src/app/my-tree/my-tree.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` — add `{ path: 'my-tree', component: MyTreeComponent, canActivate: [authGuard, associateOnlyGuard] }`.
- Modify: `frontend/src/app/app.component.html` — add the "My Tree" nav link inside the existing `*ngIf="!isAdminFamily"` group, between Dashboard and Sales History.
- Modify: `frontend/src/app/app.component.spec.ts` — update the two existing nav-link assertions (`shows the Dashboard and Sales History nav links for a plain associate role`, and the translation-map fake in it) to include My Tree.
- Modify: `frontend/src/assets/i18n/en.json` — add `nav.myTree` and a new top-level `myTree` object.
- Modify: `frontend/src/assets/i18n/hi.json` — same keys, Hindi content.

No backend files. No changes to `admin/tree-explorer/**` or `admin/models/tree-node.model.ts`.

---

## Task 1: `MyTreeService` — fetch the caller's own subtree

**Files:**
- Create: `frontend/src/app/my-tree/my-tree.service.ts`
- Test: `frontend/src/app/my-tree/my-tree.service.spec.ts`

**Interfaces:**
- Consumes: `GET /api/associates/me/tree?depth={int}` (role-capability unit 5, `AssociateTreeController.myTree`, already merged — `backend/src/main/java/com/plotchain/tree/AssociateTreeController.java:26`). No associate ID anywhere in the request; the JWT (attached automatically by the existing `auth.interceptor.ts`, same as every other associate-facing service in this codebase) is what scopes it.
- Produces: `MyTreeService.getMyTree(depth?: number): Observable<TreeNode>`, consumed by Task 2's component.

- [ ] **Step 1: Write the failing service tests**

Create `frontend/src/app/my-tree/my-tree.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MyTreeService } from './my-tree.service';
import { TreeNode } from '../admin/models/tree-node.model';

describe('MyTreeService', () => {
  let service: MyTreeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [MyTreeService]
    });
    service = TestBed.inject(MyTreeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own subtree at the default depth (3), with no associate id in the request', () => {
    const mockNode: TreeNode = {
      id: 'a1', userId: 'VP00001', name: 'Self', rankName: null, kycStatus: 'PENDING', position: null,
      leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
    };

    service.getMyTree().subscribe(res => expect(res).toEqual(mockNode));

    const req = httpMock.expectOne('/api/associates/me/tree?depth=3');
    expect(req.request.method).toBe('GET');
    req.flush(mockNode);
  });

  it('fetches at an explicitly requested depth', () => {
    service.getMyTree(1).subscribe();

    const req = httpMock.expectOne('/api/associates/me/tree?depth=1');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'a1', userId: 'VP00001', name: 'Self', rankName: null, kycStatus: 'PENDING', position: null,
      leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && ng test --include='**/my-tree/my-tree.service.spec.ts'`
Expected: FAIL to compile — `MyTreeService` doesn't exist yet.

- [ ] **Step 3: Create the service**

Create `frontend/src/app/my-tree/my-tree.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TreeNode } from '../admin/models/tree-node.model';

const DEFAULT_DEPTH = 3;

// Self-scoped by construction on the backend (AssociateTreeController reads the associate id
// only from the JWT principal, role-capability unit 5) -- this service deliberately has no
// parameter for an associate id anywhere in its signature, so there is no way for a caller of
// this service to even attempt to request another associate's tree.
@Injectable({ providedIn: 'root' })
export class MyTreeService {
  private http = inject(HttpClient);

  getMyTree(depth: number = DEFAULT_DEPTH): Observable<TreeNode> {
    return this.http.get<TreeNode>('/api/associates/me/tree', { params: new HttpParams().set('depth', depth) });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && ng test --include='**/my-tree/my-tree.service.spec.ts'`
Expected: PASS, both tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/my-tree/my-tree.service.ts frontend/src/app/my-tree/my-tree.service.spec.ts
git commit -m "feat(my-tree): add MyTreeService for self-scoped GET /api/associates/me/tree"
```

---

## Task 2: `MyTreeComponent` — render the canvas, auto-load on init

**Files:**
- Create: `frontend/src/app/my-tree/my-tree.component.ts`
- Test: `frontend/src/app/my-tree/my-tree.component.spec.ts`

**Interfaces:**
- Consumes: `MyTreeService.getMyTree(): Observable<TreeNode>` (Task 1); `buildTreeLayout`, `LAYOUT`, `LayoutEntry`, `LayoutLink`, `TreeLayout`, `linkPathD`, `px`, `py` from `../admin/tree-explorer/tree-explorer-layout` (existing, unmodified); `PanZoomState`, `computeFitTransform`, `panBy`, `pinchZoom`, `zoomAround` from `../admin/tree-explorer/tree-explorer-pan-zoom` (existing, unmodified); `InlineBannerComponent` from `../shared/components/inline-banner/inline-banner.component` (existing).
- Produces: `app-my-tree` standalone component, routed at `/my-tree` by Task 3.

**UI behavior:**
- On init, calls `getMyTree()` immediately — no search step (unlike `TreeExplorerComponent`, which waits for a typed query). This is the single largest behavioral difference from the admin screen: self-scoping means there is nothing to search for.
- While the first response is pending: nothing renders below the title/subtitle, same convention `DashboardComponent` already uses (`*ngIf="dashboard as d"` gates everything; no dedicated loading spinner exists anywhere in this codebase to mirror instead).
- On success: canvas renders exactly like the admin Tree Explorer's (node cards, links, pan/zoom, zoom controls, legend, stats pill), rooted at self. The root card gets a "You" tag (reusing the `.tree-explorer__result-tag` visual treatment the admin screen uses for its search-result tag) instead of nothing, since there's no search result to distinguish from — self is always visually identifiable at a glance.
- Vacant L/R slots render automatically wherever the associate has no downline yet at a given position — this is the existing, unmodified `buildTreeLayout` behavior (`childAt` returns `null` for a missing leg, which synthesizes a `VacantEntry`). A brand-new associate with zero downline therefore sees themself plus two vacant slot cards — this doubles as the screen's "empty downline" state; no separate empty-state UI is needed (unlike the admin screen's pre-search "no tree loaded yet" empty state, which has no self-view equivalent since self always exists).
- On failure: `app-inline-banner` (danger tone) with a load-error message. No retry button — matches `DashboardComponent`'s existing failure-state convention exactly (text-only, no retry affordance anywhere in this codebase's associate screens today).
- No search input, no associate-ID field, no admin-only "not found" banner anywhere in the template — this is the concrete, testable expression of "view-only, self-scoped only."

- [ ] **Step 1: Write the failing component tests**

Create `frontend/src/app/my-tree/my-tree.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MyTreeComponent } from './my-tree.component';
import { TreeNode } from '../admin/models/tree-node.model';

describe('MyTreeComponent', () => {
  let fixture: ComponentFixture<MyTreeComponent>;
  let httpMock: HttpTestingController;

  const selfOnly: TreeNode = {
    id: 'a1', userId: 'VP00001', name: 'Self', rankName: null, kycStatus: 'PENDING', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
  };

  const nestedTree: TreeNode = {
    id: 'a1', userId: 'VP00001', name: 'Self', rankName: null, kycStatus: 'PENDING', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false,
    children: [
      {
        id: 'a2', userId: 'VP00002', name: 'Child', rankName: null, kycStatus: 'VERIFIED', position: 'L',
        leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false,
        children: [
          {
            id: 'a3', userId: 'VP00003', name: 'Grandchild', rankName: null, kycStatus: 'PENDING', position: 'L',
            leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false,
            children: []
          }
        ]
      }
    ]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyTreeComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(MyTreeComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads its own subtree on init with no user action, and no associate id in the request', () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/associates/me/tree?depth=3');
    expect(req.request.method).toBe('GET');
    req.flush(selfOnly);

    expect(fixture.componentInstance.root?.userId).toBe('VP00001');
  });

  it('tags the root card "You" instead of a search-result tag', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(selfOnly);
    fixture.detectChanges();

    const tag: HTMLElement | null = fixture.nativeElement.querySelector('.tree-explorer__result-tag');
    expect(tag?.textContent?.trim()).toBeTruthy();
    expect(fixture.componentInstance.selfNodeId).toBe('a1');
  });

  it('renders every level of a nested downline via the recursive node template', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    const nodeIdEls: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tree-explorer__node-id'));
    expect(nodeIdEls.map(el => el.textContent?.trim())).toEqual(['VP00001', 'VP00002', 'VP00003']);
  });

  it('shows vacant-slot cards for open L/R positions when there is no downline yet (the empty-downline state)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(selfOnly);
    fixture.detectChanges();

    const vacantEls = fixture.nativeElement.querySelectorAll('.tree-explorer__vacant-card');
    expect(vacantEls.length).toBe(2);
    expect(fixture.componentInstance.layout?.vacantCount).toBe(2);
  });

  it('shows stats-pill counts scoped to the loaded subtree', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    // nestedTree: 3 filled nodes (self/child/grandchild) + 4 vacant slots synthesized around
    // them (bounded by maxSlotDepth=3) = 7 total positions in the loaded subtree.
    const values: string[] = Array.from(fixture.nativeElement.querySelectorAll('.tree-explorer__stats-pill b'))
      .map((el: any) => el.textContent?.trim());
    expect(values).toEqual(['7', '3', '4']);
  });

  it('shows a load error when the fetch fails, without silently rendering an empty canvas', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    expect(fixture.componentInstance.root).toBeNull();
    expect(fixture.nativeElement.querySelector('app-inline-banner')).toBeTruthy();
  });

  it('renders no search input and no associate-id control (view-only, self-scoped only)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(selfOnly);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && ng test --include='**/my-tree/my-tree.component.spec.ts'`
Expected: FAIL to compile — `MyTreeComponent` doesn't exist yet.

- [ ] **Step 3: Create the component**

Create `frontend/src/app/my-tree/my-tree.component.ts`:

```typescript
import { Component, ElementRef, Injector, NgZone, OnDestroy, OnInit, ViewChild, afterNextRender, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { MyTreeService } from './my-tree.service';
import { TreeNode } from '../admin/models/tree-node.model';
import { LAYOUT, LayoutEntry, LayoutLink, TreeLayout, buildTreeLayout, linkPathD, px, py } from '../admin/tree-explorer/tree-explorer-layout';
import { PanZoomState, computeFitTransform, panBy, pinchZoom, zoomAround } from '../admin/tree-explorer/tree-explorer-pan-zoom';

const DEFAULT_DEPTH = 3;
const HINT_TIMEOUT_MS = 3500;
const FIT_ANIMATE_MS = 460;

// Layout/pan-zoom math and CSS classes are deliberately reused verbatim from the admin Tree
// Explorer (see this plan's "Decisions & Rationale" for why) -- this component is the
// self-scoped, search-free, view-only counterpart of TreeExplorerComponent, not a fork of its
// data model.
@Component({
  selector: 'app-my-tree',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="my-tree card">
      <div class="tree-explorer__intro">
        <h1 class="card-title">{{ 'myTree.title' | translate }}</h1>
        <p class="tree-explorer__subtitle">{{ 'myTree.subtitle' | translate }}</p>
      </div>

      <div class="tree-explorer__controls-row" *ngIf="layout as l">
        <div
          class="tree-explorer__stats-pill"
          [title]="'myTree.statsScopeHint' | translate: { depth: maxSlotDepth }"
        >
          <span><b>{{ l.nodes.length }}</b> {{ 'myTree.statsVisiblePositionsLabel' | translate }}</span>
          <span><b>{{ l.filledCount }}</b> {{ 'myTree.statsFilledLabel' | translate }}</span>
          <span><b>{{ l.vacantCount }}</b> {{ 'myTree.statsVacantLabel' | translate }}</span>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">{{ 'myTree.loadError' | translate }}</app-inline-banner>

      <div
        class="tree-explorer__canvas-wrap"
        #canvasWrap
        *ngIf="layout as l"
        [class.tree-explorer__canvas-wrap--grabbing]="isPanning"
      >
        <div class="tree-explorer__canvas-inner" #canvasInner [style.width.px]="l.contentWidth" [style.height.px]="l.contentHeight">
          <svg
            class="tree-explorer__link-layer"
            [attr.width]="l.contentWidth"
            [attr.height]="l.contentHeight"
            [attr.viewBox]="'0 0 ' + l.contentWidth + ' ' + l.contentHeight"
          >
            <path class="tree-explorer__link" *ngFor="let link of l.links; trackBy: trackLink" [attr.d]="linkPath(link)"></path>
          </svg>

          <div class="tree-explorer__node-layer">
            <ng-container *ngFor="let entry of l.nodes; trackBy: trackNode">
              <div
                class="tree-explorer__vacant-card"
                *ngIf="entry.vacant"
                [style.left.px]="cardLeft(entry)"
                [style.top.px]="cardTop(entry)"
              >
                <span class="material-symbols-outlined">add</span>
                <span>{{ 'myTree.vacantSlotLabel' | translate }}</span>
              </div>

              <div
                class="tree-explorer__node-card"
                *ngIf="!entry.vacant"
                [class.tree-explorer__node-card--highlight]="entry.id === selfNodeId"
                [style.left.px]="cardLeft(entry)"
                [style.top.px]="cardTop(entry)"
              >
                <span class="tree-explorer__result-tag" *ngIf="entry.id === selfNodeId">
                  {{ 'myTree.selfLabel' | translate }}
                </span>
                <span
                  class="tree-explorer__leg-badge"
                  *ngIf="entry.leg"
                  [class.tree-explorer__leg-badge--l]="entry.leg === 'L'"
                  [class.tree-explorer__leg-badge--r]="entry.leg === 'R'"
                >
                  {{ (entry.leg === 'L' ? 'myTree.positionLeftLabel' : 'myTree.positionRightLabel') | translate }}
                </span>

                <div class="tree-explorer__node-top">
                  <span class="tree-explorer__node-avatar" [class.tree-explorer__node-avatar--gold]="isGoldRank(entry.data.rankName)">
                    {{ entry.data.name.charAt(0) }}
                  </span>
                  <div class="tree-explorer__node-id-wrap">
                    <span class="tree-explorer__node-id">{{ entry.data.userId }}</span>
                    <span class="tree-explorer__node-role">{{ entry.data.name }}</span>
                  </div>
                  <span
                    class="tree-explorer__kyc-dot"
                    [class.tree-explorer__kyc-dot--verified]="entry.data.kycStatus === 'VERIFIED'"
                    [class.tree-explorer__kyc-dot--pending]="entry.data.kycStatus === 'PENDING'"
                    [class.tree-explorer__kyc-dot--rejected]="entry.data.kycStatus === 'REJECTED'"
                    [title]="entry.data.kycStatus"
                  ></span>
                  <span
                    class="material-symbols-outlined tree-explorer__flag-icon tree-explorer__flag-icon--skewed"
                    *ngIf="entry.data.skewedLegsFlag"
                    [title]="'myTree.skewedLegsFlag' | translate"
                  >
                    warning
                  </span>
                  <span
                    class="material-symbols-outlined tree-explorer__flag-icon tree-explorer__flag-icon--stagnant"
                    *ngIf="entry.data.stagnantFlag"
                    [title]="'myTree.stagnantFlag' | translate"
                  >
                    hourglass_disabled
                  </span>
                </div>

                <span class="tree-explorer__rank-pill" [class.tree-explorer__rank-pill--gold]="isGoldRank(entry.data.rankName)">
                  {{ entry.data.rankName ?? ('myTree.noRankLabel' | translate) }}
                </span>

                <div class="tree-explorer__vol-bar">
                  <div class="tree-explorer__vol-bar-fill" [style.width.%]="legLeftPercent(entry.data)"></div>
                </div>
                <div class="tree-explorer__vol-row">
                  <span>{{ 'myTree.leftLegLabel' | translate }}: &#8377;{{ entry.data.leftLegVolume | number }}</span>
                  <span>{{ 'myTree.rightLegLabel' | translate }}: &#8377;{{ entry.data.rightLegVolume | number }}</span>
                </div>
              </div>
            </ng-container>
          </div>
        </div>

        <div class="tree-explorer__hint" *ngIf="!hintDismissed">{{ 'myTree.panZoomHint' | translate }}</div>

        <div class="tree-explorer__zoom-controls">
          <button type="button" (click)="zoomIn()" [title]="'myTree.zoomInTitle' | translate">+</button>
          <button
            type="button"
            class="tree-explorer__fit-btn"
            (click)="fitToScreen(true)"
            [title]="'myTree.fitToScreenTitle' | translate"
          >
            {{ 'myTree.fitToScreenLabel' | translate }}
          </button>
          <button type="button" (click)="zoomOut()" [title]="'myTree.zoomOutTitle' | translate">&minus;</button>
        </div>

        <div class="tree-explorer__legend">
          <span><i class="tree-explorer__legend-dot tree-explorer__legend-dot--verified"></i>{{ 'myTree.legendVerifiedLabel' | translate }}</span>
          <span><i class="tree-explorer__legend-dot tree-explorer__legend-dot--pending"></i>{{ 'myTree.legendPendingLabel' | translate }}</span>
          <span><i class="tree-explorer__legend-dot tree-explorer__legend-dot--rejected"></i>{{ 'myTree.legendRejectedLabel' | translate }}</span>
        </div>
      </div>
    </div>
  `
})
export class MyTreeComponent implements OnInit, OnDestroy {
  private myTreeService = inject(MyTreeService);
  private ngZone = inject(NgZone);
  private injector = inject(Injector);

  readonly maxSlotDepth = DEFAULT_DEPTH;

  loadError = false;
  layout: TreeLayout | null = null;
  selfNodeId: string | null = null;
  isPanning = false;
  hintDismissed = false;

  private _root: TreeNode | null = null;
  get root(): TreeNode | null {
    return this._root;
  }
  set root(node: TreeNode | null) {
    this._root = node;
    this.layout = node ? buildTreeLayout(node, this.maxSlotDepth) : null;
    this.selfNodeId = node?.id ?? null;
  }

  private panZoom: PanZoomState = { x: 0, y: 0, scale: 1 };
  private attachedWrap: HTMLDivElement | null = null;
  private wrapCleanupFns: Array<() => void> = [];
  private activePointers = new Map<number, { x: number; y: number }>();
  private panFrom: { px: number; py: number; sx: number; sy: number } | null = null;
  private pinch: { dist: number; scale: number; mid: { x: number; y: number } } | null = null;
  private hintTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private resizeListener = () => this.fitToScreen(false);

  private _canvasWrapRef?: ElementRef<HTMLDivElement>;
  @ViewChild('canvasWrap')
  set canvasWrapRef(ref: ElementRef<HTMLDivElement> | undefined) {
    this._canvasWrapRef = ref;
    this.attachCanvasListeners(ref?.nativeElement ?? null);
  }
  get canvasWrapRef(): ElementRef<HTMLDivElement> | undefined {
    return this._canvasWrapRef;
  }

  @ViewChild('canvasInner') canvasInnerRef?: ElementRef<HTMLDivElement>;

  ngOnInit(): void {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('resize', this.resizeListener, { passive: true });
      this.hintTimeoutId = setTimeout(() => this.dismissHint(), HINT_TIMEOUT_MS);
    });
    this.loadMyTree();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeListener);
    if (this.hintTimeoutId !== null) clearTimeout(this.hintTimeoutId);
    this.detachCanvasListeners();
  }

  legLeftPercent(node: TreeNode): number {
    const total = node.leftLegVolume + node.rightLegVolume;
    return total === 0 ? 50 : (node.leftLegVolume / total) * 100;
  }

  legRightPercent(node: TreeNode): number {
    return 100 - this.legLeftPercent(node);
  }

  isGoldRank(rankName: string | null): boolean {
    return !!rankName && rankName.toLowerCase().includes('gold');
  }

  cardLeft(entry: LayoutEntry): number {
    return px(entry) - LAYOUT.CARD_W / 2;
  }

  cardTop(entry: LayoutEntry): number {
    return py(entry);
  }

  linkPath(link: LayoutLink): string {
    return linkPathD(link);
  }

  trackNode(_index: number, entry: LayoutEntry): string {
    return entry.id;
  }

  trackLink(_index: number, link: LayoutLink): string {
    return link.parent.id;
  }

  zoomIn(): void {
    this.zoomAtCenter(1.2);
  }

  zoomOut(): void {
    this.zoomAtCenter(1 / 1.2);
  }

  fitToScreen(animated: boolean): void {
    const wrap = this._canvasWrapRef?.nativeElement;
    if (!wrap || !this.layout) return;
    const rect = wrap.getBoundingClientRect();
    const next = computeFitTransform(this.layout.contentWidth, this.layout.contentHeight, rect.width, rect.height);
    this.applyTransform(next, animated);
  }

  private loadMyTree(): void {
    this.loadError = false;
    this.myTreeService.getMyTree(DEFAULT_DEPTH).subscribe({
      next: node => {
        this.root = node;
        this.scheduleFit(true);
      },
      error: () => {
        this.root = null;
        this.loadError = true;
      }
    });
  }

  private dismissHint(): void {
    this.ngZone.run(() => {
      this.hintDismissed = true;
    });
  }

  private scheduleFit(animated: boolean): void {
    afterNextRender(() => this.fitToScreen(animated), { injector: this.injector });
  }

  private zoomAtCenter(factor: number): void {
    const wrap = this._canvasWrapRef?.nativeElement;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    this.applyTransform(zoomAround(this.panZoom, rect.width / 2, rect.height / 2, factor), false);
  }

  private applyTransform(next: PanZoomState, animate: boolean): void {
    this.panZoom = next;
    const inner = this.canvasInnerRef?.nativeElement;
    if (!inner) return;
    if (animate) {
      inner.classList.add('tree-explorer__canvas-inner--animate');
      setTimeout(() => inner.classList.remove('tree-explorer__canvas-inner--animate'), FIT_ANIMATE_MS);
    }
    inner.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
  }

  // Duplicated verbatim from TreeExplorerComponent (not extracted -- see this plan's
  // "Decisions & Rationale" #3). If you're fixing a pointer/wheel bug here, check whether
  // TreeExplorerComponent has the same bug.
  private attachCanvasListeners(wrap: HTMLDivElement | null): void {
    if (this.attachedWrap === wrap) return;
    this.detachCanvasListeners();
    if (!wrap) return;
    this.attachedWrap = wrap;

    this.ngZone.runOutsideAngular(() => {
      const onPointerDown = (e: PointerEvent) => {
        if ((e.target as HTMLElement).closest('button')) return;
        this.dismissHint();
        wrap.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.activePointers.size === 1) {
          this.panFrom = { px: e.clientX, py: e.clientY, sx: this.panZoom.x, sy: this.panZoom.y };
          this.ngZone.run(() => (this.isPanning = true));
        } else if (this.activePointers.size === 2) {
          this.panFrom = null;
          const pts = Array.from(this.activePointers.values());
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const rect = wrap.getBoundingClientRect();
          this.pinch = {
            dist,
            scale: this.panZoom.scale,
            mid: { x: (pts[0].x + pts[1].x) / 2 - rect.left, y: (pts[0].y + pts[1].y) / 2 - rect.top }
          };
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!this.activePointers.has(e.pointerId)) return;
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.activePointers.size === 1 && this.panFrom) {
          const next = panBy(
            { x: this.panFrom.sx, y: this.panFrom.sy, scale: this.panZoom.scale },
            e.clientX - this.panFrom.px,
            e.clientY - this.panFrom.py
          );
          this.applyTransform(next, false);
        } else if (this.activePointers.size === 2 && this.pinch) {
          const pts = Array.from(this.activePointers.values());
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const next = pinchZoom(
            { x: this.panZoom.x, y: this.panZoom.y, scale: this.pinch.scale },
            this.pinch.dist,
            dist,
            this.pinch.mid.x,
            this.pinch.mid.y
          );
          this.applyTransform(next, false);
        }
      };

      const releasePointer = (e: PointerEvent) => {
        this.activePointers.delete(e.pointerId);
        if (this.activePointers.size < 2) this.pinch = null;
        if (this.activePointers.size === 1) {
          const p = Array.from(this.activePointers.values())[0];
          this.panFrom = { px: p.x, py: p.y, sx: this.panZoom.x, sy: this.panZoom.y };
        } else if (this.activePointers.size === 0) {
          this.panFrom = null;
          this.ngZone.run(() => (this.isPanning = false));
        }
      };

      const onPointerLeave = (e: PointerEvent) => {
        if (this.activePointers.size <= 1) releasePointer(e);
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = wrap.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.applyTransform(zoomAround(this.panZoom, e.clientX - rect.left, e.clientY - rect.top, factor), false);
      };

      wrap.addEventListener('pointerdown', onPointerDown, { passive: false });
      wrap.addEventListener('pointermove', onPointerMove, { passive: true });
      wrap.addEventListener('pointerup', releasePointer, { passive: true });
      wrap.addEventListener('pointercancel', releasePointer, { passive: true });
      wrap.addEventListener('pointerleave', onPointerLeave, { passive: true });
      wrap.addEventListener('wheel', onWheel, { passive: false });

      this.wrapCleanupFns = [
        () => wrap.removeEventListener('pointerdown', onPointerDown),
        () => wrap.removeEventListener('pointermove', onPointerMove),
        () => wrap.removeEventListener('pointerup', releasePointer),
        () => wrap.removeEventListener('pointercancel', releasePointer),
        () => wrap.removeEventListener('pointerleave', onPointerLeave),
        () => wrap.removeEventListener('wheel', onWheel)
      ];
    });
  }

  private detachCanvasListeners(): void {
    this.wrapCleanupFns.forEach(fn => fn());
    this.wrapCleanupFns = [];
    this.attachedWrap = null;
    this.activePointers.clear();
    this.panFrom = null;
    this.pinch = null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && ng test --include='**/my-tree/my-tree.component.spec.ts'`
Expected: PASS, all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/my-tree/my-tree.component.ts frontend/src/app/my-tree/my-tree.component.spec.ts
git commit -m "feat(my-tree): add MyTreeComponent, self-scoped view-only tree canvas"
```

---

## Task 3: Route, nav link, i18n keys

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `MyTreeComponent` (Task 2), existing `authGuard`, `associateOnlyGuard`.
- Produces: `/my-tree` route reachable from the header nav for any non-admin-family authenticated user; no new interface consumed by later units.

- [ ] **Step 1: Add the route**

In `frontend/src/app/app.routes.ts`, add the import next to the other associate-screen imports:

```typescript
import { MyTreeComponent } from './my-tree/my-tree.component';
```

Add the route entry directly after the existing `sales-history` route (keeps the associate-facing top-level routes grouped together):

```typescript
  { path: 'my-tree', component: MyTreeComponent, canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 2: Add the nav link**

In `frontend/src/app/app.component.html`, add the My Tree link inside the existing `*ngIf="!isAdminFamily"` group, between Dashboard and Sales History (matches the spec's own screen-list ordering: "Dashboard/Home, My Tree ..., Sales History ..."):

```html
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/dashboard" routerLinkActive="app-nav__link--active">{{ 'nav.dashboard' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/my-tree" routerLinkActive="app-nav__link--active">{{ 'nav.myTree' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/sales-history" routerLinkActive="app-nav__link--active">{{ 'nav.salesHistory' | translate }}</a>
```

- [ ] **Step 3: Update the existing nav-link tests**

In `frontend/src/app/app.component.spec.ts`, the test `shows the Dashboard and Sales History nav links for a plain associate role` currently asserts exactly two links for an `ASSOCIATE` role token. Update its translation-map fake and its expected array:

```typescript
      spyOn(translateService, 'get').and.callFake((key: string) => {
        const translations: { [key: string]: string } = {
          'nav.dashboard': 'Dashboard',
          'nav.myTree': 'My Tree',
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
      expect(links).toEqual(['Dashboard', 'My Tree', 'Sales History']);
```

The `shows Provision Associate and Settings but hides Dashboard for an admin-family role` test needs no change — My Tree is gated by the same `*ngIf="!isAdminFamily"` as Dashboard and Sales History, so it's already implicitly covered by that test never expecting it to appear. `hides the Dashboard nav link for every admin-family role` also needs no change — it only asserts on `a[href="/dashboard"]`.

- [ ] **Step 4: Add the i18n keys**

In `frontend/src/assets/i18n/en.json`, add to the `nav` object:

```json
    "myTree": "My Tree",
```

Add a new top-level `myTree` object (place it near `salesHistory`, matching the file's existing top-level key ordering by feature area):

```json
  "myTree": {
    "title": "My Tree",
    "subtitle": "Your own placement and downline — this view is scoped to you only.",
    "loadError": "Something went wrong loading your tree. Please try again.",
    "selfLabel": "You",
    "statsVisiblePositionsLabel": "visible positions",
    "statsFilledLabel": "filled",
    "statsVacantLabel": "vacant",
    "statsScopeHint": "Counts reflect the {{depth}} levels currently loaded below you, not your full downline.",
    "positionLeftLabel": "L",
    "positionRightLabel": "R",
    "vacantSlotLabel": "Vacant",
    "leftLegLabel": "Left leg",
    "rightLegLabel": "Right leg",
    "noRankLabel": "No rank",
    "skewedLegsFlag": "Skewed legs",
    "stagnantFlag": "Stagnant",
    "panZoomHint": "Drag to pan · scroll or pinch to zoom",
    "zoomInTitle": "Zoom in",
    "zoomOutTitle": "Zoom out",
    "fitToScreenLabel": "Fit",
    "fitToScreenTitle": "Fit to screen",
    "legendVerifiedLabel": "Verified",
    "legendPendingLabel": "Pending",
    "legendRejectedLabel": "Rejected"
  },
```

In `frontend/src/assets/i18n/hi.json`, add to the `nav` object:

```json
    "myTree": "मेरा ट्री",
```

Add the matching top-level `myTree` object:

```json
  "myTree": {
    "title": "मेरा ट्री",
    "subtitle": "आपकी स्वयं की स्थिति और डाउनलाइन — यह दृश्य केवल आपके लिए सीमित है।",
    "loadError": "आपका ट्री लोड करने में कुछ गड़बड़ी हुई। कृपया पुनः प्रयास करें।",
    "selfLabel": "आप",
    "statsVisiblePositionsLabel": "दृश्य पद",
    "statsFilledLabel": "भरे हुए",
    "statsVacantLabel": "खाली",
    "statsScopeHint": "गणना आपके नीचे वर्तमान में लोड किए गए {{depth}} स्तरों को दर्शाती है, आपकी पूरी डाउनलाइन को नहीं।",
    "positionLeftLabel": "L",
    "positionRightLabel": "R",
    "vacantSlotLabel": "खाली",
    "leftLegLabel": "बायां लेग",
    "rightLegLabel": "दायां लेग",
    "noRankLabel": "कोई रैंक नहीं",
    "skewedLegsFlag": "असंतुलित लेग",
    "stagnantFlag": "निष्क्रिय",
    "panZoomHint": "पैन करने के लिए खींचें · ज़ूम करने के लिए स्क्रॉल या पिंच करें",
    "zoomInTitle": "ज़ूम इन करें",
    "zoomOutTitle": "ज़ूम आउट करें",
    "fitToScreenLabel": "फ़िट करें",
    "fitToScreenTitle": "स्क्रीन में फ़िट करें",
    "legendVerifiedLabel": "सत्यापित",
    "legendPendingLabel": "लंबित",
    "legendRejectedLabel": "अस्वीकृत"
  },
```

Run both files through a JSON validator (`python3 -m json.tool en.json > /dev/null && python3 -m json.tool hi.json > /dev/null`) after editing — both are large hand-edited JSON files and a trailing-comma or bracket slip is easy to introduce.

- [ ] **Step 5: Run the updated/added tests**

Run: `cd frontend && ng test --include='**/app.component.spec.ts' --include='**/my-tree/**'`
Expected: PASS — all `AppComponent` tests (including the two updated nav-link tests) and both new `my-tree` spec files green.

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && ng test --watch=false`
Expected: PASS, no regressions anywhere else (nothing outside the five modified/four created files in this unit touches shared state).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/app.component.html frontend/src/app/app.component.spec.ts \
        frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(my-tree): route /my-tree, header nav link, i18n keys"
```

---

## Self-Review

**Spec coverage:**
- "My Tree (own subtree, view-only)" (Screens section) → Task 2's `MyTreeComponent`, read-only throughout (no form, no mutation call anywhere in the component or service).
- "Subtree rooted at self only — own direct downline + full L/R descendants" (matrix row) → consumes unit 5's already-self-scoped `GET /api/associates/me/tree` via `MyTreeService.getMyTree()`, which takes no associate-id parameter at all (Global Constraints, Decision 4).
- "No visibility into ancestors above self or siblings' other branches" → structurally true by construction: the component never requests, receives, or renders anything besides the response to a parameterless self-tree call; there is no ancestor/sibling data in `TreeNodeResponse`/`TreeNode` to begin with.
- "responsive web... designed and reviewed web-first" (role model section, point 4) → inherits this for free by reusing the admin Tree Explorer's existing canvas (pan/zoom/pinch), which was already built to that same responsive standard.

**Placeholder scan:** no TBD/TODO, no "same as Task N but adapted" hand-waves — full code given for the service, the component (including the full duplicated pointer/wheel wiring, not elided), both spec files, and every line of every modified file (routes, nav HTML, nav spec, both i18n objects).

**Type consistency:** `TreeNode` is imported, never redefined — same shape used identically in `my-tree.service.ts`, `my-tree.component.ts`, and both spec files. `MyTreeService.getMyTree(depth?: number): Observable<TreeNode>`'s signature is declared once in Task 1 and called identically in Task 2's `loadMyTree()`.

**Known, accepted gaps (documented, not hidden):**
- Pointer/wheel event-wiring is duplicated between `TreeExplorerComponent` and `MyTreeComponent` rather than shared (Decision 3) — a real cost, explicitly flagged with a follow-up recommendation rather than silently left for someone to discover later.
- `.tree-explorer__*` CSS class names are reused verbatim by a non-admin component (Decision 2) — a naming-hygiene tradeoff, not a functional gap, explicitly justified rather than silently done.
- Hindi translations for `myTree.*` are provided as reasonable, complete translations rather than left in English the way `hi.json`'s existing `salesHistory` object currently is (verified by direct read: `salesHistory`'s Hindi strings are untranslated English copies today, while `nav` and part of `admin.treeExplorer` are properly translated) — this unit does not "fix" that pre-existing inconsistency elsewhere in `hi.json`, only avoids introducing a fresh instance of it in its own new keys.

No gaps found against unit 12's acceptance criteria (spec-slicer row 12, "screen" type, depends on unit 5 — confirmed merged and read in full before this plan was written).
