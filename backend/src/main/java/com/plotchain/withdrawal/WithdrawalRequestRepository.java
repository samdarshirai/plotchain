package com.plotchain.withdrawal;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

// Wallet/withdrawal unit 5: this unit only needed save()/findById(), both inherited from
// JpaRepository.
//
// Wallet/withdrawal unit 6 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Approval queue -- GET /api/admin/withdrawals", Decision 14): search(...) below is the
// approval-queue query, deliberately built generically enough (a nullable associateId, exactly
// like LedgerEntryRepository.search) that unit 9's associate-self history endpoint can reuse it
// unmodified, passing the caller's own id where this unit passes the admin-supplied filter. Same
// null-safe "(:param IS NULL OR ...)" JPQL shape as LedgerEntryRepository.search /
// AssociateRepository.searchDirectory.
public interface WithdrawalRequestRepository extends JpaRepository<WithdrawalRequest, UUID> {

    @Query("""
        SELECT w FROM WithdrawalRequest w
        WHERE (:associateId IS NULL OR w.associateId = :associateId)
        AND (:status IS NULL OR w.status = :status)
        ORDER BY w.requestedAt DESC
        """)
    Page<WithdrawalRequest> search(
        @Param("associateId") UUID associateId,
        @Param("status") WithdrawalRequestStatus status,
        Pageable pageable);

    long countByStatus(WithdrawalRequestStatus status);
}
