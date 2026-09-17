# e-PIN Redeem Happy Path (epin-domain unit 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For an `UNUSED` `EPin` with a resolvable `associateId`, `POST /api/admin/epins/{id}/redeem` marks it `USED`, records who redeemed it for whom and when, and returns the populated `EPinResponse` with 200 — completing the redeem flow that epin-domain unit 3 left as a guards-only placeholder.

**Architecture:** Replaces the final `throw new UnsupportedOperationException(...)` placeholder branch in the existing `EPinService.redeem(UUID id, RedeemEPinRequest request, UUID actorId)` — added by epin-domain unit 3 — with the real write: set `status`/`redeemedTo`/`redeemedBy`/`redeemedAt`/`redemptionType`/`linkedEntityId` on the already-loaded `EPin`, save it, and return it through the same `toResponse(EPin)` helper `list(...)` already uses. No new files, no new types, no signature change, no controller or `SecurityConfig` change — `EPinController.redeem(...)` already returns `ResponseEntity.ok(epinService.redeem(...))` and the ADMIN-only matcher is already in place from unit 3.

**Tech Stack:** Spring Boot (Java), Spring Data JPA, JUnit 5 + Mockito (service tests), MockMvc + real JWT + real Spring Security filter chain (controller tests), H2 in-memory DB for `@SpringBootTest` tests.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md` (Decisions 5, 6, 7, 8; Flows "Redeem" steps 4-5; Testing). Unit detail: `docs/superpowers/plans/2026-08-03-epin-units.md`, unit 4.

## Global Constraints

- This unit touches only the final branch of `EPinService.redeem(...)` — the three guard checks above it (EPin 404, already-used 409, Associate 404), added by epin-domain unit 3, are NOT modified, and their existing tests (`redeemThrowsEPinNotFoundExceptionWhenTheEPinDoesNotExist`, `redeemThrowsEPinAlreadyRedeemedExceptionWhenTheEPinIsAlreadyUsed`, `redeemThrowsAssociateNotFoundExceptionWhenTheAssociateIdDoesNotResolve` in `EPinServiceTest`, and their `EPinControllerTest`/`SecurityConfigTest` counterparts) are NOT modified.
- `EPinService.redeem(UUID id, RedeemEPinRequest request, UUID actorId)`'s signature does not change.
- On success: `status = USED`, `redeemedTo = request.associateId()`, `redeemedBy = actorId`, `redeemedAt = Instant.now()`, `redemptionType = request.redemptionType()`, `linkedEntityId = request.linkedEntityId()`; save via `epinRepository.save(epin)`; return `EPinResponse` (spec Flows "Redeem" steps 4-5).
- No side effect on the `Associate` row for either `RedemptionType` — `activation_fee_paid` does not exist on the `Associate` entity and nothing in this unit adds it (spec Decision 8, Resolved decisions #2). No `associateRepository.save(...)` call anywhere in this unit's code.
- `redemptionType` is already a closed enum (`ACTIVATION`/`TOPUP`) with `@NotNull` on `RedeemEPinRequest.redemptionType` (spec Decision 6) — this unit adds no additional validation for it.
- `linkedEntityId` is already nullable with no FK constraint and no bean validation on `RedeemEPinRequest.linkedEntityId` (spec Decision 7) — this unit adds no server-side rule requiring it to be null for `ACTIVATION`; that's expected caller behavior, not an enforced constraint, and the spec's Error handling table lists no such rule.
- No "allocated but not yet redeemed" intermediate state is introduced — generation and redemption remain the only two lifecycle events (spec Decision 5). Nothing in this unit adds a new `EPinStatus` value or a new entity.
- No migration, no new entity/repository/DTO/exception/controller/security-matcher — every column and type this unit writes to (`EPin.status`/`redeemedTo`/`redeemedBy`/`redeemedAt`/`redemptionType`/`linkedEntityId`) and every type it reuses (`RedeemEPinRequest`, `EPinResponse`, `EPinNotFoundException`, `EPinAlreadyRedeemedException`, `AssociateNotFoundException`) already exists (units 1-3).
- Backend-only — no frontend/screen files are touched (screen unit 6 is separate and out of scope here).

---

### Task 1: `EPinService.redeem()` happy-path write

**Files:**
- Modify: `backend/src/main/java/com/plotchain/epin/EPinService.java:66-89` (replace the placeholder comment + `throw` in `redeem(...)` with the real write; the method's imports, signature, and the three guard checks above it are unchanged)
- Test: `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java` (replace `redeemReachesThePlaceholderWhenAllGuardsPass`, lines 201-216, with two real happy-path tests; the four other `redeem*` tests above it — the three guard tests plus nothing else — are untouched)

**Interfaces:**
- Consumes: `EPin.setStatus(EPinStatus)`, `.setRedeemedTo(UUID)`, `.setRedeemedBy(UUID)`, `.setRedeemedAt(Instant)`, `.setRedemptionType(RedemptionType)`, `.setLinkedEntityId(UUID)` (all existing setters, unit 2). `EPinRepository.save(EPin)` (inherited from `JpaRepository`, already used by `generateBatch`). The private `toResponse(EPin epin)` helper already defined at the bottom of `EPinService.java` (already used by `list(...)`).
- Produces: `EPinService.redeem(UUID id, RedeemEPinRequest request, UUID actorId)` now returns a fully-populated `EPinResponse` on success instead of throwing `UnsupportedOperationException`. Task 2 (controller test) and the future screen unit 6 consume this.

- [ ] **Step 1: Replace the placeholder-proving test with real happy-path tests**

In `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java`, delete `redeemReachesThePlaceholderWhenAllGuardsPass` (lines 201-216) and replace it with:

```java
    // epin-domain unit 4 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 4-5; Decisions 5, 6, 7, 8): the happy-path write, once all three
    // guards (unit 3) pass. redeemedTo/redeemedBy/redeemedAt/redemptionType/linkedEntityId are
    // all asserted on both the saved entity and the returned response; the Associate row is
    // never written to, for either RedemptionType (Decision 8).
    @Test
    void redeemSetsStatusUsedAndAllRedemptionFieldsAndSavesForAnActivationRedemption() {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(new Associate()));
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EPinResponse response = epinService.redeem(epinId,
            new RedeemEPinRequest(associateId, RedemptionType.ACTIVATION, null), actorId);

        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        verify(epinRepository).save(captor.capture());
        EPin saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(EPinStatus.USED);
        assertThat(saved.getRedeemedTo()).isEqualTo(associateId);
        assertThat(saved.getRedeemedBy()).isEqualTo(actorId);
        assertThat(saved.getRedeemedAt()).isNotNull();
        assertThat(saved.getRedemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(saved.getLinkedEntityId()).isNull();

        assertThat(response.status()).isEqualTo(EPinStatus.USED);
        assertThat(response.redeemedTo()).isEqualTo(associateId);
        assertThat(response.redeemedBy()).isEqualTo(actorId);
        assertThat(response.redeemedAt()).isNotNull();
        assertThat(response.redemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(response.linkedEntityId()).isNull();

        verify(associateRepository, never()).save(any());
    }

    @Test
    void redeemSetsLinkedEntityIdForATopupRedemptionAndNeverWritesTheAssociateRow() {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID linkedEntityId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(new Associate()));
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        EPinResponse response = epinService.redeem(epinId,
            new RedeemEPinRequest(associateId, RedemptionType.TOPUP, linkedEntityId), actorId);

        ArgumentCaptor<EPin> captor = ArgumentCaptor.forClass(EPin.class);
        verify(epinRepository).save(captor.capture());
        assertThat(captor.getValue().getRedemptionType()).isEqualTo(RedemptionType.TOPUP);
        assertThat(captor.getValue().getLinkedEntityId()).isEqualTo(linkedEntityId);

        assertThat(response.redemptionType()).isEqualTo(RedemptionType.TOPUP);
        assertThat(response.linkedEntityId()).isEqualTo(linkedEntityId);

        verify(associateRepository, never()).save(any());
    }
