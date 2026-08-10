# Cycle Management Unit 6: Rank Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside `CycleService.close()`'s settlement batch, after Matching Income is credited (unit 5, merged), advance each eligible associate's `rankId` to the highest `RankTier` their updated `cumulativeMatchedVolume` now qualifies for — never downgrading — while leaving Admin and the four staff roles (which structurally have no rank) untouched.

**Architecture:** One new private method, `advanceRanks(List<Associate> associates)`, added to the existing `CycleService` class and called from `close()` immediately after `creditMatchingIncome(...)` and before the `CLOSED` status flip — the same sequential-insertion pattern units 3→4→5 already established in this file. `RankTierRepository` becomes a 7th constructor dependency. No new files, no new migration, no new ledger entries — rank progression is a pure `associate.rankId` mutation.

**Tech Stack:** Spring Boot service layer, JPA entities (`Associate`, `RankTier`), JUnit 5 + Mockito (`MockitoExtension`) unit tests matching `CycleServiceTest`'s existing fixture/mocking conventions.

## Global Constraints

- The settlement batch runs synchronously inside `close()`'s single `@Transactional` method (Decision #1) — this unit adds no new transaction boundary, no new endpoint, no async work.
- Rank progression writes **no `LedgerEntry`** — it is a plain `associate.rankId` assignment, persisted via `associateRepository.save(associate)` (Decision #7 — contrast with Royalty/Reward, units 8/9, which do write ledger entries).
- **Never demotes**: rank is a high-water mark. A candidate tier only replaces the associate's current rank if its `rankOrder` is strictly greater than the current rank's `rankOrder`.
- **No new migration** — `Associate.rankId` and `RankTier` already exist (`V1`/`V8`); this unit only reads/writes existing columns.
- Insertion point is fixed by the spec's own Flow section: immediately after Matching Income (flow step 3), before Sponsor Matching/Royalty/Reward (flow steps 5–7) and the `CLOSED` flip (flow step 8). See "Spec numbering note" below — do not follow Decision #7's prose ("inserted between Sponsor Matching and Royalty") literally; it describes insertion into the *original* `mlm-land-platform-spec.md` numbering, not this spec's own renumbered Flow section, which explicitly lists Rank progression as step 4.

---

## Spec numbering note (why step 4, not "between Sponsor Matching and Royalty")

`docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md` Decision #7's prose says rank progression is "inserted between Sponsor Matching and Royalty." But that same spec's own "Settlement batch — invoked by `POST /api/admin/cycles/{id}/close`" Flow section (lines 76–89) lists the concrete, authoritative step order:

1. Lock and resolve inputs
2. Leg-volume rollup
3. Matching Income
4. **Rank progression** — "For each non-Admin associate: advance `rankId` to the highest `RankTier` now qualified for by the updated `cumulativeMatchedVolume` (Decision #7). Never demotes."
5. Sponsor Matching
6. Royalty
7. Reward/Rank Income
8. Close and reopen

This is also confirmed by the units file's dependency graph (`docs/superpowers/plans/2026-08-03-cycle-management-units.md`): unit 7 (Sponsor Matching) depends only on unit 5 (Matching), not unit 6 (Rank) — meaning Sponsor Matching doesn't need Rank's output. Unit 8 (Royalty) depends on both 5 *and* 6, because it looks up `RoyaltyBonusRate` by "post-step-4 rank" (Flow step 6's own text). This plan follows the Flow section: Rank progression is inserted right after `creditMatchingIncome(...)`, before any of Sponsor Matching/Royalty/Reward.

## Resolved open question 1: which associates get evaluated each cycle

**Resolution: ALL eligible associates (see role guard below), every cycle — not just the subset unit 5 credited a Matching entry to this cycle.**

