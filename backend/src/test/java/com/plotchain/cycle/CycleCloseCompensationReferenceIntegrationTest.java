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

// Runs compensation-plan-reference.md's Round 2 worked example (§6) through a real close() call
// end-to-end, against the doc's real published rates (direct 6%, matching 7%, sponsor 11%,
// volume-slab Royalty, the 3-tier Reward ladder used in that example) -- proving the whole
// pipeline reproduces the doc's own stated total (₹4,48,490) for "You", not just each income
// type's unit-level math in isolation (CycleServiceTest, mocked repos) or a single income type at
// a time (the other CycleClose*IntegrationTest files). Mirrors
// CycleCloseFullPipelineIntegrationTest's seed/cleanup shape.
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseCompensationReferenceIntegrationTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired LegVolumeRepository legVolumeRepository;
    @Autowired RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Autowired RewardTierRepository rewardTierRepository;
    @Autowired CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;

    // V13__seed_default_rank_tiers.sql's lowest-order seeded rank -- chk_associate_rank_required
    // requires rank_id NOT NULL for role = 'ASSOCIATE'; Royalty no longer reads rank at all
    // (it's volume-keyed), so any seeded tier works here.
    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    private UUID cycleId;
    private UUID planVersionId;
    private UUID royaltyRateId;
    private UUID rewardTier1Id;
    private UUID rewardTier2Id;
    private UUID rewardTier3Id;
    private UUID projectId;
    private UUID plotId;
    private UUID youId;
    private UUID aId;
    private UUID bId;
    private UUID cId;
    private UUID dId;
    private UUID eId;
    private UUID fId;

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
        for (UUID id : new UUID[] {cId, dId, eId, fId, aId, bId, youId}) {
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
        if (rewardTier3Id != null) {
            rewardTierRepository.deleteById(rewardTier3Id);
        }
        if (planVersionId != null) {
            compensationPlanVersionRepository.deleteById(planVersionId);
        }
        if (plotId != null) {
            plotRepository.deleteById(plotId);
        }
        if (projectId != null) {
            projectRepository.deleteById(projectId);
        }
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

    private UUID seedPlot() {
        Project project = new Project(UUID.randomUUID(), "Compensation Reference Test Project", "Test City", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();

        Plot plot = new Plot(UUID.randomUUID(), projectId, "CR-101", PlotType.NORMAL,
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

    private List<LedgerEntry> findEntries(UUID associateId, IncomeType type) {
        return ledgerEntryRepository.findAll().stream()
            .filter(e -> associateId.equals(e.getAssociateId()) && e.getIncomeType() == type
                && cycleId.equals(e.getCycleId()))
            .toList();
    }

    @Test
    void closeReproducesTheDocsRound2WorkedExampleTotalForYou() {
        // --- Custom CompensationPlanVersion: the doc's real published rates, effective after
        // genesis (2000-01-01) and before this test's own cycle's periodStart. ---
        CompensationPlanVersion planVersion = new CompensationPlanVersion(
            UUID.randomUUID(), "comp-ref", LocalDate.of(2025, 6, 1),
            new BigDecimal("6.00"), new BigDecimal("7.00"), new BigDecimal("11.00"),
            new BigDecimal("2.00"), BigDecimal.ZERO, new BigDecimal("15.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
        compensationPlanVersionRepository.saveAndFlush(planVersion);
        planVersionId = planVersion.getId();

        // --- The one Royalty volume slab this example needs (₹40,00,000 -> 1.5%). Scoped to this
        // test's own plan version, not the genesis one V23 seeds, so this test stays hermetic. ---
        RoyaltyBonusRate royaltyRate = new RoyaltyBonusRate(
            UUID.randomUUID(), planVersionId, new BigDecimal("4000000.00"), new BigDecimal("1.5"));
        royaltyBonusRateRepository.saveAndFlush(royaltyRate);
        royaltyRateId = royaltyRate.getId();

        // --- The 3 Reward tiers this example's total (₹80,000) is built from. ---
        RewardTier tier1 = new RewardTier(UUID.randomUUID(), planVersionId, 1, new BigDecimal("500000.00"), new BigDecimal("15000.00"), null);
        rewardTierRepository.saveAndFlush(tier1);
        rewardTier1Id = tier1.getId();
        RewardTier tier2 = new RewardTier(UUID.randomUUID(), planVersionId, 2, new BigDecimal("1000000.00"), new BigDecimal("20000.00"), null);
        rewardTierRepository.saveAndFlush(tier2);
        rewardTier2Id = tier2.getId();
        RewardTier tier3 = new RewardTier(UUID.randomUUID(), planVersionId, 3, new BigDecimal("2000000.00"), new BigDecimal("45000.00"), null);
        rewardTierRepository.saveAndFlush(tier3);
        rewardTier3Id = tier3.getId();

        // --- Tree: you -> A(left)/B(right); A -> C(left)/D(right); B -> E(left)/F(right).
        // Sponsor links: A sponsors C and D, B sponsors E and F. ---
        youId = seedAssociate("cr-you", null, null, null);
        aId = seedAssociate("cr-a", youId, "L", youId);
        bId = seedAssociate("cr-b", youId, "R", youId);
        cId = seedAssociate("cr-c", aId, "L", aId);
        dId = seedAssociate("cr-d", aId, "R", aId);
        eId = seedAssociate("cr-e", bId, "L", bId);
        fId = seedAssociate("cr-f", bId, "R", bId);

        plotId = seedPlot();

        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        cycleRepository.saveAndFlush(cycle);
        cycleId = cycle.getId();

        // Round 2 doc fixture sale amounts.
        seedSale(cId, cycleId, plotId, new BigDecimal("3000000")); // C: ₹30L
        seedSale(dId, cycleId, plotId, new BigDecimal("2000000")); // D: ₹20L
        seedSale(eId, cycleId, plotId, new BigDecimal("2300000")); // E: ₹23L
        seedSale(fId, cycleId, plotId, new BigDecimal("1700000")); // F: ₹17L

        // --- Run the real batch, once. ---
        cycleService.close(cycleId);

        // Your MATCHING: left leg (A's subtree) = C+D = ₹50L, right leg (B's subtree) = E+F = ₹40L
        // -> matched = min(50L,40L) = ₹40L, gross = 40,00,000 * 7% = 2,80,000.
        LedgerEntry youMatching = findEntries(youId, IncomeType.MATCHING).get(0);
        assertThat(youMatching.getGrossAmount()).isEqualByComparingTo("280000.00");

        // A's own MATCHING: min(C=30L, D=20L) = ₹20L, gross = 20,00,000 * 7% = 1,40,000.
        LedgerEntry aMatching = findEntries(aId, IncomeType.MATCHING).get(0);
        assertThat(aMatching.getGrossAmount()).isEqualByComparingTo("140000.00");

        // B's own MATCHING: min(E=23L, F=17L) = ₹17L, gross = 17,00,000 * 7% = 1,19,000.
        LedgerEntry bMatching = findEntries(bId, IncomeType.MATCHING).get(0);
        assertThat(bMatching.getGrossAmount()).isEqualByComparingTo("119000.00");

        // Your two SPONSOR_MATCHING entries: 1,40,000*11% = 15,400 (from A), 1,19,000*11% = 13,090
        // (from B), total 28,490.
        List<LedgerEntry> yourSponsorEntries = findEntries(youId, IncomeType.SPONSOR_MATCHING);
        assertThat(yourSponsorEntries).hasSize(2);
        BigDecimal sponsorTotal = yourSponsorEntries.stream()
            .map(LedgerEntry::getGrossAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(sponsorTotal).isEqualByComparingTo("28490.00");

        // Your ROYALTY: matched volume ₹40,00,000 hits the ₹40L slab (1.5%) -> 60,000.
        LedgerEntry youRoyalty = findEntries(youId, IncomeType.ROYALTY).get(0);
        assertThat(youRoyalty.getGrossAmount()).isEqualByComparingTo("60000.00");

        // Your REWARD: cumulativeMatchedVolume 0 -> ₹40,00,000 this cycle, all 3 configured tiers
        // (₹5L, ₹10L, ₹20L) cleared in sequence -- 15,000 + 20,000 + 45,000 = 80,000.
        List<LedgerEntry> yourRewardEntries = findEntries(youId, IncomeType.REWARD);
        assertThat(yourRewardEntries).hasSize(3);
        BigDecimal rewardTotal = yourRewardEntries.stream()
            .map(LedgerEntry::getGrossAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(rewardTotal).isEqualByComparingTo("80000.00");

        // The doc's own stated grand total (₹4,48,490) is a GROSS sum across MATCHING +
        // SPONSOR_MATCHING + ROYALTY + REWARD -- the worked example never applies deductions. Do
        // not "fix" this to netAmount; that would silently break this doc cross-check.
        BigDecimal grandGrossTotal = youMatching.getGrossAmount()
            .add(sponsorTotal)
            .add(youRoyalty.getGrossAmount())
            .add(rewardTotal);
        assertThat(grandGrossTotal).isEqualByComparingTo("448490.00");
    }
}
