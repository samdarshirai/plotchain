# Cycle Detail — Per-Income-Type Totals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/admin/cycles/{id}` (ADMIN-only) — a single cycle's summary fields plus a per-income-type net-total breakdown, the "monitor" half of cycle management's "trigger/monitor/re-run" admin capability.

**Architecture:** Extend the already-merged `cycle` package (unit 1's `GET /api/admin/cycles` list endpoint) with a sibling detail endpoint on the same `CycleController`/`CycleService`. `CycleService.getDetail(UUID)` looks up the `Cycle` by plain (unlocked) `findById`, then calls the two existing `LedgerEntryRepository` aggregate queries (`sumNetAmountByCycleAndType`, `sumNetAmountByCycle`) — no new queries, no new repository methods. Reuses the existing `CycleNotFoundException`/`CycleExceptionHandler` 404 wiring unit 3 already built for `POST /close`. Requires one new `SecurityConfig` matcher, since the existing `GET /api/admin/cycles` matcher is an *exact* path match and does not cover `/api/admin/cycles/{id}` as a prefix.

**Tech Stack:** Spring Boot (Spring MVC, Spring Data JPA), JUnit 5 + Mockito (service layer), MockMvc + real JWTs (controller/security layer), H2 in-memory DB for `@SpringBootTest` tests.

## Global Constraints

- ADMIN-only: `hasAuthority("ADMIN")`, not the `hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")` admin-family pattern most other admin GETs use — spec: "GET /api/admin/cycles/{id} — ADMIN-only", matching unit 1's list endpoint and unit 3's close endpoint, which are both already built to this same target-role-model convention (not the family pattern the role-capability spec is phasing out).
- Breakdown covers exactly `DIRECT, MATCHING, SPONSOR_MATCHING, ROYALTY, REWARD`, in that order — spec lines 95-97. `IncomeType.PERK` is excluded (per Decision #8 of the domain-design spec, it's descriptive metadata with no ledger entries of its own).
- Reuse `LedgerEntryRepository.sumNetAmountByCycleAndType` / `sumNetAmountByCycle` (both already exist, confirmed below) — spec: "no new query." Do not add a new repository method for this.
- 404 via the existing `CycleNotFoundException` (already used by `CycleService.close()` and wired into `CycleExceptionHandler`) — do not create a duplicate exception type.
- Fields on the detail response: same four as `CycleSummaryResponse` (`id`, `periodStart`, `periodEnd`, `status`) plus the breakdown and overall total — spec: "Same fields plus a per-income-type breakdown."

---

## Context confirmed by reading the code (do not re-derive, just use these facts)

- `CycleRepository extends JpaRepository<Cycle, UUID>` (`backend/src/main/java/com/plotchain/cycle/CycleRepository.java`) — plain `findById(UUID): Optional<Cycle>` is already available for free; no new repository method needed for the lookup. Unlike `close()`, this is a read-only view, so use plain `findById`, **not** `findByIdForUpdate` (the `FOR UPDATE` row lock exists solely to serialize concurrent close-writers, not for reads).
- `LedgerEntryRepository` (`backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`) already has:
  - `BigDecimal sumNetAmountByCycleAndType(UUID cycleId, IncomeType type)` — `COALESCE(SUM(...), 0)`, so it always returns a non-null `BigDecimal`, never `Optional`, never throws on zero rows.
  - `BigDecimal sumNetAmountByCycle(UUID cycleId)` — same `COALESCE` shape, cycle-wide.
- `IncomeType` (`backend/src/main/java/com/plotchain/income/IncomeType.java`) is `enum IncomeType { DIRECT, MATCHING, SPONSOR_MATCHING, ROYALTY, REWARD, PERK }` — the five spec'd values exist, in the exact order the spec lists them, with `PERK` last (so `PERK` needs to be explicitly excluded, not just "the rest of the enum").
- `CycleNotFoundException` (`backend/src/main/java/com/plotchain/cycle/CycleNotFoundException.java`) already exists (added by unit 3 for `POST /close`'s 404 case) and is already wired into `CycleExceptionHandler` → 404. Reuse it as-is; do not add a new exception.
- `SecurityConfig` (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java:225-226`) has:
  ```java
  .requestMatchers(HttpMethod.GET, "/api/admin/cycles")
      .hasAuthority("ADMIN")
  ```
  This is an **exact** Ant-pattern match — it does **not** cover `/api/admin/cycles/{id}`. Without a new matcher, `GET /api/admin/cycles/{id}` falls through to the trailing `.anyRequest().authenticated()` and becomes reachable by *any* authenticated associate, not just ADMIN. A new matcher is required.
- `CycleController` (`backend/src/main/java/com/plotchain/cycle/CycleController.java`) currently has `GET` (list, unmapped path) and `POST /{id}/close`. `CycleService` (`backend/src/main/java/com/plotchain/cycle/CycleService.java`) currently has `list(...)`, `close(...)`, `getOrOpenCurrent()`. Both need one new method each; nothing about `close()`'s settlement-batch logic is touched.
- `CycleServiceTest` (`backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`) has no shared `@BeforeEach` — every test constructs `service` inline:
  ```java
  service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
      compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
  ```
  Follow this exact pattern (same 7-arg order) for new tests in this file — do not add a `@BeforeEach`, it would be inconsistent with every existing test in the file.
- `CycleControllerTest` (`backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java`) uses `@SpringBootTest` + `@AutoConfigureMockMvc`, `@MockBean CycleService cycleService`, and a `tokenFor(AssociateRole)` helper that mints a real JWT via the real `JwtService`. Follow this file's existing test shape.
- `SecurityConfigTest` (`backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java:61-411`) has `@MockBean CycleRepository cycleRepository` at the class level (not `LedgerEntryRepository` — that one runs for real against the H2 test DB) and an existing parameterized test `adminCyclesIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` using `@EnumSource(AssociateRole.class)` plus a `stubEmptyCyclePage()` helper. Follow this exact parameterized-by-role pattern for the new detail-route test.

## File Structure

- Create: `backend/src/main/java/com/plotchain/cycle/CycleIncomeTypeTotal.java` — one breakdown line item, `{ incomeType, totalNet }`.
- Create: `backend/src/main/java/com/plotchain/cycle/CycleDetailResponse.java` — the full `GET /{id}` response.
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java` — add `getDetail(UUID id)`.
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleController.java` — add `GET /{id}`.
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add the ADMIN-only matcher for `GET /api/admin/cycles/*`.
- Test: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` — `getDetail` unit tests.
- Test: `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java` — `GET /{id}` MockMvc tests.
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — ADMIN-only-role parameterized test for the new route.

---

## Task 1: `CycleService.getDetail` — DTOs and service logic

**Files:**
- Create: `backend/src/main/java/com/plotchain/cycle/CycleIncomeTypeTotal.java`
- Create: `backend/src/main/java/com/plotchain/cycle/CycleDetailResponse.java`
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `CycleRepository.findById(UUID): Optional<Cycle>` (inherited from `JpaRepository`, already available). `LedgerEntryRepository.sumNetAmountByCycleAndType(UUID, IncomeType): BigDecimal` and `sumNetAmountByCycle(UUID): BigDecimal` (both already exist, confirmed above). `CycleNotFoundException(UUID)` (already exists).
- Produces: `CycleService.getDetail(UUID id): CycleDetailResponse` — Task 2's controller calls this directly. `CycleDetailResponse(UUID id, LocalDate periodStart, LocalDate periodEnd, CycleStatus status, List<CycleIncomeTypeTotal> incomeTypeTotals, BigDecimal totalNet)`. `CycleIncomeTypeTotal(IncomeType incomeType, BigDecimal totalNet)`.

- [ ] **Step 1: Write the failing tests in `CycleServiceTest.java`**

Add these two `@Test` methods to the existing test class (near the other single-cycle-lookup-style tests; anywhere in the class body is fine, this file has no fixed method ordering). Add `import com.plotchain.income.IncomeType;` to the file's import block alongside the existing `com.plotchain.income.*` imports.

```java
    @Test
    void getDetailReturnsCycleFieldsPlusPerIncomeTypeBreakdownAndOverallTotal() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findById(cycle.getId())).thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.DIRECT))
            .thenReturn(BigDecimal.valueOf(100));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.MATCHING))
            .thenReturn(BigDecimal.valueOf(50));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.SPONSOR_MATCHING))
            .thenReturn(BigDecimal.valueOf(10));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.ROYALTY))
            .thenReturn(BigDecimal.valueOf(5));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.REWARD))
            .thenReturn(BigDecimal.valueOf(2));
        when(ledgerEntryRepository.sumNetAmountByCycle(cycle.getId())).thenReturn(BigDecimal.valueOf(167));

        CycleDetailResponse response = service.getDetail(cycle.getId());

        assertThat(response.id()).isEqualTo(cycle.getId());
        assertThat(response.periodStart()).isEqualTo(cycle.getPeriodStart());
        assertThat(response.periodEnd()).isEqualTo(cycle.getPeriodEnd());
        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
        assertThat(response.totalNet()).isEqualByComparingTo(BigDecimal.valueOf(167));
        assertThat(response.incomeTypeTotals()).containsExactly(
            new CycleIncomeTypeTotal(IncomeType.DIRECT, BigDecimal.valueOf(100)),
            new CycleIncomeTypeTotal(IncomeType.MATCHING, BigDecimal.valueOf(50)),
            new CycleIncomeTypeTotal(IncomeType.SPONSOR_MATCHING, BigDecimal.valueOf(10)),
            new CycleIncomeTypeTotal(IncomeType.ROYALTY, BigDecimal.valueOf(5)),
            new CycleIncomeTypeTotal(IncomeType.REWARD, BigDecimal.valueOf(2)));
    }

    @Test
    void getDetailThrowsCycleNotFoundExceptionWhenIdDoesNotResolve() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository,
            compensationPlanVersionRepository, ledgerEntryRepository, rankTierRepository);
        UUID missingId = UUID.randomUUID();
        when(cycleRepository.findById(missingId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getDetail(missingId))
            .isInstanceOf(CycleNotFoundException.class);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=CycleServiceTest test`
Expected: compile failure — `getDetail`, `CycleDetailResponse`, and `CycleIncomeTypeTotal` don't exist yet.

- [ ] **Step 3: Create `CycleIncomeTypeTotal.java`**

```java
package com.plotchain.cycle;

import com.plotchain.income.IncomeType;

import java.math.BigDecimal;

// GET /api/admin/cycles/{id}'s per-income-type breakdown line item (cycle-management unit 2,
// docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md, lines
// 95-97): one row per IncomeType in CycleService.BREAKDOWN_INCOME_TYPES, sourced from the
// existing LedgerEntryRepository.sumNetAmountByCycleAndType -- no new query needed.
public record CycleIncomeTypeTotal(IncomeType incomeType, BigDecimal totalNet) {}
```

- [ ] **Step 4: Create `CycleDetailResponse.java`**

```java
package com.plotchain.cycle;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// GET /api/admin/cycles/{id} response (cycle-management unit 2, spec lines 95-97):
// CycleSummaryResponse's four fields (id, periodStart, periodEnd, status) plus the
// per-income-type breakdown and the cycle's overall totalNet ("Same fields plus a
// per-income-type breakdown"). Deliberately its own flat record rather than wrapping/nesting
// CycleSummaryResponse -- records can't extend one another, and duplicating four fields here
// keeps the JSON flat instead of nested under a "summary" key nothing in the spec asks for.
public record CycleDetailResponse(
    UUID id,
    LocalDate periodStart,
    LocalDate periodEnd,
    CycleStatus status,
    List<CycleIncomeTypeTotal> incomeTypeTotals,
    BigDecimal totalNet) {}
```

- [ ] **Step 5: Add `getDetail` to `CycleService.java`**

Add this constant near the top of the class body (right after the field declarations, before the constructor, is fine — or directly above `getDetail` itself):

```java
    // Cycle-management unit 2 (GET /api/admin/cycles/{id}, spec lines 95-97): fixed order
    // matching the spec's literal "DIRECT/MATCHING/SPONSOR_MATCHING/ROYALTY/REWARD" listing,
    // not IncomeType.values() filtered at call time -- explicit here so a future IncomeType
    // constant added before PERK can't silently join this breakdown without a deliberate edit
    // to this list. PERK itself is excluded: per Decision #8 of the domain-design spec, it's
    // descriptive metadata attached to REWARD entries, never its own ledger line.
    private static final List<IncomeType> BREAKDOWN_INCOME_TYPES = List.of(
        IncomeType.DIRECT, IncomeType.MATCHING, IncomeType.SPONSOR_MATCHING,
        IncomeType.ROYALTY, IncomeType.REWARD);
```

Add this method (near `list(...)`, since both are read-only admin queries — e.g. directly below `list`, above the settlement-batch `close` method):

```java
    // GET /api/admin/cycles/{id} -- cycle-management unit 2, the "monitor" half of
    // "trigger/monitor/re-run" (spec lines 95-97). Plain findById, no row lock: this is a
    // read-only view, unlike close()'s findByIdForUpdate, which exists solely to serialize
    // concurrent writers against the same cycle.
    public CycleDetailResponse getDetail(UUID id) {
        Cycle cycle = cycleRepository.findById(id)
            .orElseThrow(() -> new CycleNotFoundException(id));

        List<CycleIncomeTypeTotal> incomeTypeTotals = BREAKDOWN_INCOME_TYPES.stream()
            .map(type -> new CycleIncomeTypeTotal(
                type, ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), type)))
            .toList();

        BigDecimal totalNet = ledgerEntryRepository.sumNetAmountByCycle(cycle.getId());

        return new CycleDetailResponse(
            cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), cycle.getStatus(),
            incomeTypeTotals, totalNet);
    }
```

(`List`, `BigDecimal`, `IncomeType`, and `UUID` are all already imported in `CycleService.java` — no new imports needed there.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=CycleServiceTest test`
Expected: PASS, including the two new tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleIncomeTypeTotal.java \
  backend/src/main/java/com/plotchain/cycle/CycleDetailResponse.java \
  backend/src/main/java/com/plotchain/cycle/CycleService.java \
  backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): add CycleService.getDetail for the admin cycle-detail view"
```

---

## Task 2: `GET /api/admin/cycles/{id}` controller endpoint

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleController.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java`

**Interfaces:**
- Consumes: `CycleService.getDetail(UUID id): CycleDetailResponse` (Task 1). `CycleNotFoundException` (existing, already mapped to 404 by `CycleExceptionHandler`).
- Produces: `GET /api/admin/cycles/{id}` → 200 with `CycleDetailResponse` body, or 404 (via the existing exception handler) when the id doesn't resolve.

- [ ] **Step 1: Write the failing tests in `CycleControllerTest.java`**

Add these two `@Test` methods to the existing test class:

```java
    @Test
    void detailReturnsTheBreakdownForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.getDetail(cycleId)).thenReturn(
            new CycleDetailResponse(cycleId, java.time.LocalDate.of(2026, 7, 1),
                java.time.LocalDate.of(2026, 7, 15), CycleStatus.CLOSED,
                List.of(new CycleIncomeTypeTotal(com.plotchain.income.IncomeType.DIRECT,
                    java.math.BigDecimal.valueOf(100))),
                java.math.BigDecimal.valueOf(100)));

        mockMvc.perform(get("/api/admin/cycles/{id}", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(cycleId.toString()))
            .andExpect(jsonPath("$.status").value("CLOSED"))
            .andExpect(jsonPath("$.incomeTypeTotals[0].incomeType").value("DIRECT"))
            .andExpect(jsonPath("$.incomeTypeTotals[0].totalNet").value(100))
            .andExpect(jsonPath("$.totalNet").value(100));
    }

    @Test
    void detailReturns404WhenTheCycleDoesNotExist() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.getDetail(cycleId)).thenThrow(new CycleNotFoundException(cycleId));

        mockMvc.perform(get("/api/admin/cycles/{id}", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=CycleControllerTest test`
Expected: compile or assertion failure — `cycleService.getDetail` isn't wired to any route yet (404 or wrong response for both new tests).

- [ ] **Step 3: Add the endpoint to `CycleController.java`**

```java
    @GetMapping("/{id}")
    public CycleDetailResponse detail(@PathVariable UUID id) {
        return cycleService.getDetail(id);
    }
```

Place it between the existing `list` method and `close` method, so the class reads GET (list) → GET (detail) → POST (close) in URL-nesting order. `@PathVariable` is already imported in this file (used by `close`); no new imports needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=CycleControllerTest test`
Expected: PASS, including the two new tests. (These tests do not yet assert the ADMIN-only role restriction at the security-filter layer — that's Task 3's job, against the real `SecurityConfig`. `CycleControllerTest` mocks `CycleService` and only proves the controller wiring itself is correct for a token that already carries `ADMIN`.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleController.java \
  backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java
git commit -m "feat(cycle): add GET /api/admin/cycles/{id} controller endpoint"
```

---

## Task 3: ADMIN-only security matcher for the detail route

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `GET /api/admin/cycles/{id}` (Task 2's route). `CycleRepository` (already `@MockBean`'d in `SecurityConfigTest`).
- Produces: nothing consumed by later units — this is the final task in this plan. `GET /api/admin/cycles/*` becomes ADMIN-only in the security filter chain.

- [ ] **Step 1: Write the failing test in `SecurityConfigTest.java`**

Add this `@ParameterizedTest` to the existing test class, directly after `adminCyclesIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (around line 412):

```java
    // ADMIN-only, cycle-management unit 2's GET /api/admin/cycles/{id} matcher -- same
    // target-role-model reasoning as the list matcher directly above, not the isAdminFamily()
    // convention most other admin GETs use. "/api/admin/cycles" (the list matcher) is an exact
    // Ant-pattern match and does NOT cover this path as a prefix, so this route needs its own
    // matcher or it would fall through to the blanket anyRequest().authenticated() and become
    // reachable by any authenticated associate. cycleRepository.findById is stubbed to return a
    // real cycle so an ADMIN token reaches 200; ledgerEntryRepository is not @MockBean'd in this
    // class, so its sum queries run for real against the empty H2 test DB and return 0.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminCyclesDetailIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setPeriodStart(java.time.LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(java.time.LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        when(cycleRepository.findById(cycleId)).thenReturn(Optional.of(cycle));

        mockMvc.perform(get("/api/admin/cycles/{id}", cycleId)
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest#adminCyclesDetailIsReachableOnlyForAdminAndForbiddenForEveryOtherRole test`
Expected: FAIL for the ADMIN case — without a matcher, `GET /api/admin/cycles/{id}` falls through to `anyRequest().authenticated()`, so *every* role (not just non-ADMIN) currently gets 200, breaking the `!= ADMIN → 403` half of the assertion.

- [ ] **Step 3: Add the matcher to `SecurityConfig.java`**

Insert directly after the existing list matcher (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java:225-226`):

```java
                .requestMatchers(HttpMethod.GET, "/api/admin/cycles")
                    .hasAuthority("ADMIN")
                // Cycle detail (monitor half of trigger/monitor/re-run): ADMIN-only,
                // cycle-management unit 2
                // (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
                // lines 95-97). Separate matcher from the list route directly above --
                // "/api/admin/cycles" is an exact match in Spring Security's AntPathMatcher and
                // does NOT cover "/api/admin/cycles/{id}" as a prefix, so without this line the
                // detail route would fall through to the blanket anyRequest().authenticated()
                // below and be reachable by any authenticated associate, not just ADMIN.
                .requestMatchers(HttpMethod.GET, "/api/admin/cycles/*")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest#adminCyclesDetailIsReachableOnlyForAdminAndForbiddenForEveryOtherRole test`
Expected: PASS for every `AssociateRole` value.

- [ ] **Step 5: Run the full backend test suite to confirm no regressions**

Run: `cd backend && mvn -q test`
Expected: PASS. In particular, confirm `CycleControllerTest`, `CycleServiceTest`, `CycleExceptionHandlerTest`, and the rest of `SecurityConfigTest` (especially the existing `adminCyclesCloseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` and `adminCyclesIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` tests) still pass — this task only adds a new matcher, it does not touch the `POST /close` or `GET` list matchers.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
  backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(cycle): restrict GET /api/admin/cycles/{id} to ADMIN"
```

---

## Self-review notes

- **Spec coverage**: `GET /api/admin/cycles/{id}` endpoint (Task 2) — covered. Same four fields as unit 1's list response (Task 1's `CycleDetailResponse`) — covered. Per-income-type breakdown for `DIRECT/MATCHING/SPONSOR_MATCHING/ROYALTY/REWARD` via the existing `sumNetAmountByCycleAndType`, no new query (Task 1) — covered. Overall `totalNet` via existing `sumNetAmountByCycle` (Task 1) — covered. `CycleNotFoundException` → 404, reusing the existing exception rather than a duplicate (Task 1 throws it, already wired to 404 by the pre-existing `CycleExceptionHandler`, verified via Task 2's 404 test) — covered. ADMIN-only (Task 3) — covered. Testing section's "detail endpoint's per-income-type breakdown and the 404 case" and "`SecurityConfigTest` additions: all three `/api/admin/cycles*` routes are ADMIN-only" — covered by Task 1/2's breakdown+404 tests and Task 3's role-parameterized test (the third of the three routes; list and close are already locked by pre-existing tests).
- **Placeholder scan**: no TBD/TODO, no "add appropriate handling" language, no `Similar to Task N` shortcuts — every step has literal code.
- **Type consistency**: `CycleDetailResponse` and `CycleIncomeTypeTotal` field names/types are identical across Task 1 (definition + service test), Task 2 (controller test's constructed instance and jsonPath assertions), and Task 3 (indirectly, via the route it guards). `CycleService.getDetail(UUID): CycleDetailResponse` signature matches between Task 1's implementation and Task 2's controller call site.
