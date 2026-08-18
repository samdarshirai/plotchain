# Lifetime Total Left/Right Business on Leg Volume Gauge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `totalLeftBusiness`/`totalRightBusiness` (the lifetime `SUM(left_leg_volume)`/`SUM(right_leg_volume)` across every cycle an associate has ever been rolled up in, not just the currently open cycle) to the dashboard's leg volume gauge widget.

**Architecture:** Backend: a new aggregate `@Query` method pair on `LegVolumeRepository` (`COALESCE(SUM(...), 0)` JPQL, matching `LedgerEntryRepository`'s existing house style for aggregate sums), fed into two new fields on `DashboardResponse.LegVolumeSummary`. Every cycle close writes a brand-new `LegVolume` row per associate (confirmed in `CycleService.rollUpSubtree`, which always constructs `new LegVolume(UUID.randomUUID(), ...)` — never updates a prior row in place) — so an associate genuinely accumulates one row per cycle, and only a real aggregate query across all of them produces a lifetime total; the currently-used `findByAssociateIdAndCycleId` lookup cannot. Frontend: two more rows on `leg-volume-gauge.component.ts`.

**Tech Stack:** Spring Boot 3.3.x (Java 21), Spring Data JPA, `@DataJpaTest` against H2 (MODE=PostgreSQL), JUnit 5 + Mockito + AssertJ, Angular 18 standalone components, Jasmine/Karma, `@ngx-translate/core`.

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` (§3.1 table row `LegVolumeSummary.totalLeftBusiness / totalRightBusiness`; §2's "Total Left/Right Business" semantics decision — deliberately a lifetime sum, NOT `New Business + Carried Forward`, because the reference's own numbers don't reconcile that way)

## Global Constraints

- Every associate-facing string needs both an English (`frontend/src/assets/i18n/en.json`) and Hindi (`frontend/src/assets/i18n/hi.json`) translation key — no hardcoded UI text.
- `totalLeftBusiness`/`totalRightBusiness` is `SUM(left_leg_volume)`/`SUM(right_leg_volume)` across **every** `leg_volume` row for the associate — all cycles, not just the open one. This is deliberately not `New Business + Carried Forward` (spec §2's own worked example: Carry Forward Left ₹200,000 + New Left ₹0 ≠ Total Left Business ₹2,000,000 — the reference's own numbers don't reconcile that way).
- `0` (via `COALESCE`), never `null`, for an associate with zero `leg_volume` rows (e.g. brand new, never been through a cycle close) — same "no-op, not a failure" convention every other aggregate sum on this dashboard already follows.
- Currency values render via Angular's `currency:'INR'` pipe, matching every other money field on this widget.

---

### Task 1: Backend — add lifetime sum queries to `LegVolumeRepository`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/legvolume/LegVolumeRepository.java`
- Test (new): `backend/src/test/java/com/plotchain/legvolume/LegVolumeRepositoryTest.java`

**Interfaces:**
- Produces: `LegVolumeRepository.sumLeftLegVolumeByAssociateId(UUID associateId)` and `sumRightLegVolumeByAssociateId(UUID associateId)`, both returning `BigDecimal` (never `null`, `0` when no rows). Task 2 calls these two methods directly.

- [ ] **Step 1: Write the failing repository test**

Create `backend/src/test/java/com/plotchain/legvolume/LegVolumeRepositoryTest.java`:

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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Dashboard unit 5 (docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md §3.1,
// "Total Left/Right Business"): proves the lifetime SUM aggregate genuinely spans multiple
// leg_volume rows (one per cycle close, per CycleService.rollUpSubtree) rather than reading a
// single cycle's row -- a property a mocked repository can't exercise.
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

    private Cycle seedCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        entityManager.persist(cycle);
        return cycle;
    }

    @Test
    void sumsLeftAndRightLegVolumeAcrossEveryCycleForThatAssociate() {
        Associate associate = seedAssociate();
        Cycle cycleOne = seedCycle();
        Cycle cycleTwo = seedCycle();
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), associate.getId(), cycleOne.getId(),
            new BigDecimal("100000"), new BigDecimal("50000"), BigDecimal.ZERO, BigDecimal.ZERO));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), associate.getId(), cycleTwo.getId(),
            new BigDecimal("200000"), new BigDecimal("150000"), BigDecimal.ZERO, BigDecimal.ZERO));

        assertThat(legVolumeRepository.sumLeftLegVolumeByAssociateId(associate.getId())).isEqualByComparingTo("300000");
        assertThat(legVolumeRepository.sumRightLegVolumeByAssociateId(associate.getId())).isEqualByComparingTo("200000");
    }

    @Test
    void excludesLegVolumeRowsForADifferentAssociate() {
        Associate target = seedAssociate();
        Associate other = seedAssociate();
        Cycle cycle = seedCycle();
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), target.getId(), cycle.getId(),
            new BigDecimal("100000"), new BigDecimal("50000"), BigDecimal.ZERO, BigDecimal.ZERO));
        legVolumeRepository.saveAndFlush(new LegVolume(
            UUID.randomUUID(), other.getId(), cycle.getId(),
            new BigDecimal("999999"), new BigDecimal("999999"), BigDecimal.ZERO, BigDecimal.ZERO));

        assertThat(legVolumeRepository.sumLeftLegVolumeByAssociateId(target.getId())).isEqualByComparingTo("100000");
        assertThat(legVolumeRepository.sumRightLegVolumeByAssociateId(target.getId())).isEqualByComparingTo("50000");
    }

    @Test
    void returnsZeroNotNullWhenTheAssociateHasNoLegVolumeRowsYet() {
        Associate associate = seedAssociate();

        assertThat(legVolumeRepository.sumLeftLegVolumeByAssociateId(associate.getId())).isEqualByComparingTo("0");
        assertThat(legVolumeRepository.sumRightLegVolumeByAssociateId(associate.getId())).isEqualByComparingTo("0");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=LegVolumeRepositoryTest -pl . -q`
Expected: compile error — `LegVolumeRepository` has no `sumLeftLegVolumeByAssociateId`/`sumRightLegVolumeByAssociateId` methods yet.

- [ ] **Step 3: Add the two aggregate query methods**

In `backend/src/main/java/com/plotchain/legvolume/LegVolumeRepository.java`, currently:

```java
package com.plotchain.legvolume;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface LegVolumeRepository extends JpaRepository<LegVolume, UUID> {
    Optional<LegVolume> findByAssociateIdAndCycleId(UUID associateId, UUID cycleId);
}
```

change to:

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=LegVolumeRepositoryTest -pl . -q`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && mvn test -q`
Expected: PASS except the pre-existing, unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` dev-secret-guard failures (4 total, environment-dependent JDK/Mockito mismatch — see `issues.md`). No other class should show new failures.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/legvolume/LegVolumeRepository.java backend/src/test/java/com/plotchain/legvolume/LegVolumeRepositoryTest.java
git commit -m "feat(legvolume): add lifetime left/right leg volume sum queries"
```

---

### Task 2: Backend — wire lifetime totals into `DashboardResponse.LegVolumeSummary`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java:22`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Consumes: Task 1's `LegVolumeRepository.sumLeftLegVolumeByAssociateId(UUID)` / `sumRightLegVolumeByAssociateId(UUID)`, both `BigDecimal`, never `null`.
- Produces: `DashboardResponse.LegVolumeSummary` record gains two new components, appended after `projectedMatchAmount`: `totalLeftBusiness`, `totalRightBusiness` (both `BigDecimal`). Task 3 (frontend) reads these as `data.totalLeftBusiness` / `data.totalRightBusiness` on the `LegVolumeSummary` TS interface.

- [ ] **Step 1: Write the failing service-level test**

In `DashboardServiceTest.java`, `aggregatesAllDashboardWidgetsForAnAssociate` currently stubs `legVolumeRepository.findByAssociateIdAndCycleId(...)` only. Add two more stubs directly after that existing stub:

```java
        when(legVolumeRepository.sumLeftLegVolumeByAssociateId(associateId)).thenReturn(BigDecimal.valueOf(300000));
        when(legVolumeRepository.sumRightLegVolumeByAssociateId(associateId)).thenReturn(BigDecimal.valueOf(200000));
```

Then add two assertions directly after the existing `assertThat(response.legVolume().projectedMatchAmount())...` assertion:

```java
        assertThat(response.legVolume().totalLeftBusiness()).isEqualByComparingTo("300000");
        assertThat(response.legVolume().totalRightBusiness()).isEqualByComparingTo("200000");
```

In `projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction`, add the same two stubs (with whatever fixture values keep this test's existing intent — the associate/cycle here has no separate lifetime-total assertion requirement, so `BigDecimal.ZERO` for both is fine, consistent with this test's other all-zero stubs) directly after its existing `legVolumeRepository.findByAssociateIdAndCycleId(...)` stub:

```java
        when(legVolumeRepository.sumLeftLegVolumeByAssociateId(associateId)).thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.sumRightLegVolumeByAssociateId(associateId)).thenReturn(BigDecimal.ZERO);
```

and add two assertions directly after its existing `assertThat(response.legVolume().projectedMatchAmount())...` line (if one exists there — otherwise directly after the `royaltyBonusPct` assertion added in Unit 4):

```java
        assertThat(response.legVolume().totalLeftBusiness()).isEqualByComparingTo("0");
        assertThat(response.legVolume().totalRightBusiness()).isEqualByComparingTo("0");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: compile error — `LegVolumeSummary` has no `totalLeftBusiness()`/`totalRightBusiness()` methods yet.

- [ ] **Step 3: Extend the `LegVolumeSummary` record**

In `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java:22`, currently:

```java
    public record LegVolumeSummary(BigDecimal leftVolume, BigDecimal rightVolume, BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight, BigDecimal projectedMatchAmount) {}
```

change to:

```java
    public record LegVolumeSummary(BigDecimal leftVolume, BigDecimal rightVolume, BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight, BigDecimal projectedMatchAmount, BigDecimal totalLeftBusiness, BigDecimal totalRightBusiness) {}
```

- [ ] **Step 4: Populate the two new fields in `DashboardService`**

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, directly after the existing `LegVolume legVolume = legVolumeRepository.findByAssociateIdAndCycleId(...)` block, add:

```java
        BigDecimal totalLeftBusiness = legVolumeRepository.sumLeftLegVolumeByAssociateId(associateId);
        BigDecimal totalRightBusiness = legVolumeRepository.sumRightLegVolumeByAssociateId(associateId);
```

Then, in the `return new DashboardResponse(...)` block, change:

```java
            new DashboardResponse.LegVolumeSummary(
                legVolume.getLeftLegVolume(), legVolume.getRightLegVolume(),
                legVolume.getCarriedForwardLeft(), legVolume.getCarriedForwardRight(),
                projectedMatch),
```

to:

```java
            new DashboardResponse.LegVolumeSummary(
                legVolume.getLeftLegVolume(), legVolume.getRightLegVolume(),
                legVolume.getCarriedForwardLeft(), legVolume.getCarriedForwardRight(),
                projectedMatch, totalLeftBusiness, totalRightBusiness),
```

- [ ] **Step 5: Run the service test to verify it passes**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: PASS, all tests in the class green.

- [ ] **Step 6: Add controller-level assertions proving end-to-end wiring**

In `DashboardControllerTest.java`'s `returnsDashboardJsonForTheAuthenticatedAssociate`, add a stub directly after the existing `legVolumeRepository.findByAssociateIdAndCycleId(...)` stub:

```java
        when(legVolumeRepository.sumLeftLegVolumeByAssociateId(any())).thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.sumRightLegVolumeByAssociateId(any())).thenReturn(BigDecimal.ZERO);
