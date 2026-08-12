package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
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

// Cycle-management unit 9 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
// Decision #8, and the spec's own Testing section, line 117): proves the reward-tier idempotency
// check spans SEPARATE, already-committed transactions, not just a single in-memory close() call.
// Each close() below is its own @Transactional invocation against a real (H2, MODE=PostgreSQL)
// datasource -- a Mockito-mocked LedgerEntryRepository (CycleServiceTest) cannot exercise "does a
// tier awarded in cycle 1's COMMITTED transaction get correctly found by cycle 2's fresh query,"
// because its stubs don't persist anything between calls.
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseRewardIntegrationTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired RewardTierRepository rewardTierRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired LegVolumeRepository legVolumeRepository;

    // V13__seed_default_rank_tiers.sql's lowest-order seeded rank -- chk_associate_rank_required
    // (V4__user_id_login_and_admin_roles.sql) requires rank_id NOT NULL for role = 'ASSOCIATE',
    // so every associate.setRole(ASSOCIATE) row below needs a real rank_id or the insert fails
    // the DB check constraint; this test isn't exercising rank progression, so any seeded tier works.
    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");
    // V8__compensation_plan.sql's genesis compensation_plan_version row -- reward_tier FKs to it.
    private static final UUID PLAN_VERSION_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    private UUID firstCycleId;
    private UUID secondCycleId;
    private UUID rootId;
    private UUID leftId;
    private UUID rightId;
    private UUID tierId;
    private UUID projectId;
    private UUID plotId;

    @AfterEach
    void cleanUp() {
        for (UUID cycleId : new UUID[] {firstCycleId, secondCycleId}) {
            if (cycleId == null) {
                continue;
            }
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAll().stream()
                .filter(e -> cycleId.equals(e.getCycleId())).toList());
            legVolumeRepository.deleteAll(legVolumeRepository.findAll().stream()
                .filter(lv -> cycleId.equals(lv.getCycleId())).toList());
            saleRepository.deleteAll(saleRepository.findAll().stream()
                .filter(s -> cycleId.equals(s.getCycleId())).toList());
            cycleRepository.deleteById(cycleId);
        }
        if (tierId != null) {
            rewardTierRepository.deleteById(tierId);
        }
        for (UUID id : new UUID[] {leftId, rightId, rootId}) {
            if (id != null) {
                associateRepository.deleteById(id);
            }
        }
        if (plotId != null) {
            plotRepository.deleteById(plotId);
        }
        if (projectId != null) {
            projectRepository.deleteById(projectId);
        }
    }

    private UUID seedOpenCycle(LocalDate start, LocalDate end) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(start);
        cycle.setPeriodEnd(end);
        cycle.setStatus(CycleStatus.OPEN);
        cycleRepository.saveAndFlush(cycle);
        return cycle.getId();
    }

    private UUID seedAssociate(String userId, UUID parentId, String position) {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName(userId);
        associate.setParentId(parentId);
        associate.setPosition(position);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setRankId(SILVER_RANK_ID);
        associate.setUserId(userId);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        associateRepository.saveAndFlush(associate);
        return id;
    }

    // Sale.plotId is a NOT NULL FK to plot(id), which itself FKs to project(id) -- mirrors
    // CycleCloseSponsorMatchingIntegrationTest's own fixture shape.
    private UUID seedPlot() {
        Project project = new Project(UUID.randomUUID(), "Test Project", "Test City", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();

        Plot plot = new Plot(UUID.randomUUID(), projectId, "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.SOLD);
        plotRepository.saveAndFlush(plot);
        return plot.getId();
    }

    private void seedSale(UUID associateId, UUID cycleId, UUID plotId, BigDecimal amount) {
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plotId);
        sale.setAssociateId(associateId);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(amount);
        sale.setCycleId(cycleId);
        sale.setLegCredited("L");
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());
        saleRepository.saveAndFlush(sale);
    }

    @Test
    void secondConsecutiveCycleDoesNotReAwardARewardTierCrossedInTheFirst() {
        // A low-threshold tier that the first cycle's matched volume will cross.
        RewardTier tier = new RewardTier(UUID.randomUUID(), PLAN_VERSION_ID, 1,
            new BigDecimal("40.00"), new BigDecimal("1000.00"), null);
        rewardTierRepository.saveAndFlush(tier);
        tierId = tier.getId();

        rootId = seedAssociate("reward-root", null, null);
        leftId = seedAssociate("reward-left", rootId, "L");
        rightId = seedAssociate("reward-right", rootId, "R");
        plotId = seedPlot();

        firstCycleId = seedOpenCycle(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 15));
        seedSale(leftId, firstCycleId, plotId, new BigDecimal("100"));
        seedSale(rightId, firstCycleId, plotId, new BigDecimal("100"));

        cycleService.close(firstCycleId);

        List<LedgerEntry> rewardEntriesAfterFirstClose = ledgerEntryRepository.findAll().stream()
            .filter(e -> rootId.equals(e.getAssociateId()) && e.getIncomeType() == IncomeType.REWARD)
            .toList();
        assertThat(rewardEntriesAfterFirstClose).hasSize(1);
        assertThat(rewardEntriesAfterFirstClose.get(0).getSourceRef()).isEqualTo(tierId);
        assertThat(rewardEntriesAfterFirstClose.get(0).getCycleId()).isEqualTo(firstCycleId);

        // Second cycle, no new sales -- cumulativeMatchedVolume (persisted from the first close,
        // still 100, still above the tier's 40 threshold) is the only thing creditReward looks at
        // for this associate; the point is that it must NOT re-award despite still qualifying.
        secondCycleId = seedOpenCycle(LocalDate.of(2026, 7, 16), LocalDate.of(2026, 7, 31));
        cycleService.close(secondCycleId);

        List<LedgerEntry> rewardEntriesAfterSecondClose = ledgerEntryRepository.findAll().stream()
            .filter(e -> rootId.equals(e.getAssociateId()) && e.getIncomeType() == IncomeType.REWARD)
            .toList();
        // Still exactly one REWARD entry for this tier, still dated to the FIRST cycle -- the
        // second close() found it via existsByAssociateIdAndIncomeTypeAndSourceRef (no cycleId
        // filter) and skipped writing a second one.
        assertThat(rewardEntriesAfterSecondClose).hasSize(1);
        assertThat(rewardEntriesAfterSecondClose.get(0).getCycleId()).isEqualTo(firstCycleId);
    }
}
