package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class AssociateRepositoryTest {

    private static final String TEST_PASSWORD_HASH = "$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C";

    @Autowired
    AssociateRepository associateRepository;

    @Autowired
    RankTierRepository rankTierRepository;

    @Autowired
    org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager entityManager;

    @Test
    void countDownlineCountsAllDescendantsRegardlessOfDepth() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate root = newAssociate(null, null, rank.getId());
        Associate child = newAssociate(root.getId(), "L", rank.getId());
        Associate grandchild = newAssociate(child.getId(), "L", rank.getId());
        associateRepository.saveAll(java.util.List.of(root, child, grandchild));
        entityManager.flush();

        long count = associateRepository.countDownline(root.getId());

        assertThat(count).isEqualTo(2);
    }

    @Test
    void countJoinedBetweenIncludesAssociatesWhoJoinOnTheEndDate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        LocalDate start = LocalDate.now().minusDays(5);
        LocalDate end = LocalDate.now();

        Associate root = newAssociate(null, null, rank.getId());
        Associate lastDayJoiner = newAssociate(root.getId(), "L", rank.getId());
        lastDayJoiner.setJoinedAt(instantAt(end, LocalTime.of(23, 59, 59)));
        associateRepository.saveAll(java.util.List.of(root, lastDayJoiner));
        entityManager.flush();

        // Upper bound is exclusive by contract: callers pass the day AFTER the last day to
        // include (mirrors what DashboardService does with cycle.getPeriodEnd().plusDays(1)).
        long count = associateRepository.countJoinedBetween(root.getId(), start, end.plusDays(1));

        assertThat(count).isEqualTo(1);
    }

    @Test
    void findByEmailReturnsTheMatchingAssociate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate associate = newAssociate(null, null, rank.getId());
        associate.setEmail("jane@plotchain.test");
        associateRepository.save(associate);
        entityManager.flush();

        Optional<Associate> found = associateRepository.findByEmail("jane@plotchain.test");

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(associate.getId());
    }

    @Test
    void findByEmailReturnsEmptyForAnUnknownEmail() {
        Optional<Associate> found = associateRepository.findByEmail("nobody@plotchain.test");

        assertThat(found).isEmpty();
    }

    @Test
    void persistsAnAdminWithoutARank() {
        Associate admin = newAssociate(null, null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setRankId(null);
        admin.setMustChangePassword(true);
        associateRepository.save(admin);
        entityManager.flush();
        entityManager.clear();

        Associate found = associateRepository.findById(admin.getId()).orElseThrow();

        assertThat(found.getRankId()).isNull();
        assertThat(found.getRole()).isEqualTo(AssociateRole.ADMIN);
        assertThat(found.isMustChangePassword()).isTrue();
    }

    @Test
    void findByUserIdReturnsTheMatchingAssociate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate associate = newAssociate(null, null, rank.getId());
        associate.setUserId("VP00001");
        associateRepository.save(associate);
        entityManager.flush();

        Optional<Associate> found = associateRepository.findByUserId("VP00001");

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(associate.getId());
    }

    @Test
    void findByUserIdReturnsEmptyForAnUnknownUserId() {
        Optional<Associate> found = associateRepository.findByUserId("nobody");

        assertThat(found).isEmpty();
    }

    @Test
    void persistsAnAssociateWithNoEmail() {
        // Staff accounts created from the setup wizard (Company Settings -> Admin Team) carry
        // a user ID and no email at all -- email is now a contact field, not a credential.
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate staff = newAssociate(null, null, rank.getId());
        staff.setEmail(null);
        staff.setUserId("finance01");
        associateRepository.save(staff);
        entityManager.flush();
        entityManager.clear();

        Associate found = associateRepository.findById(staff.getId()).orElseThrow();

        assertThat(found.getEmail()).isNull();
        assertThat(found.getUserId()).isEqualTo("finance01");
    }

    @Test
    void findByIdAndRoleOnlyMatchesAssociateRoleRows() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate associate = persistAssociate("VP00001", "Jane", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        Associate admin = persistAssociate("admin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        assertThat(associateRepository.findByIdAndRole(associate.getId(), AssociateRole.ASSOCIATE)).isPresent();
        assertThat(associateRepository.findByIdAndRole(admin.getId(), AssociateRole.ASSOCIATE)).isEmpty();
    }

    @Test
    void countByParentIdCountsOnlyDirectChildren() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate parent = persistAssociate("VP00001", "Parent", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        Associate child = persistAssociate("VP00002", "Child", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        child.setParentId(parent.getId());
        Associate grandchild = persistAssociate("VP00003", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
        entityManager.flush();

        assertThat(associateRepository.countByParentId(parent.getId())).isEqualTo(1);
    }

    @Test
    void searchDirectoryFiltersBySearchRankKycStatusAndStatus() {
        RankTier rankA = persistRank("Sales Associate", 1);
        RankTier rankB = persistRank("Sales Executive", 2);
        persistAssociate("VP00001", "Jane Doe", AssociateRole.ASSOCIATE, rankA.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        persistAssociate("VP00002", "John Smith", AssociateRole.ASSOCIATE, rankB.getId(),
            KycStatus.PENDING, AssociateStatus.SUSPENDED, Instant.now());
        persistAssociate("admin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        Page<Associate> bySearch = associateRepository.searchDirectory(
            "jane", null, null, null, null, null, PageRequest.of(0, 20));
        assertThat(bySearch.getContent()).extracting(Associate::getUserId).containsExactly("VP00001");

        Page<Associate> byRank = associateRepository.searchDirectory(
            null, rankB.getId(), null, null, null, null, PageRequest.of(0, 20));
        assertThat(byRank.getContent()).extracting(Associate::getUserId).containsExactly("VP00002");

        Page<Associate> byKycStatus = associateRepository.searchDirectory(
            null, null, KycStatus.PENDING, null, null, null, PageRequest.of(0, 20));
        assertThat(byKycStatus.getContent()).extracting(Associate::getUserId).containsExactly("VP00002");

        Page<Associate> byStatus = associateRepository.searchDirectory(
            null, null, null, AssociateStatus.SUSPENDED, null, null, PageRequest.of(0, 20));
        assertThat(byStatus.getContent()).extracting(Associate::getUserId).containsExactly("VP00002");

        Page<Associate> noFilters = associateRepository.searchDirectory(
            null, null, null, null, null, null, PageRequest.of(0, 20));
        assertThat(noFilters.getContent()).extracting(Associate::getUserId)
            .containsExactlyInAnyOrder("VP00001", "VP00002");
    }

    @Test
    void searchDirectoryFiltersByJoinedDateRange() {
        RankTier rank = persistRank("Sales Associate", 1);
        Instant inRange = Instant.parse("2026-01-15T00:00:00Z");
        Instant outOfRange = Instant.parse("2026-02-15T00:00:00Z");
        persistAssociate("VP00001", "Jane", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, inRange);
        persistAssociate("VP00002", "John", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, outOfRange);
        entityManager.flush();

        Page<Associate> result = associateRepository.searchDirectory(
            null, null, null, null,
            Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-02-01T00:00:00Z"),
            PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Associate::getUserId).containsExactly("VP00001");
    }

    @Test
    void findAncestorChainReturnsRootToTargetInclusiveInOrder() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate root = persistAssociate("VP00001", "Root", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        Associate middle = persistAssociate("VP00002", "Middle", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        middle.setParentId(root.getId());
        Associate leaf = persistAssociate("VP00003", "Leaf", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        leaf.setParentId(middle.getId());
        entityManager.flush();

        List<UUID> chain = associateRepository.findAncestorChain(leaf.getId());

        assertThat(chain).containsExactly(root.getId(), middle.getId(), leaf.getId());
    }

    private RankTier persistRank(String name, int order) {
        RankTier rank = new RankTier(UUID.randomUUID(), name, order, BigDecimal.valueOf(5000));
        entityManager.persist(rank);
        return rank;
    }

    private Associate persistAssociate(String userId, String name, AssociateRole role, UUID rankId,
                                        KycStatus kycStatus, AssociateStatus status, Instant joinedAt) {
        Associate a = new Associate();
        a.setId(UUID.randomUUID());
        a.setUserId(userId);
        a.setName(name);
        a.setRole(role);
        a.setRankId(rankId);
        a.setKycStatus(kycStatus);
        a.setStatus(status);
        a.setJoinedAt(joinedAt);
        a.setPasswordHash("hash");
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setMustChangePassword(false);
        entityManager.persist(a);
        return a;
    }

    // Uses the JVM default zone (matching how the DATE query params below are interpreted
    // against the TIMESTAMP-without-timezone joined_at column) so the boundary lines up.
    private static Instant instantAt(LocalDate date, LocalTime time) {
        return date.atTime(time).atZone(ZoneId.systemDefault()).toInstant();
    }

    private Associate newAssociate(UUID parentId, String position, UUID rankId) {
        Associate a = new Associate();
        UUID id = UUID.randomUUID();
        a.setId(id);
        a.setParentId(parentId);
        a.setPosition(position);
        a.setName("Test Associate");
        a.setRankId(rankId);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setUserId("u-" + id);
        a.setEmail(id + "@test.local");
        a.setPasswordHash(TEST_PASSWORD_HASH);
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }
}
