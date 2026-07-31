import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription, merge } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { ToggleGroupComponent, ToggleOption } from '../../../shared/components/toggle-group/toggle-group.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { PaymentsKycService } from './payments-kyc.service';
import { SetupService } from '../../setup.service';
import {
  KycConfigRequest,
  PaymentConfigRequest,
  PayoutBankAccountRequest,
  WithdrawalConfigRequest
} from '../../models/payments-kyc.model';

const IFSC_CODE_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// The spec never enumerates gateway options -- these are a sensible Indian-market default set;
// the backend accepts any non-blank gateway string (see PaymentConfigRequest).
const GATEWAY_OPTIONS = ['RAZORPAY', 'PAYU', 'CASHFREE'];
const MODE_OPTIONS = ['CARDS', 'UPI', 'NETBANKING', 'WALLET'];
// The spec's own three literal examples ("Aadhaar, PAN, bank passbook, etc.") -- the "etc." is
// not invented further here.
const DOCUMENT_OPTIONS = ['AADHAAR', 'PAN', 'BANK_PASSBOOK'];

const RENDERED_PAYMENT_FIELD_ERROR_KEYS = ['gateway'];
const RENDERED_PAYOUT_FIELD_ERROR_KEYS = ['bankName', 'accountHolder', 'accountNumber', 'ifscCode', 'accountType'];

