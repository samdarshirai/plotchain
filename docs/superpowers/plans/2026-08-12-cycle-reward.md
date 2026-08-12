# Cycle Management Unit 9: Reward Tiers (Awarded Once Ever) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside `CycleService.close()`'s settlement batch, after Royalty (unit 8, merged), credit every associate (including Admin) a `REWARD` `LedgerEntry` for each `RewardTier` whose `volumeThreshold` is now met by `associate.cumulativeMatchedVolume` — idempotency-checked **by tier, not by cycle**, so a tier is awarded exactly once ever, even though `cumulativeMatchedVolume` stays above the threshold in every later cycle — flow step 7 of the settlement batch, per `docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md`, Decision #8 and Flow step 7.

**Architecture:** One new private method, `creditReward(UUID cycleId, List<Associate> associates, CompensationPlanVersion planVersion)`, added to `CycleService` and called from `close()` immediately after `creditRoyalty(...)` and before the `CLOSED` status flip — the same sequential-insertion pattern units 3→4→5→6→7→8 already established. `RewardTierRepository` becomes a 9th constructor dependency (its ordered-by-tier-level query, `findAllByPlanVersionIdOrderByTierLevel`, already exists — confirmed by reading the interface directly, no new repository method needed there). Reward reuses the `applyDeductions`/`kycGatedStatus` helpers unit 8's Task 1 already extracted — no fourth inline copy of that math. The one genuinely new piece of data-access surface is `LedgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(UUID, IncomeType, UUID): boolean` — deliberately omitting `cycleId`, the literal mechanism Decision #8 calls for to make a reward tier "awarded once ever" rather than once per cycle.

**Tech Stack:** Spring Boot service layer, JPA entities (`Associate`, `LedgerEntry`, `RewardTier`), JUnit 5 + Mockito (`CycleServiceTest`, unit-level, mocked repositories) + `@DataJpaTest` (`LedgerEntryRepositoryTest`, real H2 MODE=PostgreSQL) + `@SpringBootTest` (a new `CycleCloseRewardIntegrationTest`, real DB, proving the cross-cycle idempotency claim end-to-end) — matches existing conventions in `backend/src/test/java/com/plotchain/`.

## Global Constraints

