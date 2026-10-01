package com.plotchain.epin;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EPinRepository extends JpaRepository<EPin, UUID> {

    // epin-domain unit 1 (Decision 3): defensive collision re-check for EPinService's
    // generation loop. The DB-level UNIQUE constraint on code (migration V33) is the real guarantee.
    boolean existsByCode(String code);

    // All filters optional (null = don't filter). Same null-safe "(:param IS NULL OR ...)" shape
    // as LedgerEntryRepository.search; UUID/enum/boolean params need no Postgres CAST workaround.
    @Query("""
        SELECT e FROM EPin e
        WHERE (:status IS NULL OR e.status = :status)
        AND (:redeemedTo IS NULL OR e.redeemedTo = :redeemedTo)
        AND (:batchId IS NULL OR e.batchId = :batchId)
        AND (:allocatedTo IS NULL OR e.allocatedTo = :allocatedTo)
        AND (:expiredOnly = FALSE OR (
              e.expiresAt IS NOT NULL AND e.expiresAt <= :now
              AND e.status IN (com.plotchain.epin.EPinStatus.UNUSED, com.plotchain.epin.EPinStatus.ALLOCATED)))
        ORDER BY e.generatedAt DESC, e.id
        """)
    Page<EPin> search(
        @Param("status") EPinStatus status,
        @Param("redeemedTo") UUID redeemedTo,
        @Param("batchId") UUID batchId,
        @Param("allocatedTo") UUID allocatedTo,
        @Param("expiredOnly") boolean expiredOnly,
        @Param("now") Instant now,
        Pageable pageable);

    @Query("""
        SELECT e FROM EPin e
        WHERE (e.allocatedTo = :me OR e.redeemedTo = :me OR e.redeemedBy = :me)
        AND (:status IS NULL OR e.status = :status)
        ORDER BY e.generatedAt DESC, e.id
        """)
    Page<EPin> searchForAssociate(@Param("me") UUID me, @Param("status") EPinStatus status, Pageable pageable);

    // Row lock for every state transition (redeem/transfer/allocate/block/unblock): two
    // simultaneous requests on one pin serialise here, so the second sees the mutated status.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
        SELECT e FROM EPin e
        WHERE e.status = com.plotchain.epin.EPinStatus.UNUSED
        AND (e.expiresAt IS NULL OR e.expiresAt > :now)
        AND (:batchId IS NULL OR e.batchId = :batchId)
        ORDER BY e.generatedAt, e.id
        """)
    List<EPin> findAllocatable(@Param("now") Instant now, @Param("batchId") UUID batchId, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM EPin e WHERE e.id = :id")
    Optional<EPin> findByIdForUpdate(@Param("id") UUID id);
}
