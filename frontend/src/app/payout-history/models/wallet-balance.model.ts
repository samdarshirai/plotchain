// frontend/src/app/payout-history/models/wallet-balance.model.ts
// Mirrors backend/src/main/java/com/plotchain/wallet/WalletBalanceResponse.java (wallet/withdrawal
// unit 2) -- a bare balance, no associateId, since GET /api/associates/me/wallet is always scoped
// to the caller.
export interface WalletBalance {
  balance: number;
}
