import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { formatArea, formatInr } from '../shared/utils/plot-grid.util';
import { Booking, EmiInstallment } from './models/associate-booking-page.model';
import { Sale } from '../admin/models/sale.model';

// One row shape for every Associate /plot-bookings table (team, left, right, mine, my-sales).
export interface BookingRow {
  key: string;
  bookedAt: string;
  associateCode?: string | null;
  associateName?: string | null;
  projectName?: string | null;
  plotType?: string | null;
  plotNo?: string | null;
  rate?: number | null;
  areaSqft?: number | null;
  price?: number | null;
  extraPrice?: number | null;
  total: number;
  paid: number;
  rest: number;
  installments?: EmiInstallment[];
}

export const bookingRow = (b: Booking): BookingRow => ({
  key: b.id, bookedAt: b.bookedAt, associateCode: b.associateCode, associateName: b.associateName,
  projectName: b.projectName, plotType: b.plotType, plotNo: b.plotNo, rate: b.rate, areaSqft: b.areaSqft,
  price: b.listPrice, extraPrice: b.extraPrice, total: b.totalAmount, paid: b.paidAmount, rest: b.dueAmount,
  installments: b.installments
});

// A recorded sale is a completed purchase: fully paid, nothing left.
export const saleRow = (s: Sale): BookingRow => ({
  key: s.id, bookedAt: s.recordedAt, associateCode: s.associateUserId, associateName: s.associateName,
  projectName: s.projectName, plotType: s.plotType, plotNo: s.plotNo, rate: s.rate, areaSqft: s.areaSqft,
  price: s.listPrice, extraPrice: s.extraPrice, total: s.amount, paid: s.amount, rest: 0
});

@Component({
  selector: 'app-booking-table',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  encapsulation: ViewEncapsulation.None,
  styleUrl: './booking-table.component.scss',
  template: `
    <div class="booking-table__scroll">
      <table class="booking-table" [attr.aria-label]="label">
        <thead>
          <tr>
            <th scope="col">{{ 'plotBookings.table.bookingDate' | translate }}</th>
            <th scope="col">{{ 'plotBookings.table.associateId' | translate }}</th>
            <th scope="col">{{ 'plotBookings.table.name' | translate }}</th>
            <th scope="col">{{ 'plotBookings.table.project' | translate }}</th>
            <th scope="col">{{ 'plotBookings.table.plotType' | translate }}</th>
            <th scope="col">{{ 'plotBookings.table.plotNo' | translate }}</th>
            <th scope="col" class="booking-table__num">{{ 'plotBookings.table.rate' | translate }}</th>
            <th scope="col" class="booking-table__num">{{ 'plotBookings.table.area' | translate }}</th>
            <th scope="col" class="booking-table__num">{{ 'plotBookings.table.price' | translate }}</th>
            <th scope="col" class="booking-table__num">{{ 'plotBookings.table.extraPrice' | translate }}</th>
            <th scope="col" class="booking-table__num">{{ 'plotBookings.table.totalPrice' | translate }}</th>
            <th scope="col" class="booking-table__num">{{ 'plotBookings.table.paid' | translate }}</th>
            <th scope="col" class="booking-table__num">{{ 'plotBookings.table.rest' | translate }}</th>
            <th scope="col">{{ 'plotBookings.table.details' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <ng-container *ngFor="let r of rows; trackBy: trackKey">
            <tr [class.booking-table__row--selected]="r.key === selectedKey" [attr.data-booking-id]="r.key">
              <td class="booking-table__mono" [attr.data-label]="'plotBookings.table.bookingDate' | translate">{{ r.bookedAt | date: 'mediumDate' }}</td>
              <td class="booking-table__mono" [attr.data-label]="'plotBookings.table.associateId' | translate">{{ r.associateCode || '—' }}</td>
              <td [attr.data-label]="'plotBookings.table.name' | translate">{{ r.associateName || '—' }}</td>
              <td [attr.data-label]="'plotBookings.table.project' | translate">{{ r.projectName || '—' }}</td>
              <td [attr.data-label]="'plotBookings.table.plotType' | translate">{{ r.plotType || '—' }}</td>
              <td class="booking-table__mono" [attr.data-label]="'plotBookings.table.plotNo' | translate">{{ r.plotNo || '—' }}</td>
              <td class="booking-table__num" [attr.data-label]="'plotBookings.table.rate' | translate">{{ money(r.rate) }}</td>
              <td class="booking-table__num" [attr.data-label]="'plotBookings.table.area' | translate">{{ r.areaSqft == null ? '—' : area(r.areaSqft) }}</td>
              <td class="booking-table__num" [attr.data-label]="'plotBookings.table.price' | translate">{{ money(r.price) }}</td>
              <td class="booking-table__num" [attr.data-label]="'plotBookings.table.extraPrice' | translate">{{ money(r.extraPrice ?? 0) }}</td>
              <td class="booking-table__num" [attr.data-label]="'plotBookings.table.totalPrice' | translate">{{ money(r.total) }}</td>
              <td class="booking-table__num" [attr.data-label]="'plotBookings.table.paid' | translate">{{ money(r.paid) }}</td>
              <td class="booking-table__num" [attr.data-label]="'plotBookings.table.rest' | translate">{{ money(r.rest) }}</td>
              <td [attr.data-label]="'plotBookings.table.details' | translate">
                <button type="button" class="booking-table__details" *ngIf="r.installments"
                  [attr.aria-expanded]="r.key === selectedKey" (click)="toggle(r)">
                  {{ 'plotBookings.table.detailsAction' | translate }}
                </button>
              </td>
            </tr>
            <tr class="booking-table__expand" *ngIf="inline && r.key === expandedKey && r.installments">
              <td colspan="14">
                <table class="booking-table__installments">
                  <thead><tr>
                    <th>{{ 'plotBookings.column.no' | translate }}</th>
                    <th>{{ 'plotBookings.column.dueDate' | translate }}</th>
                    <th>{{ 'plotBookings.column.amount' | translate }}</th>
                    <th>{{ 'plotBookings.column.status' | translate }}</th>
                    <th>{{ 'plotBookings.column.paidOn' | translate }}</th>
                  </tr></thead>
                  <tbody>
                    <tr *ngFor="let i of r.installments">
                      <td>{{ i.installmentNumber }}</td>
                      <td>{{ i.dueDate | date: 'mediumDate' }}</td>
                      <td>{{ money(i.amount) }}</td>
                      <td>{{ 'plotBookings.installmentStatus.' + i.status | translate }}</td>
                      <td>{{ i.paidAt ? (i.paidAt | date: 'mediumDate') : '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </ng-container>
        </tbody>
      </table>
    </div>
  `
})
export class BookingTableComponent {
  @Input({ required: true }) rows: BookingRow[] = [];
  @Input() label = '';
  // inline: Details expands the installment schedule under the row; otherwise it just emits.
  @Input() inline = false;
  @Input() selectedKey: string | null = null;
  @Output() details = new EventEmitter<string>();

  expandedKey: string | null = null;

  money = (n: number | null | undefined): string => (n == null ? '—' : formatInr(n));
  area = formatArea;

  trackKey = (_: number, r: BookingRow): string => r.key;

  toggle(r: BookingRow): void {
    this.expandedKey = this.expandedKey === r.key ? null : r.key;
    this.details.emit(r.key);
  }
}
