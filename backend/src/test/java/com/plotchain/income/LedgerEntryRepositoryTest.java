package com.plotchain.income;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.rank.RankTier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Cycle-management unit 5 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
// Decision #12): proves the V17 migration's NOT NULL + UNIQUE constraint is actually live against
// the real H2 (MODE=PostgreSQL) test datasource, and proves the new existsBy... derived query
// resolves against real column values -- both properties a mocked repository can't exercise.
@DataJpaTest
@ActiveProfiles("test")
class LedgerEntryRepositoryTest {

    @Autowired
    LedgerEntryRepository ledgerEntryRepository;

    @Autowired
    TestEntityManager entityManager;

    private Associate seedAssociate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate associate = new Associate();
        UUID id = UUID.randomUUID();
        associate.setId(id);
        associate.setName("Test Associate");
        associate.setRankId(rank.getId());
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        entityManager.persist(associate);
        return associate;
    }

    private Cycle seedCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        entityManager.persist(cycle);
        return cycle;
    }

    private LedgerEntry newEntry(UUID associateId, UUID cycleId, IncomeType incomeType, UUID sourceRef) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setAssociateId(associateId);
        entry.setIncomeType(incomeType);
        entry.setCycleId(cycleId);
        entry.setGrossAmount(new BigDecimal("100.00"));
        entry.setTdsDeduction(new BigDecimal("5.00"));
        entry.setAdminDeduction(new BigDecimal("4.00"));
        entry.setNetAmount(new BigDecimal("91.00"));
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setSourceRef(sourceRef);
        entry.setCreatedAt(Instant.now());
        return entry;
    }

    @Test
    void existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRefReturnsTrueOnlyForAnExactTupleMatch() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID sourceRef = UUID.randomUUID();
        ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, sourceRef));

        assertThat(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            associate.getId(), cycle.getId(), IncomeType.MATCHING, sourceRef)).isTrue();
        // Different sourceRef -> no match, even for the same associate/cycle/type.
        assertThat(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            associate.getId(), cycle.getId(), IncomeType.MATCHING, UUID.randomUUID())).isFalse();
        // Different incomeType -> no match, even for the same sourceRef.
        assertThat(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            associate.getId(), cycle.getId(), IncomeType.DIRECT, sourceRef)).isFalse();
    }

    @Test
    void uniqueConstraintRejectsADuplicateAssociateCycleIncomeTypeSourceRefTuple() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID sourceRef = UUID.randomUUID();
        ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, sourceRef));

        assertThatThrownBy(() ->
            ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, sourceRef)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void notNullConstraintRejectsANullSourceRef() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();

        assertThatThrownBy(() ->
            ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, null)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
