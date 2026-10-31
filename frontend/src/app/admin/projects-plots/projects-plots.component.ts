import { Component, HostListener, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable, catchError, of } from 'rxjs';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Plot, PlotRequest, PlotStatus, Project } from '../../setup/models/project.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PlotTileComponent } from '../../shared/components/plot-tile/plot-tile.component';
import {
  PlotBlock, PlotGridItem, StatusCounts, countByStatus, ExtraDefaults, formatArea, formatInr, groupIntoBlocks
} from '../../shared/utils/plot-grid.util';
import { ExportColumn, exportCsv } from '../../shared/utils/table-export.util';
import { filterPlotRows } from './projects-plots.util';
import { CsvImportPanelComponent } from './csv-import-panel.component';
import { MasterProject, MasterProjectsService } from '../master-projects/master-projects.service';
import { PlotFormComponent } from './plot-form.component';
import { ProjectsPlotsService } from './projects-plots.service';
import { BookPlotFormComponent } from './book-plot-form.component';
import { BookingEmiConfig, BookingFormValue } from './projects-plots.model';

type Aside =
  | { kind: 'none' }
  | { kind: 'book' }
  | { kind: 'editPlot' }
  | { kind: 'addPlot' }
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
  imports: [CommonModule, RouterLink, TranslateModule, InlineBannerComponent, PlotTileComponent, PlotFormComponent, CsvImportPanelComponent, BookPlotFormComponent],
  template: `
    <div class="projects-plots">
      <div class="projects-plots__head">
        <div class="projects-plots__intro">
          <span class="projects-plots__eyebrow">{{ 'admin.projectsPlots.eyebrow' | translate }}<ng-container *ngIf="selectedProject"> · {{ selectedProject.name }}</ng-container></span>
          <h1 class="projects-plots__title">{{ selectedProject ? selectedProject.name + ', ' + selectedProject.location : ('admin.projectsPlots.title' | translate) }}</h1>
        </div>
        <div class="projects-plots__views" *ngIf="selectedProject && grid" role="group" [attr.aria-label]="'admin.projectsPlots.viewLabel' | translate">
          <button type="button" *ngFor="let v of views" [class.projects-plots__view--on]="view === v" [attr.aria-pressed]="view === v" (click)="setView(v)">
            {{ 'admin.projectsPlots.view.' + v | translate }}
          </button>
        </div>
      </div>

      <div class="projects-plots__toolbar">
        <label class="projects-plots__project-select" *ngIf="projects?.length">
          <span class="projects-plots__sr">{{ 'admin.projectsPlots.projectSelectLabel' | translate }}</span>
          <select (change)="selectProjectById($any($event.target).value)">
            <option value="" disabled [selected]="!selectedProject" *ngIf="!selectedProject">{{ 'admin.projectsPlots.projectPlaceholder' | translate }}</option>
            <option *ngFor="let p of projects" [value]="p.id" [selected]="p.id === selectedProject?.id">{{ p.name }}</option>
          </select>
        </label>
        <div class="projects-plots__project-actions" *ngIf="selectedProject && !readOnly && !bookMode">
          <button type="button" class="brand-button brand-button--secondary" (click)="openAside({ kind: 'csv' })">{{ 'admin.projectsPlots.importCsvAction' | translate }}</button>
          <button type="button" class="brand-button brand-button--secondary" (click)="openAside({ kind: 'addPlot' })">{{ 'admin.projectsPlots.addPlotAction' | translate }}</button>
        </div>
        <div class="plot-table-tools" *ngIf="readOnly || (grid?.length && view === 'table')">
          <label class="plot-table-tools__label">
            <span class="projects-plots__sr">{{ 'admin.projectsPlots.table.searchLabel' | translate }}</span>
            <input type="search" class="plot-table-tools__search" [value]="search" [disabled]="!grid?.length" [placeholder]="'admin.projectsPlots.table.searchPlaceholder' | translate" (input)="onSearch($any($event.target).value)">
          </label>
          <ng-container *ngIf="view === 'table' && !readOnly">
            <span class="plot-table-tools__count" role="status">{{ 'admin.projectsPlots.table.count' | translate: { shown: tableRows.length, total: visibleCount } }}</span>
            <button type="button" class="brand-button plot-table-tools__export" [disabled]="!rates || !tableRows.length" (click)="exportPlots()">{{ 'admin.projectsPlots.table.exportCsv' | translate }}</button>
            <span class="plot-table-tools__error" role="alert" *ngIf="ratesError">
              {{ 'admin.projectsPlots.table.rateError' | translate }}
              <button type="button" class="projects-plots__retry" (click)="loadRates()">{{ 'admin.projectsPlots.retry' | translate }}</button>
            </span>
          </ng-container>
        </div>
      </div>

      <!-- Shared by the aside and the page level; only one is rendered at a time. -->
      <ng-template #bannerTpl>
        <app-inline-banner *ngIf="banner as b" [tone]="b.tone" [dismissible]="true" (dismissed)="banner = null">
          <span [attr.role]="b.tone === 'success' ? 'status' : 'alert'">
            {{ b.key ? (b.key | translate: b.params) : b.text }}
            <a *ngIf="b.bookingId" [routerLink]="['/admin/settings/view-booked-plot']" [queryParams]="{ booking: b.bookingId }">{{ 'admin.projectsPlots.banner.viewBooking' | translate }}</a>
          </span>
        </app-inline-banner>
      </ng-template>
      <ng-container *ngIf="aside.kind === 'none'"><ng-container *ngTemplateOutlet="bannerTpl"></ng-container></ng-container>

      <app-inline-banner *ngIf="projectsError" tone="danger">{{ 'admin.projectsPlots.error.loadProjects' | translate }}</app-inline-banner>

      <ng-template #emptyPlotTable>
        <div class="projects-plots__table-wrap">
          <table class="projects-plots__table">
            <thead><tr>
              <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">landscape</span>{{ 'admin.projectsPlots.table.plot' | translate }}</th>
              <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">square_foot</span>{{ 'admin.projectsPlots.table.area' | translate }}</th>
              <th scope="col" class="projects-plots__num"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.projectsPlots.table.total' | translate }}</th>
              <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">flag</span>{{ 'admin.projectsPlots.table.status' | translate }}</th>
            </tr></thead>
            <tbody><tr><td colspan="4" class="projects-plots__empty-row">{{ 'plotBookings.table.empty' | translate }}</td></tr></tbody>
          </table>
        </div>
      </ng-template>

      <ng-container *ngIf="projects && !projects.length && readOnly"><ng-container *ngTemplateOutlet="emptyPlotTable"></ng-container></ng-container>
      <div class="projects-plots__empty" *ngIf="projects && !projects.length && !readOnly">
        <h2>{{ (readOnly ? 'admin.projectsPlots.empty.assocNoProjectsTitle' : 'admin.projectsPlots.empty.noProjectsTitle') | translate }}</h2>
        <p>{{ (readOnly ? 'admin.projectsPlots.empty.assocNoProjectsBody' : 'admin.projectsPlots.empty.noProjectsBody') | translate }}</p>
      </div>

      <div class="projects-plots__layout" [class.projects-plots__layout--aside]="asideOpen" *ngIf="projects">
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
        <p class="projects-plots__empty" role="status" *ngIf="readOnly && !selectedProject && projects.length">{{ 'admin.projectsPlots.empty.selectProjectPrompt' | translate }}</p>
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
                <span class="projects-plots__key projects-plots__key--static">
                  <span class="material-symbols-outlined projects-plots__type-icon" aria-hidden="true">park</span>{{ 'admin.projectsPlots.parkNote' | translate }}
                </span>
                <span class="projects-plots__key projects-plots__key--static">
                  <span class="material-symbols-outlined projects-plots__type-icon" aria-hidden="true">add_road</span>{{ 'admin.projectsPlots.roadNote' | translate }}
                </span>
              </div>
            </ng-template>

            <ng-container *ngIf="!grid.length && readOnly"><ng-container *ngTemplateOutlet="emptyPlotTable"></ng-container></ng-container>
            <div class="projects-plots__empty" *ngIf="!grid.length && !readOnly">
              <h2>{{ (readOnly ? 'admin.projectsPlots.empty.assocNoPlotsTitle' : 'admin.projectsPlots.empty.noPlotsTitle') | translate }}</h2>
              <p>{{ (readOnly ? 'admin.projectsPlots.empty.assocNoPlotsBody' : 'admin.projectsPlots.empty.noPlotsBody') | translate }}</p>
            </div>
            <p class="projects-plots__empty" role="status" *ngIf="grid.length && !visibleBlocks.length">{{ (search.trim() ? 'admin.projectsPlots.table.noMatch' : 'admin.projectsPlots.empty.filter') | translate }}</p>

            <p class="projects-plots__empty" role="status" *ngIf="view === 'table' && !readOnly && grid.length && visibleBlocks.length && !tableRows.length">{{ 'admin.projectsPlots.table.noMatch' | translate }}</p>
            <div class="projects-plots__table-wrap" *ngIf="view === 'table' && tableRows.length">
              <table class="projects-plots__table" [class.projects-plots__table--book]="fullTable">
                <thead><tr>
                  <th scope="col" *ngIf="fullTable"><span class="material-symbols-outlined th-icon" aria-hidden="true">tag</span>{{ 'admin.projectsPlots.table.sNo' | translate }}</th>
                  <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">landscape</span>{{ 'admin.projectsPlots.table.plot' | translate }}</th>
                  <th scope="col" *ngIf="fullTable"><span class="material-symbols-outlined th-icon" aria-hidden="true">category</span>{{ 'admin.projectsPlots.table.type' | translate }}</th>
                  <th scope="col" class="projects-plots__num" *ngIf="fullTable"><span class="material-symbols-outlined th-icon" aria-hidden="true">square_foot</span>{{ 'admin.projectsPlots.table.roadSize' | translate }}</th>
                  <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">square_foot</span>{{ 'admin.projectsPlots.table.area' | translate }}</th>
                  <th scope="col" class="projects-plots__num" *ngIf="!readOnly"><span class="material-symbols-outlined th-icon" aria-hidden="true">sell</span>{{ 'admin.projectsPlots.rateLabel' | translate }}</th>
                  <th scope="col" class="projects-plots__num"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ (fullTable ? 'admin.projectsPlots.table.price' : 'admin.projectsPlots.table.total') | translate }}</th>
                  <th scope="col" class="projects-plots__num" *ngIf="fullTable"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.projectsPlots.extraPriceLabel' | translate }}</th>
                  <th scope="col" class="projects-plots__num" *ngIf="fullTable"><span class="material-symbols-outlined th-icon" aria-hidden="true">payments</span>{{ 'admin.projectsPlots.table.totalPrice' | translate }}</th>
                  <th scope="col"><span class="material-symbols-outlined th-icon" aria-hidden="true">flag</span>{{ 'admin.projectsPlots.table.status' | translate }}</th>
                  <th scope="col" *ngIf="canManage"><span class="material-symbols-outlined th-icon" aria-hidden="true">more_horiz</span>{{ 'admin.projectsPlots.table.actions' | translate }}</th>
                  <th scope="col" *ngIf="bookMode"><span class="projects-plots__sr">{{ 'admin.projectsPlots.bookAction' | translate }}</span></th>
                </tr></thead>
                <tbody>
                  <tr *ngFor="let p of tableRows; trackBy: trackPlot; let i = index" [attr.data-plot-id]="p.plotId" class="projects-plots__row"
                    [class.projects-plots__row--selected]="p.plotId === selectedPlotId">
                    <td *ngIf="fullTable">{{ i + 1 }}</td>
                    <td><button type="button" class="projects-plots__row-btn" [attr.aria-pressed]="p.plotId === selectedPlotId" (click)="selectPlot(p)">{{ p.plotNo }}</button>
                      <span class="projects-plots__corner" *ngIf="p.type === 'CORNER' && !fullTable">{{ 'plotTile.corner' | translate }}</span></td>
                    <td *ngIf="fullTable">{{ 'plotTile.type.' + p.type | translate }}</td>
                    <td class="projects-plots__num" *ngIf="fullTable">{{ p.roadSizeFt != null ? p.roadSizeFt + ' ft' : '—' }}</td>
                    <td>{{ areaText(p.area) }} {{ 'plotTile.sqft' | translate }}</td>
                    <td class="projects-plots__num" *ngIf="!readOnly">{{ rateText(p.plotId) }}</td>
                    <td class="projects-plots__num">{{ priceText(fullTable ? basePrice(p) : p.price) }}</td>
                    <td class="projects-plots__num" *ngIf="fullTable">{{ priceText(p.extraPrice ?? 0) }}</td>
                    <td class="projects-plots__num" *ngIf="fullTable">{{ priceText(basePrice(p) + (p.extraPrice ?? 0)) }}</td>
                    <td><span class="projects-plots__pill projects-plots__pill--{{ p.status.toLowerCase() }}">{{ 'plotTile.status.' + p.status | translate }}</span></td>
                    <td *ngIf="canManage" class="projects-plots__actions">
                      <button type="button" class="brand-button brand-button--secondary projects-plots__row-edit" (click)="editRow(p)">{{ 'admin.projectsPlots.table.edit' | translate }}</button>
                      <button type="button" class="brand-button brand-button--secondary projects-plots__row-delete" [disabled]="p.status !== 'AVAILABLE'" (click)="deleteRow(p)">{{ 'admin.projectsPlots.table.delete' | translate }}</button>
                    </td>
                    <td *ngIf="bookMode"><button type="button" class="brand-button projects-plots__row-book" [disabled]="p.status !== 'AVAILABLE'" (click)="selectPlot(p); openAside({ kind: 'book' })">{{ 'admin.projectsPlots.bookShort' | translate }}</button></td>
                  </tr>
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
                    [price]="p.price" [status]="p.status" [selected]="p.plotId === selectedPlotId" [plan]="true" (tileSelect)="onTileSelect(p)"></app-plot-tile>
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

        <!-- aside: CSV import panel -->
        <div class="projects-plots__scrim" *ngIf="asideOpen" (click)="closeAside()"></div>
        <aside class="projects-plots__aside" *ngIf="asideOpen" [attr.aria-label]="'admin.projectsPlots.title' | translate">
          <ng-container *ngTemplateOutlet="bannerTpl"></ng-container>
          <app-csv-import-panel *ngIf="aside.kind === 'csv' && selectedProject" [projectId]="selectedProject.id"
            (imported)="onCsvImported()" (cancelled)="closeAside()"></app-csv-import-panel>
        </aside>
      </div>

      <div class="projects-plots__modal-overlay" *ngIf="modalOpen" (click)="closeAside()">
        <div class="projects-plots__modal" [class.projects-plots__modal--wide]="aside.kind === 'book'" role="dialog" aria-modal="true" (click)="$event.stopPropagation()">
          <ng-container *ngTemplateOutlet="bannerTpl"></ng-container>
          <app-book-plot-form *ngIf="aside.kind === 'book' && selectedPlot" [plot]="selectedPlot" [associates]="associates"
            [projectName]="selectedProject?.name ?? ''" [location]="selectedProject?.location ?? ''" [rate]="plotDetail?.rate ?? null"
            [emiConfig]="emiConfig" [busy]="bookingBusy" (submitted)="submitBooking($event)" (cancelled)="closeAside()"></app-book-plot-form>
          <app-plot-form *ngIf="aside.kind === 'editPlot' && selectedPlot && plotDetail"
            [plot]="plotDetail" [locked]="plotDetail.status !== 'AVAILABLE' || selectedPlot.status !== 'AVAILABLE'" [extraDefaults]="extraDefaults" [busy]="busy" [duplicatePlotNo]="duplicatePlotNo"
            (submitted)="saveEditedPlot($event)" (cancelled)="closeAside()"></app-plot-form>
          <app-plot-form *ngIf="aside.kind === 'addPlot'" [plot]="null" [defaultRate]="defaultRate" [extraDefaults]="extraDefaults" [busy]="busy" [duplicatePlotNo]="duplicatePlotNo"
            (submitted)="saveNewPlot($event)" (cancelled)="closeAside()"></app-plot-form>
        </div>
      </div>
    </div>
  `,
  styleUrl: './plot-table-tools.scss',
  encapsulation: ViewEncapsulation.None
})
export class ProjectsPlotsComponent implements OnInit {
  protected projectsService = inject(ProjectsService);
  protected plotsService = inject(ProjectsPlotsService);
  private adminService = inject(AdminService);
  private masterProjectsService = inject(MasterProjectsService);
  masters: MasterProject[] = [];
  private translate = inject(TranslateService);
  // Associate "View Plot" reuses this screen with route data { readOnly: true }: no admin-only calls, no write actions.
  private route = inject(ActivatedRoute);
  readonly readOnly = this.route.snapshot.data['readOnly'] === true;
  // Entered from the Plot Booking > "Book new Plot" sidebar item (?book=1): pick an available plot, then Book.
  readonly bookMode = this.route.snapshot.data['bookMode'] === true || this.route.snapshot.queryParamMap?.get('book') === '1';
  // Every mode shows the book-table columns; only book mode adds the Book button.
  readonly fullTable = true;