```

Add two assertions to the existing `jsonPath` chain, after the existing `royaltyBonusPct` assertions:

```java
            .andExpect(jsonPath("$.cycleIncome.royaltyBonus").value(0))
            .andExpect(jsonPath("$.cycleIncome.royaltyBonusPct").value(0))
            .andExpect(jsonPath("$.legVolume.totalLeftBusiness").value(0))
            .andExpect(jsonPath("$.legVolume.totalRightBusiness").value(0));
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && mvn test -q`
Expected: PASS except the pre-existing, unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` dev-secret-guard failures (4 total). No other class should show new failures.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java backend/src/main/java/com/plotchain/dashboard/DashboardService.java backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "feat(dashboard): add lifetime total left/right business to leg volume summary"
```

---

### Task 3: Frontend — render lifetime Total Left/Right Business on the leg volume gauge

**Files:**
- Modify: `frontend/src/app/dashboard/models/dashboard-response.model.ts:25-31`
- Modify: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.spec.ts:20`
- Modify: `frontend/src/assets/i18n/en.json:17`
- Modify: `frontend/src/assets/i18n/hi.json:17`

**Interfaces:**
- Consumes: Task 2's `DashboardResponse.LegVolumeSummary` JSON shape — `totalLeftBusiness`, `totalRightBusiness` fields (both numbers, always present, `0` when the associate has no `leg_volume` rows yet).
- Produces: no new consumers in this plan.

