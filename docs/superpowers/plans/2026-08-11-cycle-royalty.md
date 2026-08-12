# Cycle Management Unit 8: Royalty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside `CycleService.close()`'s settlement batch, after Sponsor Matching (unit 7, merged), credit each eligible associate a `ROYALTY` `LedgerEntry` based on their **post-rank-advancement** rank's configured `RoyaltyBonusRate` — no-op, not an error, when no rate is configured for that rank — flow step 6 of the settlement batch, per `docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md`, Decision #7 (second paragraph) and Flow step 6.

**Architecture:** One new private method, `creditRoyalty(UUID cycleId, List<Associate> associates, List<LegVolume> legVolumes, CompensationPlanVersion planVersion)`, added to `CycleService` and called from `close()` immediately after `creditSponsorMatching(...)` and before the `CLOSED` status flip — the same sequential-insertion pattern units 3→4→5→6→7 already established. `RoyaltyBonusRateRepository` becomes an 8th constructor dependency (new method `findByPlanVersionIdAndRankId` added to it). Before adding Royalty's own logic, this unit first extracts two private helpers — `applyDeductions(BigDecimal, CompensationPlanVersion): Deductions` and `kycGatedStatus(Associate): LedgerEntryStatus` — out of `creditMatchingIncome` (unit 5) and `creditSponsorMatching` (unit 7), both of which currently inline-duplicate this exact math. This is not optional cleanup: unit 7's code review explicitly flagged that a third inline copy in Royalty would be one copy too many, and the unit-queue bookkeeping file (`docs/superpowers/plans/2026-08-03-cycle-management-units.md`) already records this as the plan for "unit 8's planning."

**Tech Stack:** Spring Boot service layer, JPA entities (`Associate`, `LedgerEntry`, `RoyaltyBonusRate`), JUnit 5 + Mockito (`CycleServiceTest`, unit-level, mocked repositories) + `@DataJpaTest` (`CompensationPlanVersionRepositoryTest`, real H2 MODE=PostgreSQL) — matches existing conventions in `backend/src/test/java/com/plotchain/`.

## Global Constraints

