# Sales — Void Happy Path (Unit 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /api/admin/sales/{id}/void` actually reverse a `RECORDED` sale: flip `Sale.status` to `VOIDED` with the given reason, flip the linked `Plot` back to `AVAILABLE`, and flip the linked Direct Income `LedgerEntry` to `REVERSED` — all inside one transaction, all-or-nothing.

**Architecture:** `SaleService.voidSale(UUID id, VoidSaleRequest request)` currently ends in a placeholder `throw` after Sales unit 4's two guards (sale exists, not already voided). This plan replaces only that placeholder with flow steps 3-6 from the source spec. A new `LedgerEntryRepository.findBySourceRef(UUID)` query locates the `LedgerEntry` a `RECORDED` sale created at record time (`sourceRef = sale.id`, set by `SaleService.recordSale`). No migration, no new constructor dependency, no `SaleResponse` change — `void_reason`/`source_ref` columns, `LedgerEntryStatus.REVERSED`, and `SaleResponse.status()`/`voidReason()` all already exist from earlier units.

**Tech Stack:** Spring Boot (constructor injection, `@Transactional`), Spring Data JPA, JUnit 5 + Mockito (`@ExtendWith(MockitoExtension.class)`) for `SaleServiceTest`, `@DataJpaTest` + H2 for `LedgerEntryRepositoryTest`, MockMvc + real JWT for `SaleControllerTest`.

## Global Constraints

- Endpoint: `POST /api/admin/sales/{id}/void`, ADMIN-only (already wired, Sales unit 4) — this unit only changes `SaleService.voidSale(...)`'s body and adds one repository query. No controller, security, or exception-handler changes.
- This unit implements ONLY flow steps 3-6 (source spec lines 69-72): `Sale` → `VOIDED` + `voidReason`, `Plot` → `AVAILABLE`, `LedgerEntry` → `REVERSED`, return `SaleResponse` (200). Steps 1-2 (404/409 guards) are already merged (Sales unit 4) and must not change — same guard order, same `voidSale(UUID id, VoidSaleRequest request)` signature.
- `Sale` save, `Plot` save, and `LedgerEntry` save must be atomic (all three or none) — `SaleService.voidSale(...)` gets `@Transactional`, matching `recordSale(...)`'s precedent for multi-entity-write services in this codebase (`org.springframework.transaction.annotation.Transactional` is already imported in `SaleService.java`, no new import needed).
- No request-layer validation is added for a blank/missing `reason` in this unit. The source spec's flow (lines 69-72) lists exactly steps 3-6 with no reason-blank guard, and the error-handling table (lines 100-106) lists no corresponding exception/400 status. The Data model note ("`void_reason` ... required by the API when voiding, not by the DB constraint," line 44) describes intent, not a step in this endpoint's own flow — Sales unit 4 already left `VoidSaleRequest.reason` unvalidated at the bean-annotation level for this reason, and this unit does not add service-layer validation either (unlike `KycReviewService`'s conditional-reason check, which the spec explicitly cites as the *mirrored pattern*, not as a requirement copied into this endpoint). If a future unit decides blank-reason rejection belongs on this endpoint, that is a new, separately-spec'd requirement, not an oversight here.
- No row lock is added on `Plot` or `Sale` inside `voidSale(...)`, unlike `recordSale(...)`'s `PlotRepository.findByIdForUpdate`. Reasoning: (1) the Sales-unit-4-merged guard already reads `Sale` via a plain unlocked `saleRepository.findById(id)` — changing that read to acquire a lock would be a change to unit 4's already-merged guard code, out of scope per this unit's brief; (2) unlike `recordSale`'s double-sell race (two concurrent requests both crediting Direct Income — a real financial double-count bug, fixed via `PlotRepository.findByIdForUpdate` per commit `bcf5008` after a post-merge code review), a double-void race here is not a double-reversal-of-money bug: both concurrent callers would set `Sale.status = VOIDED`, `Plot.status = AVAILABLE`, and `LedgerEntry.status = REVERSED` to the *same* end values — redundant writes, not corrupted state. This mirrors the codebase's established convention (see `PlotRepository.findByIdForUpdate`'s own comment) that row-lock fixes for finding races land as a separate, targeted follow-up once a reviewer identifies a concrete corruption risk, not preemptively on every multi-write service method. If a future code review identifies a concrete problem with the unlocked read here, it is a candidate for the same kind of follow-up fix `recordSale` got.
- Missing `Plot` or `LedgerEntry` rows for a `RECORDED` sale being voided are data-integrity problems, not valid business outcomes — both `plot_id` and the record-time `LedgerEntry` creation are protected by a NOT NULL FK (`plot_id`) and `recordSale`'s own transactional guarantee (it always creates exactly one `LedgerEntry` in the same transaction as the `Sale`). This plan throws `IllegalStateException` in both cases, following the exact convention `recordSale`'s missing-`CompensationPlanVersion` case already established (`backend/src/main/java/com/plotchain/sales/SaleService.java`, `recordSale`) — not a new convention invented for this unit.
- Entity mutations in this unit use plain setters + explicit `.save(...)` calls, not partial updates — matches `recordSale`'s style exactly (`sale.setStatus(...)`, `plotRepository.save(plot)`, etc.).
- `LedgerEntryRepository.findBySourceRef(UUID)` is additive-only to a repository shared with the not-yet-built cycle-management units 7/8/9 — no restructuring of `LedgerEntryRepository` or `LedgerEntryStatus` beyond adding this one query.

