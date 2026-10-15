import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PagerComponent } from '../../shared/components/pager/pager.component';
import { BookingPage } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { formatMoney, plotText } from './bookings-emi.util';

const PAGE_SIZE = 20;

// Bookings that were transferred to another associate at least once. Associate shown is the current owner.
@Component({
  selector: 'app-transferred-bookings',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./booking-register.component.scss', './booking-register-layout.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, PagerComponent],
  template: `
    <div class="transferred-bookings" [attr.aria-busy]="loading">
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.loadList' | translate }}
        <button type="button" class="booking-register__retry" (click)="load(currentPage)">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>
      <div class="booking-register__list">
        <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
          <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
          <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3]"></span>
        </div>
        <table class="booking-register__table" *ngIf="page && page.bookings.length" [attr.aria-label]="'admin.bookingsEmi.tab.transferred' | translate">
          <thead>
            <tr>
              <th scope="col">{{ 'admin.bookingsEmi.col.bookedOn' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.associateId' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.associate' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.buyer' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.total' | translate }}</th>
              <th scope="col">{{ 'admin.bookingsEmi.col.paid' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let b of page.bookings">
              <td [attr.data-label]="'admin.bookingsEmi.col.bookedOn' | translate">{{ b.bookedAt | date: 'mediumDate' }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.associateId' | translate">{{ b.associateCode || '—' }}</td>
              <td class="booking-register__wrap" [attr.data-label]="'admin.bookingsEmi.col.associate' | translate">{{ b.associateName || '—' }}</td>
              <td class="booking-register__wrap" [attr.data-label]="'admin.bookingsEmi.col.buyer' | translate"><strong>{{ b.buyerName }}</strong><br /><span class="booking-register__sub">{{ plot(b) }}<ng-container *ngIf="b.projectName"> · {{ b.projectName }}</ng-container></span></td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.total' | translate">{{ money(b.totalAmount) }}</td>
              <td class="booking-register__num" [attr.data-label]="'admin.bookingsEmi.col.paid' | translate">{{ money(b.paidAmount) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="booking-register__empty" *ngIf="page && !page.bookings.length">
          <span class="material-symbols-outlined" aria-hidden="true">swap_horiz</span>
          <h2>{{ 'admin.bookingsEmi.empty.transferredTitle' | translate }}</h2>
        </div>
        <app-pager *ngIf="page" [page]="page.page" [size]="page.size" [total]="page.totalElements" [disabled]="loading" (pageChange)="load($event)"></app-pager>
      </div>
    </div>
  `
})
export class TransferredBookingsComponent implements OnInit {
  private service = inject(BookingsEmiService);
  page: BookingPage | null = null;
  loadError = false;
  loading = false;
  currentPage = 0;
  private seq = 0;
  money = formatMoney;
  plot = plotText;

  ngOnInit(): void { this.load(0); }

  // Latest-request-wins; a failed load keeps the previous rows on screen.
  load(p: number): void {
    const mine = ++this.seq;
    this.currentPage = p;
    this.loading = true;
    this.loadError = false;
    this.service.transferred(p, PAGE_SIZE).subscribe({
      next: res => { if (mine === this.seq) { this.loading = false; this.page = res; } },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }
}
