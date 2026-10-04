import { Component, ElementRef, EventEmitter, HostListener, OnInit, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { formatInr } from '../shared/utils/plot-grid.util';
import { AssociateBookingPage, Booking } from './models/associate-booking-page.model';
import { isOverdueRow, overdueCount, paidPercent, plotLabel } from './booking-view.util';
import { PlotBookingsService } from './plot-bookings.service';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-my-bookings',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="my-bookings" [attr.aria-busy]="loading">
      <app-inline-banner *ngIf="error" tone="danger">
        {{ 'plotBookings.bookingsLoadError' | translate }}
        <button type="button" class="my-bookings__retry" (click)="load(requestedPage)">{{ 'plotBookings.retryAction' | translate }}</button>
      </app-inline-banner>

      <div class="my-bookings__skeleton" role="status" *ngIf="!page && !error">
        <span class="my-bookings__sr">{{ 'plotBookings.loading' | translate }}</span>
        <span class="my-bookings__skeleton-card" *ngFor="let i of [1,2,3]"></span>
      </div>

      <div class="my-bookings__empty" *ngIf="page && !page.bookings.length">
        <h2>{{ 'plotBookings.bookingsEmptyTitle' | translate }}</h2>
        <p>{{ 'plotBookings.bookingsEmptyBody' | translate }}</p>
        <button type="button" class="brand-button brand-button--secondary my-bookings__view-availability" (click)="viewAvailability.emit()">
          {{ 'plotBookings.viewAvailability' | translate }}
        </button>
      </div>

      <ng-container *ngIf="page?.bookings?.length">
        <p class="my-bookings__note">{{ 'plotBookings.bookingsNote' | translate }}</p>
        <div class="my-bookings__split">
          <ul class="my-bookings__cards">
            <li *ngFor="let b of page!.bookings">
              <button type="button" class="my-bookings__card" [class.my-bookings__card--selected]="b.id === selected?.id"
                [class.my-bookings__card--cancelled]="b.status === 'CANCELLED'" [class.my-bookings__card--confirmed]="b.status === 'CONFIRMED'"
                [attr.data-booking-id]="b.id" [attr.aria-pressed]="b.id === selected?.id" (click)="select(b)">
                <span class="my-bookings__card-head">
                  <span class="my-bookings__plot" [class.my-bookings__plot--struck]="b.status === 'CANCELLED'">{{ label(b) }}</span>
                  <span class="my-bookings__badge my-bookings__badge--{{ b.status | lowercase }}">{{ 'plotBookings.bookingStatus.' + b.status | translate }}</span>
                  <span class="my-bookings__badge my-bookings__badge--overdue" *ngIf="overdue(b) as n">{{ 'plotBookings.overdueCount' | translate: { count: n } }}</span>
                </span>
                <span class="my-bookings__buyer">{{ b.buyerName }} · {{ b.bookedAt | date: 'mediumDate' }}</span>
                <span class="my-bookings__bar" role="img" [attr.aria-label]="'plotBookings.progressLabel' | translate: { percent: percent(b) }">
                  <span class="my-bookings__bar-fill" [style.width.%]="percent(b)"></span>
                </span>
                <span class="my-bookings__paid">{{ 'plotBookings.paidOfTotal' | translate: { paid: money(b.paidAmount), total: money(b.totalAmount) } }}</span>
                <span class="my-bookings__due">{{ dueKey(b) | translate: { amount: money(b.dueAmount) } }}</span>
              </button>
            </li>
          </ul>

          <article class="my-bookings__detail" [class.my-bookings__detail--open]="sheetOpen" *ngIf="selected as s">
            <button #backBtn type="button" class="brand-button brand-button--secondary my-bookings__back" (click)="back()">
              {{ 'plotBookings.backToBookings' | translate }}
            </button>
            <h2 class="my-bookings__detail-title" [class.my-bookings__plot--struck]="s.status === 'CANCELLED'">{{ label(s) }}</h2>
            <p class="my-bookings__detail-sub" *ngIf="s.projectName">{{ s.projectName }}</p>
            <p class="my-bookings__detail-sub">{{ 'plotBookings.buyerLabel' | translate: { buyer: s.buyerName } }}</p>
            <dl class="my-bookings__facts">
              <div><dt>{{ 'plotBookings.facts.total' | translate }}</dt><dd>{{ money(s.totalAmount) }}</dd></div>
              <div><dt>{{ 'plotBookings.facts.paid' | translate }}</dt><dd>{{ money(s.paidAmount) }}</dd></div>
              <div><dt>{{ 'plotBookings.facts.due' | translate }}</dt><dd>{{ money(s.dueAmount) }}</dd></div>
              <div><dt>{{ 'plotBookings.facts.installments' | translate }}</dt><dd>{{ s.installmentCount }}</dd></div>
            </dl>
            <span class="my-bookings__bar my-bookings__bar--large" role="img" [attr.aria-label]="'plotBookings.progressLabel' | translate: { percent: percent(s) }">
              <span class="my-bookings__bar-fill" [style.width.%]="percent(s)"></span>
            </span>
            <p class="my-bookings__status-note" *ngIf="s.status === 'CONFIRMED'">{{ 'plotBookings.confirmedNote' | translate }}</p>
            <p class="my-bookings__status-note" *ngIf="s.status === 'CANCELLED'">{{ 'plotBookings.cancelledNote' | translate }}</p>
            <table class="my-bookings__table">
              <thead>
                <tr>
                  <th>{{ 'plotBookings.column.no' | translate }}</th>
                  <th>{{ 'plotBookings.column.dueDate' | translate }}</th>
                  <th>{{ 'plotBookings.column.amount' | translate }}</th>
                  <th>{{ 'plotBookings.column.status' | translate }}</th>
                  <th>{{ 'plotBookings.column.paidOn' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let i of s.installments" [class.my-bookings__row--overdue]="isOverdue(i)" [class.my-bookings__row--void]="i.status === 'VOID'">
                  <td><span class="my-bookings__cell-label">{{ 'plotBookings.column.no' | translate }}</span>{{ i.installmentNumber }}</td>
                  <td><span class="my-bookings__cell-label">{{ 'plotBookings.column.dueDate' | translate }}</span>{{ i.dueDate | date: 'mediumDate' }}</td>
                  <td class="my-bookings__amount"><span class="my-bookings__cell-label">{{ 'plotBookings.column.amount' | translate }}</span>{{ money(i.amount) }}</td>
                  <td>
                    <span class="my-bookings__cell-label">{{ 'plotBookings.column.status' | translate }}</span>
                    <span class="my-bookings__badge my-bookings__badge--{{ i.status | lowercase }}">{{ 'plotBookings.installmentStatus.' + i.status | translate }}</span>
                    <span class="my-bookings__badge my-bookings__badge--overdue" *ngIf="isOverdue(i)">{{ 'plotBookings.overdue' | translate }}</span>
                  </td>
                  <td><span class="my-bookings__cell-label">{{ 'plotBookings.column.paidOn' | translate }}</span>{{ i.paidAt ? (i.paidAt | date: 'mediumDate') : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </article>
        </div>

        <div class="my-bookings__pager">
          <button type="button" class="brand-button brand-button--secondary my-bookings__prev" [disabled]="page!.page === 0" (click)="goTo(page!.page - 1)">
            {{ 'plotBookings.previousPageAction' | translate }}
          </button>
          <span>{{ 'plotBookings.pageIndicator' | translate: { page: page!.page + 1, totalPages: totalPages } }}</span>
          <button type="button" class="brand-button brand-button--secondary my-bookings__next" [disabled]="page!.page + 1 >= totalPages" (click)="goTo(page!.page + 1)">
            {{ 'plotBookings.nextPageAction' | translate }}
          </button>
        </div>
      </ng-container>
    </div>
  `
})
export class MyBookingsComponent implements OnInit {
  private service = inject(PlotBookingsService);
  @Output() viewAvailability = new EventEmitter<void>();

  @ViewChild('backBtn') backBtn?: ElementRef<HTMLButtonElement>;
  page: AssociateBookingPage | null = null;
  selected: Booking | null = null;
  sheetOpen = false;
  loading = false;
  error = false;
  requestedPage = 0;

  money = formatInr;
  percent = paidPercent;
  overdue = overdueCount;
  label = plotLabel;
  isOverdue = isOverdueRow;

  get totalPages(): number {
    if (!this.page || this.page.size === 0) { return 1; }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void { this.load(0); }

  // The previous page stays on screen if this load fails (error banner + Retry above it).
  load(p: number): void {
    this.requestedPage = p;
    this.loading = true;
    this.error = false;
    this.service.getMyBookings(p, PAGE_SIZE).subscribe({
      next: res => {
        if (p !== this.requestedPage) { return; }
        this.loading = false;
        this.page = res;
        this.selected = res.bookings[0] ?? null;
        this.sheetOpen = false;
      },
      error: () => {
        if (p !== this.requestedPage) { return; }
        this.loading = false; this.error = true;
      }
    });
  }

  goTo(p: number): void { this.load(p); }

  // No HTTP: each booking already embeds its installments (BookingService.getMyBookings).
  // On <960px the sheet is fixed full-screen: focus Back on open (only if visible), return to the card on close.
  select(b: Booking): void {
    this.selected = b;
    this.sheetOpen = true;
    setTimeout(() => { const el = this.backBtn?.nativeElement; if (el && el.offsetParent) { el.focus(); } });
  }

  back(): void {
    const id = this.selected?.id;
    this.sheetOpen = false;
    setTimeout(() => document.querySelector<HTMLElement>(`[data-booking-id="${id}"]`)?.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.sheetOpen) { this.back(); } }

  dueKey(b: Booking): string {
    if (b.status === 'CANCELLED') { return 'plotBookings.noFurtherDues'; }
    return b.dueAmount === 0 ? 'plotBookings.fullyPaid' : 'plotBookings.dueAmount';
  }
}
