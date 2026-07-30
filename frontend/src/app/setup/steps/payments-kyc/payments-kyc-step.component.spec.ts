import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PaymentsKycStepComponent } from './payments-kyc-step.component';
import { SetupService } from '../../setup.service';
import {
  KycConfigResponse,
  PaymentConfigResponse,
  PayoutBankAccountResponse,
  WithdrawalConfigResponse
} from '../../models/payments-kyc.model';

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
    updatedAt: null
  };

  function flushInitialLoads(
    payment = emptyPaymentConfig,
    payout = emptyPayoutAccount,
    kyc = defaultKycConfig,
    withdrawal = defaultWithdrawalConfig
  ): void {
    httpMock.expectOne('/api/company/payments').flush(payment);
    httpMock.expectOne('/api/company/payout-account').flush(payout);
    httpMock.expectOne('/api/company/kyc').flush(kyc);
    httpMock.expectOne('/api/company/withdrawal').flush(withdrawal);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentsKycStepComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentsKycStepComponent);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(SetupService);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads all four sections independently without triggering an autosave', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    expect(component.strictness).toBe('STRICT');
    expect(component.requiredDocuments).toEqual(['AADHAAR', 'PAN', 'BANK_PASSBOOK']);
    expect(component.approvalMode).toBe('ALWAYS_MANUAL');

    tick(500);
    httpMock.expectNone('/api/company/payments');
    httpMock.expectNone('/api/company/payout-account');
    httpMock.expectNone('/api/company/kyc');
    httpMock.expectNone('/api/company/withdrawal');
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

    httpMock.expectNone('/api/company/payout-account');
    httpMock.expectNone('/api/company/kyc');
    httpMock.expectNone('/api/company/withdrawal');
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
  }));

  it('autosaves the KYC section on a document toggle', fakeAsync(() => {
    flushInitialLoads();
    const component = fixture.componentInstance;

    component.toggleDocument('AADHAAR', false);
    tick(400);

    const req = httpMock.expectOne('/api/company/kyc');
    expect(req.request.body).toEqual({ strictness: 'STRICT', requiredDocuments: ['PAN', 'BANK_PASSBOOK'] });
    req.flush({ ...defaultKycConfig, requiredDocuments: ['PAN', 'BANK_PASSBOOK'] });
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

    expect(component.credentialsConfigured).toBe(true);
    expect(component.showCredentialsInput).toBe(false);
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
});
