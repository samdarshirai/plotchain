import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RouterLink } from '@angular/router';
import { PayoutApprovalService } from './payout-approval.service';
import { AdminWithdrawalPage, AdminWithdrawalFilters } from '../models/admin-withdrawal-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { AdminDashboardService } from '../../admin-dashboard/admin-dashboard.service';

const PAGE_SIZE = 20;

// Convert SHOUTED_CASE or SNAKE_CASE to Title Case:
// REQUESTED → Requested, APPROVED → Approved, REJECTED → Rejected, DISBURSED → Disbursed.
function titleCase(value: string): string {
  if (value.length === 0) return value;
  return value
    .split('_')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

@Component({
  selector: 'app-payout-approval',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, RouterLink, EditableTableComponent, InlineBannerComponent, StatTileComponent],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="payout-approval">
      <div class="payout-approval__intro">
        <div class="payout-approval__intro-copy">
          <span class="payout-approval__eyebrow">{{ 'admin.payoutApproval.eyebrow' | translate }}</span>
          <h1 class="payout-approval__title">{{ 'admin.payoutApproval.title' | translate }}</h1>
          <p class="payout-approval__subtitle">{{ 'admin.payoutApproval.subtitle' | translate }}</p>
        </div>
        <a class="payout-approval__submit-link brand-button" [routerLink]="['/admin/withdrawals/new']">
          {{ 'admin.payoutApproval.submitLink' | translate }}
        </a>
      </div>

      <div class="payout-approval__stats" *ngIf="pendingWithdrawals !== null">
        <app-stat-tile
          icon="account_balance_wallet"
          tone="accent"
          [label]="'admin.payoutApproval.pendingWithdrawalsLabel' | translate"
          [value]="pendingWithdrawals.toString()"
        ></app-stat-tile>
      </div>

      <div class="payout-approval__filters">
        <label class="payout-approval__filter-field">
          {{ 'admin.payoutApproval.associateFilterLabel' | translate }}
          <select (change)="onAssociateIdChange($any($event.target).value)">
            <option value="">{{ 'admin.payoutApproval.associateFilterAllOption' | translate }}</option>
            <option *ngFor="let associate of associates" [value]="associate.id">
              {{ associate.userId }} — {{ associate.name }}
            </option>
          </select>
        </label>
        <label class="payout-approval__filter-field">
          {{ 'admin.payoutApproval.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.payoutApproval.statusFilterAllOption' | translate }}</option>
            <option value="REQUESTED">{{ 'admin.payoutApproval.statusRequestedOption' | translate }}</option>
            <option value="APPROVED">{{ 'admin.payoutApproval.statusApprovedOption' | translate }}</option>
            <option value="REJECTED">{{ 'admin.payoutApproval.statusRejectedOption' | translate }}</option>
            <option value="DISBURSED">{{ 'admin.payoutApproval.statusDisbursedOption' | translate }}</option>
          </select>
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" [dismissible]="true" class="payout-approval__load-error" (dismissed)="loadError = false">{{ 'admin.payoutApproval.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="actionError" tone="danger" [dismissible]="true" class="payout-approval__action-error" (dismissed)="actionError = false">{{ 'admin.payoutApproval.actionError' | translate }}</app-inline-banner>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="registerColumns"
          [rows]="registerRows"
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.payoutApproval.emptyState' | translate"
        ></app-editable-table>
      </div>
      <ng-template #actionsTpl let-i="index">
        <ng-container [ngSwitch]="page!.requests[i].status">
          <div class="payout-approval__action-stack" *ngSwitchCase="'REQUESTED'">
            <div class="payout-approval__action-group">
              <button type="button" class="payout-approval__approve-action brand-button" (click)="approve(page!.requests[i].id)">
                {{ 'admin.payoutApproval.approveAction' | translate }}
              </button>
            </div>
            <div class="payout-approval__action-group">
              <input
                type="text"
                class="payout-approval__reason-input"
                [(ngModel)]="decisionReasons[page!.requests[i].id]"
                [placeholder]="'admin.payoutApproval.rejectReasonPlaceholder' | translate"
              />
              <button type="button" class="payout-approval__reject-action brand-button brand-button--danger" (click)="reject(page!.requests[i].id)">
                {{ 'admin.payoutApproval.rejectAction' | translate }}
              </button>
            </div>
          </div>
          <div class="payout-approval__action-stack" *ngSwitchCase="'APPROVED'">
            <div class="payout-approval__action-group">
              <input
                type="text"
                class="payout-approval__bank-reference-input"
                [(ngModel)]="bankReferences[page!.requests[i].id]"
                [placeholder]="'admin.payoutApproval.bankReferencePlaceholder' | translate"
              />
              <button type="button" class="payout-approval__disburse-action brand-button" (click)="disburse(page!.requests[i].id)">
                {{ 'admin.payoutApproval.disburseAction' | translate }}
              </button>
            </div>
            <div class="payout-approval__action-group">
              <input
                type="text"
                class="payout-approval__reason-input"
                [(ngModel)]="decisionReasons[page!.requests[i].id]"
                [placeholder]="'admin.payoutApproval.cancelReasonPlaceholder' | translate"
              />
              <button type="button" class="payout-approval__cancel-action brand-button brand-button--danger" (click)="reject(page!.requests[i].id)">
                {{ 'admin.payoutApproval.cancelAction' | translate }}
              </button>
            </div>
          </div>
          <span *ngSwitchCase="'REJECTED'" class="payout-approval__status-tag payout-approval__status-tag--rejected">{{ 'admin.payoutApproval.rejectedTag' | translate }}</span>
          <span *ngSwitchCase="'DISBURSED'" class="payout-approval__status-tag payout-approval__status-tag--disbursed">{{ 'admin.payoutApproval.disbursedTag' | translate }}</span>
        </ng-container>
      </ng-template>

      <div class="payout-approval__pagination" *ngIf="page">
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.payoutApproval.previousPageAction' | translate }}
        </button>
        <span class="payout-approval__page-indicator">
          {{ 'admin.payoutApproval.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
        </span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.payoutApproval.nextPageAction' | translate }}
        </button>
      </div>
    </div>
  `
})
export class PayoutApprovalComponent implements OnInit {
  private payoutApprovalService = inject(PayoutApprovalService);
  private adminService = inject(AdminService);
  private adminDashboardService = inject(AdminDashboardService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  protected datePipe = inject(DatePipe);

  page: AdminWithdrawalPage | null = null;
  loadError = false;
  actionError = false;
  associates: AssociateSummary[] = [];
  // Relocated from admin-dashboard.component.ts (Task 3) -- this screen previously had no stat
  // display at all.
  pendingWithdrawals: number | null = null;
  registerColumns: EditableTableColumn[] = [];
  registerRows: Record<string, string>[] = [];
  decisionReasons: Record<string, string> = {};
  bankReferences: Record<string, string> = {};
  private associateId = '';
  private status = '';

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
    this.registerColumns = [
      { key: 'associate', label: this.translate.instant('admin.payoutApproval.columnAssociate'), type: 'text' },
      { key: 'amount', label: this.translate.instant('admin.payoutApproval.columnAmount'), type: 'text' },
      {
        key: 'status',
        label: this.translate.instant('admin.payoutApproval.columnStatus'),
        type: 'badge',
        badgeTone: value => this.statusBadgeTone(value)
      },
      { key: 'reason', label: this.translate.instant('admin.payoutApproval.columnReason'), type: 'text' },
      { key: 'bankReference', label: this.translate.instant('admin.payoutApproval.columnBankReference'), type: 'text' },
      { key: 'requestedAt', label: this.translate.instant('admin.payoutApproval.columnRequestedAt'), type: 'text' },
      { key: 'actions', label: this.translate.instant('admin.payoutApproval.columnActions'), type: 'action' }
    ];
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
    this.loadPage(0);
    this.adminDashboardService.getStats().subscribe(res => (this.pendingWithdrawals = res.pendingWithdrawals));
  }

  onAssociateIdChange(value: string): void {
    this.associateId = value;
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  approve(id: string): void {
    this.actionError = false;
    this.payoutApprovalService.decide(id, 'APPROVED').subscribe({
      next: () => this.loadPage(this.page?.page ?? 0),
      error: () => (this.actionError = true)
    });
  }

  reject(id: string): void {
    this.actionError = false;
    this.payoutApprovalService.decide(id, 'REJECTED', this.decisionReasons[id]).subscribe({
      next: () => {
        delete this.decisionReasons[id];
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.actionError = true)
    });
  }

  disburse(id: string): void {
    this.actionError = false;
    this.payoutApprovalService.disburse(id, this.bankReferences[id] ?? '').subscribe({
      next: () => {
        delete this.bankReferences[id];
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.actionError = true)
    });
  }

  protected loadPage(page: number): void {
    this.loadError = false;
    const filters: AdminWithdrawalFilters = {};
    if (this.associateId) filters.associateId = this.associateId;
    if (this.status) filters.status = this.status as AdminWithdrawalFilters['status'];
    this.payoutApprovalService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableRows();
      },
      error: () => (this.loadError = true)
    });
  }

  private updateTableRows(): void {
    this.registerRows = (this.page?.requests ?? []).map(request => ({
      associate: `${request.associateUserId} — ${request.associateName}`,
      amount: this.currencyPipe.transform(request.amount, 'INR', 'symbol', '1.0-2') ?? String(request.amount),
      status: titleCase(request.status),
      reason: request.reason ?? this.translate.instant('admin.payoutApproval.noReason'),
      bankReference: request.bankReference ?? this.translate.instant('admin.payoutApproval.noBankReference'),
      requestedAt: this.datePipe.transform(request.requestedAt, 'medium') ?? request.requestedAt
    }));
  }

  statusBadgeTone(value: string | number): BadgeTone {
    switch (value) {
      case 'Requested':
        return 'warning';
      case 'Approved':
      case 'Disbursed':
        return 'success';
      case 'Rejected':
        return 'danger';
      default:
        return 'default';
    }
  }
}
