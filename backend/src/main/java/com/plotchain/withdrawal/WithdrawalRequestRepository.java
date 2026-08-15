package com.plotchain.withdrawal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Wallet/withdrawal unit 5: this unit only needs save()/findById(), both inherited from
// JpaRepository. search(associateId, status, Pageable) -- the approval-queue/history query -- is
// unit 6's addition (units file, Excluded section: "a standalone repository query method unit...
// not an observable outcome on its own; built as part of unit 6 and reused unmodified by unit
// 9"), deliberately not added here ahead of need.
public interface WithdrawalRequestRepository extends JpaRepository<WithdrawalRequest, UUID> {
}
