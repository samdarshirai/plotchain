# Income/Ledger Admin Register (Income/Ledger unit 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/admin/ledger`, an ADMIN-only, paginated, filterable, cross-associate register of `LedgerEntry` rows, with resolved associate name and cycle period dates on every row.

**Architecture:** A new `LedgerEntryRepository.search(...)` JPQL query (the same optional-filter-via-`IS NULL OR` pattern `AssociateRepository.searchDirectory` and `SaleRepository.searchRegister` already use) backs a new `LedgerService.adminList(...)` method, which maps the resulting `Page<LedgerEntry>` into `AdminLedgerPageResponse` — batch-resolving associate identity (`associateRepository.findAllById`) and cycle period dates (`cycleRepository.findAllById`) once per page and mapping by id, the same "load once, map by id" pattern `AdminAssociateService.ranksById()` already establishes. A new `LedgerController`, carrying `/api/admin/ledger` as its class-level `@RequestMapping`, exposes this as a `GET` with the same `page`/`size` clamping every other admin list endpoint in this codebase uses. `SecurityConfig` gets one new ADMIN-only matcher, following the `GET /api/admin/sales`/`GET /api/admin/cycles` precedent (target role model `hasAuthority("ADMIN")`, not the `hasAnyAuthority(admin-family)` pattern most other admin GETs still use).

`LedgerController` deliberately carries the `/api/admin/ledger` prefix at the class level rather than as a bare `@RestController` with per-method paths, because a sibling unit (Income/Ledger unit 2, not built here) adds `GET /api/associates/me/ledger` on top of the same `LedgerService`. The Sales domain hit exactly this shape choice already: `SaleController` (`@RequestMapping("/api/admin/sales")`) and `AssociateSaleController` (bare `@RestController`, full-path method mapping) are two separate controller classes sharing one `SaleService`, specifically because Spring composes class-level + method-level paths rather than letting an absolute method path override a class-level prefix. Unit 2's plan will add a new `AssociateLedgerController` class the same way, reusing `LedgerService` unchanged — this plan does not build that endpoint, only leaves room for it.