Reasoning:
- The Flow section's step 4 text says "For each non-Admin associate: advance `rankId`..." — an unqualified "each," not "each associate credited this cycle."
- Flow step 7 (Reward, unit 9) uses the same unqualified phrasing — "For every associate (including Admin): walk `RewardTier`s..." — and that step is *known* to need full-population evaluation every cycle (a reward tier crossed in cycle N must not be silently missed for an associate who happens to have zero matched volume in cycle N but whose cumulative total already cleared the threshold in a still-earlier cycle that this framing needs to keep re-checking for idempotency, not re-crediting, purposes). Rank progression sits in the same textual pattern.
- Practically: re-evaluating an associate whose `cumulativeMatchedVolume` didn't change this cycle is a safe no-op in the common case (if they already hold the correct highest-qualified rank, the comparison finds nothing higher and skips). It stops being a no-op — and becomes the *only* correct behavior — if `RankTier` configuration itself changes between cycles (e.g. an admin adds a new tier, or edits a `volumeThreshold` downward) via the Compensation Rules Config screen: an associate's already-accumulated volume could newly qualify for a tier without their `cumulativeMatchedVolume` changing at all this cycle. Filtering to "only associates unit 5 touched this cycle" would silently miss that associate until they next get a fresh Matching entry — an unforced, spec-unsupported restriction.
- `CycleService.close()` already loads the full `associates` list via `associateRepository.findAll()` once, in scope for the entire method — iterating it again for rank progression costs nothing extra (no new query) and is the simplest, most literal reading of the Flow section's text.

`advanceRanks(List<Associate> associates)` therefore takes the same `associates` list already passed to `creditMatchingIncome(...)`, not a filtered subset.

## Resolved open question 2: `rankOrder` direction and the role guard

**`rankOrder` direction — verified, not assumed:** `AssociateProvisioningService.create()` (line 46–48) assigns every newly-provisioned associate `rankTierRepository.findAllByOrderByRankOrder().stream().findFirst()` — i.e. the tier with the *lowest* `rankOrder` is the starting rank. `DashboardService.getDashboard()` (lines 101–103) computes "next rank" as `ranks.stream().filter(r -> r.getRankOrder() > currentRank.getRankOrder()).findFirst()` — i.e. a *higher* `rankOrder` is a more advanced rank. Both confirm: **ascending `rankOrder` = ascending rank level.** "Highest qualified tier" = the qualifying tier with the greatest `rankOrder`; "never demotes" = never assign a tier whose `rankOrder` is less than or equal to the associate's current rank's `rankOrder`.

**Role guard — corrected from the task brief's premise, verified against the actual current migration, not the spec's older description:** the brief states "`rank_id` is nullable ONLY for `role = 'ADMIN'`," citing `V3__account_provisioning.sql`. That was true as of `V3`, but `V4__user_id_login_and_admin_roles.sql` (lines 28–33) **replaced** that constraint:

```sql
-- chk_associate_rank_required read `role = 'ADMIN' OR rank_id IS NOT NULL`, which would force
-- the four new staff roles to carry a meaningless rank tier. Invert it to state the real rule:
-- only associates have a rank.
ALTER TABLE associate DROP CONSTRAINT chk_associate_rank_required;
ALTER TABLE associate ADD CONSTRAINT chk_associate_rank_required
    CHECK (role <> 'ASSOCIATE' OR rank_id IS NOT NULL);
```

The **current, live constraint** requires `rank_id IS NOT NULL` only when `role = 'ASSOCIATE'`; it is nullable for `ADMIN` *and* the four staff roles (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`). `AdminProvisioningService.create()` (line 52) provisions all four staff roles with `rankId = null`, exactly like `AdminBootstrapRunner` does for `ADMIN`. Assigning any of them a rank would be exactly as semantically wrong as assigning Admin one — same reasoning the spec applies to Admin, just not spelled out in Decision #7's prose because that prose predates the two-role model being widened to include staff accounts.

**Therefore the guard in this unit is `associate.getRole() == AssociateRole.ASSOCIATE` (process), not `associate.getRole() != AssociateRole.ADMIN` (skip only Admin).** This matches `AssociateRole.isAdminFamily()`'s existing definition (`this != ASSOCIATE`) and `TreeExplorerService`'s existing filter pattern (`a.getRole() == AssociateRole.ASSOCIATE`) — this codebase already treats "is a rank-bearing tree participant" as synonymous with `role == ASSOCIATE` elsewhere, and this unit follows that same line.

---

## File Structure

- **Modify:** `backend/src/main/java/com/plotchain/cycle/CycleService.java` — add `RankTierRepository` as a 7th constructor dependency; add a private `advanceRanks(List<Associate>)` method; call it from `close()` right after `creditMatchingIncome(...)`.
- **Modify:** `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` — add `@Mock RankTierRepository rankTierRepository`; update every `new CycleService(...)` call site (15 occurrences) to pass it as the 7th argument; add new test methods for rank progression.

No other files change. `CycleCloseRollbackTest` and `CycleCloseConcurrencyTest` (`@SpringBootTest`, autowire `CycleService` via Spring DI) need no changes — Spring resolves the new constructor argument automatically since `RankTierRepository` is already a registered bean.

---

## Task 1: Wire `RankTierRepository` into `CycleService` (plumbing only, no new behavior)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java:1-57` (imports, fields, constructor)
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` (all 15 `new CycleService(...)` call sites, plus a new `@Mock` field)

**Interfaces:**
- Consumes: `com.plotchain.rank.RankTierRepository` (existing, unmodified — `findAllByOrderByRankOrder(): List<RankTier>`).
- Produces: `CycleService`'s constructor now has 7 parameters, ending in `RankTierRepository rankTierRepository`; `this.rankTierRepository` is available to every private method added in later tasks.

- [ ] **Step 1: Add the `@Mock RankTierRepository rankTierRepository` field and update every constructor call site in the test file**

In `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`, add the import and mock field:

```java
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
```

```java
    @Mock CycleRepository cycleRepository;
    @Mock AssociateRepository associateRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock SaleRepository saleRepository;
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock RankTierRepository rankTierRepository;
    CycleService service;
```

Then update **every** occurrence of:

```java
service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
    compensationPlanVersionRepository, ledgerEntryRepository);
