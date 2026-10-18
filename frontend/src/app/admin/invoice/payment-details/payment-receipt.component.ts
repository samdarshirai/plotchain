import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { InvoiceService, RepaymentRow } from '../invoice.service';

@Component({
  selector: 'app-invoice-receipt',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <div class="invoice-receipt">
      <div *ngIf="notFound" class="invoice-receipt__not-found">
        <p>{{ 'admin.invoiceReceipt.notFound' | translate }}</p>
        <a routerLink="/settings/payment-details">{{ 'admin.invoiceReceipt.back' | translate }}</a>
      </div>

      <ng-container *ngIf="row as r">
        <div class="invoice-receipt__card">
          <h1 class="invoice-receipt__title">{{ 'admin.invoiceReceipt.title' | translate }}</h1>
          <dl class="invoice-receipt__fields">
            <dt>{{ 'admin.invoiceReceipt.receiptNo' | translate }}</dt><dd>{{ r.receiptNo }}</dd>
            <dt>{{ 'admin.invoiceReceipt.paymentDate' | translate }}</dt><dd>{{ r.paymentDate }}</dd>
            <dt>{{ 'admin.invoiceReceipt.associateId' | translate }}</dt><dd>{{ r.associateUserId }}</dd>
            <dt>{{ 'admin.invoiceReceipt.associateName' | translate }}</dt><dd>{{ r.associateName }}</dd>
            <dt>{{ 'admin.invoiceReceipt.mobileNo' | translate }}</dt><dd>{{ r.associatePhone }}</dd>
            <dt>{{ 'admin.invoiceReceipt.amount' | translate }}</dt><dd>{{ r.amount.toFixed(2) }}</dd>
            <dt>{{ 'admin.invoiceReceipt.payMode' | translate }}</dt><dd>{{ 'admin.invoicePayments.payModes.' + r.payMode | translate }}</dd>
            <dt>{{ 'admin.invoiceReceipt.bankName' | translate }}</dt><dd>{{ r.bankName }}</dd>
            <dt>{{ 'admin.invoiceReceipt.txnNo' | translate }}</dt><dd>{{ r.txnNo }}</dd>
          </dl>
        </div>
        <button type="button" class="invoice-receipt__print brand-button" (click)="print()">{{ 'admin.invoiceReceipt.printAction' | translate }}</button>
      </ng-container>
    </div>
  `
})
export class PaymentReceiptComponent implements OnInit {
  private service = inject(InvoiceService);
  private route = inject(ActivatedRoute);

  row: RepaymentRow | null = null;
  notFound = false;

  ngOnInit(): void {
    this.service.repayment(this.route.snapshot.paramMap.get('id') ?? '').subscribe({
      next: r => (this.row = r),
      error: () => (this.notFound = true)
    });
  }

  print(): void {
    window.print();
  }
}
