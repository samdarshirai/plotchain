// booking-register.component.ts
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild, inject, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Project } from '../../setup/models/project.model';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { exportCsv, ExportColumn, printTable } from '../../shared/utils/table-export.util';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PlotGridItem } from '../../shared/utils/plot-grid.util';
import { ProjectsPlotsService } from '../projects-plots/projects-plots.service';
import { BookingEmiConfig, BookingPage, FlashMessage, RegisterFilters } from './bookings-emi.model';
import { BookingSealComponent } from './booking-seal.component';
import { BookingsEmiService } from './bookings-emi.service';
import { collectPages, formatMoney, associateLabel, meterPercent, plotText } from './bookings-emi.util';

const PAGE_SIZE = 20;
const NO_FILTERS: RegisterFilters = { status: '', associateId: '', plotId: '', projectId: '', overdue: false, bookedFrom: '', bookedTo: '', q: '' };

@Component({
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./booking-register.component.scss', './booking-register-layout.scss'],
  selector: 'app-booking-register',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, AssociateLookupComponent, InlineBannerComponent, FieldErrorComponent, BookingSealComponent],
  template: `
    <div class="booking-register">
      <div class="booking-register__filters">
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.status' | translate }}
          <select [disabled]="frozen" (change)="applyFilter({ status: $any($event.target).value })">
            <option value="" [selected]="!filters.status">{{ 'admin.bookingsEmi.filter.allStatuses' | translate }}</option>
            <option *ngFor="let s of statuses" [value]="s" [selected]="filters.status === s">{{ 'admin.bookingsEmi.status.' + s | translate }}</option>
          </select>
        </label>
        <div class="booking-register__field" [class.booking-register__field--locked]="frozen" [attr.inert]="frozen ? '' : null">{{ 'admin.bookingsEmi.filter.associate' | translate }}
          <app-associate-lookup [associates]="directory" [value]="filters.associateId"
            [placeholder]="'admin.bookingsEmi.filter.anyAssociate' | translate"
            (selected)="applyFilter({ associateId: $event?.id ?? '' })"></app-associate-lookup>
        </div>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.project' | translate }}
          <select [disabled]="frozen" (change)="applyFilter({ projectId: $any($event.target).value })">
            <option value="" [selected]="!filters.projectId">{{ 'admin.bookingsEmi.filter.allProjects' | translate }}</option>
            <option *ngFor="let p of projects" [value]="p.id" [selected]="filters.projectId === p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.plot' | translate }}
          <select class="booking-register__plot" [disabled]="frozen || !filters.projectId" (change)="applyFilter({ plotId: $any($event.target).value })">
            <option value="" [selected]="!filters.plotId">{{ (filters.projectId ? 'admin.bookingsEmi.filter.anyPlot' : 'admin.bookingsEmi.filter.plotNeedsProject') | translate }}</option>
            <option *ngFor="let g of plotOptions" [value]="g.plotId" [selected]="filters.plotId === g.plotId">{{ g.plotNo }}</option>
          </select>
        </label>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.bookedFrom' | translate }}
          <input name="bookedFrom" type="date" [disabled]="frozen" [value]="filters.bookedFrom || ''" [attr.max]="filters.bookedTo || null" (change)="applyDate({ bookedFrom: $any($event.target).value })" />
        </label>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.bookedTo' | translate }}
          <input name="bookedTo" type="date" [disabled]="frozen" [value]="filters.bookedTo || ''" [attr.min]="filters.bookedFrom || null" (change)="applyDate({ bookedTo: $any($event.target).value })" />
        </label>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.search' | translate }}
          <input name="q" type="search" [disabled]="frozen" [value]="filters.q || ''" [placeholder]="'admin.bookingsEmi.filter.searchPlaceholder' | translate"
            (change)="applyFilter({ q: $any($event.target).value.trim() })" (keydown.enter)="applyFilter({ q: $any($event.target).value.trim() })" />
        </label>
        <button type="button" class="booking-register__toggle" [class.booking-register__toggle--on]="filters.overdue"
          [attr.aria-pressed]="filters.overdue" [disabled]="frozen" (click)="applyFilter({ overdue: !filters.overdue })">
          {{ 'admin.bookingsEmi.filter.overdueOnly' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="frozen" (click)="resetFilters()">{{ 'admin.bookingsEmi.filter.reset' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary booking-register__export" [disabled]="frozen" (click)="exportAll()">{{ 'admin.bookingsEmi.action.exportCsv' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary booking-register__print" [disabled]="frozen || !page?.bookings?.length" (click)="print()">{{ 'admin.bookingsEmi.action.print' | translate }}</button>
      </div>
      <app-field-error [message]="rangeError ? ('admin.bookingsEmi.validation.range' | translate) : undefined"></app-field-error>
      <app-inline-banner *ngIf="exportError" tone="danger">{{ 'admin.bookingsEmi.err.export' | translate }}</app-inline-banner>

      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.load' | translate }}
        <button type="button" class="booking-register__retry" [disabled]="frozen" (click)="reload()">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <app-inline-banner *ngIf="focusError" tone="danger">{{ 'admin.bookingsEmi.err.notFound' | translate }}</app-inline-banner>

      <div class="booking-register__grid">
        <div class="booking-register__list" [attr.aria-busy]="loading">
          <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
            <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
            <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3,4,5,6]"></span>
          </div>

          <table #regTable class="booking-register__table" *ngIf="page" [attr.aria-label]="'admin.bookingsEmi.title' | translate">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.bookingsEmi.col.bookedOn' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.associateId' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.associate' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.buyer' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.mobile' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.project' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.plot' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.status' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.plotType' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.area' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.rate' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.listPrice' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.discount' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.total' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.paid' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.due' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page!.bookings" class="booking-register__row" tabindex="0"
                [class.booking-register__row--selected]="b.id === selected?.id" [attr.aria-current]="b.id === selected?.id ? 'true' : null"
                (click)="selectBooking(b)" (keydown.enter)="selectBooking(b)" (keydown.space)="selectBooking(b); $event.preventDefault()">
                <td [attr.data-label]="'admin.bookingsEmi.col.bookedOn' | translate">{{ b.bookedAt ? b.bookedAt.slice(0, 10) : '—' }}</td>
                <td [attr.data-label]="'admin.bookingsEmi.col.associateId' | translate">{{ assocCode(b) || '—' }}</td>
                <td class="booking-register__wrap" [attr.data-label]="'admin.bookingsEmi.col.associate' | translate"><span class="booking-register__clamp" [title]="assocName(b) || ''">{{ assocName(b) || '—' }}</span></td>
                <td class="booking-register__wrap" [attr.data-label]="'admin.bookingsEmi.col.buyer' | translate"><strong class="booking-register__clamp" [title]="b.buyerName">{{ b.buyerName }}</strong></td>
                <td [attr.data-label]="'admin.bookingsEmi.col.mobile' | translate">{{ b.buyerPhone || '—' }}</td>
                <td class="booking-register__wrap" [attr.data-label]="'admin.bookingsEmi.col.project' | translate"><span class="booking-register__clamp" [title]="b.projectName || ''">{{ b.projectName || '—' }}</span></td>
                <td [attr.data-label]="'admin.bookingsEmi.col.plot' | translate">{{ plot(b) }}</td>
                <td [attr.data-label]="'admin.bookingsEmi.col.status' | translate">
                  <span class="booking-register__chip booking-register__chip--{{ b.status | lowercase }}">{{ 'admin.bookingsEmi.status.' + b.status | translate }}</span>
                  <span class="booking-register__pill" *ngIf="overdueIn(b) as n">{{ 'admin.bookingsEmi.overduePill' | translate: { count: n } }}</span>
                </td>
                <td [attr.data-label]="'admin.bookingsEmi.col.plotType' | translate">{{ b.plotType ? ('admin.projectsPlots.type.' + b.plotType | translate) : '—' }}</td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.area' | translate">{{ b.areaSqft != null ? b.areaSqft : '—' }}</td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.rate' | translate">{{ b.rate != null ? money(b.rate) : '—' }}</td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.listPrice' | translate">{{ b.listPrice != null ? money(b.listPrice) : '—' }}</td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.discount' | translate">{{ b.discount != null ? money(b.discount) : '—' }}</td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.total' | translate">{{ money(b.totalAmount) }}</td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.paid' | translate">
                  {{ money(b.paidAmount) }}
                  <span class="booking-register__meter" role="img" [attr.aria-label]="pct(b) + '%'"><span [style.width.%]="pct(b)"></span></span>
                </td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.due' | translate">{{ b.status === 'CANCELLED' ? '—' : money(b.dueAmount) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="booking-register__empty" *ngIf="page && !page.bookings.length">
            <ng-container *ngIf="hasFilters; else firstRun">
              <h2>{{ 'admin.bookingsEmi.empty.noMatchTitle' | translate }}</h2>
              <button type="button" class="brand-button brand-button--secondary" [disabled]="frozen" (click)="resetFilters()">{{ 'admin.bookingsEmi.filter.reset' | translate }}</button>
            </ng-container>
            <ng-template #firstRun>
              <h2>{{ 'admin.bookingsEmi.empty.noBookingsTitle' | translate }}</h2>
              <p>{{ 'admin.bookingsEmi.empty.noBookingsBody' | translate }}</p>
              <a class="brand-button" routerLink="/settings/plots">{{ 'admin.bookingsEmi.empty.goToPlots' | translate }}</a>
            </ng-template>
          </div>


          <div class="booking-register__pager" *ngIf="page?.bookings?.length">
            <button type="button" class="brand-button brand-button--secondary booking-register__prev" [disabled]="frozen || page!.page === 0" (click)="goTo(page!.page - 1)">{{ 'admin.bookingsEmi.previous' | translate }}</button>
            <span>{{ (page!.totalElements === 1 ? 'admin.bookingsEmi.pagerOne' : 'admin.bookingsEmi.pager') | translate: { page: page!.page + 1, totalPages: totalPages, count: page!.totalElements } }}</span>
            <button type="button" class="brand-button brand-button--secondary booking-register__next" [disabled]="frozen || page!.page + 1 >= totalPages" (click)="goTo(page!.page + 1)">{{ 'admin.bookingsEmi.next' | translate }}</button>
          </div>
        </div>
        <app-booking-seal [booking]="selected" [config]="config" [directory]="directory" [filterMismatch]="filterMismatch"
          (updated)="onBookingChanged($event)" (flash)="flash.emit($event)" (busyChange)="locked = $event"
          (reloadRequested)="reload()"></app-booking-seal>
      </div>
    </div>
  `
})
export class BookingRegisterComponent implements OnInit, OnChanges {
  private service = inject(BookingsEmiService);
  private admin = inject(AdminService);
  private projectsService = inject(ProjectsService);
  private plotsService = inject(ProjectsPlotsService);

