import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { InvoiceService, RepaymentRow } from '../invoice.service';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';

@Component({
  selector: 'app-invoice-payments',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslateModule, InlineBannerComponent],
  template: `
    <div class="invoice-payments">
      <div class="invoice-payments__intro">
        <div class="invoice-payments__intro-copy">
          <span class="invoice-payments__eyebrow">{{ 'admin.invoicePayments.eyebrow' | translate }}</span>
          <h1 class="invoice-payments__title">{{ 'admin.invoicePayments.title' | translate }}</h1>
          <p class="invoice-payments__subtitle">{{ 'admin.invoicePayments.subtitle' | translate }}</p>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" (dismissed)="loadError = false">{{ 'admin.invoicePayments.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="filterError" tone="danger">{{ 'admin.invoicePayments.filterError' | translate }}</app-inline-banner>

      <form class="card invoice-payments__filters" [formGroup]="filters" (ngSubmit)="apply()">
        <div class="invoice-payments__field">
          <label>{{ 'admin.invoicePayments.filterFrom' | translate }}</label>
          <input type="date" formControlName="from" />
        </div>
        <div class="invoice-payments__field">
          <label>{{ 'admin.invoicePayments.filterTo' | translate }}</label>
          <input type="date" formControlName="to" />
        </div>
        <div class="invoice-payments__field invoice-payments__field--wide">
          <label>{{ 'admin.invoicePayments.search' | translate }}</label>
          <input type="search" formControlName="q" [placeholder]="'admin.invoicePayments.searchPlaceholder' | translate" />
        </div>
        <div class="invoice-payments__submit">
          <button type="submit" class="brand-button">{{ 'admin.invoicePayments.apply' | translate }}</button>
        </div>
      </form>

      <div class="card">
        <table class="invoice-payments__table">
          <thead>
            <tr>
              <th *ngFor="let c of columns">{{ 'admin.invoicePayments.' + c | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows; let i = index">
              <td>{{ i + 1 }}</td>
              <td>{{ r.paymentDate }}</td>
              <td>{{ r.associateUserId }}</td>
              <td>{{ r.associateName }}</td>
              <td>{{ r.associatePhone }}</td>
              <td>{{ 'admin.invoicePayments.paymentTypeLoanRepayment' | translate }}</td>
              <td>{{ r.receiptNo }}</td>
              <td>{{ r.amount.toFixed(2) }}</td>
              <td>{{ 'admin.invoicePayments.payModes.' + r.payMode | translate }}</td>
              <td>{{ r.bankName }}</td>
              <td>{{ r.txnNo }}</td>
              <td>
                <a class="invoice-payments__print brand-button brand-button--secondary" [routerLink]="['/settings/payment-details/receipt', r.id]" target="_blank">{{ 'admin.invoicePayments.printAction' | translate }}</a>
              </td>
            </tr>
            <tr *ngIf="rows.length === 0">
              <td [attr.colspan]="columns.length" class="invoice-payments__empty">{{ 'admin.invoicePayments.emptyState' | translate }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class PaymentDetailsComponent implements OnInit {
  private service = inject(InvoiceService);
  private fb = inject(FormBuilder);

  readonly columns = ['columnSNo', 'paymentDate', 'associateId', 'associateName', 'mobileNo', 'paymentType', 'receiptNo', 'amount', 'payMode', 'bankName', 'txnNo', 'print'];
  rows: RepaymentRow[] = [];
  loadError = false;
  filterError = false;
  filters = this.fb.nonNullable.group({ from: [''], to: [''], q: [''] });

  ngOnInit(): void {
    this.load();
  }

  apply(): void {
    const { from, to } = this.filters.getRawValue();
    this.filterError = !!(from && to && from > to);
    if (!this.filterError) {
      this.load();
    }
  }

  private load(): void {
    this.loadError = false;
    this.service.repayments(this.filters.getRawValue()).subscribe({
      next: items => (this.rows = items),
      error: () => (this.loadError = true)
    });
  }
}
