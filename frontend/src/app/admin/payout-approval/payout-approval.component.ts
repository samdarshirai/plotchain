import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PayoutApprovalService } from './payout-approval.service';
import { AdminWithdrawalPage, AdminWithdrawalFilters } from '../models/admin-withdrawal-page.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { EligibleWithdrawalAssociate } from '../models/eligible-withdrawal-associate.model';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { AdminDashboardService } from '../../admin-dashboard/admin-dashboard.service';
import { titleCase } from '../../shared/utils/title-case';

const PAGE_SIZE = 20;

// The shared titleCase() converts SHOUTED_CASE / SNAKE_CASE to Title Case:
// REQUESTED → Requested, APPROVED → Approved, REJECTED → Rejected, DISBURSED → Disbursed.

@Component({
  selector: 'app-payout-approval',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, TranslateModule,
    EditableTableComponent, InlineBannerComponent, StatTileComponent, FieldErrorComponent
  ],
  providers: [DatePipe, CurrencyPipe],
  template: `
    <div class="payout-approval">
      <div class="payout-approval__intro">
        <div class="payout-approval__intro-copy">
          <span class="payout-approval__eyebrow">{{ 'admin.payoutApproval.eyebrow' | translate }}</span>
          <h1 class="payout-approval__title">{{ 'admin.payoutApproval.title' | translate }}</h1>
          <p class="payout-approval__subtitle">{{ 'admin.payoutApproval.subtitle' | translate }}</p>
        </div>
        <button type="button" class="payout-approval__submit-link brand-button" (click)="openSubmitModal()">
          {{ 'admin.payoutApproval.submitLink' | translate }}
        </button>
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

    <div class="payout-approval__modal-overlay" *ngIf="modalOpen">
      <div class="payout-approval__modal">
        <div class="payout-approval__modal-title">{{ 'admin.submitWithdrawal.title' | translate }}</div>
        <p class="payout-approval__modal-subtitle">{{ 'admin.submitWithdrawal.subtitle' | translate }}</p>

        <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

        <form [formGroup]="submitForm" (ngSubmit)="onSubmitWithdrawal()">
          <div class="payout-approval__modal-fields">
            <div class="payout-approval__modal-field">
              <label>{{ 'admin.submitWithdrawal.associateLabel' | translate }}</label>
              <select formControlName="associateId" (change)="onAssociateSelected($any($event.target).value)" (blur)="markSubmitTouched('associateId')">
                <option value="">{{ 'admin.submitWithdrawal.associatePlaceholder' | translate }}</option>
                <option *ngFor="let associate of eligibleAssociates" [value]="associate.associateId">
                  {{ associate.associateUserId }} — {{ associate.associateName }}
                </option>
              </select>
              <app-field-error [message]="submitFieldError('associateId')"></app-field-error>
            </div>

            <div class="payout-approval__modal-field">
              <label>{{ 'admin.submitWithdrawal.amountLabel' | translate }}</label>
              <input type="number" formControlName="amount" (blur)="markSubmitTouched('amount')" />
              <p class="payout-approval__modal-max-amount" *ngIf="selectedMaxAmount !== null">
                {{ 'admin.submitWithdrawal.maxAmountLabel' | translate }}: {{ selectedMaxAmount | currency: 'INR' : 'symbol' : '1.0-2' }}
              </p>
              <app-field-error [message]="submitFieldError('amount')"></app-field-error>
            </div>
          </div>

          <div class="payout-approval__modal-footer">
            <button type="button" class="payout-approval__modal-cancel" (click)="closeSubmitModal()">
              {{ 'admin.submitWithdrawal.cancelAction' | translate }}
            </button>
            <button type="submit" class="payout-approval__modal-submit" [disabled]="submitForm.invalid">
              {{ 'admin.submitWithdrawal.submitButton' | translate }}
            </button>
          </div>
        </form>
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
  private fb = inject(FormBuilder);
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

  // Submit Withdrawal modal (replaces the old /admin/withdrawals/new route): opens in-page,
  // its associate picker is withdraw-eligible associates only (not the unfiltered `associates`
  // filter-dropdown list above), each with a max amount enforced client-side.
  modalOpen = false;
  eligibleAssociates: EligibleWithdrawalAssociate[] = [];
  selectedMaxAmount: number | null = null;
  submitError: string | null = null;
  private serverFieldErrors: Record<string, string> = {};
  submitForm = this.fb.nonNullable.group({
    associateId: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01), this.maxAmountValidator()]]
  });

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

  openSubmitModal(): void {
    this.submitForm.reset({ associateId: '', amount: null });
    this.serverFieldErrors = {};
    this.submitError = null;
    this.selectedMaxAmount = null;
    this.modalOpen = true;
    // Fetched fresh on every open so a stale eligibility/balance snapshot from page-load (or an
    // earlier modal session) is never shown.
    this.payoutApprovalService.listEligibleAssociates().subscribe(list => (this.eligibleAssociates = list));
  }

  closeSubmitModal(): void {
    this.modalOpen = false;
  }

  onAssociateSelected(associateId: string): void {
    const associate = this.eligibleAssociates.find(a => a.associateId === associateId);
    this.selectedMaxAmount = associate?.maxAmount ?? null;
    this.submitForm.get('amount')?.updateValueAndValidity();
  }

  markSubmitTouched(name: string): void {
    this.submitForm.get(name)?.markAsTouched();
  }

  submitFieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.submitForm.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('admin.submitWithdrawal.validation.required');
    }
    if (control.errors['exceedsMax']) {
      return this.translate.instant('admin.submitWithdrawal.validation.exceedsMax');
    }
    return undefined;
  }

  onSubmitWithdrawal(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    if (this.submitForm.invalid) {
      this.submitForm.markAllAsTouched();
      return;
    }
    const { associateId, amount } = this.submitForm.getRawValue();
    this.payoutApprovalService.submit({ associateId, amount: amount as number }).subscribe({
      next: () => {
        this.modalOpen = false;
        this.loadPage(this.page?.page ?? 0);
        this.adminDashboardService.getStats().subscribe(res => (this.pendingWithdrawals = res.pendingWithdrawals));
      },
      error: (err: HttpErrorResponse) => {
        const fields = toFieldErrors(err);
        if (Object.keys(fields).length > 0) {
          this.serverFieldErrors = fields;
          return;
        }
        if (err.status === 409) {
          // Same 409-passthrough as the old submit-withdrawal.component.ts: AssociateSuspendedException /
          // KycNotVerifiedException / BelowMinimumWithdrawalException / InsufficientWalletBalanceException
          // all produce a specific, human-readable reason worth showing verbatim.
          const body = err.error as { error?: string } | null;
          this.submitError = body?.error ?? this.translate.instant('admin.submitWithdrawal.validation.genericSubmitError');
        } else {
          this.submitError = this.translate.instant('admin.submitWithdrawal.validation.genericSubmitError');
        }
      }
    });
  }

  private maxAmountValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      if (this.selectedMaxAmount === null || control.value === null) {
        return null;
      }
      return control.value > this.selectedMaxAmount ? { exceedsMax: true } : null;
    };
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
