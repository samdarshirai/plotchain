package com.plotchain.compensation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CompensationPlanVersionRepository extends JpaRepository<CompensationPlanVersion, UUID> {

    // The version currently in effect as of the given date. Used by GET /api/company/compensation
    // and by DashboardService (Task 9).
    Optional<CompensationPlanVersion> findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate asOf);

    // The most recently CREATED version, regardless of its effective_from (which may be
    // future-dated). Used only by PUT (Task 5) to compute the next version_label.
    Optional<CompensationPlanVersion> findFirstByOrderByCreatedAtDesc();

    List<CompensationPlanVersion> findAllByOrderByEffectiveFromDesc();

    // idx_compensation_plan_version_effective_from (V8) allows at most one version per calendar
    // date. Used by PUT (Task 5) to reject a duplicate effective date with a clean domain
    // exception instead of letting the unique-index violation surface as a raw 500.
    boolean existsByEffectiveFrom(LocalDate effectiveFrom);
}