```

to:

```java
service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
    compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
```

There are 15 such call sites in the current file (one per `@Test` method plus none elsewhere). Do not add any `when(rankTierRepository...)` stubbing to the pre-existing tests — Mockito returns an empty `List` by default for an unstubbed method returning `List`, which is the correct "no rank tiers configured, nothing to advance" behavior for tests that don't care about rank.

- [ ] **Step 2: Add the same constructor argument to `CycleService.java`**

Add the import:

```java
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
```

Change the field declarations (after `private final LedgerEntryRepository ledgerEntryRepository;`):

```java
    private final LedgerEntryRepository ledgerEntryRepository;
    private final RankTierRepository rankTierRepository;
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
        RankTierRepository rankTierRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.associateRepository = associateRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.rankTierRepository = rankTierRepository;
    }
```

- [ ] **Step 3: Compile and run the full existing test suite — confirm zero behavior change**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest,CycleCloseRollbackTest,CycleCloseConcurrencyTest,CycleControllerTest,CycleExceptionHandlerTest,CycleRepositoryTest`

Expected: all tests PASS, same count as before this task. This is a pure plumbing change; no assertions should change behavior. `CycleCloseRollbackTest`/`CycleCloseConcurrencyTest` need no source changes since they `@Autowired CycleService` via Spring, which resolves the new constructor argument automatically from the existing `RankTierRepository` bean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleService.java backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): wire RankTierRepository into CycleService (unit 6 plumbing)"
```

---

## Task 2: Rank advances to the highest newly-qualified tier

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java` (add `advanceRanks`, call it from `close()`)
- Test: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `associates: List<Associate>` (already loaded in `close()`), `rankTierRepository.findAllByOrderByRankOrder(): List<RankTier>`.
- Produces: `private void advanceRanks(List<Associate> associates)` — mutates `associate.rankId` in place and calls `associateRepository.save(associate)` for each associate whose rank actually changes. Later tasks (3–5) add more test coverage against this same method; its signature does not change again.

- [ ] **Step 1: Write the failing tests**

Add these two test methods and one shared fixture helper to `CycleServiceTest.java`:

```java
    private List<RankTier> rankTiersFixture(UUID bronzeId, UUID silverId, UUID goldId) {
        return List.of(
            new RankTier(bronzeId, "Bronze", 10, new BigDecimal("0")),
            new RankTier(silverId, "Silver", 20, new BigDecimal("100")),
            new RankTier(goldId, "Gold", 30, new BigDecimal("500"))
        );
    }

    @Test
    void closeAdvancesRankWhenCumulativeMatchedVolumeCrossesOneThreshold() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
        root.setCumulativeMatchedVolume(new BigDecimal("80")); // pre-existing, below Silver's 100 threshold
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(100, 50) = 50 -> cumulativeMatchedVolume becomes 80 + 50 = 130,
        // crosses Silver's 100 threshold but not Gold's 500.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(root.getRankId()).isEqualTo(silverId);
    }

    @Test
    void closeAdvancesRankToTheHighestTierWhenCumulativeMatchedVolumeCrossesTwoThresholdsInOneCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
        root.setCumulativeMatchedVolume(BigDecimal.ZERO);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(1200, 600) = 600 -> cumulativeMatchedVolume becomes 0 + 600 = 600,
        // crosses BOTH Silver's 100 AND Gold's 500 in a single cycle. Rank must land on Gold
        // directly, not step through Silver.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("1200")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("600"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(root.getRankId()).isEqualTo(goldId);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest#closeAdvancesRankWhenCumulativeMatchedVolumeCrossesOneThreshold+closeAdvancesRankToTheHighestTierWhenCumulativeMatchedVolumeCrossesTwoThresholdsInOneCycle`