  @Input() config: BookingEmiConfig | null = null;
  @Input() focusBookingId: string | null = null;
  @Output() changed = new EventEmitter<void>();
  @Output() flash = new EventEmitter<FlashMessage>();

  readonly statuses = ['ACTIVE', 'CONFIRMED', 'CANCELLED'];
  filters: RegisterFilters = { ...NO_FILTERS };
  directory: AssociateSummary[] = [];
  projects: Project[] = [];
  plotOptions: PlotGridItem[] = [];
  page: BookingPage | null = null;
  selected: Booking | null = null;
  filterMismatch = false;
  loadError = false;
  loading = false;
  locked = false; // true while a seal write is in flight: filters, pager and selection freeze
  private seq = 0;
  private focusSeq = 0;
  focusError = false;
  private currentPage = 0;
  rangeError = false;
  exporting = false;
  get frozen(): boolean { return this.locked || this.exporting; } // seal write or CSV export in flight
  exportError = false;
  @ViewChild('regTable') regTable?: ElementRef<HTMLElement>;

  private readonly exportColumns: ExportColumn<Booking>[] = [
    { header: 'Booked on', value: b => b.bookedAt?.slice(0, 10) },
    { header: 'Associate ID', value: b => b.associateCode ?? this.directory.find(a => a.id === b.associateId)?.userId },
    { header: 'Associate', value: b => b.associateName },
    { header: 'Buyer', value: b => b.buyerName },
    { header: 'Mobile', value: b => b.buyerPhone },
    { header: 'Project', value: b => b.projectName },
    { header: 'Plot', value: b => plotText(b) },
    { header: 'Plot type', value: b => b.plotType },
    { header: 'Area', value: b => b.areaSqft },
    { header: 'Rate', value: b => b.rate },
    { header: 'Discount', value: b => b.discount },
    { header: 'Total', value: b => b.totalAmount },
    { header: 'Paid', value: b => b.paidAmount },
    { header: 'Due', value: b => (b.status === 'CANCELLED' ? null : b.dueAmount) },
    { header: 'Status', value: b => b.status }
  ];

