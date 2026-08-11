# Cycle Management Unit 7: Sponsor Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inside `CycleService.close()`'s settlement batch, after Rank progression (unit 6, merged), credit each sponsor a `SPONSOR_MATCHING` `LedgerEntry` for every direct sponsee who earned a Matching Income entry this cycle — one itemized entry per direct sponsee (never aggregated), net of TDS/admin deductions, KYC-gated on the *sponsor's* own KYC status — flow step 5 of the settlement batch, per `docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md`, Decision #9.

**Architecture:** One new private method, `creditSponsorMatching(UUID cycleId, List<Associate> associates, CompensationPlanVersion planVersion)`, added to the existing `CycleService` class and called from `close()` immediately after `advanceRanks(associates)` and before the `CLOSED` status flip — the same sequential-insertion pattern units 3→4→5→6 already established in this file. No new constructor dependency: the method reuses `associateRepository` and `ledgerEntryRepository`, both already wired. Two new repository methods back it: `AssociateRepository.findBySponsorId` (walks the sponsorship graph, mirrors the existing `findByParentId`) and `LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType` (a **fresh query**, not an in-memory carry-over from `creditMatchingIncome` — see the Global Constraints' design-decision writeup below for why). `IncomeType.SPONSOR_MATCHING` already exists in the enum (added before this unit, already consumed by unit 2's admin cycle-detail breakdown) — no enum change needed.