- [ ] **Step 1: Write the failing component test**

In `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts`, add the two new fields to the fixture in `beforeEach`:

```typescript
    fixture.componentInstance.data = {
      leftVolume: 3000, rightVolume: 2000,
      carriedForwardLeft: 500, carriedForwardRight: 1000,
      projectedMatchAmount: 140,
      totalLeftBusiness: 300000, totalRightBusiness: 200000
    };
```

Add a new test, after the existing `'renders carried forward left and right business'` test:

```typescript
  it('renders lifetime total left and right business', () => {
    const left = fixture.nativeElement.querySelector('.leg-total-business.left').textContent;
    const right = fixture.nativeElement.querySelector('.leg-total-business.right').textContent;
    expect(left).toContain('300,000');
    expect(right).toContain('200,000');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts'`
Expected: FAIL — TS compile error, `totalLeftBusiness`/`totalRightBusiness` don't exist on type `LegVolumeSummary`, and the new test can't find `.leg-total-business` elements.

- [ ] **Step 3: Extend the `LegVolumeSummary` TS interface**

In `frontend/src/app/dashboard/models/dashboard-response.model.ts:25-31`, currently:

```typescript
export interface LegVolumeSummary {
  leftVolume: number;
  rightVolume: number;
  carriedForwardLeft: number;
  carriedForwardRight: number;
  projectedMatchAmount: number;
}
```

