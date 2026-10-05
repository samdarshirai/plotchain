import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, catchError, of } from 'rxjs';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Plot, PlotRequest, PlotStatus, Project, ProjectRequest } from '../../setup/models/project.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PlotTileComponent } from '../../shared/components/plot-tile/plot-tile.component';
import {
  PlotBlock, PlotGridItem, StatusCounts, countByStatus, formatArea, formatInr, groupIntoBlocks
} from '../../shared/utils/plot-grid.util';
import { CsvImportPanelComponent } from './csv-import-panel.component';
import { PlotFormComponent } from './plot-form.component';
import { ProjectFormComponent } from './project-form.component';
import { ProjectsPlotsService } from './projects-plots.service';
import { BookPlotFormComponent } from './book-plot-form.component';
import { BookingEmiConfig, BookingFormValue } from './projects-plots.model';

type Aside =
  | { kind: 'none' }
  | { kind: 'detail' }
  | { kind: 'book' }
  | { kind: 'editPlot' }
  | { kind: 'addPlot' }
  | { kind: 'project'; mode: 'add' | 'edit' }
  | { kind: 'csv' };

interface Banner {
  tone: 'success' | 'warning' | 'danger';
  key?: string;
  params?: Record<string, unknown>;
  text?: string;
  bookingId?: string;
}

type View = 'grid' | 'site' | 'table';

const STATUSES: PlotStatus[] = ['AVAILABLE', 'BOOKED', 'SOLD'];