  money = formatMoney;
  pct = (b: Booking) => meterPercent(b.paidAmount, b.totalAmount);
  plot = plotText;
  assoc = (b: Booking) => associateLabel(b, this.directory);
  assocName = (b: Booking) => b.associateName ?? this.directory.find(a => a.id === b.associateId)?.name;
  assocCode =(b: Booking) => b.associateCode ?? this.directory.find(a => a.id === b.associateId)?.userId;
  overdueIn = (b: Booking) => b.installments.filter(i => i.overdue && i.status === 'PENDING').length;

  get hasFilters(): boolean {
    const f = this.filters;
    return !!(f.status || f.associateId || f.plotId || f.projectId || f.overdue || f.bookedFrom || f.bookedTo || f.q);
  }
  get totalPages(): number {
    return !this.page || !this.page.size ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.admin.listAssociates().subscribe({ next: d => (this.directory = d), error: () => undefined });
    this.projectsService.listProjects().subscribe({ next: p => (this.projects = p), error: () => undefined });
    this.reload();
  }

  // Overdue click-through / ?booking= deep link: fetch the booking directly (it may be off the current page or filtered out).
  ngOnChanges(changes: SimpleChanges): void {
    const id = changes['focusBookingId']?.currentValue as string | null | undefined;
    if (!id) { return; }
    this.focusError = false;
    const mine = ++this.focusSeq;
    this.service.get(id).subscribe({
      next: b => {
        if (mine !== this.focusSeq) { return; } // admin picked another booking meanwhile
        this.selected = b;
        this.filterMismatch = !!this.page && !this.page.bookings.some(r => r.id === b.id);
      },
      error: () => { if (mine === this.focusSeq) { this.focusError = true; } }
    });
  }

