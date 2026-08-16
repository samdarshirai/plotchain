import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PayoutApprovalService } from './payout-approval.service';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { AdminWithdrawalRequest } from '../models/withdrawal-request.model';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { BrandButtonComponent } from '../../shared/components/brand-button/brand-button.component';

@Component({
  selector: 'app-submit-withdrawal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, InlineBannerComponent, BrandButtonComponent],
  template: `
    <div class="submit-withdrawal">
      <div class="submit-withdrawal__intro">
        <h1 class="submit-withdrawal__title">{{ 'admin.submitWithdrawal.title' | translate }}</h1>
        <p class="submit-withdrawal__subtitle">{{ 'admin.submitWithdrawal.subtitle' | translate }}</p>
      </div>

      <app-inline-banner *ngIf="submitted" tone="success">
        <div class="submit-withdrawal__success-grid">
          <div class="submit-withdrawal__success-row">
            <span class="submit-withdrawal__success-label">{{ 'admin.submitWithdrawal.successIdLabel' | translate }}</span>
            <span class="submit-withdrawal__success-value">{{ submitted.id }}</span>
          </div>
          <div class="submit-withdrawal__success-row">
            <span class="submit-withdrawal__success-label">{{ 'admin.submitWithdrawal.successAssociateLabel' | translate }}</span>
            <span class="submit-withdrawal__success-value">{{ submitted.associateUserId }} — {{ submitted.associateName }}</span>
          </div>
          <div class="submit-withdrawal__success-row">
            <span class="submit-withdrawal__success-label">{{ 'admin.submitWithdrawal.successAmountLabel' | translate }}</span>
            <span class="submit-withdrawal__success-value">{{ submitted.amount }}</span>
          </div>
          <div class="submit-withdrawal__success-row">
            <span class="submit-withdrawal__success-label">{{ 'admin.submitWithdrawal.successStatusLabel' | translate }}</span>
            <span
              class="submit-withdrawal__status-chip"
              [class.submit-withdrawal__status-chip--requested]="submitted.status === 'REQUESTED'"
              [class.submit-withdrawal__status-chip--approved]="submitted.status === 'APPROVED'"
            >
              {{ (submitted.status === 'APPROVED' ? 'admin.submitWithdrawal.statusApprovedChip' : 'admin.submitWithdrawal.statusRequestedChip') | translate }}
            </span>
          </div>
        </div>
        <p class="submit-withdrawal__auto-approve-hint" *ngIf="submitted.status === 'APPROVED'">
          {{ 'admin.submitWithdrawal.autoApprovedHint' | translate }}
        </p>
        <app-brand-button type="button" variant="secondary" (clicked)="dismissBanner()">
          {{ 'admin.submitWithdrawal.submitAnotherButton' | translate }}
        </app-brand-button>
      </app-inline-banner>

      <app-inline-banner *ngIf="submitError" tone="danger">{{ submitError }}</app-inline-banner>

      <form class="card submit-withdrawal__form" [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="submit-withdrawal__row">
          <div class="submit-withdrawal__field">
            <label>{{ 'admin.submitWithdrawal.associateLabel' | translate }}</label>
            <select formControlName="associateId" (blur)="markTouched('associateId')">
              <option value="">{{ 'admin.submitWithdrawal.associatePlaceholder' | translate }}</option>
              <option *ngFor="let associate of associates" [value]="associate.id">
                {{ associate.userId }} — {{ associate.name }}
              </option>
            </select>
            <app-field-error [message]="fieldError('associateId')"></app-field-error>
          </div>

          <div class="submit-withdrawal__field">
            <label>{{ 'admin.submitWithdrawal.amountLabel' | translate }}</label>
            <input type="number" formControlName="amount" (blur)="markTouched('amount')" />
            <app-field-error [message]="fieldError('amount')"></app-field-error>
          </div>
        </div>

        <div class="submit-withdrawal__actions">
          <app-brand-button type="submit" variant="primary" [disabled]="form.invalid">
            {{ 'admin.submitWithdrawal.submitButton' | translate }}
          </app-brand-button>
        </div>
      </form>
    </div>
  `
})
export class SubmitWithdrawalComponent implements OnInit {
  private fb = inject(FormBuilder);
  private payoutApprovalService = inject(PayoutApprovalService);
  private adminService = inject(AdminService);
  private translate = inject(TranslateService);

  form = this.fb.nonNullable.group({
    associateId: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]]
  });

  submitted: AdminWithdrawalRequest | null = null;
  submitError: string | null = null;
  associates: AssociateSummary[] = [];
  private serverFieldErrors: Record<string, string> = {};

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(associates => (this.associates = associates));
  }

  markTouched(name: string): void {
    this.form.get(name)?.markAsTouched();
  }

  fieldError(name: string): string | undefined {
    if (this.serverFieldErrors[name]) {
      return this.serverFieldErrors[name];
    }
    const control = this.form.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('admin.submitWithdrawal.validation.required');
    }
    return undefined;
  }

  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { associateId, amount } = this.form.getRawValue();
    this.payoutApprovalService.submit({ associateId, amount: amount as number }).subscribe({
      next: request => {
        this.submitted = request;
        this.serverFieldErrors = {};
        this.submitError = null;
        this.form.reset();
      },
      error: (err: HttpErrorResponse) => {
        this.submitted = null;
        const fields = toFieldErrors(err);
        if (Object.keys(fields).length > 0) {
          this.serverFieldErrors = fields;
          return;
        }
        if (err.status === 409) {
          // Resolves this unit's "KYC-blocked" open question: show the backend's own message
          // (AssociateSuspendedException / KycNotVerifiedException / BelowMinimumWithdrawalException /
          // InsufficientWalletBalanceException all produce a specific, human-readable reason) rather
          // than a generic string or a separate synthesized "blocked list" screen.
          const body = err.error as { error?: string } | null;
          this.submitError = body?.error ?? this.translate.instant('admin.submitWithdrawal.validation.genericSubmitError');
        } else {
          this.submitError = this.translate.instant('admin.submitWithdrawal.validation.genericSubmitError');
        }
      }
    });
  }

  dismissBanner(): void {
    this.submitted = null;
  }
}
