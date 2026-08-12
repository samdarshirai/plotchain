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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.any;
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
        when(ledgerEntryRepository.sumNetAmountByCycle(cycle.getId())).thenReturn(BigDecimal.valueOf(167));

        CycleDetailResponse response = service.getDetail(cycle.getId());

        assertThat(response.id()).isEqualTo(cycle.getId());
        assertThat(response.periodStart()).isEqualTo(cycle.getPeriodStart());
        assertThat(response.periodEnd()).isEqualTo(cycle.getPeriodEnd());
        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
        assertThat(response.totalNet()).isEqualByComparingTo(BigDecimal.valueOf(167));
        assertThat(response.incomeTypeTotals()).containsExactly(
            new CycleIncomeTypeTotal(IncomeType.DIRECT, BigDecimal.valueOf(100)),
            new CycleIncomeTypeTotal(IncomeType.MATCHING, BigDecimal.valueOf(50)),
            new CycleIncomeTypeTotal(IncomeType.SPONSOR_MATCHING, BigDecimal.valueOf(10)),
            new CycleIncomeTypeTotal(IncomeType.ROYALTY, BigDecimal.valueOf(5)),
            new CycleIncomeTypeTotal(IncomeType.REWARD, BigDecimal.valueOf(2)));
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
            Instant.now(), null);
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

    private RoyaltyBonusRate royaltyBonusRateFixture(UUID planVersionId, UUID rankId, BigDecimal royaltyPct) {
        return new RoyaltyBonusRate(UUID.randomUUID(), planVersionId, rankId, royaltyPct);
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

        // FINANCE is one of the four staff roles chk_associate_rank_required also exempts from
        // needing a rank (V4__user_id_login_and_admin_roles.sql) -- not just ADMIN.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.FINANCE);
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
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null);
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
    void closeCreditsRoyaltyForAnAssociateWithARoyaltyRateConfiguredForTheirRank() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
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

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(any(UUID.class), eq(bronzeId)))
            .thenReturn(Optional.of(royaltyBonusRateFixture(UUID.randomUUID(), bronzeId, new BigDecimal("3.00"))));

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
    void closeWritesNoRoyaltyEntryWhenNoRateIsConfiguredForTheAssociatesRank() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(UUID.randomUUID());
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
        // an Optional-returning method is Optional.empty(), i.e. "no rate configured for this rank."

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeUsesThePostAdvancementRankWhenLookingUpTheRoyaltyRate() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // Starts at Bronze, 80 pre-existing cumulativeMatchedVolume (below Silver's 100
        // threshold) -- identical setup to closeAdvancesRankWhenCumulativeMatchedVolumeCrossesOneThreshold
        // (unit 6's own test), so this cycle's matched volume of 50 pushes cumulative to 130,
        // crossing into Silver BEFORE Royalty's lookup runs.
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
        root.setCumulativeMatchedVolume(new BigDecimal("80"));
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
        // A rate exists for Silver (the NEW, post-advancement rank) but deliberately NOT for
        // Bronze (the OLD, pre-cycle rank) -- if creditRoyalty read associate.getRankId() before
        // advanceRanks ran (or cached a stale value), this lookup would miss and no entry would
        // be written, failing this test.
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(planVersion.getId(), silverId))
            .thenReturn(Optional.of(royaltyBonusRateFixture(planVersion.getId(), silverId, new BigDecimal("5.00"))));

        service.close(cycle.getId());

        assertThat(root.getRankId()).isEqualTo(silverId); // sanity: advancement itself happened
        verify(royaltyBonusRateRepository).findByPlanVersionIdAndRankId(planVersion.getId(), silverId);
        verify(royaltyBonusRateRepository, never()).findByPlanVersionIdAndRankId(planVersion.getId(), bronzeId);

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        LedgerEntry royaltyEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.ROYALTY).findFirst().orElseThrow();
        // matched volume 50 * Silver's 5% = 2.500000
        assertThat(royaltyEntry.getGrossAmount()).isEqualByComparingTo("2.50");
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

        // FINANCE is one of the four staff roles chk_associate_rank_required also exempts from
        // needing a rank (V4__user_id_login_and_admin_roles.sql) -- not just ADMIN, same fact
        // unit 6's advanceRanks guard already established.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.FINANCE);
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

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.PENDING); // not verified
        root.setRankId(bronzeId);
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
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(any(UUID.class), eq(bronzeId)))
            .thenReturn(Optional.of(royaltyBonusRateFixture(UUID.randomUUID(), bronzeId, new BigDecimal("3.00"))));

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

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
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
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(any(UUID.class), eq(bronzeId)))
            .thenReturn(Optional.of(royaltyBonusRateFixture(UUID.randomUUID(), bronzeId, new BigDecimal("3.00"))));
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

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
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
        // royaltyPct = 0 -- a valid admin configuration for a rate row, distinct from "no rate
        // configured at all" (the empty-Optional case tested above).
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(any(UUID.class), eq(bronzeId)))
            .thenReturn(Optional.of(royaltyBonusRateFixture(UUID.randomUUID(), bronzeId, BigDecimal.ZERO)));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeWritesNoRoyaltyEntryWhenTheAssociateHasNoMatchedVolumeThisCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
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
}
