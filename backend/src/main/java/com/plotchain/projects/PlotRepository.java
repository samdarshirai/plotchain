package com.plotchain.projects;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlotRepository extends JpaRepository<Plot, UUID> {

    boolean existsByProjectId(UUID projectId);

    Page<Plot> findAllByProjectId(UUID projectId, Pageable pageable);

    Optional<Plot> findByIdAndProjectId(UUID id, UUID projectId);

    List<Plot> findAllByProjectIdAndPlotNoIn(UUID projectId, Collection<String> plotNos);

    long countByProjectId(UUID projectId);

    long countByProjectIdAndStatus(UUID projectId, PlotStatus status);

    // Row-lock acquisition for POST /api/admin/sales (code-review finding, pre-merge review of
    // sales unit 3: SaleService.recordSale read Plot via a plain unlocked findById before
    // checking status == AVAILABLE and flipping it to SOLD, so two concurrent requests against
    // the same plot could both pass the AVAILABLE check before either committed, double-selling
    // the plot and double-crediting its Direct Income ledger entry). Mirrors
    // CycleRepository.findByIdForUpdate (cycle-management unit 3): must be the FIRST statement
    // inside recordSale's @Transactional method, and its result doubles as the "plot not found"
    // check (empty Optional -> no separate pre-transaction read needed). A second concurrent
    // call against the same id blocks here -- a Postgres row lock, not application code -- until
    // the first transaction commits or rolls back.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM Plot p WHERE p.id = :id")
    Optional<Plot> findByIdForUpdate(@Param("id") UUID id);
}