---

### Task 1: `LedgerEntryRepository.findBySourceRef(UUID)`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Modify: `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`

**Interfaces:**
- Consumes: `LedgerEntry` entity (existing, `backend/src/main/java/com/plotchain/income/LedgerEntry.java`) — `getSourceRef()`/`setSourceRef(UUID)`, `getId()`, `getStatus()`/`setStatus(LedgerEntryStatus)`, already used by `recordSale`.
- Produces: `LedgerEntryRepository.findBySourceRef(UUID sourceRef)` returns `Optional<LedgerEntry>`. Task 2 uses this to locate the `LedgerEntry` a voided sale's `recordSale` call created.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`, immediately before the final closing `}` of the class (after `notNullConstraintRejectsANullSourceRef`):

```java
    // Sales unit 5 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", step 5): SaleService.voidSale needs to find the DIRECT LedgerEntry a
    // RECORDED sale created at record time (sourceRef = sale.id) so it can flip it to REVERSED.
    @Test
    void findBySourceRefReturnsTheMatchingEntry() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        UUID sourceRef = UUID.randomUUID();
        LedgerEntry saved = ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), cycle.getId(), IncomeType.DIRECT, sourceRef));

        Optional<LedgerEntry> found = ledgerEntryRepository.findBySourceRef(sourceRef);

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(saved.getId());
    }

    @Test
    void findBySourceRefReturnsEmptyWhenNoEntryMatches() {
        assertThat(ledgerEntryRepository.findBySourceRef(UUID.randomUUID())).isEmpty();
    }
```

Add one new import at the top of `LedgerEntryRepositoryTest.java`, alongside the existing `java.util.UUID` import:

```java
import java.util.Optional;
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=LedgerEntryRepositoryTest test`
Expected: FAIL to compile — `LedgerEntryRepository.findBySourceRef(UUID)` does not exist yet.

- [ ] **Step 3: Add `findBySourceRef` to `LedgerEntryRepository.java`**

Edit `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`. Add one import and one method, alongside the existing `existsByAssociateIdAndCycleIdAndIncomeTypeAndSourceRef` at the bottom of the interface:

```java
import java.util.Optional;
```

