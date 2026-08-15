package com.plotchain.wallet;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {

    @Query("SELECT COALESCE(SUM(w.balance), 0) FROM Wallet w")
    BigDecimal sumAllBalances();

    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 5): atomic UPDATE, not JPA dirty-checking. Wallet has no @Version column, so a
    // plain find->mutate->save round trip is a lost-update race between two concurrent operations
    // touching the same associate's wallet (e.g. two different cycles' crediting runs, or a
    // crediting run overlapping a withdrawal-request debit). Returns 0 affected rows if no Wallet
    // row exists yet for this associate -- callers that need a row to exist first (a first-time
    // associate) must create one via Wallet.zero(...) before calling this. Deliberately generic
    // (associateId + amount only) -- reused unmodified by unit 4's KYC reconciliation sweep and
    // unit 7's reject/cancel refund.
    @Modifying
    @Query("UPDATE Wallet w SET w.balance = w.balance + :amount WHERE w.associateId = :associateId")
    int creditBalance(@Param("associateId") UUID associateId, @Param("amount") BigDecimal amount);
}
