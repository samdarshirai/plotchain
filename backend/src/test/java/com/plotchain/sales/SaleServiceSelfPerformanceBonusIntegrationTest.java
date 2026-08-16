package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.SelfPerformanceBonusConfig;
import com.plotchain.compensation.SelfPerformanceBonusConfigRepository;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class SaleServiceSelfPerformanceBonusIntegrationTest {

    @Autowired SaleService saleService;
    @Autowired AssociateRepository associateRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Autowired SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository;

    private UUID planVersionId;
    private UUID projectId;
    private UUID plotId;
    private UUID associateId;
    private UUID saleId;

    @AfterEach
    void cleanUp() {
        if (saleId != null) {
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAll().stream()
                .filter(e -> saleId.equals(e.getSourceRef())).toList());
            saleRepository.deleteById(saleId);
        }
        if (plotId != null) {
            plotRepository.deleteById(plotId);
        }
        if (projectId != null) {
            projectRepository.deleteById(projectId);
        }
        if (associateId != null) {
            associateRepository.deleteById(associateId);
        }
        if (planVersionId != null) {
            compensationPlanVersionRepository.deleteById(planVersionId);
        }
        // Restore the singleton config row to its seeded (disabled) state for other tests.
        SelfPerformanceBonusConfig config = selfPerformanceBonusConfigRepository.findAll().get(0);
        config.setEnabled(false);
        selfPerformanceBonusConfigRepository.save(config);
    }

    @Test
    void recordSaleCreditsBothDirectIncomeAndSelfPerformanceBonusInOneTransaction() {
        CompensationPlanVersion planVersion = new CompensationPlanVersion(
            UUID.randomUUID(), "sp-bonus-test", LocalDate.of(2025, 6, 1),
            new BigDecimal("6.00"), new BigDecimal("7.00"), new BigDecimal("11.00"),
            new BigDecimal("2.00"), BigDecimal.ZERO, new BigDecimal("15.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null,
            new BigDecimal("1.00"), new BigDecimal("2000"),
            new BigDecimal("2.00"), new BigDecimal("3000"));
        compensationPlanVersionRepository.saveAndFlush(planVersion);
        planVersionId = planVersion.getId();

        SelfPerformanceBonusConfig config = selfPerformanceBonusConfigRepository.findAll().get(0);
        config.setEnabled(true);
        selfPerformanceBonusConfigRepository.saveAndFlush(config);

        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setName("sp-bonus-associate");
        associate.setUserId("sp-bonus-associate");
        associate.setEmail("sp-bonus-associate@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setRankId(UUID.fromString("00000000-0000-0000-0000-000000000201"));
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setPosition("L");
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associateRepository.saveAndFlush(associate);
        associateId = associate.getId();

        Project project = new Project(UUID.randomUUID(), "SP Bonus Test Project", "Test City", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();

        Plot plot = new Plot(UUID.randomUUID(), projectId, "SP-101", PlotType.NORMAL,
            new BigDecimal("3000"), new BigDecimal("500.00"), new BigDecimal("1000000.00"), PlotStatus.AVAILABLE);
        plotRepository.saveAndFlush(plot);
        plotId = plot.getId();

        CreateSaleRequest request = new CreateSaleRequest(plotId, associateId, "Jane Buyer", "9999999999", null);
        SaleResponse response = saleService.recordSale(request);
        saleId = response.id();

        List<LedgerEntry> entries = ledgerEntryRepository.findAllBySourceRef(saleId);
        assertThat(entries).hasSize(2);

        LedgerEntry directEntry = entries.stream()
            .filter(e -> e.getIncomeType() == IncomeType.DIRECT).findFirst().orElseThrow();
        // gross = 1000000.00 * 6% = 60000
        assertThat(directEntry.getGrossAmount()).isEqualByComparingTo("60000");

        LedgerEntry selfPerformanceEntry = entries.stream()
            .filter(e -> e.getIncomeType() == IncomeType.SELF_PERFORMANCE).findFirst().orElseThrow();
        // 3000 sqft meets the tier-2 threshold: gross = 1000000.00 * 2% = 20000
        assertThat(selfPerformanceEntry.getGrossAmount()).isEqualByComparingTo("20000");
        assertThat(selfPerformanceEntry.getSourceRef()).isEqualTo(saleId);
    }
}
