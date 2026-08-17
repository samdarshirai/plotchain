package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CycleServiceTest {

    @Mock CycleRepository cycleRepository;
    @Mock AssociateRepository associateRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock SaleRepository saleRepository;
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Mock RewardTierRepository rewardTierRepository;
    CycleService service;

    private Cycle newCycle(CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(status);
        return cycle;
    }

    private Cycle newCycleWithBounds(LocalDate start, LocalDate end, CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(start);
        cycle.setPeriodEnd(end);
        cycle.setStatus(status);
        return cycle;
    }

    private LocalDate expectedPeriodStart(LocalDate date) {
        return date.getDayOfMonth() <= 15 ? date.withDayOfMonth(1) : date.withDayOfMonth(16);
    }

    private LocalDate expectedPeriodEnd(LocalDate date) {
        return date.getDayOfMonth() <= 15
            ? date.withDayOfMonth(15)
            : date.withDayOfMonth(date.lengthOfMonth());
    }

    @Test
    void listWithNoStatusFilterDelegatesToFindAll() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(cycle), PageRequest.of(0, 20), 1));

        CyclePageResponse response = service.list(null, 0, 20);

        assertThat(response.cycles()).hasSize(1);
        assertThat(response.cycles().get(0).id()).isEqualTo(cycle.getId());
        assertThat(response.cycles().get(0).periodStart()).isEqualTo(cycle.getPeriodStart());
        assertThat(response.cycles().get(0).periodEnd()).isEqualTo(cycle.getPeriodEnd());
        assertThat(response.cycles().get(0).status()).isEqualTo(CycleStatus.OPEN);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(1);
    }

    @Test
    void listWithStatusFilterDelegatesToFindByStatus() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED, PageRequest.of(1, 10)))
            .thenReturn(new PageImpl<>(List.of(cycle), PageRequest.of(1, 10), 11));

        CyclePageResponse response = service.list(CycleStatus.CLOSED, 1, 10);

        assertThat(response.cycles()).extracting(CycleSummaryResponse::status).containsExactly(CycleStatus.CLOSED);
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(10);
        assertThat(response.totalElements()).isEqualTo(11);
    }

    @Test
    void getDetailReturnsCycleFieldsPlusPerIncomeTypeBreakdownAndOverallTotal() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findById(cycle.getId())).thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.DIRECT))
            .thenReturn(BigDecimal.valueOf(100));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.MATCHING))
            .thenReturn(BigDecimal.valueOf(50));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.SPONSOR_MATCHING))
            .thenReturn(BigDecimal.valueOf(10));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.ROYALTY))
            .thenReturn(BigDecimal.valueOf(5));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.REWARD))
            .thenReturn(BigDecimal.valueOf(2));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.SELF_PERFORMANCE))
            .thenReturn(BigDecimal.valueOf(3));
        when(ledgerEntryRepository.sumNetAmountByCycle(cycle.getId())).thenReturn(BigDecimal.valueOf(170));

        CycleDetailResponse response = service.getDetail(cycle.getId());

        assertThat(response.id()).isEqualTo(cycle.getId());
        assertThat(response.periodStart()).isEqualTo(cycle.getPeriodStart());
        assertThat(response.periodEnd()).isEqualTo(cycle.getPeriodEnd());
        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
        assertThat(response.totalNet()).isEqualByComparingTo(BigDecimal.valueOf(170));
        assertThat(response.incomeTypeTotals()).containsExactly(
            new CycleIncomeTypeTotal(IncomeType.DIRECT, BigDecimal.valueOf(100)),
            new CycleIncomeTypeTotal(IncomeType.MATCHING, BigDecimal.valueOf(50)),
            new CycleIncomeTypeTotal(IncomeType.SPONSOR_MATCHING, BigDecimal.valueOf(10)),
            new CycleIncomeTypeTotal(IncomeType.ROYALTY, BigDecimal.valueOf(5)),
            new CycleIncomeTypeTotal(IncomeType.REWARD, BigDecimal.valueOf(2)),
            new CycleIncomeTypeTotal(IncomeType.SELF_PERFORMANCE, BigDecimal.valueOf(3)));
    }

    @Test
    void getDetailThrowsCycleNotFoundExceptionWhenIdDoesNotResolve() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        UUID missingId = UUID.randomUUID();
        when(cycleRepository.findById(missingId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getDetail(missingId))
            .isInstanceOf(CycleNotFoundException.class);
    }

    @Test
    void closeThrowsCycleNotFoundExceptionWhenTheCycleDoesNotExist() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        UUID id = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.close(id)).isInstanceOf(CycleNotFoundException.class);
    }

    @Test
    void closeThrowsCycleAlreadyClosedExceptionWhenStatusIsClosed() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        assertThatThrownBy(() -> service.close(cycle.getId())).isInstanceOf(CycleAlreadyClosedException.class);
    }

    @Test
    void closeThrowsCycleAlreadyClosedExceptionWhenStatusIsPaid() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        Cycle cycle = newCycle(CycleStatus.PAID);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        assertThatThrownBy(() -> service.close(cycle.getId())).isInstanceOf(CycleAlreadyClosedException.class);
    }

    @Test
    void closeWithNoAssociatesWritesNoLegVolumeRowsAndStillClosesAndReopens() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        CycleCloseResponse response = service.close(cycle.getId());

        assertThat(response.cycleId()).isEqualTo(cycle.getId());
        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
        assertThat(response.legVolumeRowsWritten()).isEqualTo(0);
        assertThat(response.newCycleId()).isNotNull();
        assertThat(response.newCycleId()).isNotEqualTo(cycle.getId());
        verify(legVolumeRepository).saveAll(List.of());
    }

    // m9: closing early (before the just-closed cycle's own periodEnd) must not hand the new
    // cycle the same bucket-for-today range as the one just closed. newCycle's fixed
    // 2026-07-01..2026-07-15 window stands in for "whatever cycle happened to be open" --
    // the assertion is against LocalDate.now(), the actual close moment, not that fixture.
    @Test
    void closeOpensTheNextCycleStartingTheDayAfterActualCloseNotTheBucketForToday() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<Cycle> savedCycles = ArgumentCaptor.forClass(Cycle.class);
        verify(cycleRepository, atLeastOnce()).save(savedCycles.capture());
        // The captor holds references, not snapshots -- the original `cycle` object ends up
        // CLOSED after being mutated across its CALCULATING/CLOSED saves, so filtering by OPEN
        // status at inspection time isolates only the genuinely new Cycle instance.
        Cycle nextCycle = savedCycles.getAllValues().stream()
            .filter(c -> c.getStatus() == CycleStatus.OPEN)
            .reduce((first, second) -> second)
            .orElseThrow();

        LocalDate expectedStart = LocalDate.now().plusDays(1);
        assertThat(nextCycle.getPeriodStart()).isEqualTo(expectedStart);
        assertThat(nextCycle.getPeriodEnd()).isEqualTo(expectedPeriodEnd(expectedStart));
        assertThat(nextCycle.getPeriodStart()).isNotEqualTo(cycle.getPeriodStart());
    }

    @Test
    void closeComputesLegVolumeRollupTreeWideOnAMixedFixtureTreeAndWritesOneRowPerAssociate() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        // Fixture tree (Admin is the root, per the role-model spec):
        //           admin
        //          /      \
        //        b1(L)    b2(R)
        //       /   \      /   \
        //     c1(L) c2(R) c3(L) d(R)
        // c1 sells 100, c2 sells 50, c3 sells 30, d sells nothing. b1 carries forward
        // (20 left / 5 right) from a seeded prior CLOSED cycle's LegVolume row; nobody else
        // has a prior-cycle row.
        Associate admin = associateFixture(null, null);
        Associate b1 = associateFixture(admin.getId(), "L");
        Associate b2 = associateFixture(admin.getId(), "R");
        Associate c1 = associateFixture(b1.getId(), "L");
        Associate c2 = associateFixture(b1.getId(), "R");
        Associate c3 = associateFixture(b2.getId(), "L");
        Associate d = associateFixture(b2.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(admin, b1, b2, c1, c2, c3, d));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(c1.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(c2.getId(), cycle.getId(), new BigDecimal("50")),
            saleFixture(c3.getId(), cycle.getId(), new BigDecimal("30"))
        ));

        Cycle priorClosedCycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.of(priorClosedCycle));
        // General case: nobody has a prior-cycle LegVolume row.
        when(legVolumeRepository.findByAssociateIdAndCycleId(any(UUID.class), eq(priorClosedCycle.getId())))
            .thenReturn(Optional.empty());
        // Override for b1: carried forward 20 left / 5 right from the prior CLOSED cycle.
        LegVolume b1PriorLegVolume = new LegVolume(UUID.randomUUID(), b1.getId(), priorClosedCycle.getId(),
            BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("20"), new BigDecimal("5"));
        when(legVolumeRepository.findByAssociateIdAndCycleId(b1.getId(), priorClosedCycle.getId()))
            .thenReturn(Optional.of(b1PriorLegVolume));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        CycleCloseResponse response = service.close(cycle.getId());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<LegVolume>> legVolumesCaptor = ArgumentCaptor.forClass(List.class);
        verify(legVolumeRepository).saveAll(legVolumesCaptor.capture());
        List<LegVolume> written = legVolumesCaptor.getValue();

        assertThat(written).hasSize(7);
        // admin: min(150,30)=30 > 0 -> matched. left(150) > right(30) -> excess 120 carried on the left.
        assertLegVolume(written, admin.getId(), cycle.getId(), "150", "30", "120", "0");
        // b1: min(120,55)=55 > 0 -> matched. left(120) > right(55) -> excess 65 carried on the left.
        assertLegVolume(written, b1.getId(), cycle.getId(), "120", "55", "65", "0");
        // b2: min(30,0)=0 -> no match, no carried-forward mutation (unit 5's own scope rule).
        assertLegVolume(written, b2.getId(), cycle.getId(), "30", "0", "0", "0");
        assertLegVolume(written, c1.getId(), cycle.getId(), "0", "0", "0", "0");
        assertLegVolume(written, c2.getId(), cycle.getId(), "0", "0", "0", "0");
        assertLegVolume(written, c3.getId(), cycle.getId(), "0", "0", "0", "0");
        assertLegVolume(written, d.getId(), cycle.getId(), "0", "0", "0", "0");

        assertThat(response.legVolumeRowsWritten()).isEqualTo(7);
        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
    }

    private void assertLegVolume(List<LegVolume> written, UUID associateId, UUID cycleId,
                                  String expectedLeft, String expectedRight,
                                  String expectedCarriedForwardLeft, String expectedCarriedForwardRight) {
        LegVolume match = written.stream()
            .filter(lv -> associateId.equals(lv.getAssociateId()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("no LegVolume row written for associate " + associateId));
        assertThat(match.getCycleId()).isEqualTo(cycleId);
        assertThat(match.getLeftLegVolume()).isEqualByComparingTo(expectedLeft);
        assertThat(match.getRightLegVolume()).isEqualByComparingTo(expectedRight);
        assertThat(match.getCarriedForwardLeft()).isEqualByComparingTo(expectedCarriedForwardLeft);
        assertThat(match.getCarriedForwardRight()).isEqualByComparingTo(expectedCarriedForwardRight);
    }

    private Associate associateFixture(UUID parentId, String position) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setParentId(parentId);
        associate.setPosition(position);
        return associate;
    }

    private List<RankTier> rankTiersFixture(UUID bronzeId, UUID silverId, UUID goldId) {
        return List.of(
            new RankTier(bronzeId, "Bronze", 10, new BigDecimal("0")),
            new RankTier(silverId, "Silver", 20, new BigDecimal("100")),
            new RankTier(goldId, "Gold", 30, new BigDecimal("500"))
        );
    }

    private CompensationPlanVersion planVersionFixture() {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.of(2026, 1, 1),
            BigDecimal.ZERO, new BigDecimal("10.00"), new BigDecimal("11.00"),
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY,
            Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
    }

    // Doc-fixture-accuracy tests use compensation-plan-reference.md's real published rates
    // (direct 6%, matching 7%, sponsor 11%, tds 2%, admin-without-pan 15%) instead of
    // planVersionFixture()'s arbitrary round numbers, so expected amounts match the doc's own
    // worked Round 1 / Round 2 examples exactly.
    private CompensationPlanVersion referencePlanVersionFixture() {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "reference", LocalDate.of(2026, 1, 1),
            new BigDecimal("6.00"), new BigDecimal("7.00"), new BigDecimal("11.00"),
            new BigDecimal("2.00"), BigDecimal.ZERO, new BigDecimal("15.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY,
            Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
    }

    private LedgerEntry matchingEntryFixture(UUID associateId, UUID cycleId, BigDecimal grossAmount) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setAssociateId(associateId);
        entry.setCycleId(cycleId);
        entry.setIncomeType(IncomeType.MATCHING);
        entry.setGrossAmount(grossAmount);
        entry.setNetAmount(grossAmount); // netAmount is irrelevant to every caller of this fixture -- Sponsor Matching must ignore it (Decision #9's "never netAmount" rule) and only these tests' assertions decide whether that held
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setSourceRef(UUID.randomUUID());
        entry.setCreatedAt(Instant.now());
        return entry;
    }

    private Sale saleFixture(UUID associateId, UUID cycleId, BigDecimal amount) {
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setAssociateId(associateId);
        sale.setCycleId(cycleId);
        sale.setAmount(amount);
        sale.setStatus(SaleStatus.RECORDED);
        return sale;
    }

    private RoyaltyBonusRate royaltyBonusRateFixture(UUID planVersionId, BigDecimal volumeThreshold, BigDecimal royaltyPct) {
        return new RoyaltyBonusRate(UUID.randomUUID(), planVersionId, volumeThreshold, royaltyPct);
    }

    private RewardTier rewardTierFixture(UUID planVersionId, int tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward) {
        return new RewardTier(UUID.randomUUID(), planVersionId, tierLevel, volumeThreshold, cashReward, null);
    }

    @Test
    void closeCreditsMatchingIncomeForAnAssociateWithANonzeroMatchedPair() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<LegVolume>> legVolumesCaptor = ArgumentCaptor.forClass(List.class);
        verify(legVolumeRepository).saveAll(legVolumesCaptor.capture());
        LegVolume rootLegVolume = legVolumesCaptor.getValue().stream()
            .filter(lv -> root.getId().equals(lv.getAssociateId())).findFirst().orElseThrow();

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        LedgerEntry entry = entryCaptor.getValue();

        assertThat(entry.getIncomeType()).isEqualTo(IncomeType.MATCHING);
        assertThat(entry.getAssociateId()).isEqualTo(root.getId());
        assertThat(entry.getCycleId()).isEqualTo(cycle.getId());
        assertThat(entry.getSourceRef()).isEqualTo(rootLegVolume.getId());
        // min(left=100, right=50) = 50 matched. gross = 50 * 10% = 5.00
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("5.00");
        // tds = 5.00 * 5% = 0.25
        assertThat(entry.getTdsDeduction()).isEqualByComparingTo("0.25");
        // admin = 5.00 * 4% = 0.20
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("0.20");
        // net = 5.00 - 0.25 - 0.20 = 4.55
        assertThat(entry.getNetAmount()).isEqualByComparingTo("4.55");
        assertThat(entry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(entry.getCreatedAt()).isNotNull();
    }

    @Test
    void closeCreditsMatchingIncomeMatchingRound1DocFixture() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // Round 1 doc fixture: A and B each close ₹10,00,000.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("1000000")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("1000000"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(referencePlanVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        LedgerEntry entry = entryCaptor.getValue();

        // min(10,00,000, 10,00,000) = 10,00,000 matched. gross = 10,00,000 * 7% = 70,000
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("70000.00");
    }

    // Documented gap, not a spec: Associate has no pan_number field, so applyDeductions always
    // uses adminChargeWithoutPanPct regardless of what adminChargeWithPanPct is configured to
    // (compensation-plan-reference.md §2's 5%-with-PAN / 15%-without-PAN distinction is not wired
    // up anywhere). This pins that current behavior as a baseline, not an intended rule -- no
    // production change accompanies it.
    @Test
    void applyDeductionsAlwaysUsesTheWithoutPanRateEvenWhenAWithPanRateIsConfigured() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        // adminChargeWithPanPct (5%, doc's PAN-on-file rate) is clearly distinct from
        // adminChargeWithoutPanPct (15%, doc's no-PAN rate) so a wrong pick is unmistakable.
        CompensationPlanVersion planVersion = new CompensationPlanVersion(
            UUID.randomUUID(), "pan-gap", LocalDate.of(2026, 1, 1),
            BigDecimal.ZERO, new BigDecimal("10.00"), BigDecimal.ZERO,
            new BigDecimal("2.00"), new BigDecimal("5.00"), new BigDecimal("15.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY,
            Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        LedgerEntry entry = entryCaptor.getValue();

        // gross = min(100,50)=50 * 10% = 5.00; admin deduction always uses the 15% without-PAN
        // rate = 0.75, never the 5% with-PAN rate (which would be 0.25).
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("0.75");
    }

    @Test
    void closeWritesNoMatchingEntryWhenOneLegIsZero() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // Only the right leg sells anything -- left stays at zero, so min(left, right) = 0.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("40"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
        verify(associateRepository, never()).save(any(Associate.class));
    }

    @Test
    void closeCarriesTheExcessOnTheLargerLeftLegForwardOnTheSameLegVolumeRow() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // left(100) > right(50) -> min=50 matched, excess 50 carried on the LEFT.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LegVolume> savedLegVolumeCaptor = ArgumentCaptor.forClass(LegVolume.class);
        verify(legVolumeRepository).save(savedLegVolumeCaptor.capture());
        LegVolume saved = savedLegVolumeCaptor.getValue();
        assertThat(saved.getAssociateId()).isEqualTo(root.getId());
        assertThat(saved.getCarriedForwardLeft()).isEqualByComparingTo("50");
        assertThat(saved.getCarriedForwardRight()).isEqualByComparingTo("0");
    }

    @Test
    void closeCarriesTheExcessOnTheLargerRightLegForwardOnTheSameLegVolumeRow() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // right(100) > left(50) -> min=50 matched, excess 50 carried on the RIGHT.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("50")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("100"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LegVolume> savedLegVolumeCaptor = ArgumentCaptor.forClass(LegVolume.class);
        verify(legVolumeRepository).save(savedLegVolumeCaptor.capture());
        LegVolume saved = savedLegVolumeCaptor.getValue();
        assertThat(saved.getAssociateId()).isEqualTo(root.getId());
        assertThat(saved.getCarriedForwardLeft()).isEqualByComparingTo("0");
        assertThat(saved.getCarriedForwardRight()).isEqualByComparingTo("50");
    }

    @Test
    void closeIncrementsCumulativeMatchedVolumeByTheMatchedVolumeNotTheIncomeAmount() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setCumulativeMatchedVolume(new BigDecimal("20"));
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<Associate> savedAssociateCaptor = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(savedAssociateCaptor.capture());
        Associate saved = savedAssociateCaptor.getValue();
        assertThat(saved.getId()).isEqualTo(root.getId());
        // 20 (pre-existing) + min(100, 50)=50 matched volume = 70 -- not 5.00 (the income amount).
        assertThat(saved.getCumulativeMatchedVolume()).isEqualByComparingTo("70");
    }

    @Test
    void closeSetsCarriedForwardStatusWhenAssociateKycIsPending() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.PENDING);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        assertThat(entryCaptor.getValue().getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSetsCarriedForwardStatusWhenAssociateKycIsRejected() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.REJECTED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        assertThat(entryCaptor.getValue().getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSkipsWritingWhenAnIdempotentEntryAlreadyExistsForThatLegVolumeRow() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));
        // The LegVolume row's id is only generated at runtime inside close(), so match on the
        // known associateId/cycleId/incomeType and accept any sourceRef.
        when(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            eq(root.getId()), eq(cycle.getId()), eq(IncomeType.MATCHING), any(UUID.class)))
            .thenReturn(true);

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
        verify(legVolumeRepository, never()).save(any(LegVolume.class));
        verify(associateRepository, never()).save(any(Associate.class));
    }

    @Test
    void getOrOpenCurrentCreatesANewCycleWhenNoCycleCoversToday() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        LocalDate today = LocalDate.now();
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.empty());
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getPeriodStart()).isEqualTo(expectedPeriodStart(today));
        assertThat(result.getPeriodEnd()).isEqualTo(expectedPeriodEnd(today));
        assertThat(result.getStatus()).isEqualTo(CycleStatus.OPEN);
        assertThat(result.getId()).isNotNull();
        verify(cycleRepository).save(any(Cycle.class));
    }

    @Test
    void getOrOpenCurrentReturnsTheExistingOpenCycleWhenItCoversToday() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        LocalDate today = LocalDate.now();
        Cycle existing = newCycleWithBounds(expectedPeriodStart(today), expectedPeriodEnd(today), CycleStatus.OPEN);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(existing));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getId()).isEqualTo(existing.getId());
        verify(cycleRepository, never()).save(any(Cycle.class));
    }

    @Test
    void getOrOpenCurrentCreatesTheNextCycleWhenTheExistingOpenCycleDoesNotCoverToday() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
        LocalDate today = LocalDate.now();
        // Deliberately a stale period comfortably in the past relative to "today", regardless
        // of which day-of-month the test happens to run on: [-40, -26] days never overlaps
        // today's computed [periodStart, periodEnd] window (that window is at most 31 days wide
        // and always includes today itself).
        Cycle stale = newCycleWithBounds(today.minusDays(40), today.minusDays(26), CycleStatus.OPEN);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(stale));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getId()).isNotEqualTo(stale.getId());
        assertThat(result.getPeriodStart()).isEqualTo(expectedPeriodStart(today));
        assertThat(result.getPeriodEnd()).isEqualTo(expectedPeriodEnd(today));
        assertThat(result.getStatus()).isEqualTo(CycleStatus.OPEN);
        verify(cycleRepository).save(any(Cycle.class));
    }

    @Test
    void closeAdvancesRankWhenCumulativeMatchedVolumeCrossesOneThreshold() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
        root.setCumulativeMatchedVolume(new BigDecimal("80")); // pre-existing, below Silver's 100 threshold
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(100, 50) = 50 -> cumulativeMatchedVolume becomes 80 + 50 = 130,
        // crosses Silver's 100 threshold but not Gold's 500.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(root.getRankId()).isEqualTo(silverId);
        assertThat(root.getRankChangedAt()).isNotNull();
    }

    @Test
    void closeAdvancesRankToTheHighestTierWhenCumulativeMatchedVolumeCrossesTwoThresholdsInOneCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
        root.setCumulativeMatchedVolume(BigDecimal.ZERO);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(1200, 600) = 600 -> cumulativeMatchedVolume becomes 0 + 600 = 600,
        // crosses BOTH Silver's 100 AND Gold's 500 in a single cycle. Rank must land on Gold
        // directly, not step through Silver.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("1200")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("600"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(root.getRankId()).isEqualTo(goldId);
    }

    @Test
    void closeNeverDemotesRankEvenWhenCurrentCycleAloneWouldOnlyQualifyForALowerTier() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // Already at Gold from a prior cycle. This cycle: no sales at all, cumulativeMatchedVolume
        // stays at 50 -- which alone would only qualify for Bronze (threshold 0). Rank must stay Gold.
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(goldId);
        root.setCumulativeMatchedVolume(new BigDecimal("50"));
        when(associateRepository.findAll()).thenReturn(List.of(root));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(root.getRankId()).isEqualTo(goldId);
        verify(associateRepository, never()).save(root);
    }

    @Test
    void closeSkipsRankAdvancementForAdmin() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // rankId null and cumulativeMatchedVolume high enough to qualify for Gold if evaluated --
        // proves the skip is a deliberate guard, not an accident of low volume.
        Associate admin = associateFixture(null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setRankId(null);
        admin.setCumulativeMatchedVolume(new BigDecimal("1000"));
        when(associateRepository.findAll()).thenReturn(List.of(admin));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(admin.getRankId()).isNull();
        verify(associateRepository, never()).save(admin);
    }

    @Test
    void closeSkipsRankAdvancementForNonAssociateStaffRoles() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // ADMIN is exempt from needing a rank (chk_associate_rank_required,
        // V4__user_id_login_and_admin_roles.sql) same as any non-ASSOCIATE role always was.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.ADMIN);
        financeStaff.setKycStatus(KycStatus.VERIFIED);
        financeStaff.setRankId(null);
        financeStaff.setCumulativeMatchedVolume(new BigDecimal("1000"));
        when(associateRepository.findAll()).thenReturn(List.of(financeStaff));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(financeStaff.getRankId()).isNull();
        verify(associateRepository, never()).save(financeStaff);
    }

    @Test
    void closeKeepsCurrentRankUnchangedWhenMatchedVolumeDoesNotCrossAnyNewThreshold() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // Already at Silver (threshold 100), cumulativeMatchedVolume 150 pre-existing. This
        // cycle matches another 50 (min(100,50)) -> 150 + 50 = 200, still short of Gold's 500.
        // Rank must stay exactly Silver -- not reset to null/Bronze, not bumped to Gold.
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(silverId);
        root.setCumulativeMatchedVolume(new BigDecimal("150"));
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(root.getCumulativeMatchedVolume()).isEqualByComparingTo("200");
        assertThat(root.getRankId()).isEqualTo(silverId);
        assertThat(root.getRankChangedAt()).isNull();
    }

    @Test
    void closeCreditsSponsorMatchingForADirectSponseesMatchingEntryThisCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        LedgerEntry entry = entryCaptor.getValue();

        assertThat(entry.getIncomeType()).isEqualTo(IncomeType.SPONSOR_MATCHING);
        assertThat(entry.getAssociateId()).isEqualTo(sponsor.getId());
        assertThat(entry.getCycleId()).isEqualTo(cycle.getId());
        assertThat(entry.getSourceRef()).isEqualTo(sponseeMatchingEntry.getId());
        // gross = 50.00 * 11% = 5.5000
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("5.50");
        // tds = 5.5000 * 5% = 0.2750
        assertThat(entry.getTdsDeduction()).isEqualByComparingTo("0.275");
        // admin = 5.5000 * 4% = 0.2200
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("0.22");
        // net = 5.5000 - 0.2750 - 0.2200 = 5.0050
        assertThat(entry.getNetAmount()).isEqualByComparingTo("5.005");
        assertThat(entry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(entry.getCreatedAt()).isNotNull();
    }

    @Test
    void closeCreditsSponsorMatchingMatchingRound2DocFixture() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        // "You" sponsors A and B directly. A's own Matching gross this cycle is ₹1,40,000
        // (Round 2 doc fixture), B's is ₹1,19,000.
        Associate you = associateFixture(null, null);
        you.setKycStatus(KycStatus.VERIFIED);
        Associate a = associateFixture(null, null);
        a.setSponsorId(you.getId());
        Associate b = associateFixture(null, null);
        b.setSponsorId(you.getId());
        when(associateRepository.findAll()).thenReturn(List.of(you, a, b));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(referencePlanVersionFixture()));

        LedgerEntry aMatchingEntry = matchingEntryFixture(a.getId(), cycle.getId(), new BigDecimal("140000.00"));
        LedgerEntry bMatchingEntry = matchingEntryFixture(b.getId(), cycle.getId(), new BigDecimal("119000.00"));
        when(associateRepository.findBySponsorId(you.getId())).thenReturn(List.of(a, b));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(a.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(aMatchingEntry));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(b.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(bMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        List<LedgerEntry> sponsorEntries = entryCaptor.getAllValues();

        BigDecimal fromA = sponsorEntries.stream()
            .filter(e -> e.getSourceRef().equals(aMatchingEntry.getId())).findFirst().orElseThrow().getGrossAmount();
        BigDecimal fromB = sponsorEntries.stream()
            .filter(e -> e.getSourceRef().equals(bMatchingEntry.getId())).findFirst().orElseThrow().getGrossAmount();
        // 1,40,000 * 11% = 15,400; 1,19,000 * 11% = 13,090; total = 28,490.
        assertThat(fromA).isEqualByComparingTo("15400.00");
        assertThat(fromB).isEqualByComparingTo("13090.00");
        assertThat(fromA.add(fromB)).isEqualByComparingTo("28490.00");
    }

    @Test
    void closeWritesOneSponsorMatchingEntryPerDirectSponseeNotAggregated() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponseeOne = associateFixture(null, null);
        sponseeOne.setSponsorId(sponsor.getId());
        Associate sponseeTwo = associateFixture(null, null);
        sponseeTwo.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponseeOne, sponseeTwo));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeOneMatchingEntry = matchingEntryFixture(sponseeOne.getId(), cycle.getId(), new BigDecimal("50.00"));
        LedgerEntry sponseeTwoMatchingEntry = matchingEntryFixture(sponseeTwo.getId(), cycle.getId(), new BigDecimal("30.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponseeOne, sponseeTwo));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponseeOne.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeOneMatchingEntry));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponseeTwo.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeTwoMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        List<LedgerEntry> written = entryCaptor.getAllValues();

        assertThat(written).hasSize(2);
        assertThat(written).allMatch(e -> e.getAssociateId().equals(sponsor.getId())
            && e.getIncomeType() == IncomeType.SPONSOR_MATCHING);
        assertThat(written).extracting(LedgerEntry::getSourceRef)
            .containsExactlyInAnyOrder(sponseeOneMatchingEntry.getId(), sponseeTwoMatchingEntry.getId());
    }

    @Test
    void closeWritesNoSponsorMatchingEntryWhenTheSponseeHasNoMatchingEntryThisCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.empty());

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
    }

    @Test
    void closeBasesSponsorMatchingGrossOnTheSponseesMatchingGrossAmountNeverNetAmount() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        // grossAmount and netAmount deliberately far apart -- if Sponsor Matching ever mistakenly
        // read netAmount instead of grossAmount, this test's math would only match the wrong one.
        LedgerEntry sponseeMatchingEntry = new LedgerEntry();
        sponseeMatchingEntry.setId(UUID.randomUUID());
        sponseeMatchingEntry.setAssociateId(sponsee.getId());
        sponseeMatchingEntry.setCycleId(cycle.getId());
        sponseeMatchingEntry.setIncomeType(IncomeType.MATCHING);
        sponseeMatchingEntry.setGrossAmount(new BigDecimal("100.00"));
        sponseeMatchingEntry.setNetAmount(new BigDecimal("1.00"));
        sponseeMatchingEntry.setStatus(LedgerEntryStatus.PENDING);
        sponseeMatchingEntry.setSourceRef(UUID.randomUUID());
        sponseeMatchingEntry.setCreatedAt(Instant.now());
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        // gross = 100.00 (the sponsee's GROSS, not its 1.00 net) * 11% = 11.0000
        assertThat(entryCaptor.getValue().getGrossAmount()).isEqualByComparingTo("11.00");
    }

    @Test
    void closeGatesSponsorMatchingStatusOnTheSponsorsOwnKycStatusNotTheSponsees() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.PENDING); // sponsor unverified
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        sponsee.setKycStatus(KycStatus.VERIFIED); // sponsee itself IS verified -- must not matter here
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        assertThat(entryCaptor.getValue().getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSkipsSponsorMatchingWriteWhenAnIdempotentEntryAlreadyExists() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));
        when(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            sponsor.getId(), cycle.getId(), IncomeType.SPONSOR_MATCHING, sponseeMatchingEntry.getId()))
            .thenReturn(true);

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
    }

    @Test
    void closeSkipsSponsorMatchingWriteWhenComputedGrossAmountIsZero() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());

        // sponsorMatchingPct = 0 -- a valid admin configuration, distinct from the shared fixture.
        CompensationPlanVersion zeroSponsorMatchingPlanVersion = new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.of(2026, 1, 1),
            BigDecimal.ZERO, new BigDecimal("10.00"), BigDecimal.ZERO,
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(zeroSponsorMatchingPlanVersion));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
    }

    @Test
    void closeCreditsSponsorMatchingToAdminWhenAdminIsTheSponsor() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        // Decision #7: "Matching and Sponsor Matching... do apply to Admin in full." Admin has no
        // rankId, no role guard should exclude it from being credited as a sponsor.
        Associate admin = associateFixture(null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setRankId(null);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(admin.getId());
        when(associateRepository.findAll()).thenReturn(List.of(admin, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(admin.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        assertThat(entryCaptor.getValue().getAssociateId()).isEqualTo(admin.getId());
        assertThat(entryCaptor.getValue().getIncomeType()).isEqualTo(IncomeType.SPONSOR_MATCHING);
    }

    @Test
    void closeCreditsRoyaltyUsingTheVolumeSlabRateForTheAssociatesMatchedVolume() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(100, 50) = 50, same tree shape unit 5's own basic test uses.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        // Volume-slab lookup: "highest threshold not exceeded" against the associate's own
        // matched volume this cycle (50), not their rank.
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
            planVersion.getId(), new BigDecimal("50")))
            .thenReturn(Optional.of(royaltyBonusRateFixture(planVersion.getId(), new BigDecimal("40"), new BigDecimal("3.00"))));

        service.close(cycle.getId());

        // Two saves this cycle: the MATCHING entry (unit 5) and the ROYALTY entry (this unit).
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        LedgerEntry royaltyEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.ROYALTY).findFirst().orElseThrow();

        ArgumentCaptor<List<LegVolume>> legVolumesCaptor = ArgumentCaptor.forClass(List.class);
        verify(legVolumeRepository).saveAll(legVolumesCaptor.capture());
        LegVolume rootLegVolume = legVolumesCaptor.getValue().stream()
            .filter(lv -> root.getId().equals(lv.getAssociateId())).findFirst().orElseThrow();

        assertThat(royaltyEntry.getAssociateId()).isEqualTo(root.getId());
        assertThat(royaltyEntry.getCycleId()).isEqualTo(cycle.getId());
        assertThat(royaltyEntry.getSourceRef()).isEqualTo(rootLegVolume.getId());
        // matched volume 50 * 3% = 1.500000
        assertThat(royaltyEntry.getGrossAmount()).isEqualByComparingTo("1.50");
        // tds = 1.50 * 5% = 0.075
        assertThat(royaltyEntry.getTdsDeduction()).isEqualByComparingTo("0.075");
        // admin = 1.50 * 4% = 0.06
        assertThat(royaltyEntry.getAdminDeduction()).isEqualByComparingTo("0.06");
        // net = 1.50 - 0.075 - 0.06 = 1.365
        assertThat(royaltyEntry.getNetAmount()).isEqualByComparingTo("1.365");
        assertThat(royaltyEntry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(royaltyEntry.getCreatedAt()).isNotNull();
    }

    @Test
    void closeWritesNoRoyaltyEntryWhenNoRateIsConfiguredForTheAssociatesMatchedVolume() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));
        // Deliberately NOT stubbing royaltyBonusRateRepository -- Mockito's unstubbed default for
        // an Optional-returning method is Optional.empty(), i.e. "no slab rate configured at or
        // below this associate's matched volume."

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeSkipsRoyaltyForAdmin() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        // Decision #7: Royalty is "Also skipped for Admin (no rankId to look up a rate for)".
        Associate admin = associateFixture(null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setRankId(null);
        Associate left = associateFixture(admin.getId(), "L");
        Associate right = associateFixture(admin.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(admin, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        // Admin still earns Matching (Decision #7: "Matching and Sponsor Matching... apply to
        // Admin in full") but never Royalty.
        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeSkipsRoyaltyForNonAssociateStaffRoles() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        // ADMIN is exempt from needing a rank (chk_associate_rank_required,
        // V4__user_id_login_and_admin_roles.sql) same as any non-ASSOCIATE role always was,
        // same fact unit 6's advanceRanks guard already established.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.ADMIN);
        financeStaff.setKycStatus(KycStatus.VERIFIED);
        financeStaff.setRankId(null);
        Associate left = associateFixture(financeStaff.getId(), "L");
        Associate right = associateFixture(financeStaff.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(financeStaff, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeSetsCarriedForwardStatusForRoyaltyWhenAssociateKycIsNotVerified() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.PENDING); // not verified
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));
        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
            planVersion.getId(), new BigDecimal("50")))
            .thenReturn(Optional.of(royaltyBonusRateFixture(planVersion.getId(), new BigDecimal("40"), new BigDecimal("3.00"))));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        LedgerEntry royaltyEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.ROYALTY).findFirst().orElseThrow();
        assertThat(royaltyEntry.getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSkipsRoyaltyWriteWhenAnIdempotentEntryAlreadyExists() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));
        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
            planVersion.getId(), new BigDecimal("50")))
            .thenReturn(Optional.of(royaltyBonusRateFixture(planVersion.getId(), new BigDecimal("40"), new BigDecimal("3.00"))));
        // The LegVolume row's id is only generated at runtime inside close(), so match on the
        // known associateId/cycleId/incomeType and accept any sourceRef -- same pattern unit 5's
        // own idempotency test uses. creditMatchingIncome's own existsBy check (MATCHING) is
        // stubbed explicitly to false here too -- Mockito's strict stubbing otherwise flags that
        // real, in-order invocation as a mismatch against the ROYALTY-only stub below.
        when(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            eq(root.getId()), eq(cycle.getId()), eq(IncomeType.MATCHING), any(UUID.class)))
            .thenReturn(false);
        when(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            eq(root.getId()), eq(cycle.getId()), eq(IncomeType.ROYALTY), any(UUID.class)))
            .thenReturn(true);

        service.close(cycle.getId());

        // MATCHING still gets written (its own idempotency check is untouched by this stub) --
        // only ROYALTY is skipped.
        verify(ledgerEntryRepository, org.mockito.Mockito.times(1)).save(any(LedgerEntry.class));
        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeSkipsRoyaltyWriteWhenComputedGrossAmountIsZero() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));
        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        // royaltyPct = 0 -- a valid admin configuration for a rate row, distinct from "no rate
        // configured at all" (the empty-Optional case tested above).
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
            planVersion.getId(), new BigDecimal("50")))
            .thenReturn(Optional.of(royaltyBonusRateFixture(planVersion.getId(), new BigDecimal("40"), BigDecimal.ZERO)));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeWritesNoRoyaltyEntryWhenTheAssociateHasNoMatchedVolumeThisCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        // Only the left leg has volume this cycle -- min(100, 0) = 0, so unit 5 writes no
        // MATCHING entry either. Royalty's own guard must independently reach the same "skip".
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100"))
        ));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
    }

    @Test
    void closeCreditsRoyaltyMatchingRound2DocFixtureFortyLakhSlab() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // Round 2 doc fixture: left leg ₹50,00,000, right leg ₹40,00,000 -> matched volume
        // min(50L, 40L) = ₹40,00,000.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("5000000")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("4000000"))
        ));

        CompensationPlanVersion planVersion = referencePlanVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        // ₹40L slab (1.5%) must win over the lower ₹20L slab (1%) -- "highest threshold not exceeded".
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
            planVersion.getId(), new BigDecimal("4000000")))
            .thenReturn(Optional.of(royaltyBonusRateFixture(planVersion.getId(), new BigDecimal("4000000"), new BigDecimal("1.5"))));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.atLeastOnce()).save(entryCaptor.capture());
        LedgerEntry royaltyEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.ROYALTY).findFirst().orElseThrow();
        // 40,00,000 * 1.5% = 60,000
        assertThat(royaltyEntry.getGrossAmount()).isEqualByComparingTo("60000.00");
    }

    @Test
    void closeCreditsRoyaltyAtExactSlabBoundaryUsesThatSlabsRate() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // Matched volume lands EXACTLY on the ₹20,00,000 slab boundary -- pins the repository
        // query's "LessThanEqual" (inclusive) semantics.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("2000000")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("3000000"))
        ));

        CompensationPlanVersion planVersion = referencePlanVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
            planVersion.getId(), new BigDecimal("2000000")))
            .thenReturn(Optional.of(royaltyBonusRateFixture(planVersion.getId(), new BigDecimal("2000000"), new BigDecimal("1.0"))));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.atLeastOnce()).save(entryCaptor.capture());
        LedgerEntry royaltyEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.ROYALTY).findFirst().orElseThrow();
        // 20,00,000 * 1% = 20,000
        assertThat(royaltyEntry.getGrossAmount()).isEqualByComparingTo("20000.00");
    }

    @Test
    void closeCreditsRoyaltyBelowLowestSlabWritesNoEntry() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // Matched volume ₹10,00,000 -- below the lowest (₹20,00,000) slab floor.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("1000000")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("1500000"))
        ));

        CompensationPlanVersion planVersion = referencePlanVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        // Deliberately NOT stubbing royaltyBonusRateRepository -- no slab configured at or below
        // ₹10,00,000, so Mockito's default empty Optional is exactly right.

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeCreditsRewardForAnAssociateWhoCrossesATierThreshold() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(100, 50) = 50, pushing cumulativeMatchedVolume from 0 to 50 this
        // cycle -- same tree shape unit 5's own basic test uses.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00"))
        ));

        service.close(cycle.getId());

        // Two saves this cycle: the MATCHING entry (unit 5) and the REWARD entry (this unit).
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        LedgerEntry rewardEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).findFirst().orElseThrow();

        assertThat(rewardEntry.getAssociateId()).isEqualTo(root.getId());
        assertThat(rewardEntry.getCycleId()).isEqualTo(cycle.getId());
        assertThat(rewardEntry.getGrossAmount()).isEqualByComparingTo("1000.00");
        // tds = 1000 * 5% = 50.00, admin = 1000 * 4% = 40.00, net = 910.00 -- same planVersionFixture()
        // rates unit 8's own Royalty tests use.
        assertThat(rewardEntry.getTdsDeduction()).isEqualByComparingTo("50.00");
        assertThat(rewardEntry.getAdminDeduction()).isEqualByComparingTo("40.00");
        assertThat(rewardEntry.getNetAmount()).isEqualByComparingTo("910.00");
        assertThat(rewardEntry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(rewardEntry.getCreatedAt()).isNotNull();
    }

    @Test
    void closeWritesNoRewardEntryWhenNoTierThresholdIsMet() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        // Matched volume this cycle is 50, but the only configured tier needs 500 -- no tier is
        // crossed.
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("500"), new BigDecimal("1000.00"))
        ));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.REWARD));
    }

    @Test
    void closeCreditsMultipleNewlyCrossedRewardTiersInASingleCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(500, 500) = 500 this single cycle, jumping cumulativeMatchedVolume
        // from 0 straight past two tier thresholds (40 and 100) at once.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("500")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("500"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00")),
            rewardTierFixture(planVersion.getId(), 2, new BigDecimal("100"), new BigDecimal("5000.00"))
        ));

        service.close(cycle.getId());

        // Three saves: MATCHING (unit 5) + two REWARD entries, one per newly-crossed tier.
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(3)).save(entryCaptor.capture());
        List<LedgerEntry> rewardEntries = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).toList();
        assertThat(rewardEntries).hasSize(2);
        List<BigDecimal> rewardGrossAmounts = rewardEntries.stream().map(LedgerEntry::getGrossAmount).toList();
        // BigDecimal.equals() is scale-sensitive, so compare by value (compareTo == 0) rather than
        // relying on containsExactlyInAnyOrder's equals()-based matching.
        assertThat(rewardGrossAmounts).anyMatch(a -> a.compareTo(new BigDecimal("1000.00")) == 0);
        assertThat(rewardGrossAmounts).anyMatch(a -> a.compareTo(new BigDecimal("5000.00")) == 0);
    }

    @Test
    void closeCreditsRewardForAdmin() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        // Decision #8: RewardTier has no FK to rank_tier, so unlike Royalty (unit 8, which
        // explicitly skips Admin), Reward applies to Admin in full.
        Associate admin = associateFixture(null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setRankId(null);
        Associate left = associateFixture(admin.getId(), "L");
        Associate right = associateFixture(admin.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(admin, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00"))
        ));

        service.close(cycle.getId());

        LedgerEntry rewardEntry = verifyAndCaptureRewardEntry();
        assertThat(rewardEntry.getAssociateId()).isEqualTo(admin.getId());
    }

    private LedgerEntry verifyAndCaptureRewardEntry() {
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.atLeastOnce()).save(entryCaptor.capture());
        return entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).findFirst().orElseThrow();
    }

    @Test
    void closeSetsCarriedForwardStatusForRewardWhenAssociateKycIsNotVerified() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.PENDING); // not verified
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00"))
        ));

        service.close(cycle.getId());

        LedgerEntry rewardEntry = verifyAndCaptureRewardEntry();
        assertThat(rewardEntry.getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSkipsRewardWriteWhenAnIdempotentEntryAlreadyExists() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        RewardTier tier = rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00"));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(tier));
        // Simulates "already awarded in an earlier cycle" -- no cycleId argument exists on this
        // method at all, which is exactly the point (Decision #8).
        when(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(root.getId(), IncomeType.REWARD, tier.getId()))
            .thenReturn(true);

        service.close(cycle.getId());

        // MATCHING still gets written (its own idempotency check is untouched by this stub) --
        // only REWARD is skipped.
        verify(ledgerEntryRepository, org.mockito.Mockito.times(1)).save(any(LedgerEntry.class));
        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.REWARD));
    }

    @Test
    void closeSkipsRewardWriteWhenTierCashRewardIsZero() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        // cashReward = 0 -- a valid perk-only tier configuration, distinct from "threshold not
        // met" (tested above).
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), BigDecimal.ZERO)
        ));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.REWARD));
    }

    @Test
    void closeWritesNoRewardEntryWhenNoRewardTiersAreConfigured() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));
        // Deliberately NOT stubbing rewardTierRepository -- Mockito's unstubbed default for a
        // List-returning method is an empty List, i.e. "no reward tiers configured for this plan
        // version", exercising creditReward's early-return.

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.REWARD));
    }

    @Test
    void closeCreditsRewardIncomeMatchingRound1DocFixtureAwardsOnlyLevelOne() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // Round 1 doc fixture: A and B each close ₹10,00,000 -> matched volume min(10L,10L) = ₹10,00,000
        // in a single cycle, jumping straight past both the ₹5L and ₹10L tier thresholds.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("1000000")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("1000000"))
        ));

        CompensationPlanVersion planVersion = referencePlanVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("500000"), new BigDecimal("15000.00")),
            rewardTierFixture(planVersion.getId(), 2, new BigDecimal("1000000"), new BigDecimal("20000.00"))
        ));

        service.close(cycle.getId());

        // Per the source PDF's own worked example: reaching exactly ₹10,00,000 clears Level 1
        // (needs to EXCEED ₹5,00,000) but does not clear Level 2 (needs to EXCEED ₹10,00,000,
        // not merely reach it) -- only ₹5,00,000 of the ₹10,00,000 is consumed, and the remaining
        // ₹5,00,000 carries forward toward Level 2's own threshold next cycle.
        // Two saves this cycle: the MATCHING entry (unit 5) and the one REWARD entry (Level 1).
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        List<LedgerEntry> rewardEntries = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).toList();
        assertThat(rewardEntries).hasSize(1);
        assertThat(rewardEntries.get(0).getGrossAmount()).isEqualByComparingTo("15000.00");
        assertThat(root.getRewardVolumeCarriedForward()).isEqualByComparingTo("500000");
    }

    @Test
    void closeCreditsRewardIncomeMatchingRound2DocFixtureAwardsThreeTiers() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // Round 2 doc fixture: left leg ₹50,00,000, right leg ₹40,00,000 -> matched volume ₹40,00,000
        // in a single cycle, jumping past three tier thresholds (₹5L, ₹10L, ₹20L) but not the fourth (₹40L).
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("5000000")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("4000000"))
        ));

        CompensationPlanVersion planVersion = referencePlanVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("500000"), new BigDecimal("15000.00")),
            rewardTierFixture(planVersion.getId(), 2, new BigDecimal("1000000"), new BigDecimal("20000.00")),
            rewardTierFixture(planVersion.getId(), 3, new BigDecimal("2000000"), new BigDecimal("45000.00")),
            rewardTierFixture(planVersion.getId(), 4, new BigDecimal("4000000"), new BigDecimal("90000.00"))
        ));

        service.close(cycle.getId());

        // Four saves this cycle: the MATCHING entry (unit 5) and three REWARD entries (Levels 1-3).
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(4)).save(entryCaptor.capture());
        List<LedgerEntry> rewardEntries = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).toList();
        assertThat(rewardEntries).hasSize(3);
        BigDecimal rewardTotal = rewardEntries.stream().map(LedgerEntry::getGrossAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(rewardTotal).isEqualByComparingTo("80000.00");
        assertThat(rewardEntries).noneMatch(e -> e.getGrossAmount().compareTo(new BigDecimal("90000.00")) == 0);
        // Exactly ₹20,00,000 remains, one short of exceeding Level 4's ₹40,00,000 mark (₹20,00,000
        // consumed by Levels 1-3, ₹20,00,000 of the ₹40,00,000 matched left over).
        assertThat(root.getRewardVolumeCarriedForward()).isEqualByComparingTo("2000000");
    }

    @Test
    void closeCreditsRewardTierUsingCarriedForwardVolumeFromAPriorCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        // Simulates post-Round-1 state: Level 1 (₹5L) already awarded in a prior cycle, ₹2,00,000
        // left over from that cycle's consumption, carried forward into this one.
        root.setRewardVolumeCarriedForward(new BigDecimal("200000"));
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // This cycle's own matched volume is ₹3,50,000 -- combined with the ₹2,00,000 carried
        // forward, ₹5,50,000 available, enough to EXCEED Level 2's ₹5,00,000 increment (from the
        // ₹5L anchor up to the ₹10L threshold).
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("350000")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("500000"))
        ));

        CompensationPlanVersion planVersion = referencePlanVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        RewardTier tier1 = rewardTierFixture(planVersion.getId(), 1, new BigDecimal("500000"), new BigDecimal("15000.00"));
        RewardTier tier2 = rewardTierFixture(planVersion.getId(), 2, new BigDecimal("1000000"), new BigDecimal("20000.00"));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(tier1, tier2));
        when(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(root.getId(), IncomeType.REWARD, tier1.getId()))
            .thenReturn(true);

        service.close(cycle.getId());

        // Two saves this cycle: the MATCHING entry (unit 5) and the one REWARD entry (Level 2 --
        // Level 1's already-awarded, so it's skipped without a new save).
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        List<LedgerEntry> rewardEntries = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).toList();
        assertThat(rewardEntries).hasSize(1);
        assertThat(rewardEntries.get(0).getSourceRef()).isEqualTo(tier2.getId());
        assertThat(rewardEntries.get(0).getGrossAmount()).isEqualByComparingTo("20000.00");
        // ₹2,00,000(carried) + ₹3,50,000(this cycle, min(3.5L,5L)) - ₹5,00,000(Level 2's increment) = ₹50,000
        assertThat(root.getRewardVolumeCarriedForward()).isEqualByComparingTo("50000");
    }

    // -- Scale tests: ~600-associate tree --------------------------------------------------

    private record ScaleTreeFixture(List<Associate> associates, List<Sale> sales, UUID[] idsByIndex) {}

    // Array-heap-indexed complete binary tree: node i's parent is (i-1)/2, left child is 2i+1,
    // right child is 2i+2 -- every index in [0,size) is a real node, matching rollUpSubtree's own
    // parentId/position-based tree it walks. Every node's own sale is the same fixed amount, so
    // subtree volume is trivially ownSaleAmount * subtree node count, letting
    // expectedBalancedTreeMatchedVolume below serve as an independent oracle (a plain node-count
    // recursion, not a restatement of rollUpSubtree's own leg-volume logic).
    private ScaleTreeFixture buildBalancedTree(int size, UUID cycleId, BigDecimal ownSaleAmount) {
        UUID[] ids = new UUID[size];
        for (int i = 0; i < size; i++) {
            ids[i] = UUID.randomUUID();
        }
        List<Associate> associates = new ArrayList<>();
        List<Sale> sales = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            UUID parentId = i == 0 ? null : ids[(i - 1) / 2];
            String position = i == 0 ? null : (i % 2 == 1 ? "L" : "R");
            Associate associate = associateFixture(parentId, position);
            associate.setId(ids[i]);
            associate.setRole(AssociateRole.ASSOCIATE);
            associate.setKycStatus(KycStatus.VERIFIED);
            associates.add(associate);
            sales.add(saleFixture(ids[i], cycleId, ownSaleAmount));
        }
        return new ScaleTreeFixture(associates, sales, ids);
    }

    private int subtreeNodeCount(int index, int totalSize) {
        if (index >= totalSize) {
            return 0;
        }
        return 1 + subtreeNodeCount(2 * index + 1, totalSize) + subtreeNodeCount(2 * index + 2, totalSize);
    }

    private BigDecimal expectedBalancedTreeMatchedVolume(int index, int totalSize, BigDecimal ownSaleAmount) {
        BigDecimal leftVolume = ownSaleAmount.multiply(BigDecimal.valueOf(subtreeNodeCount(2 * index + 1, totalSize)));
        BigDecimal rightVolume = ownSaleAmount.multiply(BigDecimal.valueOf(subtreeNodeCount(2 * index + 2, totalSize)));
        return leftVolume.min(rightVolume);
    }

    @Test
    void closeCorrectlyComputesMatchingIncomeAcrossABalancedTreeOfSixHundredAssociates() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        int size = 600;
        BigDecimal ownSaleAmount = new BigDecimal("100");
        Cycle cycle = newCycle(CycleStatus.OPEN);
        ScaleTreeFixture tree = buildBalancedTree(size, cycle.getId(), ownSaleAmount);
        when(associateRepository.findAll()).thenReturn(tree.associates());

        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(tree.sales());
        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));

        long start = System.nanoTime();
        service.close(cycle.getId());
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        System.out.println("close() on balanced " + size + "-associate tree: " + elapsedMs + "ms");

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.atLeastOnce()).save(entryCaptor.capture());
        java.util.Map<UUID, LedgerEntry> matchingEntryByAssociateId = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.MATCHING)
            .collect(java.util.stream.Collectors.toMap(LedgerEntry::getAssociateId, e -> e));

        // Checkpoints: root (depth 0), an internal node at depth 3 (index 7), an internal node at
        // depth 6 (index 63), plus two leaves in different subtrees (511 under the root's left
        // child, 383 under the root's right child) which must correctly earn NOTHING -- a leaf
        // has no children, so its own leg volumes are always zero regardless of the tree's size.
        int[] internalCheckpoints = {0, 7, 63};
        for (int index : internalCheckpoints) {
            BigDecimal expected = expectedBalancedTreeMatchedVolume(index, size, ownSaleAmount)
                .multiply(planVersion.getMatchingIncomePct())
                .divide(BigDecimal.valueOf(100));
            UUID associateId = tree.idsByIndex()[index];
            LedgerEntry entry = matchingEntryByAssociateId.get(associateId);
            assertThat(entry).as("MATCHING entry at index %d", index).isNotNull();
            assertThat(entry.getGrossAmount()).as("gross at index %d", index).isEqualByComparingTo(expected);
        }

        int[] leafCheckpoints = {511, 383};
        for (int index : leafCheckpoints) {
            UUID associateId = tree.idsByIndex()[index];
            assertThat(matchingEntryByAssociateId).as("leaf at index %d must have no MATCHING entry", index)
                .doesNotContainKey(associateId);
        }
    }

    // Proves rollUpSubtree's plain recursive DFS (CycleService.java) handles 600 levels of depth
    // without a StackOverflowError. Each chain node i (0..depth-2) has a LEFT child continuing the
    // chain AND a RIGHT child leaf with a small fixed sale of its own -- this keeps every internal
    // chain node's matched volume a simple, constant, by-construction value (the leaf's own sale,
    // since the ever-growing left-chain subtree always dwarfs it), rather than needing a general
    // oracle, while still driving the actual recursion 600 levels deep via the left chain.
    private ScaleTreeFixture buildDeepChain(int depth, UUID cycleId, BigDecimal chainNodeSaleAmount, BigDecimal rightLeafSaleAmount) {
        List<Associate> associates = new ArrayList<>();
        List<Sale> sales = new ArrayList<>();
        UUID[] chainIds = new UUID[depth];
        for (int i = 0; i < depth; i++) {
            chainIds[i] = UUID.randomUUID();
        }
        for (int i = 0; i < depth; i++) {
            UUID parentId = i == 0 ? null : chainIds[i - 1];
            String position = i == 0 ? null : "L";
            Associate chainNode = associateFixture(parentId, position);
            chainNode.setId(chainIds[i]);
            chainNode.setRole(AssociateRole.ASSOCIATE);
            chainNode.setKycStatus(KycStatus.VERIFIED);
            associates.add(chainNode);
            sales.add(saleFixture(chainIds[i], cycleId, chainNodeSaleAmount));

            if (i < depth - 1) {
                Associate rightLeaf = associateFixture(chainIds[i], "R");
                associates.add(rightLeaf);
                sales.add(saleFixture(rightLeaf.getId(), cycleId, rightLeafSaleAmount));
            }
        }
        return new ScaleTreeFixture(associates, sales, chainIds);
    }

    @Test
    void closeHandlesADeepChainOfSixHundredAssociatesWithoutStackOverflow() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        int depth = 600;
        BigDecimal chainNodeSaleAmount = new BigDecimal("1000");
        BigDecimal rightLeafSaleAmount = new BigDecimal("50");
        Cycle cycle = newCycle(CycleStatus.OPEN);
        ScaleTreeFixture chain = buildDeepChain(depth, cycle.getId(), chainNodeSaleAmount, rightLeafSaleAmount);
        when(associateRepository.findAll()).thenReturn(chain.associates());

        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(chain.sales());
        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));

        long start = System.nanoTime();
        service.close(cycle.getId());
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        System.out.println("close() on deep " + depth + "-level chain: " + elapsedMs + "ms");

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.atLeastOnce()).save(entryCaptor.capture());
        java.util.Map<UUID, LedgerEntry> matchingEntryByAssociateId = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.MATCHING)
            .collect(java.util.stream.Collectors.toMap(LedgerEntry::getAssociateId, e -> e));

        // Every internal chain node (all but the deepest, which is a childless leaf) has matched
        // volume = min(ever-growing left-chain subtree, the fixed ₹50 right leaf) = ₹50 exactly.
        BigDecimal expectedGross = rightLeafSaleAmount
            .multiply(planVersion.getMatchingIncomePct())
            .divide(BigDecimal.valueOf(100));
        int[] checkpoints = {0, depth / 2, depth - 2};
        for (int index : checkpoints) {
            UUID associateId = chain.idsByIndex()[index];
            LedgerEntry entry = matchingEntryByAssociateId.get(associateId);
            assertThat(entry).as("MATCHING entry at chain depth %d", index).isNotNull();
            assertThat(entry.getGrossAmount()).as("gross at chain depth %d", index).isEqualByComparingTo(expectedGross);
        }

        // The deepest chain node is a leaf (no children at all) -- correctly earns nothing.
        UUID deepestLeafId = chain.idsByIndex()[depth - 1];
        assertThat(matchingEntryByAssociateId).doesNotContainKey(deepestLeafId);
    }
}