```java
    // Sales unit 5 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", step 5): looks up the DIRECT LedgerEntry a RECORDED sale created at
    // record time (sourceRef = sale.id, set by SaleService.recordSale), so SaleService.voidSale
    // can flip its status to REVERSED. Only DIRECT entries set sourceRef today (V16__sale.sql),
    // and recordSale creates exactly one LedgerEntry per Sale in the same transaction as the
    // Sale row, so a plain single-result derived query is safe. If a future income type
    // (matching, sponsor, reward -- all still unbuilt) ever also sets sourceRef to a sale id for
    // a *different* associate/cycle, this query would need revisiting to disambiguate by
    // incomeType too, but that's out of scope for this unit.
    Optional<LedgerEntry> findBySourceRef(UUID sourceRef);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=LedgerEntryRepositoryTest test`
Expected: PASS — all `LedgerEntryRepositoryTest` tests, including the two new ones, green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java \
        backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java
git commit -m "feat(income): add LedgerEntryRepository.findBySourceRef(UUID)"
```

---

### Task 2: Implement the void happy path (flow steps 3-6) in `SaleService`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `LedgerEntryRepository.findBySourceRef(UUID)` (Task 1) — returns `Optional<LedgerEntry>`. `Sale` setters — `setStatus(SaleStatus)`, `setVoidReason(String)` (both existing, `backend/src/main/java/com/plotchain/sales/Sale.java`). `Plot` setter — `setStatus(PlotStatus)` (existing, `backend/src/main/java/com/plotchain/projects/Plot.java`). `LedgerEntry` setter — `setStatus(LedgerEntryStatus)` (existing). `PlotRepository.findById(UUID)` (inherited from `JpaRepository`, already available on the existing `plotRepository` field — no repository change needed).
- Produces: `SaleService.voidSale(UUID id, VoidSaleRequest request)` now returns a fully-populated `SaleResponse` with `status = "VOIDED"` and `voidReason` set, on success (200 via the existing `SaleController`), or throws `IllegalStateException` if the sale's `Plot` or `LedgerEntry` row is missing (data-integrity cases). Task 3 verifies this through the controller layer.

This task removes the now-obsolete placeholder test `voidSaleReachesThePlaceholderWhenGuardsPass` (its assertion — that all-guards-pass reaches an `UnsupportedOperationException` — is no longer true once this task lands) and replaces it with real happy-path and data-integrity-edge-case tests. The two existing guard tests (`voidSaleThrowsSaleNotFoundExceptionWhenTheSaleDoesNotExist`, `voidSaleThrowsSaleAlreadyVoidedExceptionWhenTheSaleIsAlreadyVoided`) are untouched — Sales unit 4's guard behavior does not change.

- [ ] **Step 1: Write the failing tests**

In `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`, first **remove** the obsolete placeholder test:

```java
    @Test
    void voidSaleReachesThePlaceholderWhenGuardsPass() {
        UUID saleId = UUID.randomUUID();
        Sale recordedSale = new Sale();
        recordedSale.setId(saleId);
        recordedSale.setStatus(SaleStatus.RECORDED);
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(recordedSale));

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(UnsupportedOperationException.class);

        verify(saleRepository, never()).save(any());
        verify(plotRepository, never()).save(any());
        verify(ledgerEntryRepository, never()).save(any());
    }
