package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
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