change to:

```typescript
export interface LegVolumeSummary {
  leftVolume: number;
  rightVolume: number;
  carriedForwardLeft: number;
  carriedForwardRight: number;
  projectedMatchAmount: number;
  totalLeftBusiness: number;
  totalRightBusiness: number;
}
```

- [ ] **Step 4: Add the i18n key**

In `frontend/src/assets/i18n/en.json`, currently (line 17, inside the `dashboard` block):

```json
    "carriedForward": "Carried Forward",
```

change to:

```json
    "carriedForward": "Carried Forward",
    "totalBusiness": "Total Business",
```

In `frontend/src/assets/i18n/hi.json`, currently (line 17):

```json
    "carriedForward": "कैरी फॉरवर्ड",
```

change to:

```json
    "carriedForward": "कैरी फॉरवर्ड",
    "totalBusiness": "कुल व्यवसाय",
```

- [ ] **Step 5: Add the template rows**

In `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`, currently:

```typescript
  template: `
    <div class="leg-volume-gauge">
      <div class="leg left" [style.flex]="data.leftVolume || 1">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftVolume | currency:'INR' }}</div>
      <div class="leg right" [style.flex]="data.rightVolume || 1">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightVolume | currency:'INR' }}</div>
      <div class="leg-carried-forward left">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.carriedForwardLeft | currency:'INR' }}</div>
      <div class="leg-carried-forward right">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.carriedForwardRight | currency:'INR' }}</div>
      <div class="projected-match">{{ 'dashboard.projectedMatch' | translate }}: {{ data.projectedMatchAmount | currency:'INR' }}</div>
    </div>
  `
```

change to:

```typescript
  template: `
    <div class="leg-volume-gauge">
      <div class="leg left" [style.flex]="data.leftVolume || 1">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftVolume | currency:'INR' }}</div>
      <div class="leg right" [style.flex]="data.rightVolume || 1">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightVolume | currency:'INR' }}</div>
      <div class="leg-carried-forward left">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.carriedForwardLeft | currency:'INR' }}</div>
      <div class="leg-carried-forward right">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.carriedForwardRight | currency:'INR' }}</div>
      <div class="leg-total-business left">{{ 'dashboard.totalBusiness' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.totalLeftBusiness | currency:'INR' }}</div>
      <div class="leg-total-business right">{{ 'dashboard.totalBusiness' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.totalRightBusiness | currency:'INR' }}</div>
      <div class="projected-match">{{ 'dashboard.projectedMatch' | translate }}: {{ data.projectedMatchAmount | currency:'INR' }}</div>
    </div>
  `
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Fix the other `LegVolumeSummary` fixture broken by the interface change**

`frontend/src/app/dashboard/dashboard.component.spec.ts:20` has its own `LegVolumeSummary` literal that predates the two new required fields and will now fail TS compilation. Currently:

```typescript
    legVolume: { leftVolume: 3000, rightVolume: 2000, carriedForwardLeft: 0, carriedForwardRight: 1000, projectedMatchAmount: 140 },
```

change to:

```typescript
    legVolume: { leftVolume: 3000, rightVolume: 2000, carriedForwardLeft: 0, carriedForwardRight: 1000, projectedMatchAmount: 140, totalLeftBusiness: 300000, totalRightBusiness: 200000 },
```

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/dashboard/models/dashboard-response.model.ts frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts frontend/src/app/dashboard/dashboard.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): render lifetime total left/right business on leg volume gauge"
```