@Component({
  selector: 'app-projects-plots',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, InlineBannerComponent, PlotTileComponent, PlotFormComponent, ProjectFormComponent, CsvImportPanelComponent, BookPlotFormComponent],
  template: `
    <div class="projects-plots">
      <div class="projects-plots__head">
        <div class="projects-plots__intro">
          <span class="projects-plots__eyebrow">{{ 'admin.projectsPlots.eyebrow' | translate }}<ng-container *ngIf="selectedProject"> · {{ selectedProject.name }}</ng-container></span>
          <h1 class="projects-plots__title">{{ selectedProject ? selectedProject.name + ', ' + selectedProject.location : ('admin.projectsPlots.title' | translate) }}</h1>
        </div>
        <div class="projects-plots__views" *ngIf="selectedProject && grid" role="group" [attr.aria-label]="'admin.projectsPlots.viewLabel' | translate">
          <button type="button" *ngFor="let v of views" [class.projects-plots__view--on]="view === v" [attr.aria-pressed]="view === v" (click)="view = v">
            {{ 'admin.projectsPlots.view.' + v | translate }}
          </button>
        </div>
      </div>

      <div class="projects-plots__toolbar">
        <label class="projects-plots__project-select" *ngIf="projects?.length">
          <span class="projects-plots__sr">{{ 'admin.projectsPlots.projectSelectLabel' | translate }}</span>
          <select (change)="selectProjectById($any($event.target).value)">
            <option *ngFor="let p of projects" [value]="p.id" [selected]="p.id === selectedProject?.id">{{ p.name }}</option>
          </select>
        </label>
        <div class="projects-plots__project-actions" *ngIf="selectedProject">
          <button type="button" class="brand-button brand-button--secondary" (click)="openAside({ kind: 'project', mode: 'edit' })">{{ 'admin.projectsPlots.editProjectAction' | translate }}</button>
          <button type="button" class="brand-button brand-button--secondary" (click)="openAside({ kind: 'csv' })">{{ 'admin.projectsPlots.importCsvAction' | translate }}</button>
          <button type="button" class="brand-button brand-button--secondary" (click)="openAside({ kind: 'addPlot' })">{{ 'admin.projectsPlots.addPlotAction' | translate }}</button>
        </div>
        <button type="button" class="brand-button projects-plots__add-project" (click)="openAside({ kind: 'project', mode: 'add' })">
          {{ 'admin.projectsPlots.addProjectAction' | translate }}
        </button>
      </div>

      <!-- Shared by the aside and the page level; only one is rendered at a time. -->
      <ng-template #bannerTpl>
        <app-inline-banner *ngIf="banner as b" [tone]="b.tone" [dismissible]="true" (dismissed)="banner = null">
          <span [attr.role]="b.tone === 'success' ? 'status' : 'alert'">
            {{ b.key ? (b.key | translate: b.params) : b.text }}
            <a *ngIf="b.bookingId" [routerLink]="['/settings/bookings-emi']" [queryParams]="{ booking: b.bookingId }">{{ 'admin.projectsPlots.banner.viewBooking' | translate }}</a>
          </span>
        </app-inline-banner>
      </ng-template>
      <ng-container *ngIf="aside.kind === 'none'"><ng-container *ngTemplateOutlet="bannerTpl"></ng-container></ng-container>

      <app-inline-banner *ngIf="projectsError" tone="danger">{{ 'admin.projectsPlots.error.loadProjects' | translate }}</app-inline-banner>

      <div class="projects-plots__empty" *ngIf="projects && !projects.length">
        <h2>{{ 'admin.projectsPlots.empty.noProjectsTitle' | translate }}</h2>
        <p>{{ 'admin.projectsPlots.empty.noProjectsBody' | translate }}</p>
      </div>

      <div class="projects-plots__layout" [class.projects-plots__layout--aside]="aside.kind !== 'none'" *ngIf="projects">
        <!-- (a) master list; a <select> stands in below 1024px -->
        <nav class="projects-plots__list" *ngIf="projects.length" [attr.aria-label]="'admin.projectsPlots.projectsHeading' | translate">
          <h2 class="projects-plots__list-heading">{{ 'admin.projectsPlots.projectsHeading' | translate }}</h2>
          <button type="button" *ngFor="let p of projects" class="projects-plots__project"
            [class.projects-plots__project--selected]="p.id === selectedProject?.id"
            [attr.aria-current]="p.id === selectedProject?.id ? 'true' : null" (click)="selectProject(p)">
            <span class="projects-plots__project-name">{{ p.name }}</span>
            <span class="projects-plots__project-loc">{{ p.location }}</span>
            <span class="projects-plots__bar" aria-hidden="true">
              <span class="projects-plots__bar-seg projects-plots__bar-seg--available" [style.flex-grow]="p.availablePlots"></span>
              <span class="projects-plots__bar-seg projects-plots__bar-seg--booked" [style.flex-grow]="bookedCount(p)"></span>
              <span class="projects-plots__bar-seg projects-plots__bar-seg--sold" [style.flex-grow]="p.soldPlots"></span>
            </span>
            <span class="projects-plots__project-count">{{ 'admin.projectsPlots.plotsSummary' | translate: { total: p.totalPlots, available: p.availablePlots } }}</span>
          </button>
        </nav>
        <!-- (b) project header + legend + grid -->
        <section class="projects-plots__main" *ngIf="selectedProject as sp">
          <app-inline-banner *ngIf="gridError" tone="danger">
            {{ 'admin.projectsPlots.error.loadGrid' | translate }}
            <button type="button" class="projects-plots__retry" (click)="loadGrid()">{{ 'admin.projectsPlots.retry' | translate }}</button>
          </app-inline-banner>

          <div class="projects-plots__skeleton" role="status" *ngIf="!grid && !gridError">
            <span class="projects-plots__sr">{{ 'admin.projectsPlots.loading' | translate }}</span>
            <span class="projects-plots__skeleton-tile" *ngFor="let i of [1,2,3,4,5,6,7,8]"></span>
          </div>

          <ng-container *ngIf="grid">
            <ng-template #legendTpl>
              <div class="projects-plots__legend" role="group" [attr.aria-label]="'admin.projectsPlots.legendLabel' | translate">
                <button type="button" *ngFor="let s of statuses" class="projects-plots__key"
                  [class.projects-plots__key--on]="filter.has(s)" [attr.aria-pressed]="filter.has(s)" (click)="toggleFilter(s)">
                  <span class="projects-plots__swatch projects-plots__swatch--{{ s.toLowerCase() }}" aria-hidden="true"></span>
                  {{ 'admin.projectsPlots.status.' + s | translate }} <span class="projects-plots__key-count">{{ counts[s] }}</span>
                </button>
                <span class="projects-plots__key projects-plots__key--static">
                  <span class="projects-plots__swatch projects-plots__swatch--selected" aria-hidden="true"></span>{{ 'admin.projectsPlots.selectedKey' | translate }}
                </span>
                <span class="projects-plots__key projects-plots__key--static">
                  <span class="projects-plots__swatch projects-plots__swatch--corner" aria-hidden="true"></span>{{ 'admin.projectsPlots.cornerNote' | translate }}
                </span>
              </div>
            </ng-template>

            <div class="projects-plots__empty" *ngIf="!grid.length">
              <h2>{{ 'admin.projectsPlots.empty.noPlotsTitle' | translate }}</h2>
              <p>{{ 'admin.projectsPlots.empty.noPlotsBody' | translate }}</p>
            </div>
            <p class="projects-plots__empty" *ngIf="grid.length && !visibleBlocks.length">{{ 'admin.projectsPlots.empty.filter' | translate }}</p>

            <div class="projects-plots__table-wrap" *ngIf="view === 'table' && visibleBlocks.length">
              <table class="projects-plots__table">
                <thead><tr>
                  <th scope="col">{{ 'admin.projectsPlots.table.plot' | translate }}</th>
                  <th scope="col">{{ 'admin.projectsPlots.table.area' | translate }}</th>
                  <th scope="col" class="projects-plots__num">{{ 'admin.projectsPlots.table.total' | translate }}</th>
                  <th scope="col">{{ 'admin.projectsPlots.table.status' | translate }}</th>
                </tr></thead>
                <tbody>
                  <ng-container *ngFor="let b of visibleBlocks; trackBy: trackBlock">
                    <tr *ngFor="let p of b.plots; trackBy: trackPlot" [attr.data-plot-id]="p.plotId" class="projects-plots__row"
                      [class.projects-plots__row--selected]="p.plotId === selectedPlotId">
                      <td><button type="button" class="projects-plots__row-btn" [attr.aria-pressed]="p.plotId === selectedPlotId" (click)="selectPlot(p)">{{ p.plotNo }}</button>
                        <span class="projects-plots__corner" *ngIf="p.type === 'CORNER'">{{ 'plotTile.corner' | translate }}</span></td>
                      <td>{{ areaText(p.area) }} {{ 'plotTile.sqft' | translate }}</td>
                      <td class="projects-plots__num">{{ priceText(p.price) }}</td>
                      <td><span class="projects-plots__pill projects-plots__pill--{{ p.status.toLowerCase() }}">{{ 'plotTile.status.' + p.status | translate }}</span></td>
                    </tr>
                  </ng-container>
                </tbody>
              </table>
            </div>
            <ng-container *ngIf="view === 'table' && grid.length"><ng-container *ngTemplateOutlet="legendTpl"></ng-container></ng-container>

            <div class="projects-plots__panel" [class.projects-plots__panel--site]="view === 'site'" *ngIf="view !== 'table' && grid.length">
            <ng-container *ngFor="let b of visibleBlocks; trackBy: trackBlock; let i = index; let last = last">
            <section class="projects-plots__block" [class.projects-plots__block--road-below]="i % 2 === 0">
              <h3 class="projects-plots__block-heading" *ngIf="b.block">
                {{ 'admin.projectsPlots.blockHeading' | translate: { block: b.block } }}
                <span>{{ 'admin.projectsPlots.blockSummary' | translate: blockStats[b.block] }}</span>
              </h3>
              <ul class="projects-plots__tiles" [class.projects-plots__tiles--site]="view === 'site'">
                <li *ngFor="let p of b.plots; trackBy: trackPlot">
                  <app-plot-tile [attr.data-plot-id]="p.plotId" [plotNo]="p.plotNo" [type]="p.type" [area]="p.area"
                    [price]="p.price" [status]="p.status" [selected]="p.plotId === selectedPlotId" [plan]="true" (tileSelect)="selectPlot(p)"></app-plot-tile>
                </li>
              </ul>
            </section>
            <div class="projects-plots__road" *ngIf="view === 'site' && !last" aria-hidden="true">{{ 'admin.projectsPlots.roadLabel' | translate }}</div>
            </ng-container>
              <div class="projects-plots__main-road" *ngIf="view === 'site' && selectedProject">{{ selectedProject.name }}</div>
              <ng-container *ngTemplateOutlet="legendTpl"></ng-container>
            </div>
          </ng-container>
        </section>

        <!-- (c/d) aside: one region, swapped content. Task 5-7 add the form cases. -->
        <div class="projects-plots__scrim" *ngIf="aside.kind !== 'none'" (click)="closeAside()"></div>
        <aside class="projects-plots__aside" *ngIf="aside.kind !== 'none'" [attr.aria-label]="'admin.projectsPlots.title' | translate">
          <ng-container *ngTemplateOutlet="bannerTpl"></ng-container>
          <div class="projects-plots__aside-head" *ngIf="aside.kind === 'detail' || aside.kind === 'book'">
            <span class="projects-plots__aside-eyebrow">{{ (aside.kind === 'book' ? 'admin.projectsPlots.drawerBook' : 'admin.projectsPlots.drawerDetail') | translate }}</span>
            <button type="button" class="projects-plots__aside-close" [attr.aria-label]="'admin.projectsPlots.closeAction' | translate" (click)="closeAside()">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>
          <ng-container *ngIf="aside.kind === 'detail' && selectedPlot as sel">
            <h2 class="projects-plots__aside-title">{{ sel.plotNo }}</h2>
            <dl class="projects-plots__facts">
              <dt>{{ 'admin.projectsPlots.factsType' | translate }}</dt><dd>{{ 'plotTile.type.' + sel.type | translate }}</dd>
              <dt>{{ 'admin.projectsPlots.factsArea' | translate }}</dt><dd>{{ areaText(sel.area) }}</dd>
              <dt>{{ 'admin.projectsPlots.factsRate' | translate }}</dt><dd>{{ plotDetail?.rate != null ? plotDetail!.rate.toLocaleString('en-IN') : '—' }}</dd>
              <dt>{{ 'admin.projectsPlots.factsPrice' | translate }}</dt><dd>{{ priceText(sel.price) }}</dd>
              <dt>{{ 'admin.projectsPlots.statusLabel' | translate }}</dt><dd>{{ 'plotTile.status.' + sel.status | translate }}</dd>
            </dl>
            <div class="projects-plots__aside-actions">
              <button type="button" class="brand-button projects-plots__book" [disabled]="sel.status !== 'AVAILABLE'"
                [attr.aria-describedby]="sel.status !== 'AVAILABLE' ? 'book-disabled-reason' : null" (click)="openAside({ kind: 'book' })">
                {{ 'admin.projectsPlots.bookAction' | translate }}
              </button>
              <button type="button" *ngIf="plotDetail" class="brand-button brand-button--secondary projects-plots__edit-plot" (click)="openAside({ kind: 'editPlot' })">
                {{ 'admin.projectsPlots.editPlotAction' | translate }}
              </button>
            </div>
            <p id="book-disabled-reason" class="projects-plots__reason" *ngIf="sel.status !== 'AVAILABLE'">
              {{ (sel.status === 'BOOKED' ? 'admin.projectsPlots.bookDisabledBooked' : 'admin.projectsPlots.bookDisabledSold') | translate }}
            </p>
          </ng-container>

          <app-book-plot-form *ngIf="aside.kind === 'book' && selectedPlot" [plot]="selectedPlot" [associates]="associates"
            [emiConfig]="emiConfig" [busy]="bookingBusy" (submitted)="submitBooking($event)" (cancelled)="backToDetail('.projects-plots__book')"></app-book-plot-form>
          <app-plot-form *ngIf="aside.kind === 'editPlot' && selectedPlot && plotDetail"
            [plot]="plotDetail" [locked]="plotDetail.status !== 'AVAILABLE' || selectedPlot.status !== 'AVAILABLE'" [busy]="busy" [duplicatePlotNo]="duplicatePlotNo"
            (submitted)="saveEditedPlot($event)" (cancelled)="backToDetail('.projects-plots__edit-plot')"></app-plot-form>
          <app-plot-form *ngIf="aside.kind === 'addPlot'" [plot]="null" [busy]="busy" [duplicatePlotNo]="duplicatePlotNo"
            (submitted)="saveNewPlot($event)" (cancelled)="closeAside()"></app-plot-form>
          <app-project-form *ngIf="aside.kind === 'project'" [project]="aside.mode === 'edit' ? selectedProject : null" [busy]="busy"
            (submitted)="saveProject($event)" (cancelled)="closeAside()"></app-project-form>
          <app-csv-import-panel *ngIf="aside.kind === 'csv' && selectedProject" [projectId]="selectedProject.id"
            (imported)="onCsvImported()" (cancelled)="closeAside()"></app-csv-import-panel>
        </aside>
      </div>
    </div>
  `
})
export class ProjectsPlotsComponent implements OnInit {
  protected projectsService = inject(ProjectsService);
  protected plotsService = inject(ProjectsPlotsService);
  private adminService = inject(AdminService);

