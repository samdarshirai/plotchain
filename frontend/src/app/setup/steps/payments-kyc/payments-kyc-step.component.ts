import { AfterViewInit, Component, Input, OnDestroy, OnInit, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, Subscription, merge } from 'rxjs';
import { debounceTime, takeUntil, tap } from 'rxjs/operators';
import { FieldErrorComponent } from '../../../shared/components/field-error/field-error.component';
import { InlineBannerComponent } from '../../../shared/components/inline-banner/inline-banner.component';
import { ToggleGroupComponent, ToggleOption } from '../../../shared/components/toggle-group/toggle-group.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { toFieldErrors } from '../../../core/api/field-errors.model';
import { PaymentsKycService } from './payments-kyc.service';
import { SetupService } from '../../setup.service';
import { SetupInspectorService, SetupStepController } from '../../setup-inspector.service';
import {
  BookingEmiConfigRequest,
  KycConfigRequest,
  PaymentConfigRequest,
  PayoutBankAccountRequest,
  WithdrawalConfigRequest
} from '../../models/payments-kyc.model';

const IFSC_CODE_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// The spec never enumerates gateway options -- these are a sensible Indian-market default set;
// the backend accepts any non-blank gateway string (see PaymentConfigRequest). Icons are purely
// decorative (icon-tile picker per the Stitch mockup) and carry no domain meaning.
const GATEWAY_TILES: { value: string; icon: string }[] = [
  { value: 'RAZORPAY', icon: 'account_balance_wallet' },
  { value: 'PAYU', icon: 'payments' },
  { value: 'CASHFREE', icon: 'credit_card' }
];
const MODE_OPTIONS = ['CARDS', 'UPI', 'NETBANKING', 'WALLET'];
// The spec's own three literal examples ("Aadhaar, PAN, bank passbook, etc.") -- the "etc." is
// not invented further here.
const DOCUMENT_TILES: { value: string; icon: string; labelKey: string }[] = [
  { value: 'AADHAAR', icon: 'badge', labelKey: 'setup.paymentsKyc.kycDocAadhaarLabel' },
  { value: 'PAN', icon: 'credit_card', labelKey: 'setup.paymentsKyc.kycDocPanLabel' },
  { value: 'BANK_PASSBOOK', icon: 'receipt_long', labelKey: 'setup.paymentsKyc.kycDocBankPassbookLabel' }
];

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
    <div class="payments-kyc-step" [class.payments-kyc-step--wide]="mode === 'settings'">
      <div class="payments-kyc-step__intro">
        <span *ngIf="mode !== 'settings'" class="payments-kyc-step__eyebrow">
          {{ 'setup.paymentsKyc.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
        </span>
        <h1 class="payments-kyc-step__title">{{ 'setup.steps.paymentsKyc' | translate }}</h1>
        <p class="payments-kyc-step__subtitle">{{ 'setup.paymentsKyc.subtitle' | translate }}</p>
      </div>

      <div class="payments-kyc-step__grid">
      <div class="payments-kyc-step__grid-col payments-kyc-step__grid-col--primary">
      <form class="card payments-kyc-step__card payments-kyc-step__card--payment" [formGroup]="paymentForm">
        <h2 class="payments-kyc-step__section-title">
          <span class="material-symbols-outlined">payments</span>
          {{ 'setup.paymentsKyc.paymentCollectionTitle' | translate }}
        </h2>

        <div class="payments-kyc-step__gateway-grid">
          <button
            type="button"
            *ngFor="let tile of gatewayTiles"
            class="payments-kyc-step__gateway-tile"
            [class.payments-kyc-step__gateway-tile--active]="paymentForm.value.gateway === tile.value"
            (click)="selectGateway(tile.value)"
          >
            <span class="payments-kyc-step__gateway-icon">
              <span class="material-symbols-outlined">{{ tile.icon }}</span>
            </span>
            <span class="payments-kyc-step__gateway-label">{{ tile.value }}</span>
            <span
              class="payments-kyc-step__gateway-status-dot"
              [class.payments-kyc-step__gateway-status-dot--active]="paymentForm.value.gateway === tile.value"
            ></span>
          </button>
        </div>
        <app-field-error [message]="paymentFieldError('gateway')"></app-field-error>

        <div class="payments-kyc-step__mode-chips">
          <span class="payments-kyc-step__mode-chips-label">{{ 'setup.paymentsKyc.modesEnabledLabel' | translate }}</span>
          <button
            type="button"
            *ngFor="let paymentMode of modeOptions"
            class="payments-kyc-step__mode-chip"
            [class.payments-kyc-step__mode-chip--active]="isModeEnabled(paymentMode)"
            (click)="toggleMode(paymentMode, !isModeEnabled(paymentMode))"
          >
            {{ paymentMode }}
          </button>
        </div>

        <div class="payments-kyc-step__credentials">
          <p class="payments-kyc-step__hint" *ngIf="!credentialsConfigured">
            {{ 'setup.paymentsKyc.credentialsRequiredHint' | translate }}
          </p>
          <div class="payments-kyc-step__credentials-status" *ngIf="!showCredentialsInput">
            <span>
              {{ (credentialsConfigured ? 'setup.paymentsKyc.credentialsConfigured' : 'setup.paymentsKyc.credentialsNotConfigured') | translate }}
            </span>
            <button type="button" class="payments-kyc-step__credentials-link" (click)="revealCredentialsInput()">
              {{ 'setup.paymentsKyc.changeCredentialsLabel' | translate }}
            </button>
          </div>
          <div class="payments-kyc-step__credentials-edit" *ngIf="showCredentialsInput">
            <input type="password" [value]="credentialsInputValue" (input)="credentialsInputValue = $any($event.target).value" />
            <button type="button" class="payments-kyc-step__credentials-link" (click)="saveCredentials()">
              {{ 'setup.paymentsKyc.saveCredentialsLabel' | translate }}
            </button>
          </div>
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

      <div class="payments-kyc-step__row--split">
        <form class="card payments-kyc-step__card payments-kyc-step__card--payout" [formGroup]="payoutForm">
          <h2 class="payments-kyc-step__section-title">
            <span class="material-symbols-outlined">account_balance</span>
            {{ 'setup.paymentsKyc.payoutAccountTitle' | translate }}
          </h2>

          <div class="payments-kyc-step__row">
            <div>
              <label>
                {{ 'setup.paymentsKyc.bankNameLabel' | translate }}
                <input type="text" formControlName="bankName" (blur)="markPayoutTouched('bankName')" />
              </label>
              <app-field-error [message]="payoutFieldError('bankName')"></app-field-error>
            </div>

            <div>
              <label>
                {{ 'setup.paymentsKyc.accountHolderLabel' | translate }}
                <input type="text" formControlName="accountHolder" (blur)="markPayoutTouched('accountHolder')" />
              </label>
              <app-field-error [message]="payoutFieldError('accountHolder')"></app-field-error>
            </div>

            <div>
              <label>
                {{ 'setup.paymentsKyc.accountNumberLabel' | translate }}
                <input type="text" formControlName="accountNumber" (blur)="markPayoutTouched('accountNumber')" />
              </label>
              <app-field-error [message]="payoutFieldError('accountNumber')"></app-field-error>
            </div>

            <div>
              <label>
                {{ 'setup.paymentsKyc.ifscCodeLabel' | translate }}
                <input type="text" formControlName="ifscCode" (blur)="markPayoutTouched('ifscCode')" />
              </label>
              <app-field-error [message]="payoutFieldError('ifscCode')"></app-field-error>
            </div>
          </div>

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

        <div class="card payments-kyc-step__card payments-kyc-step__card--withdrawal">
          <h2 class="payments-kyc-step__section-title">
            <span class="material-symbols-outlined">account_balance_wallet</span>
            {{ 'setup.paymentsKyc.withdrawalApprovalTitle' | translate }}
          </h2>

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

          <label>
            {{ 'setup.paymentsKyc.minimumWithdrawalAmountLabel' | translate }}
            <input type="number" [value]="minimumWithdrawalAmount" (input)="setMinimumWithdrawalAmount($event)" />
          </label>

          <div class="payments-kyc-step__withdrawal-flow">
            <span class="payments-kyc-step__withdrawal-flow-step">{{ 'setup.paymentsKyc.flowRequestRaised' | translate }}</span>
            <span class="material-symbols-outlined payments-kyc-step__withdrawal-flow-arrow">arrow_forward</span>
            <span class="payments-kyc-step__withdrawal-flow-step">{{ 'setup.paymentsKyc.flowAdminReview' | translate }}</span>
            <span class="material-symbols-outlined payments-kyc-step__withdrawal-flow-arrow">arrow_forward</span>
            <span class="payments-kyc-step__withdrawal-flow-step">{{ 'setup.paymentsKyc.flowApproved' | translate }}</span>
            <span class="material-symbols-outlined payments-kyc-step__withdrawal-flow-arrow">arrow_forward</span>
            <span class="payments-kyc-step__withdrawal-flow-step">{{ 'setup.paymentsKyc.flowPayoutInitiated' | translate }}</span>
          </div>

          <app-inline-banner *ngIf="withdrawalSubmitError" tone="danger">{{ withdrawalSubmitError }}</app-inline-banner>
          <div class="payments-kyc-step__saved" *ngIf="withdrawalSavedJustNow">
            {{ 'setup.paymentsKyc.savedIndicator' | translate }}
          </div>
        </div>
      </div>
      </div>

      <div class="payments-kyc-step__grid-col payments-kyc-step__grid-col--secondary">
        <div class="card payments-kyc-step__card payments-kyc-step__card--kyc">
          <h2 class="payments-kyc-step__section-title">
            <span class="material-symbols-outlined">verified_user</span>
            {{ 'setup.paymentsKyc.kycRequirementsTitle' | translate }}
          </h2>

          <label>
            {{ 'setup.paymentsKyc.kycStrictnessLabel' | translate }}
            <app-toggle-group
              [options]="strictnessOptions"
              [value]="strictness"
              (valueChange)="setStrictness($event)"
            ></app-toggle-group>
          </label>

          <div class="payments-kyc-step__kyc-checklist">
            <span class="payments-kyc-step__kyc-checklist-label">
              {{ 'setup.paymentsKyc.requiredDocumentsLabel' | translate }}
            </span>
            <button
              type="button"
              *ngFor="let doc of documentTiles"
              class="payments-kyc-step__kyc-row"
              [class.payments-kyc-step__kyc-row--active]="isDocumentRequired(doc.value)"
              (click)="toggleDocument(doc.value, !isDocumentRequired(doc.value))"
            >
              <span class="material-symbols-outlined payments-kyc-step__kyc-row-icon">{{ doc.icon }}</span>
              <span class="payments-kyc-step__kyc-row-label">{{ doc.labelKey | translate }}</span>
              <span class="material-symbols-outlined payments-kyc-step__kyc-row-status">
                {{ isDocumentRequired(doc.value) ? 'check_circle' : 'radio_button_unchecked' }}
              </span>
            </button>
          </div>

          <div class="payments-kyc-step__saved" *ngIf="kycSavedJustNow">
            {{ 'setup.paymentsKyc.savedIndicator' | translate }}
          </div>
        </div>

        <div class="card payments-kyc-step__card payments-kyc-step__card--booking payments-kyc-step__card--final">
          <h2 class="payments-kyc-step__section-title">
            <span class="material-symbols-outlined">event_repeat</span>
            {{ 'setup.paymentsKyc.bookingEmiPolicyTitle' | translate }}
          </h2>

          <label class="payments-kyc-step__checkbox-field">
            <input type="checkbox" [checked]="emiEnabled" (change)="setEmiEnabled($any($event.target).checked)" />
            {{ 'setup.paymentsKyc.emiEnabledLabel' | translate }}
          </label>

          <label>
            {{ 'setup.paymentsKyc.defaultInstallmentCountLabel' | translate }}
            <input type="number" min="1" [value]="defaultInstallmentCount" (input)="setDefaultInstallmentCount($event)" />
          </label>

          <div class="payments-kyc-step__confirm-rule">
            <span class="payments-kyc-step__confirm-rule-label">{{ 'setup.paymentsKyc.confirmRuleLabel' | translate }}</span>
            <div class="payments-kyc-step__confirm-rule-list">
              <button
                type="button"
                class="payments-kyc-step__confirm-rule-row"
                [class.payments-kyc-step__confirm-rule-row--active]="confirmRule === 'AUTO_THRESHOLD'"
                (click)="setConfirmRule('AUTO_THRESHOLD')"
              >
                <span
                  class="payments-kyc-step__confirm-rule-dot"
                  [class.payments-kyc-step__confirm-rule-dot--active]="confirmRule === 'AUTO_THRESHOLD'"
                ></span>
                {{ 'setup.paymentsKyc.confirmRuleAutoThresholdLabel' | translate }}
              </button>
              <button
                type="button"
                class="payments-kyc-step__confirm-rule-row"
                [class.payments-kyc-step__confirm-rule-row--active]="confirmRule === 'MANUAL'"
                (click)="setConfirmRule('MANUAL')"
              >
                <span
                  class="payments-kyc-step__confirm-rule-dot"
                  [class.payments-kyc-step__confirm-rule-dot--active]="confirmRule === 'MANUAL'"
                ></span>
                {{ 'setup.paymentsKyc.confirmRuleManualLabel' | translate }}
              </button>
              <button
                type="button"
                class="payments-kyc-step__confirm-rule-row"
                [class.payments-kyc-step__confirm-rule-row--active]="confirmRule === 'KYC_GATED'"
                (click)="setConfirmRule('KYC_GATED')"
              >
                <span
                  class="payments-kyc-step__confirm-rule-dot"
                  [class.payments-kyc-step__confirm-rule-dot--active]="confirmRule === 'KYC_GATED'"
                ></span>
                {{ 'setup.paymentsKyc.confirmRuleKycGatedLabel' | translate }}
              </button>
            </div>
          </div>

          <label *ngIf="confirmRule === 'AUTO_THRESHOLD'">
            {{ 'setup.paymentsKyc.confirmThresholdPercentLabel' | translate }}
            <input type="number" min="1" max="100" [value]="confirmThresholdPercent" (input)="setConfirmThresholdPercent($event)" />
          </label>

          <app-inline-banner *ngIf="bookingEmiSubmitError" tone="danger">{{ bookingEmiSubmitError }}</app-inline-banner>
          <div class="payments-kyc-step__saved" *ngIf="bookingEmiSavedJustNow">
            {{ 'setup.paymentsKyc.savedIndicator' | translate }}
          </div>

          <app-setup-step-nav *ngIf="mode === 'settings'" [savedJustNow]="anySavedJustNow" [mode]="mode"></app-setup-step-nav>
        </div>
      </div>
      </div>
    </div>

    <ng-template #inspectorTpl>
      <div class="payments-kyc-step__aside-column">
        <div class="payments-kyc-step__intro payments-kyc-step__intro--spacer" aria-hidden="true">
          <span class="payments-kyc-step__eyebrow">
            {{ 'setup.paymentsKyc.stepEyebrowLabel' | translate: { number: stepNumber, count: stepCount } }}
          </span>
          <h1 class="payments-kyc-step__title">{{ 'setup.steps.paymentsKyc' | translate }}</h1>
          <p class="payments-kyc-step__subtitle">{{ 'setup.paymentsKyc.subtitle' | translate }}</p>
        </div>

        <div class="payments-kyc-step__flow-diagram">
          <h4 class="payments-kyc-step__flow-title">
            <span class="material-symbols-outlined">hub</span>
            {{ 'setup.paymentsKyc.flowEngineTitle' | translate }}
          </h4>
          <p class="payments-kyc-step__flow-subtitle">{{ 'setup.paymentsKyc.flowEngineSubtitle' | translate }}</p>

          <div class="payments-kyc-step__flow-node">
            <span class="material-symbols-outlined">person</span>
            <span class="payments-kyc-step__flow-node-text">
              <span class="payments-kyc-step__flow-node-label">{{ 'setup.paymentsKyc.flowSourceLabel' | translate }}</span>
              <strong>{{ 'setup.paymentsKyc.flowSourceValue' | translate }}</strong>
            </span>
          </div>
          <div class="payments-kyc-step__flow-connector"></div>
          <div class="payments-kyc-step__flow-node">
            <span class="material-symbols-outlined">hub</span>
            <span class="payments-kyc-step__flow-node-text">
              <span class="payments-kyc-step__flow-node-label">{{ 'setup.paymentsKyc.flowProcessorLabel' | translate }}</span>
              <strong>{{ 'setup.paymentsKyc.flowProcessorValue' | translate }}</strong>
            </span>
          </div>
          <div class="payments-kyc-step__flow-connector"></div>
          <div class="payments-kyc-step__flow-node payments-kyc-step__flow-node--highlight">
            <span class="material-symbols-outlined">account_balance_wallet</span>
            <span class="payments-kyc-step__flow-node-text">
              <span class="payments-kyc-step__flow-node-label">{{ 'setup.paymentsKyc.flowEscrowLabel' | translate }}</span>
              <strong>{{ 'setup.paymentsKyc.flowEscrowValue' | translate }}</strong>
            </span>
          </div>

          <div class="payments-kyc-step__flow-split">
            <div class="payments-kyc-step__flow-leaf">
              <span class="material-symbols-outlined">group</span>
              <span class="payments-kyc-step__flow-node-label">{{ 'setup.paymentsKyc.flowAssociateLabel' | translate }}</span>
              <strong>{{ 'setup.paymentsKyc.flowAssociateValue' | translate }}</strong>
            </div>
            <div class="payments-kyc-step__flow-leaf">
              <span class="material-symbols-outlined">trending_up</span>
              <span class="payments-kyc-step__flow-node-label">{{ 'setup.paymentsKyc.flowCompanyLabel' | translate }}</span>
              <strong>{{ 'setup.paymentsKyc.flowCompanyValue' | translate }}</strong>
            </div>
          </div>

          <div class="payments-kyc-step__flow-secure-note">
            <span class="material-symbols-outlined">security</span>
            <div>
              <strong>{{ 'setup.paymentsKyc.flowSecureNoteTitle' | translate }}</strong>
              <p>{{ 'setup.paymentsKyc.flowSecureNoteBody' | translate }}</p>
            </div>
          </div>
        </div>
      </div>
    </ng-template>
  `
})
export class PaymentsKycStepComponent implements OnInit, AfterViewInit, OnDestroy, SetupStepController {
  private fb = inject(FormBuilder);
  private paymentsKycService = inject(PaymentsKycService);
  private setupService = inject(SetupService);
  private inspectorService = inject(SetupInspectorService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private destroyed$ = new Subject<void>();

  @ViewChild('inspectorTpl') private inspectorTpl!: TemplateRef<unknown>;

  @Input() mode: 'setup' | 'settings' = 'setup';

  readonly gatewayTiles = GATEWAY_TILES;
  readonly modeOptions = MODE_OPTIONS;
  readonly documentTiles = DOCUMENT_TILES;

  stepNumber = 1;
  stepCount = 1;

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
  // Neither strictness nor requiredDocuments is a FormControl, so there's no built-in dirty
  // tracking to lean on -- set on every edit, cleared once saveKyc() sends it.
  private kycDirty = false;
  private kycChanged$ = new Subject<void>();
  private kycSub?: Subscription;

  // --- Withdrawal Approval ---
  approvalMode: 'AUTO_UNDER_LIMIT' | 'ALWAYS_MANUAL' = 'ALWAYS_MANUAL';
  autoApproveLimit: number | null = null;
  // The real Go-Live-gating field (WithdrawalConfigService.isComplete()) -- see the model comment
  // on WithdrawalConfigResponse.minimumWithdrawalAmount for how it differs from compensation's
  // legacy minWithdrawal control.
  minimumWithdrawalAmount: number | null = null;
  withdrawalSavedJustNow = false;
  withdrawalSubmitError: string | null = null;
  private withdrawalLoadFailed = false;
  // None of approvalMode/autoApproveLimit/minimumWithdrawalAmount is a FormControl, so there's no
  // built-in dirty tracking to lean on -- set on every edit, cleared once saveWithdrawal() sends
  // it. Mirrors kycDirty/bookingEmiDirty above.
  private withdrawalDirty = false;
  private withdrawalChanged$ = new Subject<void>();
  private withdrawalSub?: Subscription;

  // --- Booking & EMI Policy ---
  emiEnabled = false;
  defaultInstallmentCount = 1;
  confirmRule: 'AUTO_THRESHOLD' | 'MANUAL' | 'KYC_GATED' = 'MANUAL';
  confirmThresholdPercent: number | null = null;
  bookingEmiSavedJustNow = false;
  bookingEmiSubmitError: string | null = null;
  private bookingEmiLoadFailed = false;
  // None of this section's fields are FormControls -- set on every edit, cleared once
  // saveBookingEmi() sends it. Mirrors kycDirty above.
  private bookingEmiDirty = false;
  private bookingEmiChanged$ = new Subject<void>();
  private bookingEmiSub?: Subscription;

  get anySavedJustNow(): boolean {
    return (
      this.paymentSavedJustNow ||
      this.payoutSavedJustNow ||
      this.kycSavedJustNow ||
      this.withdrawalSavedJustNow ||
      this.bookingEmiSavedJustNow
    );
  }

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
    this.mode = (this.route.snapshot.data['mode'] as 'setup' | 'settings') ?? 'setup';

    this.setupService
      .getState()
      .pipe(takeUntil(this.destroyed$))
      .subscribe(state => {
        const step = state.steps.find(s => s.key === 'paymentsKyc');
        this.stepNumber = step?.number ?? 1;
        this.stepCount = state.steps.length;
      });

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
      .pipe(
        takeUntil(this.destroyed$),
        // gateway is set programmatically via selectGateway() (a gateway-tile click), and
        // modesEnabled isn't a form control at all -- neither marks paymentForm dirty on its own.
        tap(() => this.paymentForm.markAsDirty()),
        debounceTime(400)
      )
      .subscribe(() => {
        this.paymentSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
        // paymentForm.dirty is also checked: debounceTime flushes its last buffered value
        // immediately when its source completes (e.g. destroyed$ on navigation), even if
        // flushPendingSave() already saved this value and marked the form pristine moments
        // earlier -- without this check that would fire a redundant duplicate PUT.
        if (!this.paymentLoadFailed && this.paymentForm.dirty && this.paymentForm.valid) {
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
    this.payoutForm.valueChanges
      .pipe(
        takeUntil(this.destroyed$),
        // accountType is set programmatically via setAccountType() (a toggle-group output), so
        // it never marks payoutForm dirty on its own.
        tap(() => this.payoutForm.markAsDirty()),
        debounceTime(400)
      )
      .subscribe(() => {
        this.payoutSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
        // payoutForm.dirty is also checked, for the same reason as paymentForm above.
        if (!this.payoutLoadFailed && this.payoutForm.dirty && this.payoutForm.valid) {
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
    this.kycChanged$
      .pipe(takeUntil(this.destroyed$), tap(() => (this.kycDirty = true)), debounceTime(400))
      .subscribe(() => {
        this.kycSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
        // kycDirty is also checked, for the same reason as paymentForm.dirty above.
        if (!this.kycLoadFailed && this.kycDirty && this.requiredDocuments.length > 0) {
          this.saveKyc();
        }
      });

    this.withdrawalSub = this.paymentsKycService.getWithdrawalConfig().subscribe({
      next: res => {
        this.approvalMode = res.approvalMode;
        this.autoApproveLimit = res.autoApproveLimit;
        this.minimumWithdrawalAmount = res.minimumWithdrawalAmount;
      },
      error: () => {
        this.withdrawalLoadFailed = true;
      }
    });
    this.withdrawalChanged$
      .pipe(takeUntil(this.destroyed$), tap(() => (this.withdrawalDirty = true)), debounceTime(400))
      .subscribe(() => {
        this.withdrawalSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
        // withdrawalDirty is also checked, for the same reason as paymentForm.dirty above.
        if (!this.withdrawalLoadFailed && this.withdrawalDirty) {
          this.saveWithdrawal();
        }
      });

    this.bookingEmiSub = this.paymentsKycService.getBookingEmiConfig().subscribe({
      next: res => {
        this.emiEnabled = res.emiEnabled;
        this.defaultInstallmentCount = res.defaultInstallmentCount;
        this.confirmRule = res.confirmRule;
        this.confirmThresholdPercent = res.confirmThresholdPercent;
      },
      error: () => {
        this.bookingEmiLoadFailed = true;
      }
    });
    this.bookingEmiChanged$
      .pipe(takeUntil(this.destroyed$), tap(() => (this.bookingEmiDirty = true)), debounceTime(400))
      .subscribe(() => {
        this.bookingEmiSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
        // bookingEmiDirty is also checked, for the same reason as paymentForm.dirty above.
        if (!this.bookingEmiLoadFailed && this.bookingEmiDirty) {
          this.saveBookingEmi();
        }
      });

    this.inspectorService.registerStep(this);
  }

  ngAfterViewInit(): void {
    if (this.mode === 'setup') {
      // hideFooter: false -- the aside only holds the Money Flow Engine diagram here (no nav), so
      // the shared setup-shell footer stays visible and handles Previous/Next/Saved, matching the
      // Stitch mockup's shared bottom bar.
      this.inspectorService.register(this.inspectorTpl, { hideFooter: false });
    }
  }

  // SetupStepController: lets SetupStepNavComponent flush any of this step's cards that still
  // have an edit sitting in their own 400ms autosave debounce before it navigates away. Withdrawal
  // Approval is included (B2) -- minimumWithdrawalAmount is the real Go-Live-gating field, so an
  // edit still sitting in its debounce when the user clicks Next must not be lost to
  // destroyed$ cancelling the in-flight debounce on navigation (the same bug class B1 fixed for
  // the other cards).
  flushPendingSave(): void {
    if (!this.paymentLoadFailed && this.paymentForm.dirty && this.paymentForm.valid) {
      this.savePayment();
    }
    if (!this.payoutLoadFailed && this.payoutForm.dirty && this.payoutForm.valid) {
      this.savePayout();
    }
    if (!this.kycLoadFailed && this.kycDirty && this.requiredDocuments.length > 0) {
      this.saveKyc();
    }
    if (!this.withdrawalLoadFailed && this.withdrawalDirty) {
      this.saveWithdrawal();
    }
    if (!this.bookingEmiLoadFailed && this.bookingEmiDirty) {
      this.saveBookingEmi();
    }
  }

  // SetupStepController: lets SetupStepNavComponent block Next on an invalid required field in
  // either card that has Validators-backed required fields. Withdrawal Approval has no such gate:
  // approvalMode/autoApproveLimit/minimumWithdrawalAmount are plain component properties, not
  // FormControls -- their only validation is the server's cross-field check (autoApproveLimit
  // required when approvalMode is AUTO_UNDER_LIMIT), surfaced as withdrawalSubmitError on save,
  // same as KYC/Booking & EMI have no client-side gate here either.
  isStepValid(): boolean {
    return this.paymentForm.valid && this.payoutForm.valid;
  }

  ngOnDestroy(): void {
    this.destroyed$.next();
    this.destroyed$.complete();
    this.paymentSub?.unsubscribe();
    this.payoutSub?.unsubscribe();
    this.kycSub?.unsubscribe();
    this.withdrawalSub?.unsubscribe();
    this.bookingEmiSub?.unsubscribe();
    this.inspectorService.clear();
  }

  // --- Payment Collection ---
  selectGateway(gateway: string): void {
    this.paymentForm.controls.gateway.setValue(gateway);
    this.markPaymentTouched('gateway');
  }

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
        this.inspectorService.setSaved(this.anySavedJustNow);
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
    this.paymentForm.markAsPristine();
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
        this.inspectorService.setSaved(this.anySavedJustNow);
        this.credentialsConfigured = res.credentialsConfigured;
        this.setupService.refresh();
      },
      error: err => {
        // Re-mark dirty: see the matching comment in company-profile-step.component.ts's save()
        // error handler -- a failed save must not leave paymentForm looking pristine.
        this.paymentForm.markAsDirty();
        this.paymentSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
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
    this.payoutForm.markAsPristine();
    const request: PayoutBankAccountRequest = this.payoutForm.getRawValue();
    this.paymentsKycService.updatePayoutAccount(request).subscribe({
      next: () => {
        this.payoutServerFieldErrors = {};
        this.payoutSavedJustNow = true;
        this.inspectorService.setSaved(this.anySavedJustNow);
        this.setupService.refresh();
      },
      error: err => {
        // Re-mark dirty: see the matching comment in company-profile-step.component.ts's save()
        // error handler -- a failed save must not leave payoutForm looking pristine.
        this.payoutForm.markAsDirty();
        this.payoutSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
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
    this.kycDirty = false;
    const request: KycConfigRequest = { strictness: this.strictness, requiredDocuments: this.requiredDocuments };
    this.paymentsKycService.updateKycConfig(request).subscribe({
      next: () => {
        this.kycSavedJustNow = true;
        this.inspectorService.setSaved(this.anySavedJustNow);
        this.setupService.refresh();
      },
      error: () => {
        // Re-mark dirty: see the matching comment in company-profile-step.component.ts's save()
        // error handler -- a failed save must not leave kycDirty looking cleared.
        this.kycDirty = true;
        this.kycSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
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

  setMinimumWithdrawalAmount(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.minimumWithdrawalAmount = target.value === '' ? null : Number(target.value);
    this.withdrawalChanged$.next();
  }

  private saveWithdrawal(): void {
    this.withdrawalDirty = false;
    const request: WithdrawalConfigRequest = {
      approvalMode: this.approvalMode,
      autoApproveLimit: this.autoApproveLimit,
      minimumWithdrawalAmount: this.minimumWithdrawalAmount
    };
    this.paymentsKycService.updateWithdrawalConfig(request).subscribe({
      next: () => {
        this.withdrawalSavedJustNow = true;
        this.inspectorService.setSaved(this.anySavedJustNow);
        this.withdrawalSubmitError = null;
        this.setupService.refresh();
      },
      error: err => {
        // Re-mark dirty: see the matching comment in company-profile-step.component.ts's save()
        // error handler -- a failed save must not leave withdrawalDirty looking cleared.
        this.withdrawalDirty = true;
        this.withdrawalSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
        this.withdrawalSubmitError =
          err.error?.error ?? this.translate.instant('setup.paymentsKyc.validation.genericSaveError');
      }
    });
  }

  // --- Booking & EMI Policy ---
  setEmiEnabled(checked: boolean): void {
    this.emiEnabled = checked;
    this.bookingEmiChanged$.next();
  }

  setDefaultInstallmentCount(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.defaultInstallmentCount = target.value === '' ? 1 : Number(target.value);
    this.bookingEmiChanged$.next();
  }

  setConfirmRule(value: string): void {
    if (value === 'AUTO_THRESHOLD' || value === 'MANUAL' || value === 'KYC_GATED') {
      this.confirmRule = value;
      this.bookingEmiChanged$.next();
    }
  }

  setConfirmThresholdPercent(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.confirmThresholdPercent = target.value === '' ? null : Number(target.value);
    this.bookingEmiChanged$.next();
  }

  private saveBookingEmi(): void {
    this.bookingEmiDirty = false;
    const request: BookingEmiConfigRequest = {
      emiEnabled: this.emiEnabled,
      defaultInstallmentCount: this.defaultInstallmentCount,
      confirmRule: this.confirmRule,
      confirmThresholdPercent: this.confirmThresholdPercent
    };
    this.paymentsKycService.updateBookingEmiConfig(request).subscribe({
      next: () => {
        this.bookingEmiSavedJustNow = true;
        this.inspectorService.setSaved(this.anySavedJustNow);
        this.bookingEmiSubmitError = null;
        this.setupService.refresh();
      },
      error: err => {
        // Re-mark dirty: see the matching comment in company-profile-step.component.ts's save()
        // error handler -- a failed save must not leave bookingEmiDirty looking cleared.
        this.bookingEmiDirty = true;
        this.bookingEmiSavedJustNow = false;
        this.inspectorService.setSaved(this.anySavedJustNow);
        this.bookingEmiSubmitError =
          err.error?.error ?? this.translate.instant('setup.paymentsKyc.validation.genericSaveError');
      }
    });
  }
}
