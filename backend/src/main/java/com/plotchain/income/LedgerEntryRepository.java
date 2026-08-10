package com.plotchain.income;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.UUID;

public interface LedgerEntryRepository extends JpaRepository<LedgerEntry, UUID> {

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.cycleId = :cycleId AND l.incomeType = :type")
    BigDecimal sumNetAmountByAssociateCycleAndType(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId, @Param("type") IncomeType type);

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.associateId = :associateId AND l.cycleId = :cycleId")
    BigDecimal sumNetAmountByAssociateAndCycle(@Param("associateId") UUID associateId, @Param("cycleId") UUID cycleId);

    // Company-wide siblings of the per-associate sums above, for AdminStatsService: same JPQL
    // shape minus the associateId filter.
    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.cycleId = :cycleId AND l.incomeType = :type")
    BigDecimal sumNetAmountByCycleAndType(@Param("cycleId") UUID cycleId, @Param("type") IncomeType type);

    @Query("SELECT COALESCE(SUM(l.netAmount), 0) FROM LedgerEntry l WHERE l.cycleId = :cycleId")
    BigDecimal sumNetAmountByCycle(@Param("cycleId") UUID cycleId);

    // Decision #12's idempotency check: called before every write the settlement batch makes.
    // A plain Spring Data derived query -- the unique constraint added by V17 is the DB-level
    // backstop this check is meant to make redundant, never the other way around.
    boolean existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
        UUID associateId, UUID cycleId, IncomeType incomeType, UUID sourceRef);
}