Expected: FAIL — `root.getRankId()` is still `bronzeId` (or whatever it was set to), since `advanceRanks` doesn't exist yet and nothing updates `rankId` after Matching Income.

- [ ] **Step 3: Implement `advanceRanks` and call it from `close()`**

In `CycleService.java`, add this private method (placed after `creditMatchingIncome`, before `getOrOpenCurrent`):

```java
    // Flow step 4 (Decision #7): for each ASSOCIATE-role associate, advance rankId to the
    // highest RankTier whose volumeThreshold is now met by the just-updated
    // cumulativeMatchedVolume (Decision #6, already incremented by creditMatchingIncome above,
    // for every associate in this cycle -- not just those with a Matching entry this cycle, see
    // the plan's "Resolved open question 1"). Never demotes: a candidate only wins if its
    // rankOrder is strictly greater than the associate's CURRENT rank's rankOrder, so a
    // cumulativeMatchedVolume that (defensively; it shouldn't per Decision #6) failed to
    // monotonically increase can never lower rankId.
    //
    // Guard is role == ASSOCIATE, not role != ADMIN: chk_associate_rank_required
    // (V4__user_id_login_and_admin_roles.sql) reads `role <> 'ASSOCIATE' OR rank_id IS NOT NULL`
    // -- rank_id is required ONLY for ASSOCIATE, nullable for ADMIN *and* the four staff roles
    // (SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT; AdminProvisioningService provisions all four
    // with rankId = null, same as AdminBootstrapRunner does for ADMIN). Excluding only ADMIN
    // here would leave staff rows structurally eligible for a rank advancement that's exactly as
    // semantically meaningless for them as it is for Admin -- V4's own migration comment says it
    // plainly: "only associates have a rank."
    private void advanceRanks(List<Associate> associates) {
        List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();
        if (ranks.isEmpty()) {
            return;
        }

        Map<UUID, RankTier> ranksById = new HashMap<>();
        for (RankTier rank : ranks) {
            ranksById.put(rank.getId(), rank);
        }

        for (Associate associate : associates) {
            if (associate.getRole() != AssociateRole.ASSOCIATE) {
                continue;
            }

            // ranks is ascending by rankOrder; keep overwriting so the last candidate that
            // individually qualifies is the one with the highest rankOrder among ALL qualifying
            // tiers -- correct even if volumeThreshold isn't strictly monotonic with rankOrder.
            RankTier highestQualified = null;
            for (RankTier candidate : ranks) {
                if (candidate.getVolumeThreshold().compareTo(associate.getCumulativeMatchedVolume()) <= 0) {
                    highestQualified = candidate;
                }
            }
            if (highestQualified == null) {
                continue;
            }

            RankTier currentRank = associate.getRankId() == null ? null : ranksById.get(associate.getRankId());
            int currentRankOrder = currentRank == null ? Integer.MIN_VALUE : currentRank.getRankOrder();
            if (highestQualified.getRankOrder() > currentRankOrder) {
                associate.setRankId(highestQualified.getId());
                associateRepository.save(associate);
            }
        }
    }
```

Add the two new imports at the top of the file:

```java
import com.plotchain.associate.AssociateRole;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
```

