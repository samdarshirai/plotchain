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

      <div class="plot-availability__empty" *ngIf="loadedProjects && !projects.length && !projectsError">
        <h2>{{ 'plotBookings.noProjectsTitle' | translate }}</h2>
        <p>{{ 'plotBookings.noProjectsBody' | translate }}</p>
      </div>

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
            <div class="plot-availability__chips" role="group" [attr.aria-label]="'plotBookings.popover.status' | translate">
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
        <p class="plot-availability__hint" *ngIf="s.status === 'AVAILABLE'">{{ 'plotBookings.popover.hint' | translate }}</p>
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
  loadedProjects = false;
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
        this.loadedProjects = true;
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
        if (this.selected) { this.selected = grid.find(g => g.plotId === this.selected!.plotId) ?? null; }
        this.rebuild();
      },
      error: () => {
        if (id !== this.projectId) { return; }
        this.loadingGrid = false;
        this.gridError = true;
      }
    });
  }

  setStatus(f: StatusFilter): void { this.statusFilter = f; this.selected = null; this.rebuild(); }
  setType(t: string): void { this.typeFilter = t as TypeFilter; this.selected = null; this.rebuild(); }
  clearFilters(): void { this.statusFilter = 'ALL'; this.typeFilter = 'ALL'; this.selected = null; this.rebuild(); }

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
