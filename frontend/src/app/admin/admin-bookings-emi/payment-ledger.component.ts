import { Component, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { map } from 'rxjs';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { PagerComponent } from '../../shared/components/pager/pager.component';
import { ExportColumn, exportCsv } from '../../shared/utils/table-export.util';
import { PaymentFilters, PaymentPage, PaymentRow } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { collectPages, formatMoney } from './bookings-emi.util';
import { PaymentReceiptComponent } from './payment-receipt.component';
import { ReportFiltersComponent, ReportFilterValue } from './report-filters.component';

const PAGE_SIZE = 20;
const col = (k: string) => `admin.bookingsEmi.col.${k}`;

@Component({
  selector: 'app-payment-ledger',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./payment-ledger.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, PagerComponent, ReportFiltersComponent, PaymentReceiptComponent],
  template: `
    <div class="payment-ledger" [attr.aria-busy]="loading || exporting">
      <app-report-filters [locked]="exporting" (filtersChange)="onFilters($event)"></app-report-filters>

      <div class="payment-ledger__bar">
        <button type="button" class="brand-button brand-button--secondary payment-ledger__export" [disabled]="exporting" (click)="exportCsv_()">{{ 'admin.bookingsEmi.action.exportCsv' | translate }}</button>
      </div>
      <app-inline-banner *ngIf="exportError" tone="danger" [dismissible]="true" (dismissed)="exportError = false">
        <span role="alert">{{ 'admin.bookingsEmi.err.export' | translate }}</span>
      </app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.loadList' | translate }}
        <button type="button" class="booking-register__retry" (click)="load(currentPage)">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <app-payment-receipt *ngIf="receipt" [row]="receipt" (closed)="closeReceipt()"></app-payment-receipt>

      <div class="booking-register__list">
        <div class="booking-register__skeleton" role="status" *ngIf="!page && !loadError">
          <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
          <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3,4]"></span>
        </div>
        <table class="booking-register__table payment-ledger__table" *ngIf="page" [attr.aria-label]="'admin.bookingsEmi.tab.confirmed' | translate">
          <thead><tr>
            <th scope="col" *ngFor="let k of heads">{{ col(k) | translate }}</th>
            <th scope="col"><span class="booking-register__sr">{{ 'admin.bookingsEmi.action.receipt' | translate }}</span></th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let r of page!.payments">
              <td [attr.data-label]="col('paymentDate') | translate">{{ r.paymentDate | date: 'mediumDate' }}</td>
              <td class="booking-register__num" [attr.data-label]="col('associateId') | translate">{{ r.associateCode || '—' }}</td>
              <td [attr.data-label]="col('associate') | translate">{{ r.associateName || '—' }}</td>
              <td [attr.data-label]="col('project') | translate">{{ r.projectName || '—' }}</td>
              <td class="booking-register__num" [attr.data-label]="col('plot') | translate">{{ r.plotNo || '—' }}</td>
              <td class="booking-register__num" [attr.data-label]="col('amount') | translate">{{ money(r.amount) }}</td>
              <td [attr.data-label]="col('mode') | translate">{{ r.paymentMode ? ('admin.bookingsEmi.paymentMode.' + r.paymentMode | translate) : '—' }}</td>
              <td [attr.data-label]="col('entryBy') | translate">{{ r.entryBy || '—' }}</td>
              <td [attr.data-label]="col('confirmBy') | translate">{{ r.confirmBy || '—' }}</td>
              <td [attr.data-label]="col('confirmDate') | translate">{{ r.confirmedAt ? (r.confirmedAt | date: 'mediumDate') : '—' }}</td>
              <td>
                <button type="button" class="booking-register__retry payment-ledger__receipt-btn" (click)="openReceipt(r, $event)">{{ 'admin.bookingsEmi.action.receipt' | translate }}</button>
              </td>
            </tr>
          </tbody>
          <tfoot><tr class="payment-ledger__total">
            <td colspan="5">{{ 'admin.bookingsEmi.totalRow' | translate }}</td>
            <td class="booking-register__num" [attr.data-label]="col('amount') | translate">{{ money(page!.pageTotal) }}</td>
            <td colspan="5"></td>
          </tr></tfoot>
        </table>
        <div class="booking-register__empty" *ngIf="page && !page.payments.length">
          <h2>{{ 'admin.bookingsEmi.empty.ledgerTitle' | translate }}</h2>
        </div>
        <app-pager [page]="page?.page ?? 0" [size]="PAGE_SIZE" [total]="page?.totalElements ?? 0" [disabled]="loading" (pageChange)="load($event)"></app-pager>
      </div>
    </div>
  `
})
export class PaymentLedgerComponent implements OnInit {
  private service = inject(BookingsEmiService);
  readonly PAGE_SIZE = PAGE_SIZE;
  readonly heads = ['paymentDate', 'associateId', 'associate', 'project', 'plot', 'amount', 'mode', 'entryBy', 'confirmBy', 'confirmDate'];
  money = formatMoney; col = col;
  page: PaymentPage | null = null;
  filters: PaymentFilters = {};
  loading = false; loadError = false; exporting = false; exportError = false;
  receipt: PaymentRow | null = null;
  private trigger: HTMLElement | null = null;
  currentPage = 0;
  private seq = 0;

  private readonly columns: ExportColumn<PaymentRow>[] = [
    { header: 'Payment date', value: r => r.paymentDate.slice(0, 10) },
    { header: 'Associate ID', value: r => r.associateCode },
    { header: 'Name', value: r => r.associateName },
    { header: 'Project', value: r => r.projectName },
    { header: 'Plot', value: r => r.plotNo },
    { header: 'Amount', value: r => r.amount },
    { header: 'Mode', value: r => r.paymentMode },
    { header: 'Reference', value: r => r.paymentRef },
    { header: 'Entry by', value: r => r.entryBy },
    { header: 'Confirm by', value: r => r.confirmBy },
    { header: 'Confirm date', value: r => r.confirmedAt?.slice(0, 10) }
  ];

  ngOnInit(): void { this.load(0); }
  onFilters(f: ReportFilterValue): void { this.filters = { from: f.from, to: f.to, projectId: f.projectId }; this.load(0); }

  openReceipt(r: PaymentRow, e: Event): void { this.receipt = r; this.trigger = e.currentTarget as HTMLElement; }
  closeReceipt(): void { this.receipt = null; this.trigger?.focus(); this.trigger = null; }

  // Latest-request-wins.
  load(p: number): void {
    const mine = ++this.seq;
    this.receipt = null; this.trigger = null;
    this.currentPage = p; this.loading = true; this.loadError = false;
    this.service.payments('PAID', this.filters, p, PAGE_SIZE).subscribe({
      next: res => { if (mine === this.seq) { this.loading = false; this.page = res; } },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  exportCsv_(): void {
    if (this.exporting) { return; }
    this.exporting = true; this.exportError = false;
    const f = this.filters;
    collectPages<PaymentRow>(p => this.service.payments('PAID', f, p, 100).pipe(map(r => ({ rows: r.payments, totalElements: r.totalElements }))))
      .subscribe({
        next: rows => { exportCsv(rows, this.columns, 'payments-confirmed.csv'); this.exporting = false; },
        error: () => { this.exporting = false; this.exportError = true; }
      });
  }
}