(`RankTier`/`RankTierRepository` were already added in Task 1 — don't duplicate the import line, just confirm both are present.)

Then update `close()` to call it, right after `creditMatchingIncome(...)` and before the `CLOSED` flip:

```java
        creditMatchingIncome(cycle.getId(), associates, legVolumes, planVersion);

        // Flow step 4 (Decision #7): advance rankId for each ASSOCIATE-role associate to the
        // highest RankTier their updated cumulativeMatchedVolume now qualifies for. Never
        // demotes. Skipped for ADMIN and the four staff roles (see advanceRanks' own comment).
        advanceRanks(associates);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
```

Also update the class-level comment above `close()` (originally written by unit 5) to stop claiming rank progression is unimplemented:

```java
    // Cycle-management unit 3 (row lock + OPEN check, unchanged) + unit 4 (leg-volume rollup) +
    // unit 5 (Matching Income) + unit 6 (Rank progression) --
    // docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch flow steps 1, 2, 3, 4, 8. Steps 5-7 (Sponsor Matching,
    // Royalty, Reward) are NOT implemented here -- units 7-9 insert their own logic between the
    // advanceRanks call below and the CLOSED flip, without changing this method's signature or
    // transaction boundary, the same sequential-insertion pattern units 3 -> 4 -> 5 -> 6 already
    // used.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest#closeAdvancesRankWhenCumulativeMatchedVolumeCrossesOneThreshold+closeAdvancesRankToTheHighestTierWhenCumulativeMatchedVolumeCrossesTwoThresholdsInOneCycle`

Expected: PASS.

- [ ] **Step 5: Run the full `CycleServiceTest` suite to confirm no regressions**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest`

Expected: all PASS, including the pre-existing unit 4/5 tests from Task 1.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleService.java backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): advance rank to highest newly-qualified tier after Matching Income"
```

---

## Task 3: Rank never demotes

**Files:**
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` (test only — `advanceRanks` from Task 2 already implements the never-demote comparison; this task locks the behavior in with a dedicated test and, per TDD, briefly proves it isn't accidental by watching it fail against a deliberately weakened implementation first)

**Interfaces:**
- Consumes: `advanceRanks(List<Associate>)` from Task 2, unchanged signature.
- Produces: nothing new — this task only adds test coverage.

- [ ] **Step 1: Write the failing test**

Add to `CycleServiceTest.java`:

```java
    @Test
    void closeNeverDemotesRankEvenWhenCurrentCycleAloneWouldOnlyQualifyForALowerTier() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // Already at Gold from a prior cycle. This cycle: no sales at all, cumulativeMatchedVolume
        // stays at 50 -- which alone would only qualify for Bronze (threshold 0). Rank must stay Gold.
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(goldId);
        root.setCumulativeMatchedVolume(new BigDecimal("50"));
        when(associateRepository.findAll()).thenReturn(List.of(root));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(root.getRankId()).isEqualTo(goldId);
        verify(associateRepository, never()).save(root);
    }
```

- [ ] **Step 2: Run the test to verify it currently passes (this locks in existing Task 2 behavior — confirm by temporarily breaking the guard)**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest#closeNeverDemotesRankEvenWhenCurrentCycleAloneWouldOnlyQualifyForALowerTier`

Expected: PASS, since Task 2's `advanceRanks` already compares against `currentRankOrder` before assigning. To prove this test is load-bearing (not vacuously passing), temporarily change `if (highestQualified.getRankOrder() > currentRankOrder)` to `if (true)` in `CycleService.java`, rerun the single test, confirm it now FAILS (`root.getRankId()` becomes `bronzeId`), then revert the temporary change.

- [ ] **Step 3: Revert the temporary breakage and confirm the test passes again**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest#closeNeverDemotesRankEvenWhenCurrentCycleAloneWouldOnlyQualifyForALowerTier`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "test(cycle): lock in rank-never-demotes behavior for CycleService.close()"
```

---

## Task 4: Rank advancement skipped for Admin and non-ASSOCIATE staff roles

**Files:**
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` (test only)

**Interfaces:**
- Consumes: `advanceRanks(List<Associate>)` from Task 2, unchanged.
- Produces: nothing new — test coverage for the `role == ASSOCIATE` guard from both directions (Admin, and the broader non-Admin staff-role finding from "Resolved open question 2").

- [ ] **Step 1: Write the failing tests**

```java
    @Test
    void closeSkipsRankAdvancementForAdmin() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // rankId null and cumulativeMatchedVolume high enough to qualify for Gold if evaluated --
        // proves the skip is a deliberate guard, not an accident of low volume.
        Associate admin = associateFixture(null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setRankId(null);
        admin.setCumulativeMatchedVolume(new BigDecimal("1000"));
        when(associateRepository.findAll()).thenReturn(List.of(admin));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(admin.getRankId()).isNull();
        verify(associateRepository, never()).save(admin);
    }

    @Test
    void closeSkipsRankAdvancementForNonAssociateStaffRoles() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // FINANCE is one of the four staff roles chk_associate_rank_required also exempts from
        // needing a rank (V4__user_id_login_and_admin_roles.sql) -- not just ADMIN.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.FINANCE);
        financeStaff.setKycStatus(KycStatus.VERIFIED);
        financeStaff.setRankId(null);
        financeStaff.setCumulativeMatchedVolume(new BigDecimal("1000"));
        when(associateRepository.findAll()).thenReturn(List.of(financeStaff));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        assertThat(financeStaff.getRankId()).isNull();
        verify(associateRepository, never()).save(financeStaff);
    }
```

