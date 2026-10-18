import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, of, switchMap } from 'rxjs';
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

      <div class="card invoice-payments__table-card">
        <table class="editable-table invoice-payments__table">
          <thead>
            <tr>
              <th *ngFor="let c of columns">{{ 'admin.invoicePayments.' + c | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows; let i = index">
              <td [attr.data-label]="'admin.invoicePayments.columnSNo' | translate">{{ i + 1 }}</td>
              <td [attr.data-label]="'admin.invoicePayments.paymentDate' | translate">{{ r.paymentDate }}</td>
              <td [attr.data-label]="'admin.invoicePayments.associateId' | translate">{{ r.associateUserId }}</td>
              <td class="editable-table__cell--ellipsis" [attr.title]="r.associateName" [attr.data-label]="'admin.invoicePayments.associateName' | translate">{{ r.associateName }}</td>
              <td [attr.data-label]="'admin.invoicePayments.mobileNo' | translate">{{ r.associatePhone }}</td>
              <td class="editable-table__cell--ellipsis" [attr.title]="'admin.invoicePayments.paymentTypeLoanRepayment' | translate" [attr.data-label]="'admin.invoicePayments.paymentType' | translate">{{ 'admin.invoicePayments.paymentTypeLoanRepayment' | translate }}</td>
              <td [attr.data-label]="'admin.invoicePayments.receiptNo' | translate">{{ r.receiptNo }}</td>
              <td [attr.data-label]="'admin.invoicePayments.amount' | translate">{{ r.amount.toFixed(2) }}</td>
              <td class="editable-table__cell--ellipsis" [attr.title]="'admin.invoicePayments.payModes.' + r.payMode | translate" [attr.data-label]="'admin.invoicePayments.payMode' | translate">{{ 'admin.invoicePayments.payModes.' + r.payMode | translate }}</td>
              <td class="editable-table__cell--ellipsis" [attr.title]="r.bankName" [attr.data-label]="'admin.invoicePayments.bankName' | translate">{{ r.bankName }}</td>
              <td class="editable-table__cell--ellipsis" [attr.title]="r.txnNo" [attr.data-label]="'admin.invoicePayments.txnNo' | translate">{{ r.txnNo }}</td>
              <td [attr.data-label]="'admin.invoicePayments.print' | translate">
                <a class="invoice-payments__print brand-button brand-button--secondary" [routerLink]="['/settings/payment-details/receipt', r.id]" target="_blank">{{ 'admin.invoicePayments.printAction' | translate }}</a>
              </td>
            </tr>
            <tr *ngIf="rows.length === 0">
              <td [attr.colspan]="columns.length" class="editable-table__empty">{{ 'admin.invoicePayments.emptyState' | translate }}</td>
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
  private destroyRef = inject(DestroyRef);
  private reload$ = new Subject<void>();

  readonly columns = ['columnSNo', 'paymentDate', 'associateId', 'associateName', 'mobileNo', 'paymentType', 'receiptNo', 'amount', 'payMode', 'bankName', 'txnNo', 'print'];
  rows: RepaymentRow[] = [];
  loadError = false;
  filterError = false;
  filters = this.fb.nonNullable.group({ from: [''], to: [''], q: [''] });

  ngOnInit(): void {
    // switchMap drops the in-flight request when a newer one starts, so a stale response can't overwrite the list.
    this.reload$.pipe(
      switchMap(() => this.service.repayments(this.filters.getRawValue()).pipe(catchError(() => { this.loadError = true; return of(null); }))),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(items => { if (items) { this.rows = items; } });
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
    this.reload$.next();
  }
}