  readonly statuses = STATUSES;
  readonly views: View[] = ['grid', 'site', 'table'];
  view: View = 'grid';
  projects: Project[] | null = null;
  projectsError = false;
  selectedProject: Project | null = null;
  grid: PlotGridItem[] | null = null;
  gridError = false;
  filter = new Set<PlotStatus>();
  counts: StatusCounts = { AVAILABLE: 0, BOOKED: 0, SOLD: 0 };
  visibleBlocks: PlotBlock[] = [];
  blockStats: Record<string, { available: number; total: number }> = {};
  selectedPlotId: string | null = null;
  plotDetail: Plot | null = null;
  aside: Aside = { kind: 'none' };
  banner: Banner | null = null;
  busy = false;        // a plot/project save is in flight
  bookingBusy = false; // a booking request is in flight (separate so forms don't show each other's state)
  duplicatePlotNo = false;
  associates: AssociateSummary[] = [];
  emiConfig: BookingEmiConfig | null = null;
  private opener: HTMLElement | null = null;

  get selectedPlot(): PlotGridItem | null {
    return this.grid?.find(p => p.plotId === this.selectedPlotId) ?? null;
  }

  ngOnInit(): void {
    // Only role ASSOCIATE can sell; the summary has no status field (see plan Deviation 2).
    this.adminService.listAssociates().pipe(catchError(() => of([] as AssociateSummary[])))
      .subscribe(list => (this.associates = list.filter(a => a.role === 'ASSOCIATE' && a.status === 'ACTIVE')));
    // EMI preview is a nicety: an unreadable config hides the preview, never blocks the form.
    this.plotsService.getEmiConfig().pipe(catchError(() => of(null))).subscribe(c => (this.emiConfig = c));
    this.reloadProjects();
  }

