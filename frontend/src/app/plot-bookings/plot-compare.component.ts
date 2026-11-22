import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { formatInr } from '../shared/utils/plot-grid.util';
import { EmiInstallment } from './models/associate-booking-page.model';
import { PlotSummary, paymentsOf, summarize } from './booking-view.util';
// Type-only: the interface is erased, so there is no runtime import cycle with BookingTableComponent.
import type { BookingRow } from './booking-table.component';

// Compare view: a summary table (plots as columns) and one scrolling payment column per plot.
@Component({
  selector: 'app-plot-compare',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <section class="plot-compare" [attr.aria-label]="'plotBookings.compare.title' | translate: { count: rows.length }">
      <div class="plot-compare__header">
        <h2 class="plot-compare__title">{{ 'plotBookings.compare.title' | translate: { count: rows.length } }}</h2>
        <input class="plot-compare__add" *ngIf="available.length && !atMax" list="plot-compare-add-list" autocomplete="off"
          [placeholder]="'plotBookings.compare.addPlot' | translate" [attr.aria-label]="'plotBookings.compare.addPlot' | translate" (change)="onAdd($event)">
        <datalist id="plot-compare-add-list">
          <option *ngFor="let a of available" [value]="label(a)"></option>
        </datalist>
        <span class="plot-compare__max" *ngIf="atMax" role="status">{{ 'plotBookings.compare.maxNote' | translate }}</span>
        <button type="button" class="plot-compare__clear" (click)="clear.emit()">{{ 'plotBookings.compare.clear' | translate }}</button>
      </div>

      <table class="plot-compare__summary" [attr.aria-label]="'plotBookings.compare.title' | translate: { count: rows.length }">
        <thead><tr>
          <th scope="col"></th>
          <th scope="col" class="plot-compare__plot" *ngFor="let r of rows; let i = index; trackBy: trackKey">
            <span class="plot-compare__dot plot-compare__dot--{{ i % 4 + 1 }}"></span>
            <strong>{{ r.plotNo || '—' }}</strong> · {{ r.projectName || '—' }}
            <button type="button" class="plot-compare__remove"
              [attr.aria-label]="'plotBookings.compare.remove' | translate: { plot: label(r) }" (click)="remove.emit(r.key)">✕</button>
            <span class="plot-compare__sub">{{ r.associateCode || '—' }} · {{ r.bookedAt | date: 'd MMM y' : '+0530' }}
              <span class="plot-compare__badge" [class.plot-compare__badge--bad]="r.status === 'CANCELLED'">{{ 'plotBookings.compare.status.' + (r.status || 'ACTIVE') | translate }}</span></span>
          </th>
        </tr></thead>
        <tbody>
          <tr>
            <td class="plot-compare__k">{{ 'plotBookings.compare.metric.total' | translate }}</td>
            <td *ngFor="let r of rows" class="plot-compare__num" [attr.data-label]="label(r)">{{ money(r.total) }}</td>
          </tr>
          <tr>
            <td class="plot-compare__k">{{ 'plotBookings.compare.metric.paid' | translate }}</td>
            <td *ngFor="let r of rows" [attr.data-label]="label(r)">
              <span class="plot-compare__num">{{ money(r.paid) }}</span> · {{ sum(r).paidPct }}%
              <span class="plot-compare__bar"><i [style.width.%]="sum(r).paidPct"></i></span>
            </td>
          </tr>
          <tr>
            <td class="plot-compare__k">{{ 'plotBookings.compare.metric.rest' | translate }}</td>
            <td *ngFor="let r of rows" class="plot-compare__num" [attr.data-label]="label(r)">
              <ng-container *ngIf="r.status === 'CANCELLED' && r.refundAmount != null; else rest">{{ 'plotBookings.compare.refund' | translate: { amount: money(r.refundAmount) } }}</ng-container>
              <ng-template #rest>{{ money(r.rest) }}</ng-template>
            </td>
          </tr>
          <tr>
            <td class="plot-compare__k">{{ 'plotBookings.compare.metric.payments' | translate }}</td>
            <td *ngFor="let r of rows" [attr.data-label]="label(r)">
              {{ sum(r).paymentCount }}
              <span class="plot-compare__badge plot-compare__badge--warn" *ngIf="sum(r).pendingCount">{{ 'plotBookings.compare.pendingCount' | translate: { count: sum(r).pendingCount } }}</span>
            </td>
          </tr>
          <tr>
            <td class="plot-compare__k">{{ 'plotBookings.compare.metric.lastPaid' | translate }}</td>
            <td *ngFor="let r of rows" [attr.data-label]="label(r)">{{ sum(r).lastPaidAt ? (sum(r).lastPaidAt | date: 'd MMM y' : '+0530') : '—' }}</td>
          </tr>
          <tr>
            <td class="plot-compare__k">{{ 'plotBookings.compare.metric.nextDue' | translate }}</td>
            <td *ngFor="let r of rows" class="plot-compare__nextdue" [attr.data-label]="label(r)">
              <ng-container *ngIf="r.status !== 'CANCELLED'; else none">
                <span class="plot-compare__badge plot-compare__badge--bad" *ngIf="sum(r).overdueCount">{{ 'plotBookings.compare.overdue' | translate: { count: sum(r).overdueCount, amount: money(sum(r).overdueAmount) } }}</span>
                <ng-container *ngIf="sum(r).nextDue as d">{{ d.dueDate | date: 'd MMM y' }} · <span class="plot-compare__num">{{ money(d.amount) }}</span></ng-container>
                <ng-container *ngIf="!sum(r).nextDue && !sum(r).overdueCount">—</ng-container>
              </ng-container>
              <ng-template #none>—</ng-template>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="plot-compare__cols">
        <section class="plot-compare__col" *ngFor="let r of rows; let i = index; trackBy: trackKey">
          <h3><span class="plot-compare__dot plot-compare__dot--{{ i % 4 + 1 }}"></span>{{ label(r) }}</h3>
          <div class="plot-compare__scroll">
            <table class="plot-compare__payments" [attr.aria-label]="label(r)">
              <thead><tr>
                <th scope="col">{{ 'plotBookings.compare.date' | translate }}</th>
                <th scope="col">{{ 'plotBookings.payments.amount' | translate }}</th>
                <th scope="col">{{ 'plotBookings.payments.mode' | translate }}</th>
                <th scope="col">{{ 'plotBookings.payments.receiptNo' | translate }}</th>
                <th scope="col">{{ 'plotBookings.compare.col.status' | translate }}</th>
              </tr></thead>
              <tbody>
                <tr *ngIf="!payments(r).length"><td colspan="5">{{ 'plotBookings.payments.empty' | translate }}</td></tr>
                <tr *ngFor="let p of payments(r)">
                  <td class="plot-compare__mono" [attr.data-label]="'plotBookings.compare.date' | translate">{{ p.paidAt ? (p.paidAt | date: 'd MMM y' : '+0530') : '—' }}</td>
                  <td class="plot-compare__mono" [attr.data-label]="'plotBookings.payments.amount' | translate">{{ money(p.amount) }}</td>
                  <td [attr.data-label]="'plotBookings.payments.mode' | translate">{{ p.paymentMode ? ('admin.projectsPlots.paymentMode.' + p.paymentMode | translate) : '—' }}</td>
                  <td class="plot-compare__mono" [attr.data-label]="'plotBookings.payments.receiptNo' | translate">{{ p.receiptNo || '—' }}</td>
                  <td [attr.data-label]="'plotBookings.compare.col.status' | translate">
                    <span class="plot-compare__badge" [class.plot-compare__badge--warn]="p.status === 'ENTERED'">{{ 'plotBookings.compare.paymentStatus.' + p.status | translate }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  `
})
export class PlotCompareComponent {
  @Input({ required: true }) rows: BookingRow[] = [];
  // Plots that can still be added; the add control is hidden when empty or at the maximum.
  @Input() available: BookingRow[] = [];
  @Input() atMax = false;
  @Output() add = new EventEmitter<string>();
  @Output() remove = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();

  money = formatInr;
  payments = (r: BookingRow): EmiInstallment[] => paymentsOf(r.installments);
  sum = (r: BookingRow): PlotSummary => summarize(r);
  trackKey = (_: number, r: BookingRow): string => r.key;

  // "A-2 · VSA53628 · 20 Oct": tells two bookings of the same plot apart.
  label(r: BookingRow): string {
    return [r.plotNo || '—', r.associateCode || '—', formatDate(r.bookedAt, 'd MMM', 'en-US', '+0530')].join(' · ');
  }

  onAdd(e: Event): void {
    const input = e.target as HTMLInputElement;
    const hit = this.available.find(a => this.label(a) === input.value);
    if (hit) { this.add.emit(hit.key); }
    input.value = '';
  }
}
