import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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

@Injectable({ providedIn: 'root' })
export class PaymentsKycService {
  constructor(private http: HttpClient) {}

  getPaymentConfig(): Observable<PaymentConfigResponse> {
    return this.http.get<PaymentConfigResponse>('/api/company/payments');
  }

  updatePaymentConfig(request: PaymentConfigRequest): Observable<PaymentConfigResponse> {
    return this.http.put<PaymentConfigResponse>('/api/company/payments', request);
  }

  getPayoutAccount(): Observable<PayoutBankAccountResponse> {
    return this.http.get<PayoutBankAccountResponse>('/api/company/payout-account');
  }

  updatePayoutAccount(request: PayoutBankAccountRequest): Observable<PayoutBankAccountResponse> {
    return this.http.put<PayoutBankAccountResponse>('/api/company/payout-account', request);
  }

  getKycConfig(): Observable<KycConfigResponse> {
    return this.http.get<KycConfigResponse>('/api/company/kyc');
  }

  updateKycConfig(request: KycConfigRequest): Observable<KycConfigResponse> {
    return this.http.put<KycConfigResponse>('/api/company/kyc', request);
  }

  getWithdrawalConfig(): Observable<WithdrawalConfigResponse> {
    return this.http.get<WithdrawalConfigResponse>('/api/company/withdrawal');
  }

  updateWithdrawalConfig(request: WithdrawalConfigRequest): Observable<WithdrawalConfigResponse> {
    return this.http.put<WithdrawalConfigResponse>('/api/company/withdrawal', request);
  }
}
