package com.plotchain.associate;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
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

    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.last_active_at >= :sinceDate
        """, nativeQuery = true)
    long countActiveToday(@Param("associateId") UUID associateId, @Param("sinceDate") LocalDate sinceDate);

    // :end is treated as an EXCLUSIVE upper bound (the day after the last day to include).
    // joined_at is a TIMESTAMP; a BETWEEN against a LocalDate coerces the upper bound to
    // midnight and silently drops same-day joins on the period's last day. Callers must pass
    // the day *after* the last day to include (e.g. cycle.getPeriodEnd().plusDays(1)).
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline dl JOIN associate a2 ON a2.id = dl.id
        WHERE a2.joined_at >= :start AND a2.joined_at < :end
        """, nativeQuery = true)
    long countJoinedBetween(@Param("associateId") UUID associateId, @Param("start") LocalDate start, @Param("end") LocalDate end);

    Optional<Associate> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByParentIdAndPosition(UUID parentId, String position);

    Optional<Associate> findByUserId(String userId);

    boolean existsByUserId(String userId);

    // Used to generate the next associate ID (e.g. VP00001 -> VP00002). Zero-padded fixed-width
    // suffixes make string-descending order equal numeric order, so this needs no native SQL.
    Optional<Associate> findTopByUserIdStartingWithOrderByUserIdDesc(String prefix);

    List<Associate> findByRoleNotOrderByUserIdAsc(AssociateRole role);

    // Backs the parent-picker dropdown on the Create Associate form: admins pick a parent by
    // its human-readable userId (e.g. VP00001), not the UUID primary key they never see.
    List<Associate> findAllByOrderByUserIdAsc();

    long countByRoleNot(AssociateRole role);

    long countByRoleAndKycStatus(AssociateRole role, KycStatus kycStatus);

    // role = ASSOCIATE narrows out admin-family rows, which also have parentId = null by
    // construction (AdminProvisioningService never sets it). sponsorId IS NULL narrows out
    // ordinary associates placed via the generic provisioning endpoint without a parent. Together
    // these identify root associates -- Associate rows seeded at the top of the binary tree.
    List<Associate> findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole role);

    Optional<Associate> findByIdAndRole(UUID id, AssociateRole role);

    Page<Associate> findByRoleAndKycStatusOrderByJoinedAtAsc(AssociateRole role, KycStatus kycStatus, Pageable pageable);

    long countByParentId(UUID parentId);

    List<Associate> findByParentId(UUID parentId);

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

    // All five filters are optional (null = "don't filter on this"). Scoped to role = ASSOCIATE
    // only -- this is the associate network directory, not the Admin Team staff roster.
    // joinedToExclusive is an EXCLUSIVE upper bound, same convention as countJoinedBetween above:
    // callers pass the day *after* the last day to include.
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
