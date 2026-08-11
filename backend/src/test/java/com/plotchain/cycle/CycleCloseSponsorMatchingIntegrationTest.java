package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
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
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Cycle-management unit 7 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
// Decision #9): proves the "fresh repository query, not an in-memory carry-over" design decision
// (this unit's plan, Global Constraints) is actually safe. creditMatchingIncome (unit 5) and
// creditSponsorMatching (this unit) both run inside close()'s single @Transactional method;
// creditSponsorMatching's own LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType query
// must see the sponsee's MATCHING entry creditMatchingIncome saved earlier in the SAME transaction,
// before that transaction ever commits. A Mockito-mocked LedgerEntryRepository (CycleServiceTest)
// cannot exercise this -- its save() and findByAssociateIdAndCycleIdAndIncomeType() stubs are
// independent, unrelated to each other. Only a real, Spring-wired repository against a real (H2,
// MODE=PostgreSQL) datasource proves Hibernate's FlushMode.AUTO actually flushes the pending
// MATCHING insert before this later-in-the-same-transaction SELECT runs.
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseSponsorMatchingIntegrationTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired LegVolumeRepository legVolumeRepository;

    // V13__seed_default_rank_tiers.sql's lowest-order seeded rank -- chk_associate_rank_required
    // (V4__user_id_login_and_admin_roles.sql) requires rank_id NOT NULL for role = 'ASSOCIATE',
    // so every associate.setRole(ASSOCIATE) row below needs a real rank_id or the insert fails
    // the DB check constraint; this test isn't exercising rank progression, so any seeded tier works.
    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    private UUID cycleId;
    private UUID sponsorId;
    private UUID sponseeId;
    private UUID leftId;
    private UUID rightId;
    private UUID projectId;
    private UUID plotId;

    @AfterEach
    void cleanUp() {
        if (cycleId != null) {
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
        }
        for (UUID id : new UUID[] {leftId, rightId, sponseeId, sponsorId}) {
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
    void closeCreditsSponsorMatchingBasedOnASponseesMatchingEntrySavedEarlierInTheSameTransaction() {
        cycleId = seedOpenCycle();
        // Tree: sponee is a standalone root (parentId null) that earns Matching Income of its own
        // this cycle; sponsor is a SEPARATE associate (also parentId null, no tree relationship at
        // all to sponsee) linked only via sponsee.sponsorId. This isolates the property under
        // test -- sponsorship crediting -- from leg-volume/parent-child mechanics entirely.
        sponsorId = seedAssociate("sponsor01", null, null, null);
        sponseeId = seedAssociate("sponsee01", null, null, sponsorId);
        leftId = seedAssociate("leftleaf01", sponseeId, "L", null);
        rightId = seedAssociate("rightleaf01", sponseeId, "R", null);
        plotId = seedPlot();
        seedSale(leftId, cycleId, plotId, new BigDecimal("100"));
        seedSale(rightId, cycleId, plotId, new BigDecimal("100"));

        cycleService.close(cycleId);

        // Sponsee's own Matching entry: matched volume = min(100,100) = 100, gross = 100 * 7.00%
        // (V8-seeded plan version's matching_income_pct) = 7.00.
        LedgerEntry sponseeMatchingEntry = ledgerEntryRepository
            .findByAssociateIdAndCycleIdAndIncomeType(sponseeId, cycleId, IncomeType.MATCHING)
            .orElseThrow(() -> new AssertionError("expected a MATCHING entry for the sponsee"));
        assertThat(sponseeMatchingEntry.getGrossAmount()).isEqualByComparingTo("7.00");

        // The critical assertion: creditSponsorMatching's fresh query, running LATER in the SAME
        // transaction as creditMatchingIncome's save() above, found this exact entry -- proving
        // Hibernate's auto-flush made the uncommitted insert visible, not stale/missing data.
        List<LedgerEntry> sponsorEntries = ledgerEntryRepository.findAll().stream()
            .filter(e -> e.getAssociateId().equals(sponsorId) && e.getIncomeType() == IncomeType.SPONSOR_MATCHING)
            .toList();
        assertThat(sponsorEntries).hasSize(1);
        LedgerEntry sponsorEntry = sponsorEntries.get(0);
        assertThat(sponsorEntry.getSourceRef()).isEqualTo(sponseeMatchingEntry.getId());
        // gross = 7.00 (sponsee's Matching gross) * 5.00% (V8-seeded sponsor_matching_pct) = 0.3500
        assertThat(sponsorEntry.getGrossAmount()).isEqualByComparingTo("0.35");
    }
}
