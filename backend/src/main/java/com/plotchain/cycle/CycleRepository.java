package com.plotchain.cycle;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

public interface CycleRepository extends JpaRepository<Cycle, UUID> {
    Optional<Cycle> findFirstByStatusOrderByPeriodStartDesc(CycleStatus status);

    // Admin Stats "Cycles Completed" tile: count of cycles in any of the given statuses
    // (CLOSED + PAID, i.e. finished their lifecycle -- not OPEN/CALCULATING).
    long countByStatusIn(Collection<CycleStatus> statuses);

    // Admin cycle-history list, unfiltered: most recent period first.
    Page<Cycle> findAllByOrderByPeriodStartDesc(Pageable pageable);

    // Admin cycle-history list, narrowed by the optional ?status= filter.
    Page<Cycle> findByStatusOrderByPeriodStartDesc(CycleStatus status, Pageable pageable);

    // Row-lock acquisition for POST /close (cycle-management unit 3, Decision #2 of
    // docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md):
    // must be the FIRST statement inside CycleService.close()'s @Transactional method, and
    // its result doubles as the 404 check (empty Optional -> no separate pre-transaction
    // read needed). A second concurrent call against the same id blocks here -- a Postgres
    // row lock, not application code -- until the first transaction commits or rolls back.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Cycle c WHERE c.id = :id")
    Optional<Cycle> findByIdForUpdate(@Param("id") UUID id);
}
