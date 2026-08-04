package com.plotchain.cycle;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class CycleService {

    private final CycleRepository cycleRepository;

    public CycleService(CycleRepository cycleRepository) {
        this.cycleRepository = cycleRepository;
    }

    public CyclePageResponse list(CycleStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Cycle> result = status == null
            ? cycleRepository.findAllByOrderByPeriodStartDesc(pageable)
            : cycleRepository.findByStatusOrderByPeriodStartDesc(status, pageable);

        return new CyclePageResponse(
            result.getContent().stream().map(this::toSummary).toList(),
            page, size, result.getTotalElements());
    }

    // Cycle-management unit 3: POST /api/admin/cycles/{id}/close's transactional skeleton
    // (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch step 1). The FIRST statement acquires the row lock --
    // deliberately not a separate pre-transaction existence/status check -- so a second
    // concurrent call against the same id blocks here (a Postgres row lock, not application
    // code) until this transaction commits or rolls back, then re-reads status under its own
    // lock.
    //
    // Unit 4 (the settlement batch: leg-volume rollup, Matching, Sponsor Matching, Royalty,
    // Reward, ledger entries, the CALCULATING/CLOSED status flip, and reopening the next
    // cycle via cycleService.getOrOpenCurrent()) inserts its logic between the status check
    // below and the placeholder return, without changing this method's signature or
    // transaction boundary.
    @Transactional
    public CycleCloseResponse close(UUID id) {
        Cycle cycle = cycleRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new CycleNotFoundException(id));

        // "Closing a cycle that isn't OPEN is rejected" (this unit's title): the guard is
        // "not OPEN", not an enumeration of CLOSED/PAID. CALCULATING isn't reachable by any
        // code path in this codebase yet (only unit 4's batch will ever write it, always
        // inside this same locked transaction), but is rejected here too for the same reason.
        if (cycle.getStatus() != CycleStatus.OPEN) {
            throw new CycleAlreadyClosedException(cycle.getId());
        }

        // Placeholder: unit 4 replaces this line with the settlement batch.
        return new CycleCloseResponse(cycle.getId(), cycle.getStatus());
    }

    private CycleSummaryResponse toSummary(Cycle cycle) {
        return new CycleSummaryResponse(cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), cycle.getStatus());
    }
}
