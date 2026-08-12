import { Component, ElementRef, Injector, NgZone, OnDestroy, OnInit, ViewChild, afterNextRender, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { TreeExplorerService } from './tree-explorer.service';
import { TreeNode } from '../models/tree-node.model';
import { LAYOUT, LayoutEntry, LayoutLink, TreeLayout, buildTreeLayout, linkPathD, px, py } from './tree-explorer-layout';
import { PanZoomState, computeFitTransform, panBy, pinchZoom, zoomAround } from './tree-explorer-pan-zoom';

const DEFAULT_DEPTH = 3;
const HINT_TIMEOUT_MS = 3500;
const FIT_ANIMATE_MS = 460;

@Component({
  selector: 'app-tree-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent],
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
              <div
                class="tree-explorer__vacant-card"
                *ngIf="entry.vacant"
                [style.left.px]="cardLeft(entry)"
                [style.top.px]="cardTop(entry)"
              >
                <span class="material-symbols-outlined">add</span>
                <span>{{ 'admin.treeExplorer.vacantSlotLabel' | translate }}</span>
              </div>

              <div
                class="tree-explorer__node-card"
                *ngIf="!entry.vacant"
                [class.tree-explorer__node-card--highlight]="entry.id === highlightedNodeId"
                [style.left.px]="cardLeft(entry)"
                [style.top.px]="cardTop(entry)"
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

                <span class="tree-explorer__rank-pill" [class.tree-explorer__rank-pill--gold]="isGoldRank(entry.data.rankName)">
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
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeListener);
    if (this.hintTimeoutId !== null) clearTimeout(this.hintTimeoutId);
    this.detachCanvasListeners();
  }

  onSearch(): void {
    if (!this.searchQuery) return;
    this.notFound = false;
    this.loadError = false;
    this.treeExplorerService.search(this.searchQuery).subscribe({
      next: result => {
        const target = result.ancestorPath[result.ancestorPath.length - 1];
        this.treeExplorerService.subtree(target.id, DEFAULT_DEPTH).subscribe({
          next: node => {
            this.root = node;
            this.scheduleFit(true);
          },
          error: () => {
            this.root = null;
            this.loadError = true;
          }
        });
      },
      error: () => {
        this.root = null;
        this.notFound = true;
      }
    });
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
