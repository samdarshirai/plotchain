// booking-register.component.ts
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { ProjectsService } from '../../setup/steps/projects/projects.service';
import { Project } from '../../setup/models/project.model';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PlotGridItem, formatInr } from '../../shared/utils/plot-grid.util';
import { ProjectsPlotsService } from '../projects-plots/projects-plots.service';
import { BookingEmiConfig, BookingPage, FlashMessage, RegisterFilters } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { associateLabel, meterPercent, plotText } from './bookings-emi.util';

const PAGE_SIZE = 20;
const NO_FILTERS: RegisterFilters = { status: '', associateId: '', plotId: '', projectId: '', overdue: false };

@Component({
  selector: 'app-booking-register',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, AssociateLookupComponent, InlineBannerComponent],
  template: `
    <div class="booking-register">
      <div class="booking-register__filters">
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.status' | translate }}
          <select [disabled]="locked" (change)="applyFilter({ status: $any($event.target).value })">
            <option value="" [selected]="!filters.status">{{ 'admin.bookingsEmi.filter.allStatuses' | translate }}</option>
            <option *ngFor="let s of statuses" [value]="s" [selected]="filters.status === s">{{ 'admin.bookingsEmi.status.' + s | translate }}</option>
          </select>
        </label>
        <div class="booking-register__field" [class.booking-register__field--locked]="locked" [attr.inert]="locked ? '' : null">{{ 'admin.bookingsEmi.filter.associate' | translate }}
          <app-associate-lookup [associates]="directory" [value]="filters.associateId"
            [placeholder]="'admin.bookingsEmi.filter.anyAssociate' | translate"
            (selected)="applyFilter({ associateId: $event?.id ?? '' })"></app-associate-lookup>
        </div>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.project' | translate }}
          <select [disabled]="locked" (change)="applyFilter({ projectId: $any($event.target).value })">
            <option value="" [selected]="!filters.projectId">{{ 'admin.bookingsEmi.filter.allProjects' | translate }}</option>
            <option *ngFor="let p of projects" [value]="p.id" [selected]="filters.projectId === p.id">{{ p.name }}</option>
          </select>
        </label>
        <label class="booking-register__field">{{ 'admin.bookingsEmi.filter.plot' | translate }}
          <select class="booking-register__plot" [disabled]="locked || !filters.projectId" (change)="applyFilter({ plotId: $any($event.target).value })">
            <option value="" [selected]="!filters.plotId">{{ (filters.projectId ? 'admin.bookingsEmi.filter.anyPlot' : 'admin.bookingsEmi.filter.plotNeedsProject') | translate }}</option>
            <option *ngFor="let g of plotOptions" [value]="g.plotId" [selected]="filters.plotId === g.plotId">{{ g.plotNo }}</option>
          </select>
        </label>
        <button type="button" class="booking-register__toggle" [class.booking-register__toggle--on]="filters.overdue"
          [attr.aria-pressed]="filters.overdue" [disabled]="locked" (click)="applyFilter({ overdue: !filters.overdue })">
          {{ 'admin.bookingsEmi.filter.overdueOnly' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="locked" (click)="resetFilters()">{{ 'admin.bookingsEmi.filter.reset' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.load' | translate }}
        <button type="button" class="booking-register__retry" [disabled]="locked" (click)="reload()">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="booking-register__grid">
        <div class="booking-register__list" [attr.aria-busy]="loading">
          <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
            <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
            <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3,4,5,6]"></span>
          </div>

          <div class="booking-register__empty" *ngIf="page && !page.bookings.length">
            <ng-container *ngIf="hasFilters; else firstRun">
              <h2>{{ 'admin.bookingsEmi.empty.noMatchTitle' | translate }}</h2>
              <button type="button" class="brand-button brand-button--secondary" [disabled]="locked" (click)="resetFilters()">{{ 'admin.bookingsEmi.filter.reset' | translate }}</button>
            </ng-container>
            <ng-template #firstRun>
              <h2>{{ 'admin.bookingsEmi.empty.noBookingsTitle' | translate }}</h2>
              <p>{{ 'admin.bookingsEmi.empty.noBookingsBody' | translate }}</p>
              <a class="brand-button" routerLink="/settings/projects-plots">{{ 'admin.bookingsEmi.empty.goToPlots' | translate }}</a>
            </ng-template>
          </div>

          <table class="booking-register__table" *ngIf="page?.bookings?.length" [attr.aria-label]="'admin.bookingsEmi.title' | translate">
            <thead>
              <tr>
                <th scope="col">{{ 'admin.bookingsEmi.col.buyer' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.associate' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.status' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.total' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.paid' | translate }}</th>
                <th scope="col">{{ 'admin.bookingsEmi.col.due' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of page!.bookings" class="booking-register__row" tabindex="0"
                [class.booking-register__row--selected]="b.id === selected?.id" [attr.aria-current]="b.id === selected?.id ? 'true' : null"
                (click)="selectBooking(b)" (keydown.enter)="selectBooking(b)" (keydown.space)="selectBooking(b); $event.preventDefault()">
                <td [attr.data-label]="'admin.bookingsEmi.col.buyer' | translate">
                  <strong>{{ b.buyerName }}</strong><br /><span class="booking-register__sub">{{ plot(b) }}<ng-container *ngIf="b.projectName"> · {{ b.projectName }}</ng-container></span>
                </td>
                <td [attr.data-label]="'admin.bookingsEmi.col.associate' | translate">{{ assoc(b) }}</td>
                <td [attr.data-label]="'admin.bookingsEmi.col.status' | translate">
                  <span class="booking-register__chip booking-register__chip--{{ b.status | lowercase }}">{{ 'admin.bookingsEmi.status.' + b.status | translate }}</span>
                  <span class="booking-register__pill" *ngIf="overdueIn(b) as n">{{ 'admin.bookingsEmi.overduePill' | translate: { count: n } }}</span>
                </td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.total' | translate">{{ money(b.totalAmount) }}</td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.paid' | translate">
                  {{ money(b.paidAmount) }}
                  <span class="booking-register__meter" role="img" [attr.aria-label]="pct(b) + '%'"><span [style.width.%]="pct(b)"></span></span>
                </td>
                <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.due' | translate">{{ b.status === 'CANCELLED' ? '—' : money(b.dueAmount) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="booking-register__pager" *ngIf="page?.bookings?.length">
            <button type="button" class="brand-button brand-button--secondary booking-register__prev" [disabled]="locked || page!.page === 0" (click)="goTo(page!.page - 1)">{{ 'admin.bookingsEmi.previous' | translate }}</button>
            <span>{{ 'admin.bookingsEmi.pager' | translate: { page: page!.page + 1, totalPages: totalPages, count: page!.totalElements } }}</span>
            <button type="button" class="brand-button brand-button--secondary booking-register__next" [disabled]="locked || page!.page + 1 >= totalPages" (click)="goTo(page!.page + 1)">{{ 'admin.bookingsEmi.next' | translate }}</button>
          </div>
        </div>
        <!-- seal: added in Task 5 -->
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
  private currentPage = 0;

  money = formatInr;
  pct = (b: Booking) => meterPercent(b.paidAmount, b.totalAmount);
  plot = plotText;
  assoc = (b: Booking) => associateLabel(b, this.directory);
  overdueIn = (b: Booking) => b.installments.filter(i => i.overdue && i.status === 'PENDING').length;

  get hasFilters(): boolean {
    const f = this.filters;
    return !!(f.status || f.associateId || f.plotId || f.projectId || f.overdue);
  }
  get totalPages(): number {
    return !this.page || !this.page.size ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.admin.listAssociates().subscribe({ next: d => (this.directory = d), error: () => undefined });
    this.projectsService.listProjects().subscribe({ next: p => (this.projects = p), error: () => undefined });
    this.reload();
  }

  ngOnChanges(_: SimpleChanges): void { /* focusBookingId handled in Task 8 */ }

  applyFilter(partial: Partial<RegisterFilters>): void {
    if (this.locked) { return; }
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

  resetFilters(): void {
    if (this.locked) { return; }
    this.filterMismatch = false;
    this.filters = { ...NO_FILTERS };
    this.plotOptions = [];
    this.load(0);
  }

  // re-requests the last attempted page (so Retry after a failed filter change uses page 0)
  reload(): void { this.load(this.currentPage, true); }
  goTo(p: number): void { if (!this.locked) { this.load(p); } }

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
