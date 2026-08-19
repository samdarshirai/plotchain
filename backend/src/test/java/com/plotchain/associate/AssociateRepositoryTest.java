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
    void countDownlineByPositionCountsOnlyTheGivenLegRegardlessOfDepth() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate root = newAssociate(null, null, rank.getId());
        Associate leftChild = newAssociate(root.getId(), "L", rank.getId());
        Associate leftGrandchild = newAssociate(leftChild.getId(), "L", rank.getId());
        Associate rightChild = newAssociate(root.getId(), "R", rank.getId());
        associateRepository.saveAll(java.util.List.of(root, leftChild, leftGrandchild, rightChild));
        entityManager.flush();

        assertThat(associateRepository.countDownlineByPosition(root.getId(), "L")).isEqualTo(2);
        assertThat(associateRepository.countDownlineByPosition(root.getId(), "R")).isEqualTo(1);
    }

    @Test
    void countDownlineByPositionReturnsZeroWhenNoChildOccupiesThatPosition() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate root = newAssociate(null, null, rank.getId());
        Associate leftChild = newAssociate(root.getId(), "L", rank.getId());
        associateRepository.saveAll(java.util.List.of(root, leftChild));
        entityManager.flush();

        assertThat(associateRepository.countDownlineByPosition(root.getId(), "R")).isEqualTo(0);
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
        Associate admin = persistAssociate("testadmin", "Admin", AssociateRole.ADMIN, null,
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
        child.setPosition("L");
        Associate grandchild = persistAssociate("VP00003", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
        grandchild.setPosition("L");
        entityManager.flush();

        assertThat(associateRepository.countByParentId(parent.getId())).isEqualTo(1);
    }

    @Test
    void findBySponsorIdReturnsOnlyDirectSponseesNotTheWholeDownline() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate sponsor = persistAssociate("VP00001", "Sponsor", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        Associate directSponsee = persistAssociate("VP00002", "Direct Sponsee", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        directSponsee.setSponsorId(sponsor.getId());
        // indirectSponsee is sponsored BY directSponsee, not by sponsor -- one level removed on
        // the sponsorship graph, must NOT appear in sponsor's own findBySponsorId result even
        // though it's part of sponsor's wider organization.
        Associate indirectSponsee = persistAssociate("VP00003", "Indirect Sponsee", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        indirectSponsee.setSponsorId(directSponsee.getId());
        // unrelated has no sponsor at all.
        persistAssociate("VP00004", "Unrelated", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        List<Associate> found = associateRepository.findBySponsorId(sponsor.getId());

        assertThat(found).extracting(Associate::getId).containsExactly(directSponsee.getId());
    }

    @Test
    void findBySponsorIdReturnsEmptyWhenTheAssociateHasNoSponsees() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate lonely = persistAssociate("VP00001", "Lonely", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        assertThat(associateRepository.findBySponsorId(lonely.getId())).isEmpty();
    }

    @Test
    void searchDirectoryFiltersBySearchRankKycStatusAndStatus() {
        RankTier rankA = persistRank("Sales Associate", 1);
        RankTier rankB = persistRank("Sales Executive", 2);
        persistAssociate("VP00001", "Jane Doe", AssociateRole.ASSOCIATE, rankA.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        persistAssociate("VP00002", "John Smith", AssociateRole.ASSOCIATE, rankB.getId(),
            KycStatus.PENDING, AssociateStatus.SUSPENDED, Instant.now());
        persistAssociate("testadmin", "Admin", AssociateRole.ADMIN, null,
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

    // M2 fix: KycReviewService.list() used to query off kycStatus alone, so a freshly-provisioned
    // zero-document associate (kycStatus = PENDING from account creation, before any upload)
    // showed up in the "Pending" review queue indistinguishable from one actually awaiting
    // review. findByRoleAndKycStatusWithDocumentsOrderByJoinedAtAsc adds an EXISTS subquery
    // against AssociateKycDocument to exclude those.
    @Test
    void findByRoleAndKycStatusWithDocumentsOrderByJoinedAtAscExcludesAssociatesWithNoDocuments() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate withDocument = persistAssociate("VP00001", "Has Document", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        persistAssociate("VP00002", "No Document", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        persistKycDocument(withDocument.getId(), "PAN");
        entityManager.flush();

        Page<Associate> result = associateRepository.findByRoleAndKycStatusWithDocumentsOrderByJoinedAtAsc(
            AssociateRole.ASSOCIATE, KycStatus.PENDING, PageRequest.of(0, 20));

        // VP00002 has the same PENDING status but zero documents -- containsExactly proves it's
        // excluded, not merely that VP00001 is present.
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
        middle.setPosition("L");
        Associate leaf = persistAssociate("VP00003", "Leaf", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        leaf.setParentId(middle.getId());
        leaf.setPosition("L");
        entityManager.flush();

        List<UUID> chain = associateRepository.findAncestorChain(leaf.getId());

        assertThat(chain).containsExactly(root.getId(), middle.getId(), leaf.getId());
    }

    @Test
    void findSelfAndDownlineReturnsTheCallerPlusEveryDescendantExcludingSiblingsAncestorsAndUnrelated() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate root = persistAssociate("VP00001", "Root", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        Associate caller = persistAssociate("VP00002", "Caller", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        caller.setParentId(root.getId());
        caller.setPosition("L");
        Associate sibling = persistAssociate("VP00003", "Sibling", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        sibling.setParentId(root.getId());
        sibling.setPosition("R");
        Associate child = persistAssociate("VP00004", "Child", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        child.setParentId(caller.getId());
        child.setPosition("L");
        Associate grandchild = persistAssociate("VP00005", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
        grandchild.setPosition("L");
        Associate unrelated = persistAssociate("VP00006", "Unrelated", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        List<UUID> ids = associateRepository.findSelfAndDownline(caller.getId());

        // Includes the caller itself (base case is id = :associateId, not parent_id =
        // :associateId like countDownline) plus every descendant, however deep.
        assertThat(ids).containsExactlyInAnyOrder(caller.getId(), child.getId(), grandchild.getId());
        // Excludes the sibling (same parent, not a descendant), the ancestor (root), and an
        // unrelated associate in a different branch entirely.
        assertThat(ids).doesNotContain(root.getId(), sibling.getId(), unrelated.getId());
    }

    private AssociateKycDocument persistKycDocument(UUID associateId, String documentType) {
        AssociateKycDocument document = new AssociateKycDocument();
        document.setId(UUID.randomUUID());
        document.setAssociateId(associateId);
        document.setDocumentType(documentType);
        document.setContent(new byte[] {1, 2, 3});
        document.setContentType("image/png");
        document.setUploadedAt(Instant.now());
        entityManager.persist(document);
        return document;
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
