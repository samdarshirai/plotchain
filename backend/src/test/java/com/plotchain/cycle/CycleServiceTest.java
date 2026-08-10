package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
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
    void closeThrowsCycleNotFoundExceptionWhenTheCycleDoesNotExist() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
        UUID id = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.close(id)).isInstanceOf(CycleNotFoundException.class);
    }

    @Test
    void closeThrowsCycleAlreadyClosedExceptionWhenStatusIsClosed() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        assertThatThrownBy(() -> service.close(cycle.getId())).isInstanceOf(CycleAlreadyClosedException.class);
    }

    @Test
    void closeThrowsCycleAlreadyClosedExceptionWhenStatusIsPaid() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
        Cycle cycle = newCycle(CycleStatus.PAID);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        assertThatThrownBy(() -> service.close(cycle.getId())).isInstanceOf(CycleAlreadyClosedException.class);
    }

    @Test
    void closeWithNoAssociatesWritesNoLegVolumeRowsAndStillClosesAndReopens() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            BigDecimal.ZERO, new BigDecimal("10.00"), BigDecimal.ZERO,
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY,
            Instant.now(), null);
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

    @Test
    void closeCreditsMatchingIncomeForAnAssociateWithANonzeroMatchedPair() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

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
}
