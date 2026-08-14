# Associate Own Ledger History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/associates/me/ledger` so an authenticated associate can view their own paginated, filterable ledger history (all income types, all cycles), with no way to see anyone else's entries.

**Architecture:** A new bare `@RestController` (`AssociateLedgerController`) with one route, calling a new `myList(...)` method on the existing `LedgerService` (which already backs `GET /api/admin/ledger` from unit 1). `myList` reuses the existing `LedgerEntryRepository.search(...)` query unmodified — always passing the caller's own `associateId` from `@AuthenticationPrincipal`, never from a request parameter — and reuses the existing private `cyclesById(...)` batch-load helper on `LedgerService`. Two new response records (`AssociateLedgerEntryResponse`, `AssociateLedgerPageResponse`) carry no associate-identity fields, since every row is always the caller's own. No `SecurityConfig` matcher is needed: a bare `GET` never collides with the blanket write rules, so it falls through to `anyRequest().authenticated()` — any authenticated associate reaches it, same as `GET /api/associates/me/sales`.

**Tech Stack:** Spring Boot (Java), Spring Data JPA, Spring Security (JWT via `@AuthenticationPrincipal`), MockMvc + JUnit 5 + Mockito + AssertJ for tests, H2 for `@SpringBootTest` test slices.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md` (Decisions 1-4, 6-8, 10-14; Flow "Associate own ledger"; Error handling table; Testing section). Unit detail: `docs/superpowers/plans/2026-08-03-income-ledger-units.md`, section "### 2."

## Global Constraints

- `associateId` for this endpoint comes **only** from `@AuthenticationPrincipal UUID associateId` — the endpoint has no `associateId` query parameter at all, so there is no way to override it via query string (Decisions 3, 4).
- Reuse `LedgerEntryRepository.search(...)` and `LedgerService.cyclesById(...)` unmodified — no new repository query, no repository test additions (already fully covered by unit 1's `LedgerEntryRepositoryTest`).
- Filters are exactly `incomeType` (including `PERK`), `cycleId`, `status` — no `associateId` filter on this endpoint (Decision 6).
- Sort order `createdAt DESC`; `page = Math.max(page, 0)`, `size = Math.min(size, 100)`, default `page=0`/`size=20` (Decisions 7, 8) — identical clamping to unit 1.
- Response is `AssociateLedgerPageResponse(entries, page, size, totalElements)` of `AssociateLedgerEntryResponse` rows: all ledger fields plus batch-loaded `cyclePeriodStart`/`cyclePeriodEnd` and nullable `sourceRef` — **no** `associateId`/`associateUserId`/`associateName` fields, since every row is always the caller's own (Decisions 11-13).
- No new exception types, no new `SecurityConfig` matcher, no admin-endpoint changes (Decision 14; out of scope per the unit).
- Invalid `incomeType`/`status` enum value or invalid UUID in the query string returns 400 via the existing `ApiExceptionHandler#handleTypeMismatch` — already generic, needs no change.

---

## File Structure

- Create: `backend/src/main/java/com/plotchain/income/AssociateLedgerEntryResponse.java` — new response record, one row.
- Create: `backend/src/main/java/com/plotchain/income/AssociateLedgerPageResponse.java` — new response record, one page.
- Modify: `backend/src/main/java/com/plotchain/income/LedgerService.java` — add `myList(...)` and a private `toAssociateResponse(...)` mapper, reusing the existing private `cyclesById(...)`.
- Create: `backend/src/main/java/com/plotchain/income/AssociateLedgerController.java` — new bare `@RestController`, single `GET /api/associates/me/ledger` route.
- Modify: `backend/src/test/java/com/plotchain/income/LedgerServiceTest.java` — add `myList(...)` test cases.
- Create: `backend/src/test/java/com/plotchain/income/AssociateLedgerControllerTest.java` — MockMvc + real JWT tests for the new controller.
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add one reachability test proving any associate token reaches 200 with no matcher needed.

No changes to `LedgerController.java`, `LedgerEntryRepository.java`, `AdminLedgerEntryResponse.java`, `AdminLedgerPageResponse.java`, or `SecurityConfig.java`.

