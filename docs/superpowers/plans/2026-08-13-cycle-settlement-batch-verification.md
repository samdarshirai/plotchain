# Cycle Management Unit 10: Settlement Batch Atomic + Safely Re-Runnable End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the one real gap unit 10 exists to close: prove, with two new tests against real data on a real multi-level tree, that `CycleService.close()`'s settlement batch (a) produces hand-computable-correct numbers across *every* income type, rank progression, and KYC-gating simultaneously on one coherent tree (not one concern at a time in isolation), and (b) rolls back completely and retries cleanly when a realistic, non-trivial batch run fails partway through — the two testing-section bars (`docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md`, lines 116–117) that no existing test currently clears.

**Architecture: this unit is test-only. Zero production code changes.** Verified below (see "Why this is test-only, not new production code") — every settlement-batch flow step (1–8) is already implemented (`CycleService.close()`, merged across units 3–9), the row-lock/rollback/retry mechanism (Decisions #1/#2/#3) is already structurally in place and already covered by `CycleCloseRollbackTest` and `CycleCloseConcurrencyTest`, and the spec's Testing section's two uncovered claims are provable by writing tests against the existing implementation, not by changing it. Two new `@SpringBootTest` integration test classes are added; nothing in `backend/src/main/java` is touched.

**Tech Stack:** JUnit 5 + `@SpringBootTest` + `@ActiveProfiles("test")`, real H2 (`MODE=PostgreSQL`) datasource via Flyway-applied migrations, Mockito `@MockBean` (Task 2 only, to force a late mid-batch failure) — matches `CycleCloseRollbackTest`/`CycleCloseConcurrencyTest`/`CycleCloseSponsorMatchingIntegrationTest`/`CycleCloseRewardIntegrationTest`'s existing conventions exactly.

## Why this is test-only, not new production code

Confirmed by reading the current implementation and every existing cycle-management test directly (not assumed):

- `CycleService.close()` (`backend/src/main/java/com/plotchain/cycle/CycleService.java:124-190`) already implements settlement batch flow steps 1–8 in one `@Transactional` method: row lock + OPEN check (step 1), leg-volume rollup (step 2, `rollUpLegVolumes`/`rollUpSubtree`), Matching Income (step 3, `creditMatchingIncome`), rank progression (step 4, `advanceRanks`), Sponsor Matching (step 5, `creditSponsorMatching`), Royalty (step 6, `creditRoyalty`), Reward (step 7, `creditReward`), close-and-reopen (step 8). Units 3 through 9 built this incrementally; unit 9 (Reward) was the last flow step, already merged.
- `CycleCloseRollbackTest` (`backend/src/test/java/com/plotchain/cycle/CycleCloseRollbackTest.java`) already proves a mid-batch exception rolls back the whole transaction — including the `OPEN → CALCULATING` flip — leaving the cycle exactly `OPEN`. It does this with a **minimal fixture**: one root `Admin` associate, zero children, `LegVolumeRepository.saveAll` mocked to throw immediately after the `CALCULATING` flip (the very first write after step 1). It proves the *mechanism* works; it does not prove a realistic multi-step batch (with real Matching/Sponsor-Matching/Royalty/Reward writes already attempted before the failure) rolls back just as cleanly, and it never exercises a genuine second `close()` call afterward.
- `CycleCloseConcurrencyTest` (`backend/src/test/java/com/plotchain/cycle/CycleCloseConcurrencyTest.java`) already proves the `SELECT ... FOR UPDATE` row lock (Decision #2) serializes two concurrent `POST /close` calls against the same cycle: the second blocks until the first's transaction resolves, then either succeeds (`secondCloseBlocksUntilFirstTransactionResolvesThenSucceedsIfStatusIsStillOpen`, if the first left the cycle `OPEN`) or gets `CycleAlreadyClosedException` (`secondCloseBlocksUntilFirstTransactionResolvesThenGets409IfFirstClosedTheCycle`, if the first succeeded). **This is the spec's "Concurrency test" (testing section, line 118) in full — no new concurrency test is added by this plan.**
- `CycleCloseSponsorMatchingIntegrationTest` and `CycleCloseRewardIntegrationTest` each prove exactly one income type's own cross-call correctness in isolation (same-transaction visibility for Sponsor Matching; cross-cycle idempotency for Reward). Neither, nor the ~50 mocked-repository tests in `CycleServiceTest`, exercises a single realistic multi-level tree through the *entire* pipeline with every income type, rank progression, and KYC-gating asserted together against hand-computed numbers — which is exactly what the spec's testing section (line 116) describes and what unit 10's own title ("safely re-runnable end-to-end") asks for with *real* data, not the rollback test's near-empty fixture.

Nothing here points to a missing behavior in `CycleService` — every gap is a missing *test* against behavior that units 3–9 already built and already partially tested. This plan adds exactly the two tests needed to close that gap, and nothing else.

## Global Constraints

- **No files under `backend/src/main/java` change.** If either new test fails on first run, do not patch `CycleService` reflexively — treat it as a signal to re-derive the expected numbers by hand first (per `systematic-debugging`), since every number in this plan was hand-computed against the *existing, merged* implementation, not against a hypothesis. A genuine implementation bug surfacing here would be a real, unexpected finding — stop and report it rather than silently patching around it.
- **No new migration.** All schema (`ledger_entry` idempotency constraint, `leg_volume`, `reward_tier`, `royalty_bonus_rate`, `compensation_plan_version`, `rank_tier`) already exists.
- Both new test classes go in `backend/src/test/java/com/plotchain/cycle/`, `@SpringBootTest` + `@ActiveProfiles("test")`, and clean up every row they insert in `@AfterEach` — the shared H2 datasource (`DB_CLOSE_DELAY=-1`, `src/test/resources/application-test.yml`) persists across test classes within one Maven Surefire run, so leftover rows from a failed cleanup can corrupt a *different* test class's "most recent CLOSED cycle" or "most recent effective plan version" lookups. This is the same discipline `CycleCloseRewardIntegrationTest`/`CycleCloseSponsorMatchingIntegrationTest` already follow — not a new constraint invented for this plan.
- **Deletion order in `@AfterEach` must respect foreign keys**, same as the existing integration tests: `ledger_entry`/`leg_volume`/`sale` (all FK to `cycle`) before `cycle`; `associate` (FK to `rank_tier` via `rank_id`) before any test-owned `rank_tier` row; `royalty_bonus_rate`/`reward_tier` (FK to `compensation_plan_version`) before any test-owned `compensation_plan_version` row; `plot` (FK to `project`) before `project`.
- **Dates chosen to avoid colliding with other tests' real-DB rows**, verified by grep against the full test tree before writing this plan (`grep -rn "LocalDate.of(202[4-6]" backend/src/test/java/com/plotchain/{compensation,sales}/*.java`, and a direct search for the exact custom `effectiveFrom` this plan uses): Task 1's custom `CompensationPlanVersion.effectiveFrom` is `2025-06-01` (after the genesis row's `2000-01-01`, before Task 1's own cycle's `periodStart` of `2026-07-01`, and not used by any other test); Task 1's custom `RankTier.rankOrder` is `15` (between `V13__seed_default_rank_tiers.sql`'s seeded Silver=10 and Gold=20; not used by any real-DB-persisted test fixture — `DashboardServiceTest`'s use of `rankOrder=1` is a pure-Mockito unit test, never touches the real datasource, and `AssociateRepositoryTest`/`CompensationPlanVersionRepositoryTest`'s own `rankOrder=1`/`2` rows live inside default `@DataJpaTest` transactional rollback, never persisting past their own test method).
- **`compensation_plan_version.effective_from` has a UNIQUE index** (`idx_compensation_plan_version_effective_from`, V8) and **`rank_tier.rank_order` has a UNIQUE constraint** (V1) — both are why the date/order choices above matter and must not be changed casually.
- Every BigDecimal comparison in both new tests uses AssertJ's `isEqualByComparingTo(...)`, never `isEqualTo(...)` — `BigDecimal.equals()` is scale-sensitive (`5.50` != `5.500000`even though they're the same value), the same convention every existing test in this package already follows.

---

## File Structure

- **Create:** `backend/src/test/java/com/plotchain/cycle/CycleCloseFullPipelineIntegrationTest.java` — Task 1. One real `close()` call against a real, seeded 4-level mixed-L/R tree (8 associates, including a prior-CLOSED-cycle carry-forward, a KYC-unverified associate, and a pre-existing higher rank that must not regress), asserting hand-computed values for leg-volume rollup, Matching, carried-forward excess, Sponsor Matching, rank advancement (including never-demotes and Admin-skipped), Royalty at the post-advancement rank, Reward (including Admin-participates and KYC-gating), all in one test method.
- **Create:** `backend/src/test/java/com/plotchain/cycle/CycleCloseRealisticRetryIntegrationTest.java` — Task 2. A real, seeded 3-level tree with real sales, a forced failure late in the pipeline (inside `creditReward`, step 7 — after Matching/Rank/Sponsor-Matching/Royalty have already run and issued their writes within the same uncommitted transaction), asserting full rollback (cycle back to `OPEN`, zero `LedgerEntry`/`LegVolume` rows for this cycle, associate state unchanged), then a second, genuine `close()` call on the same cycle succeeding with the fully correct set of entries.

No other files change.

---

## Task 1: Full-pipeline hand-computed fixture test

**Files:**
- Create: `backend/src/test/java/com/plotchain/cycle/CycleCloseFullPipelineIntegrationTest.java`

**Interfaces:**
- Consumes: `CycleService.close(UUID): CycleCloseResponse` (existing, Spring-wired, unchanged). `AssociateRepository`, `CycleRepository`, `SaleRepository`, `LedgerEntryRepository`, `LegVolumeRepository`, `RankTierRepository`, `RoyaltyBonusRateRepository`, `RewardTierRepository`, `CompensationPlanVersionRepository`, `ProjectRepository`, `PlotRepository` (all existing Spring beans).
- Produces: nothing for other tasks to consume — this is a leaf verification task.

### Fixture tree

```
                    admin (ADMIN, KYC verified, sponsored by S)
                   /                                          \
                b1 (L, KYC PENDING, sponsored by S)          b2 (R, KYC verified)
               /                                     \             /            \
        c1 (L, KYC verified,                    c2 (R,       c3 (L,          d (R,
        pre-existing rank TestGold,              KYC verified) KYC verified) KYC verified,
        cumulativeMatchedVolume=5)                                            no sale)

  S (KYC verified, standalone — sponsors both admin and b1, no tree relationship to either)
```

- `c1` sells `100`, `c2` sells `50`, `c3` sells `30`, `d` sells nothing this cycle.
- `b1` carries forward `20` (left) / `5` (right) from a seeded prior `CLOSED` cycle's `LegVolume` row (mirrors `CycleServiceTest`'s already-hand-verified rollup fixture, `closeComputesLegVolumeRollupTreeWideOnAMixedFixtureTreeAndWritesOneRowPerAssociate`, now proven against a real DB instead of mocks).
- `c1` starts this cycle already at a custom higher rank (`TestGold`, seeded below) with `cumulativeMatchedVolume=5` — below `TestGold`'s own threshold — so this cycle's rank re-evaluation would, taken alone, only qualify `c1` for `Silver`. `c1` gets no sales-driven volume increase this cycle (it's a leaf with no children, so it never earns a Matching entry of its own). Asserting `c1.rankId` is *still* `TestGold` afterward is this test's never-demotes proof.
- `b1` is `KYC PENDING` (unverified) — its Matching/Royalty/Reward entries must land `CARRIED_FORWARD`, not `PENDING`. Everyone else is `KYC VERIFIED`.
- `S` sponsors both `admin` and `b1` — the two associates that actually earn a Matching entry this cycle — so `S` gets one `SPONSOR_MATCHING` entry per sponsee (itemized, not aggregated), proving Decision #9's "one entry per direct sponsee" directly.

### Hand-computed expected values

Custom `CompensationPlanVersion` for this test (`effectiveFrom = 2025-06-01`, picked over the genesis `2000-01-01` row since it's more recent and still `<=` this test's cycle's `periodStart` of `2026-07-01`): `matchingIncomePct=10.00`, `sponsorMatchingPct=10.00`, `tdsPct=5.00`, `adminChargeWithoutPanPct=4.00`.

**Leg-volume rollup** (post-order DFS from `admin`):

| Associate | leftLegVolume | rightLegVolume | matched = min(L,R) | carriedForwardLeft after Matching | carriedForwardRight after Matching |
|---|---|---|---|---|---|
| c1, c2, c3, d (leaves) | 0 | 0 | 0 (no entry) | 0 | 0 |
| b1 | 100 + 20 (carry) = 120 | 50 + 5 (carry) = 55 | 55 | 120 − 55 = 65 | 0 |
| b2 | 30 (c3's subtree) | 0 (d's subtree) | 0 (no entry) | 0 (unchanged — no Matching entry written for b2) | 0 |
| admin | 150 (b1's subtree: 100+50) | 30 (b2's subtree) | 30 | 150 − 30 = 120 | 0 |
| S (standalone root, no children) | 0 | 0 | 0 (no entry) | 0 | 0 |

Total `LegVolume` rows written: **8** (one per associate, unconditionally, per Decision #4).

**Matching Income** (Decision #5/#6/#10/#11/#12), `grossAmount = matchedVolume × 10.00%`, `tdsDeduction = gross × 5%`, `adminDeduction = gross × 4%`:

| Associate | matchedVolume | gross | tds | admin | net | status |
|---|---|---|---|---|---|---|
| b1 | 55 | 5.50 | 0.275 | 0.22 | 5.005 | CARRIED_FORWARD (KYC PENDING) |
| admin | 30 | 3.00 | 0.15 | 0.12 | 2.73 | PENDING (KYC VERIFIED) |

`cumulativeMatchedVolume` after this step (Decision #6, raw volume not income): `b1 = 0 + 55 = 55`; `admin = 0 + 30 = 30`; `c1` stays `5` (unchanged — no Matching entry of its own); everyone else stays `0`.

**Rank progression** (Decision #7, role `== ASSOCIATE` only; custom `RankTier` seeded for this test: `TestGold`, `rankOrder=15`, `volumeThreshold=50`, alongside `V13`'s seeded `Silver(rankOrder=10, threshold=0)`, `Gold(rankOrder=20, threshold=100000)`, `Diamond(rankOrder=30, threshold=500000)`, `Crown(rankOrder=40, threshold=1500000)`):

| Associate | cumulativeMatchedVolume | current rank (pre-close) | highest qualifying tier | new rank |
|---|---|---|---|---|
| b1 | 55 | Silver (rankOrder 10) | TestGold (55 ≥ 50, rankOrder 15 > 10) | **TestGold** — advances |
| c1 | 5 | TestGold (rankOrder 15, pre-existing) | Silver only (5 < 50) — rankOrder 10, **not** > 15 | **TestGold unchanged** — never demotes |
| c2, c3, d, S, b2 | 0 | Silver | Silver only | Silver unchanged |
| admin | — (role ADMIN) | — | — | **skipped entirely** — `rankId` stays `null` |

**Sponsor Matching** (Decision #9), `grossAmount = sponsee's Matching gross × 10.00%`, same tds/admin math, credited to `S` (KYC verified → `PENDING`):

| Sponsee | sponsee's Matching gross | S's SPONSOR_MATCHING gross | tds | admin | net | sourceRef |
|---|---|---|---|---|---|---|
| b1 | 5.50 | 0.55 | 0.0275 | 0.022 | 0.5005 | b1's MATCHING entry id |
| admin | 3.00 | 0.30 | 0.015 | 0.012 | 0.273 | admin's MATCHING entry id |

**Royalty** (Decision #7/#10/#11/#12) — a `RoyaltyBonusRate` is seeded **only** for `TestGold` (`royaltyPct=3.00`), deliberately with **none** seeded for `Silver`, so a Royalty entry appearing for `b1` proves the lookup uses `b1`'s *post*-advancement rank (`TestGold`), not its pre-advancement rank (`Silver`, which would find nothing and no-op):

| Associate | role | post-advancement rank | matchedVolume | gross = matchedVolume × 3.00% | tds | admin | net | status |
|---|---|---|---|---|---|---|---|---|
| b1 | ASSOCIATE | TestGold | 55 | 1.65 | 0.0825 | 0.066 | 1.5015 | CARRIED_FORWARD (KYC PENDING) |
| admin | ADMIN | — | — | — | — | — | — | **skipped** (role guard) |

**Reward** (Decision #8, no role guard — applies to Admin) — two `RewardTier`s seeded for this test's plan version: `Tier1(tierLevel=1, threshold=10, cashReward=500.00)`, `Tier2(tierLevel=2, threshold=50, cashReward=2000.00)`. Evaluated against `cumulativeMatchedVolume` *after* the Matching step's increment:

| Associate | cumulativeMatchedVolume | Tier1 (≥10)? | Tier2 (≥50)? | entries |
|---|---|---|---|---|
| admin | 30 | yes → gross 500.00, tds 25.00, admin 20.00, net 455.00, status PENDING | no | 1 entry |
| b1 | 55 | yes → gross 500.00, tds 25.00, admin 20.00, net 455.00, status CARRIED_FORWARD | yes → gross 2000.00, tds 100.00, admin 80.00, net 1820.00, status CARRIED_FORWARD | 2 entries |
| c1, c2, c3, d, S, b2 | 5 or 0 | no | no | 0 entries |

**Totals across the whole batch:** `LegVolume` rows = 8; `LedgerEntry` rows = 2 (MATCHING) + 2 (SPONSOR_MATCHING) + 1 (ROYALTY) + 3 (REWARD) = **8**.

- [ ] **Step 1: Write the test**

Create `backend/src/test/java/com/plotchain/cycle/CycleCloseFullPipelineIntegrationTest.java`:

```java
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
            UUID.randomUUID(), "full-pipeline-test", LocalDate.of(2025, 6, 1),
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
        assertThat(response.legVolumeRowsWritten()).isEqualTo(8);

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
        LedgerEntry b1Matching = findEntry(b1Id, IncomeType.MATCHING);
        assertThat(b1Matching.getGrossAmount()).isEqualByComparingTo("5.50");
        assertThat(b1Matching.getTdsDeduction()).isEqualByComparingTo("0.275");
        assertThat(b1Matching.getAdminDeduction()).isEqualByComparingTo("0.22");
        assertThat(b1Matching.getNetAmount()).isEqualByComparingTo("5.005");
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
        assertThat(sponsorFromB1.getNetAmount()).isEqualByComparingTo("0.5005");
        assertThat(sponsorFromB1.getStatus()).isEqualTo(LedgerEntryStatus.PENDING); // S is KYC VERIFIED
        LedgerEntry sponsorFromAdmin = sponsorEntries.stream()
            .filter(e -> e.getSourceRef().equals(adminMatching.getId())).findFirst().orElseThrow();
        assertThat(sponsorFromAdmin.getGrossAmount()).isEqualByComparingTo("0.30");
        assertThat(sponsorFromAdmin.getNetAmount()).isEqualByComparingTo("0.273");

        // --- Royalty: b1 only, at the POST-advancement (TestGold) rate -- no rate exists for
        // Silver, so this entry existing at all proves the post-advancement lookup. Admin skipped. ---
        LedgerEntry b1Royalty = findEntry(b1Id, IncomeType.ROYALTY);
        assertThat(b1Royalty.getGrossAmount()).isEqualByComparingTo("1.65");
        assertThat(b1Royalty.getNetAmount()).isEqualByComparingTo("1.5015");
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
```

- [ ] **Step 2: Run the test**

Run: `cd backend && mvn -q test -Dtest=CycleCloseFullPipelineIntegrationTest`

Expected: **PASS.** Every number above was hand-computed directly against `CycleService.close()`'s current, merged implementation (`rollUpSubtree`, `creditMatchingIncome`, `advanceRanks`, `creditSponsorMatching`, `creditRoyalty`, `creditReward` — all read in full while writing this plan). If any assertion fails, do not patch `CycleService` to make it pass — first re-verify the hand computation against the actual source in `backend/src/main/java/com/plotchain/cycle/CycleService.java`; a real mismatch between this plan's math and the implementation is either a fixture bug in this test or a genuine, previously-undetected implementation defect, and the two require different fixes. Report which before changing anything.

- [ ] **Step 3: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/cycle/CycleCloseFullPipelineIntegrationTest.java
git commit -m "test(cycle): full-pipeline hand-computed fixture across every income type, rank, and KYC-gating"
```

---

## Task 2: Realistic mid-batch failure — full rollback, then a genuine successful retry

**Files:**
- Create: `backend/src/test/java/com/plotchain/cycle/CycleCloseRealisticRetryIntegrationTest.java`

**Interfaces:**
- Consumes: `CycleService.close(UUID): CycleCloseResponse` (existing, Spring-wired, unchanged). `RewardTierRepository` (mocked via `@MockBean` — the only mocked dependency, everything else real). Same repositories as Task 1, minus the compensation/rank customization (this test reuses the genesis `CompensationPlanVersion` and the seeded `Silver` rank, same as `CycleCloseSponsorMatchingIntegrationTest`/`CycleCloseRewardIntegrationTest` already do).
- Produces: nothing for other tasks to consume — leaf verification task.

### Why `RewardTierRepository` is the failure point

`creditReward` (step 7) is the **last** substantive step before the `CLOSED` flip — by the time it runs, `creditMatchingIncome` (step 3), `advanceRanks` (step 4), `creditSponsorMatching` (step 5), and `creditRoyalty` (step 6) have all already executed and issued their `INSERT`/`UPDATE` statements against Hibernate's persistence context, inside the same still-open transaction. Forcing the failure here (rather than `CycleCloseRollbackTest`'s existing step-2 failure, which fires before any substantive write happens at all) proves rollback undoes real, already-attempted multi-step work, not just an empty batch's placeholder writes. `RewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(...)` is called exactly once per `close()` call (at the top of `creditReward`), so `Mockito.when(...).thenThrow(...).thenReturn(...)` chaining makes the first `close()` call's single invocation throw and the second call's single invocation return an empty list (a legitimate "no reward tiers configured" outcome) — no reconfiguration between calls needed.

### Fixture tree (real data, not the rollback test's near-empty single-node fixture)

```
              admin (ADMIN)
             /             \
           b1 (L)          b2 (R, sells 30)
          /      \
    c1 (L,       c2 (R,
    sells 100)   sells 40)

  S (standalone) sponsors b1
```

Uses the genesis `CompensationPlanVersion` (`id=00000000-0000-0000-0000-000000000001`, seeded by `V8__compensation_plan.sql`: `matchingIncomePct=7.00`, `sponsorMatchingPct=5.00`, `tdsPct=2.00`, `adminChargeWithoutPanPct=15.00`) and the genesis `Silver` rank (`00000000-0000-0000-0000-000000000201`) for every `ASSOCIATE`-role associate — same convention `CycleCloseSponsorMatchingIntegrationTest`/`CycleCloseRewardIntegrationTest` already rely on, so no new plan-version or rank-tier row is seeded by this test.

**Rollup:** `b1`: left=100 (c1), right=40 (c2), matched=`min(100,40)=40`. `admin`: left=140 (b1's subtree), right=30 (b2's own sale, b2 is a leaf), matched=`min(140,30)=30`. `b2` itself: leaf, no Matching entry.

**Hand-computed values for the retry's success assertions** (genesis rates: `matchingIncomePct=7.00`, `sponsorMatchingPct=5.00`, `tdsPct=2.00`, `adminChargeWithoutPanPct=15.00`):

| Entry | gross | tds (×2%) | admin (×15%) | net |
|---|---|---|---|---|
| b1 MATCHING (matched=40) | 40 × 7% = 2.80 | 0.056 | 0.42 | 2.324 |
| admin MATCHING (matched=30) | 30 × 7% = 2.10 | 0.042 | 0.315 | 1.743 |
| S SPONSOR_MATCHING (from b1's 2.80 gross) | 2.80 × 5% = 0.14 | 0.0028 | 0.021 | 0.1162 |

No `RoyaltyBonusRate` is seeded anywhere in the base migrations for `Silver`, so no `ROYALTY` entries are expected. `RewardTierRepository` returns an empty list on the retry (mocked), so no `REWARD` entries are expected either — this test's job is proving atomicity/re-run across a real multi-step batch, not re-deriving Royalty/Reward math a second time (Task 1 already does that exhaustively).

`cumulativeMatchedVolume` after a successful close: `b1 = 0 + 40 = 40`; `admin = 0 + 30 = 30` (Matching has no role guard — Decision #6 applies to every associate, Admin included). `b1.rankId` stays `Silver` (40 doesn't cross any real seeded tier beyond Silver's own `0` threshold).

- [ ] **Step 1: Write the test**

Create `backend/src/test/java/com/plotchain/cycle/CycleCloseRealisticRetryIntegrationTest.java`:

```java
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
// after Matching, Rank progression, Sponsor Matching, and Royalty have all already run and issued
// writes within the same uncommitted transaction -- against a REAL multi-node tree with real
// sales. It proves (a) that late a failure still rolls back every already-attempted write, not
// just the placeholder ones, and (b) that a genuine second close() call on the same cycle, with
// the failure removed, succeeds cleanly with fully correct numbers -- not merely "didn't crash."
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

        LedgerEntry b1Matching = ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(b1Id, cycleId, IncomeType.MATCHING)
            .orElseThrow(() -> new AssertionError("expected a MATCHING entry for b1 after retry"));
        assertThat(b1Matching.getGrossAmount()).isEqualByComparingTo("2.80");
        assertThat(b1Matching.getTdsDeduction()).isEqualByComparingTo("0.056");
        assertThat(b1Matching.getAdminDeduction()).isEqualByComparingTo("0.42");
        assertThat(b1Matching.getNetAmount()).isEqualByComparingTo("2.324");

        LedgerEntry adminMatching = ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(adminId, cycleId, IncomeType.MATCHING)
            .orElseThrow(() -> new AssertionError("expected a MATCHING entry for admin after retry"));
        assertThat(adminMatching.getGrossAmount()).isEqualByComparingTo("2.10");
        assertThat(adminMatching.getNetAmount()).isEqualByComparingTo("1.743");

        List<LedgerEntry> sponsorEntries = ledgerEntryRepository.findAll().stream()
            .filter(e -> sId.equals(e.getAssociateId()) && e.getIncomeType() == IncomeType.SPONSOR_MATCHING
                && cycleId.equals(e.getCycleId()))
            .toList();
        assertThat(sponsorEntries).hasSize(1);
        assertThat(sponsorEntries.get(0).getGrossAmount()).isEqualByComparingTo("0.14");
        assertThat(sponsorEntries.get(0).getNetAmount()).isEqualByComparingTo("0.1162");
        assertThat(sponsorEntries.get(0).getSourceRef()).isEqualTo(b1Matching.getId());

        long ledgerEntriesAfterRetry = ledgerEntryRepository.findAll().stream()
            .filter(e -> cycleId.equals(e.getCycleId())).count();
        assertThat(ledgerEntriesAfterRetry).isEqualTo(3); // 2 MATCHING + 1 SPONSOR_MATCHING; no ROYALTY/REWARD configured

        long legVolumesAfterRetry = legVolumeRepository.findAll().stream()
            .filter(lv -> cycleId.equals(lv.getCycleId())).count();
        assertThat(legVolumesAfterRetry).isEqualTo(6); // admin, b1, b2, c1, c2, S

        Associate b1AfterRetry = associateRepository.findById(b1Id).orElseThrow();
        assertThat(b1AfterRetry.getCumulativeMatchedVolume()).isEqualByComparingTo("40");
        assertThat(b1AfterRetry.getRankId()).isEqualTo(SILVER_RANK_ID); // 40 doesn't cross any real seeded tier beyond Silver

        Associate adminAfterRetry = associateRepository.findById(adminId).orElseThrow();
        assertThat(adminAfterRetry.getCumulativeMatchedVolume()).isEqualByComparingTo("30");
    }
}
```

- [ ] **Step 2: Run the test**

Run: `cd backend && mvn -q test -Dtest=CycleCloseRealisticRetryIntegrationTest`

Expected: **PASS.** Same caveat as Task 1: if an assertion fails, re-verify the hand computation against the real source before touching `CycleService`.

- [ ] **Step 3: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/cycle/CycleCloseRealisticRetryIntegrationTest.java
git commit -m "test(cycle): realistic mid-batch failure rolls back completely, retry succeeds with correct numbers"
```

---

## Task 3: Full regression pass

**Files:** none (verification only).

- [ ] **Step 1: Run the entire cycle-management test surface plus the two new tests together**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest,CycleCloseRollbackTest,CycleCloseConcurrencyTest,CycleCloseSponsorMatchingIntegrationTest,CycleCloseRewardIntegrationTest,CycleCloseFullPipelineIntegrationTest,CycleCloseRealisticRetryIntegrationTest,CycleControllerTest,CycleExceptionHandlerTest,CycleRepositoryTest`

Expected: all PASS, including every pre-existing test unaffected — this plan added zero production code changes, so no existing assertion should move.

- [ ] **Step 2: Run the full backend suite**

Run: `cd backend && mvn -q test`

Expected: PASS. (If Mockito/JDK-mismatch noise appears unrelated to this package — a known pre-existing environment issue on this machine, not something this plan's changes cause — confirm the failures are all outside `com.plotchain.cycle` before treating the run as green.)

- [ ] **Step 3: Update the unit-tracking file**

This is explicitly out of scope for this plan (per the task brief) — marking unit 10 `planned`/`merged` in `docs/superpowers/plans/2026-08-03-cycle-management-units.md` happens at a separate step outside this plan's execution.

---

## Self-review notes

- **Spec coverage:** Testing section line 116 (full-tree hand-computed values across every income type + rank + KYC) → Task 1. Testing section line 117's idempotency-across-real-failure half ("force a mid-batch failure... against a cycle with real sales data; assert the transaction rolled back completely... then call `POST /close` again... and assert it succeeds normally with the full, correct set of entries") → Task 2. Line 117's cross-cycle reward-idempotency half is already covered by the existing `CycleCloseRewardIntegrationTest` — not duplicated here. Testing section line 118 (Concurrency test) is already fully covered by the existing `CycleCloseConcurrencyTest` — not duplicated here, confirmed explicitly in this plan's opening section. Decision #2/#3 (row-lock-first, retry-after-failure) — already structurally implemented and covered by `CycleCloseRollbackTest`; Task 2 adds the *realistic-data* version that test's minimal fixture doesn't reach.
- **Placeholder scan:** every numeric assertion in both tasks is a concrete hand-computed value with its derivation shown in a table; no "TBD"/"add validation"/"similar to Task N" placeholders anywhere.
- **Type/method consistency:** `CycleService.close(UUID): CycleCloseResponse`, `CycleCloseResponse.status()/legVolumeRowsWritten()`, `LedgerEntry` getters, `LegVolume` getters, `Associate` getters/setters, and every repository method signature used in both new test classes were copied verbatim from the actual interfaces read while writing this plan (`AssociateRepository.java`, `CycleRepository.java`, `LedgerEntryRepository.java`, `LegVolumeRepository.java`, `CompensationPlanVersionRepository.java`, `RewardTierRepository.java`, `RoyaltyBonusRateRepository.java`, `RankTierRepository.java`) — no invented method names.
