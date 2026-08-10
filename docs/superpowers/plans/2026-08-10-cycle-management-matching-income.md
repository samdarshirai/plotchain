# Cycle Management Unit 5: Matching Income Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credit Matching Income (`LedgerEntry`, `incomeType = MATCHING`) inside `CycleService.close()`, net of TDS/admin deductions, KYC-gated, for every associate whose just-computed leg volumes have a nonzero matched pair — flow step 3 of the settlement batch, per `docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md`.

**Architecture:** All logic lands in the existing `CycleService.close()` method, inserted between the leg-volume rollup (unit 4, already merged) and the `CLOSED` status flip, inside the same `@Transactional` boundary — no new class, no new endpoint, no change to `close()`'s signature. A new private `creditMatchingIncome(...)` method loops once over the `List<LegVolume>` rows unit 4's rollup just produced (already in scope in `close()`), matching each row back to its owning `Associate` by id.

**Tech Stack:** Spring Boot, Spring Data JPA, Flyway, JUnit 5 + Mockito (`CycleServiceTest`, unit-level, mocked repositories) + `@DataJpaTest` (`LedgerEntryRepositoryTest`, real H2 (MODE=PostgreSQL) test datasource) — matches existing conventions in `backend/src/test/java/com/plotchain/`.

## Global Constraints

