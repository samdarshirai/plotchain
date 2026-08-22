package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class SaleRepositoryTest {

    @Autowired SaleRepository saleRepository;
    @Autowired TestEntityManager entityManager;

    private UUID persistProject() {
        Project project = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
        return entityManager.persist(project).getId();
    }

    private UUID persistPlot(UUID projectId) {
        Plot plot = new Plot(UUID.randomUUID(), projectId, "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.SOLD);
        return entityManager.persist(plot).getId();
    }

    private UUID persistAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Test Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        // ADMIN, not ASSOCIATE: chk_associate_rank_required (V4) demands a rank_id for any
        // ASSOCIATE row. This fixture only needs a persistable, FK-satisfying associate row,
        // same reasoning as SaleRecordConcurrencyTest.seedAssociate().
        associate.setRole(AssociateRole.ADMIN);
        return entityManager.persist(associate).getId();
    }

    private UUID persistCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 1, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 1, 15));
        cycle.setStatus(CycleStatus.OPEN);
        return entityManager.persist(cycle).getId();
    }

    private Sale persistSale(UUID associateId, UUID plotId, UUID cycleId, SaleStatus status, Instant recordedAt) {
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plotId);
        sale.setAssociateId(associateId);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(new BigDecimal("600000.00"));
        sale.setCycleId(cycleId);
        sale.setLegCredited("L");
        sale.setStatus(status);
        sale.setRecordedAt(recordedAt);
        return entityManager.persist(sale);
    }

    @Test
    void searchRegisterFiltersByAssociateIdAndStatus() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateA = persistAssociate();
        UUID associateB = persistAssociate();
        Sale recordedForA = persistSale(associateA, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateA, plotId, cycleId, SaleStatus.VOIDED, Instant.now());
        Sale recordedForB = persistSale(associateB, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        entityManager.flush();

        Page<Sale> byAssociate = saleRepository.searchRegister(associateA, null, null, null, PageRequest.of(0, 20));
        assertThat(byAssociate.getContent()).hasSize(2)
            .allMatch(s -> s.getAssociateId().equals(associateA));

        Page<Sale> byStatus = saleRepository.searchRegister(null, SaleStatus.RECORDED, null, null, PageRequest.of(0, 20));
        assertThat(byStatus.getContent()).extracting(Sale::getId)
            .containsExactlyInAnyOrder(recordedForA.getId(), recordedForB.getId());

        Page<Sale> byBoth = saleRepository.searchRegister(associateA, SaleStatus.RECORDED, null, null, PageRequest.of(0, 20));
        assertThat(byBoth.getContent()).extracting(Sale::getId).containsExactly(recordedForA.getId());

        Page<Sale> noFilters = saleRepository.searchRegister(null, null, null, null, PageRequest.of(0, 20));
        assertThat(noFilters.getTotalElements()).isEqualTo(3);
    }

    @Test
    void searchRegisterFiltersByRecordedDateRangeUsingAnExclusiveUpperBound() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();
        Instant inRange = Instant.parse("2026-01-15T00:00:00Z");
        Instant outOfRange = Instant.parse("2026-02-15T00:00:00Z");
        Sale inRangeSale = persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, inRange);
        persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, outOfRange);
        entityManager.flush();

        Page<Sale> result = saleRepository.searchRegister(
            null, null,
            Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-02-01T00:00:00Z"),
            PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Sale::getId).containsExactly(inRangeSale.getId());
    }

    @Test
    void searchRegisterOrdersByRecordedAtDescending() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();
        Instant earlier = Instant.parse("2026-01-10T00:00:00Z");
        Instant later = Instant.parse("2026-01-20T00:00:00Z");
        Sale earlierSale = persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, earlier);
        Sale laterSale = persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, later);
        entityManager.flush();

        Page<Sale> result = saleRepository.searchRegister(null, null, null, null, PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Sale::getId)
            .containsExactly(laterSale.getId(), earlierSale.getId());
    }

    @Test
    void findByAssociateIdInOrderByRecordedAtDescReturnsOnlyMatchingAssociatesNewestFirst() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateA = persistAssociate();
        UUID associateB = persistAssociate();
        UUID associateC = persistAssociate();
        Instant earlier = Instant.parse("2026-01-10T00:00:00Z");
        Instant later = Instant.parse("2026-01-20T00:00:00Z");
        Sale earlierSale = persistSale(associateA, plotId, cycleId, SaleStatus.RECORDED, earlier);
        Sale laterSale = persistSale(associateB, plotId, cycleId, SaleStatus.RECORDED, later);
        // Not in the IN-list below -- must be excluded even though it's a real, persisted sale.
        persistSale(associateC, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        entityManager.flush();

        Page<Sale> result = saleRepository.findByAssociateIdInOrderByRecordedAtDesc(
            List.of(associateA, associateB), PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Sale::getId)
            .containsExactly(laterSale.getId(), earlierSale.getId());
    }

    @Test
    void sumAmountByCycleIdAndStatusReturnsZeroNotNullWhenNoSalesMatch() {
        UUID cycleId = persistCycle();

        BigDecimal sum = saleRepository.sumAmountByCycleIdAndStatus(cycleId, SaleStatus.RECORDED);

        assertThat(sum).isNotNull().isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void countAndSumByCycleIdAndStatusExcludeVoidedSales() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();
        persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateId, plotId, cycleId, SaleStatus.VOIDED, Instant.now());
        entityManager.flush();

        long count = saleRepository.countByCycleIdAndStatus(cycleId, SaleStatus.RECORDED);
        BigDecimal sum = saleRepository.sumAmountByCycleIdAndStatus(cycleId, SaleStatus.RECORDED);

        assertThat(count).isEqualTo(1);
        assertThat(sum).isEqualByComparingTo(new BigDecimal("600000.00"));
    }

    @Test
    void sumsPlotAreaSqftForAssociatesRecordedSalesInTheGivenCycle() {
        UUID cycleId = persistCycle();
        UUID otherCycleId = persistCycle();
        UUID associateA = persistAssociate();
        UUID associateB = persistAssociate();
        UUID plotOneId = persistPlot(persistProject());
        UUID plotTwoId = persistPlot(persistProject());
        persistSale(associateA, plotOneId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateA, plotTwoId, cycleId, SaleStatus.RECORDED, Instant.now());
        // Voided -- must be excluded.
        persistSale(associateA, plotOneId, cycleId, SaleStatus.VOIDED, Instant.now());
        // Recorded but in a different cycle -- must be excluded.
        persistSale(associateA, plotOneId, otherCycleId, SaleStatus.RECORDED, Instant.now());
        // Recorded, this cycle, but a different associate -- must be excluded.
        persistSale(associateB, plotOneId, cycleId, SaleStatus.RECORDED, Instant.now());
        entityManager.flush();

        BigDecimal sum = saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(
            associateA, cycleId, SaleStatus.RECORDED);

        // Both plots persisted via persistPlot() are fixed at 1200.00 sqft -> 1200 + 1200 = 2400.00
        assertThat(sum).isEqualByComparingTo("2400.00");
    }

    @Test
    void sumPlotAreaSqftReturnsZeroNotNullWhenNoSalesMatch() {
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();

        BigDecimal sum = saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(
            associateId, cycleId, SaleStatus.RECORDED);

        assertThat(sum).isNotNull().isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void countByAssociateIdAndCycleIdAndStatusCountsOnlyThatAssociateCycleAndStatus() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID otherCycleId = persistCycle();
        UUID associateA = persistAssociate();
        UUID associateB = persistAssociate();
        persistSale(associateA, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateA, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateA, plotId, cycleId, SaleStatus.VOIDED, Instant.now());
        persistSale(associateA, plotId, otherCycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateB, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        entityManager.flush();

        long count = saleRepository.countByAssociateIdAndCycleIdAndStatus(associateA, cycleId, SaleStatus.RECORDED);

        assertThat(count).isEqualTo(2);
    }

    @Test
    void sumAmountByAssociateIdAndCycleIdAndStatusSumsOnlyMatchingRows() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();
        persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateId, plotId, cycleId, SaleStatus.VOIDED, Instant.now());
        entityManager.flush();

        BigDecimal sum = saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED);

        // Two RECORDED sales at persistSale's fixed amount, 600000.00 each.
        assertThat(sum).isEqualByComparingTo("1200000.00");
    }

    @Test
    void sumAmountByAssociateIdAndCycleIdAndStatusReturnsZeroNotNullWhenNoRowsMatch() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();
        entityManager.flush();

        BigDecimal sum = saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED);

        assertThat(sum).isEqualByComparingTo("0");
    }
}
