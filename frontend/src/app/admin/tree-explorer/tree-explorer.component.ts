import { Component, ElementRef, Injector, NgZone, OnDestroy, OnInit, ViewChild, afterNextRender, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { NewAssociatePanelComponent, PresetParent } from '../new-associate-panel/new-associate-panel.component';
import { TreeExplorerService } from './tree-explorer.service';
import { TreeNode } from '../models/tree-node.model';
import { TreeNodeDetails } from '../models/tree-node-details.model';
import { FilledEntry, LAYOUT, LayoutEntry, LayoutLink, TreeLayout, VacantEntry, buildTreeLayout, linkPathD, px, py } from './tree-explorer-layout';
import { PanZoomState, computeFitTransform, panBy, zoomAround } from './tree-explorer-pan-zoom';

const DEFAULT_DEPTH = 3;
// The default whole-tree view requests the backend's hard maximum (also 5) so the admin
// sees as much of the company as the server will render in one shot; deeper nodes are
// reached by searching, which re-roots at DEFAULT_DEPTH.
const FULL_TREE_DEPTH = 5;
const HINT_TIMEOUT_MS = 3500;
const FIT_ANIMATE_MS = 460;
// Debounce before firing the hover-details request, so a mouse merely passing over several
// cards on its way elsewhere doesn't fire one request per card.
const HOVER_DEBOUNCE_MS = 150;

@Component({
  selector: 'app-tree-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent, NewAssociatePanelComponent],
  template: `
    <div class="tree-explorer card">
      <div class="tree-explorer__intro">
        <h1 class="card-title">{{ 'admin.treeExplorer.title' | translate }}</h1>
        <p class="tree-explorer__subtitle">{{ 'admin.treeExplorer.subtitle' | translate }}</p>
      </div>

      <div class="tree-explorer__controls-row">
        <div class="tree-explorer__search">
          <span class="material-symbols-outlined">search</span>
          <input
            type="text"
            [(ngModel)]="searchQuery"
            [placeholder]="'admin.treeExplorer.searchPlaceholder' | translate"
            (keydown.enter)="onSearch()"
          />
          <button type="button" (click)="onSearch()">{{ 'admin.treeExplorer.searchAction' | translate }}</button>
        </div>

        <div
          class="tree-explorer__stats-pill"
          *ngIf="layout as l"
          [title]="'admin.treeExplorer.statsScopeHint' | translate: { depth: maxSlotDepth }"
        >
          <span><b>{{ l.nodes.length }}</b> {{ 'admin.treeExplorer.statsVisiblePositionsLabel' | translate }}</span>
          <span><b>{{ l.filledCount }}</b> {{ 'admin.treeExplorer.statsFilledLabel' | translate }}</span>
          <span><b>{{ l.vacantCount }}</b> {{ 'admin.treeExplorer.statsVacantLabel' | translate }}</span>
        </div>
      </div>

      <app-inline-banner *ngIf="notFound" tone="warning">{{ 'admin.treeExplorer.notFound' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">{{ 'admin.treeExplorer.loadError' | translate }}</app-inline-banner>

      <div class="tree-explorer__empty" *ngIf="!root && !notFound && !loadError">
        <span class="material-symbols-outlined">account_tree</span>
        <p class="tree-explorer__empty-title">{{ 'admin.treeExplorer.emptyStateTitle' | translate }}</p>
        <p class="tree-explorer__empty-body">{{ 'admin.treeExplorer.emptyStateBody' | translate }}</p>
      </div>

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
              <button
                type="button"
                class="tree-explorer__vacant-card"
                *ngIf="entry.vacant"
                [style.left.px]="cardLeft(entry)"
                [style.top.px]="cardTop(entry)"
                (click)="openNewAssociatePanel(entry)"
              >
                <span class="material-symbols-outlined">add</span>
                <span>{{ 'admin.treeExplorer.vacantSlotLabel' | translate }}</span>
              </button>

              <div
                class="tree-explorer__node-card"
                *ngIf="!entry.vacant"
                [class.tree-explorer__node-card--highlight]="entry.id === highlightedNodeId"
                [style.left.px]="cardLeft(entry)"
                [style.top.px]="cardTop(entry)"
                (mouseenter)="onCardHoverStart(entry, $event)"
                (mouseleave)="onCardHoverEnd()"
              >
                <span class="tree-explorer__result-tag" *ngIf="entry.id === highlightedNodeId">
                  {{ 'admin.treeExplorer.searchResultLabel' | translate }}
                </span>
                <span
                  class="tree-explorer__leg-badge"
                  *ngIf="entry.leg"
                  [class.tree-explorer__leg-badge--l]="entry.leg === 'L'"
                  [class.tree-explorer__leg-badge--r]="entry.leg === 'R'"
                >
                  {{ (entry.leg === 'L' ? 'admin.treeExplorer.positionLeftLabel' : 'admin.treeExplorer.positionRightLabel') | translate }}
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
                    [title]="'admin.treeExplorer.skewedLegsFlag' | translate"
                  >
                    warning
                  </span>
                  <span
                    class="material-symbols-outlined tree-explorer__flag-icon tree-explorer__flag-icon--stagnant"
                    *ngIf="entry.data.stagnantFlag"
                    [title]="'admin.treeExplorer.stagnantFlag' | translate"
                  >
                    hourglass_disabled
                  </span>
                </div>

                <span class="tree-explorer__rank-pill">
                  {{ entry.data.rankName ?? ('admin.treeExplorer.noRankLabel' | translate) }}
                </span>

                <div class="tree-explorer__vol-bar">
                  <div class="tree-explorer__vol-bar-fill" [style.width.%]="legLeftPercent(entry.data)"></div>
                </div>
                <div class="tree-explorer__vol-row">
                  <span>{{ 'admin.treeExplorer.leftLegLabel' | translate }}: ₹{{ entry.data.leftLegVolume | number }}</span>
                  <span>{{ 'admin.treeExplorer.rightLegLabel' | translate }}: ₹{{ entry.data.rightLegVolume | number }}</span>
                </div>
              </div>
            </ng-container>
          </div>
        </div>

        <!-- Deliberately a sibling of #canvasInner, not nested inside it: canvasInner carries
             the JS-driven pan/zoom CSS transform, which would give a position:fixed descendant
             a new containing block and trap it (still clipped by canvas-wrap's overflow:hidden)
             instead of escaping to the viewport. -->
        <div
          class="tree-explorer__hover-card"
          *ngIf="hoveredNodeId"
          [style.left.px]="hoverPos?.left"
          [style.top.px]="hoverPos?.top"
        >
          <ng-container *ngIf="hoveredDetailsLoading">{{ 'admin.treeExplorer.hoverLoading' | translate }}</ng-container>
          <ng-container *ngIf="hoveredDetails as d">
            <div class="tree-explorer__hover-title">{{ d.name }} ({{ d.userId }})</div>
            <div>{{ 'admin.treeExplorer.hoverJoinedLabel' | translate }}: {{ d.joinedAt | date }}</div>
            <div>{{ 'admin.treeExplorer.hoverLeftIdLabel' | translate }}: {{ d.leftMemberId ?? '—' }}</div>
            <div>{{ 'admin.treeExplorer.hoverRightIdLabel' | translate }}: {{ d.rightMemberId ?? '—' }}</div>
            <div>{{ 'admin.treeExplorer.hoverTotalLeftMembersLabel' | translate }}: {{ d.totalLeftMembers }}</div>
            <div>{{ 'admin.treeExplorer.hoverTotalRightMembersLabel' | translate }}: {{ d.totalRightMembers }}</div>
            <div>{{ 'admin.treeExplorer.hoverActiveLeftMembersLabel' | translate }}: {{ d.activeLeftMembers }}</div>
            <div>{{ 'admin.treeExplorer.hoverActiveRightMembersLabel' | translate }}: {{ d.activeRightMembers }}</div>
            <div>{{ 'admin.treeExplorer.hoverTotalLeftBusinessLabel' | translate }}: ₹{{ d.totalLeftBusiness | number }}</div>
            <div>{{ 'admin.treeExplorer.hoverTotalRightBusinessLabel' | translate }}: ₹{{ d.totalRightBusiness | number }}</div>
            <div>{{ 'admin.treeExplorer.hoverTotalSelfBusinessLabel' | translate }}: ₹{{ d.totalSelfBusiness | number }}</div>
          </ng-container>
        </div>

        <div class="tree-explorer__hint" *ngIf="!hintDismissed">{{ 'admin.treeExplorer.panZoomHint' | translate }}</div>

        <div class="tree-explorer__zoom-controls">
          <button type="button" (click)="zoomIn()" [title]="'admin.treeExplorer.zoomInTitle' | translate">+</button>
          <button
            type="button"
            class="tree-explorer__fit-btn"
            (click)="fitToScreen(true)"
            [title]="'admin.treeExplorer.fitToScreenTitle' | translate"
          >
            {{ 'admin.treeExplorer.fitToScreenLabel' | translate }}
          </button>
          <button type="button" (click)="zoomOut()" [title]="'admin.treeExplorer.zoomOutTitle' | translate">&minus;</button>
        </div>

        <div class="tree-explorer__legend">
          <span><i class="tree-explorer__legend-dot tree-explorer__legend-dot--verified"></i>{{ 'admin.treeExplorer.legendVerifiedLabel' | translate }}</span>
          <span><i class="tree-explorer__legend-dot tree-explorer__legend-dot--pending"></i>{{ 'admin.treeExplorer.legendPendingLabel' | translate }}</span>
          <span><i class="tree-explorer__legend-dot tree-explorer__legend-dot--rejected"></i>{{ 'admin.treeExplorer.legendRejectedLabel' | translate }}</span>
        </div>
      </div>
    </div>

    <app-new-associate-panel
      [open]="panelOpen"
      [presetParent]="presetParent"
      (closed)="closeNewAssociatePanel()"
      (created)="onAssociateCreated()"
    ></app-new-associate-panel>
  `
})
export class TreeExplorerComponent implements OnInit, OnDestroy {
  private treeExplorerService = inject(TreeExplorerService);
  private ngZone = inject(NgZone);
  private injector = inject(Injector);

  readonly maxSlotDepth = DEFAULT_DEPTH;

  searchQuery = '';
  notFound = false;
  loadError = false;
  layout: TreeLayout | null = null;
  highlightedNodeId: string | null = null;
  isPanning = false;
  hintDismissed = false;
  panelOpen = false;
  presetParent: PresetParent | null = null;

  hoveredNodeId: string | null = null;
  hoveredDetails: TreeNodeDetails | null = null;
  hoveredDetailsLoading = false;
  hoverPos: { left: number; top: number } | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;

  // Re-runs whichever load produced the currently visible tree (default company-tree load or a
  // search-derived subtree), so a fresh associate created from a vacant slot reliably replaces
  // that slot without guessing which endpoint/depth is "current".
  private reload: (() => void) | null = null;

  private _root: TreeNode | null = null;
  get root(): TreeNode | null {
    return this._root;
  }
  set root(node: TreeNode | null) {
    this._root = node;
    this.layout = node ? buildTreeLayout(node, this.maxSlotDepth) : null;
    this.highlightedNodeId = node?.id ?? null;
  }

  private panZoom: PanZoomState = { x: 0, y: 0, scale: 1 };
  private attachedWrap: HTMLDivElement | null = null;
  private wrapCleanupFns: Array<() => void> = [];
  private activePointers = new Map<number, { x: number; y: number }>();
  private panFrom: { px: number; py: number; sx: number; sy: number } | null = null;
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

    this.reload = () => this.loadCompanyTree();
    this.loadCompanyTree();
  }

  // Default view: the whole company tree rooted at the founding admin, no search needed.
  private loadCompanyTree(): void {
    this.treeExplorerService.companyTree(FULL_TREE_DEPTH).subscribe({
      next: node => {
        this.root = node;
        // The root setter marks node.id as the highlighted node, which paints the
        // "search result" tag. That tag is meaningless for the default root -- clear it.
        this.highlightedNodeId = null;
        this.scheduleFit(false);
      },
      error: () => {
        this.root = null;
        this.loadError = true;
      }
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeListener);
    if (this.hintTimeoutId !== null) clearTimeout(this.hintTimeoutId);
    if (this.hoverTimer !== null) clearTimeout(this.hoverTimer);
    this.detachCanvasListeners();
  }

  onCardHoverStart(entry: FilledEntry, event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.hoverPos = { left: rect.right + 12, top: rect.top };
    this.hoveredNodeId = entry.id;
    this.hoveredDetails = null;
    if (this.hoverTimer !== null) clearTimeout(this.hoverTimer);
    this.hoverTimer = setTimeout(() => this.loadNodeDetails(entry.id), HOVER_DEBOUNCE_MS);
  }

  onCardHoverEnd(): void {
    if (this.hoverTimer !== null) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    this.hoveredNodeId = null;
    this.hoveredDetails = null;
    this.hoveredDetailsLoading = false;
    this.hoverPos = null;
  }

  private loadNodeDetails(associateId: string): void {
    this.hoveredDetailsLoading = true;
    this.treeExplorerService.nodeDetails(associateId).subscribe({
      next: details => {
        // Guards against a stale response landing after the mouse has already moved to (or
        // off) a different card -- no real request cancellation, matching this component's
        // existing subscribe-without-teardown style everywhere else.
        if (this.hoveredNodeId === associateId) {
          this.hoveredDetails = details;
          this.hoveredDetailsLoading = false;
        }
      },
      error: () => {
        if (this.hoveredNodeId === associateId) {
          this.hoveredDetailsLoading = false;
        }
      }
    });
  }

  onSearch(): void {
    if (!this.searchQuery) return;
    this.notFound = false;
    this.loadError = false;
    this.treeExplorerService.search(this.searchQuery).subscribe({
      next: result => {
        const target = result.ancestorPath[result.ancestorPath.length - 1];
        this.reload = () => this.loadSubtree(target.id);
        this.loadSubtree(target.id);
      },
      error: () => {
        this.root = null;
        this.notFound = true;
      }
    });
  }

  private loadSubtree(associateId: string): void {
    this.treeExplorerService.subtree(associateId, DEFAULT_DEPTH).subscribe({
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

  openNewAssociatePanel(entry: VacantEntry): void {
    this.presetParent = { parentId: entry.parentId, leg: entry.leg!, parentUserId: entry.parentUserId, parentName: entry.parentName };
    this.panelOpen = true;
  }

  closeNewAssociatePanel(): void {
    this.panelOpen = false;
  }

  onAssociateCreated(): void {
    // Reload the tree in the background so the vacant slot becomes filled once the admin
    // dismisses the panel -- don't close it here, or the temporary-password success screen
    // (shown inside the panel until "Done") would never be seen.
    this.reload?.();
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

  private attachCanvasListeners(wrap: HTMLDivElement | null): void {
    if (this.attachedWrap === wrap) return;
    this.detachCanvasListeners();
    if (!wrap) return;
    this.attachedWrap = wrap;

    this.ngZone.runOutsideAngular(() => {
      const onPointerDown = (e: PointerEvent) => {
        // Zoom controls (and any other future interactive control inside the canvas) sit
        // inside canvas-wrap, so their pointerdown bubbles here too. Capturing the pointer
        // unconditionally would redirect the click event's targeting to wrap once captured
        // (per the Pointer Events spec, a captured pointer's compatibility mouse events --
        // including click -- retarget to the capturing element), silently swallowing the
        // button's own (click) binding. Let clicks on controls pass through untouched.
        if ((e.target as HTMLElement).closest('button')) return;
        this.dismissHint();
        wrap.setPointerCapture(e.pointerId);
        this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.activePointers.size === 1) {
          this.panFrom = { px: e.clientX, py: e.clientY, sx: this.panZoom.x, sy: this.panZoom.y };
          this.ngZone.run(() => (this.isPanning = true));
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
        }
      };

      const releasePointer = (e: PointerEvent) => {
        this.activePointers.delete(e.pointerId);
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

      wrap.addEventListener('pointerdown', onPointerDown, { passive: false });
      wrap.addEventListener('pointermove', onPointerMove, { passive: true });
      wrap.addEventListener('pointerup', releasePointer, { passive: true });
      wrap.addEventListener('pointercancel', releasePointer, { passive: true });
      wrap.addEventListener('pointerleave', onPointerLeave, { passive: true });

      this.wrapCleanupFns = [
        () => wrap.removeEventListener('pointerdown', onPointerDown),
        () => wrap.removeEventListener('pointermove', onPointerMove),
        () => wrap.removeEventListener('pointerup', releasePointer),
        () => wrap.removeEventListener('pointercancel', releasePointer),
        () => wrap.removeEventListener('pointerleave', onPointerLeave)
      ];
    });
  }

  private detachCanvasListeners(): void {
    this.wrapCleanupFns.forEach(fn => fn());
    this.wrapCleanupFns = [];
    this.attachedWrap = null;
    this.activePointers.clear();
    this.panFrom = null;
  }
}