  reloadProjects(selectId?: string, banner?: Banner): void {
    this.projectsService.listProjects().subscribe({
      next: list => {
        this.projects = list;
        this.projectsError = false;
        const keep = selectId ?? this.selectedProject?.id;
        const next = list.find(p => p.id === keep) ?? list[0] ?? null;
        if (next && next.id !== this.selectedProject?.id) {
          this.selectProject(next);
        } else {
          this.selectedProject = next;
        }
        if (banner) { this.banner = banner; } // after selectProject, which clears banners
      },
      error: () => {
        this.projectsError = true;
        if (banner) { this.banner = banner; } // e.g. the photo-upload warning must survive a failed reload
      }
    });
  }

  selectProjectById(id: string): void {
    const p = this.projects?.find(x => x.id === id);
    if (p) { this.selectProject(p); }
  }

  selectProject(p: Project): void {
    this.selectedProject = p;
    this.selectedPlotId = null;
    this.plotDetail = null;
    this.aside = { kind: 'none' };
    this.banner = null;
    this.filter.clear();
    this.grid = null;
    this.gridError = false;
    this.loadGrid();
  }

  // Keeps the last good grid on a failed refresh (DESIGN: "Grid refresh failure").
  loadGrid(): void {
    const project = this.selectedProject;
    if (!project) { return; }
    this.plotsService.getGrid(project.id).subscribe({
      next: grid => {
        if (project.id !== this.selectedProject?.id) { return; }
        this.grid = grid;
        this.gridError = false;
        this.rebuild();
      },
      error: () => {
        if (project.id === this.selectedProject?.id) { this.gridError = true; }
      }
    });
  }