  applyFilter(partial: Partial<RegisterFilters>): void {
    if (this.frozen) { return; }
    const projectChanged = 'projectId' in partial && partial.projectId !== this.filters.projectId;
    this.filters = { ...this.filters, ...partial };
    if (projectChanged) {
      this.filters.plotId = '';
      this.plotOptions = [];
      if (this.filters.projectId) {
        const id = this.filters.projectId;
        // a slow grid for a previously chosen project must not replace the current project's options
        this.plotsService.getGrid(id).subscribe({ next: g => { if (this.filters.projectId === id) { this.plotOptions = g; } }, error: () => undefined });
      }
    }
    this.filterMismatch = false;
    this.load(0);
  }

  // Inverted range: show the error and send nothing (one-sided ranges are fine).
  applyDate(partial: Partial<RegisterFilters>): void {
    if (this.frozen) { return; }
    const m = { ...this.filters, ...partial };
    this.rangeError = !!m.bookedFrom && !!m.bookedTo && m.bookedFrom > m.bookedTo;
    if (this.rangeError) { return; } // inverted range stays out of filters so table, export and later changes keep the last valid one
    this.applyFilter(partial);
  }

  exportAll(): void {
    if (this.locked || this.exporting) { return; }
    this.exporting = true;
    this.exportError = false;
    const f = { ...this.filters };
    collectPages<Booking>(p => this.service.list(f, p, 100).pipe(map(r => ({ rows: r.bookings, totalElements: r.totalElements })))).subscribe({
      next: rows => { this.exporting = false; exportCsv(rows, this.exportColumns, 'bookings.csv'); },
      error: () => { this.exporting = false; this.exportError = true; }
    });
  }

  print(): void { if (this.regTable) { printTable(this.regTable.nativeElement); } }

  resetFilters(): void {
    if (this.frozen) { return; }
    this.rangeError = false;
    this.filterMismatch = false;
    this.filters = { ...NO_FILTERS };
    this.plotOptions = [];
    this.load(0);
  }

  // re-requests the last attempted page (so Retry after a failed filter change uses page 0)
  reload(): void { this.load(this.currentPage, true); }
  goTo(p: number): void { if (!this.frozen) { this.load(p); } }

  // Latest-request-wins: a slow earlier response can never overwrite a newer one.
  private load(p: number, checkMismatch = false): void {
    const mine = ++this.seq;
    this.currentPage = p;
    this.loading = true;
    this.loadError = false;
    this.service.list(this.filters, p, PAGE_SIZE).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        this.loading = false;
        this.page = res;
        if (this.selected) {
          const still = res.bookings.find(b => b.id === this.selected!.id);
          if (still) { this.selected = still; this.filterMismatch = false; } else if (checkMismatch) { this.filterMismatch = true; }
        }
      },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  selectBooking(b: Booking): void {
    if (this.locked) { return; }
    this.focusSeq++;
    this.focusError = false;
    this.selected = b;
    this.filterMismatch = false;
  }

  // Seal write finished: patch list row + selection immediately, then re-sync the page.
  onBookingChanged(updated: Booking): void {
    if (this.page) {
      this.page = { ...this.page, bookings: this.page.bookings.map(b => (b.id === updated.id ? updated : b)) };
    }
    if (this.selected?.id === updated.id) { this.selected = updated; } // a late write for A must not steal selection from B
    this.changed.emit();
    this.reload();
  }
}
