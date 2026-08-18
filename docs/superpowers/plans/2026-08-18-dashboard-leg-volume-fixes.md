# Leg Volume Gauge — Fix Two Structural Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in `DashboardService.getDashboard`'s leg-volume figures, both found during the final review of the "lifetime Total Left/Right Business" and "New Booked Area" units:

1. `LegVolumeSummary.totalLeftBusiness`/`totalRightBusiness` (lifetime totals) over-count: they naively `SUM(leftLegVolume)`/`SUM(rightLegVolume)` across every `leg_volume` row, but each row already has the *prior* cycle's unmatched carry-forward baked into it — so a long-standing unmatched balance gets counted again on every subsequent cycle it survives, inflating the lifetime total without bound.
2. `LegVolumeSummary.leftVolume`/`rightVolume`/`carriedForwardLeft`/`carriedForwardRight`/`projectedMatchAmount` are structurally always zero in production: `leg_volume` rows are written only at cycle *close* (`CycleService.rollUpSubtree`), keyed to the cycle being closed. The dashboard looks up a row for the currently *open* cycle — a row that, by construction, never exists — so it always falls through to `LegVolume.empty()`.

**Architecture:** Both bugs live in the same `DashboardService.getDashboard` code block and the same `LegVolumeRepository`. Fix: (a) `DashboardService` looks up the associate's most-recently-*closed* cycle's `LegVolume` row for "current standing" instead of the open cycle's (never-existing) row; (b) lifetime totals are computed by walking every `LegVolume` row for the associate in the chronological order its cycle actually closed, subtracting each row's *incoming* carry (its predecessor's outgoing `carriedForwardLeft`/`Right`, `0` for the associate's first row) before summing — leaving exactly the new subtree volume each cycle contributed, with no double count. `LegVolumeRepository` gains one new query (`findByAssociateIdOrderByCyclePeriodStartAsc`, joining `Cycle` for ordering — the same ad-hoc-join pattern `SaleRepository` already uses to join `Plot`) and loses the two now-provably-wrong `sumLeft/RightLegVolumeByAssociateId` aggregate queries.

**Tech Stack:** Spring Boot 3.3.x (Java 21), Spring Data JPA, `@DataJpaTest` against H2 (MODE=PostgreSQL), JUnit 5 + Mockito + AssertJ.

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` §2 ("Total Left/Right Business" semantics — a true lifetime sum was the decision; this plan fixes the *implementation* of that decision, not the decision itself) and §3.1 (`LegVolumeSummary` field table). Both bugs were found during subagent-driven-development final-branch reviews of the units that shipped `totalLeftBusiness`/`totalRightBusiness` (`docs/superpowers/plans/2026-08-18-dashboard-lifetime-leg-business.md`) and `newBookedAreaSqft` (`docs/superpowers/plans/2026-08-18-dashboard-new-booked-area.md`), not documented in a standalone finding doc — this plan is that write-up.

## Global Constraints

- `0` (via `COALESCE`/an empty walk), never `null` or an exception, for an associate with zero `leg_volume` rows or zero closed cycles (brand new, never been through a cycle close) — same "no-op, not a failure" convention every other aggregate on this dashboard follows.
- No migration, no schema change — every fixed field already exists on `LegVolumeSummary`/`leg_volume`. This plan only changes which rows get read and how they get combined.
- `DashboardControllerTest` runs a real `DashboardService` behind `@MockBean`-mocked repository interfaces (never a `@MockBean` on the concrete service) — any new repository method this plan's `DashboardService` changes call must get a matching `@MockBean` stub in that test, or the unstubbed mock returns `null`/empty-default and the real code NPEs at runtime, not compile time.
- Currency/number values render unchanged on the frontend — this plan is backend-only; no frontend file changes.

---

### Task 1: `LegVolumeRepository` — replace the double-counting sum queries with a chronological-order query

**Files:**
- Modify: `backend/src/main/java/com/plotchain/legvolume/LegVolumeRepository.java`
- Modify (rewrite): `backend/src/test/java/com/plotchain/legvolume/LegVolumeRepositoryTest.java`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LegVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(UUID associateId)` returning `List<LegVolume>`, ordered oldest-cycle-first, scoped to that associate, empty list (never `null`) when the associate has no rows. Task 2's `DashboardService` calls this directly and iterates it in order.
- Removes: `sumLeftLegVolumeByAssociateId(UUID)` and `sumRightLegVolumeByAssociateId(UUID)` — both provably wrong (see Goal above) and, after Task 2, unused by any caller.