- [ ] **Step 2: Run the tests to verify current pass/fail status**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest#closeSkipsRankAdvancementForAdmin+closeSkipsRankAdvancementForNonAssociateStaffRoles`

Expected: both PASS already, since Task 2's guard is `associate.getRole() != AssociateRole.ASSOCIATE` (skips everything except `ASSOCIATE`), which covers both `ADMIN` and `FINANCE` correctly. This task's job is to make that coverage explicit and regression-proof, not to change behavior. If `closeSkipsRankAdvancementForNonAssociateStaffRoles` unexpectedly FAILS, the guard was implemented as `role == ADMIN` (skip only Admin) instead of `role == ASSOCIATE` (process only Associate) — go back and fix Task 2's `advanceRanks` to match "Resolved open question 2" above before proceeding.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "test(cycle): lock in rank-advancement skip for Admin and staff roles"
```

---

## Task 5: Rank stays unchanged when matched volume doesn't cross any new threshold

**Files:**
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` (test only)

**Interfaces:**
- Consumes: `advanceRanks(List<Associate>)` from Task 2, unchanged.
- Produces: nothing new — closes the last gap in the spec's Testing section: "an associate with matched volume that doesn't cross any new threshold keeps their current rank unchanged (not reset to null or the lowest tier)."

- [ ] **Step 1: Write the failing test**

```java
    @Test
    void closeKeepsCurrentRankUnchangedWhenMatchedVolumeDoesNotCrossAnyNewThreshold() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // Already at Silver (threshold 100), cumulativeMatchedVolume 150 pre-existing. This
        // cycle matches another 50 (min(100,50)) -> 150 + 50 = 200, still short of Gold's 500.
        // Rank must stay exactly Silver -- not reset to null/Bronze, not bumped to Gold.
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(silverId);
        root.setCumulativeMatchedVolume(new BigDecimal("150"));
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

        assertThat(root.getCumulativeMatchedVolume()).isEqualByComparingTo("200");
        assertThat(root.getRankId()).isEqualTo(silverId);
    }
```

- [ ] **Step 2: Run the test**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest#closeKeepsCurrentRankUnchangedWhenMatchedVolumeDoesNotCrossAnyNewThreshold`

Expected: PASS. This exercises the `highestQualified.getRankOrder() > currentRankOrder` comparison at the **equal** boundary (`highestQualified` resolves to Silver itself, `rankOrder` 20 == `currentRankOrder` 20 → not strictly greater → no update), distinct from Task 3's test which exercises a `highestQualified` *below* the current rank.

- [ ] **Step 3: Run the full `CycleServiceTest` suite one more time**

Run: `cd backend && mvn -q -pl . test -Dtest=CycleServiceTest`

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "test(cycle): rank stays unchanged when matched volume crosses no new threshold"
```

---

## Self-review notes (from the plan author, not a task)

- **Spec coverage:** Decision #7's core mechanics (advance to highest qualified, never demote, skip for rank-less roles) — Tasks 2–5. Flow step 4's insertion point — Task 2, Step 3. Testing section's four rank-specific bullets (highest-of-one-crossing, highest-of-two-crossings, never-regresses, Admin-gets-no-advancement) — Tasks 2–4. The task brief's own extra bullet (matched volume that crosses nothing keeps current rank) — Task 5.
- **Not in this unit's scope, confirmed against the units file:** Sponsor Matching (unit 7), Royalty (unit 8, which will read the *post-advancement* `rankId` this unit now produces), Reward (unit 9) — none of their logic is touched here. `CycleCloseResponse` is deliberately left unchanged (no `ranksAdvanced` field) — rank progression writes no ledger entries and the response DTO's own comment already defers new fields to whichever unit needs them for reporting; unit 6 has nothing income-shaped to report there.
- **Placeholder scan:** no TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency:** `advanceRanks(List<Associate> associates)` — same signature used in Tasks 2 through 5 (only Task 2 defines it; 3–5 only add tests against it). `RankTierRepository.findAllByOrderByRankOrder()` — matches the existing method (no new repository method needed, confirmed already exists at `backend/src/main/java/com/plotchain/rank/RankTierRepository.java:8`).