```

No new imports are needed — `Associate`, `ArgumentCaptor`, `Optional`, `any`, `never`, `verify`, `when`, `assertThat` are all already imported in this file (used by the existing `generateBatch*`/`redeemThrows*` tests above).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=EPinServiceTest test`
Expected: FAIL — both new tests throw `UnsupportedOperationException` (the placeholder is still in place), not the assertions they expect.

- [ ] **Step 3: Replace the placeholder in `EPinService.redeem(...)`**

In `backend/src/main/java/com/plotchain/epin/EPinService.java`, replace the comment block above `redeem(...)` (lines 66-72) and the method body (lines 73-89) — from:

```java
    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 1-3): guards only. epin-domain unit 4 inserts the happy-path
    // status/redeemedTo/redeemedBy/redeemedAt/redemptionType/linkedEntityId writes and
    // epinRepository.save between the associate-lookup guard below and the placeholder throw --
    // sequentially, without changing this method's signature -- following the same guard-only
    // convention SaleService.voidSale's Sales unit 4 established
    // (docs/superpowers/plans/2026-08-10-sales-void-guards.md).
    public EPinResponse redeem(UUID id, RedeemEPinRequest request, UUID actorId) {
        EPin epin = epinRepository.findById(id)
            .orElseThrow(() -> new EPinNotFoundException(id));

        if (epin.getStatus() == EPinStatus.USED) {
            throw new EPinAlreadyRedeemedException(id);
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Placeholder: epin-domain unit 4 replaces this line with the status/redeemedTo/
        // redeemedBy/redeemedAt/redemptionType/linkedEntityId writes and epinRepository.save
        // (spec flow steps 4-5).
        throw new UnsupportedOperationException(
            "e-PIN redeem happy path is not yet implemented (epin-domain unit 4)");
    }
```