```

Then add these helpers and tests immediately after the two remaining guard tests (`voidSaleThrowsSaleNotFoundExceptionWhenTheSaleDoesNotExist`, `voidSaleThrowsSaleAlreadyVoidedExceptionWhenTheSaleIsAlreadyVoided`), before the final closing `}` of the class:

```java
    // Sales unit 5 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", steps 3-6): happy-path reversal tests.
    private Sale recordedSale(UUID saleId, UUID plotId) {
        Sale sale = new Sale();
        sale.setId(saleId);
        sale.setPlotId(plotId);
        sale.setAssociateId(ASSOCIATE_ID);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(new BigDecimal("600000.00"));
        sale.setCycleId(CYCLE_ID);
        sale.setLegCredited("L");
        sale.setStatus(SaleStatus.RECORDED);
        sale.setRecordedAt(Instant.now());
        return sale;
    }

    private LedgerEntry pendingLedgerEntry(UUID sourceRef) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setIncomeType(IncomeType.DIRECT);
        entry.setAssociateId(ASSOCIATE_ID);
        entry.setCycleId(CYCLE_ID);
        entry.setGrossAmount(new BigDecimal("60000"));
        entry.setTdsDeduction(new BigDecimal("3000"));
        entry.setAdminDeduction(new BigDecimal("2400"));
        entry.setNetAmount(new BigDecimal("54600"));
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setSourceRef(sourceRef);
        entry.setCreatedAt(Instant.now());
        return entry;
    }

    private void stubVoidHappyPath(Sale sale, LedgerEntry ledgerEntry) {
        when(saleRepository.findById(sale.getId())).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(sale.getPlotId())).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));
        when(plotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findBySourceRef(sale.getId())).thenReturn(Optional.of(ledgerEntry));
        when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void voidSaleFlipsSaleToVoidedAndStampsTheVoidReason() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        ArgumentCaptor<Sale> captor = ArgumentCaptor.forClass(Sale.class);
        verify(saleRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(SaleStatus.VOIDED);
        assertThat(captor.getValue().getVoidReason()).isEqualTo("Buyer backed out");
    }

    @Test
    void voidSaleFlipsThePlotBackToAvailable() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        ArgumentCaptor<Plot> captor = ArgumentCaptor.forClass(Plot.class);
        verify(plotRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(PlotStatus.AVAILABLE);
    }

    @Test
    void voidSaleReversesTheLinkedLedgerEntry() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        verify(ledgerEntryRepository).findBySourceRef(saleId);
        ArgumentCaptor<LedgerEntry> captor = ArgumentCaptor.forClass(LedgerEntry.class);
        verify(ledgerEntryRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(LedgerEntryStatus.REVERSED);
        assertThat(captor.getValue().getSourceRef()).isEqualTo(saleId);
    }

    @Test
    void voidSaleReturnsAFullyPopulatedSaleResponseReflectingTheReversal() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        stubVoidHappyPath(sale, pendingLedgerEntry(saleId));

        SaleResponse response = saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out"));

        assertThat(response.id()).isEqualTo(saleId);
        assertThat(response.plotId()).isEqualTo(PLOT_ID);
        assertThat(response.status()).isEqualTo("VOIDED");
        assertThat(response.voidReason()).isEqualTo("Buyer backed out");
    }

    @Test
    void voidSaleThrowsIllegalStateExceptionWhenThePlotRowIsMissing() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(IllegalStateException.class);

        verify(ledgerEntryRepository, never()).save(any());
    }

    @Test
    void voidSaleThrowsIllegalStateExceptionWhenTheLedgerEntryRowIsMissing() {
        UUID saleId = UUID.randomUUID();
        Sale sale = recordedSale(saleId, PLOT_ID);
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(sale));
        when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(plotRepository.findById(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.SOLD)));
        when(plotRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(ledgerEntryRepository.findBySourceRef(saleId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(IllegalStateException.class);

        verify(ledgerEntryRepository, never()).save(any());
    }
```

No new imports are needed — `Sale`, `SaleStatus`, `SaleResponse`, `VoidSaleRequest`, `Plot`, `PlotStatus`, `LedgerEntry`, `LedgerEntryStatus`, `IncomeType`, `ArgumentCaptor`, `BigDecimal`, `Instant`, `Optional`, `UUID`, `assertThat`, `assertThatThrownBy`, `any`, `never`, `verify`, `when` are all already imported in this file (from Sales units 3/4).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=SaleServiceTest test`
Expected: FAIL — the six new tests fail because `voidSale(...)` still throws `UnsupportedOperationException` instead of doing the real work; the removed placeholder test's absence means no failure there.

- [ ] **Step 3: Implement the happy-path logic in `SaleService.voidSale(...)`**

Replace the placeholder block in `backend/src/main/java/com/plotchain/sales/SaleService.java` — everything from the comment above `voidSale` through the closing `throw` and its enclosing `}` — with:

```java
    // Sales unit 4 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", steps 1-2): guards. Sales unit 5 (same doc, flow steps 3-6): the
    // Sale->VOIDED flip, voidReason assignment, Plot->AVAILABLE flip, and LedgerEntry reversal,
    // inserted between the already-voided guard and the response mapping below, all inside one
    // transaction.
    @Transactional
    public SaleResponse voidSale(UUID id, VoidSaleRequest request) {
        Sale sale = saleRepository.findById(id)
            .orElseThrow(() -> new SaleNotFoundException(id));

        if (sale.getStatus() == SaleStatus.VOIDED) {
            throw new SaleAlreadyVoidedException(id);
        }

        // Flow step 3: Sale -> VOIDED, stamp the reason (Decision 6: a reversal, not a delete
        // or edit -- the Sale row is never removed).
        sale.setStatus(SaleStatus.VOIDED);
        sale.setVoidReason(request.reason());
        sale = saleRepository.save(sale);

        // Flow step 4: Plot -> AVAILABLE, undoing the SOLD flip recordSale made (Decision 1).
        // A missing Plot row here is a data-integrity problem, not a valid outcome -- plot_id
        // has a NOT NULL FK constraint (V16__sale.sql), so every Sale always references a real
        // Plot row.
        Plot plot = plotRepository.findById(sale.getPlotId())
            .orElseThrow(() -> new IllegalStateException(
                "plot row missing for sale " + sale.getId() + " - plot_id has a NOT NULL FK constraint"));
        plot.setStatus(PlotStatus.AVAILABLE);
        plotRepository.save(plot);

        // Flow step 5: reverse the Direct Income ledger entry this sale created at record time
        // (Decision 6). Same data-integrity reasoning as the missing-Plot case above --
        // recordSale always creates exactly one LedgerEntry per Sale, in the same transaction.
        LedgerEntry ledgerEntry = ledgerEntryRepository.findBySourceRef(sale.getId())
            .orElseThrow(() -> new IllegalStateException(
                "ledger_entry row missing for sale " + sale.getId()
                    + " - recordSale always creates one in the same transaction"));
        ledgerEntry.setStatus(LedgerEntryStatus.REVERSED);
        ledgerEntryRepository.save(ledgerEntry);

        // Flow step 6.
        return toResponse(sale);
    }
```

No new imports are needed — `Plot`, `PlotStatus`, `LedgerEntry`, `LedgerEntryStatus`, `Transactional`, `UUID` are all already imported in `SaleService.java` (from `recordSale`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=SaleServiceTest test`
Expected: PASS — all `SaleServiceTest` tests (the two unchanged guard tests plus the six new happy-path/edge-case tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleService.java \
        backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): implement void-sale happy path — Sale/Plot/LedgerEntry reversal"
```

---

### Task 3: `SaleControllerTest` — 200 + reversal on void

**Files:**
- Modify: `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`

**Interfaces:**
- Consumes: `SaleResponse` record (existing) and `SaleController.voidSale(...)` (existing, unchanged — `POST /api/admin/sales/{id}/void` returns `200` via `ResponseEntity.ok(...)`, wired in Sales unit 4).
- Produces: nothing new for later units — this task is verification-only, confirming the controller/status-code layer correctly serializes a fully-populated, `VOIDED`-status `SaleResponse` from Task 2's service.

`SaleControllerTest` mocks `SaleService` via `@MockBean`, so this test doesn't exercise the real reversal logic from Task 2 — it only confirms the HTTP layer (status code, JSON shape) once `SaleService.voidSale(...)` can return a real `SaleResponse` instead of always throwing.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`, immediately after `voidReturns409WhenTheSaleIsAlreadyVoided` and before `voidIsForbiddenForAnAssociateToken`:

```java
    @Test
    void voidReturns200WithAFullyPopulatedSaleResponseReflectingTheReversal() throws Exception {
        UUID saleId = UUID.randomUUID();
        UUID plotId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        SaleResponse response = new SaleResponse(
            saleId, plotId, associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), cycleId, "L", "VOIDED", "Buyer backed out", Instant.now());
        when(saleService.voidSale(eq(saleId), any(VoidSaleRequest.class))).thenReturn(response);

        mockMvc.perform(post("/api/admin/sales/{id}/void", saleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(saleId.toString()))
            .andExpect(jsonPath("$.status").value("VOIDED"))
            .andExpect(jsonPath("$.voidReason").value("Buyer backed out"));
    }
```

No new imports are needed — `BigDecimal`, `Instant`, `eq`, `any`, `jsonPath`, `status`, `post` are all already imported in this file (from the `record` tests and the existing void guard tests).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn -q -Dtest=SaleControllerTest test`
Expected: This test should actually PASS immediately once Task 2 has landed, since `SaleController.voidSale(...)` and `SaleResponse` both already exist unchanged from Sales unit 4. Run it anyway to confirm — if it fails, the failure diagnoses a real gap in the controller/serialization layer, not a missing-implementation gap.

- [ ] **Step 3: Run the full `SaleControllerTest` suite to confirm nothing regressed**

Run: `cd backend && mvn -q -Dtest=SaleControllerTest test`
Expected: PASS — all tests in the class, including the new one.

- [ ] **Step 4: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS — no regressions in any other test class (in particular `SaleServiceTest`, `LedgerEntryRepositoryTest`, `SecurityConfigTest`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/test/java/com/plotchain/sales/SaleControllerTest.java
git commit -m "test(sales): verify POST /api/admin/sales/{id}/void returns 200 with a reversed SaleResponse"
```

---

## Self-review notes (for the plan author, not a task to execute)

- **Spec coverage:** Flow step 3 (`Sale` → `VOIDED` + `voidReason`) is implemented in Task 2 and asserted by `voidSaleFlipsSaleToVoidedAndStampsTheVoidReason`. Step 4 (`Plot` → `AVAILABLE`) is implemented in Task 2 and asserted by `voidSaleFlipsThePlotBackToAvailable`. Step 5 (`LedgerEntry` → `REVERSED` via the new `findBySourceRef`) is implemented across Task 1 (the query) and Task 2 (the call site), asserted by `voidSaleReversesTheLinkedLedgerEntry` and Task 1's own repository tests. Step 6 (200 response) is asserted by `voidSaleReturnsAFullyPopulatedSaleResponseReflectingTheReversal` (service level) and Task 3's controller test (200 + reversal, matching the spec's own Testing section wording verbatim). Decision 6 (reversal, not delete/edit — neither row removed) is called out in code comments and structurally true (every mutation is a setter + save, never a delete). The Data model's "required by the API when voiding" note is explicitly addressed as a deliberate non-requirement for this unit, with reasoning, in Global Constraints — not silently ignored.
- **Out-of-scope guardrails respected:** No change to Sales unit 4's guard order, `voidSale`'s signature, `SecurityConfig`, `SalesExceptionHandler`, or the admin register/associate-own-view endpoints (units 6/7) — this plan touches only `SaleService.voidSale(...)`'s body, one new `LedgerEntryRepository` query, and their tests.
- **Placeholder scan:** no TBD/TODO; every step has literal code, not a description of code.
- **Type consistency:** `LedgerEntryRepository.findBySourceRef(UUID)` (Task 1) returns `Optional<LedgerEntry>` — exactly the type Task 2's `voidSale(...)` calls `.orElseThrow(...)` on and Task 2's tests stub via `when(ledgerEntryRepository.findBySourceRef(...)).thenReturn(Optional.of(...))`/`Optional.empty()`. `SaleResponse`'s existing 12-arg constructor order (`id, plotId, associateId, buyerName, buyerPhone, buyerEmail, amount, cycleId, legCredited, status, voidReason, recordedAt`) matches exactly between `toResponse(...)` (unchanged) and Task 3's manual `SaleResponse` construction in the controller test.
