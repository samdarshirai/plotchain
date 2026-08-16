import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PlotBookingsService } from './plot-bookings.service';
import { Booking, AssociateBookingPage } from './models/associate-booking-page.model';
import { Project, PlotPageResponse } from '../setup/models/project.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { SidePanelComponent } from '../shared/components/side-panel/side-panel.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-plot-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, TabBarComponent, SidePanelComponent, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="plot-bookings card">
      <h1 class="card-title">{{ 'plotBookings.title' | translate }}</h1>
      <p class="plot-bookings__subtitle">{{ 'plotBookings.subtitle' | translate }}</p>

      <app-tab-bar [tabs]="tabs" [activeTabId]="activeTab" (tabChange)="onTabChange($event)"></app-tab-bar>

      <div *ngIf="activeTab === 'availablePlots'" class="plot-bookings__available-plots">
        <app-inline-banner *ngIf="projectsLoadError" tone="danger" [dismissible]="true"
          class="plot-bookings__projects-load-error" (dismissed)="projectsLoadError = false">
          {{ 'plotBookings.projectsLoadError' | translate }}
        </app-inline-banner>

        <label class="plot-bookings__project-picker">
          {{ 'plotBookings.projectPickerLabel' | translate }}
          <select (change)="onProjectSelect($any($event.target).value)">
            <option value="">{{ 'plotBookings.projectPickerPlaceholder' | translate }}</option>
            <option *ngFor="let project of projects" [value]="project.id">{{ project.name }} — {{ project.location }}</option>
          </select>
        </label>

        <p *ngIf="!selectedProjectId" class="plot-bookings__select-project-hint">
          {{ 'plotBookings.selectProjectPrompt' | translate }}
        </p>

        <ng-container *ngIf="selectedProjectId">
          <app-inline-banner *ngIf="plotsLoadError" tone="danger" [dismissible]="true"
            class="plot-bookings__plots-load-error" (dismissed)="plotsLoadError = false">
            {{ 'plotBookings.plotsLoadError' | translate }}
          </app-inline-banner>

          <app-editable-table
            [readOnly]="true"
            [columns]="plotColumns"
            [rows]="plotRows"
            [emptyStateLabel]="'plotBookings.plotsEmptyState' | translate"
          ></app-editable-table>

          <div class="plot-bookings__plots-pagination" *ngIf="plotPage">
            <button type="button" class="brand-button brand-button--secondary"
              [disabled]="plotPage.page === 0" (click)="goToPlotsPage(plotPage.page - 1)">
              {{ 'plotBookings.previousPageAction' | translate }}
            </button>
            <span class="plot-bookings__plots-page-indicator">
              {{ 'plotBookings.pageIndicator' | translate: { page: currentPlotsPage, totalPages: totalPlotsPages } }}
            </span>
            <button type="button" class="brand-button brand-button--secondary"
              [disabled]="(plotPage.page + 1) * plotPage.size >= plotPage.totalElements" (click)="goToPlotsPage(plotPage.page + 1)">
              {{ 'plotBookings.nextPageAction' | translate }}
            </button>
          </div>
        </ng-container>
      </div>

      <div *ngIf="activeTab === 'myBookings'" class="plot-bookings__my-bookings">
        <app-inline-banner *ngIf="bookingsLoadError" tone="danger" [dismissible]="true"
          class="plot-bookings__bookings-load-error" (dismissed)="bookingsLoadError = false">
          {{ 'plotBookings.bookingsLoadError' | translate }}
        </app-inline-banner>

        <app-editable-table
          [readOnly]="true"
          [columns]="bookingColumns"
          [rows]="bookingRows"
          [emptyStateLabel]="'plotBookings.bookingsEmptyState' | translate"
          (rowClick)="selectBooking(bookingPage!.bookings[$event])"
        ></app-editable-table>

        <div class="plot-bookings__bookings-pagination" *ngIf="bookingPage">
          <button type="button" class="brand-button brand-button--secondary"
            [disabled]="bookingPage.page === 0" (click)="goToBookingsPage(bookingPage.page - 1)">
            {{ 'plotBookings.previousPageAction' | translate }}
          </button>
          <span class="plot-bookings__bookings-page-indicator">
            {{ 'plotBookings.pageIndicator' | translate: { page: currentBookingsPage, totalPages: totalBookingsPages } }}
          </span>
          <button type="button" class="brand-button brand-button--secondary"
            [disabled]="(bookingPage.page + 1) * bookingPage.size >= bookingPage.totalElements" (click)="goToBookingsPage(bookingPage.page + 1)">
            {{ 'plotBookings.nextPageAction' | translate }}
          </button>
        </div>
      </div>
    </div>

    <app-side-panel [open]="panelOpen" [title]="'plotBookings.emiScheduleTitle' | translate" (closed)="closePanel()">
      <div *ngIf="selectedBooking" class="plot-bookings__emi-schedule">
        <p class="plot-bookings__emi-summary">
          {{ 'plotBookings.emiSummary' | translate: { plotId: selectedBooking.plotId, count: selectedBooking.installmentCount } }}
        </p>
        <app-editable-table
          [readOnly]="true"
          [columns]="emiColumns"
          [rows]="emiRows"
          [emptyStateLabel]="'plotBookings.bookingsEmptyState' | translate"
        ></app-editable-table>
      </div>
    </app-side-panel>
  `
})
export class PlotBookingsComponent implements OnInit, OnDestroy {
  private plotBookingsService = inject(PlotBookingsService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);
  private destroyed$ = new Subject<void>();

  activeTab: 'availablePlots' | 'myBookings' = 'availablePlots';

  projects: Project[] = [];
  projectsLoadError = false;
  selectedProjectId = '';
  plotPage: PlotPageResponse | null = null;
  plotsLoadError = false;
  plotColumns: EditableTableColumn[] = [];
  plotRows: Record<string, string>[] = [];

  bookingPage: AssociateBookingPage | null = null;
  bookingsLoadError = false;
  bookingColumns: EditableTableColumn[] = [];
  bookingRows: Record<string, string>[] = [];
  private bookingsLoaded = false;

  selectedBooking: Booking | null = null;
  panelOpen = false;
  emiColumns: EditableTableColumn[] = [];
  emiRows: Record<string, string>[] = [];

  get tabs(): TabDefinition[] {
    return [
      { id: 'availablePlots', label: this.translate.instant('plotBookings.tabAvailablePlots') },
      { id: 'myBookings', label: this.translate.instant('plotBookings.tabMyBookings') }
    ];
  }

  get currentPlotsPage(): number {
    return (this.plotPage?.page ?? 0) + 1;
  }

  get totalPlotsPages(): number {
    if (!this.plotPage || this.plotPage.size === 0) return 1;
    return Math.max(1, Math.ceil(this.plotPage.totalElements / this.plotPage.size));
  }

  get currentBookingsPage(): number {
    return (this.bookingPage?.page ?? 0) + 1;
  }

  get totalBookingsPages(): number {
    if (!this.bookingPage || this.bookingPage.size === 0) return 1;
    return Math.max(1, Math.ceil(this.bookingPage.totalElements / this.bookingPage.size));
  }

  ngOnInit(): void {
    // buildColumns() uses translate.get() (reactive) rather than instant() -- instant() only
    // resolves once the async translation file fetch (TranslateHttpLoader) completes, so a
    // synchronous instant() call here would bake in the raw i18n key. onLangChange keeps the
    // columns in sync if the user switches languages after initial load.
    this.buildColumns();
    this.translate.onLangChange.pipe(takeUntil(this.destroyed$)).subscribe(() => this.buildColumns());
    this.loadProjects();
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  private buildColumns(): void {
    this.translate
      .get([
        'plotBookings.columnPlotNo',
        'plotBookings.columnPlotType',
        'plotBookings.columnAreaSqft',
        'plotBookings.columnRate',
        'plotBookings.columnPrice',
        'plotBookings.columnStatus',
        'plotBookings.columnPlotId',
        'plotBookings.columnTotalAmount',
        'plotBookings.columnInstallmentCount',
        'plotBookings.columnBookedAt',
        'plotBookings.columnInstallmentNumber',
        'plotBookings.columnInstallmentAmount',
        'plotBookings.columnDueDate'
      ])
      .pipe(takeUntil(this.destroyed$))
      .subscribe(t => {
        this.plotColumns = [
          { key: 'plotNo', label: t['plotBookings.columnPlotNo'], type: 'text' },
          { key: 'plotType', label: t['plotBookings.columnPlotType'], type: 'text' },
          { key: 'areaSqft', label: t['plotBookings.columnAreaSqft'], type: 'text' },
          { key: 'rate', label: t['plotBookings.columnRate'], type: 'text' },
          { key: 'price', label: t['plotBookings.columnPrice'], type: 'text' },
          { key: 'status', label: t['plotBookings.columnStatus'], type: 'text' }
        ];
        this.bookingColumns = [
          { key: 'plotId', label: t['plotBookings.columnPlotId'], type: 'text' },
          { key: 'totalAmount', label: t['plotBookings.columnTotalAmount'], type: 'text' },
          { key: 'installmentCount', label: t['plotBookings.columnInstallmentCount'], type: 'text' },
          { key: 'bookedAt', label: t['plotBookings.columnBookedAt'], type: 'text' }
        ];
        this.emiColumns = [
          { key: 'installmentNumber', label: t['plotBookings.columnInstallmentNumber'], type: 'text' },
          { key: 'amount', label: t['plotBookings.columnInstallmentAmount'], type: 'text' },
          { key: 'dueDate', label: t['plotBookings.columnDueDate'], type: 'text' }
        ];
      });
  }

  onTabChange(tabId: string): void {
    this.activeTab = tabId as 'availablePlots' | 'myBookings';
    // Lazy-load: My Bookings' first page only fetched the first time that tab is opened, not
    // eagerly on init alongside Available Plots -- avoids an unconditional extra request for
    // associates who never leave the default tab, and keeps the two tabs' loading independently
    // testable.
    if (this.activeTab === 'myBookings' && !this.bookingsLoaded) {
      this.loadBookingsPage(0);
    }
  }

  onProjectSelect(projectId: string): void {
    this.selectedProjectId = projectId;
    this.plotPage = null;
    this.plotRows = [];
    if (projectId) {
      this.loadPlotsPage(0);
    }
  }

  goToPlotsPage(page: number): void {
    this.loadPlotsPage(page);
  }

  goToBookingsPage(page: number): void {
    this.loadBookingsPage(page);
  }

  // No HTTP call: BookingResponse (and therefore AssociateBookingPage.bookings[]) already embeds
  // each booking's full installments array from the server -- see BookingService.getMyBookings on
  // the backend, which attaches the schedule before returning the page.
  selectBooking(booking: Booking): void {
    this.selectedBooking = booking;
    this.emiRows = booking.installments.map(installment => ({
      installmentNumber: String(installment.installmentNumber),
      amount: String(installment.amount),
      dueDate: this.datePipe.transform(installment.dueDate, 'mediumDate') ?? installment.dueDate
    }));
    this.panelOpen = true;
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  private loadProjects(): void {
    this.projectsLoadError = false;
    this.plotBookingsService.listProjects().subscribe({
      next: projects => (this.projects = projects),
      error: () => (this.projectsLoadError = true)
    });
  }

  private loadPlotsPage(page: number): void {
    if (!this.selectedProjectId) return;
    this.plotsLoadError = false;
    this.plotBookingsService.listPlots(this.selectedProjectId, page, PAGE_SIZE).subscribe({
      next: res => {
        this.plotPage = res;
        this.plotRows = res.plots.map(plot => ({
          plotNo: plot.plotNo,
          plotType: plot.plotType,
          areaSqft: String(plot.areaSqft),
          rate: String(plot.rate),
          price: String(plot.price),
          status: plot.status
        }));
      },
      error: () => (this.plotsLoadError = true)
    });
  }

  private loadBookingsPage(page: number): void {
    this.bookingsLoadError = false;
    this.plotBookingsService.getMyBookings(page, PAGE_SIZE).subscribe({
      next: res => {
        this.bookingsLoaded = true;
        this.bookingPage = res;
        this.bookingRows = res.bookings.map(booking => ({
          plotId: booking.plotId,
          totalAmount: String(booking.totalAmount),
          installmentCount: String(booking.installmentCount),
          bookedAt: this.datePipe.transform(booking.bookedAt, 'medium') ?? booking.bookedAt
        }));
      },
      error: () => (this.bookingsLoadError = true)
    });
  }
}
