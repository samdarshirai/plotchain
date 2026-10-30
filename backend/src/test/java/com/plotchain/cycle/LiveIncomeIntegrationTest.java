package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
import com.plotchain.income.DesignationService;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
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
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Live income (CycleService.refreshLiveIncome): Matching / Sponsor Matching show up for an OPEN
// cycle as soon as sales land, are recomputed (not duplicated) on every refresh, and are replaced
// by close()'s final run. Same real-datasource fixture as CycleCloseSponsorMatchingIntegrationTest.
@SpringBootTest
@ActiveProfiles("test")
class LiveIncomeIntegrationTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired LegVolumeRepository legVolumeRepository;
    @Autowired RewardTierRepository rewardTierRepository;
    @Autowired DesignationService designationService;

    // V13__seed_default_rank_tiers.sql's lowest-order seeded rank -- chk_associate_rank_required
    // (V4__user_id_login_and_admin_roles.sql) requires rank_id NOT NULL for role = 'ASSOCIATE',
    // so every associate.setRole(ASSOCIATE) row below needs a real rank_id or the insert fails
    // the DB check constraint; this test isn't exercising rank progression, so any seeded tier works.
    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    private UUID cycleId;
    private UUID nextCycleId;
    private UUID sponsorId;
    private UUID sponseeId;
    private UUID leftId;
    private UUID rightId;
    private UUID projectId;
    private UUID plotId;
    private UUID rewardTierId;

    // V8__compensation_plan.sql's genesis compensation_plan_version row -- reward_tier FKs to it.
    private static final UUID PLAN_VERSION_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @AfterEach
    void cleanUp() {
        for (UUID cycleId : new UUID[] {nextCycleId, this.cycleId}) {
            if (cycleId == null) {
                continue;
            }
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAll().stream()
                .filter(e -> e.getCycleId().equals(cycleId)).toList());
            // unit 4's rollUpLegVolumes writes one LegVolume row per associate for this cycle,
            // which FKs to cycle(id) -- must be cleared before the cycle delete below or it fails
            // the same referential-integrity constraint the sale/ledger cleanup already accounts for.
            legVolumeRepository.deleteAll(legVolumeRepository.findAll().stream()
                .filter(lv -> lv.getCycleId().equals(cycleId)).toList());
            saleRepository.deleteAll(saleRepository.findAll().stream()
                .filter(s -> s.getCycleId().equals(cycleId)).toList());
            cycleRepository.deleteById(cycleId);
            // close() opens the next cycle (starting the day after today); remove it as well.
            cycleRepository.findAll().stream()
                .filter(c -> c.getStatus() == CycleStatus.OPEN && c.getPeriodStart().isAfter(LocalDate.now()))
                .forEach(cycleRepository::delete);
        }
        for (UUID id : new UUID[] {leftId, rightId, sponseeId, sponsorId}) {
            if (id != null) {
                associateRepository.deleteById(id);
            }
        }
        if (rewardTierId != null) {
            rewardTierRepository.deleteById(rewardTierId);
        }
        if (plotId != null) {
            plotRepository.deleteById(plotId);
        }
        if (projectId != null) {
            projectRepository.deleteById(projectId);
        }
    }

    private UUID seedOpenCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        cycleRepository.saveAndFlush(cycle);
        return cycle.getId();
    }

    private UUID seedAssociate(String userId, UUID parentId, String position, UUID sponsorId) {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName(userId);
        associate.setParentId(parentId);
        associate.setPosition(position);
        associate.setSponsorId(sponsorId);
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

    // Sale.plotId is a NOT NULL FK to plot(id), which itself FKs to project(id) -- both seeded
    // once per test run and reused across every Sale row, mirroring SaleRepositoryTest's fixture
    // shape (persistProject/persistPlot). Neither project nor plot content matters to Sponsor
    // Matching's own logic; this is purely to satisfy the schema so the Sale rows this test
    // actually cares about (their amount, feeding creditMatchingIncome's leg-volume rollup) can
    // be persisted at all.
    private UUID seedPlot() {
        Project project = new Project(UUID.randomUUID(), "Test Project", "Test City", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();

        Plot plot = new Plot(UUID.randomUUID(), projectId, "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.SOLD);
        plotRepository.saveAndFlush(plot);
        return plot.getId();
    }

    private UUID seedSale(UUID associateId, UUID cycleId, UUID plotId, BigDecimal amount) {
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plotId);
        sale.setProjectId(projectId);
        sale.setNote("seed");
        sale.setAssociateId(associateId);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(amount);
        sale.setCycleId(cycleId);
        sale.setLegCredited("L");
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());
        saleRepository.saveAndFlush(sale);
        return sale.getId();
    }

    private List<LedgerEntry> entries(UUID associateId, IncomeType type) {
        return ledgerEntryRepository.findAll().stream()
            .filter(e -> e.getCycleId().equals(cycleId) && e.getAssociateId().equals(associateId) && e.getIncomeType() == type)
            .toList();
    }

    // Tree: sponsee (parent of left/right leaves) is sponsored by sponsor. Matching = 7% of
    // min(left,right), Sponsor Matching = 5% of that (V8-seeded plan version).
    private void seedTree() {
        cycleId = seedOpenCycle();
        sponsorId = seedAssociate("livesponsor01", null, null, null);
        sponseeId = seedAssociate("livesponsee01", null, null, sponsorId);
        leftId = seedAssociate("liveleft01", sponseeId, "L", null);
        rightId = seedAssociate("liveright01", sponseeId, "R", null);
        plotId = seedPlot();
    }

    @Test
    void refreshCreditsMatchingAndSponsorMatchingWhileTheCycleIsStillOpen() {
        seedTree();
        seedSale(leftId, cycleId, plotId, new BigDecimal("100"));
        seedSale(rightId, cycleId, plotId, new BigDecimal("100"));

        cycleService.refreshLiveIncome(cycleId);

        assertThat(entries(sponseeId, IncomeType.MATCHING)).singleElement()
            .satisfies(e -> assertThat(e.getGrossAmount()).isEqualByComparingTo("7.00"));
        assertThat(entries(sponsorId, IncomeType.SPONSOR_MATCHING)).singleElement()
            .satisfies(e -> assertThat(e.getGrossAmount()).isEqualByComparingTo("0.35"));
        // Live runs leave close-only state alone.
        assertThat(cycleRepository.findById(cycleId).orElseThrow().getStatus()).isEqualTo(CycleStatus.OPEN);
        assertThat(associateRepository.findById(sponseeId).orElseThrow().getCumulativeMatchedVolume()).isEqualByComparingTo("0");
        assertThat(legVolumeRepository.findAll().stream().filter(lv -> lv.getCycleId().equals(cycleId))).isEmpty();
    }

    @Test
    void refreshReplacesRatherThanDuplicatesAndDropsIncomeWhenASaleIsVoided() {
        seedTree();
        seedSale(leftId, cycleId, plotId, new BigDecimal("100"));
        UUID rightSale = seedSale(rightId, cycleId, plotId, new BigDecimal("100"));
        cycleService.refreshLiveIncome(cycleId);

        seedSale(rightId, cycleId, plotId, new BigDecimal("50"));
        seedSale(leftId, cycleId, plotId, new BigDecimal("100"));
        cycleService.refreshLiveIncome(cycleId);

        // min(200, 150) = 150 -> 10.50
        assertThat(entries(sponseeId, IncomeType.MATCHING)).singleElement()
            .satisfies(e -> assertThat(e.getGrossAmount()).isEqualByComparingTo("10.50"));
        assertThat(entries(sponsorId, IncomeType.SPONSOR_MATCHING)).hasSize(1);

        Sale voided = saleRepository.findById(rightSale).orElseThrow();
        voided.setStatus(SaleStatus.VOIDED);
        saleRepository.saveAndFlush(voided);
        cycleService.refreshLiveIncome(cycleId);

        // min(200, 50) = 50 -> 3.50
        assertThat(entries(sponseeId, IncomeType.MATCHING)).singleElement()
            .satisfies(e -> assertThat(e.getGrossAmount()).isEqualByComparingTo("3.50"));
    }

    @Test
    void closeReplacesLiveRowsKeepingAdminPayoutMarksAndAppliesCloseOnlySideEffects() {
        seedTree();
        seedSale(leftId, cycleId, plotId, new BigDecimal("100"));
        seedSale(rightId, cycleId, plotId, new BigDecimal("60"));
        cycleService.refreshLiveIncome(cycleId);

        LedgerEntry live = entries(sponseeId, IncomeType.MATCHING).get(0);
        Instant paidAt = Instant.parse("2026-07-10T00:00:00Z");
        live.setFulfilledAt(paidAt);
        live.setFulfilmentRemark("paid early");
        ledgerEntryRepository.saveAndFlush(live);

        cycleService.close(cycleId);

        assertThat(entries(sponseeId, IncomeType.MATCHING)).singleElement().satisfies(e -> {
            assertThat(e.getGrossAmount()).isEqualByComparingTo("4.20");
            assertThat(e.getFulfilledAt()).isEqualTo(paidAt);
            assertThat(e.getFulfilmentRemark()).isEqualTo("paid early");
            assertThat(e.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        });
        assertThat(entries(sponsorId, IncomeType.SPONSOR_MATCHING)).hasSize(1);
        assertThat(associateRepository.findById(sponseeId).orElseThrow().getCumulativeMatchedVolume()).isEqualByComparingTo("60");
        assertThat(legVolumeRepository.findByAssociateIdAndCycleId(sponseeId, cycleId).orElseThrow().getCarriedForwardLeft())
            .isEqualByComparingTo("40");
    }

    @Test
    void refreshIsANoOpOnceTheCycleHasClosed() {
        seedTree();
        seedSale(leftId, cycleId, plotId, new BigDecimal("100"));
        seedSale(rightId, cycleId, plotId, new BigDecimal("100"));
        cycleService.close(cycleId);
        UUID finalId = entries(sponseeId, IncomeType.MATCHING).get(0).getId();

        cycleService.refreshLiveIncome(cycleId);

        assertThat(entries(sponseeId, IncomeType.MATCHING)).singleElement()
            .satisfies(e -> assertThat(e.getId()).isEqualTo(finalId));
    }

    @Test
    void crossingARewardTierMidCyclePromotesTheDesignationImmediatelyAndAVoidRevertsIt() {
        seedTree();
        RewardTier tier = new RewardTier(UUID.randomUUID(), PLAN_VERSION_ID, 1,
            new BigDecimal("100"), new BigDecimal("50"), "Mobile", "Sales Manager");
        rewardTierRepository.saveAndFlush(tier);
        rewardTierId = tier.getId();
        seedSale(leftId, cycleId, plotId, new BigDecimal("200"));
        UUID rightSale = seedSale(rightId, cycleId, plotId, new BigDecimal("200"));
        assertThat(designationService.designationOf(sponseeId)).isNull();

        cycleService.refreshLiveIncome(cycleId);

        // min(200, 200) = 200 > tier 1's 100 increment: achieved while the cycle is still OPEN.
        assertThat(entries(sponseeId, IncomeType.REWARD)).singleElement()
            .satisfies(e -> assertThat(e.getSourceRef()).isEqualTo(rewardTierId));
        assertThat(designationService.designationOf(sponseeId)).isEqualTo("Sales Manager");

        Sale voided = saleRepository.findById(rightSale).orElseThrow();
        voided.setStatus(SaleStatus.VOIDED);
        saleRepository.saveAndFlush(voided);
        cycleService.refreshLiveIncome(cycleId);

        assertThat(entries(sponseeId, IncomeType.REWARD)).isEmpty();
        assertThat(designationService.designationOf(sponseeId)).isNull();
    }

    // A cycle closing with business on one leg only must carry that whole leg forward (min = 0
    // is still "excess on the larger leg"), so when the other leg fills next cycle the reward is
    // achieved live -- before that cycle closes -- matching the reward screen's leg totals.
    @Test
    void oneLegOnlyCloseCarriesTheLegForwardSoTheNextCycleAchievesTheRewardLive() {
        seedTree();
        RewardTier tier = new RewardTier(UUID.randomUUID(), PLAN_VERSION_ID, 1,
            new BigDecimal("100"), new BigDecimal("50"), "Mobile", "Sales Manager");
        rewardTierRepository.saveAndFlush(tier);
        rewardTierId = tier.getId();
        seedSale(leftId, cycleId, plotId, new BigDecimal("200"));

        nextCycleId = cycleService.close(cycleId).newCycleId();

        assertThat(legVolumeRepository.findByAssociateIdAndCycleId(sponseeId, cycleId).orElseThrow().getCarriedForwardLeft())
            .isEqualByComparingTo("200");

        seedSale(rightId, nextCycleId, plotId, new BigDecimal("200"));
        cycleService.refreshLiveIncome(nextCycleId);

        assertThat(ledgerEntryRepository.findAll().stream()
            .filter(e -> e.getCycleId().equals(nextCycleId) && e.getAssociateId().equals(sponseeId)
                && e.getIncomeType() == IncomeType.REWARD))
            .singleElement()
            .satisfies(e -> assertThat(e.getSourceRef()).isEqualTo(rewardTierId));
    }
}
