import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { formatInr } from '../shared/utils/plot-grid.util';
import { EmiInstallment } from './models/associate-booking-page.model';
import { paymentsOf } from './booking-view.util';
// Type-only: the interface is erased, so there is no runtime import cycle with BookingTableComponent.
import type { BookingRow } from './booking-table.component';

// Side-by-side cards: one per plot, each with its totals and payment list (same rule and columns as the Details popup).
@Component({
  selector: 'app-plot-compare',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    <section class="plot-compare" [attr.aria-label]="'plotBookings.compare.title' | translate: { count: rows.length }">
      <div class="plot-compare__header">
        <h2 class="plot-compare__title">{{ 'plotBookings.compare.title' | translate: { count: rows.length } }}</h2>
        <select class="plot-compare__add" *ngIf="available.length" [attr.aria-label]="'plotBookings.compare.addPlot' | translate" (change)="onAdd($event)">
          <option value="">{{ 'plotBookings.compare.addPlot' | translate }}</option>
          <option *ngFor="let a of available; trackBy: trackKey" [value]="a.key">{{ a.projectName || '—' }} · {{ a.plotNo || '—' }}</option>
        </select>
        <button type="button" class="plot-compare__clear" (click)="clear.emit()">{{ 'plotBookings.compare.clear' | translate }}</button>
      </div>
      <div class="plot-compare__grid">
        <article class="plot-compare__card" *ngFor="let r of rows; trackBy: trackKey">
          <div class="plot-compare__card-head">
            <h3>{{ r.projectName || '—' }} · {{ r.plotNo || '—' }}</h3>
            <button type="button" class="plot-compare__remove"
              [attr.aria-label]="'plotBookings.compare.remove' | translate: { plot: r.plotNo || '' }" (click)="remove.emit(r.key)">✕</button>
          </div>
          <dl class="plot-compare__facts">
            <div><dt>{{ 'plotBookings.table.totalPrice' | translate }}</dt><dd>{{ money(r.total) }}</dd></div>
            <div><dt>{{ 'plotBookings.table.paid' | translate }}</dt><dd>{{ money(r.paid) }}</dd></div>
            <div><dt>{{ 'plotBookings.table.rest' | translate }}</dt><dd>{{ money(r.rest) }}</dd></div>
          </dl>
          <div class="plot-compare__scroll">
          <table class="plot-compare__payments" [attr.aria-label]="'plotBookings.compare.payments' | translate">
            <thead><tr>
              <th scope="col" class="table__sno">{{ 'common.serialNo' | translate }}</th>
              <th scope="col">{{ 'plotBookings.payments.paymentDate' | translate }}</th>
              <th scope="col">{{ 'plotBookings.payments.amount' | translate }}</th>
              <th scope="col">{{ 'plotBookings.payments.receiptNo' | translate }}</th>
              <th scope="col">{{ 'plotBookings.payments.mode' | translate }}</th>
              <th scope="col">{{ 'plotBookings.payments.instrumentNo' | translate }}</th>
              <th scope="col">{{ 'plotBookings.payments.date' | translate }}</th>
            </tr></thead>
            <tbody>
              <tr *ngIf="!payments(r).length"><td colspan="7">{{ 'plotBookings.payments.empty' | translate }}</td></tr>
              <tr *ngFor="let i of payments(r); let n = index">
                <td class="table__sno" [attr.data-label]="'common.serialNo' | translate">{{ n + 1 }}</td>
                <td class="plot-compare__mono" [attr.data-label]="'plotBookings.payments.paymentDate' | translate">{{ i.confirmedAt ? (i.confirmedAt | date: 'd MMM y, h:mm:ss a' : '+0530') : '—' }}</td>
                <td class="plot-compare__mono" [attr.data-label]="'plotBookings.payments.amount' | translate">{{ money(i.amount) }}</td>
                <td class="plot-compare__mono" [attr.data-label]="'plotBookings.payments.receiptNo' | translate">{{ i.receiptNo || '—' }}</td>
                <td [attr.data-label]="'plotBookings.payments.mode' | translate">{{ i.paymentMode ? ('admin.projectsPlots.paymentMode.' + i.paymentMode | translate) : '—' }}</td>
                <td class="plot-compare__mono" [attr.data-label]="'plotBookings.payments.instrumentNo' | translate">{{ i.paymentRef || '—' }}</td>
                <td class="plot-compare__mono" [attr.data-label]="'plotBookings.payments.date' | translate">{{ i.paidAt ? (i.paidAt | date: 'mediumDate') : '—' }}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </article>
      </div>
    </section>
  `
})
export class PlotCompareComponent {
  @Input({ required: true }) rows: BookingRow[] = [];
  // Plots that can still be added (not yet in the comparison); the dropdown is hidden when empty.
  @Input() available: BookingRow[] = [];
  @Output() add = new EventEmitter<string>();
  @Output() remove = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();

  onAdd(e: Event): void {
    const select = e.target as HTMLSelectElement;
    if (select.value) { this.add.emit(select.value); }
    select.value = '';
  }

  money = formatInr;
  payments = (r: BookingRow): EmiInstallment[] => paymentsOf(r.installments);
  trackKey = (_: number, r: BookingRow): string => r.key;
}