@Component({
  selector: 'app-payments-kyc-step',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FieldErrorComponent,
    InlineBannerComponent,
    ToggleGroupComponent,
    SetupStepNavComponent
  ],
  template: `
    <div class="payments-kyc-step">
      <form class="card" [formGroup]="paymentForm">
        <h1 class="card-title">{{ 'setup.paymentsKyc.paymentCollectionTitle' | translate }}</h1>

        <label>
          {{ 'setup.paymentsKyc.gatewayLabel' | translate }}
          <select formControlName="gateway" (blur)="markPaymentTouched('gateway')">
            <option value="" disabled>{{ 'setup.paymentsKyc.gatewayPlaceholder' | translate }}</option>
            <option *ngFor="let gateway of gatewayOptions" [value]="gateway">{{ gateway }}</option>
          </select>
        </label>
        <app-field-error [message]="paymentFieldError('gateway')"></app-field-error>

        <div class="payments-kyc-step__checkbox-group">
          <span>{{ 'setup.paymentsKyc.modesEnabledLabel' | translate }}</span>
          <label *ngFor="let paymentMode of modeOptions">
            <input
              type="checkbox"
              [checked]="isModeEnabled(paymentMode)"
              (change)="toggleMode(paymentMode, $any($event.target).checked)"
            />
            {{ paymentMode }}
          </label>
        </div>

        <div class="payments-kyc-step__credentials">
          <span>{{ 'setup.paymentsKyc.credentialsLabel' | translate }}</span>
          <span *ngIf="!showCredentialsInput">
            {{ (credentialsConfigured ? 'setup.paymentsKyc.credentialsConfigured' : 'setup.paymentsKyc.credentialsNotConfigured') | translate }}
            <button type="button" (click)="revealCredentialsInput()">{{ 'setup.paymentsKyc.changeCredentialsLabel' | translate }}</button>
          </span>
          <span *ngIf="showCredentialsInput">
            <input type="password" [value]="credentialsInputValue" (input)="credentialsInputValue = $any($event.target).value" />
            <button type="button" (click)="saveCredentials()">{{ 'setup.paymentsKyc.saveCredentialsLabel' | translate }}</button>
          </span>
          <app-field-error [message]="credentialsSubmitError ?? undefined"></app-field-error>
          <div class="payments-kyc-step__saved" *ngIf="credentialsSavedJustNow">
            {{ 'setup.paymentsKyc.savedIndicator' | translate }}
          </div>
        </div>

        <app-inline-banner *ngIf="paymentSubmitError" tone="danger">{{ paymentSubmitError }}</app-inline-banner>
        <div class="payments-kyc-step__saved" *ngIf="paymentSavedJustNow">
          {{ 'setup.paymentsKyc.savedIndicator' | translate }}
        </div>
      </form>

      <form class="card" [formGroup]="payoutForm">
        <h1 class="card-title">{{ 'setup.paymentsKyc.payoutAccountTitle' | translate }}</h1>

        <label>
          {{ 'setup.paymentsKyc.bankNameLabel' | translate }}
          <input type="text" formControlName="bankName" (blur)="markPayoutTouched('bankName')" />
        </label>
        <app-field-error [message]="payoutFieldError('bankName')"></app-field-error>

        <label>
          {{ 'setup.paymentsKyc.accountHolderLabel' | translate }}
          <input type="text" formControlName="accountHolder" (blur)="markPayoutTouched('accountHolder')" />
        </label>
        <app-field-error [message]="payoutFieldError('accountHolder')"></app-field-error>

        <label>
          {{ 'setup.paymentsKyc.accountNumberLabel' | translate }}
          <input type="text" formControlName="accountNumber" (blur)="markPayoutTouched('accountNumber')" />
        </label>
        <app-field-error [message]="payoutFieldError('accountNumber')"></app-field-error>

        <label>
          {{ 'setup.paymentsKyc.ifscCodeLabel' | translate }}
          <input type="text" formControlName="ifscCode" (blur)="markPayoutTouched('ifscCode')" />
        </label>
        <app-field-error [message]="payoutFieldError('ifscCode')"></app-field-error>

        <label>
          {{ 'setup.paymentsKyc.accountTypeLabel' | translate }}
          <app-toggle-group
            [options]="accountTypeOptions"
            [value]="payoutForm.value.accountType || null"
            (valueChange)="setAccountType($event)"
          ></app-toggle-group>
        </label>

        <div class="payments-kyc-step__saved" *ngIf="payoutSavedJustNow">
          {{ 'setup.paymentsKyc.savedIndicator' | translate }}
        </div>
      </form>

      <div class="card">
        <h1 class="card-title">{{ 'setup.paymentsKyc.kycRequirementsTitle' | translate }}</h1>

        <label>
          {{ 'setup.paymentsKyc.kycStrictnessLabel' | translate }}
          <app-toggle-group
            [options]="strictnessOptions"
            [value]="strictness"
            (valueChange)="setStrictness($event)"
          ></app-toggle-group>
        </label>

        <div class="payments-kyc-step__checkbox-group">
          <span>{{ 'setup.paymentsKyc.requiredDocumentsLabel' | translate }}</span>
          <label *ngFor="let doc of documentOptions">
            <input
              type="checkbox"
              [checked]="isDocumentRequired(doc)"
              (change)="toggleDocument(doc, $any($event.target).checked)"
            />
            {{ doc }}
          </label>
        </div>

        <div class="payments-kyc-step__saved" *ngIf="kycSavedJustNow">
          {{ 'setup.paymentsKyc.savedIndicator' | translate }}
        </div>
      </div>

      <div class="card">
        <h1 class="card-title">{{ 'setup.paymentsKyc.withdrawalApprovalTitle' | translate }}</h1>

        <label>
          {{ 'setup.paymentsKyc.approvalModeLabel' | translate }}
          <app-toggle-group
            [options]="approvalModeOptions"
            [value]="approvalMode"
            (valueChange)="setApprovalMode($event)"
          ></app-toggle-group>
        </label>

        <label *ngIf="approvalMode === 'AUTO_UNDER_LIMIT'">
          {{ 'setup.paymentsKyc.autoApproveLimitLabel' | translate }}
          <input type="number" [value]="autoApproveLimit" (input)="setAutoApproveLimit($event)" />
        </label>

        <ol class="payments-kyc-step__flow-preview">
          <li>{{ 'setup.paymentsKyc.flowRequestRaised' | translate }}</li>
          <li>{{ 'setup.paymentsKyc.flowAdminReview' | translate }}</li>
          <li>{{ 'setup.paymentsKyc.flowApproved' | translate }}</li>
          <li>{{ 'setup.paymentsKyc.flowPayoutInitiated' | translate }}</li>
        </ol>

        <app-inline-banner *ngIf="withdrawalSubmitError" tone="danger">{{ withdrawalSubmitError }}</app-inline-banner>
        <div class="payments-kyc-step__saved" *ngIf="withdrawalSavedJustNow">
          {{ 'setup.paymentsKyc.savedIndicator' | translate }}
        </div>
      </div>

      <app-setup-step-nav [previousPath]="previousPath" [nextPath]="nextPath" [savedJustNow]="anySavedJustNow" [mode]="mode"></app-setup-step-nav>
    </div>
  `
})
export class PaymentsKycStepComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private paymentsKycService = inject(PaymentsKycService);
  private setupService = inject(SetupService);
  private translate = inject(TranslateService);
  private destroyed$ = new Subject<void>();

  @Input() mode: 'setup' | 'settings' = 'setup';

  readonly gatewayOptions = GATEWAY_OPTIONS;
  readonly modeOptions = MODE_OPTIONS;
  readonly documentOptions = DOCUMENT_OPTIONS;

  // --- Payment Collection ---
  paymentForm = this.fb.nonNullable.group({
    gateway: ['', Validators.required]
  });
  modesEnabled: string[] = [];
  credentialsConfigured = false;
  showCredentialsInput = false;
  credentialsInputValue = '';
  credentialsSubmitError: string | null = null;
  credentialsSavedJustNow = false;
  paymentSavedJustNow = false;
  paymentSubmitError: string | null = null;
  private paymentLoadFailed = false;
  private paymentServerFieldErrors: Record<string, string> = {};
  private modesChanged$ = new Subject<void>();
  private paymentSub?: Subscription;

  // --- Payout Account ---
  payoutForm = this.fb.nonNullable.group({
    bankName: ['', Validators.required],
    accountHolder: ['', Validators.required],
    accountNumber: ['', Validators.required],
    ifscCode: ['', [Validators.required, Validators.pattern(IFSC_CODE_PATTERN)]],
    accountType: this.fb.nonNullable.control<'CURRENT' | 'SAVINGS'>('CURRENT', Validators.required)
  });
  payoutSavedJustNow = false;
  private payoutLoadFailed = false;
  private payoutServerFieldErrors: Record<string, string> = {};
  private payoutSub?: Subscription;

  // --- KYC Requirements ---
  strictness: 'STRICT' | 'RELAXED' = 'STRICT';
  requiredDocuments: string[] = [];
  kycSavedJustNow = false;
  private kycLoadFailed = false;
  private kycChanged$ = new Subject<void>();
  private kycSub?: Subscription;

  // --- Withdrawal Approval ---
  approvalMode: 'AUTO_UNDER_LIMIT' | 'ALWAYS_MANUAL' = 'ALWAYS_MANUAL';
  autoApproveLimit: number | null = null;
  withdrawalSavedJustNow = false;
  withdrawalSubmitError: string | null = null;
  private withdrawalLoadFailed = false;
  private withdrawalChanged$ = new Subject<void>();

  readonly previousPath = this.setupService.previousStepPath('paymentsKyc');
  readonly nextPath = this.setupService.nextStepPath('paymentsKyc');

  get anySavedJustNow(): boolean {
    return this.paymentSavedJustNow || this.payoutSavedJustNow || this.kycSavedJustNow || this.withdrawalSavedJustNow;
  }
  private withdrawalSub?: Subscription;

  get strictnessOptions(): ToggleOption[] {
    return [
      { value: 'STRICT', label: this.translate.instant('setup.paymentsKyc.strictLabel') },
      { value: 'RELAXED', label: this.translate.instant('setup.paymentsKyc.relaxedLabel') }
    ];
  }

  get accountTypeOptions(): ToggleOption[] {
    return [
      { value: 'CURRENT', label: this.translate.instant('setup.paymentsKyc.currentAccountLabel') },
      { value: 'SAVINGS', label: this.translate.instant('setup.paymentsKyc.savingsAccountLabel') }
    ];
  }

  get approvalModeOptions(): ToggleOption[] {
    return [
      { value: 'AUTO_UNDER_LIMIT', label: this.translate.instant('setup.paymentsKyc.autoApproveLabel') },
      { value: 'ALWAYS_MANUAL', label: this.translate.instant('setup.paymentsKyc.alwaysManualLabel') }
    ];
  }

  ngOnInit(): void {
    this.paymentSub = this.paymentsKycService.getPaymentConfig().subscribe({
      next: res => {
        this.paymentForm.patchValue({ gateway: res.gateway ?? '' }, { emitEvent: false });
        this.modesEnabled = res.modesEnabled;
        this.credentialsConfigured = res.credentialsConfigured;
      },
      error: () => {
        this.paymentLoadFailed = true;
        this.paymentSubmitError = this.translate.instant('setup.paymentsKyc.validation.loadFailed');
      }
    });
    merge(this.paymentForm.valueChanges, this.modesChanged$)
      .pipe(takeUntil(this.destroyed$), debounceTime(400))
      .subscribe(() => {
        this.paymentSavedJustNow = false;
        if (!this.paymentLoadFailed && this.paymentForm.valid) {
          this.savePayment();
        }
      });

    this.payoutSub = this.paymentsKycService.getPayoutAccount().subscribe({
      next: res => {
        this.payoutForm.patchValue(
          {
            bankName: res.bankName ?? '',
            accountHolder: res.accountHolder ?? '',
            accountNumber: res.accountNumber ?? '',
            ifscCode: res.ifscCode ?? '',
            accountType: res.accountType ?? 'CURRENT'
          },
          { emitEvent: false }
        );
      },
      error: () => {
        this.payoutLoadFailed = true;
      }
    });
    this.payoutForm.valueChanges.pipe(takeUntil(this.destroyed$), debounceTime(400)).subscribe(() => {
      this.payoutSavedJustNow = false;
      if (!this.payoutLoadFailed && this.payoutForm.valid) {
        this.savePayout();
      }
    });

    this.kycSub = this.paymentsKycService.getKycConfig().subscribe({
      next: res => {
        this.strictness = res.strictness;
        this.requiredDocuments = res.requiredDocuments;
      },
      error: () => {
        this.kycLoadFailed = true;
      }
    });
    this.kycChanged$.pipe(takeUntil(this.destroyed$), debounceTime(400)).subscribe(() => {
      this.kycSavedJustNow = false;
      if (!this.kycLoadFailed && this.requiredDocuments.length > 0) {
        this.saveKyc();
      }
    });

    this.withdrawalSub = this.paymentsKycService.getWithdrawalConfig().subscribe({
      next: res => {
        this.approvalMode = res.approvalMode;
        this.autoApproveLimit = res.autoApproveLimit;
      },
      error: () => {
        this.withdrawalLoadFailed = true;
      }
    });
    this.withdrawalChanged$.pipe(takeUntil(this.destroyed$), debounceTime(400)).subscribe(() => {
      this.withdrawalSavedJustNow = false;
      if (!this.withdrawalLoadFailed) {
        this.saveWithdrawal();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.paymentSub?.unsubscribe();
    this.payoutSub?.unsubscribe();
    this.kycSub?.unsubscribe();
    this.withdrawalSub?.unsubscribe();
  }

  // --- Payment Collection ---
  isModeEnabled(mode: string): boolean {
    return this.modesEnabled.includes(mode);
  }

  toggleMode(mode: string, checked: boolean): void {
    this.modesEnabled = checked ? [...this.modesEnabled, mode] : this.modesEnabled.filter(m => m !== mode);
    this.modesChanged$.next();
  }

  revealCredentialsInput(): void {
    this.showCredentialsInput = true;
    this.credentialsInputValue = '';
    this.credentialsSubmitError = null;
  }

  saveCredentials(): void {
    if (!this.credentialsInputValue.trim()) {
      return;
    }
    const request: PaymentConfigRequest = {
      gateway: this.paymentForm.getRawValue().gateway,
      modesEnabled: this.modesEnabled,
      credentials: this.credentialsInputValue
    };
    this.paymentsKycService.updatePaymentConfig(request).subscribe({
      next: res => {
        this.credentialsConfigured = res.credentialsConfigured;
        this.showCredentialsInput = false;
        this.credentialsInputValue = '';
        this.credentialsSubmitError = null;
        this.credentialsSavedJustNow = true;
        this.setupService.refresh();
      },
      error: err => {
        this.credentialsSubmitError =
          err.error?.error ?? this.translate.instant('setup.paymentsKyc.validation.genericSaveError');
      }
    });
  }

  markPaymentTouched(name: string): void {
    this.paymentForm.get(name)?.markAsTouched();
  }

  paymentFieldError(name: string): string | undefined {
    if (this.paymentServerFieldErrors[name]) {
      return this.paymentServerFieldErrors[name];
    }
    const control = this.paymentForm.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('setup.paymentsKyc.validation.required');
    }
    return undefined;
  }

  private savePayment(): void {
    // credentials is intentionally omitted here -- autosave never touches the secret, only the
    // explicit "Save credentials" action does. See PaymentConfigRequest.credentials.
    const request: PaymentConfigRequest = {
      gateway: this.paymentForm.getRawValue().gateway,
      modesEnabled: this.modesEnabled
    };
    this.paymentsKycService.updatePaymentConfig(request).subscribe({
      next: res => {
        this.paymentServerFieldErrors = {};
        this.paymentSubmitError = null;
        this.paymentSavedJustNow = true;
        this.credentialsConfigured = res.credentialsConfigured;
        this.setupService.refresh();
      },
      error: err => {
        this.paymentSavedJustNow = false;
        const fields = toFieldErrors(err);
        const hasVisibleFieldError = RENDERED_PAYMENT_FIELD_ERROR_KEYS.some(key => key in fields);
        if (hasVisibleFieldError) {
          this.paymentSubmitError = null;
          this.paymentServerFieldErrors = fields;
        } else {
          this.paymentServerFieldErrors = {};
          this.paymentSubmitError = this.translate.instant('setup.paymentsKyc.validation.genericSaveError');
        }
      }
    });
  }

  // --- Payout Account ---
  setAccountType(value: string): void {
    if (value === 'CURRENT' || value === 'SAVINGS') {
      this.payoutForm.controls.accountType.setValue(value);
    }
  }

  markPayoutTouched(name: string): void {
    this.payoutForm.get(name)?.markAsTouched();
  }

  payoutFieldError(name: string): string | undefined {
    if (this.payoutServerFieldErrors[name]) {
      return this.payoutServerFieldErrors[name];
    }
    const control = this.payoutForm.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('setup.paymentsKyc.validation.required');
    }
    if (control.errors['pattern']) {
      return this.translate.instant('setup.paymentsKyc.validation.ifscFormat');
    }
    return undefined;
  }

  private savePayout(): void {
    const request: PayoutBankAccountRequest = this.payoutForm.getRawValue();
    this.paymentsKycService.updatePayoutAccount(request).subscribe({
      next: () => {
        this.payoutServerFieldErrors = {};
        this.payoutSavedJustNow = true;
        this.setupService.refresh();
      },
      error: err => {
        this.payoutSavedJustNow = false;
        const fields = toFieldErrors(err);
        const hasVisibleFieldError = RENDERED_PAYOUT_FIELD_ERROR_KEYS.some(key => key in fields);
        this.payoutServerFieldErrors = hasVisibleFieldError ? fields : {};
      }
    });
  }

  // --- KYC Requirements ---
  setStrictness(value: string): void {
    if (value === 'STRICT' || value === 'RELAXED') {
      this.strictness = value;
      this.kycChanged$.next();
    }
  }

  isDocumentRequired(doc: string): boolean {
    return this.requiredDocuments.includes(doc);
  }

  toggleDocument(doc: string, checked: boolean): void {
    this.requiredDocuments = checked ? [...this.requiredDocuments, doc] : this.requiredDocuments.filter(d => d !== doc);
    this.kycChanged$.next();
  }

  private saveKyc(): void {
    const request: KycConfigRequest = { strictness: this.strictness, requiredDocuments: this.requiredDocuments };
    this.paymentsKycService.updateKycConfig(request).subscribe({
      next: () => {
        this.kycSavedJustNow = true;
        this.setupService.refresh();
      },
      error: () => {
        this.kycSavedJustNow = false;
      }
    });
  }

  // --- Withdrawal Approval ---
  setApprovalMode(value: string): void {
    if (value === 'AUTO_UNDER_LIMIT' || value === 'ALWAYS_MANUAL') {
      this.approvalMode = value;
      this.withdrawalChanged$.next();
    }
  }

  setAutoApproveLimit(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.autoApproveLimit = target.value === '' ? null : Number(target.value);
    this.withdrawalChanged$.next();
  }

  private saveWithdrawal(): void {
    const request: WithdrawalConfigRequest = { approvalMode: this.approvalMode, autoApproveLimit: this.autoApproveLimit };
    this.paymentsKycService.updateWithdrawalConfig(request).subscribe({
      next: () => {
        this.withdrawalSavedJustNow = true;
        this.withdrawalSubmitError = null;
        this.setupService.refresh();
      },
      error: err => {
        this.withdrawalSavedJustNow = false;
        this.withdrawalSubmitError =
          err.error?.error ?? this.translate.instant('setup.paymentsKyc.validation.genericSaveError');
      }
    });
  }
}