- **Scope boundary (hard):** this unit implements ONLY flow step 3 (Matching Income). No rank advancement, no sponsor lookups, no royalty/reward ledger entries — those are units 6–9. Do not touch `CycleCloseResponse`'s shape; it stays `(cycleId, status, legVolumeRowsWritten, newCycleId)` for this unit (a later unit adds per-income-type fields once there's more to report, per that record's own comment — this unit deliberately doesn't jump ahead of it).
- **`grossAmount = min(leftLegVolume, rightLegVolume) × matchingIncomePct / 100`** — associates with `min(left, right) == 0` get no entry at all (Decision #5).
- **`sourceRef = legVolume.id`** — the specific `LegVolume` row unit 4's rollup just wrote for that associate+cycle (Decision #5).
- **Excess carry-forward**: `abs(left − right)` written into that same `LegVolume` row's `carriedForwardLeft`/`carriedForwardRight` (whichever leg is larger), row re-saved — not a new row (Decision #5). Only happens for associates who *also* got a Matching entry (min > 0) — the spec's Flow step 3 text nests "write entry / update carriedForward / increment cumulativeMatchedVolume" as one conditional block, all gated on `min(left, right) > 0`. A `min == 0` associate's `LegVolume` row keeps `carriedForwardLeft = carriedForwardRight = 0` (unit 4's default) even if one leg is nonzero — this is what the spec literally says, not an oversight; flag it in code review if it looks surprising, but implement it as written.
- **`associate.cumulativeMatchedVolume += min(left, right)`** — the raw matched *volume*, never the post-percentage income amount (Decision #6).
- **Deductions**: `tdsDeduction = grossAmount × tdsPct/100`, `adminDeduction = grossAmount × adminChargeWithoutPanPct/100` (always without-PAN tier), `netAmount = grossAmount − tdsDeduction − adminDeduction` (Decision #10) — same math `SaleService.recordSale` already uses.
- **Percentage resolution**: `CompensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart())` — deliberately `cycle.getPeriodStart()`, not `LocalDate.now()` (Decision #10's considered deviation from Sales' pattern: this batch computes cycle-aggregate income after the fact, so "now" could pick up a plan version published after the cycle's volume already accrued). Resolved once per batch run, before the per-associate loop. Missing version → `IllegalStateException` (same convention `SaleService` and `DashboardService` use), thrown unconditionally even if there happen to be zero associates this run (see Task 2's note on why the existing zero-associate test needs a stub added, not a code-level guard).
- **KYC-gating**: `associate.kycStatus == VERIFIED` → `LedgerEntryStatus.PENDING`; anything else (`PENDING` or `REJECTED`) → `LedgerEntryStatus.CARRIED_FORWARD` (Decision #11).
- **Idempotency**: `LedgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(...)` checked before every write; skip (no entry, no carried-forward mutation, no `cumulativeMatchedVolume` increment) if it already exists (Decision #12) — the whole per-associate block for that row is skipped, not just the `LedgerEntry` insert, so a skipped write can never double-count volume either.
- **Rounding**: follow `SaleService`'s exact existing convention — `pct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)` then multiply, no explicit `.setScale(2, HALF_UP)` before persisting into the `NUMERIC(14,2)` columns. This is a known, previously-flagged (non-blocking) gap in Sales unit 3's code review — this unit follows the same pattern as-is for consistency across the two income types that now write ledger money math, rather than unilaterally fixing rounding in only one of the two call sites. A future cross-cutting cleanup unit is the right place to fix both at once.
- **Migration convention**: new migrations are named `V<n>__description.sql` under `backend/src/main/resources/db/migration/`; current highest is `V16__sale.sql`, so this unit adds `V17__ledger_entry_idempotency.sql`.

---

## Task 1: Idempotency constraint — migration, repository method, and DB-level test

**Files:**
- Create: `backend/src/main/resources/db/migration/V17__ledger_entry_idempotency.sql`
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Create: `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`

**Interfaces:**
- Produces: `LedgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(UUID associateId, UUID cycleId, IncomeType incomeType, UUID sourceRef): boolean` — Task 2's `CycleService` consumes this directly.
- Produces: DB-level guarantee that `(associate_id, cycle_id, income_type, source_ref)` is unique and `source_ref` is `NOT NULL` on `ledger_entry` — Task 2's writes rely on this never being violated (the app-level `existsBy...` check is meant to prevent ever hitting it).

- [ ] **Step 1: Write the migration**

Create `backend/src/main/resources/db/migration/V17__ledger_entry_idempotency.sql`:

```sql
-- Cycle-management unit 5 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
-- Decision #12): source_ref is tightened from nullable (V16, Sales unit 3) to NOT NULL --
-- Postgres does not treat NULL = NULL as a match inside a unique constraint, so a nullable
-- source_ref would silently defeat this guarantee for any income type that ever left it null.
-- Safe to tighten now: every income type that writes ledger_entry rows as of this migration
-- (DIRECT via Sales unit 3, MATCHING via this unit) always sets source_ref to a real row id.
ALTER TABLE ledger_entry ALTER COLUMN source_ref SET NOT NULL;
ALTER TABLE ledger_entry ADD CONSTRAINT uq_ledger_entry_idempotency
    UNIQUE (associate_id, cycle_id, income_type, source_ref);
```

- [ ] **Step 2: Add the repository method**

In `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`, add after the existing `sumNetAmountByCycle` method:

```java
    // Decision #12's idempotency check: called before every write the settlement batch makes.
    // A plain Spring Data derived query -- the unique constraint added by V17 is the DB-level
    // backstop this check is meant to make redundant, never the other way around.
    boolean existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
        UUID associateId, UUID cycleId, IncomeType incomeType, UUID sourceRef);
```

- [ ] **Step 3: Write the failing DB-level test**

Create `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`:

```java
package com.plotchain.income;

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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Cycle-management unit 5 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
// Decision #12): proves the V17 migration's NOT NULL + UNIQUE constraint is actually live against
// the real H2 (MODE=PostgreSQL) test datasource, and proves the new existsBy... derived query
// resolves against real column values -- both properties a mocked repository can't exercise.
@DataJpaTest
@ActiveProfiles("test")
class LedgerEntryRepositoryTest {

    @Autowired
    LedgerEntryRepository ledgerEntryRepository;

    @Autowired
    TestEntityManager entityManager;

    private Associate seedAssociate() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
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

    private LedgerEntry newEntry(UUID associateId, UUID cycleId, IncomeType incomeType, UUID sourceRef) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setAssociateId(associateId);
        entry.setIncomeType(incomeType);
        entry.setCycleId(cycleId);
        entry.setGrossAmount(new BigDecimal("100.00"));
        entry.setTdsDeduction(new BigDecimal("5.00"));
        entry.setAdminDeduction(new BigDecimal("4.00"));
        entry.setNetAmount(new BigDecimal("91.00"));
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setSourceRef(sourceRef);
        entry.setCreatedAt(Instant.now());
        return entry;
    }

    @Test
    void existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRefReturnsTrueOnlyForAnExactTupleMatch() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID sourceRef = UUID.randomUUID();
        ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, sourceRef));

        assertThat(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            associate.getId(), cycle.getId(), IncomeType.MATCHING, sourceRef)).isTrue();
        // Different sourceRef -> no match, even for the same associate/cycle/type.
        assertThat(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            associate.getId(), cycle.getId(), IncomeType.MATCHING, UUID.randomUUID())).isFalse();
        // Different incomeType -> no match, even for the same sourceRef.
        assertThat(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            associate.getId(), cycle.getId(), IncomeType.DIRECT, sourceRef)).isFalse();
    }

    @Test
    void uniqueConstraintRejectsADuplicateAssociateCycleIncomeTypeSourceRefTuple() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID sourceRef = UUID.randomUUID();
        ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, sourceRef));

        assertThatThrownBy(() ->
            ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, sourceRef)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void notNullConstraintRejectsANullSourceRef() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();

        assertThatThrownBy(() ->
            ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, null)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=LedgerEntryRepositoryTest`
Expected: FAIL — compile error (`existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef` doesn't exist yet) if Step 2 wasn't done yet, or (if Step 2 was already applied) the two constraint tests fail because V17 hasn't been applied to the H2 test datasource / Flyway hasn't picked up the new migration file yet — confirm by checking the actual failure message names the missing method or the missing constraint, not something else.

- [ ] **Step 5: Confirm all three pieces together make it pass**

Run: `cd backend && mvn -q test -Dtest=LedgerEntryRepositoryTest`
Expected: PASS (3 tests). If it doesn't, check: migration filename is exactly `V17__ledger_entry_idempotency.sql` (Flyway requires the double underscore and won't pick up a misnamed file); the `backend/src/test/resources/application-test.yml` (or equivalent) datasource is H2 in `MODE=PostgreSQL` so `ALTER TABLE ... SET NOT NULL` and named `UNIQUE` constraints behave the same as production Postgres.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/resources/db/migration/V17__ledger_entry_idempotency.sql \
        backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java \
        backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java
git commit -m "feat(cycle): tighten ledger_entry idempotency constraint, add exists-by query"
```

---

## Task 2: Matching Income credited inline in `CycleService.close()`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `LedgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(UUID, UUID, IncomeType, UUID): boolean` (Task 1). `CompensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate): Optional<CompensationPlanVersion>` (existing). `CompensationPlanVersion.getMatchingIncomePct()/getTdsPct()/getAdminChargeWithoutPanPct(): BigDecimal` (existing). `LegVolume.setCarriedForwardLeft(BigDecimal)/setCarriedForwardRight(BigDecimal)` (existing, added by unit 4). `Associate.getCumulativeMatchedVolume()/setCumulativeMatchedVolume(BigDecimal)`, `Associate.getKycStatus(): KycStatus` (existing).
- Produces: `CycleService`'s constructor now takes `(CycleRepository, AssociateRepository, LegVolumeRepository, SaleRepository, CompensationPlanVersionRepository, LedgerEntryRepository)` — 6 args, up from 4. Every test file that constructs `CycleService` directly must be updated. `close()`'s signature and `CycleCloseResponse`'s shape are unchanged.

- [ ] **Step 1: Wire the two new constructor dependencies (no behavior change yet)**

In `backend/src/main/java/com/plotchain/cycle/CycleService.java`, add imports:

```java
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import java.math.RoundingMode;
import java.time.Instant;
```

Replace the field declarations and constructor:

```java
    private final CycleRepository cycleRepository;
    private final AssociateRepository associateRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final SaleRepository saleRepository;
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final LedgerEntryRepository ledgerEntryRepository;

    public CycleService(
        CycleRepository cycleRepository,
        AssociateRepository associateRepository,
        LegVolumeRepository legVolumeRepository,
        SaleRepository saleRepository,
        CompensationPlanVersionRepository compensationPlanVersionRepository,
        LedgerEntryRepository ledgerEntryRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.associateRepository = associateRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
    }
```

In `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`, add two new mock fields and update every `new CycleService(...)` call site (there are 6: `listWithNoStatusFilterDelegatesToFindAll`, `listWithStatusFilterDelegatesToFindByStatus`, `closeThrowsCycleNotFoundExceptionWhenTheCycleDoesNotExist`, `closeThrowsCycleAlreadyClosedExceptionWhenStatusIsClosed`, `closeThrowsCycleAlreadyClosedExceptionWhenStatusIsPaid`, `closeWithNoAssociatesWritesNoLegVolumeRowsAndStillClosesAndReopens`, `closeComputesLegVolumeRollupTreeWideOnAMixedFixtureTreeAndWritesOneRowPerAssociate`, `getOrOpenCurrentCreatesANewCycleWhenNoCycleCoversToday`, `getOrOpenCurrentReturnsTheExistingOpenCycleWhenItCoversToday`, `getOrOpenCurrentCreatesTheNextCycleWhenTheExistingOpenCycleDoesNotCoverToday` — 10 call sites total):

```java
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
```

and change every occurrence of:

```java
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository);
```

to:

```java
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);
```

Add imports at the top of the test file:

```java
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import java.time.Instant;
```

- [ ] **Step 2: Run the existing suite to confirm the plumbing-only change compiles and every pre-existing test still passes except the two that now need a stub**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: FAIL — `closeWithNoAssociatesWritesNoLegVolumeRowsAndStillClosesAndReopens` and `closeComputesLegVolumeRollupTreeWideOnAMixedFixtureTreeAndWritesOneRowPerAssociate` don't fail yet at this step (no production code change has happened, so `close()` doesn't call `compensationPlanVersionRepository` at all yet) — this step should actually PASS in full. Confirm all 10 tests are green before continuing; if anything fails here, it's a mechanical constructor-wiring mistake, fix it before writing any new logic.

- [ ] **Step 3: Add a shared `CompensationPlanVersion` fixture builder to `CycleServiceTest`**

Add this private helper near `associateFixture`/`saleFixture`:

```java
    private CompensationPlanVersion planVersionFixture() {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.of(2026, 1, 1),
            BigDecimal.ZERO, new BigDecimal("10.00"), BigDecimal.ZERO,
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY,
            Instant.now(), null);
    }
```

(`matchingIncomePct = 10.00`, `tdsPct = 5.00`, `adminChargeWithoutPanPct = 4.00` — same round numbers `SaleServiceTest` uses for Direct Income, chosen so gross/net math is easy to hand-verify.)

- [ ] **Step 4: Fix up the two existing tests that now reach the (still-unimplemented) planVersion lookup**

Task 3's/this task's production-code step will make `close()` call `compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(...)` unconditionally, once, right after the leg-volume rollup — even when there are zero associates. Stub it in both existing tests now, before writing that production code, so they stay green once it lands.

In `closeWithNoAssociatesWritesNoLegVolumeRowsAndStillClosesAndReopens`, add:

```java
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));
```

In `closeComputesLegVolumeRollupTreeWideOnAMixedFixtureTreeAndWritesOneRowPerAssociate`, add the same stub. Then update the **existing** `assertLegVolume` calls and its helper signature: this fixture's `admin` row (`left=150, right=30`) and `b1` row (`left=120, right=55`) both now have `min(left,right) > 0`, so this unit's Matching step will mutate their `carriedForwardLeft` in place on the *same* `LegVolume` objects the `legVolumeRepository.saveAll(...)` captor already holds a reference to (Mockito's `ArgumentCaptor` captures the object reference, not a snapshot — later in-place mutation is visible when the test later reads `getValue()`). Change the helper to take expected carried-forward values explicitly:

```java
    private void assertLegVolume(List<LegVolume> written, UUID associateId, UUID cycleId,
                                  String expectedLeft, String expectedRight,
                                  String expectedCarriedForwardLeft, String expectedCarriedForwardRight) {
        LegVolume match = written.stream()
            .filter(lv -> associateId.equals(lv.getAssociateId()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("no LegVolume row written for associate " + associateId));
        assertThat(match.getCycleId()).isEqualTo(cycleId);
        assertThat(match.getLeftLegVolume()).isEqualByComparingTo(expectedLeft);
        assertThat(match.getRightLegVolume()).isEqualByComparingTo(expectedRight);
        assertThat(match.getCarriedForwardLeft()).isEqualByComparingTo(expectedCarriedForwardLeft);
        assertThat(match.getCarriedForwardRight()).isEqualByComparingTo(expectedCarriedForwardRight);
    }
```

and update every call site:

```java
        // admin: min(150,30)=30 > 0 -> matched. left(150) > right(30) -> excess 120 carried on the left.
        assertLegVolume(written, admin.getId(), cycle.getId(), "150", "30", "120", "0");
        // b1: min(120,55)=55 > 0 -> matched. left(120) > right(55) -> excess 65 carried on the left.
        assertLegVolume(written, b1.getId(), cycle.getId(), "120", "55", "65", "0");
        // b2: min(30,0)=0 -> no match, no carried-forward mutation (unit 5's own scope rule).
        assertLegVolume(written, b2.getId(), cycle.getId(), "30", "0", "0", "0");
        assertLegVolume(written, c1.getId(), cycle.getId(), "0", "0", "0", "0");
        assertLegVolume(written, c2.getId(), cycle.getId(), "0", "0", "0", "0");
        assertLegVolume(written, c3.getId(), cycle.getId(), "0", "0", "0", "0");
        assertLegVolume(written, d.getId(), cycle.getId(), "0", "0", "0", "0");
```

Also delete the now-stale comment above the old helper ("Unit 4 never sets these to anything but zero -- unit 5 (Matching) is what writes into them, on these same rows, later.") since unit 5 is this unit and the comment's prediction is now the tested behavior.

- [ ] **Step 5: Run the suite again to confirm it's still all green (production code still unchanged)**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: PASS (all tests) — the two stub/assertion updates are inert until `close()` actually calls the new dependencies, which happens in Step 7.

- [ ] **Step 6: Write the new failing tests for Matching Income**

Add these tests to `CycleServiceTest.java`. They share a small two-child fixture (`root` + leaf `left` + leaf `right`, `root` is parentless so it plays the "Admin root" role from unit 4's rollup) rather than reusing the 7-node mixed tree, to keep each concern isolated and the arithmetic easy to hand-verify.

```java
    @Test
    void closeCreditsMatchingIncomeForAnAssociateWithANonzeroMatchedPair() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<LegVolume>> legVolumesCaptor = ArgumentCaptor.forClass(List.class);
        verify(legVolumeRepository).saveAll(legVolumesCaptor.capture());
        LegVolume rootLegVolume = legVolumesCaptor.getValue().stream()
            .filter(lv -> root.getId().equals(lv.getAssociateId())).findFirst().orElseThrow();

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        LedgerEntry entry = entryCaptor.getValue();

        assertThat(entry.getIncomeType()).isEqualTo(IncomeType.MATCHING);
        assertThat(entry.getAssociateId()).isEqualTo(root.getId());
        assertThat(entry.getCycleId()).isEqualTo(cycle.getId());
        assertThat(entry.getSourceRef()).isEqualTo(rootLegVolume.getId());
        // min(left=100, right=50) = 50 matched. gross = 50 * 10% = 5.00
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("5.00");
        // tds = 5.00 * 5% = 0.25
        assertThat(entry.getTdsDeduction()).isEqualByComparingTo("0.25");
        // admin = 5.00 * 4% = 0.20
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("0.20");
        // net = 5.00 - 0.25 - 0.20 = 4.55
        assertThat(entry.getNetAmount()).isEqualByComparingTo("4.55");
        assertThat(entry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(entry.getCreatedAt()).isNotNull();
    }

    @Test
    void closeWritesNoMatchingEntryWhenOneLegIsZero() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // Only the right leg sells anything -- left stays at zero, so min(left, right) = 0.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("40"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
        verify(associateRepository, never()).save(any(Associate.class));
    }

    @Test
    void closeCarriesTheExcessOnTheLargerLeftLegForwardOnTheSameLegVolumeRow() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // left(100) > right(50) -> min=50 matched, excess 50 carried on the LEFT.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LegVolume> savedLegVolumeCaptor = ArgumentCaptor.forClass(LegVolume.class);
        verify(legVolumeRepository).save(savedLegVolumeCaptor.capture());
        LegVolume saved = savedLegVolumeCaptor.getValue();
        assertThat(saved.getAssociateId()).isEqualTo(root.getId());
        assertThat(saved.getCarriedForwardLeft()).isEqualByComparingTo("50");
        assertThat(saved.getCarriedForwardRight()).isEqualByComparingTo("0");
    }

    @Test
    void closeCarriesTheExcessOnTheLargerRightLegForwardOnTheSameLegVolumeRow() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // right(100) > left(50) -> min=50 matched, excess 50 carried on the RIGHT.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("50")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("100"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LegVolume> savedLegVolumeCaptor = ArgumentCaptor.forClass(LegVolume.class);
        verify(legVolumeRepository).save(savedLegVolumeCaptor.capture());
        LegVolume saved = savedLegVolumeCaptor.getValue();
        assertThat(saved.getAssociateId()).isEqualTo(root.getId());
        assertThat(saved.getCarriedForwardLeft()).isEqualByComparingTo("0");
        assertThat(saved.getCarriedForwardRight()).isEqualByComparingTo("50");
    }

    @Test
    void closeIncrementsCumulativeMatchedVolumeByTheMatchedVolumeNotTheIncomeAmount() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setCumulativeMatchedVolume(new BigDecimal("20"));
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<Associate> savedAssociateCaptor = ArgumentCaptor.forClass(Associate.class);
        verify(associateRepository).save(savedAssociateCaptor.capture());
        Associate saved = savedAssociateCaptor.getValue();
        assertThat(saved.getId()).isEqualTo(root.getId());
        // 20 (pre-existing) + min(100, 50)=50 matched volume = 70 -- not 5.00 (the income amount).
        assertThat(saved.getCumulativeMatchedVolume()).isEqualByComparingTo("70");
    }

    @Test
    void closeSetsCarriedForwardStatusWhenAssociateKycIsPending() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.PENDING);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        assertThat(entryCaptor.getValue().getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSetsCarriedForwardStatusWhenAssociateKycIsRejected() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.REJECTED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        assertThat(entryCaptor.getValue().getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSkipsWritingWhenAnIdempotentEntryAlreadyExistsForThatLegVolumeRow() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository);

        Associate root = associateFixture(null, null);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));
        // The LegVolume row's id is only generated at runtime inside close(), so match on the
        // known associateId/cycleId/incomeType and accept any sourceRef.
        when(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            eq(root.getId()), eq(cycle.getId()), eq(IncomeType.MATCHING), any(UUID.class)))
            .thenReturn(true);

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
        verify(legVolumeRepository, never()).save(any(LegVolume.class));
        verify(associateRepository, never()).save(any(Associate.class));
    }
