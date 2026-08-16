import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PaymentsKycService } from './payments-kyc.service';
import {
  KycConfigRequest,
  KycConfigResponse,
  PaymentConfigRequest,
  PaymentConfigResponse,
  PayoutBankAccountRequest,
  PayoutBankAccountResponse,
  WithdrawalConfigRequest,
  WithdrawalConfigResponse
} from '../../models/payments-kyc.model';

describe('PaymentsKycService', () => {
  let service: PaymentsKycService;
  let httpMock: HttpTestingController;

  const paymentConfig: PaymentConfigResponse = {
    gateway: 'RAZORPAY',
    credentialsConfigured: true,
    modesEnabled: ['CARDS', 'UPI'],
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const payoutAccount: PayoutBankAccountResponse = {
    bankName: 'HDFC Bank',
    accountHolder: 'Plotchain Estates Pvt Ltd',
    accountNumber: '50100123456789',
    ifscCode: 'HDFC0001234',
    accountType: 'CURRENT',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const kycConfig: KycConfigResponse = {
    strictness: 'STRICT',
    requiredDocuments: ['AADHAAR', 'PAN', 'BANK_PASSBOOK'],
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const withdrawalConfig: WithdrawalConfigResponse = {
    approvalMode: 'AUTO_UNDER_LIMIT',
    autoApproveLimit: 25000,
    minimumWithdrawalAmount: 500,
    updatedAt: '2026-01-01T00:00:00Z'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [PaymentsKycService]
    });
    service = TestBed.inject(PaymentsKycService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches the payment config', () => {
    let result: PaymentConfigResponse | undefined;
    service.getPaymentConfig().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/payments');
    expect(req.request.method).toBe('GET');
    req.flush(paymentConfig);

    expect(result).toEqual(paymentConfig);
  });

  it('saves the payment config', () => {
    const request: PaymentConfigRequest = {
      gateway: 'RAZORPAY',
      modesEnabled: ['CARDS', 'UPI'],
      credentials: 'sk_live_x'
    };
    let result: PaymentConfigResponse | undefined;
    service.updatePaymentConfig(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/payments');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(paymentConfig);

    expect(result).toEqual(paymentConfig);
  });

  it('fetches the payout account', () => {
    let result: PayoutBankAccountResponse | undefined;
    service.getPayoutAccount().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/payout-account');
    expect(req.request.method).toBe('GET');
    req.flush(payoutAccount);

    expect(result).toEqual(payoutAccount);
  });

  it('saves the payout account', () => {
    const request: PayoutBankAccountRequest = {
      bankName: payoutAccount.bankName,
      accountHolder: payoutAccount.accountHolder,
      accountNumber: payoutAccount.accountNumber,
      ifscCode: payoutAccount.ifscCode,
      accountType: payoutAccount.accountType
    };
    let result: PayoutBankAccountResponse | undefined;
    service.updatePayoutAccount(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/payout-account');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(payoutAccount);

    expect(result).toEqual(payoutAccount);
  });

  it('fetches the KYC config', () => {
    let result: KycConfigResponse | undefined;
    service.getKycConfig().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/kyc');
    expect(req.request.method).toBe('GET');
    req.flush(kycConfig);

    expect(result).toEqual(kycConfig);
  });

  it('saves the KYC config', () => {
    const request: KycConfigRequest = {
      strictness: kycConfig.strictness,
      requiredDocuments: kycConfig.requiredDocuments
    };
    let result: KycConfigResponse | undefined;
    service.updateKycConfig(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/kyc');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(kycConfig);

    expect(result).toEqual(kycConfig);
  });

  it('fetches the withdrawal config', () => {
    let result: WithdrawalConfigResponse | undefined;
    service.getWithdrawalConfig().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/withdrawal');
    expect(req.request.method).toBe('GET');
    req.flush(withdrawalConfig);

    expect(result).toEqual(withdrawalConfig);
  });

  it('saves the withdrawal config', () => {
    const request: WithdrawalConfigRequest = {
      approvalMode: withdrawalConfig.approvalMode,
      autoApproveLimit: withdrawalConfig.autoApproveLimit,
      minimumWithdrawalAmount: withdrawalConfig.minimumWithdrawalAmount
    };
    let result: WithdrawalConfigResponse | undefined;
    service.updateWithdrawalConfig(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/withdrawal');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(withdrawalConfig);

    expect(result).toEqual(withdrawalConfig);
  });
});
