package com.plotchain.associate;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AssociateRepository extends JpaRepository<Associate, UUID> {

    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline
        """, nativeQuery = true)
    long countDownline(@Param("associateId") UUID associateId);

    // Network Growth chart's per-cycle cumulative downline size (dashboard-mockup spec §3.1):
    // same recursive-CTE shape as countDownline, with an exclusive upper bound on joined_at so
    // a cycle's point reflects "who was already in the downline by that cycle's close".
    // cutoffExclusive is the day AFTER that cycle's periodEnd (see DashboardService, which
    // computes it as cycle.getPeriodEnd().plusDays(1)).
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.joined_at < :cutoffExclusive
        """, nativeQuery = true)
    long countDownlineJoinedBefore(@Param("associateId") UUID associateId, @Param("cutoffExclusive") Instant cutoffExclusive);

    // KYC network summary bar (dashboard-mockup spec §3.1): downline-scoped KYC status counts,
    // same recursive-CTE shape as countDownline above but filtered on kyc_status instead.
    // kycStatus is passed as its enum .name() (String), not the enum itself -- nativeQuery=true
    // bypasses Hibernate's enum-to-JDBC-type resolution, the same reason findAncestorChainIds
    // above casts its UUID column to VARCHAR rather than trusting driver-specific type mapping.
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.kyc_status = :kycStatus
        """, nativeQuery = true)
    long countDownlineByKycStatus(@Param("associateId") UUID associateId, @Param("kycStatus") String kycStatus);

    Optional<Associate> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByParentIdAndPosition(UUID parentId, String position);

    Optional<Associate> findByUserId(String userId);

    boolean existsByUserId(String userId);

    // Used to generate the next associate ID (e.g. VP00001 -> VP00002). Zero-padded fixed-width
    // suffixes make string-descending order equal numeric order, so this needs no native SQL.
    Optional<Associate> findTopByUserIdStartingWithOrderByUserIdDesc(String prefix);

    // Backs the parent-picker dropdown on the Create Associate form: admins pick a parent by
    // its human-readable userId (e.g. VP00001), not the UUID primary key they never see.
    List<Associate> findAllByOrderByUserIdAsc();

    long countByRoleAndKycStatus(AssociateRole role, KycStatus kycStatus);

    long countByRole(AssociateRole role);

    // Company-wide join-count for AdminStatsService: not scoped to a single associate's
    // downline, and takes Instant to mirror searchDirectory's exclusive-upper-bound convention
    // (see that method's comment below).
    @Query("""
        SELECT COUNT(a) FROM Associate a
        WHERE a.role = :role AND a.joinedAt >= :start AND a.joinedAt < :end
        """)
    long countByRoleAndJoinedBetween(@Param("role") AssociateRole role, @Param("start") Instant start, @Param("end") Instant end);

    // Admin Dashboard rebuild's Network Growth chart (2026-08-23-admin-dashboard-mockup-design.md
    // §3.1): the org-wide sibling of countByRoleAndJoinedBetween above, unscoped by parent/sponsor
    // -- the admin dashboard has no single caller's downline to chart, unlike
    // AssociateRepository#countDownlineJoinedBefore on the associate side. cutoffExclusive is the
    // day AFTER a cycle's periodEnd, same exclusive-upper-bound convention as every other
    // cutoff in this repository.
    @Query("""
        SELECT COUNT(a) FROM Associate a
        WHERE a.role = :role AND a.joinedAt < :cutoffExclusive
        """)
    long countByRoleAndJoinedBefore(@Param("role") AssociateRole role, @Param("cutoffExclusive") Instant cutoffExclusive);

    Optional<Associate> findByIdAndRole(UUID id, AssociateRole role);

    // KYC-queue list query for KycReviewService.list(). AssociateProvisioningService sets
    // kycStatus = PENDING at account-creation time, before any document upload, so a plain
    // status filter alone (the old findByRoleAndKycStatusOrderByJoinedAtAsc) surfaced
    // freshly-provisioned zero-document associates in the "Pending" review queue,
    // indistinguishable from one actually awaiting review. The EXISTS subquery against
    // AssociateKycDocument (no JPA relationship mapped between the two entities -- see
    // AssociateKycDocument) excludes those. No relation to decide()'s own document-count
    // handling: decide() intentionally has no document-count guard, this only filters what
    // shows up in the queue.
    @Query("""
        SELECT a FROM Associate a
        WHERE a.role = :role AND a.kycStatus = :kycStatus
        AND EXISTS (SELECT 1 FROM AssociateKycDocument d WHERE d.associateId = a.id)
        ORDER BY a.joinedAt ASC
        """)
    Page<Associate> findByRoleAndKycStatusWithDocumentsOrderByJoinedAtAsc(
        @Param("role") AssociateRole role, @Param("kycStatus") KycStatus kycStatus, Pageable pageable);

    long countByParentId(UUID parentId);

    List<Associate> findByParentId(UUID parentId);

    // Cycle-management unit 7 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #9): Sponsor Matching's per-sponsor sponsee lookup -- mirrors findByParentId's
    // shape exactly, but walks the sponsorship graph (sponsor_id), not the binary placement tree
    // (parent_id). The two are independent relationships on the same Associate row; a sponsor's
    // direct sponsees are not necessarily their binary-tree children.
    List<Associate> findBySponsorId(UUID sponsorId);

    // Walks UP from a target associate to the root of its binary-tree branch. depth 0 is the
    // target itself; each step further out is +1. ORDER BY depth DESC puts the root first and
    // the target last -- root-to-target inclusive, the order the UI expands top-down.
    //
    // Returns String, not UUID: a bare native scalar query (no owning entity / result-set
    // mapping) leaves Hibernate to trust whatever the JDBC driver's getObject() hands back for
    // the column. Postgres's driver returns a java.util.UUID for a uuid column, so a List<UUID>
    // return type works there -- but H2's driver returns a raw byte[] for this same query shape,
    // which Spring's ConversionService has no byte[]->UUID converter for, so it blows up with
    // ConverterNotFoundException in tests (H2-backed) despite being fine in production
    // (Postgres-backed). Casting to VARCHAR sidesteps the driver-specific object mapping
    // entirely and is standard SQL that behaves identically on both databases; findAncestorChain
    // below parses the canonical UUID text form back into UUID in Java. Do not "simplify" this
    // back to List<UUID> on the native query -- it will pass on Postgres and fail on H2.
    @Query(value = """
        WITH RECURSIVE ancestors(id, parent_id, depth) AS (
            SELECT id, parent_id, 0 FROM associate WHERE id = :associateId
            UNION ALL
            SELECT a.id, a.parent_id, anc.depth + 1
            FROM associate a JOIN ancestors anc ON a.id = anc.parent_id
        )
        SELECT CAST(id AS VARCHAR) FROM ancestors ORDER BY depth DESC
        """, nativeQuery = true)
    List<String> findAncestorChainIds(@Param("associateId") UUID associateId);

    default List<UUID> findAncestorChain(UUID associateId) {
        return findAncestorChainIds(associateId).stream().map(UUID::fromString).toList();
    }

    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales"): the associate's own sales plus
    // their full descendant subtree, for SaleService.getMySales() to filter Sale rows by.
    //
    // Base case is id = :associateId, not parent_id = :associateId like countDownline above --
    // this list must include the caller's own sales too, not just descendants'.
    //
    // Returns String, not UUID, cast via CAST(id AS VARCHAR): the same H2-vs-Postgres driver
    // reasoning as findAncestorChainIds above -- a bare native scalar query leaves Hibernate to
    // trust whatever the JDBC driver's getObject() hands back for the column, and H2's driver
    // returns a raw byte[] for a uuid column where Postgres's returns java.util.UUID, blowing
    // up with ConverterNotFoundException in H2-backed tests only. CAST to VARCHAR sidesteps the
    // driver-specific mapping and is standard SQL on both databases; the default method below
    // parses the canonical UUID text form back into UUID in Java. Do not "simplify" this back to
    // List<UUID> on the native query -- it will pass on Postgres and fail on H2.
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT CAST(id AS VARCHAR) FROM downline
        """, nativeQuery = true)
    List<String> findSelfAndDownlineIds(@Param("associateId") UUID associateId);

    default List<UUID> findSelfAndDownline(UUID associateId) {
        return findSelfAndDownlineIds(associateId).stream().map(UUID::fromString).toList();
    }

    // All five filters are optional (null = "don't filter on this"). Scoped to role = ASSOCIATE
    // only -- this is the associate network directory, not the Admin Team staff roster.
    // joinedToExclusive is an EXCLUSIVE upper bound: callers pass the day *after* the last day
    // to include.
    // Postgres prepares this statement once and must assign every bind parameter a static type
    // up front, before it knows whether the value is actually null at runtime. Left untyped:
    // :search (String) inside CONCAT resolves to bytea, and LOWER(bytea) has no overload
    // ("function lower(bytea) does not exist"); :joinedFrom/:joinedToExclusive (Instant), used
    // only in a bare "? IS NULL" check with no adjoining comparison at that position, can't be
    // inferred at all ("could not determine data type of parameter"). H2 (used by this
    // repository's tests) infers types from context either way and never hits this -- only real
    // Postgres does. Explicit CASTs fix each bind's static type regardless of the runtime value.
    // :rankId/:kycStatus/:status don't need this: Hibernate resolves UUID- and enum-typed
    // parameters from their Java type alone, independent of the surrounding SQL expression.
    @Query("""
        SELECT a FROM Associate a
        WHERE a.role = com.plotchain.associate.AssociateRole.ASSOCIATE
        AND (:search IS NULL OR LOWER(a.name) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%'))
             OR LOWER(a.userId) LIKE LOWER(CONCAT('%', CAST(:search AS string), '%')))
        AND (:rankId IS NULL OR a.rankId = :rankId)
        AND (:kycStatus IS NULL OR a.kycStatus = :kycStatus)
        AND (:status IS NULL OR a.status = :status)
        AND (CAST(:joinedFrom AS timestamp) IS NULL OR a.joinedAt >= :joinedFrom)
        AND (CAST(:joinedToExclusive AS timestamp) IS NULL OR a.joinedAt < :joinedToExclusive)
        ORDER BY a.userId ASC
        """)
    Page<Associate> searchDirectory(
        @Param("search") String search,
        @Param("rankId") UUID rankId,
        @Param("kycStatus") KycStatus kycStatus,
        @Param("status") AssociateStatus status,
        @Param("joinedFrom") Instant joinedFrom,
        @Param("joinedToExclusive") Instant joinedToExclusive,
        Pageable pageable);
}