  toggleFilter(s: PlotStatus): void {
    this.filter.has(s) ? this.filter.delete(s) : this.filter.add(s);
    this.rebuild();
  }

  private rebuild(): void {
    const all = this.grid ?? [];
    this.counts = countByStatus(all);
    const whole = groupIntoBlocks(all);
    this.blockStats = {};
    for (const b of whole) {
      this.blockStats[b.block] = { available: b.plots.filter(p => p.status === 'AVAILABLE').length, total: b.plots.length };
    }
    this.visibleBlocks = whole
      .map(b => ({ block: b.block, plots: this.filter.size ? b.plots.filter(p => this.filter.has(p.status)) : b.plots }))
      .filter(b => b.plots.length);
  }

  // Stable identity so a grid refresh updates tiles in place and a focused tile keeps focus.
  trackBlock = (_: number, b: PlotBlock) => b.block;
  trackPlot = (_: number, p: PlotGridItem) => p.plotId;

  bookedCount(p: Project): number {
    return Math.max(p.totalPlots - p.availablePlots - p.soldPlots, 0);
  }

  selectPlot(p: PlotGridItem): void {
    this.selectedPlotId = p.plotId;
    this.plotDetail = null;
    this.banner = null;
    this.aside = { kind: 'detail' };
    this.opener = null;
    this.fetchDetail(this.selectedProject!.id, p.plotId);
  }