```

Add `import static org.mockito.ArgumentMatchers.any;` if not already present as a static wildcard import (the file currently imports `com.mockito.Mockito.any` — check whether `any(UUID.class)`/`any(LedgerEntry.class)`/`any(Associate.class)`/`any(LegVolume.class)` typed overloads resolve correctly against the existing `import static org.mockito.Mockito.any;`; they do, `Mockito.any(Class)` is the typed overload already used elsewhere in this file via `any(Cycle.class)`).

- [ ] **Step 7: Run the new tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: FAIL — the 8 new tests fail (no `MATCHING` entries are written yet, `ledgerEntryRepository`/`legVolumeRepository` (singular `save`) are never called), while the other 10 pre-existing tests still pass.

- [ ] **Step 8: Implement `creditMatchingIncome` and wire it into `close()`**

In `backend/src/main/java/com/plotchain/cycle/CycleService.java`, change the body of `close()`:

```java
        // Flow step 2.
        List<LegVolume> legVolumes = rollUpLegVolumes(cycle.getId(), associates, sales);
        legVolumeRepository.saveAll(legVolumes);

        // Flow step 3 (Decision #10): resolved once per batch run, against cycle.getPeriodStart()
        // -- deliberately not LocalDate.now() -- so a plan version an admin publishes after this
        // cycle's period already ended never retroactively changes the rate this cycle's volume
        // was earned under. Same missing-version convention as SaleService/DashboardService.
        CompensationPlanVersion planVersion = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart())
            .orElseThrow(() -> new IllegalStateException(
                "compensation_plan_version row missing - V8 migration seeds it"));
        creditMatchingIncome(cycle.getId(), associates, legVolumes, planVersion);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
