package com.plotchain.cycle;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CycleRepository extends JpaRepository<Cycle, UUID> {
    Optional<Cycle> findFirstByStatusOrderByPeriodStartDesc(CycleStatus status);

    // Admin cycle-history list, unfiltered: most recent period first.
    Page<Cycle> findAllByOrderByPeriodStartDesc(Pageable pageable);

    // Admin cycle-history list, narrowed by the optional ?status= filter.
    Page<Cycle> findByStatusOrderByPeriodStartDesc(CycleStatus status, Pageable pageable);
}