- **Scope boundary (hard):** this unit implements ONLY flow step 7 (Reward). No settlement-batch atomicity/re-run hardening (unit 10 — that unit's dependency list already includes this one, 3,4,5,6,7,8,9). Do not touch `CycleCloseResponse`'s shape — units 5–9 write `LedgerEntry` rows without touching that DTO, a precedent unit 5 established and units 6/7/8 followed.
- **`grossAmount = tier.cashReward`** — a flat configured amount, not a percentage calculation (contrast with every other income type in this batch, which all multiply a base by a percentage). `perkDescription` gets no separate ledger line or `PERK`-type entry (Decision #8) — it's descriptive metadata reachable by looking up the `RewardTier` row via this entry's `sourceRef`.
- **`sourceRef = tier.id`.**
- **Trigger condition: `tier.volumeThreshold <= associate.cumulativeMatchedVolume`**, evaluated per `(associate, tier)` pair, walking tiers in **ascending `tierLevel`** order via `RewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())` — this method already exists and is already tested for ascending order (`CompensationPlanVersionRepositoryTest`, verified by reading it directly), so no new repository method is needed for the tier lookup itself. `cumulativeMatchedVolume` is read directly off the in-memory `Associate` object already mutated by `creditMatchingIncome` (Decision #6, runs before this in `close()`) — a plain field read, no fresh query.
- **No role guard, unlike Royalty (unit 8).** Decision #8 is explicit: `RewardTier` has "no FK to rank_tier, only to `compensation_plan_version`", so unlike Royalty this *does* apply to Admin — and, by the same structural reasoning (nothing rank-keyed to skip), to the four staff roles too. `creditReward` iterates every associate in `associates` with zero role filtering. Do not copy `creditRoyalty`'s/`advanceRanks`' `role == AssociateRole.ASSOCIATE` guard here — this is the one step in the batch that is genuinely role-blind.
- **Multiple tiers can be newly-crossed by one associate in a single cycle.** A cycle whose sales jump an associate's `cumulativeMatchedVolume` past several thresholds at once must award every newly-crossed tier, not just the highest — this is a deliberate contrast with `advanceRanks` (unit 6), which advances rank to only the single highest qualifying tier. `creditReward`'s inner loop over `tiers` does not stop at the first match or track a "highest"; it evaluates and (idempotency-permitting) awards every tier whose threshold is met.
- **Idempotency spans cycles — this is the whole point of the unit.** `LedgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(associateId, IncomeType.REWARD, tier.id)` (new method, Task 1) is checked before every write, and — unlike every other income type's `existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef` — takes no `cycleId` argument at all. A tier awarded in cycle N must never be re-awarded in cycle N+1, N+2, etc., even though `cumulativeMatchedVolume` remains above threshold forever after crossing it once (Decision #8's own words).
- **Deductions (Decision #10) and KYC-gating (Decision #11) use the existing extracted helpers, `applyDeductions`/`kycGatedStatus`** — same math, same semantics as units 5, 7, and 8. `kycGatedStatus` gates on the rewarded associate's own `kycStatus`.
- **Inferred rule (not spec-literal, consistent with units 5/7/8's identical reasoning): skip writing when `tier.cashReward` is not strictly positive.** A `RewardTier` with `cashReward = 0` is a valid admin configuration (e.g. a tier that's perk-only, per `perkDescription`, with no cash component) — writing a zero-value `LedgerEntry` would be pure noise, the same reasoning units 5/7/8 already applied to their own gross-amount guards.
- **No new migration.** `RewardTier`, `IncomeType.REWARD`, and `Associate.cumulativeMatchedVolume` all already exist (`V8__compensation_plan.sql`, `IncomeType` enum, `V1__create_dashboard_tables.sql` respectively — `cumulative_matched_volume NUMERIC(14,2) NOT NULL DEFAULT 0`, so no null-handling is needed anywhere in this unit's code). `ledger_entry`'s idempotency constraint (V17, `UNIQUE (associate_id, cycle_id, income_type, source_ref)`) already covers `REWARD` generically — it's cycle-scoped at the DB level, which is fine, because the *application-level* check this unit adds is deliberately broader (cross-cycle) than what the DB constraint alone would catch.
- **No rounding/percentage math at all for Reward's own `grossAmount`** — `tier.getCashReward()` is used as-is, `BigDecimal` already at the correct scale from `reward_tier.cash_reward NUMERIC(14,2)`. `applyDeductions` still performs its own internal `divide(..., 6, RoundingMode.HALF_UP)` percentage math for `tdsDeduction`/`adminDeduction`, unchanged from every other caller.

---

## File Structure

- **Modify:** `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java` — add `existsByAssociateIdAndIncomeTypeAndSourceRef(UUID, IncomeType, UUID): boolean`.
- **Modify:** `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java` — add two tests for the new method (this file already tests the cycle-scoped sibling method, so the new method's tests live alongside it).
- **Modify:** `backend/src/main/java/com/plotchain/cycle/CycleService.java` — add `RewardTierRepository` as a 9th constructor dependency; add `creditReward(...)`; call it from `close()` right after `creditRoyalty(...)`.
- **Modify:** `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` — add `@Mock RewardTierRepository rewardTierRepository`; update every `new CycleService(...)` call site (43 occurrences, verified by `grep -c` before writing this plan) to pass it as the 9th argument; add new Reward test methods.
- **Create:** `backend/src/test/java/com/plotchain/cycle/CycleCloseRewardIntegrationTest.java` — `@SpringBootTest`, real DB, proves Decision #8's cross-cycle idempotency claim by running `close()` across two consecutive real cycles and asserting no second `REWARD` entry appears in the second cycle's output. Modeled directly on `CycleCloseSponsorMatchingIntegrationTest` (unit 7)'s fixture/cleanup shape.

No other files change. `CycleCloseRollbackTest` and `CycleCloseConcurrencyTest` (both `@SpringBootTest`, autowire `CycleService` via Spring DI) need no source changes — Spring resolves the new constructor argument automatically since `RewardTierRepository` is already a registered bean (it backs the existing, admin-only Compensation Rules Config screen).

---

## Task 1: `LedgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef` — the cross-cycle idempotency check

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Modify: `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`

**Interfaces:**
- Produces: `LedgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(UUID associateId, IncomeType incomeType, UUID sourceRef): boolean` — Task 3's `creditReward` consumes this directly.

- [ ] **Step 1: Write the failing tests**

`backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java` already has a `newEntry(UUID, UUID, IncomeType, UUID)` fixture helper and an `existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRefReturnsTrueOnlyForAnExactTupleMatch` test that shows the exact pattern this new method's tests reuse (confirmed by reading the file directly). Add these two tests immediately after that one:

```java
    // Cycle-management unit 9 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #8): Reward's own idempotency check, deliberately narrower than
    // existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef above -- omits cycleId entirely,
    // because a RewardTier is awarded once EVER, in whichever cycle first crosses it, not once
    // per cycle. This method has no cycleId parameter at all, so there is nothing for a caller in
    // a later cycle to (correctly or incorrectly) scope the check to -- proven by construction,
    // not just by this test's assertion.
    @Test
    void existsByAssociateIdAndIncomeTypeAndSourceRefFindsAnEntryRegardlessOfWhichCycleItWasCreditedIn() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID tierId = UUID.randomUUID();
        ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.REWARD, tierId));

        assertThat(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(
            associate.getId(), IncomeType.REWARD, tierId)).isTrue();
    }

    @Test
    void existsByAssociateIdAndIncomeTypeAndSourceRefReturnsFalseForADifferentTierOrIncomeType() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID tierId = UUID.randomUUID();
        ledgerEntryRepository.saveAndFlush(newEntry(associate.getId(), cycle.getId(), IncomeType.REWARD, tierId));

        // Different sourceRef (a different tier) -> no match, even for the same associate/type.
        assertThat(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(
            associate.getId(), IncomeType.REWARD, UUID.randomUUID())).isFalse();
        // Same sourceRef but a different incomeType -> no match, proving the type filter is real.
        assertThat(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(
            associate.getId(), IncomeType.ROYALTY, tierId)).isFalse();
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=LedgerEntryRepositoryTest#existsByAssociateIdAndIncomeTypeAndSourceRefFindsAnEntryRegardlessOfWhichCycleItWasCreditedIn+existsByAssociateIdAndIncomeTypeAndSourceRefReturnsFalseForADifferentTierOrIncomeType`
Expected: FAIL — compile error, `existsByAssociateIdAndIncomeTypeAndSourceRef` doesn't exist yet.

- [ ] **Step 3: Add the repository method**

In `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`, add immediately after `existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef`:

```java
    // Cycle-management unit 9 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #8): Reward's own idempotency check. Deliberately narrower than
    // existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef above -- omits cycleId on purpose,
    // because a RewardTier is awarded once EVER, not once per cycle. Same plain Spring Data
    // derived query shape as the cycle-scoped version; the DB-level uq_ledger_entry_idempotency
    // constraint (V17) is still cycle-scoped, so this application-level check is what actually
    // does the cross-cycle work -- see this unit's plan, Global Constraints.
    boolean existsByAssociateIdAndIncomeTypeAndSourceRef(
        UUID associateId, IncomeType incomeType, UUID sourceRef);
```

- [ ] **Step 4: Run the full file to verify everything passes**

Run: `cd backend && mvn -q test -Dtest=LedgerEntryRepositoryTest`
Expected: PASS, all tests in the file (the two new ones plus every pre-existing test unaffected).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java \
        backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java
git commit -m "feat(cycle): add LedgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef"
```

---

## Task 2: Wire `RewardTierRepository` into `CycleService` (plumbing only, no new behavior)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `com.plotchain.compensation.RewardTierRepository` (existing, `findAllByPlanVersionIdOrderByTierLevel(UUID): List<RewardTier>`).
- Produces: `CycleService`'s constructor now has 9 parameters, ending in `RewardTierRepository rewardTierRepository`; `this.rewardTierRepository` is available to `creditReward` in Task 3.

- [ ] **Step 1: Add the `@Mock RewardTierRepository rewardTierRepository` field and update every constructor call site in the test file**

In `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`, add the import and mock field:

```java
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
```

```java
    @Mock CycleRepository cycleRepository;
    @Mock AssociateRepository associateRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock SaleRepository saleRepository;
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Mock RewardTierRepository rewardTierRepository;
    CycleService service;
```

Then update **every** occurrence of the trailing line:

```java
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);
```

to:

```java
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);
```

This exact trailing line is byte-for-byte identical at all 43 call sites in the current file (verified by `grep -c "compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);"` before writing this plan) — a single `replace_all` edit on that one string updates every `new CycleService(...)` call at once. Do not add any `when(rewardTierRepository...)` stubbing to pre-existing tests — Mockito returns an empty `List` by default for an unstubbed method returning `List`, and `creditReward`'s own empty-tiers early-return (Task 3) makes that the correct "no reward tiers configured" no-op for tests that don't care about Reward.

- [ ] **Step 2: Add the same constructor argument to `CycleService.java`**

Add the imports (after the existing `com.plotchain.compensation.RoyaltyBonusRateRepository` import):

```java
import com.plotchain.compensation.RewardTier;
import com.plotchain.compensation.RewardTierRepository;
```

Change the field declarations (after `private final RoyaltyBonusRateRepository royaltyBonusRateRepository;`):

```java
    private final RoyaltyBonusRateRepository royaltyBonusRateRepository;
    private final RewardTierRepository rewardTierRepository;
```

Change the constructor:

```java
    public CycleService(
        CycleRepository cycleRepository,
        AssociateRepository associateRepository,
        LegVolumeRepository legVolumeRepository,
        SaleRepository saleRepository,
        CompensationPlanVersionRepository compensationPlanVersionRepository,
        LedgerEntryRepository ledgerEntryRepository,
        RankTierRepository rankTierRepository,
        RoyaltyBonusRateRepository royaltyBonusRateRepository,
        RewardTierRepository rewardTierRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.associateRepository = associateRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.rankTierRepository = rankTierRepository;
        this.royaltyBonusRateRepository = royaltyBonusRateRepository;
        this.rewardTierRepository = rewardTierRepository;
    }
```

- [ ] **Step 3: Compile and run the full existing test suite — confirm zero behavior change**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest,CycleCloseRollbackTest,CycleCloseConcurrencyTest,CycleCloseSponsorMatchingIntegrationTest,CycleControllerTest,CycleExceptionHandlerTest,CycleRepositoryTest`

Expected: all tests PASS, same count as before this task. This is a pure plumbing change; no assertions should change behavior. `CycleCloseRollbackTest`/`CycleCloseConcurrencyTest`/`CycleCloseSponsorMatchingIntegrationTest` need no source changes since they `@Autowired CycleService` via Spring, which resolves the new constructor argument automatically from the existing `RewardTierRepository` bean (already registered — it backs the Compensation Rules Config screen).

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleService.java backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): wire RewardTierRepository into CycleService (unit 9 plumbing)"
```

---

## Task 3: Reward credited inline in `CycleService.close()`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `RewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(UUID): List<RewardTier>` (existing, Task 2). `applyDeductions(BigDecimal, CompensationPlanVersion): Deductions`, `kycGatedStatus(Associate): LedgerEntryStatus` (existing, unit 8). `LedgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(UUID, IncomeType, UUID): boolean` (Task 1). `RewardTier.getVolumeThreshold(): BigDecimal`, `RewardTier.getCashReward(): BigDecimal`, `RewardTier.getId(): UUID` (existing entity).
- Produces: `private void creditReward(UUID cycleId, List<Associate> associates, CompensationPlanVersion planVersion)`, called from `close()` right after `creditRoyalty(cycle.getId(), associates, legVolumes, planVersion)`. `CycleService`'s constructor signature is unchanged by this task (already 9 args, from Task 2). `close()`'s signature and `CycleCloseResponse`'s shape are unchanged.

- [ ] **Step 1: Add a fixture helper for a `RewardTier`**

Add this private helper in `CycleServiceTest.java`, near `royaltyBonusRateFixture`:

```java
    private RewardTier rewardTierFixture(UUID planVersionId, int tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward) {
        return new RewardTier(UUID.randomUUID(), planVersionId, tierLevel, volumeThreshold, cashReward, null);
    }
```

- [ ] **Step 2: Write the failing tests**

Add these tests to `CycleServiceTest.java`. As with unit 8's plan: tests (b), (d), (f), (g) below assert "no `REWARD` entry written" — before this task's implementation exists, `creditReward` is never called, so those trivially pass even with zero production code; that's expected. Tests (a), (c), (e), (h) genuinely fail until `creditReward` exists and is wired in.

```java
    @Test
    void closeCreditsRewardForAnAssociateWhoCrossesATierThreshold() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(100, 50) = 50, pushing cumulativeMatchedVolume from 0 to 50 this
        // cycle -- same tree shape unit 5's own basic test uses.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00"))
        ));

        service.close(cycle.getId());

        // Two saves this cycle: the MATCHING entry (unit 5) and the REWARD entry (this unit).
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        LedgerEntry rewardEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).findFirst().orElseThrow();

        assertThat(rewardEntry.getAssociateId()).isEqualTo(root.getId());
        assertThat(rewardEntry.getCycleId()).isEqualTo(cycle.getId());
        assertThat(rewardEntry.getGrossAmount()).isEqualByComparingTo("1000.00");
        // tds = 1000 * 5% = 50.00, admin = 1000 * 4% = 40.00, net = 910.00 -- same planVersionFixture()
        // rates unit 8's own Royalty tests use.
        assertThat(rewardEntry.getTdsDeduction()).isEqualByComparingTo("50.00");
        assertThat(rewardEntry.getAdminDeduction()).isEqualByComparingTo("40.00");
        assertThat(rewardEntry.getNetAmount()).isEqualByComparingTo("910.00");
        assertThat(rewardEntry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(rewardEntry.getCreatedAt()).isNotNull();
    }

    @Test
    void closeWritesNoRewardEntryWhenNoTierThresholdIsMet() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
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

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        // Matched volume this cycle is 50, but the only configured tier needs 500 -- no tier is
        // crossed.
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("500"), new BigDecimal("1000.00"))
        ));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.REWARD));
    }

    @Test
    void closeCreditsMultipleNewlyCrossedRewardTiersInASingleCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(500, 500) = 500 this single cycle, jumping cumulativeMatchedVolume
        // from 0 straight past two tier thresholds (40 and 100) at once.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("500")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("500"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00")),
            rewardTierFixture(planVersion.getId(), 2, new BigDecimal("100"), new BigDecimal("5000.00"))
        ));

        service.close(cycle.getId());

        // Three saves: MATCHING (unit 5) + two REWARD entries, one per newly-crossed tier.
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(3)).save(entryCaptor.capture());
        List<LedgerEntry> rewardEntries = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).toList();
        assertThat(rewardEntries).hasSize(2);
        List<BigDecimal> rewardGrossAmounts = rewardEntries.stream().map(LedgerEntry::getGrossAmount).toList();
        // BigDecimal.equals() is scale-sensitive, so compare by value (compareTo == 0) rather than
        // relying on containsExactlyInAnyOrder's equals()-based matching.
        assertThat(rewardGrossAmounts).anyMatch(a -> a.compareTo(new BigDecimal("1000.00")) == 0);
        assertThat(rewardGrossAmounts).anyMatch(a -> a.compareTo(new BigDecimal("5000.00")) == 0);
    }

    @Test
    void closeCreditsRewardForAdmin() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        // Decision #8: RewardTier has no FK to rank_tier, so unlike Royalty (unit 8, which
        // explicitly skips Admin), Reward applies to Admin in full.
        Associate admin = associateFixture(null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setRankId(null);
        Associate left = associateFixture(admin.getId(), "L");
        Associate right = associateFixture(admin.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(admin, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00"))
        ));

        service.close(cycle.getId());

        LedgerEntry rewardEntry = verifyAndCaptureRewardEntry();
        assertThat(rewardEntry.getAssociateId()).isEqualTo(admin.getId());
    }

    private LedgerEntry verifyAndCaptureRewardEntry() {
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.atLeastOnce()).save(entryCaptor.capture());
        return entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.REWARD).findFirst().orElseThrow();
    }

    @Test
    void closeSetsCarriedForwardStatusForRewardWhenAssociateKycIsNotVerified() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.PENDING); // not verified
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

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00"))
        ));

        service.close(cycle.getId());

        LedgerEntry rewardEntry = verifyAndCaptureRewardEntry();
        assertThat(rewardEntry.getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSkipsRewardWriteWhenAnIdempotentEntryAlreadyExists() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
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

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        RewardTier tier = rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), new BigDecimal("1000.00"));
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(tier));
        // Simulates "already awarded in an earlier cycle" -- no cycleId argument exists on this
        // method at all, which is exactly the point (Decision #8).
        when(ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(root.getId(), IncomeType.REWARD, tier.getId()))
            .thenReturn(true);

        service.close(cycle.getId());

        // MATCHING still gets written (its own idempotency check is untouched by this stub) --
        // only REWARD is skipped.
        verify(ledgerEntryRepository, org.mockito.Mockito.times(1)).save(any(LedgerEntry.class));
        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.REWARD));
    }

    @Test
    void closeSkipsRewardWriteWhenTierCashRewardIsZero() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
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

        CompensationPlanVersion planVersion = planVersionFixture();
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersion));
        // cashReward = 0 -- a valid perk-only tier configuration, distinct from "threshold not
        // met" (tested above).
        when(rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId())).thenReturn(List.of(
            rewardTierFixture(planVersion.getId(), 1, new BigDecimal("40"), BigDecimal.ZERO)
        ));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.REWARD));
    }

    @Test
    void closeWritesNoRewardEntryWhenNoRewardTiersAreConfigured() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository,
            rewardTierRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
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
        // Deliberately NOT stubbing rewardTierRepository -- Mockito's unstubbed default for a
        // List-returning method is an empty List, i.e. "no reward tiers configured for this plan
        // version", exercising creditReward's early-return.

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.REWARD));
    }