- [ ] **Step 1: Write the failing repository test (full rewrite)**

Replace `backend/src/test/java/com/plotchain/legvolume/LegVolumeRepositoryTest.java` entirely:

```java
package com.plotchain.legvolume;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.rank.RankTier;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Dashboard leg-volume fix plan (docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md,
// Task 1): DashboardService walks this list in chronological order to subtract each row's
// incoming carry-forward before summing lifetime totals (Task 2) -- proving the ORDER BY actually
// orders by when each cycle closed, not row-insertion order or id, is the whole point of this
// test; a mocked repository can't exercise a real ORDER BY.
@DataJpaTest
@ActiveProfiles("test")
class LegVolumeRepositoryTest {

    @Autowired
    LegVolumeRepository legVolumeRepository;

    @Autowired
    TestEntityManager entityManager;

    private int rankOrderCounter = 1;

    private Associate seedAssociate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", rankOrderCounter++, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate associate = new Associate();
        UUID id = UUID.randomUUID();
        associate.setId(id);
        associate.setName("Test Associate");
        associate.setRankId(rank.getId());
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        entityManager.persist(associate);
        return associate;
    }

    private Cycle seedCycle(LocalDate periodStart) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(periodStart);
        cycle.setPeriodEnd(periodStart.plusDays(14));
        cycle.setStatus(CycleStatus.CLOSED);
        entityManager.persist(cycle);
        return cycle;
    }

    @Test
    void ordersRowsByWhenTheirCycleActuallyClosedNotByInsertionOrder() {
        Associate associate = seedAssociate();
        Cycle newer = seedCycle(LocalDate.of(2026, 8, 1));
        Cycle older = seedCycle(LocalDate.of(2026, 7, 1));
        // Insert the newer cycle's row FIRST -- if the query ordered by insertion/id instead of
        // c.periodStart, this row would come back first too, and the test would still pass by
        // accident. Inserting out of chronological order is what makes the ORDER BY load-bearing.
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), associate.getId(), newer.getId(),
            new BigDecimal("300000"), new BigDecimal("200000"), BigDecimal.ZERO, BigDecimal.ZERO));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), associate.getId(), older.getId(),
            new BigDecimal("100000"), new BigDecimal("50000"), BigDecimal.ZERO, BigDecimal.ZERO));

        List<LegVolume> rows = legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associate.getId());

        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getCycleId()).isEqualTo(older.getId());
        assertThat(rows.get(1).getCycleId()).isEqualTo(newer.getId());
    }

    @Test
    void excludesLegVolumeRowsForADifferentAssociate() {
        Associate target = seedAssociate();
        Associate other = seedAssociate();
        Cycle cycle = seedCycle(LocalDate.of(2026, 7, 1));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), target.getId(), cycle.getId(),
            new BigDecimal("100000"), new BigDecimal("50000"), BigDecimal.ZERO, BigDecimal.ZERO));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), other.getId(), cycle.getId(),
            new BigDecimal("999999"), new BigDecimal("999999"), BigDecimal.ZERO, BigDecimal.ZERO));

        List<LegVolume> rows = legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(target.getId());

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).getLeftLegVolume()).isEqualByComparingTo("100000");
    }

    @Test
    void returnsEmptyListNotNullWhenTheAssociateHasNoLegVolumeRowsYet() {
        Associate associate = seedAssociate();

        List<LegVolume> rows = legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associate.getId());

        assertThat(rows).isEmpty();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=LegVolumeRepositoryTest -pl . -q`