---

## Task 1: `LedgerService.myList(...)` and the associate response DTOs

**Files:**
- Create: `backend/src/main/java/com/plotchain/income/AssociateLedgerEntryResponse.java`
- Create: `backend/src/main/java/com/plotchain/income/AssociateLedgerPageResponse.java`
- Modify: `backend/src/main/java/com/plotchain/income/LedgerService.java`
- Test: `backend/src/test/java/com/plotchain/income/LedgerServiceTest.java`

**Interfaces:**
- Consumes: `LedgerEntryRepository.search(UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, Pageable pageable)` (existing, unmodified); `LedgerService`'s existing private `Map<UUID, Cycle> cyclesById(List<LedgerEntry> entries)` (existing, unmodified — this is the method unit 1 deliberately factored out for this task to reuse).
- Produces: `AssociateLedgerPageResponse(List<AssociateLedgerEntryResponse> entries, int page, int size, long totalElements)`; `AssociateLedgerEntryResponse(UUID id, IncomeType incomeType, UUID cycleId, LocalDate cyclePeriodStart, LocalDate cyclePeriodEnd, BigDecimal grossAmount, BigDecimal tdsDeduction, BigDecimal adminDeduction, BigDecimal netAmount, LedgerEntryStatus status, UUID sourceRef, Instant createdAt)`; `LedgerService.myList(UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, int page, int size)` — consumed by Task 2's `AssociateLedgerController`.

- [ ] **Step 1: Write the failing tests in `LedgerServiceTest.java`**

Add these four test methods to the existing `LedgerServiceTest` class (same file already read at `backend/src/test/java/com/plotchain/income/LedgerServiceTest.java`), right after the last `adminList...` test:

```java
    // Income/Ledger unit 2 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // Decisions 3, 4, 11-13, Flow "Associate own ledger"): myList reuses the same search() call
    // and cyclesById() batch-load helper as adminList(), but maps to AssociateLedgerEntryResponse
    // (no associate-identity fields) and never resolves an associate lookup -- every row is
    // always the caller's own.
    @Test
    void myListReturnsAPageMappedToResponsesWithResolvedCycleFieldsAndNoAssociateIdentityFields() {
        UUID associateId = UUID.randomUUID();
        UUID entryId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID sourceRef = UUID.randomUUID();
        LedgerEntry entry = newEntry(entryId, associateId, cycleId, sourceRef);
        Cycle cycle = newCycle(cycleId, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 15));

        when(ledgerEntryRepository.search(eq(associateId), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1));
        when(cycleRepository.findAllById(List.of(cycleId))).thenReturn(List.of(cycle));

        AssociateLedgerPageResponse response = service.myList(associateId, null, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.entries()).hasSize(1);
        AssociateLedgerEntryResponse row = response.entries().get(0);
        assertThat(row.id()).isEqualTo(entryId);
        assertThat(row.cycleId()).isEqualTo(cycleId);
        assertThat(row.cyclePeriodStart()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(row.cyclePeriodEnd()).isEqualTo(LocalDate.of(2026, 1, 15));
        assertThat(row.incomeType()).isEqualTo(IncomeType.DIRECT);
        assertThat(row.status()).isEqualTo(LedgerEntryStatus.PAID);
        assertThat(row.sourceRef()).isEqualTo(sourceRef);
        assertThat(row.grossAmount()).isEqualByComparingTo("100.00");
        assertThat(row.netAmount()).isEqualByComparingTo("91.00");
    }

    // Proves associateId is always passed through non-null (the caller's own id) alongside the
    // other three filters -- this is the "own entries only" guarantee at the service layer,
    // matching Decision 3 (contrast with Sales' self+downline query, which this endpoint does
    // NOT use).
    @Test
    void myListAlwaysPassesTheCallersAssociateIdAndTheOtherThreeFiltersThroughToSearchUnchanged() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        when(ledgerEntryRepository.search(
            eq(associateId), eq(IncomeType.MATCHING), eq(cycleId), eq(LedgerEntryStatus.PENDING),
            eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        service.myList(associateId, IncomeType.MATCHING, cycleId, LedgerEntryStatus.PENDING, 0, 20);

        verify(ledgerEntryRepository).search(
            eq(associateId), eq(IncomeType.MATCHING), eq(cycleId), eq(LedgerEntryStatus.PENDING),
            eq(PageRequest.of(0, 20)));
    }

    @Test
    void myListLeavesCycleFieldsNullWhenTheBatchLookupMisses() {
        UUID associateId = UUID.randomUUID();
        UUID entryId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        LedgerEntry entry = newEntry(entryId, associateId, cycleId, null);

        when(ledgerEntryRepository.search(eq(associateId), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1));
        when(cycleRepository.findAllById(List.of(cycleId))).thenReturn(List.of());

        AssociateLedgerEntryResponse row = service.myList(associateId, null, null, null, 0, 20).entries().get(0);

        assertThat(row.cyclePeriodStart()).isNull();
        assertThat(row.cyclePeriodEnd()).isNull();
        assertThat(row.sourceRef()).isNull();
    }

    @Test
    void myListReturnsAnEmptyPageWhenSearchFindsNothing() {
        UUID associateId = UUID.randomUUID();
        when(ledgerEntryRepository.search(eq(associateId), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AssociateLedgerPageResponse response = service.myList(associateId, null, null, null, 0, 20);

        assertThat(response.entries()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }
```

