package com.plotchain.associate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.UUID;

public interface AssociateRepository extends JpaRepository<Associate, UUID> {

    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId AND tenant_id = :tenantId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id WHERE a.tenant_id = :tenantId
        )
        SELECT count(*) FROM downline
        """, nativeQuery = true)
    long countDownline(@Param("associateId") UUID associateId, @Param("tenantId") UUID tenantId);

    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId AND tenant_id = :tenantId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id WHERE a.tenant_id = :tenantId
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.last_active_at >= :sinceDate
        """, nativeQuery = true)
    long countActiveToday(@Param("associateId") UUID associateId, @Param("tenantId") UUID tenantId, @Param("sinceDate") LocalDate sinceDate);

    // :end is treated as an EXCLUSIVE upper bound (the day after the last day to include).
    // joined_at is a TIMESTAMP; a BETWEEN against a LocalDate coerces the upper bound to
    // midnight and silently drops same-day joins on the period's last day. Callers must pass
    // the day *after* the last day to include (e.g. cycle.getPeriodEnd().plusDays(1)).
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId AND tenant_id = :tenantId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id WHERE a.tenant_id = :tenantId
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.joined_at >= :start AND a2.joined_at < :end
        """, nativeQuery = true)
    long countJoinedBetween(@Param("associateId") UUID associateId, @Param("tenantId") UUID tenantId, @Param("start") LocalDate start, @Param("end") LocalDate end);
}