  readonly statuses = STATUSES;
  readonly views: View[] = ['grid', 'site', 'table'];
  view: View = 'table';
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
  rates: Record<string, number> | null = null;
  ratesError = false;
  private ratesLoading = false;
  search = '';
  private ratesSeq = 0;
  tableRows: PlotGridItem[] = [];
  visibleCount = 0;
  private opener: HTMLElement | null = null;

  get selectedPlot(): PlotGridItem | null {
    return this.grid?.find(p => p.plotId === this.selectedPlotId) ?? null;
  }

  get modalOpen(): boolean { return this.aside.kind === 'addPlot' || this.aside.kind === 'editPlot' || this.aside.kind === 'book'; }
  get asideOpen(): boolean { return this.aside.kind !== 'none' && !this.modalOpen; }
  get canManage(): boolean { return !this.readOnly && !this.bookMode; }

  // Same object while the values are unchanged: a fresh one (every change detection, or after a project
  // reload) would re-run the form's prefill and wipe a typed Extra %.
  private cachedExtraDefaults: ExtraDefaults = { corner: 10, parkFacing: 5, roadSide: 5 };
  get extraDefaults(): ExtraDefaults {
    const p = this.selectedProject;
    const next = { corner: p?.cornerExtraPercent ?? 10, parkFacing: p?.parkFacingExtraPercent ?? 5, roadSide: p?.roadSideExtraPercent ?? 5 };
    const c = this.cachedExtraDefaults;
    if (c.corner !== next.corner || c.parkFacing !== next.parkFacing || c.roadSide !== next.roadSide) { this.cachedExtraDefaults = next; }
    return this.cachedExtraDefaults;
  }

