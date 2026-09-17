package com.plotchain.epin;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface EPinRepository extends JpaRepository<EPin, UUID> {

    // epin-domain unit 1 (Decision 3): defensive collision re-check for EPinService's
    // generation loop, mirroring AssociateIdGenerator.generate()'s own re-check. The DB-level
    // UNIQUE constraint on code (migration V33) is the real guarantee; this is belt-and-braces.
    boolean existsByCode(String code);

    // epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Decision 4, Flows "Admin register"): all three filters are optional (null = don't filter
    // on this). Same null-safe "(:param IS NULL OR ...)" derived-query shape as
    // LedgerEntryRepository.search -- status/redeemedTo/batchId are all pure-equality UUID/enum
    // comparisons, so (unlike AssociateRepository.searchDirectory's text/date-range filters) no
    // Postgres bind-parameter CAST workaround is needed: Hibernate resolves UUID- and
    // enum-typed parameters from their Java type alone, independent of the surrounding SQL
    // expression.
    @Query("""
        SELECT e FROM EPin e
        WHERE (:status IS NULL OR e.status = :status)
        AND (:redeemedTo IS NULL OR e.redeemedTo = :redeemedTo)
        AND (:batchId IS NULL OR e.batchId = :batchId)
        ORDER BY e.generatedAt DESC
        """)
    Page<EPin> search(
        @Param("status") EPinStatus status,
        @Param("redeemedTo") UUID redeemedTo,
        @Param("batchId") UUID batchId,
        Pageable pageable);
}