```

Add the new private method after `rollUpSubtree`:

```java
    // Flow step 3 (Decision #5, #6, #10, #11, #12): one MATCHING LedgerEntry per associate whose
    // just-computed LegVolume row (this exact cycle's, unit 4's rollup) has min(left,right) > 0.
    // All of write-entry / carry-forward-excess / increment-cumulativeMatchedVolume happen inside
    // the same min > 0 guard -- a zero-matched associate's row is left untouched (its unmatched
    // leg, if any, is not carried forward under this unit's implementation; that's the spec's
    // Flow step 3 text taken literally, not an oversight).
    private void creditMatchingIncome(
        UUID cycleId,
        List<Associate> associates,
        List<LegVolume> legVolumes,
        CompensationPlanVersion planVersion
    ) {
        Map<UUID, Associate> associatesById = new HashMap<>();
        for (Associate associate : associates) {
            associatesById.put(associate.getId(), associate);
        }

        for (LegVolume legVolume : legVolumes) {
            BigDecimal matchedVolume = legVolume.getLeftLegVolume().min(legVolume.getRightLegVolume());
            if (matchedVolume.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            Associate associate = associatesById.get(legVolume.getAssociateId());

            // Decision #12: check-then-insert. A hit here skips the whole block below -- entry,
            // carried-forward mutation, and cumulativeMatchedVolume increment together -- so a
            // skipped write can never partially double-count.
            boolean alreadyCredited = ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
                associate.getId(), cycleId, IncomeType.MATCHING, legVolume.getId());
            if (alreadyCredited) {
                continue;
            }

            BigDecimal grossAmount = matchedVolume.multiply(
                planVersion.getMatchingIncomePct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            BigDecimal tdsDeduction = grossAmount.multiply(
                planVersion.getTdsPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            BigDecimal adminDeduction = grossAmount.multiply(
                planVersion.getAdminChargeWithoutPanPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            BigDecimal netAmount = grossAmount.subtract(tdsDeduction).subtract(adminDeduction);

            LedgerEntry entry = new LedgerEntry();
            entry.setId(UUID.randomUUID());
            entry.setAssociateId(associate.getId());
            entry.setIncomeType(IncomeType.MATCHING);
            entry.setCycleId(cycleId);
            entry.setGrossAmount(grossAmount);
            entry.setTdsDeduction(tdsDeduction);
            entry.setAdminDeduction(adminDeduction);
            entry.setNetAmount(netAmount);
            entry.setStatus(associate.getKycStatus() == KycStatus.VERIFIED
                ? LedgerEntryStatus.PENDING
                : LedgerEntryStatus.CARRIED_FORWARD);
            entry.setSourceRef(legVolume.getId());
            entry.setCreatedAt(Instant.now());
            ledgerEntryRepository.save(entry);

            // Decision #5: excess on the larger leg carries forward on this SAME row for unit 4's
            // rollup to consume next cycle -- never a new row.
            if (legVolume.getLeftLegVolume().compareTo(legVolume.getRightLegVolume()) > 0) {
                legVolume.setCarriedForwardLeft(legVolume.getLeftLegVolume().subtract(legVolume.getRightLegVolume()));
            } else if (legVolume.getRightLegVolume().compareTo(legVolume.getLeftLegVolume()) > 0) {
                legVolume.setCarriedForwardRight(legVolume.getRightLegVolume().subtract(legVolume.getLeftLegVolume()));
            }
            legVolumeRepository.save(legVolume);

            // Decision #6: raw matched volume, not the post-percentage income amount.
            associate.setCumulativeMatchedVolume(associate.getCumulativeMatchedVolume().add(matchedVolume));
            associateRepository.save(associate);
        }
    }
```

- [ ] **Step 9: Run the full `CycleServiceTest` suite to verify everything passes**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: PASS — all 18 tests (10 pre-existing + 8 new).

- [ ] **Step 10: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleService.java \
        backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): credit Matching Income net of deductions, KYC-gated, in close()"
```

---

## Task 3: Full-suite verification and unit-queue bookkeeping

**Files:**
- Read-only verification: entire `backend/src/test/java/**`
- Modify: `docs/superpowers/plans/2026-08-03-cycle-management-units.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only confirms Tasks 1–2 didn't regress anything else (in particular, Sales' existing DIRECT-entry tests against the now-NOT-NULL/unique `source_ref` column, and `CycleCloseConcurrencyTest`'s real-Spring-context autowiring of `CycleService`'s now-6-arg constructor) and records the unit's plan file in the queue.

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && mvn test`
Expected: PASS, all modules — in particular:
- `SaleServiceTest` and any Sale-related `@DataJpaTest`/integration tests stay green (V17's `NOT NULL`/unique tightening on `source_ref` is transparent to Sales, since `SaleService.recordSale` already always sets `sourceRef = sale.id`, one row per `(associateId, cycleId, DIRECT, saleId)` tuple, never duplicated).
- `CycleCloseConcurrencyTest` stays green without any test-file changes — it uses `@Autowired CycleService` (real Spring wiring, not manual construction), so the new constructor arguments are satisfied automatically; it seeds zero `Associate` rows, so `creditMatchingIncome`'s loop runs over an empty `legVolumes` list, but the unconditional `compensationPlanVersionRepository` lookup still needs to resolve successfully against the real H2 test datasource's V8-seeded `compensation_plan_version` row (effective from 2000-01-01, well before any `cycle.getPeriodStart()` this test uses).
- `LedgerEntryRepositoryTest` (Task 1) and the updated `CycleServiceTest` (Task 2) both still pass.

If anything else fails, stop and diagnose before continuing — do not proceed to bookkeeping on a red suite.

- [ ] **Step 2: Update the unit-queue bookkeeping file**

In `docs/superpowers/plans/2026-08-03-cycle-management-units.md`, change unit 5's row from:

```
| 5 | backend | Matching Income credited, net of deductions, KYC-gated | 4 | pending | — | — |
```

to:

```
| 5 | backend | Matching Income credited, net of deductions, KYC-gated | 4 | planned | `docs/superpowers/plans/2026-08-10-cycle-management-matching-income.md` | — |
```

Also update the "Next pending unit" note at the bottom of that file to point at unit 6 (Rank progression) instead of unit 5, once unit 5 is no longer the described next step — leave the exact wording to match the file's existing style (mirror how the unit 4 → unit 5 handoff note reads today).

- [ ] **Step 3: Commit the bookkeeping update**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add docs/superpowers/plans/2026-08-03-cycle-management-units.md
git commit -m "docs: mark cycle-management unit 5 planned, persist its plan file"
```

---

## Self-review notes (from writing this plan)

- **Spec coverage**: Decision #5 (entry mechanics, sourceRef, carried-forward) — Task 2 Steps 6/8. Decision #6 (cumulativeMatchedVolume, raw volume not income) — Task 2 Steps 6/8. Decision #10 (deductions math, periodStart-based lookup, resolved once) — Global Constraints + Task 2 Step 8. Decision #11 (KYC-gating) — Task 2 Steps 6/8. Decision #12 (idempotency check + migration) — Task 1 + Task 2 Steps 6/8. Flow step 3 specifically — Task 2 Step 8's `creditMatchingIncome`. Testing section's bullets (gross/net math, both carried-forward directions, zero-matched-gets-no-entry, cumulativeMatchedVolume-not-income, KYC-unverified→CARRIED_FORWARD) — Task 2 Step 6's 8 new tests, one per bullet. No gaps found against this unit's scope.
- **Placeholder scan**: no TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency**: `CycleService`'s constructor signature `(CycleRepository, AssociateRepository, LegVolumeRepository, SaleRepository, CompensationPlanVersionRepository, LedgerEntryRepository)` is used identically across Task 2 Step 1 (production) and every test call site in Steps 6+ (test). `creditMatchingIncome(UUID, List<Associate>, List<LegVolume>, CompensationPlanVersion): void` signature matches its one call site in Step 8. `existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(UUID, UUID, IncomeType, UUID): boolean` matches between Task 1's repository declaration and Task 2's `creditMatchingIncome` call.
