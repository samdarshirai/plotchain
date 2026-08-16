import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PaymentsKycStepComponent } from './payments-kyc-step.component';
import { SetupStepNavComponent } from '../../../shared/components/setup-step-nav/setup-step-nav.component';
import { SetupService } from '../../setup.service';
import { SetupInspectorService } from '../../setup-inspector.service';
import {
  BookingEmiConfigResponse,
  KycConfigResponse,
  PaymentConfigResponse,
  PayoutBankAccountResponse,
  WithdrawalConfigResponse
} from '../../models/payments-kyc.model';
import { SetupStateResponse } from '../../models/setup-state.model';

describe('PaymentsKycStepComponent', () => {
  let fixture: ComponentFixture<PaymentsKycStepComponent>;
  let httpMock: HttpTestingController;

  const emptyPaymentConfig: PaymentConfigResponse = {
    gateway: null,
    credentialsConfigured: false,
    modesEnabled: [],
    updatedAt: null
  };

  const emptyPayoutAccount: PayoutBankAccountResponse = {
    bankName: null,
    accountHolder: null,
    accountNumber: null,
    ifscCode: null,
    accountType: null,
    updatedAt: null
  };

  const defaultKycConfig: KycConfigResponse = {
    strictness: 'STRICT',
    requiredDocuments: ['AADHAAR', 'PAN', 'BANK_PASSBOOK'],
    updatedAt: null
  };

  const defaultWithdrawalConfig: WithdrawalConfigResponse = {
    approvalMode: 'ALWAYS_MANUAL',
    autoApproveLimit: null,
    minimumWithdrawalAmount: null,
    updatedAt: null
  };

  const defaultBookingEmiConfig: BookingEmiConfigResponse = {
    emiEnabled: false,
    defaultInstallmentCount: 1,
    confirmRule: 'MANUAL',
    confirmThresholdPercent: null,
    updatedAt: null
  };

  const setupState: SetupStateResponse = {
    steps: [
      { number: 1, key: 'companyProfile', complete: true, required: true, percentComplete: 100 },
      { number: 2, key: 'branding', complete: true, required: true, percentComplete: 100 },
      { number: 3, key: 'compensation', complete: true, required: true, percentComplete: 100 },
      { number: 4, key: 'projects', complete: true, required: true, percentComplete: 100 },
      { number: 5, key: 'paymentsKyc', complete: false, required: true, percentComplete: 0 }
    ],
    canGoLive: false,
    launchedAt: null
  };

  // Every successful save calls setupService.refresh(), which re-fires the shared
  // GET /api/company/setup-state (shareReplay only skips the request when replaying a cached
  // value to a new subscriber, not when the source itself is asked to refresh) -- same reasoning
  // as compensation-step.component.spec.ts.
  function flushSetupState(): void {
    httpMock.expectOne('/api/company/setup-state').flush(setupState);
  }

  function flushInitialLoads(
    payment = emptyPaymentConfig,
    payout = emptyPayoutAccount,
    kyc = defaultKycConfig,
    withdrawal = defaultWithdrawalConfig,
    bookingEmi = defaultBookingEmiConfig
  ): void {
    httpMock.expectOne('/api/company/payments').flush(payment);
    httpMock.expectOne('/api/company/payout-account').flush(payout);
    httpMock.expectOne('/api/company/kyc').flush(kyc);
    httpMock.expectOne('/api/company/withdrawal').flush(withdrawal);
    httpMock.expectOne('/api/company/booking-emi').flush(bookingEmi);
    flushSetupState();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentsKycStepComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentsKycStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SetupService);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads all five sections independently without triggering an autosave', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    expect(component.strictness).toBe('STRICT');
    expect(component.requiredDocuments).toEqual(['AADHAAR', 'PAN', 'BANK_PASSBOOK']);
    expect(component.approvalMode).toBe('ALWAYS_MANUAL');
    expect(component.emiEnabled).toBe(false);
    expect(component.confirmRule).toBe('MANUAL');

    tick(500);
    httpMock.expectNone('/api/company/payments');
    httpMock.expectNone('/api/company/payout-account');
    httpMock.expectNone('/api/company/kyc');
    httpMock.expectNone('/api/company/withdrawal');
    httpMock.expectNone('/api/company/booking-emi');
  }));

  it('autosaves the payment section on a gateway change, independently of the other sections', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.paymentForm.get('gateway')?.setValue('RAZORPAY');
    tick(400);

    const req = httpMock.expectOne('/api/company/payments');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ gateway: 'RAZORPAY', modesEnabled: [] });
    req.flush({ ...emptyPaymentConfig, gateway: 'RAZORPAY' });
    flushSetupState();

    httpMock.expectNone('/api/company/payout-account');
    httpMock.expectNone('/api/company/kyc');
    httpMock.expectNone('/api/company/withdrawal');
    httpMock.expectNone('/api/company/booking-emi');
  }));

  it('autosaves the payout section on a valid IFSC code and rejects a malformed one', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.payoutForm.patchValue({
      bankName: 'HDFC Bank',
      accountHolder: 'Plotchain Estates Pvt Ltd',
      accountNumber: '50100123456789',
      ifscCode: 'abc123'
    });
    component.markPayoutTouched('ifscCode');
    tick(400);
    httpMock.expectNone('/api/company/payout-account');
    expect(component.payoutFieldError('ifscCode')).toBeTruthy();

    component.payoutForm.get('ifscCode')?.setValue('HDFC0001234');
    tick(400);
    const req = httpMock.expectOne('/api/company/payout-account');
    expect(req.request.body.ifscCode).toBe('HDFC0001234');
    req.flush({ ...emptyPayoutAccount, ifscCode: 'HDFC0001234' });
    flushSetupState();
  }));

  it('autosaves the KYC section on a document toggle', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.toggleDocument('AADHAAR', false);
    tick(400);

    const req = httpMock.expectOne('/api/company/kyc');
    expect(req.request.body).toEqual({ strictness: 'STRICT', requiredDocuments: ['PAN', 'BANK_PASSBOOK'] });
    req.flush({ ...defaultKycConfig, requiredDocuments: ['PAN', 'BANK_PASSBOOK'] });
    flushSetupState();
  }));

  it('does not offer an OFF option for KYC strictness', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    expect(component.strictnessOptions.map(o => o.value)).toEqual(['STRICT', 'RELAXED']);
  });

  it('the "Save credentials" action does not fire on an unrelated gateway autosave', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.paymentForm.get('gateway')?.setValue('RAZORPAY');
    tick(400);
    const req = httpMock.expectOne('/api/company/payments');
    expect(req.request.body.credentials).toBeUndefined();
    req.flush({ ...emptyPaymentConfig, gateway: 'RAZORPAY' });
    flushSetupState();
  }));

  it('saves credentials only via the explicit action, not the debounced autosave', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.revealCredentialsInput();
    component.credentialsInputValue = 'sk_live_secret';
    component.saveCredentials();

    const req = httpMock.expectOne('/api/company/payments');
    expect(req.request.body).toEqual({ gateway: '', modesEnabled: [], credentials: 'sk_live_secret' });
    req.flush({ ...emptyPaymentConfig, credentialsConfigured: true });
    flushSetupState();

    expect(component.credentialsConfigured).toBe(true);
    expect(component.showCredentialsInput).toBe(false);
  }));

  it('loads minimumWithdrawalAmount from the withdrawal GET response', fakeAsync(() => {
    flushInitialLoads(
      emptyPaymentConfig,
      emptyPayoutAccount,
      defaultKycConfig,
      { ...defaultWithdrawalConfig, minimumWithdrawalAmount: 500 },
      defaultBookingEmiConfig
    );
    const component = fixture.componentInstance;

    expect(component.minimumWithdrawalAmount).toBe(500);
  }));

  it('autosaves minimumWithdrawalAmount in the withdrawal PUT body, alongside approvalMode/autoApproveLimit', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.setMinimumWithdrawalAmount({ target: { value: '500' } } as unknown as Event);
    tick(400);

    const req = httpMock.expectOne('/api/company/withdrawal');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ approvalMode: 'ALWAYS_MANUAL', autoApproveLimit: null, minimumWithdrawalAmount: 500 });
    req.flush({ ...defaultWithdrawalConfig, minimumWithdrawalAmount: 500 });
    flushSetupState();
  }));

  it('sends minimumWithdrawalAmount as null when the field is cleared', fakeAsync(() => {
    flushInitialLoads(
      emptyPaymentConfig,
      emptyPayoutAccount,
      defaultKycConfig,
      { ...defaultWithdrawalConfig, minimumWithdrawalAmount: 500 },
      defaultBookingEmiConfig
    );
    const component = fixture.componentInstance;
    expect(component.minimumWithdrawalAmount).toBe(500);

    component.setMinimumWithdrawalAmount({ target: { value: '' } } as unknown as Event);
    tick(400);

    const req = httpMock.expectOne('/api/company/withdrawal');
    expect(req.request.body.minimumWithdrawalAmount).toBeNull();
    req.flush({ ...defaultWithdrawalConfig, minimumWithdrawalAmount: null });
    flushSetupState();
  }));

  it('surfaces the withdrawal cross-field 409 as a banner, not a field error', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.setApprovalMode('AUTO_UNDER_LIMIT');
    tick(400);

    httpMock.expectOne('/api/company/withdrawal').flush(
      { error: 'auto-approve limit must be a positive amount when approval mode is AUTO_UNDER_LIMIT' },
      { status: 409, statusText: 'Conflict' }
    );

    expect(component.withdrawalSubmitError).toBe(
      'auto-approve limit must be a positive amount when approval mode is AUTO_UNDER_LIMIT'
    );
  }));

  it('autosaves the booking & EMI section on a confirm-rule change, independently of the other sections', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.setConfirmRule('KYC_GATED');
    tick(400);

    const req = httpMock.expectOne('/api/company/booking-emi');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      emiEnabled: false,
      defaultInstallmentCount: 1,
      confirmRule: 'KYC_GATED',
      confirmThresholdPercent: null
    });
    req.flush({ ...defaultBookingEmiConfig, confirmRule: 'KYC_GATED' });
    flushSetupState();

    httpMock.expectNone('/api/company/payments');
    httpMock.expectNone('/api/company/payout-account');
    httpMock.expectNone('/api/company/kyc');
    httpMock.expectNone('/api/company/withdrawal');
  }));

  it('surfaces the booking & EMI cross-field 409 as a banner, not a field error', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.setConfirmRule('AUTO_THRESHOLD');
    tick(400);

    httpMock.expectOne('/api/company/booking-emi').flush(
      { error: 'confirm threshold percent must be a positive value when confirm rule is AUTO_THRESHOLD' },
      { status: 409, statusText: 'Conflict' }
    );

    expect(component.bookingEmiSubmitError).toBe(
      'confirm threshold percent must be a positive value when confirm rule is AUTO_THRESHOLD'
    );
    expect(component.bookingEmiSavedJustNow).toBeFalse();
  }));

  it('only renders the confirm-threshold field when confirmRule is AUTO_THRESHOLD', () => {
    flushInitialLoads();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[min="1"][max="100"]')).toBeNull();

    fixture.componentInstance.setConfirmRule('AUTO_THRESHOLD');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input[min="1"][max="100"]')).toBeTruthy();
  });

  it('does not render the inline step-nav when mode is setup (shell owns navigation there)', () => {
    flushInitialLoads();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav).toBeNull();
  });

  it('passes the settings mode through to the step-nav, nested inside the last card', () => {
    flushInitialLoads();
    fixture.componentInstance.mode = 'settings';
    fixture.detectChanges();
    const nav = fixture.debugElement.query(By.directive(SetupStepNavComponent));
    expect(nav.componentInstance.mode).toBe('settings');
    // Regression guard for the projects-step bug (settings-mode nav floating outside the card
    // layout grid instead of sitting under the last card): the nav must be nested inside the
    // Booking & EMI Policy card, not a direct child of the top-level step container.
    expect(nav.nativeElement.closest('.payments-kyc-step__card--final')).toBeTruthy();
    expect(nav.nativeElement.parentElement?.classList.contains('payments-kyc-step')).toBeFalse();
  });

  it('keeps the payment-mode checkbox toggle working after the loop-variable rename', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.toggleMode('UPI', true);

    expect(component.isModeEnabled('UPI')).toBe(true);
    expect(component.modesEnabled).toContain('UPI');
  });

  it('registers itself as the active step with SetupInspectorService', () => {
    flushInitialLoads();
    const inspectorService = TestBed.inject(SetupInspectorService);
    expect(inspectorService.activeStep).toBe(fixture.componentInstance);
  });

  it('flushPendingSave saves every dirty card (payment/payout/kyc/booking-emi) immediately, bypassing their debounces', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.paymentForm.get('gateway')?.setValue('RAZORPAY');
    component.payoutForm.patchValue({
      bankName: 'HDFC Bank',
      accountHolder: 'Plotchain Estates Pvt Ltd',
      accountNumber: '50100123456789',
      ifscCode: 'HDFC0001234'
    });
    component.toggleDocument('AADHAAR', false);
    component.setConfirmRule('KYC_GATED');
    expect(component.paymentForm.dirty).toBeTrue();
    expect(component.payoutForm.dirty).toBeTrue();

    component.flushPendingSave();

    httpMock.expectOne('/api/company/payments').flush({ ...emptyPaymentConfig, gateway: 'RAZORPAY' });
    httpMock.expectOne('/api/company/payout-account').flush({ ...emptyPayoutAccount, ifscCode: 'HDFC0001234' });
    httpMock.expectOne('/api/company/kyc').flush({ ...defaultKycConfig, requiredDocuments: ['PAN', 'BANK_PASSBOOK'] });
    httpMock.expectOne('/api/company/booking-emi').flush({ ...defaultBookingEmiConfig, confirmRule: 'KYC_GATED' });
    // setup-state is re-fetched once per successful save above, via SetupService.refresh() ->
    // switchMap -- each new refresh() cancels whichever of these GETs is still in flight, so
    // only the most recent survives to be flushed; the rest are expected to already be cancelled.
    httpMock.match('/api/company/setup-state').forEach(req => {
      if (!req.cancelled) {
        req.flush(setupState);
      }
    });

    // Withdrawal Approval is intentionally excluded -- its flush wiring is a separate task (B2).
    httpMock.expectNone('/api/company/withdrawal');
  });

  it('flushPendingSave does nothing when nothing has changed', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;
    expect(component.paymentForm.dirty).toBeFalse();
    expect(component.payoutForm.dirty).toBeFalse();

    component.flushPendingSave();

    httpMock.expectNone('/api/company/payments');
    httpMock.expectNone('/api/company/payout-account');
    httpMock.expectNone('/api/company/kyc');
    httpMock.expectNone('/api/company/withdrawal');
    httpMock.expectNone('/api/company/booking-emi');
  });

  it('flushPendingSave never saves the Withdrawal Approval card, even when it is dirty', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.setApprovalMode('AUTO_UNDER_LIMIT');
    expect(component.approvalMode).toBe('AUTO_UNDER_LIMIT');

    component.flushPendingSave();

    httpMock.expectNone('/api/company/withdrawal');
  });

  it('isStepValid is false while the payment or payout card has an invalid required field', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    expect(component.isStepValid()).toBeFalse(); // gateway/payout fields all start required-but-blank

    component.paymentForm.get('gateway')?.setValue('RAZORPAY');
    expect(component.isStepValid()).toBeFalse(); // payout fields are still blank

    component.payoutForm.patchValue({
      bankName: 'HDFC Bank',
      accountHolder: 'Plotchain Estates Pvt Ltd',
      accountNumber: '50100123456789',
      ifscCode: 'HDFC0001234'
    });
    expect(component.isStepValid()).toBeTrue();

    component.flushPendingSave();
    httpMock.expectOne('/api/company/payments').flush({ ...emptyPaymentConfig, gateway: 'RAZORPAY' });
    httpMock.expectOne('/api/company/payout-account').flush({ ...emptyPayoutAccount, ifscCode: 'HDFC0001234' });
    // See the comment in the flushPendingSave test above -- only the most recent setup-state
    // refetch survives switchMap's cancellation of the earlier one.
    httpMock.match('/api/company/setup-state').forEach(req => {
      if (!req.cancelled) {
        req.flush(setupState);
      }
    });
  });

  it('does not fire a duplicate payment save when its debounce elapses after flushPendingSave already saved the same edit', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.paymentForm.get('gateway')?.setValue('RAZORPAY');
    component.flushPendingSave();
    httpMock.expectOne('/api/company/payments').flush({ ...emptyPaymentConfig, gateway: 'RAZORPAY' });
    flushSetupState();
    expect(component.paymentForm.dirty).toBeFalse();

    tick(400);
    httpMock.expectNone('/api/company/payments');
  }));

  it('re-marks paymentForm dirty when a flush-triggered payment save fails, so the next flush retries it', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.paymentForm.get('gateway')?.setValue('RAZORPAY');
    component.flushPendingSave();
    httpMock.expectOne('/api/company/payments').flush(
      { error: 'validation failed', fields: { gateway: 'unsupported gateway' } },
      { status: 400, statusText: 'Bad Request' }
    );
    expect(component.paymentForm.dirty).toBeTrue();

    component.flushPendingSave();
    const retry = httpMock.expectOne('/api/company/payments');
    expect(retry.request.body).toEqual({ gateway: 'RAZORPAY', modesEnabled: [] });
    retry.flush({ ...emptyPaymentConfig, gateway: 'RAZORPAY' });
    flushSetupState();
  });

  it('re-marks payoutForm dirty when a flush-triggered payout save fails, so the next flush retries it', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.payoutForm.patchValue({
      bankName: 'HDFC Bank',
      accountHolder: 'Plotchain Estates Pvt Ltd',
      accountNumber: '50100123456789',
      ifscCode: 'HDFC0001234'
    });
    component.flushPendingSave();
    httpMock.expectOne('/api/company/payout-account').flush(
      { error: 'validation failed', fields: { ifscCode: 'bank rejected this IFSC' } },
      { status: 400, statusText: 'Bad Request' }
    );
    expect(component.payoutForm.dirty).toBeTrue();

    component.flushPendingSave();
    const retry = httpMock.expectOne('/api/company/payout-account');
    expect(retry.request.body.ifscCode).toBe('HDFC0001234');
    retry.flush({ ...emptyPayoutAccount, ifscCode: 'HDFC0001234' });
    flushSetupState();
  });

  it('re-marks kycDirty when a flush-triggered KYC save fails, so the next flush retries it', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.toggleDocument('AADHAAR', false);
    component.flushPendingSave();
    httpMock.expectOne('/api/company/kyc').flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });

    // kycDirty is private; observe the re-dirty indirectly through a second flush retrying.
    component.flushPendingSave();
    const retry = httpMock.expectOne('/api/company/kyc');
    expect(retry.request.body).toEqual({ strictness: 'STRICT', requiredDocuments: ['PAN', 'BANK_PASSBOOK'] });
    retry.flush({ ...defaultKycConfig, requiredDocuments: ['PAN', 'BANK_PASSBOOK'] });
    flushSetupState();
  });

  it('re-marks bookingEmiDirty when a flush-triggered booking-EMI save fails, so the next flush retries it', () => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.setConfirmRule('KYC_GATED');
    component.flushPendingSave();
    httpMock.expectOne('/api/company/booking-emi').flush(
      { error: 'confirm threshold percent must be a positive value' },
      { status: 409, statusText: 'Conflict' }
    );

    // bookingEmiDirty is private; observe the re-dirty indirectly through a second flush retrying.
    component.flushPendingSave();
    const retry = httpMock.expectOne('/api/company/booking-emi');
    expect(retry.request.body.confirmRule).toBe('KYC_GATED');
    retry.flush({ ...defaultBookingEmiConfig, confirmRule: 'KYC_GATED' });
    flushSetupState();
  });
});