Expected: compile error — `LegVolumeRepository` has no `findByAssociateIdOrderByCyclePeriodStartAsc` method yet (and `sumLeftLegVolumeByAssociateId`/`sumRightLegVolumeByAssociateId`, which the old test file called, are about to be deleted from the interface too — this new test file doesn't reference them, so once the interface changes in Step 3 this file compiles clean).

- [ ] **Step 3: Replace the two sum queries with the ordered-list query**

In `backend/src/main/java/com/plotchain/legvolume/LegVolumeRepository.java`, currently:

```java
package com.plotchain.legvolume;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

public interface LegVolumeRepository extends JpaRepository<LegVolume, UUID> {
    Optional<LegVolume> findByAssociateIdAndCycleId(UUID associateId, UUID cycleId);

    // Lifetime totals (dashboard's "Total Left/Right Business"): every cycle close writes a NEW
    // LegVolume row per associate (CycleService#rollUpSubtree), so this genuinely aggregates
    // across all of them -- not a single-cycle read. COALESCE avoids returning null for an
    // associate with no leg_volume rows yet.
    @Query("SELECT COALESCE(SUM(l.leftLegVolume), 0) FROM LegVolume l WHERE l.associateId = :associateId")
    BigDecimal sumLeftLegVolumeByAssociateId(@Param("associateId") UUID associateId);

    @Query("SELECT COALESCE(SUM(l.rightLegVolume), 0) FROM LegVolume l WHERE l.associateId = :associateId")
    BigDecimal sumRightLegVolumeByAssociateId(@Param("associateId") UUID associateId);
}
```

change to:

```java
package com.plotchain.legvolume;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LegVolumeRepository extends JpaRepository<LegVolume, UUID> {
    Optional<LegVolume> findByAssociateIdAndCycleId(UUID associateId, UUID cycleId);

    // Lifetime Total Left/Right Business (docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md):
    // each row's leftLegVolume/rightLegVolume already has the PRIOR cycle's carriedForward baked
    // in (CycleService#rollUpSubtree), so DashboardService must walk every row for this associate
    // in the order its cycle actually closed and subtract each row's incoming carry before
    // summing -- a naive SUM(leftLegVolume) double-counts a long-lived unmatched carry once per
    // cycle it survives. LegVolume has no @ManyToOne to Cycle (only a bare cycleId column), so
    // this joins the two entities ad-hoc on that id -- the same pattern SaleRepository already
    // uses to join Plot on plotId.
    @Query("SELECT l FROM LegVolume l JOIN Cycle c ON c.id = l.cycleId " +
        "WHERE l.associateId = :associateId ORDER BY c.periodStart ASC")
    List<LegVolume> findByAssociateIdOrderByCyclePeriodStartAsc(@Param("associateId") UUID associateId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=LegVolumeRepositoryTest -pl . -q`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Confirm nothing else still references the removed methods**

Run: `cd backend && grep -rn "sumLeftLegVolumeByAssociateId\|sumRightLegVolumeByAssociateId" src`
Expected: matches only in `DashboardService.java` and `DashboardServiceTest.java`/`DashboardControllerTest.java` (all three fixed by Task 2 — do not edit them in this task). If this task's own changes leave `LegVolumeRepositoryTest.java` referencing them, Step 1 was not fully applied — fix before proceeding.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/legvolume/LegVolumeRepository.java backend/src/test/java/com/plotchain/legvolume/LegVolumeRepositoryTest.java
git commit -m "fix(legvolume): replace double-counting sum queries with chronological row walk"
```

---

### Task 2: `DashboardService` — read current standing from the last closed cycle, fix lifetime-total double counting

**Files:**
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Consumes: Task 1's `LegVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(UUID)` → `List<LegVolume>`, chronological, never `null`. Also `CycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus)` — already exists and is already used elsewhere in this same file for the OPEN lookup; this task adds a second call with `CycleStatus.CLOSED`.
- Produces: no new consumers — `DashboardResponse.LegVolumeSummary`'s field names and types are unchanged, only how their values get computed.

- [ ] **Step 1: Write the failing service-level tests**

In `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`, `aggregatesAllDashboardWidgetsForAnAssociate` currently seeds one `Cycle` (the open one) and one `LegVolume` fixture (`LegVolume.empty(...)`, i.e. all zeros) and stubs the two sum methods with flat totals that don't prove anything about double-counting. Replace the fixture and stubs so the test proves both fixes at once:

Replace:

```java
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));
        RankTier nextRank = new RankTier(nextRankId, "Sales Executive", 2, BigDecimal.valueOf(10000));

        LegVolume legVolume = LegVolume.empty(associateId, cycleId);