- **Scope boundary (hard):** this unit implements ONLY flow step 6 (Royalty). No Reward (unit 9), no atomicity/re-run hardening (unit 10). Do not touch `CycleCloseResponse`'s shape — units 5–9 write `LedgerEntry` rows without touching that DTO, a precedent unit 5 established and units 6/7 followed.
- **`grossAmount = matchedVolume × royaltyPct / 100`**, where `matchedVolume = min(legVolume.leftLegVolume, legVolume.rightLegVolume)` for THIS cycle's `LegVolume` row — the same raw volume `creditMatchingIncome` (unit 5) based its own `grossAmount` on, **not** a percentage of the Matching entry's `grossAmount` (contrast with Sponsor Matching, unit 7, which derives from the sponsee's Matching entry's `grossAmount`). Flow step 6's own text is explicit: `grossAmount = matchedPairVolume × royaltyPct/100`.
- **`sourceRef = legVolume.id`** — the same `LegVolume` row Matching used for that associate this cycle (Decision #12: "both derive from the same cycle-computed matched-pair volume for that associate").
- **Rate lookup key is `(planVersion, associate's POST-rank-advancement rankId)`.** `advanceRanks` (flow step 4) and `creditSponsorMatching` (flow step 5) have both already run — in that order — by the time `creditRoyalty` executes, so `associate.getRankId()` at this point already reflects any advancement earned in THIS cycle. Decision #7: "an achievement crossed this cycle earns this cycle's royalty rate immediately."
- **No rate configured → no-op, not an error.** `RoyaltyBonusRateRepository.findByPlanVersionIdAndRankId(planVersion.getId(), associate.getRankId())` returning `Optional.empty()` is the literal, spec-named definition of "no rate configured" (Flow step 6: "Skipped if no rate configured for that rank (not an error — some low ranks may have no royalty tier)"). No exception, no logging beyond what already exists — the associate simply gets no `ROYALTY` entry that cycle.
- **Role guard is `associate.getRole() == AssociateRole.ASSOCIATE`, not `role != AssociateRole.ADMIN`.** Decision #7's own prose only says Royalty is "Also skipped for Admin (no rankId to look up a rate for)" — but the live schema constraint (`chk_associate_rank_required`, V4) makes `rank_id` nullable for Admin **and** the four staff roles (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`), exactly the same fact `advanceRanks` (unit 6) already resolved and documented in its own comment. Royalty's rate lookup is rank-keyed exactly like rank advancement is, so it inherits the identical guard, for the identical reason: a staff row structurally has no rank to look a rate up for. This is a considered extension of Decision #7's stated Admin-only exclusion, not a re-derivation from nothing — verified against `V4__user_id_login_and_admin_roles.sql`'s actual, current constraint, not assumed from the spec's older prose.
- **Trigger condition — "for each non-Admin associate with a Matching entry this cycle" is implemented by recomputing `matchedVolume` from `legVolumes`, not by an extra `existsBy`/`findBy` query.** `creditMatchingIncome` (unit 5) writes a `MATCHING` entry for an associate if and only if `min(leftLegVolume, rightLegVolume) > 0` for that associate's `LegVolume` row this cycle (Decision #5). `creditMatchingIncome` never mutates `leftLegVolume`/`rightLegVolume` themselves — only `carriedForwardLeft`/`carriedForwardRight` (verified against the current `LegVolume` entity and `creditMatchingIncome`'s actual code) — so re-evaluating `legVolume.getLeftLegVolume().min(legVolume.getRightLegVolume()) > 0` after `creditMatchingIncome` has already run yields the exact same associates that condition selected, with zero extra queries: `close()` already has `legVolumes` in scope, the same list passed to `creditMatchingIncome`. This is simpler than a fresh `LedgerEntryRepository` lookup (the approach unit 7 deliberately chose for Sponsor Matching, for different reasons documented in that unit's plan — Sponsor Matching needs the Matching entry's *id* and *grossAmount* as inputs, which only a query can supply; Royalty only needs the boolean "was matched volume positive," which the in-memory list already answers) and needs no new repository method.
- **Deductions (Decision #10) and KYC-gating (Decision #11) use the two extracted helpers, `applyDeductions`/`kycGatedStatus`** — same math, same semantics as units 5 and 7, just no longer copy-pasted a third time. `kycGatedStatus` gates on the credited associate's own `kycStatus` — for Royalty that's straightforwardly the associate being paid (no sponsor/sponsee distinction like unit 7 had to reason through).
- **Idempotency**: `LedgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(associateId, cycleId, ROYALTY, legVolume.id)` checked before every write (Decision #12), same check-then-insert pattern `creditMatchingIncome`/`creditSponsorMatching` already use.
- **Inferred rule (not spec-literal, consistent with units 5's and 7's identical reasoning): skip writing when the computed `grossAmount` is not strictly positive.** `matchedVolume` is already guaranteed `> 0` by the trigger-condition guard above, so the only way `grossAmount <= 0` is a `RoyaltyBonusRate.royaltyPct` configured as `0` — a valid admin choice, not a data anomaly, and writing a zero-value entry would be pure noise (Decision #5's own words, extended by unit 7 to Sponsor Matching, extended here by the same logic a second time).
- **No new migration.** No schema change — `RoyaltyBonusRate` and `IncomeType.ROYALTY` both already exist (`V8__compensation_plan.sql`, and `IncomeType` enum respectively, confirmed by reading both directly). `ledger_entry`'s idempotency constraint (V17) already covers `ROYALTY` generically via `(associate_id, cycle_id, income_type, source_ref)`.
- **Rounding**: same convention as every other income type in this batch — `pct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)` then multiply, no explicit `.setScale(2, HALF_UP)` before persisting.

---

## File Structure

- **Modify:** `backend/src/main/java/com/plotchain/compensation/RoyaltyBonusRateRepository.java` — add `findByPlanVersionIdAndRankId(UUID, UUID): Optional<RoyaltyBonusRate>`.
- **Modify:** `backend/src/test/java/com/plotchain/compensation/CompensationPlanVersionRepositoryTest.java` — add two tests for the new repository method (this file already tests `RoyaltyBonusRateRepository.findAllByPlanVersionId`, so the new method's test lives alongside it, not in a new file).
- **Modify:** `backend/src/main/java/com/plotchain/cycle/CycleService.java` — extract `applyDeductions`/`kycGatedStatus` helpers (refactor `creditMatchingIncome`/`creditSponsorMatching` to use them); add `RoyaltyBonusRateRepository` as an 8th constructor dependency; add `creditRoyalty(...)`; call it from `close()` right after `creditSponsorMatching(...)`.
- **Modify:** `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` — add `@Mock RoyaltyBonusRateRepository royaltyBonusRateRepository`; update every `new CycleService(...)` call site (34 occurrences) to pass it as the 8th argument; add new Royalty test methods.

No other files change. `CycleCloseRollbackTest`, `CycleCloseConcurrencyTest`, and `CycleCloseSponsorMatchingIntegrationTest` (all `@SpringBootTest`, autowire `CycleService` via Spring DI) need no source changes — Spring resolves the new constructor argument automatically since `RoyaltyBonusRateRepository` is already a registered bean (it backs the existing, admin-only Compensation Rules Config screen).

No integration test is added for this unit, unlike unit 7's `CycleCloseSponsorMatchingIntegrationTest`. That test existed specifically to prove a *fresh repository query* run later in the same transaction could see an *uncommitted write* from earlier in that transaction (Hibernate auto-flush). Royalty needs no analogous proof: `matchedVolume` comes from the in-memory `legVolumes` list (no query at all), and the post-advancement `rankId` comes from reading `associate.getRankId()` directly off the same in-memory `Associate` object `advanceRanks` already mutated earlier in this same `close()` call — a plain Java field read, not a database round-trip, so there is no flush-timing question to prove.

---

## Task 1: Extract `applyDeductions`/`kycGatedStatus` helpers (refactor only, zero behavior change)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`

**Interfaces:**
- Consumes: nothing new — this task only reorganizes code already in the file.
- Produces: `private record Deductions(BigDecimal tdsDeduction, BigDecimal adminDeduction, BigDecimal netAmount)`, `private Deductions applyDeductions(BigDecimal grossAmount, CompensationPlanVersion planVersion)`, `private LedgerEntryStatus kycGatedStatus(Associate associate)` — Task 4's `creditRoyalty` consumes both directly; `creditMatchingIncome` and `creditSponsorMatching` are refactored in this task to consume them too.

This task has no new tests. It is verified entirely by the existing `CycleServiceTest` suite continuing to pass unchanged — a pure refactor, safety-netted by tests unit 5 and unit 7 already wrote and this task must not alter.

- [ ] **Step 1: Add the `Deductions` record and the two helper methods**

In `backend/src/main/java/com/plotchain/cycle/CycleService.java`, add immediately before `creditMatchingIncome` (after `rollUpSubtree`):

```java
    // Cycle-management unit 8 (Royalty): extracted out of creditMatchingIncome (unit 5) and
    // creditSponsorMatching (unit 7), which had each inline-duplicated this exact math (Decision
    // #10). Unit 7's own code review flagged that a third inline copy in creditRoyalty would be
    // one copy too many -- see docs/superpowers/plans/2026-08-03-cycle-management-units.md's
    // "Also flagged, non-blocking" note. Bundled as a record (not three separate return values)
    // because every caller needs tds/admin/net together to populate one LedgerEntry.
    private record Deductions(BigDecimal tdsDeduction, BigDecimal adminDeduction, BigDecimal netAmount) {}

    // Decision #10: tdsDeduction = gross * tdsPct/100, adminDeduction = gross *
    // adminChargeWithoutPanPct/100 (always the without-PAN tier -- Associate has no pan_number
    // field), netAmount = gross - tds - admin. planVersion is the single CompensationPlanVersion
    // resolved once per close() run against cycle.getPeriodStart() (Decision #10) -- every income
    // type in this batch shares that one resolved version; no caller re-resolves its own.
    private Deductions applyDeductions(BigDecimal grossAmount, CompensationPlanVersion planVersion) {
        BigDecimal tdsDeduction = grossAmount.multiply(
            planVersion.getTdsPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal adminDeduction = grossAmount.multiply(
            planVersion.getAdminChargeWithoutPanPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal netAmount = grossAmount.subtract(tdsDeduction).subtract(adminDeduction);
        return new Deductions(tdsDeduction, adminDeduction, netAmount);
    }

    // Decision #11: VERIFIED KYC -> PENDING (computed, not yet paid); anything else (PENDING or
    // REJECTED KYC) -> CARRIED_FORWARD (computed correctly, withheld pending KYC verification).
    // Every income type in this batch gates on the CREDITED associate's own kycStatus -- for
    // Sponsor Matching that's the sponsor, not the sponsee whose entry triggered the credit;
    // callers pass whichever associate is actually being paid by the entry under construction.
    private LedgerEntryStatus kycGatedStatus(Associate associate) {
        return associate.getKycStatus() == KycStatus.VERIFIED
            ? LedgerEntryStatus.PENDING
            : LedgerEntryStatus.CARRIED_FORWARD;
    }
```

- [ ] **Step 2: Refactor `creditMatchingIncome` to use the new helpers**

In the same file, inside `creditMatchingIncome`, replace:

```java
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
```

with:

```java
            BigDecimal grossAmount = matchedVolume.multiply(
                planVersion.getMatchingIncomePct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            Deductions deductions = applyDeductions(grossAmount, planVersion);

            LedgerEntry entry = new LedgerEntry();
            entry.setId(UUID.randomUUID());
            entry.setAssociateId(associate.getId());
            entry.setIncomeType(IncomeType.MATCHING);
            entry.setCycleId(cycleId);
            entry.setGrossAmount(grossAmount);
            entry.setTdsDeduction(deductions.tdsDeduction());
            entry.setAdminDeduction(deductions.adminDeduction());
            entry.setNetAmount(deductions.netAmount());
            entry.setStatus(kycGatedStatus(associate));
            entry.setSourceRef(legVolume.getId());
            entry.setCreatedAt(Instant.now());
            ledgerEntryRepository.save(entry);
```

- [ ] **Step 3: Refactor `creditSponsorMatching` to use the new helpers**

Inside `creditSponsorMatching`, replace:

```java
                BigDecimal tdsDeduction = grossAmount.multiply(
                    planVersion.getTdsPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                BigDecimal adminDeduction = grossAmount.multiply(
                    planVersion.getAdminChargeWithoutPanPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                BigDecimal netAmount = grossAmount.subtract(tdsDeduction).subtract(adminDeduction);

                LedgerEntry entry = new LedgerEntry();
                entry.setId(UUID.randomUUID());
                entry.setAssociateId(sponsor.getId());
                entry.setIncomeType(IncomeType.SPONSOR_MATCHING);
                entry.setCycleId(cycleId);
                entry.setGrossAmount(grossAmount);
                entry.setTdsDeduction(tdsDeduction);
                entry.setAdminDeduction(adminDeduction);
                entry.setNetAmount(netAmount);
                entry.setStatus(sponsor.getKycStatus() == KycStatus.VERIFIED
                    ? LedgerEntryStatus.PENDING
                    : LedgerEntryStatus.CARRIED_FORWARD);
                entry.setSourceRef(matchingEntry.getId());
                entry.setCreatedAt(Instant.now());
                ledgerEntryRepository.save(entry);
```

with:

```java
                Deductions deductions = applyDeductions(grossAmount, planVersion);

                LedgerEntry entry = new LedgerEntry();
                entry.setId(UUID.randomUUID());
                entry.setAssociateId(sponsor.getId());
                entry.setIncomeType(IncomeType.SPONSOR_MATCHING);
                entry.setCycleId(cycleId);
                entry.setGrossAmount(grossAmount);
                entry.setTdsDeduction(deductions.tdsDeduction());
                entry.setAdminDeduction(deductions.adminDeduction());
                entry.setNetAmount(deductions.netAmount());
                entry.setStatus(kycGatedStatus(sponsor));
                entry.setSourceRef(matchingEntry.getId());
                entry.setCreatedAt(Instant.now());
                ledgerEntryRepository.save(entry);
```

(The `if (grossAmount.compareTo(BigDecimal.ZERO) <= 0) { continue; }` guard immediately above this block in `creditSponsorMatching` is untouched — it stays exactly where it is, before the replaced region starts.)

- [ ] **Step 4: Run the full existing suite to confirm zero behavior change**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest,CycleCloseRollbackTest,CycleCloseConcurrencyTest,CycleCloseSponsorMatchingIntegrationTest`

Expected: PASS, identical test count and identical assertions as before this task. If anything fails, the refactor introduced a behavior change — stop and fix before proceeding; do not adjust a test's expected value to make a refactor "pass," since that would mean the refactor wasn't behavior-preserving.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleService.java
git commit -m "refactor(cycle): extract applyDeductions/kycGatedStatus helpers ahead of Royalty"
```

---

## Task 2: `RoyaltyBonusRateRepository.findByPlanVersionIdAndRankId` — repository method and DB-level test

**Files:**
- Modify: `backend/src/main/java/com/plotchain/compensation/RoyaltyBonusRateRepository.java`
- Modify: `backend/src/test/java/com/plotchain/compensation/CompensationPlanVersionRepositoryTest.java`

**Interfaces:**
- Produces: `RoyaltyBonusRateRepository.findByPlanVersionIdAndRankId(UUID planVersionId, UUID rankId): Optional<RoyaltyBonusRate>` — Task 4's `creditRoyalty` consumes this directly.

- [ ] **Step 1: Add the repository method**

In `backend/src/main/java/com/plotchain/compensation/RoyaltyBonusRateRepository.java`:

```java
package com.plotchain.compensation;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RoyaltyBonusRateRepository extends JpaRepository<RoyaltyBonusRate, UUID> {
    List<RoyaltyBonusRate> findAllByPlanVersionId(UUID planVersionId);

    // Cycle-management unit 8 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Flow step 6): Royalty's single-rank lookup per associate, narrower than
    // findAllByPlanVersionId above. Empty Optional means "no royalty rate configured for this
    // rank" -- a legitimate no-op per Flow step 6's own text ("not an error -- some low ranks may
    // have no royalty tier"), not a failure condition.
    Optional<RoyaltyBonusRate> findByPlanVersionIdAndRankId(UUID planVersionId, UUID rankId);
}
```

- [ ] **Step 2: Write the failing tests**

`backend/src/test/java/com/plotchain/compensation/CompensationPlanVersionRepositoryTest.java` already has `@Autowired RoyaltyBonusRateRepository royaltyBonusRateRepository`, a `SEED_VERSION_ID` constant, and an existing test (`findAllByPlanVersionIdReturnsOnlyRatesForThatVersion`) that shows the exact `RankTier`/`RoyaltyBonusRate` persistence pattern this new method's tests reuse. Add these two tests immediately after `findAllByPlanVersionIdReturnsOnlyRatesForThatVersion`:

```java
    @Test
    void findByPlanVersionIdAndRankIdReturnsTheRateForThatExactRank() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Executive", 2, BigDecimal.valueOf(20000));
        entityManager.persist(rank);

        RoyaltyBonusRate rate = new RoyaltyBonusRate(UUID.randomUUID(), SEED_VERSION_ID, rank.getId(), new BigDecimal("3.00"));
        royaltyBonusRateRepository.save(rate);
        entityManager.flush();

        Optional<RoyaltyBonusRate> found = royaltyBonusRateRepository.findByPlanVersionIdAndRankId(SEED_VERSION_ID, rank.getId());

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(rate.getId());
        assertThat(found.get().getRoyaltyPct()).isEqualByComparingTo("3.00");
    }

    @Test
    void findByPlanVersionIdAndRankIdReturnsEmptyWhenNoRateIsConfiguredForThatRank() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);
        entityManager.flush();
        // No RoyaltyBonusRate row exists for this rank at all -- the "no-op if no rate
        // configured" case CycleService's Royalty step (unit 8) needs to distinguish from an
        // error, per Flow step 6's own "not an error" text.

        Optional<RoyaltyBonusRate> found = royaltyBonusRateRepository.findByPlanVersionIdAndRankId(SEED_VERSION_ID, rank.getId());

        assertThat(found).isEmpty();
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=CompensationPlanVersionRepositoryTest#findByPlanVersionIdAndRankIdReturnsTheRateForThatExactRank+findByPlanVersionIdAndRankIdReturnsEmptyWhenNoRateIsConfiguredForThatRank`
Expected: FAIL — compile error, `findByPlanVersionIdAndRankId` doesn't exist yet (do Step 1 first if testing this in isolation).

- [ ] **Step 4: Run the full file to verify everything passes**

Run: `cd backend && mvn -q test -Dtest=CompensationPlanVersionRepositoryTest`
Expected: PASS, all tests in the file (the two new ones plus every pre-existing test unaffected).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/compensation/RoyaltyBonusRateRepository.java \
        backend/src/test/java/com/plotchain/compensation/CompensationPlanVersionRepositoryTest.java
git commit -m "feat(cycle): add RoyaltyBonusRateRepository.findByPlanVersionIdAndRankId"
```

---

## Task 3: Wire `RoyaltyBonusRateRepository` into `CycleService` (plumbing only, no new behavior)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `com.plotchain.compensation.RoyaltyBonusRateRepository` (Task 2, `findByPlanVersionIdAndRankId(UUID, UUID): Optional<RoyaltyBonusRate>`).
- Produces: `CycleService`'s constructor now has 8 parameters, ending in `RoyaltyBonusRateRepository royaltyBonusRateRepository`; `this.royaltyBonusRateRepository` is available to `creditRoyalty` in Task 4.

- [ ] **Step 1: Add the `@Mock RoyaltyBonusRateRepository royaltyBonusRateRepository` field and update every constructor call site in the test file**

In `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`, add the import and mock field:

```java
import com.plotchain.compensation.RoyaltyBonusRateRepository;
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
    CycleService service;
```

Then update **every** occurrence of the trailing line:

```java
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
```

to:

```java
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);
```

This exact trailing line is byte-for-byte identical at all 34 call sites in the current file (verified by grep before writing this plan) — a single `replace_all` edit on that one string updates every `new CycleService(...)` call at once. Do not add any `when(royaltyBonusRateRepository...)` stubbing to pre-existing tests — Mockito returns `Optional.empty()` by default for an unstubbed method returning `Optional`, which is the correct "no rate configured" behavior for tests that don't care about Royalty.

- [ ] **Step 2: Add the same constructor argument to `CycleService.java`**

Add the imports (after the existing `com.plotchain.compensation.CompensationPlanVersionRepository` import):

```java
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
```

Change the field declarations (after `private final RankTierRepository rankTierRepository;`):

```java
    private final RankTierRepository rankTierRepository;
    private final RoyaltyBonusRateRepository royaltyBonusRateRepository;
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
        RoyaltyBonusRateRepository royaltyBonusRateRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.associateRepository = associateRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.rankTierRepository = rankTierRepository;
        this.royaltyBonusRateRepository = royaltyBonusRateRepository;
    }
```

- [ ] **Step 3: Compile and run the full existing test suite — confirm zero behavior change**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest,CycleCloseRollbackTest,CycleCloseConcurrencyTest,CycleCloseSponsorMatchingIntegrationTest,CycleControllerTest,CycleExceptionHandlerTest,CycleRepositoryTest`

Expected: all tests PASS, same count as before this task. This is a pure plumbing change; no assertions should change behavior. `CycleCloseRollbackTest`/`CycleCloseConcurrencyTest`/`CycleCloseSponsorMatchingIntegrationTest` need no source changes since they `@Autowired CycleService` via Spring, which resolves the new constructor argument automatically from the existing `RoyaltyBonusRateRepository` bean (already registered — it backs the Compensation Rules Config screen).

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleService.java backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): wire RoyaltyBonusRateRepository into CycleService (unit 8 plumbing)"
```

---

## Task 4: Royalty credited inline in `CycleService.close()`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `RoyaltyBonusRateRepository.findByPlanVersionIdAndRankId(UUID, UUID): Optional<RoyaltyBonusRate>` (Task 2). `applyDeductions(BigDecimal, CompensationPlanVersion): Deductions`, `kycGatedStatus(Associate): LedgerEntryStatus` (Task 1). `LedgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(UUID, UUID, IncomeType, UUID): boolean` (existing, unit 5). `RankTier`/`advanceRanks` (existing, unit 6 — Royalty reads `associate.getRankId()` *after* `advanceRanks` has run, no direct call). `RoyaltyBonusRate.getRoyaltyPct(): BigDecimal` (existing entity).
- Produces: `private void creditRoyalty(UUID cycleId, List<Associate> associates, List<LegVolume> legVolumes, CompensationPlanVersion planVersion)`, called from `close()` right after `creditSponsorMatching(cycle.getId(), associates, planVersion)`. `CycleService`'s constructor signature is unchanged by this task (already 8 args, from Task 3). `close()`'s signature and `CycleCloseResponse`'s shape are unchanged.

- [ ] **Step 1: Add a fixture helper for a `RoyaltyBonusRate`**

Add this private helper in `CycleServiceTest.java`, near `rankTiersFixture`/`planVersionFixture`:

```java
    private RoyaltyBonusRate royaltyBonusRateFixture(UUID planVersionId, UUID rankId, BigDecimal royaltyPct) {
        return new RoyaltyBonusRate(UUID.randomUUID(), planVersionId, rankId, royaltyPct);
    }
```

Add the import:

```java
import com.plotchain.compensation.RoyaltyBonusRate;
```

- [ ] **Step 2: Write the failing tests**

Add these tests to `CycleServiceTest.java`. Note (honestly, up front): tests (b), (d), (e), (h), (i) below assert "no `ROYALTY` entry written" — before this task's implementation exists, `creditRoyalty` is never called at all, so those five would trivially pass even with zero production code. That's expected and fine; TDD's red-green cycle is doing real work for tests (a), (c), (f), (g), which assert a `ROYALTY` entry *was* written with specific values and genuinely fail until `creditRoyalty` exists and is wired in.

```java
    @Test
    void closeCreditsRoyaltyForAnAssociateWithARoyaltyRateConfiguredForTheirRank() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        // matched volume = min(100, 50) = 50, same tree shape unit 5's own basic test uses.
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(right.getId(), cycle.getId(), new BigDecimal("50"))
        ));

        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(any(UUID.class), eq(bronzeId)))
            .thenReturn(Optional.of(royaltyBonusRateFixture(UUID.randomUUID(), bronzeId, new BigDecimal("3.00"))));

        service.close(cycle.getId());

        // Two saves this cycle: the MATCHING entry (unit 5) and the ROYALTY entry (this unit).
        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        LedgerEntry royaltyEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.ROYALTY).findFirst().orElseThrow();

        ArgumentCaptor<List<LegVolume>> legVolumesCaptor = ArgumentCaptor.forClass(List.class);
        verify(legVolumeRepository).saveAll(legVolumesCaptor.capture());
        LegVolume rootLegVolume = legVolumesCaptor.getValue().stream()
            .filter(lv -> root.getId().equals(lv.getAssociateId())).findFirst().orElseThrow();

        assertThat(royaltyEntry.getAssociateId()).isEqualTo(root.getId());
        assertThat(royaltyEntry.getCycleId()).isEqualTo(cycle.getId());
        assertThat(royaltyEntry.getSourceRef()).isEqualTo(rootLegVolume.getId());
        // matched volume 50 * 3% = 1.500000
        assertThat(royaltyEntry.getGrossAmount()).isEqualByComparingTo("1.50");
        // tds = 1.50 * 5% = 0.075
        assertThat(royaltyEntry.getTdsDeduction()).isEqualByComparingTo("0.075");
        // admin = 1.50 * 4% = 0.06
        assertThat(royaltyEntry.getAdminDeduction()).isEqualByComparingTo("0.06");
        // net = 1.50 - 0.075 - 0.06 = 1.365
        assertThat(royaltyEntry.getNetAmount()).isEqualByComparingTo("1.365");
        assertThat(royaltyEntry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(royaltyEntry.getCreatedAt()).isNotNull();
    }

    @Test
    void closeWritesNoRoyaltyEntryWhenNoRateIsConfiguredForTheAssociatesRank() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(UUID.randomUUID());
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
        // Deliberately NOT stubbing royaltyBonusRateRepository -- Mockito's unstubbed default for
        // an Optional-returning method is Optional.empty(), i.e. "no rate configured for this rank."

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeUsesThePostAdvancementRankWhenLookingUpTheRoyaltyRate() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        UUID bronzeId = UUID.randomUUID();
        UUID silverId = UUID.randomUUID();
        UUID goldId = UUID.randomUUID();
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(rankTiersFixture(bronzeId, silverId, goldId));

        // Starts at Bronze, 80 pre-existing cumulativeMatchedVolume (below Silver's 100
        // threshold) -- identical setup to closeAdvancesRankWhenCumulativeMatchedVolumeCrossesOneThreshold
        // (unit 6's own test), so this cycle's matched volume of 50 pushes cumulative to 130,
        // crossing into Silver BEFORE Royalty's lookup runs.
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
        root.setCumulativeMatchedVolume(new BigDecimal("80"));
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
        // A rate exists for Silver (the NEW, post-advancement rank) but deliberately NOT for
        // Bronze (the OLD, pre-cycle rank) -- if creditRoyalty read associate.getRankId() before
        // advanceRanks ran (or cached a stale value), this lookup would miss and no entry would
        // be written, failing this test.
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(planVersion.getId(), silverId))
            .thenReturn(Optional.of(royaltyBonusRateFixture(planVersion.getId(), silverId, new BigDecimal("5.00"))));

        service.close(cycle.getId());

        assertThat(root.getRankId()).isEqualTo(silverId); // sanity: advancement itself happened
        verify(royaltyBonusRateRepository).findByPlanVersionIdAndRankId(planVersion.getId(), silverId);
        verify(royaltyBonusRateRepository, never()).findByPlanVersionIdAndRankId(planVersion.getId(), bronzeId);

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        LedgerEntry royaltyEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.ROYALTY).findFirst().orElseThrow();
        // matched volume 50 * Silver's 5% = 2.500000
        assertThat(royaltyEntry.getGrossAmount()).isEqualByComparingTo("2.50");
    }

    @Test
    void closeSkipsRoyaltyForAdmin() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        // Decision #7: Royalty is "Also skipped for Admin (no rankId to look up a rate for)".
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
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        // Admin still earns Matching (Decision #7: "Matching and Sponsor Matching... apply to
        // Admin in full") but never Royalty.
        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeSkipsRoyaltyForNonAssociateStaffRoles() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        // FINANCE is one of the four staff roles chk_associate_rank_required also exempts from
        // needing a rank (V4__user_id_login_and_admin_roles.sql) -- not just ADMIN, same fact
        // unit 6's advanceRanks guard already established.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.FINANCE);
        financeStaff.setKycStatus(KycStatus.VERIFIED);
        financeStaff.setRankId(null);
        Associate left = associateFixture(financeStaff.getId(), "L");
        Associate right = associateFixture(financeStaff.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(financeStaff, left, right));

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

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeSetsCarriedForwardStatusForRoyaltyWhenAssociateKycIsNotVerified() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.PENDING); // not verified
        root.setRankId(bronzeId);
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
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(any(UUID.class), eq(bronzeId)))
            .thenReturn(Optional.of(royaltyBonusRateFixture(UUID.randomUUID(), bronzeId, new BigDecimal("3.00"))));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        LedgerEntry royaltyEntry = entryCaptor.getAllValues().stream()
            .filter(e -> e.getIncomeType() == IncomeType.ROYALTY).findFirst().orElseThrow();
        assertThat(royaltyEntry.getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSkipsRoyaltyWriteWhenAnIdempotentEntryAlreadyExists() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
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
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(any(UUID.class), eq(bronzeId)))
            .thenReturn(Optional.of(royaltyBonusRateFixture(UUID.randomUUID(), bronzeId, new BigDecimal("3.00"))));
        // The LegVolume row's id is only generated at runtime inside close(), so match on the
        // known associateId/cycleId/incomeType and accept any sourceRef -- same pattern unit 5's
        // own idempotency test uses.
        when(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            eq(root.getId()), eq(cycle.getId()), eq(IncomeType.ROYALTY), any(UUID.class)))
            .thenReturn(true);

        service.close(cycle.getId());

        // MATCHING still gets written (its own idempotency check is untouched by this stub) --
        // only ROYALTY is skipped.
        verify(ledgerEntryRepository, org.mockito.Mockito.times(1)).save(any(LedgerEntry.class));
        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeSkipsRoyaltyWriteWhenComputedGrossAmountIsZero() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
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
        // royaltyPct = 0 -- a valid admin configuration for a rate row, distinct from "no rate
        // configured at all" (the empty-Optional case tested above).
        when(royaltyBonusRateRepository.findByPlanVersionIdAndRankId(any(UUID.class), eq(bronzeId)))
            .thenReturn(Optional.of(royaltyBonusRateFixture(UUID.randomUUID(), bronzeId, BigDecimal.ZERO)));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.ROYALTY));
    }

    @Test
    void closeWritesNoRoyaltyEntryWhenTheAssociateHasNoMatchedVolumeThisCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository, royaltyBonusRateRepository);

        UUID bronzeId = UUID.randomUUID();
        Associate root = associateFixture(null, null);
        root.setRole(AssociateRole.ASSOCIATE);
        root.setKycStatus(KycStatus.VERIFIED);
        root.setRankId(bronzeId);
        Associate left = associateFixture(root.getId(), "L");
        Associate right = associateFixture(root.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(root, left, right));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        // Only the left leg has volume this cycle -- min(100, 0) = 0, so unit 5 writes no
        // MATCHING entry either. Royalty's own guard must independently reach the same "skip".
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(left.getId(), cycle.getId(), new BigDecimal("100"))
        ));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
    }