  // Only lands if the admin is still on that plot; on failure the rate shows "—" and Edit stays hidden.
  private fetchDetail(projectId: string, plotId: string): void {
    this.plotsService.getPlot(projectId, plotId).subscribe({
      next: d => { if (this.stillOn(projectId, plotId)) { this.plotDetail = d; } },
      error: () => undefined
    });
  }

  private stillOn(projectId: string, plotId: string): boolean {
    return this.selectedPlotId === plotId && this.selectedProject?.id === projectId;
  }

  openAside(next: Aside): void {
    this.banner = null;
    this.duplicatePlotNo = false;
    if (this.aside.kind === 'none' || this.aside.kind === 'detail') {
      // Safari doesn't focus buttons on click, leaving body: treat that as "no opener" so focus falls back to the tile.
      const active = document.activeElement as HTMLElement | null;
      this.opener = active && active !== document.body ? active : null;
    }
    this.aside = next;
  }

  // Leaves a form for the detail view; focus goes to the matching live control there (else the tile).
  backToDetail(prefer: string): void {
    this.aside = { kind: 'detail' };
    this.banner = null;
    this.focusDetail(prefer);
  }

  private focusDetail(prefer?: string): void {
    const plotId = this.selectedPlotId;
    setTimeout(() => {
      const btn = prefer ? document.querySelector<HTMLButtonElement>(`.projects-plots__aside ${prefer}`) : null;
      if (btn && !btn.disabled) { btn.focus(); }
      else if (plotId) { document.querySelector<HTMLElement>(`[data-plot-id="${plotId}"] button`)?.focus(); }
    });
  }

  // Focus goes back to whatever opened the aside; if that element is gone, to the selected tile.
  private restoreFocus(opener: HTMLElement | null, returnTo: string | null): void {
    setTimeout(() => {
      if (opener?.isConnected) { opener.focus(); }
      else if (returnTo) { document.querySelector<HTMLElement>(`[data-plot-id="${returnTo}"] button`)?.focus(); }
    });
  }

  closeAside(): void {
    const returnTo = this.selectedPlotId;
    const opener = this.opener;
    this.opener = null;
    this.aside = { kind: 'none' };
    this.restoreFocus(opener, returnTo);
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event?: Event): void {
    if (event?.defaultPrevented) { return; } // e.g. the associate lookup just closed its list
    if (this.aside.kind !== 'none') { this.closeAside(); }
  }

  saveNewPlot(req: PlotRequest): void {
    const projectId = this.selectedProject!.id;
    this.mutate(this.projectsService.createPlot(projectId, req), () => {
      this.refreshAfterPlotChange(projectId);
      if (this.aside.kind === 'addPlot' && this.selectedProject?.id === projectId) { this.closeAside(); }
    });
  }

  saveEditedPlot(req: PlotRequest): void {
    const projectId = this.selectedProject!.id;
    const plotId = this.selectedPlotId!;
    this.mutate(this.projectsService.updatePlot(projectId, plotId, req), () => {
      this.refreshAfterPlotChange(projectId);
      if (!this.stillOn(projectId, plotId)) { return; }
      if (this.aside.kind === 'editPlot') {
        this.aside = { kind: 'detail' };
        this.focusDetail('.projects-plots__edit-plot');
      }
      this.fetchDetail(projectId, plotId); // keeps the prior detail on failure
    });
  }

  saveProject(v: { request: ProjectRequest; photo: File | null }): void {
    const editing = this.aside.kind === 'project' && this.aside.mode === 'edit' && this.selectedProject;
    const save$ = editing
      ? this.projectsService.updateProject(this.selectedProject!.id, v.request)
      : this.projectsService.createProject(v.request);
    this.mutate(save$, p => {
      if (this.aside.kind === 'project') { this.closeAside(); } // the admin may have moved on mid-save
      if (!v.photo) { this.reloadProjects(p.id); return; }
      // The project is saved; a failed upload must not keep the form open (a retry would duplicate it).
      this.projectsService.uploadThumbnail(p.id, v.photo).subscribe({
        next: () => this.reloadProjects(p.id),
        error: () => this.reloadProjects(p.id, { tone: 'warning', key: 'admin.projectsPlots.error.photoUploadFailed' })
      });
    });
  }