```

with:

```java
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));
        RankTier nextRank = new RankTier(nextRankId, "Sales Executive", 2, BigDecimal.valueOf(10000));

        // Two closed cycles' worth of history. olderRow has no predecessor (incoming carry 0),
        // so its own leftLegVolume (100000) IS that cycle's new left volume, and left > right
        // carries 40000 forward. newerRow's leftLegVolume (300000) = its own new left volume
        // (260000) PLUS that same 40000 carried in -- a naive SUM(leftLegVolume) would count the
        // 40000 twice (100000 + 300000 = 400000); the correct lifetime total subtracts each row's
        // incoming carry first (100000 + (300000 - 40000) = 360000). Right never carries in this
        // fixture, so totalRightBusiness is unaffected by the bug (60000 + 200000 = 260000
        // either way) -- proving the fix doesn't change a leg that was never broken.
        UUID olderCycleId = UUID.randomUUID();
        UUID newerCycleId = UUID.randomUUID();
        Cycle newerClosedCycle = new Cycle();
        newerClosedCycle.setId(newerCycleId);
        newerClosedCycle.setStatus(CycleStatus.CLOSED);
        newerClosedCycle.setPeriodStart(LocalDate.now().minusDays(20));
        newerClosedCycle.setPeriodEnd(LocalDate.now().minusDays(6));

        LegVolume olderRow = new LegVolume(UUID.randomUUID(), associateId, olderCycleId,
            new BigDecimal("100000"), new BigDecimal("60000"), new BigDecimal("40000"), BigDecimal.ZERO);
        LegVolume newerRow = new LegVolume(UUID.randomUUID(), associateId, newerCycleId,
            new BigDecimal("300000"), new BigDecimal("200000"), new BigDecimal("100000"), BigDecimal.ZERO);
```

Replace the stub block:

```java
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycleId))
            .thenReturn(Optional.of(legVolume));
        when(legVolumeRepository.sumLeftLegVolumeByAssociateId(associateId)).thenReturn(BigDecimal.valueOf(300000));
        when(legVolumeRepository.sumRightLegVolumeByAssociateId(associateId)).thenReturn(BigDecimal.valueOf(200000));
```

with:

```java
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.of(newerClosedCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, newerCycleId))
            .thenReturn(Optional.of(newerRow));
        when(legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId))
            .thenReturn(List.of(olderRow, newerRow));
```

Replace the assertions:

```java
        assertThat(response.legVolume().leftVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolume().rightVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolume().carriedForwardLeft()).isEqualByComparingTo("0");
        assertThat(response.legVolume().carriedForwardRight()).isEqualByComparingTo("0");
        assertThat(response.legVolume().projectedMatchAmount()).isEqualByComparingTo("0");
        assertThat(response.legVolume().totalLeftBusiness()).isEqualByComparingTo("300000");
        assertThat(response.legVolume().totalRightBusiness()).isEqualByComparingTo("200000");
```

with:

```java
        // "Current standing" now comes from the most recently CLOSED cycle (newerRow), not the
        // open cycle's never-existing row.
        assertThat(response.legVolume().leftVolume()).isEqualByComparingTo("300000");
        assertThat(response.legVolume().rightVolume()).isEqualByComparingTo("200000");
        assertThat(response.legVolume().carriedForwardLeft()).isEqualByComparingTo("100000");
        assertThat(response.legVolume().carriedForwardRight()).isEqualByComparingTo("0");
        // min(300000, 200000) * (7.00 / 100) = 200000 * 0.07 = 14000.00
        assertThat(response.legVolume().projectedMatchAmount()).isEqualByComparingTo("14000.00");
        // De-duplicated lifetime totals -- see the fixture comment above.
        assertThat(response.legVolume().totalLeftBusiness()).isEqualByComparingTo("360000");
        assertThat(response.legVolume().totalRightBusiness()).isEqualByComparingTo("260000");