No new imports are needed — `LedgerServiceTest.java` already imports everything these tests use (`PageImpl`, `PageRequest`, `eq`, `isNull`, `verify`, `when`, `assertThat`, `List`, `UUID`, `LocalDate`).

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `mvn test -Dtest=LedgerServiceTest`

Expected: **compile failure** — `cannot find symbol: method myList(...)`, `AssociateLedgerEntryResponse`/`AssociateLedgerPageResponse` do not exist. This is the expected "fails" state for new types under TDD in a statically-typed language.

- [ ] **Step 3: Create `AssociateLedgerEntryResponse.java`**

```java
package com.plotchain.income;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Income/Ledger unit 2 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decision 12): a separate record from AdminLedgerEntryResponse, not one shared type with
// associate-identity fields nulled out -- matches the existing AdminAssociateSummaryResponse/
// DashboardResponse pattern of purpose-built response types per consumer. Deliberately carries
// NO associateId/associateUserId/associateName fields: every row returned by
// GET /api/associates/me/ledger is always the caller's own (Decisions 3, 4), so echoing an
// associate identity back would be redundant at best and misleading at worst. cyclePeriodStart/
// cyclePeriodEnd are batch-resolved the same way as the admin response (Decision 11); sourceRef
// is nullable, same as the admin response (Decision 13).
public record AssociateLedgerEntryResponse(
    UUID id,
    IncomeType incomeType,
    UUID cycleId,
    LocalDate cyclePeriodStart,
    LocalDate cyclePeriodEnd,
    BigDecimal grossAmount,
    BigDecimal tdsDeduction,
    BigDecimal adminDeduction,
    BigDecimal netAmount,
    LedgerEntryStatus status,
    UUID sourceRef,
    Instant createdAt) {}
```

- [ ] **Step 4: Create `AssociateLedgerPageResponse.java`**

```java
package com.plotchain.income;

import java.util.List;

public record AssociateLedgerPageResponse(
    List<AssociateLedgerEntryResponse> entries, int page, int size, long totalElements) {}
```

- [ ] **Step 5: Add `myList(...)` to `LedgerService.java`**

Modify `backend/src/main/java/com/plotchain/income/LedgerService.java`. Add this method right after `adminList(...)` (before the private `cyclesById` helper), and add `toAssociateResponse` right after the existing private `toAdminResponse`:

```java
    // Flow "Associate own ledger" (same spec doc, steps 1-6): associateId is always the caller's
    // own id, supplied by AssociateLedgerController from @AuthenticationPrincipal -- never null,
    // never taken from a request parameter (Decisions 3, 4). Reuses the same search() call and
    // cyclesById() batch-load helper as adminList() above; no associate lookup is needed since
    // every row belongs to the caller.
    public AssociateLedgerPageResponse myList(
            UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, int page, int size) {
        Page<LedgerEntry> result = ledgerEntryRepository.search(
            associateId, incomeType, cycleId, status, PageRequest.of(page, size));

        List<LedgerEntry> content = result.getContent();
        Map<UUID, Cycle> cyclesById = cyclesById(content);

        List<AssociateLedgerEntryResponse> entries = content.stream()
            .map(e -> toAssociateResponse(e, cyclesById.get(e.getCycleId())))
            .toList();
        return new AssociateLedgerPageResponse(entries, page, size, result.getTotalElements());
    }
```

And directly below the existing `toAdminResponse(...)` method:

```java
    // Same "leave field null on a lookup miss" behavior as toAdminResponse above (Flow step 6)
    // -- a read-only view, not a strict-consistency write path.
    private AssociateLedgerEntryResponse toAssociateResponse(LedgerEntry entry, Cycle cycle) {
        return new AssociateLedgerEntryResponse(
            entry.getId(),
            entry.getIncomeType(),
            entry.getCycleId(),
            cycle == null ? null : cycle.getPeriodStart(),
            cycle == null ? null : cycle.getPeriodEnd(),
            entry.getGrossAmount(),
            entry.getTdsDeduction(),
            entry.getAdminDeduction(),
            entry.getNetAmount(),
            entry.getStatus(),
            entry.getSourceRef(),
            entry.getCreatedAt());
    }
```

No changes are needed to `cyclesById(...)` itself, its signature, or its visibility — it is already `private` but callable from `myList` since both are instance methods on the same class.

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `backend/`): `mvn test -Dtest=LedgerServiceTest`

Expected: PASS (all `adminList...` tests from unit 1 plus the four new `myList...` tests).

- [ ] **Step 7: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/income/AssociateLedgerEntryResponse.java \
        backend/src/main/java/com/plotchain/income/AssociateLedgerPageResponse.java \
        backend/src/main/java/com/plotchain/income/LedgerService.java \
        backend/src/test/java/com/plotchain/income/LedgerServiceTest.java
