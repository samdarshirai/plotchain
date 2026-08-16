import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PayoutHistoryService } from './payout-history.service';
import { AssociateWithdrawalPage, AssociateWithdrawalFilters } from './models/associate-withdrawal-page.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-payout-history',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, InlineBannerComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="payout-history">
      <div class="payout-history__intro">
        <h1 class="payout-history__title">{{ 'payoutHistory.title' | translate }}</h1>
        <p class="payout-history__subtitle">{{ 'payoutHistory.subtitle' | translate }}</p>
      </div>

      <div class="payout-history__wallet-balance card" [class.payout-history__wallet-balance--degraded]="walletLoadError">
        <span class="payout-history__balance-label">{{ 'payoutHistory.walletBalanceLabel' | translate }}</span>
        <span class="payout-history__balance-value">{{ formattedWalletBalance }}</span>
        <span class="payout-history__balance-hint" *ngIf="walletLoadError">
          {{ 'payoutHistory.walletLoadErrorHint' | translate }}
        </span>
      </div>

      <div class="payout-history__filters">
        <div class="payout-history__filter-field">
          <label>
            {{ 'payoutHistory.statusFilterLabel' | translate }}
            <select (change)="onStatusChange($any($event.target).value)">
              <option value="">{{ 'payoutHistory.statusFilterAllOption' | translate }}</option>
              <option value="REQUESTED">{{ 'payoutHistory.statusRequestedOption' | translate }}</option>
              <option value="APPROVED">{{ 'payoutHistory.statusApprovedOption' | translate }}</option>
              <option value="REJECTED">{{ 'payoutHistory.statusRejectedOption' | translate }}</option>
              <option value="DISBURSED">{{ 'payoutHistory.statusDisbursedOption' | translate }}</option>
            </select>
          </label>
        </div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="payout-history__load-error">
        {{ 'payoutHistory.loadError' | translate }}
      </app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="historyColumns"
          [rows]="historyRows"
          [emptyStateLabel]="'payoutHistory.emptyState' | translate"
        ></app-editable-table>
      </div>

      <div class="payout-history__pagination" *ngIf="page">
        <span class="payout-history__page-indicator">
          {{ 'payoutHistory.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'payoutHistory.previousPageAction' | translate }}
        </button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'payoutHistory.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class PayoutHistoryComponent implements OnInit {
  private payoutHistoryService = inject(PayoutHistoryService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  private datePipe = inject(DatePipe);

  page: AssociateWithdrawalPage | null = null;
  walletBalance: number | null = null;
  walletLoadError = false;
  loadError = false;
  historyColumns: EditableTableColumn[] = [];
  historyRows: Record<string, string>[] = [];
  private status = '';

  get formattedWalletBalance(): string {
    if (this.walletLoadError) {
      return this.translate.instant('payoutHistory.walletLoadError');
    }
    if (this.walletBalance === null) {
      return '';
    }
    return this.formatCurrency(this.walletBalance);
  }

  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.historyColumns = [
      { key: 'amount', label: this.translate.instant('payoutHistory.columnAmount'), type: 'text' },
      { key: 'status', label: this.translate.instant('payoutHistory.columnStatus'), type: 'text' },
      { key: 'reason', label: this.translate.instant('payoutHistory.columnReason'), type: 'text' },
      { key: 'bankReference', label: this.translate.instant('payoutHistory.columnBankReference'), type: 'text' },
      { key: 'requestedAt', label: this.translate.instant('payoutHistory.columnRequestedAt'), type: 'text' },
      { key: 'decidedAt', label: this.translate.instant('payoutHistory.columnDecidedAt'), type: 'text' },
      { key: 'disbursedAt', label: this.translate.instant('payoutHistory.columnDisbursedAt'), type: 'text' }
    ];
    this.loadWallet();
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  // A wallet-lookup failure only degrades the balance display to a placeholder -- it never sets
  // loadError, since it doesn't block the withdrawal-history table (same independent-failure
  // pattern IncomeStatementComponent's cycle lookup uses).
  private loadWallet(): void {
    this.walletLoadError = false;
    this.payoutHistoryService.getWallet().subscribe({
      next: res => (this.walletBalance = res.balance),
      error: () => (this.walletLoadError = true)
    });
  }

  private loadPage(page: number): void {
    this.loadError = false;
    const filters: AssociateWithdrawalFilters = {};
    if (this.status) {
      filters.status = this.status as AssociateWithdrawalFilters['status'];
    }
    this.payoutHistoryService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private formatCurrency(amount: number): string {
    return this.currencyPipe.transform(amount, 'INR', 'symbol', '1.0-2') ?? String(amount);
  }

  private formatOrDash(value: string | null): string {
    return value ?? this.translate.instant('payoutHistory.emptyValuePlaceholder');
  }

  private updateTableRows(): void {
    this.historyRows = (this.page?.requests ?? []).map(request => ({
      amount: this.formatCurrency(request.amount),
      status: request.status,
      reason: this.formatOrDash(request.reason),
      bankReference: this.formatOrDash(request.bankReference),
      requestedAt: this.datePipe.transform(request.requestedAt, 'medium') ?? request.requestedAt,
      decidedAt: request.decidedAt ? this.datePipe.transform(request.decidedAt, 'medium') ?? request.decidedAt : this.formatOrDash(null),
      disbursedAt: request.disbursedAt ? this.datePipe.transform(request.disbursedAt, 'medium') ?? request.disbursedAt : this.formatOrDash(null)
    }));
  }
}