```

Add the import for `RewardTier` if not already present from Task 2 (it is, from Step 1 of Task 2) — no further import changes needed.

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: FAIL — `closeCreditsRewardForAnAssociateWhoCrossesATierThreshold`, `closeCreditsMultipleNewlyCrossedRewardTiersInASingleCycle`, `closeCreditsRewardForAdmin`, and `closeSetsCarriedForwardStatusForRewardWhenAssociateKycIsNotVerified` fail (no `REWARD` entry is ever written, since `creditReward` doesn't exist yet and isn't wired into `close()`). `closeSkipsRewardWriteWhenAnIdempotentEntryAlreadyExists` also fails its first assertion (`times(1)` — only `MATCHING` is expected to be saved, but with `creditReward` absent that assertion passes vacuously; check this one manually rather than assuming). The remaining new tests pass vacuously — every pre-existing test still passes.

- [ ] **Step 4: Implement `creditReward` and wire it into `close()`**

In `backend/src/main/java/com/plotchain/cycle/CycleService.java`, change `close()`'s body — replace:

```java
        // Flow step 6 (Decision #7, #10, #11, #12): Royalty at the associate's POST-rank-advancement
        // rank (step 4, above) -- an achievement crossed this cycle earns this cycle's royalty
        // rate immediately. No-op per associate when no RoyaltyBonusRate is configured for their
        // rank (not an error -- some low ranks have none). Guard is role == ASSOCIATE, same
        // reasoning as advanceRanks' own guard: rank_id is null for Admin AND the four staff
        // roles (chk_associate_rank_required, V4), not just Admin. This is this unit's own
        // insertion point; unit 9 (Reward) inserts its own step immediately after this call,
        // before the CLOSED flip below.
        creditRoyalty(cycle.getId(), associates, legVolumes, planVersion);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
