import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { printTable } from '../../shared/utils/table-export.util';
import { PaymentRow } from './bookings-emi.model';
import { formatMoney } from './bookings-emi.util';

@Component({
  selector: 'app-payment-receipt',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./payment-receipt.component.scss'],
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="payment-receipt">
      <article #sheet class="payment-receipt__sheet">
        <h2 #title tabindex="-1" class="payment-receipt__title">{{ 'admin.bookingsEmi.receipt.title' | translate }}</h2>
        <dl class="payment-receipt__meta">
          <dt>{{ 'admin.bookingsEmi.receipt.no' | translate }}</dt><dd>{{ receiptNo }}</dd>
          <dt>{{ 'admin.bookingsEmi.receipt.date' | translate }}</dt><dd>{{ row.paymentDate | date: 'mediumDate' }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.associate' | translate }}</dt><dd>{{ associate }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.project' | translate }}</dt><dd>{{ row.projectName || '—' }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.plot' | translate }}</dt><dd>{{ row.plotNo || '—' }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.mode' | translate }}</dt><dd>{{ row.paymentMode ? ('admin.bookingsEmi.paymentMode.' + row.paymentMode | translate) : '—' }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.reference' | translate }}</dt><dd>{{ row.paymentRef || '—' }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.entryBy' | translate }}</dt><dd>{{ row.entryBy || '—' }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.confirmBy' | translate }}</dt><dd>{{ row.confirmBy || '—' }}</dd>
          <dt>{{ 'admin.bookingsEmi.col.confirmDate' | translate }}</dt><dd>{{ row.confirmedAt ? (row.confirmedAt | date: 'mediumDate') : '—' }}</dd>
        </dl>
        <div class="payment-receipt__amount">
          <span>{{ 'admin.bookingsEmi.receipt.received' | translate }}</span>
          <strong>{{ money(row.amount) }}</strong>
        </div>
      </article>
      <div class="payment-receipt__actions">
        <button type="button" class="brand-button payment-receipt__print" (click)="print()">{{ 'admin.bookingsEmi.receipt.print' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary payment-receipt__close" (click)="closed.emit()">{{ 'admin.bookingsEmi.action.close' | translate }}</button>
      </div>
    </div>
  `
})
export class PaymentReceiptComponent implements AfterViewInit {
  @Input({ required: true }) row!: PaymentRow;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('sheet', { static: true }) sheet!: ElementRef<HTMLElement>;
  @ViewChild('title', { static: true }) title!: ElementRef<HTMLElement>;
  money = formatMoney;

  get receiptNo(): string { return `${this.row.bookingId.slice(0, 8).toUpperCase()}-${this.row.installmentNumber}`; }
  get associate(): string { return [this.row.associateCode, this.row.associateName].filter(Boolean).join(' · ') || '—'; }

  ngAfterViewInit(): void { queueMicrotask(() => this.title.nativeElement.focus()); }
  print(): void { printTable(this.sheet.nativeElement); }
}