```

Add the static import this task's tests need, if not already present:

```java
import static org.mockito.ArgumentMatchers.argThat;
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: FAIL — `closeCreditsRoyaltyForAnAssociateWithARoyaltyRateConfiguredForTheirRank`, `closeUsesThePostAdvancementRankWhenLookingUpTheRoyaltyRate`, `closeSetsCarriedForwardStatusForRoyaltyWhenAssociateKycIsNotVerified`, and `closeSkipsRoyaltyWriteWhenAnIdempotentEntryAlreadyExists` fail (no `ROYALTY` entry is ever written, since `creditRoyalty` doesn't exist yet and isn't wired into `close()`). The other five new tests pass vacuously (as noted in Step 2) — every pre-existing test still passes.

- [ ] **Step 4: Implement `creditRoyalty` and wire it into `close()`**

In `backend/src/main/java/com/plotchain/cycle/CycleService.java`, change `close()`'s body — replace:

```java
        // Flow step 5 (Decision #9): second pass, requires step 3 (creditMatchingIncome) complete
        // tree-wide. One SPONSOR_MATCHING entry per direct sponsee who earned Matching Income this
        // cycle, credited to their sponsor. No role guard -- applies to Admin in full (Decision #7:
        // "Matching and Sponsor Matching... are unaffected and do apply to Admin in full"). This is
        // this unit's own insertion point; unit 8 (Royalty) inserts its own step immediately after
        // this call, before the CLOSED flip below.
        creditSponsorMatching(cycle.getId(), associates, planVersion);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
```

