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
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
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
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Cycle-management unit 10 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
// Testing section, line 116): a single real close() call against a realistic 4-level, mixed-L/R
// tree, asserting hand-computed values for EVERY income type, rank progression, and KYC-gating
// together -- the coverage the spec's testing section calls for that no single existing test
// provides. Every other cycle-management test proves one concern in isolation (mocked repos, one
// income type, or a near-empty rollback fixture); this is the first test to prove they all cohere
// correctly on one real, non-trivial tree. See this unit's plan for the full hand-computation.
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseFullPipelineIntegrationTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired LegVolumeRepository legVolumeRepository;
    @Autowired RankTierRepository rankTierRepository;
    @Autowired RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Autowired RewardTierRepository rewardTierRepository;
    @Autowired CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;

    // V13__seed_default_rank_tiers.sql's lowest-order seeded rank -- starting rank for every
    // associate below that isn't specifically testing a pre-existing higher rank (c1).
    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    private UUID cycleId;
    private UUID priorClosedCycleId;
    private UUID planVersionId;
    private UUID testGoldRankId;
    private UUID royaltyRateId;
    private UUID rewardTier1Id;
    private UUID rewardTier2Id;
    private UUID projectId;
    private UUID plotId;
    private UUID adminId;
    private UUID b1Id;
    private UUID b2Id;
    private UUID c1Id;
    private UUID c2Id;
    private UUID c3Id;
    private UUID dId;
    private UUID sId;

    @AfterEach
    void cleanUp() {
        if (cycleId != null) {
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAll().stream()
                .filter(e -> cycleId.equals(e.getCycleId())).toList());
            legVolumeRepository.deleteAll(legVolumeRepository.findAll().stream()
                .filter(lv -> cycleId.equals(lv.getCycleId())).toList());
            saleRepository.deleteAll(saleRepository.findAll().stream()
                .filter(s -> cycleId.equals(s.getCycleId())).toList());
            cycleRepository.deleteById(cycleId);
        }
        if (priorClosedCycleId != null) {
            legVolumeRepository.deleteAll(legVolumeRepository.findAll().stream()
                .filter(lv -> priorClosedCycleId.equals(lv.getCycleId())).toList());
            cycleRepository.deleteById(priorClosedCycleId);
        }
        for (UUID id : new UUID[] {c1Id, c2Id, c3Id, dId, b1Id, b2Id, adminId, sId}) {
            if (id != null) {
                associateRepository.deleteById(id);
            }
        }
        if (royaltyRateId != null) {
            royaltyBonusRateRepository.deleteById(royaltyRateId);
        }
        if (rewardTier1Id != null) {
            rewardTierRepository.deleteById(rewardTier1Id);
        }
        if (rewardTier2Id != null) {
            rewardTierRepository.deleteById(rewardTier2Id);
        }
        if (planVersionId != null) {
            compensationPlanVersionRepository.deleteById(planVersionId);
        }
        if (testGoldRankId != null) {
            rankTierRepository.deleteById(testGoldRankId);
        }
        if (plotId != null) {
            plotRepository.deleteById(plotId);
        }
        if (projectId != null) {
            projectRepository.deleteById(projectId);
        }
    }

    private UUID seedAssociate(String userId, UUID parentId, String position, UUID sponsorId,
                                AssociateRole role, KycStatus kycStatus, UUID rankId,
                                BigDecimal cumulativeMatchedVolume) {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName(userId);
        associate.setParentId(parentId);
        associate.setPosition(position);
        associate.setSponsorId(sponsorId);
        associate.setKycStatus(kycStatus);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(cumulativeMatchedVolume);
        associate.setRankId(rankId);
        associate.setUserId(userId);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(role);
        associateRepository.saveAndFlush(associate);
        return id;
    }

    private UUID seedPlot() {
        Project project = new Project(UUID.randomUUID(), "Full Pipeline Test Project", "Test City", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();

        Plot plot = new Plot(UUID.randomUUID(), projectId, "FP-101", PlotType.NORMAL,
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

    private LedgerEntry findEntry(UUID associateId, IncomeType type) {
        return ledgerEntryRepository.findAll().stream()
            .filter(e -> associateId.equals(e.getAssociateId()) && e.getIncomeType() == type
                && cycleId.equals(e.getCycleId()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("no " + type + " entry found for associate " + associateId));
    }

    private List<LedgerEntry> findEntries(UUID associateId, IncomeType type) {
        return ledgerEntryRepository.findAll().stream()
            .filter(e -> associateId.equals(e.getAssociateId()) && e.getIncomeType() == type
                && cycleId.equals(e.getCycleId()))
            .toList();
    }

    @Test
    void closeComputesEveryIncomeTypeRankAndKycOutcomeCorrectlyOnARealisticMultiLevelTree() {
        // --- Prior CLOSED cycle: b1's carried-forward LegVolume row (20 left / 5 right). ---
        Cycle priorClosedCycle = new Cycle();
        priorClosedCycle.setId(UUID.randomUUID());
        priorClosedCycle.setPeriodStart(LocalDate.of(2020, 1, 1));
        priorClosedCycle.setPeriodEnd(LocalDate.of(2020, 1, 15));
        priorClosedCycle.setStatus(CycleStatus.CLOSED);
        cycleRepository.saveAndFlush(priorClosedCycle);
        priorClosedCycleId = priorClosedCycle.getId();

        // --- Custom CompensationPlanVersion: round percentages for easy hand-verification,
        // effectiveFrom after genesis (2000-01-01) and before this test's own cycle's periodStart
        // (2026-07-01) so it's the version close() resolves for this cycle. ---
        CompensationPlanVersion planVersion = new CompensationPlanVersion(
            UUID.randomUUID(), "full-pipeline", LocalDate.of(2025, 6, 1),
            new BigDecimal("10.00"), new BigDecimal("10.00"), new BigDecimal("10.00"),
            new BigDecimal("5.00"), new BigDecimal("3.00"), new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null);
        compensationPlanVersionRepository.saveAndFlush(planVersion);
        planVersionId = planVersion.getId();

        // --- Custom RankTier: TestGold, between V13's seeded Silver(10, threshold 0) and
        // Gold(20, threshold 100000), so a matched volume in the tens/hundreds can cross it. ---
        RankTier testGold = new RankTier(UUID.randomUUID(), "TestGold", 15, new BigDecimal("50"));
        rankTierRepository.saveAndFlush(testGold);
        testGoldRankId = testGold.getId();

        // --- RoyaltyBonusRate seeded ONLY for TestGold, deliberately NOT for Silver -- proves
        // Royalty looks up the POST-advancement rank, not the pre-advancement one. ---
        RoyaltyBonusRate royaltyRate = new RoyaltyBonusRate(UUID.randomUUID(), planVersionId, testGoldRankId, new BigDecimal("3.00"));
        royaltyBonusRateRepository.saveAndFlush(royaltyRate);
        royaltyRateId = royaltyRate.getId();

        // --- Two RewardTiers. ---
        RewardTier tier1 = new RewardTier(UUID.randomUUID(), planVersionId, 1, new BigDecimal("10"), new BigDecimal("500.00"), null);
        rewardTierRepository.saveAndFlush(tier1);
        rewardTier1Id = tier1.getId();
        RewardTier tier2 = new RewardTier(UUID.randomUUID(), planVersionId, 2, new BigDecimal("50"), new BigDecimal("2000.00"), null);
        rewardTierRepository.saveAndFlush(tier2);
        rewardTier2Id = tier2.getId();

        // --- Tree. ---
        sId = seedAssociate("s-sponsor", null, null, null,
            AssociateRole.ASSOCIATE, KycStatus.VERIFIED, SILVER_RANK_ID, BigDecimal.ZERO);
        adminId = seedAssociate("fp-admin", null, null, sId,
            AssociateRole.ADMIN, KycStatus.VERIFIED, null, BigDecimal.ZERO);
        b1Id = seedAssociate("fp-b1", adminId, "L", sId,
            AssociateRole.ASSOCIATE, KycStatus.PENDING, SILVER_RANK_ID, BigDecimal.ZERO);
        b2Id = seedAssociate("fp-b2", adminId, "R", null,
            AssociateRole.ASSOCIATE, KycStatus.VERIFIED, SILVER_RANK_ID, BigDecimal.ZERO);
        // c1 starts at TestGold with cumulativeMatchedVolume=5 -- below TestGold's own threshold
        // -- simulating a rank earned in a past cycle, to prove this cycle's re-evaluation
        // (which alone would only qualify for Silver) does not demote it.
        c1Id = seedAssociate("fp-c1", b1Id, "L", null,
            AssociateRole.ASSOCIATE, KycStatus.VERIFIED, testGoldRankId, new BigDecimal("5"));
        c2Id = seedAssociate("fp-c2", b1Id, "R", null,
            AssociateRole.ASSOCIATE, KycStatus.VERIFIED, SILVER_RANK_ID, BigDecimal.ZERO);
        c3Id = seedAssociate("fp-c3", b2Id, "L", null,
            AssociateRole.ASSOCIATE, KycStatus.VERIFIED, SILVER_RANK_ID, BigDecimal.ZERO);
        dId = seedAssociate("fp-d", b2Id, "R", null,
            AssociateRole.ASSOCIATE, KycStatus.VERIFIED, SILVER_RANK_ID, BigDecimal.ZERO);

        plotId = seedPlot();

        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        cycleRepository.saveAndFlush(cycle);
        cycleId = cycle.getId();

        // b1's carried-forward LegVolume row against the PRIOR closed cycle.
        LegVolume b1PriorLegVolume = new LegVolume(UUID.randomUUID(), b1Id, priorClosedCycleId,
            BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("20"), new BigDecimal("5"));
        legVolumeRepository.saveAndFlush(b1PriorLegVolume);

        seedSale(c1Id, cycleId, plotId, new BigDecimal("100"));
        seedSale(c2Id, cycleId, plotId, new BigDecimal("50"));
        seedSale(c3Id, cycleId, plotId, new BigDecimal("30"));
        // d sells nothing this cycle.

        // --- Run the real batch, once. ---
        CycleCloseResponse response = cycleService.close(cycleId);

        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
        // Scoped to this test's own fixture associates, not response.legVolumeRowsWritten()'s raw
        // batch-wide total: V18__seed_founding_admin.sql permanently seeds one real ADMIN row
        // (parent_id = NULL) in every environment including every test run, which close()
        // correctly sweeps in as an extra tree root (Decision #2 -- "no special-cased exclusion in
        // the compensation engine"), adding its own zero-value LegVolume row to that raw total.
        // That's correct production behavior, not a bug -- this assertion is scoped to prove this
        // test's own 8-node tree specifically, independent of whatever else is seeded globally.
        long legVolumeRowsForFixture = legVolumeRepository.findAll().stream()
            .filter(lv -> cycleId.equals(lv.getCycleId()))
            .filter(lv -> Set.of(sId, adminId, b1Id, b2Id, c1Id, c2Id, c3Id, dId).contains(lv.getAssociateId()))
            .count();
        assertThat(legVolumeRowsForFixture).isEqualTo(8);

        // --- Leg-volume rollup + carried-forward excess. ---
        LegVolume b1LegVolume = legVolumeRepository.findByAssociateIdAndCycleId(b1Id, cycleId).orElseThrow();
        assertThat(b1LegVolume.getLeftLegVolume()).isEqualByComparingTo("120");
        assertThat(b1LegVolume.getRightLegVolume()).isEqualByComparingTo("55");
        assertThat(b1LegVolume.getCarriedForwardLeft()).isEqualByComparingTo("65");
        assertThat(b1LegVolume.getCarriedForwardRight()).isEqualByComparingTo("0");

        LegVolume adminLegVolume = legVolumeRepository.findByAssociateIdAndCycleId(adminId, cycleId).orElseThrow();
        assertThat(adminLegVolume.getLeftLegVolume()).isEqualByComparingTo("150");
        assertThat(adminLegVolume.getRightLegVolume()).isEqualByComparingTo("30");
        assertThat(adminLegVolume.getCarriedForwardLeft()).isEqualByComparingTo("120");
        assertThat(adminLegVolume.getCarriedForwardRight()).isEqualByComparingTo("0");

        LegVolume b2LegVolume = legVolumeRepository.findByAssociateIdAndCycleId(b2Id, cycleId).orElseThrow();
        assertThat(b2LegVolume.getLeftLegVolume()).isEqualByComparingTo("30");
        assertThat(b2LegVolume.getRightLegVolume()).isEqualByComparingTo("0");
        assertThat(b2LegVolume.getCarriedForwardLeft()).isEqualByComparingTo("0"); // no Matching entry -> untouched

        // --- Matching Income. ---
        // tdsDeduction/netAmount are computed in Java to full precision (0.275, 5.005) but
        // ledger_entry's columns are NUMERIC(14,2) (V1__create_dashboard_tables.sql) -- the DB
        // rounds HALF_UP to 2 decimal places on persist, independently per column. Verified
        // empirically against this suite's exact H2 2.2.224/MODE=PostgreSQL datasource: 0.275 ->
        // 0.28, 5.005 -> 5.01. grossAmount/adminDeduction land on exact 2dp already, unaffected.
        LedgerEntry b1Matching = findEntry(b1Id, IncomeType.MATCHING);
        assertThat(b1Matching.getGrossAmount()).isEqualByComparingTo("5.50");
        assertThat(b1Matching.getTdsDeduction()).isEqualByComparingTo("0.28");
        assertThat(b1Matching.getAdminDeduction()).isEqualByComparingTo("0.22");
        assertThat(b1Matching.getNetAmount()).isEqualByComparingTo("5.01");
        assertThat(b1Matching.getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD); // KYC PENDING

        LedgerEntry adminMatching = findEntry(adminId, IncomeType.MATCHING);
        assertThat(adminMatching.getGrossAmount()).isEqualByComparingTo("3.00");
        assertThat(adminMatching.getNetAmount()).isEqualByComparingTo("2.73");
        assertThat(adminMatching.getStatus()).isEqualTo(LedgerEntryStatus.PENDING); // KYC VERIFIED

        assertThat(findEntries(b2Id, IncomeType.MATCHING)).isEmpty(); // matched = min(30,0) = 0

        // --- Rank progression: b1 advances, c1 never demotes, admin skipped entirely. ---
        Associate b1Reread = associateRepository.findById(b1Id).orElseThrow();
        assertThat(b1Reread.getRankId()).isEqualTo(testGoldRankId);
        assertThat(b1Reread.getCumulativeMatchedVolume()).isEqualByComparingTo("55");

        Associate c1Reread = associateRepository.findById(c1Id).orElseThrow();
        assertThat(c1Reread.getRankId()).isEqualTo(testGoldRankId); // unchanged -- never demotes
        assertThat(c1Reread.getCumulativeMatchedVolume()).isEqualByComparingTo("5"); // unchanged -- no Matching entry of its own

        Associate adminReread = associateRepository.findById(adminId).orElseThrow();
        assertThat(adminReread.getRankId()).isNull(); // Admin: rank progression skipped entirely
        assertThat(adminReread.getCumulativeMatchedVolume()).isEqualByComparingTo("30"); // still increments (Matching has no role guard)

        // --- Sponsor Matching: one itemized entry per direct sponsee. ---
        List<LedgerEntry> sponsorEntries = findEntries(sId, IncomeType.SPONSOR_MATCHING);
        assertThat(sponsorEntries).hasSize(2);
        LedgerEntry sponsorFromB1 = sponsorEntries.stream()
            .filter(e -> e.getSourceRef().equals(b1Matching.getId())).findFirst().orElseThrow();
        assertThat(sponsorFromB1.getGrossAmount()).isEqualByComparingTo("0.55");
        // net = 0.55 - 0.0275(tds) - 0.022(admin) = 0.5005 unrounded -> DB rounds HALF_UP to 0.50
        // (NUMERIC(14,2), same rounding as b1Matching above).
        assertThat(sponsorFromB1.getNetAmount()).isEqualByComparingTo("0.50");
        assertThat(sponsorFromB1.getStatus()).isEqualTo(LedgerEntryStatus.PENDING); // S is KYC VERIFIED
        LedgerEntry sponsorFromAdmin = sponsorEntries.stream()
            .filter(e -> e.getSourceRef().equals(adminMatching.getId())).findFirst().orElseThrow();
        assertThat(sponsorFromAdmin.getGrossAmount()).isEqualByComparingTo("0.30");
        // net = 0.30 - 0.015(tds) - 0.012(admin) = 0.273 unrounded -> DB rounds HALF_UP to 0.27.
        assertThat(sponsorFromAdmin.getNetAmount()).isEqualByComparingTo("0.27");

        // --- Royalty: b1 only, at the POST-advancement (TestGold) rate -- no rate exists for
        // Silver, so this entry existing at all proves the post-advancement lookup. Admin skipped. ---
        LedgerEntry b1Royalty = findEntry(b1Id, IncomeType.ROYALTY);
        assertThat(b1Royalty.getGrossAmount()).isEqualByComparingTo("1.65");
        // net = 1.65 - 0.0825(tds) - 0.066(admin) = 1.5015 unrounded -> DB rounds HALF_UP to 1.50.
        assertThat(b1Royalty.getNetAmount()).isEqualByComparingTo("1.50");
        assertThat(b1Royalty.getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
        assertThat(b1Royalty.getSourceRef()).isEqualTo(b1LegVolume.getId());
        assertThat(findEntries(adminId, IncomeType.ROYALTY)).isEmpty();

        // --- Reward: Admin participates (one tier crossed), b1 crosses both tiers, KYC-gated. ---
        List<LedgerEntry> adminRewards = findEntries(adminId, IncomeType.REWARD);
        assertThat(adminRewards).hasSize(1);
        assertThat(adminRewards.get(0).getSourceRef()).isEqualTo(rewardTier1Id);
        assertThat(adminRewards.get(0).getGrossAmount()).isEqualByComparingTo("500.00");
        assertThat(adminRewards.get(0).getNetAmount()).isEqualByComparingTo("455.00");
        assertThat(adminRewards.get(0).getStatus()).isEqualTo(LedgerEntryStatus.PENDING);

        List<LedgerEntry> b1Rewards = findEntries(b1Id, IncomeType.REWARD);
        assertThat(b1Rewards).hasSize(2);
        assertThat(b1Rewards).allMatch(e -> e.getStatus() == LedgerEntryStatus.CARRIED_FORWARD);
        BigDecimal b1RewardTotal = b1Rewards.stream().map(LedgerEntry::getGrossAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(b1RewardTotal).isEqualByComparingTo("2500.00"); // 500 (tier1) + 2000 (tier2)

        for (UUID noRewardId : new UUID[] {c1Id, c2Id, c3Id, dId, sId, b2Id}) {
            assertThat(findEntries(noRewardId, IncomeType.REWARD)).isEmpty();
        }

        // --- Grand total: 2 MATCHING + 2 SPONSOR_MATCHING + 1 ROYALTY + 3 REWARD = 8. ---
        long totalEntriesThisCycle = ledgerEntryRepository.findAll().stream()
            .filter(e -> cycleId.equals(e.getCycleId())).count();
        assertThat(totalEntriesThisCycle).isEqualTo(8);
    }
}
