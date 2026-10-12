import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { map } from 'rxjs';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PagerComponent } from '../../shared/components/pager/pager.component';
import { ExportColumn, exportCsv } from '../../shared/utils/table-export.util';
import { BookingPage, RegisterFilters } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { collectPages, formatMoney, plotText } from './bookings-emi.util';
import { ReportFilterValue, ReportFiltersComponent } from './report-filters.component';

const PAGE_SIZE = 20;
const day = (s?: string | null): string => (s ? s.slice(0, 10) : '');

@Component({
  selector: 'app-cancelled-bookings',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./cancelled-bookings.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, PagerComponent, ReportFiltersComponent],
  template: `
    <div class="cancelled-bookings" [attr.aria-busy]="loading || exporting">
      <app-report-filters fromKey="admin.bookingsEmi.filter.cancelledFrom" toKey="admin.bookingsEmi.filter.cancelledTo"
        [locked]="exporting" (filtersChange)="onFilters($event)"></app-report-filters>

      <div class="cancelled-bookings__bar">
        <button type="button" class="brand-button brand-button--secondary cancelled-bookings__export" [disabled]="exporting" (click)="export()">{{ 'admin.bookingsEmi.action.exportCsv' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="exportError" tone="danger" [dismissible]="true" (dismissed)="exportError = false">{{ 'admin.bookingsEmi.err.export' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.loadList' | translate }}
        <button type="button" class="booking-register__retry cancelled-bookings__retry" (click)="load(currentPage)">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="booking-register__list">
        <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
          <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
          <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3]"></span>
        </div>

        <div class="booking-register__empty" *ngIf="page && !page.bookings.length">
          <span class="material-symbols-outlined" aria-hidden="true">event_busy</span>
          <h2>{{ 'admin.bookingsEmi.empty.cancelledTitle' | translate }}</h2>
        </div>

        <table class="booking-register__table" *ngIf="page?.bookings?.length" [attr.aria-label]="'admin.bookingsEmi.tab.cancelled' | translate">
          <thead>
            <tr>
              <th scope="col">{{ 'admin.bookingsEmi.col.bookedOn' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.associateId' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.associate' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.buyer' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.mobile' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.cancelledOn' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.discount' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.total' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.paid' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let b of page!.bookings">
              <td [attr.data-label]="'admin.bookingsEmi.col.bookedOn' | translate">{{ b.bookedAt | date: 'mediumDate' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.associateId' | translate">{{ b.associateCode || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.associate' | translate">{{ b.associateName || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.buyer' | translate"><strong>{{ b.buyerName }}</strong><br /><span class="booking-register__sub">{{ plot(b) }}<ng-container *ngIf="b.projectName"> · {{ b.projectName }}</ng-container></span></td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.mobile' | translate">{{ b.buyerPhone || '—' }}</td>
              <td [attr.data-label]="'admin.bookingsEmi.col.cancelledOn' | translate">{{ b.cancelledAt ? (b.cancelledAt | date: 'mediumDate') : '—' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.discount' | translate">{{ b.discount != null ? money(b.discount) : '—' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.total' | translate">{{ money(b.totalAmount) }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.paid' | translate">{{ money(b.paidAmount) }}</td>
            </tr>
          </tbody>
        </table>
        <app-pager *ngIf="page" [page]="page.page" [size]="page.size" [total]="page.totalElements" [disabled]="loading || exporting" (pageChange)="load($event)"></app-pager>
      </div>

    </div>
  `
})
export class CancelledBookingsComponent implements OnInit {
  private service = inject(BookingsEmiService);

  page: BookingPage | null = null;
  loadError = false;
  loading = false;
  exporting = false;
  exportError = false;
  currentPage = 0;
  private seq = 0;
  private filters: ReportFilterValue = { from: '', to: '', projectId: '' };

  money = formatMoney;
  plot = plotText;

  private readonly columns: ExportColumn<Booking>[] = [
    { header: 'Booked on', value: b => day(b.bookedAt) },
    { header: 'Associate ID', value: b => b.associateCode },
    { header: 'Name', value: b => b.associateName },
    { header: 'Buyer', value: b => b.buyerName },
    { header: 'Plot', value: b => plotText(b) },
    { header: 'Project', value: b => b.projectName },
    { header: 'Mobile', value: b => b.buyerPhone },
    { header: 'Cancelled on', value: b => day(b.cancelledAt) },
    { header: 'Discount', value: b => b.discount },
    { header: 'Total', value: b => b.totalAmount },
    { header: 'Paid', value: b => b.paidAmount }
  ];

  ngOnInit(): void { this.load(0); }

  onFilters(f: ReportFilterValue): void { this.filters = f; this.load(0); }

  private query(): RegisterFilters {
    return {
      status: 'CANCELLED', associateId: '', plotId: '', projectId: this.filters.projectId, overdue: false,
      cancelledFrom: this.filters.from, cancelledTo: this.filters.to
    };
  }

  // Latest-request-wins; a failed load keeps the previous rows on screen.
  load(p: number): void {
    const mine = ++this.seq;
    this.currentPage = p;
    this.loading = true;
    this.loadError = false;
    this.service.list(this.query(), p, PAGE_SIZE).subscribe({
      next: res => { if (mine === this.seq) { this.loading = false; this.page = res; } },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  export(): void {
    if (this.exporting) { return; }
    this.exporting = true;
    this.exportError = false;
    const q = this.query();
    collectPages<Booking>(p => this.service.list(q, p, 100).pipe(map(r => ({ rows: r.bookings, totalElements: r.totalElements }))))
      .subscribe({
        next: rows => { exportCsv(rows, this.columns, 'cancelled-bookings.csv'); this.exporting = false; },
        error: () => { this.exporting = false; this.exportError = true; }
      });
  }
}
