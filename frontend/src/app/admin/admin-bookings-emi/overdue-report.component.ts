import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { OverdueReportPage } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { formatMoney, plotText } from './bookings-emi.util';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-overdue-report',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="overdue-report" [attr.aria-busy]="loading">
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.loadOverdue' | translate }}
        <button type="button" class="booking-register__retry overdue-report__retry" (click)="reload()">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
        <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
        <span class="booking-register__skeleton-row overdue-report__skeleton-row" *ngFor="let i of [1,2,3]"></span>
      </div>

      <div class="booking-register__empty" *ngIf="page && !page.rows.length">
        <span class="material-symbols-outlined" aria-hidden="true">task_alt</span>
        <h2>{{ 'admin.bookingsEmi.empty.overdueTitle' | translate }}</h2>
        <p>{{ 'admin.bookingsEmi.empty.overdueBody' | translate }}</p>
      </div>

      <table class="booking-register__table" *ngIf="page?.rows?.length" [attr.aria-label]="'admin.bookingsEmi.tab.overdue' | translate">
        <thead>
          <tr>
            <th scope="col">{{ 'admin.bookingsEmi.col.buyer' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.associate' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.overdue' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.amountOverdue' | translate }}</th>
            <th scope="col">{{ 'admin.bookingsEmi.col.oldestDue' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of page!.rows" class="overdue-report__row">
            <td [attr.data-label]="'admin.bookingsEmi.col.buyer' | translate">
              <button type="button" class="booking-register__retry overdue-report__open" (click)="openBooking.emit(r.bookingId)"><strong>{{ r.buyerName }}</strong></button><br /><span class="booking-register__sub">{{ plot(r) }}</span>
            </td>
            <td [attr.data-label]="'admin.bookingsEmi.col.associate' | translate">{{ r.associateName }}</td>
            <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.overdue' | translate">{{ r.overdueCount }}</td>
            <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.amountOverdue' | translate">{{ money(r.overdueAmount) }}</td>
            <td [attr.data-label]="'admin.bookingsEmi.col.oldestDue' | translate">{{ r.oldestDueDate | date: 'mediumDate' }}</td>
          </tr>
        </tbody>
      </table>

      <div class="booking-register__pager" *ngIf="page?.rows?.length">
        <button type="button" class="brand-button brand-button--secondary overdue-report__prev" [disabled]="page!.page === 0" (click)="goTo(page!.page - 1)">{{ 'admin.bookingsEmi.previous' | translate }}</button>
        <span>{{ 'admin.bookingsEmi.pager' | translate: { page: page!.page + 1, totalPages: totalPages, count: page!.totalElements } }}</span>
        <button type="button" class="brand-button brand-button--secondary overdue-report__next" [disabled]="page!.page + 1 >= totalPages" (click)="goTo(page!.page + 1)">{{ 'admin.bookingsEmi.next' | translate }}</button>
      </div>
    </div>
  `
})
export class OverdueReportComponent implements OnInit {
  private service = inject(BookingsEmiService);

  @Output() openBooking = new EventEmitter<string>();
  @Output() total = new EventEmitter<number>();

  page: OverdueReportPage | null = null;
  loadError = false;
  loading = false;
  private seq = 0;
  private currentPage = 0;

  money = formatMoney;
  plot = plotText;

  get totalPages(): number {
    return !this.page || !this.page.size ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void { this.load(0); }

  // re-requests the last attempted page
  reload(): void { this.load(this.currentPage); }
  goTo(p: number): void { this.load(p); }

  // Latest-request-wins; a failed load keeps the previous page's rows on screen.
  private load(p: number): void {
    const mine = ++this.seq;
    this.currentPage = p;
    this.loading = true;
    this.loadError = false;
    this.service.overdue(p, PAGE_SIZE).subscribe({
      next: res => {
        if (mine !== this.seq) { return; }
        this.loading = false;
        this.page = res;
        this.total.emit(res.totalElements);
      },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }
}