**Tech Stack:** Spring Boot service layer, JPA entities (`Associate`, `LedgerEntry`), JUnit 5 + Mockito (`CycleServiceTest`, unit-level, mocked repositories) + `@DataJpaTest` (repository-level, real H2 MODE=PostgreSQL) + `@SpringBootTest` (one new integration test that proves the fresh-query design decision is actually safe against Hibernate's real flush semantics, which a mocked-repository unit test structurally cannot verify) — matches existing conventions in `backend/src/test/java/com/plotchain/`.

## Global Constraints

- **Scope boundary (hard):** this unit implements ONLY flow step 5 (Sponsor Matching). No Royalty, no Reward — those are units 8–9. Do not touch `CycleCloseResponse`'s shape; per its own comment, units 5–9 add per-income-type fields "once they have something to report, not before," and unit 5 (Matching) already established the precedent of writing `LedgerEntry` rows without touching that DTO — this unit follows the same precedent.
- **One `SPONSOR_MATCHING` `LedgerEntry` per (sponsor, direct sponsee, cycle)** — itemized, never aggregated into one lump sum per sponsor (Decision #9).
- **`grossAmount = sponseeMatchingEntry.grossAmount × sponsorMatchingPct / 100`** — always the sponsee's Matching **gross**Amount, never `netAmount` (Decision #9's explicit "never netAmount" rule — deductions apply once, per-entry, at the point each entry is created; basing a derived calc on an already-net figure would double-apply that effect implicitly).
- **`sourceRef = sponseeMatchingEntry.id`** (Decision #9) — the specific Matching `LedgerEntry` id, not the `LegVolume` id (contrast with Matching's own `sourceRef = legVolume.id`).
- **Deductions**: same math every other income type in this batch uses — `tdsDeduction = grossAmount × tdsPct/100`, `adminDeduction = grossAmount × adminChargeWithoutPanPct/100` (always without-PAN tier), `netAmount = grossAmount − tdsDeduction − adminDeduction` (Decision #10), using the same `planVersion` already resolved once per batch run against `cycle.getPeriodStart()`.
- **KYC-gating uses the SPONSOR's own `kycStatus`, not the sponsee's**: `sponsor.kycStatus == VERIFIED` → `PENDING`; anything else → `CARRIED_FORWARD` (Decision #11 — "checks `associate.kycStatus` at creation time," and the associate this entry pays is the sponsor, not the sponsee whose Matching entry triggered it).
- **Idempotency**: `LedgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(sponsorId, cycleId, SPONSOR_MATCHING, sponseeMatchingEntry.id)` checked before every write, skip if it already exists (Decision #12) — same check-then-insert pattern `creditMatchingIncome` already uses.
- **No role guard.** Unlike Rank progression (unit 6, `role == ASSOCIATE` only) and Royalty (unit 8, skipped for Admin), Sponsor Matching has no rank dependency and applies to Admin in full per Decision #7's explicit carve-out: "Matching and Sponsor Matching, which have no rank dependency, are unaffected and do apply to Admin in full." Any associate — Admin included — can be credited as a sponsor, and any associate's Matching entry can trigger a credit to their sponsor.
- **Inferred rule (not spec-literal, but consistent with Decision #5's stated reasoning for Matching): skip writing when the computed `grossAmount` is not strictly positive.** A sponsee's Matching entry always has `grossAmount > 0` (unit 5 never writes a zero-value Matching entry — Decision #5), so the only way `SPONSOR_MATCHING`'s `grossAmount` comes out `<= 0` is `sponsorMatchingPct` itself being configured as `0` in the active `CompensationPlanVersion` — a valid admin choice, not a data anomaly. Writing a zero-value entry for every single sponsee-match that cycle in that configuration "carries no information and would just be noise in every associate's income statement," Decision #5's own words for the identical situation in Matching. This unit applies the same reasoning by extension; flag it in code review if it looks surprising, but implement it as written.
- **Design decision — fresh repository query vs. in-memory reuse of unit 5's Matching entries (explicitly required by this task, decided here):** Sponsor Matching looks up each sponsee's Matching `LedgerEntry` via a **fresh call to `LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType`**, not via an in-memory `Map<UUID, LedgerEntry>` built and threaded out of `creditMatchingIncome` during this same `close()` invocation. Reasoning:
  - **This is what the spec itself names.** Decision #9's Data model section explicitly lists `LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(UUID, UUID, IncomeType): Optional<LedgerEntry>` as a *new* repository method for exactly this lookup — the spec's own design already committed to a query-based approach, not an in-memory carry-over.
  - **Correctness under the single-transaction batch design (Decision #1) is not in question.** `creditMatchingIncome` writes its `LedgerEntry` rows via `ledgerEntryRepository.save(entry)` inside the same `@Transactional` `close()` method. Hibernate's default `FlushMode.AUTO` flushes pending changes to entities of a type before executing a JPQL/derived query that touches that same entity's table — so a `LedgerEntry` saved earlier in this transaction is visible to a `findByAssociateIdAndCycleIdAndIncomeType` query issued later in the *same* transaction, before it ever commits. This is the identical guarantee the existing `existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef` idempotency check already implicitly relies on within `creditMatchingIncome`'s own loop. Task 4 below adds a `@SpringBootTest`-level integration test specifically to prove this against the real H2 test datasource, not just assert it in a comment — a Mockito-mocked-repository unit test cannot exercise Hibernate's flush semantics at all, so this property needs a test that uses the real repository.
  - **Simplicity and non-interference with merged code.** `creditMatchingIncome` (unit 5, merged) has an established `void` signature and its own scope comment says later units "insert their own logic... without changing this method's signature." Restructuring it to also build and return a `Map<UUID, LedgerEntry>` would touch merged, reviewed code for a benefit (skipping one extra SELECT per sponsee) that Hibernate's auto-flush already makes unnecessary for correctness.
  - **Cost, acknowledged:** one extra `SELECT` per (sponsor, direct-sponsee) pair evaluated — bounded by tree size, the same order of magnitude as this batch's other per-associate work. Not a concern at this platform's expected scale (Decision #1's "a regional real-estate MLM, not a global consumer app" framing; Open Question #1 already defers batch-performance-at-scale work generally).
- **Iteration shape — sponsor-centric, not sponsee-centric.** Decision #9's prose reads "for each associate with `sponsorId IS NOT NULL`, find their sponsor, and for each of the sponsor's direct sponsees..." — read completely literally this re-scans every sponsor's full sponsee list once per sponsee that resolves to that sponsor, which is redundant work with no distinct writes (the idempotency check would silently absorb the duplication, but at the cost of wasted reads). This plan implements the equivalent, non-redundant form: iterate over `associates` once as candidate **sponsors**, call `associateRepository.findBySponsorId(sponsor.getId())` exactly once per candidate, and for each returned direct sponsee look up that sponsee's Matching entry. Same repository method, same net effect (one `SPONSOR_MATCHING` entry per direct sponsee with a Matching entry this cycle), no redundant re-scanning.
- **Migration convention**: no new migration needed for this unit — no schema change, `IncomeType.SPONSOR_MATCHING` already exists, `ledger_entry`'s idempotency constraint (V17) already covers this income type since it's keyed on `(associate_id, cycle_id, income_type, source_ref)` generically.
- **Rounding**: same as `creditMatchingIncome` — `pct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)` then multiply, no explicit `.setScale(2, HALF_UP)` before persisting — matches unit 5's flagged-but-not-fixed convention, kept consistent across income types rather than unilaterally diverging in this one.

---

## Task 1: `AssociateRepository.findBySponsorId` — repository method and DB-level test

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Produces: `AssociateRepository.findBySponsorId(UUID sponsorId): List<Associate>` — Task 3's `creditSponsorMatching` consumes this directly.

- [ ] **Step 1: Add the repository method**

In `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`, add after `findByParentId`:

```java
    // Cycle-management unit 7 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #9): Sponsor Matching's per-sponsor sponsee lookup -- mirrors findByParentId's
    // shape exactly, but walks the sponsorship graph (sponsor_id), not the binary placement tree
    // (parent_id). The two are independent relationships on the same Associate row; a sponsor's
    // direct sponsees are not necessarily their binary-tree children.
    List<Associate> findBySponsorId(UUID sponsorId);
```

- [ ] **Step 2: Write the failing test**

In `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`, add after `countByParentIdCountsOnlyDirectChildren`:

```java
    @Test
    void findBySponsorIdReturnsOnlyDirectSponseesNotTheWholeDownline() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate sponsor = persistAssociate("VP00001", "Sponsor", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        Associate directSponsee = persistAssociate("VP00002", "Direct Sponsee", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        directSponsee.setSponsorId(sponsor.getId());
        // indirectSponsee is sponsored BY directSponsee, not by sponsor -- one level removed on
        // the sponsorship graph, must NOT appear in sponsor's own findBySponsorId result even
        // though it's part of sponsor's wider organization.
        Associate indirectSponsee = persistAssociate("VP00003", "Indirect Sponsee", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        indirectSponsee.setSponsorId(directSponsee.getId());
        // unrelated has no sponsor at all.
        persistAssociate("VP00004", "Unrelated", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        List<Associate> found = associateRepository.findBySponsorId(sponsor.getId());

        assertThat(found).extracting(Associate::getId).containsExactly(directSponsee.getId());
    }

    @Test
    void findBySponsorIdReturnsEmptyWhenTheAssociateHasNoSponsees() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate lonely = persistAssociate("VP00001", "Lonely", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        assertThat(associateRepository.findBySponsorId(lonely.getId())).isEmpty();
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=AssociateRepositoryTest#findBySponsorIdReturnsOnlyDirectSponseesNotTheWholeDownline+findBySponsorIdReturnsEmptyWhenTheAssociateHasNoSponsees`
Expected: FAIL — compile error, `findBySponsorId` doesn't exist yet on the repository interface. (If Step 1 was already applied, this instead fails because there's no data yet — that shouldn't happen since Step 1 precedes Step 2 above; if you're executing steps out of order, do Step 1 first.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q test -Dtest=AssociateRepositoryTest`
Expected: PASS, all tests in the file (the two new ones plus every pre-existing test unaffected).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/associate/AssociateRepository.java \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat(cycle): add AssociateRepository.findBySponsorId for Sponsor Matching"
```

---

## Task 2: `LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType` — repository method and DB-level test

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Modify: `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`

**Interfaces:**
- Produces: `LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(UUID associateId, UUID cycleId, IncomeType incomeType): Optional<LedgerEntry>` — Task 3's `creditSponsorMatching` consumes this directly; Task 4's integration test consumes it to prove the fresh-query design decision holds under real Hibernate flush semantics.

- [ ] **Step 1: Add the repository method**

In `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`, add after `existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef`:

```java
    // Cycle-management unit 7 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #9): locates a sponsee's Matching LedgerEntry for this cycle, so Sponsor Matching
    // can base its own grossAmount on it. A fresh query, not a carry-over from creditMatchingIncome's
    // in-memory work -- see this unit's plan for why that's the deliberate choice, and Task 4's
    // integration test for the proof it's safe within the single settlement-batch transaction.
    // Unqualified by associateId+cycleId+incomeType alone being enough to disambiguate: an
    // associate has at most one MATCHING entry per cycle (unit 5 writes exactly one per associate
    // per cycle, guarded by its own idempotency check), so Optional<LedgerEntry> is correct, not
    // a lossy simplification of a potential multi-row result.
    Optional<LedgerEntry> findByAssociateIdAndCycleIdAndIncomeType(UUID associateId, UUID cycleId, IncomeType incomeType);
```

- [ ] **Step 2: Write the failing test**

In `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`, add after `notNullConstraintRejectsANullSourceRef`:

```java
    @Test
    void findByAssociateIdAndCycleIdAndIncomeTypeReturnsTheMatchingRowForThatExactTuple() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        LedgerEntry saved = ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, UUID.randomUUID()));

        Optional<LedgerEntry> found = ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(
            associate.getId(), cycle.getId(), IncomeType.MATCHING);

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(saved.getId());
    }

    @Test
    void findByAssociateIdAndCycleIdAndIncomeTypeReturnsEmptyWhenNoEntryOfThatIncomeTypeExists() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        // A DIRECT entry exists for this associate+cycle, but the caller is asking about MATCHING.
        ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), cycle.getId(), IncomeType.DIRECT, UUID.randomUUID()));

        Optional<LedgerEntry> found = ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(
            associate.getId(), cycle.getId(), IncomeType.MATCHING);

        assertThat(found).isEmpty();
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=LedgerEntryRepositoryTest#findByAssociateIdAndCycleIdAndIncomeTypeReturnsTheMatchingRowForThatExactTuple+findByAssociateIdAndCycleIdAndIncomeTypeReturnsEmptyWhenNoEntryOfThatIncomeTypeExists`
Expected: FAIL — compile error, method doesn't exist yet (do Step 1 first if testing this in isolation).

- [ ] **Step 4: Run the full file to verify everything passes**

Run: `cd backend && mvn -q test -Dtest=LedgerEntryRepositoryTest`
Expected: PASS, all tests (the two new ones plus every pre-existing test in the file unaffected).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java \
        backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java
git commit -m "feat(cycle): add LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType"
```

---

## Task 3: Sponsor Matching credited inline in `CycleService.close()`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findBySponsorId(UUID): List<Associate>` (Task 1). `LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(UUID, UUID, IncomeType): Optional<LedgerEntry>` (Task 2). `LedgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(UUID, UUID, IncomeType, UUID): boolean` (existing, unit 5). `CompensationPlanVersion.getSponsorMatchingPct()/getTdsPct()/getAdminChargeWithoutPanPct(): BigDecimal` (existing). `Associate.getSponsorId()/getKycStatus(): UUID/KycStatus` (existing).
- Produces: `private void creditSponsorMatching(UUID cycleId, List<Associate> associates, CompensationPlanVersion planVersion)`, called from `close()` right after `advanceRanks(associates)`. `CycleService`'s constructor signature is **unchanged** (still 7 args) — no new dependency needed. `close()`'s signature and `CycleCloseResponse`'s shape are unchanged.

- [ ] **Step 1: Update the shared `planVersionFixture()` in `CycleServiceTest` to a nonzero `sponsorMatchingPct`**

`sponsorMatchingPct` currently sits at `BigDecimal.ZERO` in the shared fixture — inert until this unit, since no production code read it before now. Change it in `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`:

```java
    private CompensationPlanVersion planVersionFixture() {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.of(2026, 1, 1),
            BigDecimal.ZERO, new BigDecimal("10.00"), new BigDecimal("11.00"),
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY,
            Instant.now(), null);
    }
```

(`sponsorMatchingPct = 11.00`, matching the domain spec's own example percentage. No other field changes. This is safe for every pre-existing test in the file: none of them read `getSponsorMatchingPct()` before this unit's production code exists.)

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: PASS — this is a data-only fixture change with no behavior change yet; confirms nothing pre-existing depended on the old zero value.

- [ ] **Step 2: Add a fixture helper for a stand-in sponsee Matching entry**

Add this private helper near `planVersionFixture`/`saleFixture`:

```java
    private LedgerEntry matchingEntryFixture(UUID associateId, UUID cycleId, BigDecimal grossAmount) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setAssociateId(associateId);
        entry.setCycleId(cycleId);
        entry.setIncomeType(IncomeType.MATCHING);
        entry.setGrossAmount(grossAmount);
        entry.setNetAmount(grossAmount); // netAmount is irrelevant to every caller of this fixture -- Sponsor Matching must ignore it (Decision #9's "never netAmount" rule) and only these tests' assertions decide whether that held
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setSourceRef(UUID.randomUUID());
        entry.setCreatedAt(Instant.now());
        return entry;
    }
```

- [ ] **Step 3: Write the failing tests**

Add these tests to `CycleServiceTest.java`. Each stubs `associateRepository.findBySponsorId` and `ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType` directly — these represent "a sponsee already has a Matching entry this cycle" as a testing precondition, the same way unit 5's own tests stubbed `legVolumeRepository.findByAssociateIdAndCycleId` to represent "prior cycle's carried-forward data" as a precondition, rather than deriving it from a full rollup inside the same test. (Task 4 below is what proves the real, non-mocked wiring between `creditMatchingIncome`'s writes and this query actually works end to end.)

```java
    @Test
    void closeCreditsSponsorMatchingForADirectSponseesMatchingEntryThisCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        LedgerEntry entry = entryCaptor.getValue();

        assertThat(entry.getIncomeType()).isEqualTo(IncomeType.SPONSOR_MATCHING);
        assertThat(entry.getAssociateId()).isEqualTo(sponsor.getId());
        assertThat(entry.getCycleId()).isEqualTo(cycle.getId());
        assertThat(entry.getSourceRef()).isEqualTo(sponseeMatchingEntry.getId());
        // gross = 50.00 * 11% = 5.5000
        assertThat(entry.getGrossAmount()).isEqualByComparingTo("5.50");
        // tds = 5.5000 * 5% = 0.2750
        assertThat(entry.getTdsDeduction()).isEqualByComparingTo("0.275");
        // admin = 5.5000 * 4% = 0.2200
        assertThat(entry.getAdminDeduction()).isEqualByComparingTo("0.22");
        // net = 5.5000 - 0.2750 - 0.2200 = 5.0050
        assertThat(entry.getNetAmount()).isEqualByComparingTo("5.005");
        assertThat(entry.getStatus()).isEqualTo(LedgerEntryStatus.PENDING);
        assertThat(entry.getCreatedAt()).isNotNull();
    }

    @Test
    void closeWritesOneSponsorMatchingEntryPerDirectSponseeNotAggregated() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponseeOne = associateFixture(null, null);
        sponseeOne.setSponsorId(sponsor.getId());
        Associate sponseeTwo = associateFixture(null, null);
        sponseeTwo.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponseeOne, sponseeTwo));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeOneMatchingEntry = matchingEntryFixture(sponseeOne.getId(), cycle.getId(), new BigDecimal("50.00"));
        LedgerEntry sponseeTwoMatchingEntry = matchingEntryFixture(sponseeTwo.getId(), cycle.getId(), new BigDecimal("30.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponseeOne, sponseeTwo));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponseeOne.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeOneMatchingEntry));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponseeTwo.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeTwoMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository, org.mockito.Mockito.times(2)).save(entryCaptor.capture());
        List<LedgerEntry> written = entryCaptor.getAllValues();

        assertThat(written).hasSize(2);
        assertThat(written).allMatch(e -> e.getAssociateId().equals(sponsor.getId())
            && e.getIncomeType() == IncomeType.SPONSOR_MATCHING);
        assertThat(written).extracting(LedgerEntry::getSourceRef)
            .containsExactlyInAnyOrder(sponseeOneMatchingEntry.getId(), sponseeTwoMatchingEntry.getId());
    }

    @Test
    void closeWritesNoSponsorMatchingEntryWhenTheSponseeHasNoMatchingEntryThisCycle() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.empty());

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
    }

    @Test
    void closeBasesSponsorMatchingGrossOnTheSponseesMatchingGrossAmountNeverNetAmount() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        // grossAmount and netAmount deliberately far apart -- if Sponsor Matching ever mistakenly
        // read netAmount instead of grossAmount, this test's math would only match the wrong one.
        LedgerEntry sponseeMatchingEntry = new LedgerEntry();
        sponseeMatchingEntry.setId(UUID.randomUUID());
        sponseeMatchingEntry.setAssociateId(sponsee.getId());
        sponseeMatchingEntry.setCycleId(cycle.getId());
        sponseeMatchingEntry.setIncomeType(IncomeType.MATCHING);
        sponseeMatchingEntry.setGrossAmount(new BigDecimal("100.00"));
        sponseeMatchingEntry.setNetAmount(new BigDecimal("1.00"));
        sponseeMatchingEntry.setStatus(LedgerEntryStatus.PENDING);
        sponseeMatchingEntry.setSourceRef(UUID.randomUUID());
        sponseeMatchingEntry.setCreatedAt(Instant.now());
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        // gross = 100.00 (the sponsee's GROSS, not its 1.00 net) * 11% = 11.0000
        assertThat(entryCaptor.getValue().getGrossAmount()).isEqualByComparingTo("11.00");
    }

    @Test
    void closeGatesSponsorMatchingStatusOnTheSponsorsOwnKycStatusNotTheSponsees() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.PENDING); // sponsor unverified
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        sponsee.setKycStatus(KycStatus.VERIFIED); // sponsee itself IS verified -- must not matter here
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        assertThat(entryCaptor.getValue().getStatus()).isEqualTo(LedgerEntryStatus.CARRIED_FORWARD);
    }

    @Test
    void closeSkipsSponsorMatchingWriteWhenAnIdempotentEntryAlreadyExists() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));
        when(ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
            sponsor.getId(), cycle.getId(), IncomeType.SPONSOR_MATCHING, sponseeMatchingEntry.getId()))
            .thenReturn(true);

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
    }

    @Test
    void closeSkipsSponsorMatchingWriteWhenComputedGrossAmountIsZero() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        Associate sponsor = associateFixture(null, null);
        sponsor.setKycStatus(KycStatus.VERIFIED);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(sponsor.getId());
        when(associateRepository.findAll()).thenReturn(List.of(sponsor, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());

        // sponsorMatchingPct = 0 -- a valid admin configuration, distinct from the shared fixture.
        CompensationPlanVersion zeroSponsorMatchingPlanVersion = new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.of(2026, 1, 1),
            BigDecimal.ZERO, new BigDecimal("10.00"), BigDecimal.ZERO,
            new BigDecimal("5.00"), BigDecimal.ZERO, new BigDecimal("4.00"),
            BigDecimal.ZERO, BigDecimal.ZERO, SettlementCycle.SEMI_MONTHLY, Instant.now(), null);
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(zeroSponsorMatchingPlanVersion));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(sponsor.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        verify(ledgerEntryRepository, never()).save(any(LedgerEntry.class));
    }

    @Test
    void closeCreditsSponsorMatchingToAdminWhenAdminIsTheSponsor() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);

        // Decision #7: "Matching and Sponsor Matching... do apply to Admin in full." Admin has no
        // rankId, no role guard should exclude it from being credited as a sponsor.
        Associate admin = associateFixture(null, null);
        admin.setRole(AssociateRole.ADMIN);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setRankId(null);
        Associate sponsee = associateFixture(null, null);
        sponsee.setSponsorId(admin.getId());
        when(associateRepository.findAll()).thenReturn(List.of(admin, sponsee));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of());
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(cycle.getPeriodStart()))
            .thenReturn(Optional.of(planVersionFixture()));

        LedgerEntry sponseeMatchingEntry = matchingEntryFixture(sponsee.getId(), cycle.getId(), new BigDecimal("50.00"));
        when(associateRepository.findBySponsorId(admin.getId())).thenReturn(List.of(sponsee));
        when(ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycle.getId(), IncomeType.MATCHING))
            .thenReturn(Optional.of(sponseeMatchingEntry));

        service.close(cycle.getId());

        ArgumentCaptor<LedgerEntry> entryCaptor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(entryCaptor.capture());
        assertThat(entryCaptor.getValue().getAssociateId()).isEqualTo(admin.getId());
        assertThat(entryCaptor.getValue().getIncomeType()).isEqualTo(IncomeType.SPONSOR_MATCHING);
    }
```

- [ ] **Step 4: Run the new tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: FAIL — the 8 new tests fail (`ledgerEntryRepository.save(any(LedgerEntry.class))` never called with a `SPONSOR_MATCHING` entry, since `creditSponsorMatching` doesn't exist yet), while every pre-existing test still passes.

- [ ] **Step 5: Implement `creditSponsorMatching` and wire it into `close()`**

In `backend/src/main/java/com/plotchain/cycle/CycleService.java`, add the import:

```java
import java.util.Optional;
```

Change `close()`'s body — insert the new call right after `advanceRanks(associates)` and before the "Flow step 8" comment:

```java
        // Flow step 4 (Decision #7): advance rankId for each ASSOCIATE-role associate to the
        // highest RankTier their updated cumulativeMatchedVolume now qualifies for. Never
        // demotes. Skipped for ADMIN and the four staff roles (see advanceRanks' own comment).
        advanceRanks(associates);

        // Flow step 5 (Decision #9): second pass, requires step 3 (creditMatchingIncome) complete
        // tree-wide. One SPONSOR_MATCHING entry per direct sponsee who earned Matching Income this
        // cycle, credited to their sponsor. No role guard -- applies to Admin in full (Decision #7:
        // "Matching and Sponsor Matching... are unaffected and do apply to Admin in full"). This is
        // this unit's own insertion point; unit 8 (Royalty) inserts its own step immediately after
        // this call, before the CLOSED flip below.
        creditSponsorMatching(cycle.getId(), associates, planVersion);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
```

Also update the class-level comment above `close()` to include this unit:

```java
    // Cycle-management unit 3 (row lock + OPEN check, unchanged) + unit 4 (leg-volume rollup) +
    // unit 5 (Matching Income) + unit 6 (Rank progression) + unit 7 (Sponsor Matching) --
    // docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch flow steps 1, 2, 3, 4, 5, 8. Steps 6-7 (Royalty, Reward) are
    // NOT implemented here -- units 8-9 insert their own logic between the creditSponsorMatching
    // call above and the CLOSED flip, without changing this method's signature or transaction
    // boundary, the same sequential-insertion pattern units 3 -> 4 -> 5 -> 6 -> 7 already used.
```

Add the new private method after `advanceRanks`, before `getOrOpenCurrent`:

```java
    // Flow step 5 (Decision #9, #10, #11, #12): iterate over `associates` once as candidate
    // SPONSORS (not sponsees -- see this unit's plan for why this is the equivalent, non-redundant
    // reading of Decision #9's prose). For each candidate sponsor's direct sponsees
    // (findBySponsorId), look up that sponsee's Matching LedgerEntry for THIS cycle via a fresh
    // repository query (deliberately not an in-memory carry-over from creditMatchingIncome -- see
    // this unit's plan's Global Constraints for the full correctness/simplicity tradeoff writeup).
    // If the sponsee has one, credit the sponsor a SPONSOR_MATCHING entry: grossAmount is a
    // percentage of the sponsee's Matching grossAmount (never netAmount -- deductions apply once,
    // per-entry, at creation), sourceRef = that Matching entry's id. Deductions and KYC-gating use
    // the SPONSOR's own numbers/kycStatus -- the sponsor is who this entry pays. No role guard:
    // unlike Rank/Royalty, this applies to Admin in full (Decision #7).
    private void creditSponsorMatching(
        UUID cycleId,
        List<Associate> associates,
        CompensationPlanVersion planVersion
    ) {
        for (Associate sponsor : associates) {
            List<Associate> directSponsees = associateRepository.findBySponsorId(sponsor.getId());

            for (Associate sponsee : directSponsees) {
                Optional<LedgerEntry> sponseeMatchingEntry = ledgerEntryRepository
                    .findByAssociateIdAndCycleIdAndIncomeType(sponsee.getId(), cycleId, IncomeType.MATCHING);
                if (sponseeMatchingEntry.isEmpty()) {
                    continue;
                }
                LedgerEntry matchingEntry = sponseeMatchingEntry.get();

                // Decision #12: check-then-insert, same pattern as creditMatchingIncome.
                boolean alreadyCredited = ledgerEntryRepository.existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef(
                    sponsor.getId(), cycleId, IncomeType.SPONSOR_MATCHING, matchingEntry.getId());
                if (alreadyCredited) {
                    continue;
                }

                // Decision #9: percentage of the sponsee's Matching grossAmount, never netAmount.
                BigDecimal grossAmount = matchingEntry.getGrossAmount().multiply(
                    planVersion.getSponsorMatchingPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                if (grossAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }

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
            }
        }
    }
```

- [ ] **Step 6: Run the full `CycleServiceTest` suite to verify everything passes**

Run: `cd backend && mvn -q test -Dtest=CycleServiceTest`
Expected: PASS — all tests, pre-existing plus the 8 new ones.

- [ ] **Step 7: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleService.java \
        backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): credit Sponsor Matching, one entry per direct sponsee, in close()"
```

---

## Task 4: Integration test proving the fresh-query design decision is safe within the batch transaction

**Files:**
- Create: `backend/src/test/java/com/plotchain/cycle/CycleCloseSponsorMatchingIntegrationTest.java`

**Interfaces:**
- Consumes: `CycleService.close(UUID): CycleCloseResponse` (real, `@Autowired`, no mocks on `AssociateRepository`/`LedgerEntryRepository`/`CycleRepository` — this is the point of the test). `LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType` (Task 2, exercised here against real, uncommitted-within-the-transaction data).
- Produces: nothing new for later tasks — this is a standalone correctness proof for the Global Constraints' "fresh query, not in-memory reuse" decision, specifically the claim that Hibernate's `FlushMode.AUTO` makes a `LedgerEntry` saved earlier in `close()`'s single transaction visible to a query issued later in that same transaction, before it ever commits.

This is the one property Task 3's Mockito-mocked-repository tests structurally cannot verify: a mocked `ledgerEntryRepository.save(...)` call has no relationship to a separately-stubbed `ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(...)` call — they're independent stub setups. Only a test using the real, Spring-wired repository against a real (H2, MODE=PostgreSQL) datasource can prove the actual read-after-write behavior this design decision depends on.

- [ ] **Step 1: Write the test**

Create `backend/src/test/java/com/plotchain/cycle/CycleCloseSponsorMatchingIntegrationTest.java`:

```java
package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
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

    private UUID cycleId;
    private UUID sponsorId;
    private UUID sponseeId;
    private UUID leftId;
    private UUID rightId;

    @AfterEach
    void cleanUp() {
        if (cycleId != null) {
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAll().stream()
                .filter(e -> e.getCycleId().equals(cycleId)).toList());
            saleRepository.deleteAll(saleRepository.findAll().stream()
                .filter(s -> s.getCycleId().equals(cycleId)).toList());
            cycleRepository.deleteById(cycleId);
        }
        for (UUID id : new UUID[] {leftId, rightId, sponseeId, sponsorId}) {
            if (id != null) {
                associateRepository.deleteById(id);
            }
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
        associate.setUserId(userId);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ASSOCIATE);
        associateRepository.saveAndFlush(associate);
        return id;
    }

    private void seedSale(UUID associateId, UUID cycleId, BigDecimal amount) {
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setAssociateId(associateId);
        sale.setCycleId(cycleId);
        sale.setAmount(amount);
        sale.setStatus(SaleStatus.RECORDED);
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
        seedSale(leftId, cycleId, new BigDecimal("100"));
        seedSale(rightId, cycleId, new BigDecimal("100"));

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
```

- [ ] **Step 2: Run the test to verify it fails against the pre-Task-3 codebase**

If run against the code as it stood before Task 3's implementation, this test fails (no `SPONSOR_MATCHING` entry exists). Since Task 3 is already implemented by this point in the plan, instead confirm the test's *shape* is right by running it now and expecting it to pass — the "would this have failed before" check was already exercised implicitly by Task 3's own tests failing first. Run:

Run: `cd backend && mvn -q test -Dtest=CycleCloseSponsorMatchingIntegrationTest`
Expected: PASS.

- [ ] **Step 3: If it fails, diagnose before proceeding**

If `sponsorEntries` comes back empty, the most likely cause is exactly the risk this test exists to catch: the fresh query isn't seeing creditMatchingIncome's uncommitted insert. Before assuming a Hibernate flush-mode problem, first check the mundane possibilities: the V8-seeded `compensation_plan_version` row's `effective_from = 2000-01-01` must resolve for `cycle.getPeriodStart() = 2026-07-01` (it should, via `findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc`), and `sponsee`'s two sale amounts must actually produce a nonzero matched volume. If those check out and the query genuinely isn't seeing the same-transaction insert, that invalidates this plan's core design decision — stop and revisit the Global Constraints' "fresh query vs in-memory reuse" tradeoff before continuing, since the alternative (threading a `Map<UUID, LedgerEntry>` out of `creditMatchingIncome`) would then be required for correctness, not just an optimization.

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/cycle/CycleCloseSponsorMatchingIntegrationTest.java
git commit -m "test(cycle): prove Sponsor Matching's fresh-query lookup sees same-transaction writes"
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
- `CycleServiceTest` (Task 3), `AssociateRepositoryTest` (Task 1), `LedgerEntryRepositoryTest` (Task 2), and `CycleCloseSponsorMatchingIntegrationTest` (Task 4) all pass.
- `CycleCloseRollbackTest` and `CycleCloseConcurrencyTest` stay green without any changes — both `@Autowired CycleService` via real Spring wiring, and this unit added no new constructor argument, so nothing about their setup changes. `CycleCloseConcurrencyTest` seeds zero `Associate` rows, so `creditSponsorMatching`'s outer loop over `associates` runs zero times — a safe no-op, same shape as `creditMatchingIncome`/`advanceRanks` already handle for that test.
- Sales-owned tests (`SaleServiceTest` etc.) stay unaffected — this unit touches no Sales code.

If anything else fails, stop and diagnose before continuing — do not proceed to bookkeeping on a red suite.

- [ ] **Step 2: Update the unit-queue bookkeeping file**

In `docs/superpowers/plans/2026-08-03-cycle-management-units.md`, change unit 7's row from:

```
| 7 | backend | Sponsor Matching, one entry per direct sponsee | 5 | pending | — | — |
```

to:

```
| 7 | backend | Sponsor Matching, one entry per direct sponsee | 5 | planned | `docs/superpowers/plans/2026-08-11-cycle-sponsor-matching.md` | — |
```

Also update the "Next pending unit" note and the "Note for the next unit's plan" note at the bottom of that file to reflect that unit 7 now has a plan (constructor is still 7 args, unchanged by this unit — unlike units 5/6 which each added one), and that unit 8 (Royalty) is next in the insertion sequence (depends on 5 and 6, both merged; the insertion point for unit 8 is immediately after `creditSponsorMatching(...)`, before the `CLOSED` flip, per this unit's own boundary-marker comment). Leave the exact wording to match the file's existing style.

- [ ] **Step 3: Commit the bookkeeping update**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add docs/superpowers/plans/2026-08-03-cycle-management-units.md
git commit -m "docs: mark cycle-management unit 7 planned, persist its plan file"
```

---

## Self-review notes (from writing this plan)

- **Spec coverage**: Decision #9 (one entry per direct sponsee, itemized; `sourceRef` = sponsee's Matching entry id; grossAmount from gross never net; `findBySponsorId` new method) — Tasks 1, 3. Decision #10 (deduction math, shared `planVersion` resolved once per batch) — Task 3 Global Constraints + Step 5. Decision #11 (KYC-gating on the credited associate — here, the sponsor) — Task 3's dedicated test. Decision #12 (idempotency check before every write) — Task 3's dedicated test. Decision #7's "Matching and Sponsor Matching... apply to Admin in full" — Task 3's Admin-as-sponsor test, explicitly proving no role guard exists (contrast with unit 6's `role == ASSOCIATE` guard, deliberately absent here). Flow step 5's "second pass, requires step 3 complete tree-wide" — Task 3 Step 5's insertion point (after `advanceRanks`, i.e. after step 3's `creditMatchingIncome` and step 4's rank advancement) plus Task 4's integration test, which is the one artifact that actually proves "complete tree-wide" data is visible to this second pass within the same transaction. The task's own explicit instruction to decide and justify the in-memory-vs-fresh-query tradeoff — Global Constraints' dedicated writeup plus Task 4's proof. The task's own explicit instruction to leave a clear boundary marker for the next unit — Task 3 Step 5's comment plus the pre-existing "Flow step 8" comment immediately after, unchanged, matching how units 5/6 left theirs.
- **Placeholder scan**: no TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency**: `creditSponsorMatching(UUID cycleId, List<Associate> associates, CompensationPlanVersion planVersion): void` — same signature at its definition (Task 3 Step 5) and its one call site in `close()` (Task 3 Step 5). `AssociateRepository.findBySponsorId(UUID): List<Associate>` matches between Task 1's repository declaration and Task 3's `creditSponsorMatching` call. `LedgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(UUID, UUID, IncomeType): Optional<LedgerEntry>` matches between Task 2's repository declaration, Task 3's `creditSponsorMatching` call, and Task 4's integration-test call. `CycleService`'s constructor stays at the 7-arg signature established by unit 6 — no test call site needed updating in this plan, since no new dependency was introduced (confirmed against the actual current `CycleService.java` and `CycleServiceTest.java` before writing this plan, not assumed from the spec's prose alone).
