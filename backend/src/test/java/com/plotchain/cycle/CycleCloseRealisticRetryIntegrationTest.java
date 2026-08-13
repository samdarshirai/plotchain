package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
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
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

// Cycle-management unit 10 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
// Testing section, line 117, and this unit's own title "safely re-runnable end-to-end"):
// CycleCloseRollbackTest already proves the rollback MECHANISM works, but against a near-empty
// single-Admin-node fixture and a failure forced at the very first write (step 2, right after the
// CALCULATING flip). This test forces the failure much LATER -- inside creditReward (step 7),
// after Matching, Rank progression, and Sponsor Matching have all already run and issued writes
// within the same uncommitted transaction -- against a REAL multi-node tree with real sales.
// (Royalty, step 6, runs too but no-ops: this fixture seeds every associate at Silver with no
// RoyaltyBonusRate configured for it, so no Royalty entry is ever created here to roll back.)
// It proves (a) that a late failure still rolls back every already-attempted write, not just the
// placeholder ones, and (b) that a genuine second close() call on the same cycle, with the
// failure removed, succeeds cleanly with fully correct numbers -- not merely "didn't crash."
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseRealisticRetryIntegrationTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired LegVolumeRepository legVolumeRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;

    @MockBean RewardTierRepository rewardTierRepository;

    // V13__seed_default_rank_tiers.sql's lowest-order seeded rank -- same convention
    // CycleCloseSponsorMatchingIntegrationTest/CycleCloseRewardIntegrationTest already use.
    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    private UUID cycleId;
    private UUID adminId;
    private UUID b1Id;
    private UUID b2Id;
    private UUID c1Id;
    private UUID c2Id;
    private UUID sId;
    private UUID projectId;
    private UUID plotId;

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
        for (UUID id : new UUID[] {c1Id, c2Id, b1Id, b2Id, adminId, sId}) {
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

    private UUID seedAssociate(String userId, UUID parentId, String position, UUID sponsorId, AssociateRole role) {
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
        associate.setRankId(role == AssociateRole.ASSOCIATE ? SILVER_RANK_ID : null);
        associate.setUserId(userId);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(role);
        associateRepository.saveAndFlush(associate);
        return id;
    }

    private UUID seedPlot() {
        Project project = new Project(UUID.randomUUID(), "Retry Test Project", "Test City", null, null, Instant.now());
        projectRepository.saveAndFlush(project);
        projectId = project.getId();

        Plot plot = new Plot(UUID.randomUUID(), projectId, "RT-101", PlotType.NORMAL,
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
    void midBatchFailureOnARealMultiNodeTreeRollsBackCompletelyThenARetrySucceedsWithCorrectNumbers() {
        sId = seedAssociate("retry-s", null, null, null, AssociateRole.ASSOCIATE);
        adminId = seedAssociate("retry-admin", null, null, null, AssociateRole.ADMIN);
        b1Id = seedAssociate("retry-b1", adminId, "L", sId, AssociateRole.ASSOCIATE);
        b2Id = seedAssociate("retry-b2", adminId, "R", null, AssociateRole.ASSOCIATE);
        c1Id = seedAssociate("retry-c1", b1Id, "L", null, AssociateRole.ASSOCIATE);
        c2Id = seedAssociate("retry-c2", b1Id, "R", null, AssociateRole.ASSOCIATE);
        plotId = seedPlot();

        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        cycleRepository.saveAndFlush(cycle);
        cycleId = cycle.getId();

        seedSale(c1Id, cycleId, plotId, new BigDecimal("100"));
        seedSale(c2Id, cycleId, plotId, new BigDecimal("40"));
        seedSale(b2Id, cycleId, plotId, new BigDecimal("30"));

        // First call: RewardTierRepository throws on its single invocation inside creditReward --
        // by then, Matching (b1, admin), rank progression, and Sponsor Matching (S) have all
        // already executed and written to the persistence context, uncommitted.
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(any(UUID.class)))
            .thenThrow(new RuntimeException("simulated late mid-batch failure"))
            .thenReturn(List.of());

        assertThatThrownBy(() -> cycleService.close(cycleId)).isInstanceOf(RuntimeException.class);

        // --- Full rollback: cycle back to OPEN, zero entries/legvolume for this cycle, associate
        // state exactly as it was before the call. ---
        Cycle cycleAfterFailure = cycleRepository.findById(cycleId).orElseThrow();
        assertThat(cycleAfterFailure.getStatus()).isEqualTo(CycleStatus.OPEN);

        long ledgerEntriesAfterFailure = ledgerEntryRepository.findAll().stream()
            .filter(e -> cycleId.equals(e.getCycleId())).count();
        assertThat(ledgerEntriesAfterFailure).isZero();

        long legVolumesAfterFailure = legVolumeRepository.findAll().stream()
            .filter(lv -> cycleId.equals(lv.getCycleId())).count();
        assertThat(legVolumesAfterFailure).isZero();

        Associate b1AfterFailure = associateRepository.findById(b1Id).orElseThrow();
        assertThat(b1AfterFailure.getCumulativeMatchedVolume()).isEqualByComparingTo("0");
        assertThat(b1AfterFailure.getRankId()).isEqualTo(SILVER_RANK_ID); // unchanged

        Associate adminAfterFailure = associateRepository.findById(adminId).orElseThrow();
        assertThat(adminAfterFailure.getCumulativeMatchedVolume()).isEqualByComparingTo("0");

        // --- Retry: same cycle, same call, failure removed (second stubbed invocation returns
        // an empty list -- a legitimate "no reward tiers configured" outcome). ---
        CycleCloseResponse response = cycleService.close(cycleId);

        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);

        Cycle cycleAfterRetry = cycleRepository.findById(cycleId).orElseThrow();
        assertThat(cycleAfterRetry.getStatus()).isEqualTo(CycleStatus.CLOSED);

        // tds/admin/net are computed in Java to full precision but ledger_entry's columns are
        // NUMERIC(14,2) (V1__create_dashboard_tables.sql) -- the DB rounds HALF_UP to 2 decimal
        // places on persist, independently per column (verified empirically against this suite's
        // exact H2 2.2.224/MODE=PostgreSQL datasource, same as CycleCloseFullPipelineIntegrationTest).
        // grossAmount lands on exact 2dp already in every entry below, unaffected.
        LedgerEntry b1Matching = ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(b1Id, cycleId, IncomeType.MATCHING)
            .orElseThrow(() -> new AssertionError("expected a MATCHING entry for b1 after retry"));
        assertThat(b1Matching.getGrossAmount()).isEqualByComparingTo("2.80");
        // tds = 2.80 * 2% = 0.056 unrounded -> DB rounds HALF_UP to 0.06.
        assertThat(b1Matching.getTdsDeduction()).isEqualByComparingTo("0.06");
        assertThat(b1Matching.getAdminDeduction()).isEqualByComparingTo("0.42");
        // net = 2.80 - 0.056(tds) - 0.42(admin) = 2.324 unrounded -> DB rounds HALF_UP to 2.32.
        assertThat(b1Matching.getNetAmount()).isEqualByComparingTo("2.32");

        LedgerEntry adminMatching = ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(adminId, cycleId, IncomeType.MATCHING)
            .orElseThrow(() -> new AssertionError("expected a MATCHING entry for admin after retry"));
        assertThat(adminMatching.getGrossAmount()).isEqualByComparingTo("2.10");
        // net = 2.10 - 0.042(tds) - 0.315(admin) = 1.743 unrounded -> DB rounds HALF_UP to 1.74.
        assertThat(adminMatching.getNetAmount()).isEqualByComparingTo("1.74");

        List<LedgerEntry> sponsorEntries = ledgerEntryRepository.findAll().stream()
            .filter(e -> sId.equals(e.getAssociateId()) && e.getIncomeType() == IncomeType.SPONSOR_MATCHING
                && cycleId.equals(e.getCycleId()))
            .toList();
        assertThat(sponsorEntries).hasSize(1);
        assertThat(sponsorEntries.get(0).getGrossAmount()).isEqualByComparingTo("0.14");
        // net = 0.14 - 0.0028(tds) - 0.021(admin) = 0.1162 unrounded -> DB rounds HALF_UP to 0.12.
        assertThat(sponsorEntries.get(0).getNetAmount()).isEqualByComparingTo("0.12");
        assertThat(sponsorEntries.get(0).getSourceRef()).isEqualTo(b1Matching.getId());

        long ledgerEntriesAfterRetry = ledgerEntryRepository.findAll().stream()
            .filter(e -> cycleId.equals(e.getCycleId())).count();
        assertThat(ledgerEntriesAfterRetry).isEqualTo(3); // 2 MATCHING + 1 SPONSOR_MATCHING; no ROYALTY/REWARD configured

        // Scoped to this test's own fixture associates: V18__seed_founding_admin.sql permanently
        // seeds one real ADMIN row (parent_id = NULL) in every test run, which close() correctly
        // sweeps in as its own extra tree root (Decision #2), adding its own zero-value LegVolume
        // row under this same cycleId. Filtering by cycleId alone no longer isolates this test's
        // own tree from that real seeded row, so this filters to the known fixture IDs too.
        long legVolumesAfterRetry = legVolumeRepository.findAll().stream()
            .filter(lv -> cycleId.equals(lv.getCycleId()))
            .filter(lv -> Set.of(sId, adminId, b1Id, b2Id, c1Id, c2Id).contains(lv.getAssociateId()))
            .count();
        assertThat(legVolumesAfterRetry).isEqualTo(6); // admin, b1, b2, c1, c2, S

        Associate b1AfterRetry = associateRepository.findById(b1Id).orElseThrow();
        assertThat(b1AfterRetry.getCumulativeMatchedVolume()).isEqualByComparingTo("40");
        assertThat(b1AfterRetry.getRankId()).isEqualTo(SILVER_RANK_ID); // 40 doesn't cross any real seeded tier beyond Silver

        Associate adminAfterRetry = associateRepository.findById(adminId).orElseThrow();
        assertThat(adminAfterRetry.getCumulativeMatchedVolume()).isEqualByComparingTo("30");
    }
}
