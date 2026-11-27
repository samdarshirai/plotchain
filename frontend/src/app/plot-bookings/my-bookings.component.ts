import { Component, ViewEncapsulation, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { DateRangeComponent, last30Days } from '../shared/components/date-range/date-range.component';
import { AssociateBookingPage, Booking } from './models/associate-booking-page.model';
import { BookingTableComponent, bookingRow, saleRow } from './booking-table.component';
import { PlotBookingsService } from './plot-bookings.service';
import { SalesHistoryService } from '../sales-history/sales-history.service';
import { AssociateSalePage } from '../sales-history/models/associate-sale-page.model';
import { fetchAllPages } from '../shared/utils/fetch-all-pages';


@Component({
  selector: 'app-my-bookings',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrl: './my-bookings.component.scss',
  imports: [CommonModule, TranslateModule, InlineBannerComponent, BookingTableComponent, DateRangeComponent],
  template: `
    <div class="my-bookings booking-page" [attr.aria-busy]="loading">
      <h1 class="my-bookings__title">{{ 'plotBookings.myBookings.title' | translate }}</h1>
      <app-date-range [showCycles]="true" [from]="from" [to]="to" (rangeChange)="onRange($event)"></app-date-range>
      <app-inline-banner *ngIf="error" tone="danger">
        {{ 'plotBookings.bookingsLoadError' | translate }}
        <button type="button" class="my-bookings__retry" (click)="load(requestedPage)">{{ 'plotBookings.retryAction' | translate }}</button>
      </app-inline-banner>

      <div class="my-bookings__skeleton" role="status" *ngIf="!page && !error">
        <span class="my-bookings__sr">{{ 'plotBookings.loading' | translate }}</span>
        <span class="my-bookings__skeleton-card" *ngFor="let i of [1,2,3]"></span>
      </div>

      <ng-container *ngIf="page">
        <p class="my-bookings__note">{{ 'plotBookings.bookingsNote' | translate }}</p>
        <app-booking-table [rows]="rows" [inline]="true" [label]="'plotBookings.myBookings.title' | translate"></app-booking-table>
        <h2 class="my-bookings__sales-title">{{ 'plotBookings.myBookings.salesTitle' | translate }}</h2>
        <app-booking-table *ngIf="sales" [rows]="saleRows" [inline]="true" [label]="'plotBookings.myBookings.salesTitle' | translate"></app-booking-table>
      </ng-container>
    </div>
  `
})
export class MyBookingsComponent implements OnInit {
  private service = inject(PlotBookingsService);
  private salesService = inject(SalesHistoryService);

  sales: AssociateSalePage | null = null;
  get saleRows() { return (this.sales?.sales ?? []).map(saleRow); }

  page: AssociateBookingPage | null = null;
  from = last30Days().from;
  to = last30Days().to;
  loading = false;
  error = false;
  requestedPage = 0;

  get rows() { return (this.page?.bookings ?? []).map(bookingRow); }

  ngOnInit(): void { this.load(0); }

  onRange(r: { from: string; to: string }): void { this.from = r.from; this.to = r.to; this.load(0); }

  // The previous page stays on screen if this load fails (error banner + Retry above it).
  load(p: number): void {
    this.requestedPage = p;
    this.loading = true;
    this.error = false;
    // Sales I bought; a failure here just leaves the sales table empty, bookings still show.
    fetchAllPages((pg, size) => this.salesService.getMySales(pg, size, this.from, this.to, 'own')).subscribe({
      next: res => { if (p === this.requestedPage) { this.sales = res; } },
      error: () => undefined
    });
    fetchAllPages((pg, size) => this.service.getMyBookings(pg, size, this.from, this.to)).subscribe({
      next: res => {
        if (p !== this.requestedPage) { return; }
        this.loading = false;
        this.page = res;
      },
      error: () => {
        if (p !== this.requestedPage) { return; }
        this.loading = false; this.error = true;
      }
    });
  }

  dueKey(b: Booking): string {
    if (b.status === 'CANCELLED') { return 'plotBookings.noFurtherDues'; }
    return b.dueAmount === 0 ? 'plotBookings.fullyPaid' : 'plotBookings.dueAmount';
  }
}