**Tech Stack:** Spring Boot 3 (Spring Data JPA, Spring Security, Spring MVC), JUnit 5 + Mockito + AssertJ, MockMvc, H2 (Postgres-compatibility mode) for repository/integration tests, Maven (`mvn test -Dtest=ClassName` from `backend/`).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md` (Decisions 1, 2, 4, 5, 7, 8, 10, 11, 12, 13, 14; Flow "Admin ledger register"; Error handling table; Testing section). Unit slice: `docs/superpowers/plans/2026-08-03-income-ledger-units.md`, unit 1.

## Global Constraints

- Page/size clamping: `page = Math.max(page, 0)`, `size = Math.min(size, 100)` — done in the controller, exactly like `AdminAssociateController.list()`, `SaleController.list()`, and `KycReviewController.list()`. Default `page=0`, `size=20`.
- Filters `associateId`, `incomeType`, `cycleId`, `status` are all optional and independently combinable, via one null-safe `LedgerEntryRepository.search(...)` JPQL query (Decision 4). `incomeType` includes `PERK` — no special-casing to hide it (Decision 10).
- Sort order is `createdAt DESC` on both the query and every test asserting order (Decision 7).
- Response shape mirrors `AdminAssociatePageResponse`: `AdminLedgerPageResponse(entries, page, size, totalElements)` (Decision 8).
- Each row batch-resolves `associateUserId`/`associateName` (via `associateRepository.findAllById` over the page's distinct associate ids) and `cyclePeriodStart`/`cyclePeriodEnd` (via `cycleRepository.findAllById` over the page's distinct cycle ids) — loaded once per page, not once per row (Decision 11, mirroring `AdminAssociateService.ranksById()`).
- `sourceRef` is included, nullable — populated only for `DIRECT` entries today; stays `null` for every other income type (Decision 13). No behavior to build for this beyond passing the field through.
- If a batch-loaded associate or cycle lookup misses (should not happen under FK integrity, but the spec explicitly allows for it), leave that response field `null` rather than failing the whole page — this is a read-only audit view (Flow step 6).
- No new exception handler. An invalid `incomeType`/`status` enum value or invalid UUID in the query string is already handled generically by `com.plotchain.api.ApiExceptionHandler#handleTypeMismatch` (400) (Decision 14) — do not add a domain-specific handler.
- `GET /api/admin/ledger` is ADMIN-only (`hasAuthority("ADMIN")`), the target-role-model matcher pattern (not `hasAnyAuthority(admin-family)`), matching `GET /api/admin/sales` and `GET /api/admin/cycles`.
- No new database migration, no entity changes. `ledger_entry.source_ref` already exists (landed via the Sales spec's migration). Only new code is a repository query method, two new DTOs, one new service, one new controller, and one new `SecurityConfig` matcher.
- Out of scope for this plan (do not build): `GET /api/associates/me/ledger` (unit 2), either screen (units 3/4), any date-range filter, any aggregate report.

---

## File Structure

- **Modify** `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java` — add `search(...)`.
- **Modify** `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java` — add `@DataJpaTest` coverage for `search(...)` against real H2.
- **Create** `backend/src/main/java/com/plotchain/income/AdminLedgerEntryResponse.java` — per-row response record.
- **Create** `backend/src/main/java/com/plotchain/income/AdminLedgerPageResponse.java` — page envelope record.
- **Create** `backend/src/main/java/com/plotchain/income/LedgerService.java` — `adminList(...)` plus the batch-load/mapping helpers unit 2 will reuse.
- **Create** `backend/src/test/java/com/plotchain/income/LedgerServiceTest.java` — mocked-repository unit tests for `adminList(...)`.
- **Create** `backend/src/main/java/com/plotchain/income/LedgerController.java` — `GET /api/admin/ledger`.
- **Create** `backend/src/test/java/com/plotchain/income/LedgerControllerTest.java` — MockMvc + real JWT (mirrors `KycReviewControllerTest`/`SaleControllerTest`'s shape).
- **Modify** `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add the ADMIN-only matcher for `GET /api/admin/ledger`.
- **Modify** `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add the ADMIN-only role-matrix test.

---

### Task 1: `LedgerEntryRepository.search(...)` — the filtered, paginated query

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Test: `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java` (existing file — add tests, don't remove the existing ones)

**Interfaces:**
- Consumes: `LedgerEntry` (existing entity, `backend/src/main/java/com/plotchain/income/LedgerEntry.java`), `IncomeType`, `LedgerEntryStatus` enums (existing).
- Produces: `LedgerEntryRepository.search(UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, Pageable pageable): Page<LedgerEntry>` — Task 2's `LedgerService.adminList(...)` calls this directly.

- [ ] **Step 1: Write the failing repository tests**

Add to `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`, at the end of the class before the closing brace. This file already has `seedAssociate()`, `seedCycle()`, and `newEntry(associateId, cycleId, incomeType, sourceRef)` helpers — reuse them unchanged. Add `import org.springframework.data.domain.Page;` and `import org.springframework.data.domain.PageRequest;` to the existing import block if not already present (check first — neither is currently imported by this file).

```java
    // Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // Decision 4, Flow "Admin ledger register"): the shared search query both the admin and
    // (a follow-up unit's) associate-self endpoints use. All four filters are optional; this
    // test exercises each alone, in combination, and the unfiltered "everything" case.
    @Test
    void searchFiltersByAssociateIdIncomeTypeCycleIdAndStatusIndependentlyAndInCombination() {
        Associate associateA = seedAssociate();
        Associate associateB = seedAssociate();
        Cycle cycleA = seedCycle();
        Cycle cycleB = seedCycle();
        LedgerEntry direct = ledgerEntryRepository.saveAndFlush(
            newEntry(associateA.getId(), cycleA.getId(), IncomeType.DIRECT, UUID.randomUUID()));
        direct.setStatus(LedgerEntryStatus.PAID);
        ledgerEntryRepository.saveAndFlush(direct);
        LedgerEntry matching = ledgerEntryRepository.saveAndFlush(
            newEntry(associateA.getId(), cycleB.getId(), IncomeType.MATCHING, UUID.randomUUID()));
        LedgerEntry otherAssociate = ledgerEntryRepository.saveAndFlush(
            newEntry(associateB.getId(), cycleA.getId(), IncomeType.DIRECT, UUID.randomUUID()));

        Page<LedgerEntry> byAssociate = ledgerEntryRepository.search(
            associateA.getId(), null, null, null, PageRequest.of(0, 20));
        assertThat(byAssociate.getContent()).extracting(LedgerEntry::getId)
            .containsExactlyInAnyOrder(direct.getId(), matching.getId());

        Page<LedgerEntry> byIncomeType = ledgerEntryRepository.search(
            null, IncomeType.DIRECT, null, null, PageRequest.of(0, 20));
        assertThat(byIncomeType.getContent()).extracting(LedgerEntry::getId)
            .containsExactlyInAnyOrder(direct.getId(), otherAssociate.getId());

        Page<LedgerEntry> byCycleId = ledgerEntryRepository.search(
            null, null, cycleB.getId(), null, PageRequest.of(0, 20));
        assertThat(byCycleId.getContent()).extracting(LedgerEntry::getId).containsExactly(matching.getId());

        Page<LedgerEntry> byStatus = ledgerEntryRepository.search(
            null, null, null, LedgerEntryStatus.PAID, PageRequest.of(0, 20));
        assertThat(byStatus.getContent()).extracting(LedgerEntry::getId).containsExactly(direct.getId());

        Page<LedgerEntry> combined = ledgerEntryRepository.search(
            associateA.getId(), IncomeType.DIRECT, cycleA.getId(), LedgerEntryStatus.PAID, PageRequest.of(0, 20));
        assertThat(combined.getContent()).extracting(LedgerEntry::getId).containsExactly(direct.getId());

        Page<LedgerEntry> unfiltered = ledgerEntryRepository.search(
            null, null, null, null, PageRequest.of(0, 20));
        assertThat(unfiltered.getTotalElements()).isEqualTo(3);
    }

    @Test
    void searchOrdersByCreatedAtDescendingAndPaginatesCorrectly() {
        Associate associate = seedAssociate();
        Cycle cycle = seedCycle();
        LedgerEntry earlier = newEntry(associate.getId(), cycle.getId(), IncomeType.DIRECT, UUID.randomUUID());
        earlier.setCreatedAt(Instant.parse("2026-01-10T00:00:00Z"));
        ledgerEntryRepository.saveAndFlush(earlier);
        LedgerEntry later = newEntry(associate.getId(), cycle.getId(), IncomeType.MATCHING, UUID.randomUUID());
        later.setCreatedAt(Instant.parse("2026-01-20T00:00:00Z"));
        ledgerEntryRepository.saveAndFlush(later);
        LedgerEntry latest = newEntry(associate.getId(), cycle.getId(), IncomeType.ROYALTY, UUID.randomUUID());
        latest.setCreatedAt(Instant.parse("2026-01-30T00:00:00Z"));
        ledgerEntryRepository.saveAndFlush(latest);

        Page<LedgerEntry> firstPage = ledgerEntryRepository.search(null, null, null, null, PageRequest.of(0, 2));
        assertThat(firstPage.getContent()).extracting(LedgerEntry::getId)
            .containsExactly(latest.getId(), later.getId());
        assertThat(firstPage.getTotalElements()).isEqualTo(3);

        Page<LedgerEntry> secondPage = ledgerEntryRepository.search(null, null, null, null, PageRequest.of(1, 2));
        assertThat(secondPage.getContent()).extracting(LedgerEntry::getId).containsExactly(earlier.getId());
    }

    @Test
    void searchReturnsAnEmptyPageWhenNoEntryMatchesTheGivenFilters() {
        seedAssociate();
        seedCycle();

        Page<LedgerEntry> result = ledgerEntryRepository.search(
            UUID.randomUUID(), null, null, null, PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
        assertThat(result.getTotalElements()).isZero();
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `mvn test -Dtest=LedgerEntryRepositoryTest`
Expected: compile failure — `search` is not a method on `LedgerEntryRepository`.

- [ ] **Step 3: Implement `search(...)` on `LedgerEntryRepository`**

Edit `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`. Add `import org.springframework.data.domain.Page;` and `import org.springframework.data.domain.Pageable;` to the existing import block. Then add this method at the end of the interface, before the closing brace:

```java
    // Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // Decision 4, Flow "Admin ledger register"): shared by both the admin register endpoint and
    // (a follow-up unit's) associate-self endpoint -- the associate endpoint always passes its
    // own caller id as associateId (never null), while the admin endpoint passes through
    // whatever the caller supplied (possibly null). Same null-safe "(:param IS NULL OR ...)"
    // JPQL pattern AssociateRepository#searchDirectory already uses. UUID- and enum-typed params
    // (associateId, incomeType, cycleId, status) don't need the explicit CAST that
    // searchDirectory's :search string param needs -- Hibernate resolves UUID/enum parameter
    // types from the Java method signature alone, independent of the surrounding SQL, per that
    // method's own comment.
    @Query("""
        SELECT l FROM LedgerEntry l
        WHERE (:associateId IS NULL OR l.associateId = :associateId)
        AND (:incomeType IS NULL OR l.incomeType = :incomeType)
        AND (:cycleId IS NULL OR l.cycleId = :cycleId)
        AND (:status IS NULL OR l.status = :status)
        ORDER BY l.createdAt DESC
        """)
    Page<LedgerEntry> search(
        @Param("associateId") UUID associateId,
        @Param("incomeType") IncomeType incomeType,
        @Param("cycleId") UUID cycleId,
        @Param("status") LedgerEntryStatus status,
        Pageable pageable);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `mvn test -Dtest=LedgerEntryRepositoryTest`
Expected: PASS (all existing tests plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java
git commit -m "feat(income): add LedgerEntryRepository.search for the admin ledger register"
```

---

### Task 2: `LedgerService.adminList(...)` and the response DTOs

**Files:**
- Create: `backend/src/main/java/com/plotchain/income/AdminLedgerEntryResponse.java`
- Create: `backend/src/main/java/com/plotchain/income/AdminLedgerPageResponse.java`
- Create: `backend/src/main/java/com/plotchain/income/LedgerService.java`
- Create: `backend/src/test/java/com/plotchain/income/LedgerServiceTest.java`

**Interfaces:**
- Consumes: `LedgerEntryRepository.search(UUID, IncomeType, UUID, LedgerEntryStatus, Pageable): Page<LedgerEntry>` (Task 1). `AssociateRepository.findAllById(Iterable<UUID>): List<Associate>` and `CycleRepository.findAllById(Iterable<UUID>): List<Cycle>` (both pre-existing, inherited from `JpaRepository` — no new repository methods needed). `Associate.getId()/getUserId()/getName()` and `Cycle.getId()/getPeriodStart()/getPeriodEnd()` (existing entity getters).
- Produces: `LedgerService.adminList(UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, int page, int size): AdminLedgerPageResponse` — Task 3's `LedgerController.list(...)` calls this directly. `AdminLedgerPageResponse(List<AdminLedgerEntryResponse> entries, int page, int size, long totalElements)` and `AdminLedgerEntryResponse(UUID id, UUID associateId, String associateUserId, String associateName, IncomeType incomeType, UUID cycleId, LocalDate cyclePeriodStart, LocalDate cyclePeriodEnd, BigDecimal grossAmount, BigDecimal tdsDeduction, BigDecimal adminDeduction, BigDecimal netAmount, LedgerEntryStatus status, UUID sourceRef, Instant createdAt)` — the exact shape Task 3's controller test and unit 2's follow-up plan will read.

- [ ] **Step 1: Write the failing service tests**

Create `backend/src/test/java/com/plotchain/income/LedgerServiceTest.java`:

```java
package com.plotchain.income;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LedgerServiceTest {

    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock AssociateRepository associateRepository;
    @Mock CycleRepository cycleRepository;

    LedgerService service;

    @BeforeEach
    void setUp() {
        service = new LedgerService(ledgerEntryRepository, associateRepository, cycleRepository);
    }

    private Associate newAssociate(UUID id, String userId, String name) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName(name);
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        return a;
    }

    private Cycle newCycle(UUID id, LocalDate start, LocalDate end) {
        Cycle c = new Cycle();
        c.setId(id);
        c.setPeriodStart(start);
        c.setPeriodEnd(end);
        c.setStatus(CycleStatus.CLOSED);
        return c;
    }

    private LedgerEntry newEntry(UUID id, UUID associateId, UUID cycleId, UUID sourceRef) {
        LedgerEntry e = new LedgerEntry();
        e.setId(id);
        e.setAssociateId(associateId);
        e.setIncomeType(IncomeType.DIRECT);
        e.setCycleId(cycleId);
        e.setGrossAmount(new BigDecimal("100.00"));
        e.setTdsDeduction(new BigDecimal("5.00"));
        e.setAdminDeduction(new BigDecimal("4.00"));
        e.setNetAmount(new BigDecimal("91.00"));
        e.setStatus(LedgerEntryStatus.PAID);
        e.setSourceRef(sourceRef);
        e.setCreatedAt(Instant.parse("2026-01-15T00:00:00Z"));
        return e;
    }

    // Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
    // Decision 11, Flow "Admin ledger register" steps 3-6): batch-loaded associate/cycle
    // resolution, mapped by id -- proves the row carries both raw ids and resolved display
    // fields, plus every ledger field including the nullable sourceRef.
    @Test
    void adminListReturnsAPageMappedToResponsesWithResolvedAssociateAndCycleFields() {
        UUID entryId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID sourceRef = UUID.randomUUID();
        LedgerEntry entry = newEntry(entryId, associateId, cycleId, sourceRef);
        Associate associate = newAssociate(associateId, "VP00001", "Jane Doe");
        Cycle cycle = newCycle(cycleId, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 15));

        when(ledgerEntryRepository.search(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(List.of(associateId))).thenReturn(List.of(associate));
        when(cycleRepository.findAllById(List.of(cycleId))).thenReturn(List.of(cycle));

        AdminLedgerPageResponse response = service.adminList(null, null, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.entries()).hasSize(1);
        AdminLedgerEntryResponse row = response.entries().get(0);
        assertThat(row.id()).isEqualTo(entryId);
        assertThat(row.associateId()).isEqualTo(associateId);
        assertThat(row.associateUserId()).isEqualTo("VP00001");
        assertThat(row.associateName()).isEqualTo("Jane Doe");
        assertThat(row.cycleId()).isEqualTo(cycleId);
        assertThat(row.cyclePeriodStart()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(row.cyclePeriodEnd()).isEqualTo(LocalDate.of(2026, 1, 15));
        assertThat(row.incomeType()).isEqualTo(IncomeType.DIRECT);
        assertThat(row.status()).isEqualTo(LedgerEntryStatus.PAID);
        assertThat(row.sourceRef()).isEqualTo(sourceRef);
        assertThat(row.grossAmount()).isEqualByComparingTo("100.00");
        assertThat(row.netAmount()).isEqualByComparingTo("91.00");
    }

    @Test
    void adminListPassesAllFourFiltersThroughToSearchUnchanged() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        when(ledgerEntryRepository.search(
            eq(associateId), eq(IncomeType.MATCHING), eq(cycleId), eq(LedgerEntryStatus.PENDING),
            eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        service.adminList(associateId, IncomeType.MATCHING, cycleId, LedgerEntryStatus.PENDING, 0, 20);

        verify(ledgerEntryRepository).search(
            eq(associateId), eq(IncomeType.MATCHING), eq(cycleId), eq(LedgerEntryStatus.PENDING),
            eq(PageRequest.of(0, 20)));
    }

    // Flow "Admin ledger register" step 6: a lookup miss leaves the response field null instead
    // of failing the whole page. Shouldn't happen under FK integrity, but the spec explicitly
    // calls this out as this read-only audit view's behavior rather than a hard failure.
    @Test
    void adminListLeavesAssociateAndCycleFieldsNullWhenTheBatchLookupMisses() {
        UUID entryId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        LedgerEntry entry = newEntry(entryId, associateId, cycleId, null);

        when(ledgerEntryRepository.search(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1));
        when(associateRepository.findAllById(List.of(associateId))).thenReturn(List.of());
        when(cycleRepository.findAllById(List.of(cycleId))).thenReturn(List.of());

        AdminLedgerEntryResponse row = service.adminList(null, null, null, null, 0, 20).entries().get(0);

        assertThat(row.associateUserId()).isNull();
        assertThat(row.associateName()).isNull();
        assertThat(row.cyclePeriodStart()).isNull();
        assertThat(row.cyclePeriodEnd()).isNull();
        assertThat(row.sourceRef()).isNull();
    }

    @Test
    void adminListReturnsAnEmptyPageWhenSearchFindsNothingWithoutCallingBatchLookups() {
        when(ledgerEntryRepository.search(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AdminLedgerPageResponse response = service.adminList(null, null, null, null, 0, 20);

        assertThat(response.entries()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mvn test -Dtest=LedgerServiceTest`
Expected: compile failure — `LedgerService`, `AdminLedgerPageResponse`, and `AdminLedgerEntryResponse` don't exist yet.

- [ ] **Step 3: Create the response DTOs**

Create `backend/src/main/java/com/plotchain/income/AdminLedgerEntryResponse.java`:

```java
package com.plotchain.income;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decisions 11-13): associateUserId/associateName and cyclePeriodStart/cyclePeriodEnd are
// batch-resolved by LedgerService, not raw UUIDs alone -- a bare associateId/cycleId would force
// a second round trip per row for any real UI. sourceRef is nullable: only DIRECT entries
// populate it today (Decision 13). A separate record from a future
// AssociateLedgerEntryResponse (unit 2), not one type with associate fields nulled out --
// matches the existing AdminAssociateSummaryResponse/DashboardResponse pattern of purpose-built
// response types per consumer.
public record AdminLedgerEntryResponse(
    UUID id,
    UUID associateId,
    String associateUserId,
    String associateName,
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

Create `backend/src/main/java/com/plotchain/income/AdminLedgerPageResponse.java`:

```java
package com.plotchain.income;

import java.util.List;

public record AdminLedgerPageResponse(
    List<AdminLedgerEntryResponse> entries, int page, int size, long totalElements) {}
```

- [ ] **Step 4: Implement `LedgerService`**

Create `backend/src/main/java/com/plotchain/income/LedgerService.java`:

```java
package com.plotchain.income;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decision 2): one service backs both the admin register and (a follow-up unit's) associate-self
// endpoint -- there's no write path here to justify splitting into separate classes, same
// reasoning the Sales spec gave for keeping SaleService as one class behind two controllers.
@Service
public class LedgerService {

    private final LedgerEntryRepository ledgerEntryRepository;
    private final AssociateRepository associateRepository;
    private final CycleRepository cycleRepository;

    public LedgerService(
            LedgerEntryRepository ledgerEntryRepository,
            AssociateRepository associateRepository,
            CycleRepository cycleRepository) {
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.associateRepository = associateRepository;
        this.cycleRepository = cycleRepository;
    }

    // Flow "Admin ledger register" (same spec doc, steps 1-7): full cross-associate visibility.
    // Batch-resolves associate identity and cycle dates once per page, mapped by id -- the same
    // pattern AdminAssociateService.ranksById() already establishes -- rather than querying once
    // per row.
    public AdminLedgerPageResponse adminList(
            UUID associateId, IncomeType incomeType, UUID cycleId, LedgerEntryStatus status, int page, int size) {
        Page<LedgerEntry> result = ledgerEntryRepository.search(
            associateId, incomeType, cycleId, status, PageRequest.of(page, size));

        List<LedgerEntry> content = result.getContent();
        Map<UUID, Associate> associatesById = associatesById(content);
        Map<UUID, Cycle> cyclesById = cyclesById(content);

        List<AdminLedgerEntryResponse> entries = content.stream()
            .map(e -> toAdminResponse(e, associatesById.get(e.getAssociateId()), cyclesById.get(e.getCycleId())))
            .toList();
        return new AdminLedgerPageResponse(entries, page, size, result.getTotalElements());
    }

    // Shared with (a follow-up unit's) GET /api/associates/me/ledger: every ledger row needs its
    // cycle's period dates resolved the same way regardless of who's asking.
    private Map<UUID, Cycle> cyclesById(List<LedgerEntry> entries) {
        List<UUID> distinctCycleIds = entries.stream().map(LedgerEntry::getCycleId).distinct().toList();
        return cycleRepository.findAllById(distinctCycleIds).stream()
            .collect(Collectors.toMap(Cycle::getId, c -> c));
    }

    private Map<UUID, Associate> associatesById(List<LedgerEntry> entries) {
        List<UUID> distinctAssociateIds = entries.stream().map(LedgerEntry::getAssociateId).distinct().toList();
        return associateRepository.findAllById(distinctAssociateIds).stream()
            .collect(Collectors.toMap(Associate::getId, a -> a));
    }

    // A missing associate or cycle lookup (should not happen under FK integrity) leaves the
    // corresponding fields null rather than failing the whole page -- this is a read-only audit
    // view, not a strict-consistency write path (Flow step 6).
    private AdminLedgerEntryResponse toAdminResponse(LedgerEntry entry, Associate associate, Cycle cycle) {
        return new AdminLedgerEntryResponse(
            entry.getId(),
            entry.getAssociateId(),
            associate == null ? null : associate.getUserId(),
            associate == null ? null : associate.getName(),
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
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `mvn test -Dtest=LedgerServiceTest`
Expected: PASS (all 4 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/income/AdminLedgerEntryResponse.java backend/src/main/java/com/plotchain/income/AdminLedgerPageResponse.java backend/src/main/java/com/plotchain/income/LedgerService.java backend/src/test/java/com/plotchain/income/LedgerServiceTest.java
git commit -m "feat(income): add LedgerService.adminList with batch-resolved associate/cycle fields"
```

---

### Task 3: `GET /api/admin/ledger` controller endpoint + security matcher

**Files:**
- Create: `backend/src/main/java/com/plotchain/income/LedgerController.java`
- Create: `backend/src/test/java/com/plotchain/income/LedgerControllerTest.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `LedgerService.adminList(UUID, IncomeType, UUID, LedgerEntryStatus, int, int): AdminLedgerPageResponse` (Task 2).
- Produces: `GET /api/admin/ledger` HTTP endpoint — the unit's actual deliverable, nothing downstream in this plan consumes it in Java. (A follow-up unit's `AssociateLedgerController` will reuse `LedgerService` directly, not this controller.)

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/income/LedgerControllerTest.java`:

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

// MockMvc + real JWT via JwtService, mirroring KycReviewControllerTest's and
// SaleControllerTest's shape -- the real Spring Security filter chain runs, so this also proves
// the 403/401 cases end to end, not just the 200 case. SecurityConfigTest additionally covers the
// full ADMIN-vs-every-other-role matrix (Task 3, Step 5 below); this file focuses on this
// controller's own request/response shape.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class LedgerControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean LedgerService ledgerService;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void listReturns200WithFilters() throws Exception {
        UUID entryId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        AdminLedgerEntryResponse row = new AdminLedgerEntryResponse(
            entryId, associateId, "VP00001", "Jane Doe", IncomeType.DIRECT, cycleId,
            LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 15),
            new BigDecimal("100.00"), new BigDecimal("5.00"), new BigDecimal("4.00"), new BigDecimal("91.00"),
            LedgerEntryStatus.PAID, UUID.randomUUID(), Instant.now());
        AdminLedgerPageResponse page = new AdminLedgerPageResponse(List.of(row), 0, 20, 1);
        when(ledgerService.adminList(
            eq(associateId), eq(IncomeType.DIRECT), eq(cycleId), eq(LedgerEntryStatus.PAID), eq(0), eq(20)))
            .thenReturn(page);

        mockMvc.perform(get("/api/admin/ledger")
                .param("associateId", associateId.toString())
                .param("incomeType", "DIRECT")
                .param("cycleId", cycleId.toString())
                .param("status", "PAID")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries[0].id").value(entryId.toString()))
            .andExpect(jsonPath("$.entries[0].associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.entries[0].associateName").value("Jane Doe"))
            .andExpect(jsonPath("$.entries[0].cyclePeriodStart").value("2026-01-01"))
            .andExpect(jsonPath("$.entries[0].cyclePeriodEnd").value("2026-01-15"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        when(ledgerService.adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AdminLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/admin/ledger")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.entries").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(ledgerService.adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(100)))
            .thenReturn(new AdminLedgerPageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/admin/ledger").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(ledgerService).adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(100));
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(ledgerService.adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(20)))
            .thenReturn(new AdminLedgerPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/admin/ledger").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(ledgerService).adminList(isNull(), isNull(), isNull(), isNull(), eq(0), eq(20));
    }

    @Test
    void listReturns400ForAnInvalidIncomeTypeValue() throws Exception {
        mockMvc.perform(get("/api/admin/ledger").param("incomeType", "NOT_A_TYPE")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for incomeType"));
    }

    @Test
    void listReturns400ForAnInvalidUuidInAssociateId() throws Exception {
        mockMvc.perform(get("/api/admin/ledger").param("associateId", "not-a-uuid")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("invalid value for associateId"));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/ledger")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void listIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/ledger"))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mvn test -Dtest=LedgerControllerTest`
Expected: compile failure — `LedgerController` doesn't exist yet, so `GET /api/admin/ledger` 404s / the mock is never satisfied.

- [ ] **Step 3: Implement `LedgerController`**

Create `backend/src/main/java/com/plotchain/income/LedgerController.java`:

```java
package com.plotchain.income;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Income/Ledger unit 1 (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
// Decision 2): this class carries the /api/admin/ledger prefix at the class level. A follow-up
// unit adds a separate bare @RestController (no class-level prefix, full-path method mapping)
// for GET /api/associates/me/ledger -- the same split SaleController/AssociateSaleController
// already use, and for the same reason: Spring composes class-level + method-level paths, so an
// absolute method path declared here would NOT override "/api/admin/ledger". Both controllers
// will share one LedgerService; there's no write path on this domain to justify separate
// service classes either.
@RestController
@RequestMapping("/api/admin/ledger")
public class LedgerController {

    private final LedgerService ledgerService;

    public LedgerController(LedgerService ledgerService) {
        this.ledgerService = ledgerService;
    }

    @GetMapping
    public AdminLedgerPageResponse list(
            @RequestParam(required = false) UUID associateId,
            @RequestParam(required = false) IncomeType incomeType,
            @RequestParam(required = false) UUID cycleId,
            @RequestParam(required = false) LedgerEntryStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return ledgerService.adminList(associateId, incomeType, cycleId, status, page, size);
    }
}
```

- [ ] **Step 4: Add the `SecurityConfig` matcher**

Edit `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`. Insert a new matcher directly after the existing `GET /api/admin/cycles/*` matcher block (the one ending `.hasAuthority("ADMIN")` right before the "Phase 5's genuinely public endpoints" comment):

```java
                // Admin ledger register: ADMIN-only, Income/Ledger unit 1
                // (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
                // "Admin ledger register -- GET /api/admin/ledger, ADMIN-only" and the Testing
                // section: "associate token gets 403"), same target-role-model pattern as GET
                // /api/admin/cycles directly above and GET /api/admin/sales further up -- not the
                // admin-family hasAnyAuthority(...) pattern most other admin GETs still use. A GET
                // never collides with the POST/PUT/PATCH/DELETE blanket rules above, so there's
                // no first-match-wins ordering requirement forcing this matcher to live in any
                // one spot.
                .requestMatchers(HttpMethod.GET, "/api/admin/ledger")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 5: Add the `SecurityConfigTest` role-matrix test**

Edit `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`. Add this test after `adminSalesListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (or wherever the most recent list-endpoint role-matrix test sits), using the same `@ParameterizedTest @EnumSource(AssociateRole.class)` shape. `LedgerEntryRepository` is not `@MockBean`'d in this test class, so it runs against the real, empty H2 test datastore — a `GET` with no filters returns 200 with an empty page for the ADMIN token, the same "no not-found case for a list endpoint" reasoning `adminSalesListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` already documents. `AssociateRepository`/`CycleRepository` are already `@MockBean`'d in this class (used by other tests) — Mockito's default answer returns an empty list for `findAllById(...)` with no stubbing needed, since the search result is empty and neither batch-load method gets a non-empty id list to look up.

```java
    // Income/Ledger unit 1: GET /api/admin/ledger is ADMIN-only, the same target-role-model
    // pattern as GET /api/admin/sales and GET /api/admin/cycles above. An ADMIN token reaches the
    // real (H2, unmocked) LedgerEntryRepository and gets 200 with an empty page -- there's no
    // not-found case for a list endpoint. Every other role, including the soon-to-be-deleted
    // admin-family sub-roles, is blocked at the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminLedgerListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/ledger")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }
```

- [ ] **Step 6: Run both new/modified test classes to verify everything passes**

Run: `mvn test -Dtest=LedgerControllerTest,SecurityConfigTest`
Expected: PASS.

- [ ] **Step 7: Run the full backend test suite**

Run (from `backend/`): `mvn test`
Expected: PASS — confirms nothing in the shared `SecurityConfig` matcher chain, `LedgerEntryRepository`, or any other package's tests regressed.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/income/LedgerController.java backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/income/LedgerControllerTest.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(income): add GET /api/admin/ledger, ADMIN-only admin ledger register"
```

---

## Self-Review Notes

- **Spec coverage:** All of unit 1's acceptance criteria are covered — cross-associate visibility when unfiltered, sorted `createdAt DESC` (Task 1); independent and combined filtering on `associateId`/`incomeType` (incl. `PERK`, no special-casing anywhere in the code)/`cycleId`/`status` (Task 1); page/size clamping with the stated defaults (Task 3); `AdminLedgerPageResponse`/`AdminLedgerEntryResponse` shape mirroring `AdminAssociatePageResponse` with batch-loaded associate/cycle fields and nullable `sourceRef` (Task 2); non-existent `associateId` or non-matching filter combination returning 200 with an empty page (Task 1's `searchReturnsAnEmptyPageWhenNoEntryMatchesTheGivenFilters`, Task 2's `adminListReturnsAnEmptyPageWhenSearchFindsNothingWithoutCallingBatchLookups`, Task 3's `listReturns200WithAnEmptyPageWhenUnfiltered`); invalid enum/UUID query values returning 400 via the existing generic handler (Task 3's two 400 tests); ADMIN-only 403 for an associate token and 401 unauthenticated (Task 3's `LedgerControllerTest` tests plus the `SecurityConfigTest` role matrix).
- **Placeholder scan:** no TBD/TODO markers; every step has literal code.
- **Type consistency:** `LedgerEntryRepository.search(UUID, IncomeType, UUID, LedgerEntryStatus, Pageable): Page<LedgerEntry>` is identical between Task 1's definition and Task 2's call site. `LedgerService.adminList(UUID, IncomeType, UUID, LedgerEntryStatus, int, int): AdminLedgerPageResponse` is the same signature used to define it in Task 2 and to call it in Task 3's controller and controller test. `AdminLedgerPageResponse(List<AdminLedgerEntryResponse> entries, int page, int size, long totalElements)` and `AdminLedgerEntryResponse(...)`'s 15-field shape match across Task 2's definition, Task 2's test assertions, and Task 3's controller test JSON assertions.
- **Unit 2 seam check:** `LedgerService`'s constructor takes exactly the three repositories both endpoints need (`LedgerEntryRepository`, `AssociateRepository`, `CycleRepository`); `cyclesById(...)` is already factored out as its own private method so a follow-up `myList(...)` method can call it without duplicating the batch-load logic. `LedgerController` is a class-level-`@RequestMapping` controller (not a bare one), matching the `SaleController`/`AssociateSaleController` split so unit 2 can add its own bare `AssociateLedgerController` class without touching this one.