to:

```java
    // epin-domain unit 4 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 4-5; Decisions 5, 6, 7, 8): once all three guards (unit 3) pass, this
    // is the only write in the redeem flow -- generation and redemption remain the sole two
    // lifecycle events (Decision 5), so there's no separate "allocate" step to also perform. No
    // write to the Associate row for either RedemptionType (Decision 8) -- activation_fee_paid
    // does not exist on the entity and nothing here adds it. toResponse(...) below is the same
    // helper list(...) already uses.
    public EPinResponse redeem(UUID id, RedeemEPinRequest request, UUID actorId) {
        EPin epin = epinRepository.findById(id)
            .orElseThrow(() -> new EPinNotFoundException(id));

        if (epin.getStatus() == EPinStatus.USED) {
            throw new EPinAlreadyRedeemedException(id);
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        epin.setStatus(EPinStatus.USED);
        epin.setRedeemedTo(request.associateId());
        epin.setRedeemedBy(actorId);
        epin.setRedeemedAt(Instant.now());
        epin.setRedemptionType(request.redemptionType());
        epin.setLinkedEntityId(request.linkedEntityId());
        epinRepository.save(epin);

        return toResponse(epin);
    }
```

No new import is needed — `java.time.Instant` is already imported in `EPinService.java` (used by `generateBatch`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=EPinServiceTest test`
Expected: PASS — all `EPinServiceTest` tests, including the two new ones, green; the three existing guard tests (`redeemThrowsEPinNotFoundExceptionWhenTheEPinDoesNotExist`, `redeemThrowsEPinAlreadyRedeemedExceptionWhenTheEPinIsAlreadyUsed`, `redeemThrowsAssociateNotFoundExceptionWhenTheAssociateIdDoesNotResolve`) remain green, unmodified.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/epin/EPinService.java \
        backend/src/test/java/com/plotchain/epin/EPinServiceTest.java
git commit -m "feat(epin): implement EPinService.redeem() happy-path write"
```

---

### Task 2: `EPinControllerTest` happy-path coverage

**Files:**
- Test: `backend/src/test/java/com/plotchain/epin/EPinControllerTest.java` (add one new test after `redeemIsForbiddenForAnAssociateToken`, the last test in the class; no production code changes — `EPinController.redeem(...)` and `EPinExceptionHandler` are unmodified from unit 3)

**Interfaces:**
- Consumes: `EPinService.redeem(...)`'s happy-path return from Task 1, reached through the already-wired `POST /api/admin/epins/{id}/redeem` endpoint (unit 3) and the already-ADMIN-only `SecurityConfig` matcher (unit 3).
- Produces: nothing consumed by a later unit — this locks in the 200 response shape end-to-end for the future screen unit (6) to build against.

- [ ] **Step 1: Write the test**

Add to `backend/src/test/java/com/plotchain/epin/EPinControllerTest.java`, immediately before the final closing `}` of the class (after `redeemIsForbiddenForAnAssociateToken`):

```java
    // epin-domain unit 4 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 4-5): the happy path, now that EPinService.redeem no longer ends in
    // a placeholder throw (Task 1 of this unit's plan).
    @Test
    void redeemReturns200WithThePopulatedResponseForAnAdminToken() throws Exception {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID linkedEntityId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setCode("some-code");
        unusedEPin.setBatchId(UUID.randomUUID());
        unusedEPin.setStatus(EPinStatus.UNUSED);
        unusedEPin.setGeneratedBy(UUID.randomUUID());
        unusedEPin.setGeneratedAt(Instant.now());
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(new Associate()));
        when(epinRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(post("/api/admin/epins/{id}/redeem", epinId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"associateId\":\"" + associateId + "\",\"redemptionType\":\"TOPUP\",\"linkedEntityId\":\""
                    + linkedEntityId + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(epinId.toString()))
            .andExpect(jsonPath("$.status").value("USED"))
            .andExpect(jsonPath("$.redeemedTo").value(associateId.toString()))
            .andExpect(jsonPath("$.redeemedBy").isNotEmpty())
            .andExpect(jsonPath("$.redeemedAt").isNotEmpty())
            .andExpect(jsonPath("$.redemptionType").value("TOPUP"))
            .andExpect(jsonPath("$.linkedEntityId").value(linkedEntityId.toString()));

        verify(epinRepository).save(any());
    }
```

No new imports are needed — `Associate`, `Instant`, `Optional`, `UUID`, `any`, `verify`, `when`, `post`, `status`, `jsonPath`, `AssociateRole` are all already imported in this file (used by `generateBatchReturns201...`/`listReturns200WithFilters`/the existing `redeem*` guard tests).

- [ ] **Step 2: Run the test**

Run: `cd backend && mvn -q -Dtest=EPinControllerTest test`
Expected: PASS — this is a characterization test over Task 1's already-implemented behavior (no controller/security code changes needed in this task), so it should go green on the first run. If it doesn't, that diagnoses a real wiring gap between `EPinService.redeem(...)` and the controller/response serialization, not a missing-implementation gap — investigate before proceeding.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS — no regressions in any other test class (in particular `EPinServiceTest`, `EPinControllerTest`, `EPinRepositoryTest`, `EPinCodeGeneratorTest`, `SecurityConfigTest`).

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/epin/EPinControllerTest.java
git commit -m "test(epin): cover the redeem happy-path 200 response end to end"
```

---

## Self-review notes (for the plan author, not a task to execute)

- **Spec coverage:** Flow steps 4-5 (status/redeemedTo/redeemedBy/redeemedAt/redemptionType/linkedEntityId set, saved, `EPinResponse` 200) are implemented in Task 1 and asserted by both `EPinServiceTest`'s two new tests and `EPinControllerTest`'s new end-to-end test (Task 2). Decision 6 (closed `redemptionType` enum) is exercised by using both `ACTIVATION` and `TOPUP` across the two service tests and the controller test. Decision 7 (`linkedEntityId` nullable, no FK, expected null for `ACTIVATION`) is covered by the `ACTIVATION` test asserting `linkedEntityId` stays `null` when the caller passes `null`, and the `TOPUP` test/controller test asserting it round-trips when the caller supplies one — no server-side "must be null for ACTIVATION" rule is added, matching the spec's Error handling table (which lists no such rule). Decision 8 (no `Associate` side effect) is asserted directly via `verify(associateRepository, never()).save(any())` in both new service tests. Decision 5 (no intermediate state) requires no test — it's satisfied by there being no new `EPinStatus` value or entity anywhere in this plan.
- **Out-of-scope guardrails respected:** The three guard checks and their existing tests are untouched; `RedeemEPinRequest`, `EPinResponse`, `EPinNotFoundException`, `EPinAlreadyRedeemedException`, `EPinController`, `EPinExceptionHandler`, and `SecurityConfig` are all unmodified — this plan touches only `EPinService.redeem(...)`'s final branch and two test files.
- **Placeholder scan:** no TBD/TODO; every step has literal code. The old `UnsupportedOperationException` placeholder and its proving test (`redeemReachesThePlaceholderWhenAllGuardsPass`) are explicitly removed in Task 1, not left dangling.
- **Type consistency:** `EPinService.redeem(UUID id, RedeemEPinRequest request, UUID actorId)` keeps the exact same signature before and after Task 1. `toResponse(EPin epin)` (existing private helper) and `EPinResponse`'s field order (`id, code, batchId, status, generatedBy, generatedAt, redeemedTo, redeemedBy, redeemedAt, redemptionType, linkedEntityId`) are unchanged — Task 2's `jsonPath` assertions use exactly these field names, matching `EPinControllerTest`'s existing `listReturns200WithFilters` test's field names.