  // The request is owned here, not by the form, so cancelling or switching plots mid-flight does
  // not abort it: it completes and the grid refreshes (DESIGN Decision 7).
  submitBooking(v: BookingFormValue): void {
    const plot = this.selectedPlot;
    if (!plot || this.bookingBusy) { return; }
    const plotId = plot.plotId;
    const projectId = this.selectedProject!.id;
    this.bookingBusy = true;
    this.plotsService.createBooking({
      plotId, associateId: v.associateId, buyerName: v.buyerName, buyerPhone: v.buyerPhone || undefined, tokenAmount: v.tokenAmount
    }).subscribe({
      next: booking => {
        this.bookingBusy = false;
        this.markBooked(projectId, plotId);
        this.banner = { tone: 'success', key: 'admin.projectsPlots.banner.booked', params: { no: plot.plotNo, buyer: booking.buyerName }, bookingId: booking.id };
        if (this.aside.kind === 'book' && this.selectedPlotId === plotId) { this.aside = { kind: 'detail' }; this.focusDetail('.projects-plots__book'); }
        this.refreshAfterBooking(projectId, plotId);
      },
      error: (err: HttpErrorResponse) => {
        this.bookingBusy = false;
        if (err.status === 409) {
          this.banner = { tone: 'warning', key: 'admin.projectsPlots.error.conflict', params: { no: plot.plotNo } };
          if (this.aside.kind === 'book' && this.selectedPlotId === plotId) { this.aside = { kind: 'detail' }; this.focusDetail(); } // the refresh books the plot, so Book is about to be disabled: tile
          this.refreshAfterBooking(projectId, plotId);
        } else {
          this.banner = this.errorBanner(err);
        }
      }
    });
  }

  // Disables Book at once; the server refresh that follows stays authoritative (and a failed one keeps this).
  private markBooked(projectId: string, plotId: string): void {
    if (this.selectedProject?.id !== projectId || !this.grid) { return; }
    this.grid = this.grid.map(p => (p.plotId === plotId ? { ...p, status: 'BOOKED' as PlotStatus } : p));
    this.rebuild();
  }

  // The grid is only reloaded if the admin is still on the booked plot's project; counts always refresh.
  // plotDetail is stale once booked (status AVAILABLE would be echoed back by Edit), so drop and re-fetch it.
  private refreshAfterBooking(projectId: string, plotId: string): void {
    if (this.selectedProject?.id === projectId) { this.loadGrid(); }
    if (this.stillOn(projectId, plotId)) {
      this.plotDetail = null;
      this.fetchDetail(projectId, plotId);
    }
    this.reloadProjects();
  }

  onCsvImported(): void {
    const projectId = this.selectedProject!.id;
    this.refreshAfterPlotChange(projectId);
    if (this.aside.kind === 'csv' && this.selectedProject?.id === projectId) { this.closeAside(); }
  }

  // Grid and the project list's counts both change when plots are added/edited.
  private refreshAfterPlotChange(projectId: string): void {
    if (this.selectedProject?.id === projectId) { this.loadGrid(); }
    this.reloadProjects();
  }

  private mutate<T>(source: Observable<T>, onOk: (v: T) => void): void {
    this.busy = true;
    this.duplicatePlotNo = false;
    source.subscribe({
      next: v => { this.busy = false; onOk(v); },
      error: (err: HttpErrorResponse) => {
        this.busy = false;
        if (err.status === 409 && (this.aside.kind === 'addPlot' || this.aside.kind === 'editPlot')) {
          this.duplicatePlotNo = true;
        } else {
          this.banner = this.errorBanner(err);
        }
      }
    });
  }

  areaText = formatArea;
  priceText = formatInr;

  protected errorBanner(err: HttpErrorResponse): Banner {
    if (err.status === 403) { return { tone: 'danger', key: 'admin.projectsPlots.error.forbidden' }; }
    if (err.status === 404) { return { tone: 'danger', key: 'admin.projectsPlots.error.notFound' }; }
    const serverText = err.status === 400 && typeof err.error?.error === 'string' ? err.error.error : undefined;
    return serverText ? { tone: 'danger', text: serverText } : { tone: 'danger', key: 'admin.projectsPlots.error.generic' };
  }
}