```

`projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction` currently reuses the OPEN cycle's id for its own `legVolume` fixture (`200000`/`150000`) to exercise the positive-matched-volume slab lookup. Replace:

```java
        LegVolume legVolume = LegVolume.empty(associateId, cycleId);
        ReflectionTestUtils.setField(legVolume, "leftLegVolume", new BigDecimal("200000"));
        ReflectionTestUtils.setField(legVolume, "rightLegVolume", new BigDecimal("150000"));
```

with:

```java
        UUID closedCycleId = UUID.randomUUID();
        Cycle closedCycle = new Cycle();
        closedCycle.setId(closedCycleId);
        closedCycle.setStatus(CycleStatus.CLOSED);
        closedCycle.setPeriodStart(LocalDate.now().minusDays(20));
        closedCycle.setPeriodEnd(LocalDate.now().minusDays(6));

        LegVolume legVolume = LegVolume.empty(associateId, closedCycleId);
        ReflectionTestUtils.setField(legVolume, "leftLegVolume", new BigDecimal("200000"));
        ReflectionTestUtils.setField(legVolume, "rightLegVolume", new BigDecimal("150000"));
```

Replace:

```java
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycleId))
            .thenReturn(Optional.of(legVolume));
        when(legVolumeRepository.sumLeftLegVolumeByAssociateId(associateId)).thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.sumRightLegVolumeByAssociateId(associateId)).thenReturn(BigDecimal.ZERO);
```

with:

```java
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.of(closedCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, closedCycleId))
            .thenReturn(Optional.of(legVolume));
        when(legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId))
            .thenReturn(List.of());
```

Add one new test, after `aggregatesAllDashboardWidgetsForAnAssociate`, proving the never-been-through-a-close case still degrades to zero instead of throwing:

```java
    @Test
    void currentLegVolumeDefaultsToZeroWhenTheAssociateHasNeverBeenThroughAClose() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        // No cycle has ever closed for this associate's org yet.
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.empty());
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any()))
            .thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any()))
            .thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId))
            .thenReturn(List.of());
        when(saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(any(), any(), any()))
            .thenReturn(BigDecimal.ZERO);
        CompensationPlanVersion planVersion = compensationPlanVersion(new BigDecimal("7.00"));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(planVersion));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(associateRepository.countDownline(any())).thenReturn(0L);
        when(associateRepository.countActiveToday(any(), any())).thenReturn(0L);
        when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(0L);
        when(announcementRepository.findTop5ByOrderByPublishedAtDesc()).thenReturn(List.of());

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.legVolume().leftVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolume().rightVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolume().carriedForwardLeft()).isEqualByComparingTo("0");
        assertThat(response.legVolume().carriedForwardRight()).isEqualByComparingTo("0");
        assertThat(response.legVolume().totalLeftBusiness()).isEqualByComparingTo("0");
        assertThat(response.legVolume().totalRightBusiness()).isEqualByComparingTo("0");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: compile error — `LegVolumeRepository` has no `findByAssociateIdOrderByCyclePeriodStartAsc` method reference resolves (Task 1 already added it, so this should actually compile) but assertions fail: `leftVolume`/`carriedForwardLeft`/`projectedMatchAmount`/`totalLeftBusiness`/`totalRightBusiness` don't match the new expected values yet since `DashboardService` hasn't changed.

- [ ] **Step 3: Rewrite the leg-volume block in `DashboardService`**

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, currently:

```java
        LegVolume legVolume = legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycle.getId())
            .orElseGet(() -> LegVolume.empty(associateId, cycle.getId()));
        BigDecimal totalLeftBusiness = legVolumeRepository.sumLeftLegVolumeByAssociateId(associateId);
        BigDecimal totalRightBusiness = legVolumeRepository.sumRightLegVolumeByAssociateId(associateId);
```

change to:

```java
        // leg_volume rows are written only at cycle CLOSE (CycleService#rollUpSubtree), keyed to
        // the cycle being closed -- the currently OPEN cycle this dashboard is showing never has a
        // row of its own, so findByAssociateIdAndCycleId(associateId, cycle.getId()) against it was
        // a structural no-op that always fell through to LegVolume.empty(). Reading the associate's
        // most-recently-CLOSED cycle instead is "current standing as of the last close" -- the
        // freshest real figure available without a live in-cycle recompute.
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        LegVolume legVolume = latestClosedCycle
            .flatMap(closed -> legVolumeRepository.findByAssociateIdAndCycleId(associateId, closed.getId()))
            .orElseGet(() -> LegVolume.empty(associateId, cycle.getId()));

        // Lifetime Total Left/Right Business: each row's leftLegVolume/rightLegVolume already has
        // the PRIOR cycle's carriedForward baked in (rollUpSubtree: leftLegVolume =
        // leftSubtreeVolume + carriedForwardLeft-from-last-close), and an unmatched carry keeps
        // re-appearing in every subsequent row until it's finally matched down -- a naive
        // SUM(leftLegVolume) across all rows counts that same still-unmatched volume once per
        // cycle it survives, not once. Subtracting each row's own incoming carry (its
        // predecessor's outgoing carriedForwardLeft/Right, 0 for the associate's first row)
        // before summing leaves exactly the new subtree volume each cycle actually contributed.
        List<LegVolume> legVolumeHistory = legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId);
        BigDecimal totalLeftBusiness = BigDecimal.ZERO;
        BigDecimal totalRightBusiness = BigDecimal.ZERO;
        BigDecimal incomingCarryLeft = BigDecimal.ZERO;
        BigDecimal incomingCarryRight = BigDecimal.ZERO;
        for (LegVolume row : legVolumeHistory) {
            totalLeftBusiness = totalLeftBusiness.add(row.getLeftLegVolume().subtract(incomingCarryLeft));
            totalRightBusiness = totalRightBusiness.add(row.getRightLegVolume().subtract(incomingCarryRight));
            incomingCarryLeft = row.getCarriedForwardLeft();
            incomingCarryRight = row.getCarriedForwardRight();
        }
```

`Optional` and `List` are already imported in this file (used elsewhere for `Optional<RankTier> nextRank` and `List<RankTier> ranks`) — no new imports needed.

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: PASS, all tests in the class green (including the two rewritten tests and the new `currentLegVolumeDefaultsToZeroWhenTheAssociateHasNeverBeenThroughAClose`).

- [ ] **Step 5: Update `DashboardControllerTest` for the new `CycleStatus.CLOSED` lookup**

In `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`'s `returnsDashboardJsonForTheAuthenticatedAssociate`, `cycleRepository` is only stubbed for `CycleStatus.OPEN` today — the real `DashboardService` now also calls it with `CycleStatus.CLOSED`, and an unstubbed `@MockBean` call returns `null` (not an empty `Optional`), which NPEs inside `DashboardService`'s `.flatMap(...)` call. Replace:

```java
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
```

with:

```java
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
```

Replace:

```java
        when(legVolumeRepository.findByAssociateIdAndCycleId(any(), any()))
            .thenReturn(Optional.of(LegVolume.empty(associateId, cycleId)));
        when(legVolumeRepository.sumLeftLegVolumeByAssociateId(any())).thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.sumRightLegVolumeByAssociateId(any())).thenReturn(BigDecimal.ZERO);
```

with:

```java
        when(legVolumeRepository.findByAssociateIdAndCycleId(any(), any()))
            .thenReturn(Optional.of(LegVolume.empty(associateId, cycleId)));
        when(legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(any()))
            .thenReturn(List.of());
```

(`findByAssociateIdAndCycleId` stays stubbed with `any()`/`any()` — it now gets called with `CycleStatus.CLOSED`'s cycle id via the `flatMap`, but since `CycleStatus.CLOSED` resolves to `Optional.empty()` here, that call never actually happens; the stub is harmless to leave as-is and keeps this test's changes minimal. `List` needs importing if not already present in this file — check before adding.)

- [ ] **Step 6: Run the controller test to verify it passes**

Run: `cd backend && mvn test -Dtest=DashboardControllerTest -pl . -q`
Expected: PASS, all tests in the class green.

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && mvn test -q`
Expected: PASS except the pre-existing, unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` dev-secret-guard failures (4 total, environment-dependent JDK/Mockito mismatch — see `issues.md`). No other class should show new failures.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardService.java backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "fix(dashboard): read current leg volume from last closed cycle, fix lifetime-total double count"
```