git commit -m "feat(income-ledger): add LedgerService.myList for the associate self-view"
```

---

## Task 2: `AssociateLedgerController` — `GET /api/associates/me/ledger`

**Files:**
- Create: `backend/src/main/java/com/plotchain/income/AssociateLedgerController.java`
- Test: `backend/src/test/java/com/plotchain/income/AssociateLedgerControllerTest.java`

**Interfaces:**
- Consumes: `LedgerService.myList(UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, int page, int size)` (Task 1); `AssociateLedgerPageResponse`, `AssociateLedgerEntryResponse` (Task 1).
- Produces: `GET /api/associates/me/ledger` HTTP route, consumed by future unit 4's associate "Income Statement" screen.

- [ ] **Step 1: Write the failing tests in a new `AssociateLedgerControllerTest.java`**

Create `backend/src/test/java/com/plotchain/income/AssociateLedgerControllerTest.java`:

```java
package com.plotchain.income;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// MockMvc + real JWT via JwtService, mirroring LedgerControllerTest's and
// AssociateSaleControllerTest's shape -- the real Spring Security filter chain runs, so this also
// proves the 401 case end to end. SecurityConfigTest additionally covers reachability by an
// ordinary associate token across the full route matrix; this file focuses on this controller's
// own request/response shape and the "always the caller's own id" guarantee.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateLedgerControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean LedgerService ledgerService;

    // Unlike a role-only tokenFor(role) (which mints a random associateId per call), this test
    // needs to know the associateId ahead of time -- it's how we prove
    // AssociateLedgerController resolves the caller's OWN id from the JWT, not from a request
    // parameter (this endpoint accepts none).
    private String tokenFor(AssociateRole role, UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(role);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getMyLedgerReturns200WithFiltersAndTheCallersOwnAssociateId() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID entryId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        AssociateLedgerEntryResponse row = new AssociateLedgerEntryResponse(
            entryId, IncomeType.DIRECT, cycleId,
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 15),
            new BigDecimal("100.00"), new BigDecimal("5.00"), new BigDecimal("4.00"), new BigDecimal("91.00"),
            LedgerEntryStatus.PAID, UUID.randomUUID(), Instant.now());
        AssociateLedgerPageResponse page = new AssociateLedgerPageResponse(List.of(row), 0, 20, 1);
        when(ledgerService.myList(
            eq(associateId), eq(IncomeType.DIRECT), eq(cycleId), eq(LedgerEntryStatus.PAID), eq(0), eq(20)))
            .thenReturn(page);

        mockMvc.perform(get("/api/associates/me/ledger")
                .param("incomeType", "DIRECT")
                .param("cycleId", cycleId.toString())
                .param("status", "PAID")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].id").value(entryId.toString()))
            .andExpect(jsonPath("$.entries[0].cyclePeriodStart").value("2026-01-01"))
            .andExpect(jsonPath("$.entries[0].cyclePeriodEnd").value("2026-01-15"))
            .andExpect(jsonPath("$.entries[0].associateId").doesNotExist())
            .andExpect(jsonPath("$.entries[0].associateName").doesNotExist())
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void getMyLedgerReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(ledgerService.myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/ledger")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    // Proves the endpoint has no associateId request parameter at all: passing one is simply
    // ignored by Spring MVC (no matching @RequestParam to bind to), so the service is still
    // called with the JWT-derived id, never the query-string value.
    @Test
    void getMyLedgerIgnoresAnAssociateIdQueryParameterIfOnePassed() throws Exception {
        UUID callerId = UUID.randomUUID();
        UUID otherAssociateId = UUID.randomUUID();
        when(ledgerService.myList(eq(callerId), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/ledger")
                .param("associateId", otherAssociateId.toString())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, callerId)))
            .andExpect(status().isOk());

        verify(ledgerService).myList(eq(callerId), isNull(), isNull(), isNull(), eq(0), eq(20));
    }

    @Test
    void getMyLedgerClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(ledgerService.myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(100)))
            .thenReturn(new AssociateLedgerPageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/associates/me/ledger").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk());

        verify(ledgerService).myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(100));
    }

    @Test
    void getMyLedgerClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(ledgerService.myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/ledger").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk());

        verify(ledgerService).myList(eq(associateId), isNull(), isNull(), isNull(), eq(0), eq(20));
    }

    @Test
    void getMyLedgerReturns400ForAnInvalidIncomeTypeValue() throws Exception {
        UUID associateId = UUID.randomUUID();
        mockMvc.perform(get("/api/associates/me/ledger").param("incomeType", "NOT_A_TYPE")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for incomeType"));
    }

    @Test
    void getMyLedgerReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/ledger"))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `mvn test -Dtest=AssociateLedgerControllerTest`

Expected: **compile failure** — `AssociateLedgerController` does not exist yet, so Spring Boot's `@MockBean LedgerService` context can start but the `GET /api/associates/me/ledger` route resolves to 404 even once it compiles without the controller. Practically: this file won't compile until `AssociateLedgerController` exists as a class reference is not required for compilation here (no direct reference to `AssociateLedgerController` in the test) — so the actual failure mode is a 404 on every test (`status().isOk()` assertions fail with 404), not a compile error. Confirm 404s.

- [ ] **Step 3: Create `AssociateLedgerController.java`**

```java
package com.plotchain.income;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Income/Ledger unit 2 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// "Associate own ledger -- GET /api/associates/me/ledger, any authenticated associate"): a bare
// @RestController with one route, same shape as AssociateSaleController and DashboardController
// -- not added to LedgerController, whose class-level @RequestMapping("/api/admin/ledger") would
// make an absolute-path method mapping here compose incorrectly (Spring concatenates class +
// method paths rather than treating a leading "/" as an override).
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/sales already does with no matcher of its own.
@RestController
public class AssociateLedgerController {

    private final LedgerService ledgerService;

    public AssociateLedgerController(LedgerService ledgerService) {
        this.ledgerService = ledgerService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never from
    // the request -- there is no associateId request parameter on this method at all, so no
    // caller can view another associate's ledger through this route (Decisions 3, 4).
    @GetMapping("/api/associates/me/ledger")
    public AssociateLedgerPageResponse getMyLedger(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) IncomeType incomeType,
            @RequestParam(required = false) UUID cycleId,
            @RequestParam(required = false) LedgerEntryStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return ledgerService.myList(associateId, incomeType, cycleId, status, page, size);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `mvn test -Dtest=AssociateLedgerControllerTest`

Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/income/AssociateLedgerController.java \
        backend/src/test/java/com/plotchain/income/AssociateLedgerControllerTest.java
git commit -m "feat(income-ledger): add GET /api/associates/me/ledger"
```

---

## Task 3: `SecurityConfigTest` reachability addition

**Files:**
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `GET /api/associates/me/ledger` (Task 2) — no production code is touched in this task; it only adds a characterization test proving the route needs no `SecurityConfig` matcher.

- [ ] **Step 1: Write the test**

Add this test to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, near the existing `associateMeSalesIsReachableByAnAssociateToken` test (around line 570):

```java
    // Income/Ledger unit 2 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // "Associate own ledger -- GET /api/associates/me/ledger, any authenticated associate"): needs
    // no explicit SecurityConfig matcher -- a bare GET never collides with the blanket
    // POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/sales already does
    // with no matcher of its own. This test proves the route is reachable by an ordinary
    // associate token, not accidentally blocked by 403.
    //
    // ledgerEntryRepository is not @MockBean'd in this class (same as
    // adminLedgerListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above), so search()
    // runs for real against the empty H2 test DB and returns an empty page. cycleRepository IS a
    // @MockBean here; findAllById on the unstubbed mock returns an empty list by default
    // (Mockito's ReturnsEmptyValues), so the request reaches 200 cleanly with no further stubbing
    // needed -- unlike associateMeSalesIsReachableByAnAssociateToken, which asserts "not 403"
    // because SaleService.getMySales trips a downstream 500 on an unstubbed downline lookup, this
    // endpoint has no such dependency and can assert a clean 200.
    @Test
    void associateMeLedgerIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/ledger")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }
```

- [ ] **Step 2: Run the test**

Run (from `backend/`): `mvn test -Dtest=SecurityConfigTest`

Expected: PASS. This test is expected to pass immediately with no production-code change, since `GET /api/associates/me/ledger` (added in Task 2) is a bare GET that already falls through to `anyRequest().authenticated()` — this step exists to record that guarantee as a regression test, not to drive new code.

- [ ] **Step 3: Run the full backend test suite**

Run (from `backend/`): `mvn test`

Expected: PASS, all tests including `LedgerServiceTest`, `AssociateLedgerControllerTest`, `LedgerControllerTest`, `LedgerEntryRepositoryTest`, `SecurityConfigTest`. (Per the project's known JDK/Mockito environment note, some spurious Mockito errors unrelated to this change may appear if running under a mismatched JDK — see the memory note `plotchain_jdk_mockito_env_issue.md` if that happens; it is not this unit's concern.)

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(income-ledger): confirm GET /api/associates/me/ledger needs no SecurityConfig matcher"
```

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** every acceptance criterion in unit 2's detail (own entries only via `@AuthenticationPrincipal`, no `associateId` param, filter set minus `associateId`, sort/clamp identical to unit 1, response shape with no associate-identity fields, any-authenticated-associate reachability, 401 unauthenticated) is covered by a task above. The 403-for-non-owner case doesn't apply here (there is no owner-mismatch path to test — Decision 4 makes it structurally impossible), which is why no such test appears.
- **No placeholders:** every step has literal code, not prose describing code.
- **Type consistency:** `AssociateLedgerEntryResponse`/`AssociateLedgerPageResponse` field names and order are identical between Task 1 (record definitions), the `LedgerService.myList`/`toAssociateResponse` implementation, and Task 2's controller test usages. `LedgerService.myList(...)`'s signature matches exactly between Task 1's production code and Task 2's controller call site and test stubs.