  get defaultRate(): number | null {
    return this.masters.find(m => m.id === this.selectedProject?.masterProjectId)?.ratePerSqft ?? null;
  }

  ngOnInit(): void {
    // Admin-only endpoint; associates (readOnly) and any failure just mean no master picker/rate prefill.
    if (!this.readOnly) { this.masterProjectsService.list().subscribe({ next: m => (this.masters = m), error: () => {} }); }
    if (this.readOnly) { this.reloadProjects(); return; }
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
        const next = list.find(p => p.id === keep) ?? (this.readOnly && list.length > 1 ? null : list[0]) ?? null;
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
    this.rates = null;
    this.ratesError = false;
    this.ratesLoading = false;
    this.ratesSeq++;
    this.search = '';
    this.tableRows = [];
    this.grid = null;
    this.gridError = false;
    this.loadGrid();
    if (this.view === 'table') { this.loadRates(); }
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

  setView(v: View): void {
    this.view = v;
    if (v === 'table') { this.loadRates(); }
  }

  // Lazy, admin-only: associates never see or request rates. Cached per project (cleared in selectProject).
  loadRates(): void {
    const project = this.selectedProject;
    if (!project || this.readOnly || this.rates || this.ratesLoading) { return; }
    this.ratesLoading = true;
    this.ratesError = false;
    const seq = ++this.ratesSeq;
    this.plotsService.getPlotRates(project.id).subscribe({
      next: r => {
        if (seq !== this.ratesSeq) { return; }
        this.ratesLoading = false;
        this.rates = r;
      },
      error: () => {
        if (seq !== this.ratesSeq) { return; }
        this.ratesLoading = false;
        this.ratesError = true;
      }
    });
  }

  onSearch(q: string): void {
    this.search = q;
    this.rebuild();
  }

  rateText(plotId: string): string {
    const r = this.rates?.[plotId];
    return r != null ? formatInr(r) : '—';
  }

  // Rate × size; falls back to the stored price until rates load.
  basePrice(p: PlotGridItem): number {
    const r = this.rates?.[p.plotId];
    return r != null ? r * p.area : p.price;
  }

  exportPlots(): void {
    const t = (k: string) => this.translate.instant(k);
    const cols: ExportColumn<PlotGridItem>[] = [
      { header: t('admin.projectsPlots.table.plot'), value: p => p.plotNo },
      { header: t('admin.projectsPlots.table.area'), value: p => p.area },
      { header: t('admin.projectsPlots.rateLabel'), value: p => this.rates?.[p.plotId] },
      { header: t('admin.projectsPlots.table.total'), value: p => p.price },
      { header: t('admin.projectsPlots.table.status'), value: p => t('plotTile.status.' + p.status) }
    ];
    const slug = (this.selectedProject?.name ?? 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    exportCsv(this.tableRows, cols, `plots-${slug}.csv`);
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
    const label = (s: PlotStatus) => this.translate.instant('plotTile.status.' + s);
    // Associates search every view (blocks); admin searches the table rows only.
    this.visibleBlocks = whole
      .map(b => {
        const plots = this.filter.size ? b.plots.filter(p => this.filter.has(p.status)) : b.plots;
        return { block: b.block, plots: this.readOnly ? filterPlotRows(plots, this.search, label) : plots };
      })
      .filter(b => b.plots.length);
    const flat = this.visibleBlocks.flatMap(b => b.plots);
    this.visibleCount = flat.length;
    this.tableRows = this.readOnly ? flat : filterPlotRows(flat, this.search, label);
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
    this.aside = { kind: 'none' };
    this.opener = null;
    this.fetchDetail(this.selectedProject!.id, p.plotId);
  }

  // Tile view has no Book column: in book mode a tile click on an available plot opens the booking popup.
  onTileSelect(p: PlotGridItem): void {
    this.selectPlot(p);
    if (this.bookMode && !this.readOnly && p.status === 'AVAILABLE') { this.openAside({ kind: 'book' }); }
  }

  editRow(p: PlotGridItem): void {
    this.opener = document.activeElement as HTMLElement | null;
    this.selectedPlotId = p.plotId;
    this.plotDetail = null;
    this.banner = null;
    this.duplicatePlotNo = false;
    this.aside = { kind: 'editPlot' };
    this.fetchDetail(this.selectedProject!.id, p.plotId);
  }

  deleteRow(p: PlotGridItem): void {
    if (p.status !== 'AVAILABLE' || !window.confirm(this.translate.instant('admin.projectsPlots.table.deleteConfirm', { no: p.plotNo }))) { return; }
    const projectId = this.selectedProject!.id;
    this.projectsService.deletePlot(projectId, p.plotId).subscribe({
      next: () => {
        if (this.selectedPlotId === p.plotId) { this.selectedPlotId = null; this.plotDetail = null; }
        this.banner = null;
        this.refreshAfterPlotChange(projectId);
      },
      error: () => (this.banner = { tone: 'danger', key: 'admin.projectsPlots.table.deleteError' })
    });
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
    if (this.aside.kind === 'none') {
      // Safari doesn't focus buttons on click, leaving body: treat that as "no opener" so focus falls back to the tile.
      const active = document.activeElement as HTMLElement | null;
      this.opener = active && active !== document.body ? active : null;
    }
    this.aside = next;
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
      if (this.aside.kind === 'editPlot') { this.closeAside(); }
      this.fetchDetail(projectId, plotId); // keeps the prior detail on failure
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
      plotId, associateId: v.associateId, buyerName: v.buyerName, buyerPhone: v.buyerPhone || undefined, tokenAmount: v.tokenAmount,
      ...(v.paymentMode ? { paymentMode: v.paymentMode } : {}), ...(v.txnNo ? { txnNo: v.txnNo } : {}), ...(v.txnDate ? { txnDate: v.txnDate } : {}),
      ...(v.bankName ? { bankName: v.bankName } : {}),
      ...(v.firstInstallmentAmount ? { firstInstallmentAmount: v.firstInstallmentAmount } : {}),
      ...(v.extraPrice !== undefined ? { extraPrice: v.extraPrice } : {}),
      ...(v.extraPercent !== undefined ? { extraPercent: v.extraPercent } : {}),
      ...(v.discount > 0 ? { discount: v.discount } : {})
    }).subscribe({
      next: booking => {
        this.bookingBusy = false;
        this.markBooked(projectId, plotId);
        this.banner = { tone: 'success', key: 'admin.projectsPlots.banner.booked', params: { no: plot.plotNo, buyer: booking.buyerName }, bookingId: booking.id };
        if (this.aside.kind === 'book' && this.selectedPlotId === plotId) { this.aside = { kind: 'none' }; this.restoreFocus(null, plotId); }
        this.refreshAfterBooking(projectId, plotId);
      },
      error: (err: HttpErrorResponse) => {
        this.bookingBusy = false;
        if (err.status === 409) {
          this.banner = { tone: 'warning', key: 'admin.projectsPlots.error.conflict', params: { no: plot.plotNo } };
          if (this.aside.kind === 'book' && this.selectedPlotId === plotId) { this.aside = { kind: 'none' }; this.restoreFocus(null, plotId); }
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
    if (this.selectedProject?.id === projectId) {
      // Rates are cached per project; a new/edited plot is missing from (or stale in) the cache.
      this.rates = null;
      this.ratesLoading = false;
      this.ratesSeq++;
      this.loadGrid();
      if (this.view === 'table') { this.loadRates(); }
    }
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