```

with:

```java
        // Flow step 6 (Decision #7, #10, #11, #12): Royalty at the associate's POST-rank-advancement
        // rank (step 4, above) -- an achievement crossed this cycle earns this cycle's royalty
        // rate immediately. No-op per associate when no RoyaltyBonusRate is configured for their
        // rank (not an error -- some low ranks have none). Guard is role == ASSOCIATE, same
        // reasoning as advanceRanks' own guard: rank_id is null for Admin AND the four staff
        // roles (chk_associate_rank_required, V4), not just Admin.
        creditRoyalty(cycle.getId(), associates, legVolumes, planVersion);

        // Flow step 7 (Decision #8): for EVERY associate, including Admin -- RewardTier has no FK
        // to rank_tier, so nothing here excludes any role, unlike Royalty above. Idempotency is
        // checked WITHOUT a cycleId (Decision #8: a tier is awarded once EVER, in whichever cycle
        // first crosses it). This is this unit's own insertion point; unit 10's atomicity/re-run
        // hardening depends on this step existing but is not expected to insert a new call here.
        creditReward(cycle.getId(), associates, planVersion);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
```

Also update the class-level comment above `close()`:

```java
    // Cycle-management unit 3 (row lock + OPEN check, unchanged) + unit 4 (leg-volume rollup) +
    // unit 5 (Matching Income) + unit 6 (Rank progression) + unit 7 (Sponsor Matching) + unit 8
    // (Royalty) + unit 9 (Reward) --
    // docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch flow steps 1, 2, 3, 4, 5, 6, 7, 8. Every flow step (1-8) this
    // batch calls for is now implemented; unit 10 is atomicity/re-run hardening across the whole
    // pipeline above, not a new flow step of its own.
    @Transactional
    public CycleCloseResponse close(UUID id) {
```

Add the new private method after `creditRoyalty`, before `getOrOpenCurrent`:

```java
    // Flow step 7 (Decision #8): for EVERY associate (Admin included -- RewardTier has no FK to
    // rank_tier, unlike Royalty, so nothing here excludes any role), walk RewardTiers in
    // ascending tierLevel order (findAllByPlanVersionIdOrderByTierLevel, already ordered) and
    // award any tier whose volumeThreshold is now met by the associate's cumulativeMatchedVolume
    // (already updated by creditMatchingIncome, step 3, before this reads it -- Decision #6).
    // Idempotency is checked WITHOUT a cycleId filter (existsByAssociateIdAndIncomeTypeAndSourceRef,
    // deliberately narrower than the other four income types' cycle-scoped equivalent) -- a tier
    // is awarded once EVER, and re-running the batch or running a later cycle must never re-award
    // it even though cumulativeMatchedVolume stays above the threshold forever after (Decision
    // #8's own words). Multiple tiers can be newly-crossed in a single cycle (a large one-off
    // sale can jump an associate past several thresholds at once) -- each gets its own entry,
    // sourceRef = tier.id. perkDescription is never written as its own ledger line: it's
    // descriptive metadata reachable by looking up the RewardTier row this entry's sourceRef
    // points to.
    private void creditReward(
        UUID cycleId,
        List<Associate> associates,
        CompensationPlanVersion planVersion
    ) {
        List<RewardTier> tiers = rewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(planVersion.getId());
        if (tiers.isEmpty()) {
            return;
        }

        for (Associate associate : associates) {
            for (RewardTier tier : tiers) {
                if (tier.getVolumeThreshold().compareTo(associate.getCumulativeMatchedVolume()) > 0) {
                    continue;
                }

                boolean alreadyAwarded = ledgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(
                    associate.getId(), IncomeType.REWARD, tier.getId());
                if (alreadyAwarded) {
                    continue;
                }

                BigDecimal grossAmount = tier.getCashReward();
                if (grossAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }

                Deductions deductions = applyDeductions(grossAmount, planVersion);

                LedgerEntry entry = new LedgerEntry();
                entry.setId(UUID.randomUUID());
                entry.setAssociateId(associate.getId());
                entry.setIncomeType(IncomeType.REWARD);
                entry.setCycleId(cycleId);
                entry.setGrossAmount(grossAmount);
                entry.setTdsDeduction(deductions.tdsDeduction());
                entry.setAdminDeduction(deductions.adminDeduction());
                entry.setNetAmount(deductions.netAmount());
                entry.setStatus(kycGatedStatus(associate));
                entry.setSourceRef(tier.getId());
                entry.setCreatedAt(Instant.now());
                ledgerEntryRepository.save(entry);
            }
        }
    }
```

- [ ] **Step 5: Run the full `CycleServiceTest` suite to verify everything passes**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: PASS — all tests, pre-existing plus the 8 new ones.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleService.java \
        backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): credit Reward tiers, idempotency checked across cycles (Decision #8)"
```

---

## Task 4: Cross-cycle idempotency integration test

**Files:**
- Create: `backend/src/test/java/com/plotchain/cycle/CycleCloseRewardIntegrationTest.java`

**Interfaces:**
- Consumes: `CycleService.close(UUID): CycleCloseResponse` (existing, Spring-wired), `RewardTierRepository`, `LedgerEntryRepository`, `AssociateRepository`, `SaleRepository`, `CycleRepository`, `LegVolumeRepository`, `ProjectRepository`/`PlotRepository` (existing beans, real DB).
- Produces: nothing new for other tasks to consume — this is a leaf verification task, proving Decision #8's own explicit second testing requirement (spec line 117: "assert the reward-tier check in Decision #8 does span cycles: run the batch across two consecutive cycles for an associate whose volume already crossed a tier in the first, and confirm no second `REWARD` entry for that tier appears in the second cycle's output").

A mocked-repository unit test (Task 3's `CycleServiceTest`) can prove `creditReward` *calls* `existsByAssociateIdAndIncomeTypeAndSourceRef` with no `cycleId` argument (true by the method's own signature), but it cannot prove the DB-backed idempotency check actually holds across two *real*, separately-committed `close()` calls the way `CycleCloseSponsorMatchingIntegrationTest` (unit 7) proves same-transaction visibility for its own concern. This task is that proof for Reward, across two separate transactions (each `close()` call is its own `@Transactional` invocation).

- [ ] **Step 1: Write the integration test**

```java
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
```

- [ ] **Step 2: Run the new test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=CycleCloseRewardIntegrationTest`
Expected: PASS. If it fails on the first `close()` call with an unrelated assertion, check that `Project`/`Plot` constructor argument order matches the current entity (verify against `CycleCloseSponsorMatchingIntegrationTest`'s own working use of the same constructors before debugging further).

- [ ] **Step 3: Run the full cycle package test suite to confirm no regressions**

Run: `cd backend && mvn -q test -Dtest=com.plotchain.cycle.*`
Expected: PASS, all classes in the `com.plotchain.cycle` package.

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/cycle/CycleCloseRewardIntegrationTest.java
git commit -m "test(cycle): prove Reward's idempotency check spans separately-committed cycles"
```

---

## Task 5: Full-suite verification and unit-queue bookkeeping

**Files:**
- Read-only verification: entire `backend/src/test/java/**`
- Modify: `docs/superpowers/plans/2026-08-03-cycle-management-units.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only confirms Tasks 1–4 didn't regress anything else and records the unit's plan file in the queue.

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && mvn test`
Expected: PASS, all modules — in particular:
- `CycleServiceTest` (Tasks 2, 3), `LedgerEntryRepositoryTest` (Task 1), `CycleCloseRewardIntegrationTest` (Task 4) all pass.
- `CycleCloseRollbackTest`, `CycleCloseConcurrencyTest`, and `CycleCloseSponsorMatchingIntegrationTest` stay green without any changes — all `@Autowired CycleService` via real Spring wiring, and this unit's new constructor argument resolves automatically. `CycleCloseConcurrencyTest` seeds zero `Associate` rows, so `creditReward`'s outer loop over `associates` runs zero times — a safe no-op, same shape as `creditMatchingIncome`/`advanceRanks`/`creditSponsorMatching`/`creditRoyalty` already handle for that test.
- `CompensationPlanControllerTest`, `CompensationPlanServiceTest`, `CompensationExceptionHandlerTest`, `CompensationPlanVersionRepositoryTest` stay unaffected — this unit adds no compensation-package code (`RewardTierRepository.findAllByPlanVersionIdOrderByTierLevel` already existed and is unchanged).
- Sales-owned tests (`SaleServiceTest` etc.) stay unaffected — this unit touches no Sales code.
- (Known, pre-existing and unrelated: `mvn test` may show ~55 spurious Mockito errors from a JDK21/25 mismatch in this environment — see the JDK/Mockito memory note. Don't mistake those for a regression this unit caused; check that the specific test classes above report their expected pass counts.)

If anything else fails, stop and diagnose before continuing — do not proceed to bookkeeping on a red suite.

- [ ] **Step 2: Update the unit-queue bookkeeping file**

In `docs/superpowers/plans/2026-08-03-cycle-management-units.md`, change unit 9's row from:

```
| 9 | backend | Reward tiers, awarded once ever (no cycle scoping) | 5 | pending | — | — |
```

to:

```
| 9 | backend | Reward tiers, awarded once ever (no cycle scoping) | 5 | planned | `docs/superpowers/plans/2026-08-12-cycle-reward.md` | — |
```

Also update the "Next pending unit" note and the "Note for the next unit's plan" note at the bottom of that file to reflect that:
- Unit 9 now has a plan; `CycleService`'s constructor is 9 args, up from 8 — `RewardTierRepository` appended at the end, same pattern units 6/7/8 used.
- Every settlement-batch flow step (1 through 8) `mlm-land-platform-spec.md` §3 calls for is now implemented in `CycleService.close()`; unit 10 (Settlement batch atomic + safely re-runnable end-to-end) is the next pending unit, depends on 3,4,5,6,7,8,9 (all merged or planned by this point), and per Decisions #1/#2/#3 the atomicity/re-run properties it needs to *verify* (single `@Transactional` method, row-lock-first concurrency guard, retry-after-failure-just-works) are already structurally in place from unit 3 onward — unit 10's own plan should confirm exactly what, if anything, is still missing versus what's pure verification/test-hardening of what already exists, rather than assuming new production code is required.
- Unit 11 (screen) remains unblocked (needs 1, 2, 4 — all merged), still likely best done last alongside/after unit 10 per the existing note.

Leave the exact wording to match the file's existing style.

- [ ] **Step 3: Commit the bookkeeping update**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add docs/superpowers/plans/2026-08-03-cycle-management-units.md
git commit -m "docs: mark cycle-management unit 9 planned, persist its plan file"
```

---

## Self-review notes (from writing this plan)

- **Spec coverage**: Decision #8 in full (RewardTier evaluated against cumulativeMatchedVolume, no rank FK, applies to Admin, cross-cycle idempotency via the new no-cycleId `existsBy...` method, `perkDescription` never gets its own ledger line, `IncomeType.PERK` stays unused) — Task 1 (new repo method) + Task 3 (`creditReward` + its "applies to Admin"/"multiple tiers"/"idempotency" tests) + Task 4 (cross-cycle DB proof). Flow step 7's literal text ("walk RewardTiers in tierLevel order, award... any newly-crossed tier") — Task 3's multi-tier test. Decision #10 (deductions, shared `planVersion`) and Decision #11 (KYC-gating) — reused via the existing `applyDeductions`/`kycGatedStatus` helpers, exercised by Task 3's basic-credit and CARRIED_FORWARD tests. The spec's Testing section's two Reward-specific sentences (line 116's "Reward tier awarded exactly once across multiple cycles..." and line 117's second half, the explicit "run the batch across two consecutive cycles..." idempotency test) — Task 4 in full, plus Task 3's idempotent-write-skipped unit test for the cheaper, non-DB-backed half of the same property. "Admin participates in rollup/matching/sponsor-matching/reward but gets no rank advancement and no royalty entry" (line 116) — the Admin half is Task 3's `closeCreditsRewardForAdmin`; the "no rank advancement/no royalty" half was already covered by units 6/8's own tests, unaffected by this unit.
- **Placeholder scan**: no TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency**: `creditReward(UUID cycleId, List<Associate> associates, CompensationPlanVersion planVersion): void` — same signature at its definition (Task 3 Step 4) and its one call site in `close()` (Task 3 Step 4). `LedgerEntryRepository.existsByAssociateIdAndIncomeTypeAndSourceRef(UUID, IncomeType, UUID): boolean` matches between Task 1's declaration, Task 3's `creditReward` call, and Task 4's narrative. `RewardTierRepository.findAllByPlanVersionIdOrderByTierLevel(UUID): List<RewardTier>` — confirmed unchanged from its existing, already-tested declaration (no signature drift introduced by this plan). `applyDeductions(BigDecimal, CompensationPlanVersion): Deductions` and `kycGatedStatus(Associate): LedgerEntryStatus` match their unit-8-established declarations, reused (not redeclared) by `creditReward`. `CycleService`'s constructor grows from 8 args (post-unit-8) to 9 args in Task 2, and Task 3 introduces no further constructor change — confirmed against the actual current `CycleService.java` and `CycleServiceTest.java` (43 call sites, `grep -c` verified) before writing this plan, not assumed from the spec's prose alone.
