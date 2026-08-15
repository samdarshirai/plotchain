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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
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

    // Income/Ledger unit 1: rank_order carries a DB-level UNIQUE constraint (V1 migration), and
    // this unit's search(...) tests are the first callers to need two associates seeded in the
    // same test method -- a hardcoded rank_order of 1 on every call collides. Counting up per
    // invocation keeps every pre-existing single-seedAssociate()-call test byte-for-byte
    // unaffected (still gets rank_order = 1 as the first call in its own test method) while making
    // repeat calls within one test method safe.
    private int rankOrderCounter = 1;

    private Associate seedAssociate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", rankOrderCounter++, BigDecimal.valueOf(10000));
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

    // Cycle-management unit 9 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #8): Reward's own idempotency check, deliberately narrower than
    // existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef above -- omits cycleId entirely,
    // because a RewardTier is awarded once EVER, in whichever cycle first crosses it, not once
    // per cycle. This method has no cycleId parameter at all, so there is nothing for a caller in
    // a later cycle to (correctly or incorrectly) scope the check to -- proven by construction,
    // not just by this test's assertion.
    @Test
    void existsByAssociateIdAndIncomeTypeAndSourceRefFindsAnEntryRegardlessOfWhichCycleItWasCreditedIn() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID tierId = UUID.randomUUID();
        ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.REWARD, tierId));

        assertThat(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(
            associate.getId(), IncomeType.REWARD, tierId)).isTrue();
    }

    @Test
    void existsByAssociateIdAndIncomeTypeAndSourceRefReturnsFalseForADifferentTierOrIncomeType() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID tierId = UUID.randomUUID();
        ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.REWARD, tierId));

        // Different sourceRef (a different tier) -> no match, even for the same associate/type.
        assertThat(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(
            associate.getId(), IncomeType.REWARD, UUID.randomUUID())).isFalse();
        // Same sourceRef but a different incomeType -> no match, proving the type filter is real.
        assertThat(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(
            associate.getId(), IncomeType.ROYALTY, tierId)).isFalse();
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

    @Test
    void findByAssociateIdAndCycleIdAndIncomeTypeReturnsTheMatchingRowForThatExactTuple() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        LedgerEntry saved = ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, UUID.randomUUID()));

        Optional<LedgerEntry> found = ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(
            associate.getId(), cycle.getId(), IncomeType.MATCHING);

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(saved.getId());
    }

    @Test
    void findByAssociateIdAndCycleIdAndIncomeTypeReturnsEmptyWhenNoEntryOfThatIncomeTypeExists() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        // A DIRECT entry exists for this associate+cycle, but the caller is asking about MATCHING.
        ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), cycle.getId(), IncomeType.DIRECT, UUID.randomUUID()));

        Optional<LedgerEntry> found = ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(
            associate.getId(), cycle.getId(), IncomeType.MATCHING);

        assertThat(found).isEmpty();
    }

    // Sales unit 5 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", step 5): SaleService.voidSale needs to find the DIRECT LedgerEntry a
    // RECORDED sale created at record time (sourceRef = sale.id) so it can flip it to REVERSED.
    @Test
    void findBySourceRefReturnsTheMatchingEntry() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID sourceRef = UUID.randomUUID();
        LedgerEntry saved = ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), cycle.getId(), IncomeType.DIRECT, sourceRef));

        Optional<LedgerEntry> found = ledgerEntryRepository.findBySourceRef(sourceRef);

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(saved.getId());
    }

    @Test
    void findBySourceRefReturnsEmptyWhenNoEntryMatches() {
        assertThat(ledgerEntryRepository.findBySourceRef(UUID.randomUUID())).isEmpty();
    }

    // Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // Decision 4, Flow "Admin ledger register"): the shared search query both the admin and
    // (a follow-up unit's) associate-self endpoints use. All four filters are optional; this
    // test exercises each alone, in combination, and the unfiltered "everything" case.
    @Test
    void searchFiltersByAssociateIdIncomeTypeCycleIdAndStatusIndependentlyAndInCombination() {
        Associate associateA = seedAssociate();
        Associate associateB = seedAssociate();
        Cycle cycleA = seedCycle();
        Cycle cycleB = seedCycle();
        LedgerEntry direct = ledgerEntryRepository.saveAndFlush(
            newEntry(associateA.getId(), cycleA.getId(), IncomeType.DIRECT, UUID.randomUUID()));
        direct.setStatus(LedgerEntryStatus.PAID);
        ledgerEntryRepository.saveAndFlush(direct);
        LedgerEntry matching = ledgerEntryRepository.saveAndFlush(
            newEntry(associateA.getId(), cycleB.getId(), IncomeType.MATCHING, UUID.randomUUID()));
        LedgerEntry otherAssociate = ledgerEntryRepository.saveAndFlush(
            newEntry(associateB.getId(), cycleA.getId(), IncomeType.DIRECT, UUID.randomUUID()));

        Page<LedgerEntry> byAssociate = ledgerEntryRepository.search(
            associateA.getId(), null, null, null, PageRequest.of(0, 20));
        assertThat(byAssociate.getContent()).extracting(LedgerEntry::getId)
            .containsExactlyInAnyOrder(direct.getId(), matching.getId());

        Page<LedgerEntry> byIncomeType = ledgerEntryRepository.search(
            null, IncomeType.DIRECT, null, null, PageRequest.of(0, 20));
        assertThat(byIncomeType.getContent()).extracting(LedgerEntry::getId)
            .containsExactlyInAnyOrder(direct.getId(), otherAssociate.getId());

        Page<LedgerEntry> byCycleId = ledgerEntryRepository.search(
            null, null, cycleB.getId(), null, PageRequest.of(0, 20));
        assertThat(byCycleId.getContent()).extracting(LedgerEntry::getId).containsExactly(matching.getId());

        Page<LedgerEntry> byStatus = ledgerEntryRepository.search(
            null, null, null, LedgerEntryStatus.PAID, PageRequest.of(0, 20));
        assertThat(byStatus.getContent()).extracting(LedgerEntry::getId).containsExactly(direct.getId());

        Page<LedgerEntry> combined = ledgerEntryRepository.search(
            associateA.getId(), IncomeType.DIRECT, cycleA.getId(), LedgerEntryStatus.PAID, PageRequest.of(0, 20));
        assertThat(combined.getContent()).extracting(LedgerEntry::getId).containsExactly(direct.getId());

        Page<LedgerEntry> unfiltered = ledgerEntryRepository.search(
            null, null, null, null, PageRequest.of(0, 20));
        assertThat(unfiltered.getTotalElements()).isEqualTo(3);
    }

    @Test
    void searchOrdersByCreatedAtDescendingAndPaginatesCorrectly() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        LedgerEntry earlier = newEntry(associate.getId(), cycle.getId(), IncomeType.DIRECT, UUID.randomUUID());
        earlier.setCreatedAt(Instant.parse("2026-01-10T00:00:00Z"));
        ledgerEntryRepository.saveAndFlush(earlier);
        LedgerEntry later = newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, UUID.randomUUID());
        later.setCreatedAt(Instant.parse("2026-01-20T00:00:00Z"));
        ledgerEntryRepository.saveAndFlush(later);
        LedgerEntry latest = newEntry(associate.getId(), cycle.getId(), IncomeType.ROYALTY, UUID.randomUUID());
        latest.setCreatedAt(Instant.parse("2026-01-30T00:00:00Z"));
        ledgerEntryRepository.saveAndFlush(latest);

        Page<LedgerEntry> firstPage = ledgerEntryRepository.search(null, null, null, null, PageRequest.of(0, 2));
        assertThat(firstPage.getContent()).extracting(LedgerEntry::getId)
            .containsExactly(latest.getId(), later.getId());
        assertThat(firstPage.getTotalElements()).isEqualTo(3);

        Page<LedgerEntry> secondPage = ledgerEntryRepository.search(null, null, null, null, PageRequest.of(1, 2));
        assertThat(secondPage.getContent()).extracting(LedgerEntry::getId).containsExactly(earlier.getId());
    }

    @Test
    void searchReturnsAnEmptyPageWhenNoEntryMatchesTheGivenFilters() {
        seedAssociate();
        seedCycle();

        Page<LedgerEntry> result = ledgerEntryRepository.search(
            UUID.randomUUID(), null, null, null, PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
        assertThat(result.getTotalElements()).isZero();
    }

    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // New repository methods section): the crediting step's one read query -- proves entries in a
    // DIFFERENT cycle, or with a different status (CARRIED_FORWARD/PAID/REVERSED), are excluded
    // by the query itself -- not by any extra filtering a caller would otherwise need to do.
    @Test
    void findByCycleIdAndStatusReturnsOnlyMatchingEntriesForThatExactCycleAndStatus() {
        Associate associate = seedAssociate();
        Cycle targetCycle = seedCycle();
        Cycle otherCycle = seedCycle();

        LedgerEntry pendingInTarget = ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), targetCycle.getId(), IncomeType.DIRECT, UUID.randomUUID()));
        LedgerEntry carriedForwardInTarget = newEntry(associate.getId(), targetCycle.getId(), IncomeType.MATCHING, UUID.randomUUID());
        carriedForwardInTarget.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        ledgerEntryRepository.saveAndFlush(carriedForwardInTarget);
        LedgerEntry reversedInTarget = newEntry(associate.getId(), targetCycle.getId(), IncomeType.ROYALTY, UUID.randomUUID());
        reversedInTarget.setStatus(LedgerEntryStatus.REVERSED);
        ledgerEntryRepository.saveAndFlush(reversedInTarget);
        LedgerEntry pendingInOtherCycle = ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), otherCycle.getId(), IncomeType.DIRECT, UUID.randomUUID()));

        List<LedgerEntry> found = ledgerEntryRepository.findByCycleIdAndStatus(targetCycle.getId(), LedgerEntryStatus.PENDING);

        assertThat(found).extracting(LedgerEntry::getId).containsExactly(pendingInTarget.getId());
        assertThat(pendingInOtherCycle.getId()).isNotIn(found.stream().map(LedgerEntry::getId).toList());
    }

    @Test
    void findByCycleIdAndStatusReturnsAnEmptyListWhenNothingMatches() {
        Cycle cycle = seedCycle();

        assertThat(ledgerEntryRepository.findByCycleIdAndStatus(cycle.getId(), LedgerEntryStatus.PENDING)).isEmpty();
    }

    // Wallet/withdrawal unit 4 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 16, New repository methods section): the KYC-triggered reconciliation sweep's one
    // read query -- every CARRIED_FORWARD entry for one associate, deliberately unscoped by
    // cycleId (unlike findByCycleIdAndStatus above). Proves entries in a DIFFERENT cycle for the
    // SAME associate are still found (the sweep must catch withheld income from any past cycle),
    // entries for a DIFFERENT associate are excluded even with a matching status, and a different
    // status for the same associate/cycle is excluded too.
    @Test
    void findByAssociateIdAndStatusReturnsEveryMatchingEntryForThatAssociateAcrossAnyCycle() {
        Associate targetAssociate = seedAssociate();
        Associate otherAssociate = seedAssociate();
        Cycle cycleOne = seedCycle();
        Cycle cycleTwo = seedCycle();

        LedgerEntry carriedForwardInCycleOne = newEntry(targetAssociate.getId(), cycleOne.getId(), IncomeType.DIRECT, UUID.randomUUID());
        carriedForwardInCycleOne.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        ledgerEntryRepository.saveAndFlush(carriedForwardInCycleOne);

        LedgerEntry carriedForwardInCycleTwo = newEntry(targetAssociate.getId(), cycleTwo.getId(), IncomeType.MATCHING, UUID.randomUUID());
        carriedForwardInCycleTwo.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        ledgerEntryRepository.saveAndFlush(carriedForwardInCycleTwo);

        LedgerEntry pendingForTargetAssociate = ledgerEntryRepository.saveAndFlush(
            newEntry(targetAssociate.getId(), cycleOne.getId(), IncomeType.SPONSOR_MATCHING, UUID.randomUUID()));

        LedgerEntry carriedForwardForOtherAssociate = newEntry(otherAssociate.getId(), cycleOne.getId(), IncomeType.DIRECT, UUID.randomUUID());
        carriedForwardForOtherAssociate.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        ledgerEntryRepository.saveAndFlush(carriedForwardForOtherAssociate);

        List<LedgerEntry> found = ledgerEntryRepository.findByAssociateIdAndStatus(targetAssociate.getId(), LedgerEntryStatus.CARRIED_FORWARD);

        assertThat(found).extracting(LedgerEntry::getId)
            .containsExactlyInAnyOrder(carriedForwardInCycleOne.getId(), carriedForwardInCycleTwo.getId());
        assertThat(pendingForTargetAssociate.getId()).isNotIn(found.stream().map(LedgerEntry::getId).toList());
    }

    @Test
    void findByAssociateIdAndStatusReturnsAnEmptyListWhenNothingMatches() {
        Associate associate = seedAssociate();

        assertThat(ledgerEntryRepository.findByAssociateIdAndStatus(associate.getId(), LedgerEntryStatus.CARRIED_FORWARD)).isEmpty();
    }
}