with:

```java
        // Flow step 5 (Decision #9): second pass, requires step 3 (creditMatchingIncome) complete
        // tree-wide. One SPONSOR_MATCHING entry per direct sponsee who earned Matching Income this
        // cycle, credited to their sponsor. No role guard -- applies to Admin in full (Decision #7:
        // "Matching and Sponsor Matching... are unaffected and do apply to Admin in full").
        creditSponsorMatching(cycle.getId(), associates, planVersion);

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

Also update the class-level comment above `close()`:

```java
    // Cycle-management unit 3 (row lock + OPEN check, unchanged) + unit 4 (leg-volume rollup) +
    // unit 5 (Matching Income) + unit 6 (Rank progression) + unit 7 (Sponsor Matching) + unit 8
    // (Royalty) -- docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch flow steps 1, 2, 3, 4, 5, 6, 8. Step 7 (Reward) is NOT
    // implemented here -- unit 9 inserts its own logic between the creditRoyalty call above and
    // the CLOSED flip, without changing this method's signature or transaction boundary, the same
    // sequential-insertion pattern units 3 -> 4 -> 5 -> 6 -> 7 -> 8 already used.
    @Transactional
    public CycleCloseResponse close(UUID id) {
```

Add the new private method after `creditSponsorMatching`, before `getOrOpenCurrent`:

```java
    // Flow step 6 (Decision #7, #10, #11, #12): for each associate whose just-computed
    // matched-pair volume this cycle is positive -- recomputed here as
    // min(legVolume.leftLegVolume, legVolume.rightLegVolume), the exact same predicate
    // creditMatchingIncome (step 3) uses to decide whether it wrote a MATCHING entry, since
    // creditMatchingIncome never mutates leftLegVolume/rightLegVolume themselves (only
    // carriedForwardLeft/Right) -- look up RoyaltyBonusRate for (planVersion, associate's
    // POST-rank-advancement rankId). advanceRanks (step 4) and creditSponsorMatching (step 5)
    // have both already run by the time this executes, so associate.getRankId() already reflects
    // any advancement earned THIS cycle (Decision #7: "an achievement crossed this cycle earns
    // this cycle's royalty rate immediately"). No rate configured -> no-op, not an error (some
    // low ranks structurally have none). Guard is role == ASSOCIATE, not role != ADMIN -- same
    // reasoning as advanceRanks' own guard: RoyaltyBonusRate is rank-keyed and rank_id is NULL
    // for Admin AND the four staff roles (chk_associate_rank_required, V4). sourceRef =
    // legVolume.id, the same row Matching used for this associate+cycle (Decision #12: "both
    // derive from the same cycle-computed matched-pair volume").
    private void creditRoyalty(
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
            if (associate.getRole() != AssociateRole.ASSOCIATE) {
                continue;
            }

            Optional<RoyaltyBonusRate> rate = royaltyBonusRateRepository
                .findByPlanVersionIdAndRankId(planVersion.getId(), associate.getRankId());
            if (rate.isEmpty()) {
                continue;
            }

            // Decision #12: check-then-insert, same pattern as creditMatchingIncome/creditSponsorMatching.
            boolean alreadyCredited = ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
                associate.getId(), cycleId, IncomeType.ROYALTY, legVolume.getId());
            if (alreadyCredited) {
                continue;
            }

            BigDecimal grossAmount = matchedVolume.multiply(
                rate.get().getRoyaltyPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
            if (grossAmount.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            Deductions deductions = applyDeductions(grossAmount, planVersion);

            LedgerEntry entry = new LedgerEntry();
            entry.setId(UUID.randomUUID());
            entry.setAssociateId(associate.getId());
            entry.setIncomeType(IncomeType.ROYALTY);
            entry.setCycleId(cycleId);
            entry.setGrossAmount(grossAmount);
            entry.setTdsDeduction(deductions.tdsDeduction());
            entry.setAdminDeduction(deductions.adminDeduction());
            entry.setNetAmount(deductions.netAmount());
            entry.setStatus(kycGatedStatus(associate));
            entry.setSourceRef(legVolume.getId());
            entry.setCreatedAt(Instant.now());
            ledgerEntryRepository.save(entry);
        }
    }
```

- [ ] **Step 5: Run the full `CycleServiceTest` suite to verify everything passes**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: PASS — all tests, pre-existing plus the 9 new ones.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleService.java \
        backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): credit Royalty at post-advancement rank, no-op if no rate configured"
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
- `CycleServiceTest` (Tasks 1, 3, 4), `CompensationPlanVersionRepositoryTest` (Task 2) all pass.
- `CycleCloseRollbackTest`, `CycleCloseConcurrencyTest`, and `CycleCloseSponsorMatchingIntegrationTest` stay green without any changes — all `@Autowired CycleService` via real Spring wiring, and this unit's new constructor argument resolves automatically. `CycleCloseConcurrencyTest` seeds zero `Associate` rows, so `creditRoyalty`'s outer loop over `legVolumes` runs zero times — a safe no-op, same shape as `creditMatchingIncome`/`advanceRanks`/`creditSponsorMatching` already handle for that test.
- `CompensationPlanControllerTest`, `CompensationPlanServiceTest`, `CompensationExceptionHandlerTest` stay unaffected — this unit adds a repository method but touches no compensation-package service/controller code.
- Sales-owned tests (`SaleServiceTest` etc.) stay unaffected — this unit touches no Sales code.
- (Known, pre-existing and unrelated: `mvn test` may show ~55 spurious Mockito errors from a JDK21/25 mismatch in this environment — see the JDK/Mockito memory note. Don't mistake those for a regression this unit caused; check that the specific test classes above report their expected pass counts.)

If anything else fails, stop and diagnose before continuing — do not proceed to bookkeeping on a red suite.

- [ ] **Step 2: Update the unit-queue bookkeeping file**

In `docs/superpowers/plans/2026-08-03-cycle-management-units.md`, change unit 8's row from:

```
| 8 | backend | Royalty at post-advancement rank, no-op if no rate configured | 5, 6 | pending | — | — |
```

to:

```
| 8 | backend | Royalty at post-advancement rank, no-op if no rate configured | 5, 6 | planned | `docs/superpowers/plans/2026-08-11-cycle-royalty.md` | — |
```

Also update the "Next pending unit" note and the "Note for the next unit's plan" note at the bottom of that file to reflect that unit 8 now has a plan (constructor is 8 args, up from 7 — `RoyaltyBonusRateRepository` added, same append-at-the-end pattern units 6/7 used), that the `applyDeductions`/`kycGatedStatus` helper extraction this unit's Task 1 performed is now available to unit 9 (Reward) too (Reward writes `LedgerEntry` rows with the same deduction/KYC-gating shape, per Decision #10/#11), and that unit 9 (Reward)'s insertion point is immediately after the `creditRoyalty(...)` call in `close()`, before the `CLOSED` flip, per this unit's own boundary-marker comment. Leave the exact wording to match the file's existing style.

- [ ] **Step 3: Commit the bookkeeping update**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add docs/superpowers/plans/2026-08-03-cycle-management-units.md
git commit -m "docs: mark cycle-management unit 8 planned, persist its plan file"
```

---

## Self-review notes (from writing this plan)

- **Spec coverage**: Decision #7's second paragraph (post-advancement rank lookup, skipped for Admin) — Task 4's `creditRoyalty` + its post-advancement-rank test. Flow step 6 (`grossAmount = matchedPairVolume × royaltyPct/100`, `sourceRef = legVolume.id`, no-op-not-error when no rate) — Task 4's basic-credit test and no-rate-configured test. Decision #10 (deduction math, shared `planVersion`) — Task 1's extraction + Task 4's basic-credit test's deduction assertions. Decision #11 (KYC-gating) — Task 4's dedicated CARRIED_FORWARD test. Decision #12 (idempotency, `source_ref` = `legVolume.id` "same as Matching") — Task 4's idempotency test and every `sourceRef` assertion. The task brief's explicit instruction to extract `applyDeductions`/`kycGatedStatus` as Task 1, verified by unit 5's/unit 7's existing tests passing unchanged — Task 1 in full. The task brief's explicit instruction to leave a boundary marker for unit 9 — Task 4 Step 4's comment plus Task 5's bookkeeping note.
- **Placeholder scan**: no TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency**: `creditRoyalty(UUID cycleId, List<Associate> associates, List<LegVolume> legVolumes, CompensationPlanVersion planVersion): void` — same signature at its definition (Task 4 Step 4) and its one call site in `close()` (Task 4 Step 4). `RoyaltyBonusRateRepository.findByPlanVersionIdAndRankId(UUID, UUID): Optional<RoyaltyBonusRate>` matches between Task 2's repository declaration and Task 4's `creditRoyalty` call. `applyDeductions(BigDecimal, CompensationPlanVersion): Deductions` and `kycGatedStatus(Associate): LedgerEntryStatus` match between Task 1's declarations and their three call sites (`creditMatchingIncome`, `creditSponsorMatching`, `creditRoyalty`). `CycleService`'s constructor grows from 7 args (post-unit-7) to 8 args in Task 3, and Task 4 introduces no further constructor change — confirmed against the actual current `CycleService.java` and `CycleServiceTest.java` (34 call sites) before writing this plan, not assumed from the spec's prose alone.
