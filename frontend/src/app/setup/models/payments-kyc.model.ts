export interface PaymentConfigResponse {
  gateway: string | null;
  credentialsConfigured: boolean;
  modesEnabled: string[];
  updatedAt: string | null;
}

// credentials is optional: blank/absent leaves the previously stored ciphertext untouched. See
// PaymentConfigRequest.credentials on the backend for why.
export type PaymentConfigRequest = Omit<PaymentConfigResponse, 'credentialsConfigured' | 'updatedAt'> & {
  credentials?: string;
};

export interface PayoutBankAccountResponse {
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  accountType: 'CURRENT' | 'SAVINGS' | null;
  updatedAt: string | null;
}

export type PayoutBankAccountRequest = Omit<PayoutBankAccountResponse, 'updatedAt'>;

export interface KycConfigResponse {
  strictness: 'STRICT' | 'RELAXED';
  requiredDocuments: string[];
  updatedAt: string | null;
}

export type KycConfigRequest = Omit<KycConfigResponse, 'updatedAt'>;

export interface WithdrawalConfigResponse {
  approvalMode: 'AUTO_UNDER_LIMIT' | 'ALWAYS_MANUAL';
  autoApproveLimit: number | null;
  updatedAt: string | null;
}

export type WithdrawalConfigRequest = Omit<WithdrawalConfigResponse, 'updatedAt'>;

export interface BookingEmiConfigResponse {
  emiEnabled: boolean;
  defaultInstallmentCount: number;
  confirmRule: 'AUTO_THRESHOLD' | 'MANUAL' | 'KYC_GATED';
  confirmThresholdPercent: number | null;
  updatedAt: string | null;
}

export type BookingEmiConfigRequest = Omit<BookingEmiConfigResponse, 'updatedAt'>;
