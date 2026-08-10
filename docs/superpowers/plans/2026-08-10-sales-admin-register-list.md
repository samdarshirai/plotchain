# Sales Admin Register List (Sales unit 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/admin/sales`, an ADMIN-only, paginated, filterable register of `Sale` rows, matching the pagination/filter/clamping conventions `AdminAssociateController.list()` and `CycleController.list()` already establish in this codebase.

**Architecture:** A new `SaleRepository.searchRegister(...)` JPQL query (same optional-filter-via-`IS NULL OR` pattern as `AssociateRepository.searchDirectory`) backs a new `SaleService.list(...)` method, which maps the resulting `Page<Sale>` into a new `AdminSalePageResponse` record (reusing the existing `SaleResponse` for each row — `Sale` has no separate summary/detail split, unlike `Associate`). `SaleController` exposes this as `GET /api/admin/sales` with the same `page`/`size` clamping every other admin list endpoint uses. `SecurityConfig` gets one new ADMIN-only matcher, following the `GET /api/admin/cycles` precedent (target role model, not the `hasAnyAuthority(admin-family)` pattern most other admin GETs still use) — the source spec's Testing section states record/void/register are all ADMIN-only.

**Tech Stack:** Spring Boot 3 (Spring Data JPA, Spring Security, Spring MVC), JUnit 5 + Mockito + AssertJ, MockMvc, H2 (Postgres-compatibility mode) for repository/integration tests, Maven (`mvn test -Dtest=ClassName` from `backend/`).

## Global Constraints

- Page/size clamping: `page = Math.max(page, 0)`, `size = Math.min(size, 100)` — done in the controller, exactly like `AdminAssociateController.list()` and `CycleController.list()`. Default `page=0`, `size=20`.
- All four filters (`associateId`, `status`, `recordedFrom`, `recordedTo`) are optional; omitting all of them returns every `Sale` row, paginated.
- `recordedTo` is inclusive from the caller's point of view but must be converted to an **exclusive** upper-bound `Instant` internally (`recordedTo.plusDays(1)` at UTC midnight) — same convention as `AdminAssociateService.list()`'s `joinedFrom`/`joinedTo` handling, because `recorded_at` is a `TIMESTAMP` column and a same-day `Instant` sits after midnight.
- `GET /api/admin/sales` is ADMIN-only (`hasAuthority("ADMIN")`), not the `hasAnyAuthority(admin-family)` pattern — per the source spec's Testing section ("record/void/register are ADMIN-only") and matching the existing `POST /api/admin/sales` / `POST /api/admin/sales/{id}/void` matchers already in `SecurityConfig`.
- No new database migration. `sale.associate_id` already has an index (`idx_sale_associate_id`, V16); `status`/`recorded_at` get no new index, mirroring how `AssociateRepository.searchDirectory`'s `rankId`/`kycStatus`/`status`/`joinedAt` filters have none either — this codebase doesn't index list-endpoint filter columns as a matter of course.
- Response shape reuses the existing `SaleResponse` record for each row (all fields Sale has are already on it) — do not invent a narrower summary type; `Sale` has no detail-vs-summary split the way `Associate` does.

---

## File Structure

- **Modify** `backend/src/main/java/com/plotchain/sales/SaleRepository.java` — add `searchRegister(...)`.
- **Create** `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java` — `@DataJpaTest` covering the new query directly against H2.
- **Create** `backend/src/main/java/com/plotchain/sales/AdminSalePageResponse.java` — page envelope record.
- **Modify** `backend/src/main/java/com/plotchain/sales/SaleService.java` — add `list(...)`.
- **Modify** `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java` — add `list(...)` tests (mocked repository).
- **Modify** `backend/src/main/java/com/plotchain/sales/SaleController.java` — add `GET` mapping.
- **Modify** `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add the ADMIN-only matcher for `GET /api/admin/sales`.
- **Modify** `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java` — add "200 on list with filters" test (mocked `SaleService`, per this file's existing convention).
- **Modify** `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add the ADMIN-only role-matrix test, mirroring the existing void-endpoint one.

---

### Task 1: `SaleRepository.searchRegister(...)` — the filtered, paginated query

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleRepository.java`
- Test: `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java` (new)

**Interfaces:**
- Consumes: `Sale` (existing entity, `backend/src/main/java/com/plotchain/sales/Sale.java`), `SaleStatus` enum (`RECORDED`, `VOIDED`).
- Produces: `SaleRepository.searchRegister(UUID associateId, SaleStatus status, Instant recordedFrom, Instant recordedToExclusive, Pageable pageable): Page<Sale>` — Task 2's `SaleService.list(...)` calls this directly.

- [ ] **Step 1: Write the failing repository test**

Create `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java`. `Sale` has three `NOT NULL` FKs (`plot_id -> plot`, `associate_id -> associate`, `cycle_id -> cycle`), all enforced by the real H2 (Postgres-mode) test datasource — so fixtures must persist real `Project`/`Plot`/`Associate`/`Cycle` rows first, not random UUIDs. The `Associate` fixture uses `AssociateRole.ADMIN` (not `ASSOCIATE`) to sidestep the `chk_associate_rank_required` constraint, the same trick `SaleRecordConcurrencyTest.seedAssociate()` already uses for the identical reason.

```java
package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class SaleRepositoryTest {

    @Autowired SaleRepository saleRepository;
    @Autowired TestEntityManager entityManager;

    private UUID persistProject() {
        Project project = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
        return entityManager.persist(project).getId();
    }

    private UUID persistPlot(UUID projectId) {
        Plot plot = new Plot(UUID.randomUUID(), projectId, "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.SOLD);
        return entityManager.persist(plot).getId();
    }

    private UUID persistAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Test Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        // ADMIN, not ASSOCIATE: chk_associate_rank_required (V4) demands a rank_id for any
        // ASSOCIATE row. This fixture only needs a persistable, FK-satisfying associate row,
        // same reasoning as SaleRecordConcurrencyTest.seedAssociate().
        associate.setRole(AssociateRole.ADMIN);
        return entityManager.persist(associate).getId();
    }

    private UUID persistCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 1, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 1, 15));
        cycle.setStatus(CycleStatus.OPEN);
        return entityManager.persist(cycle).getId();
    }

    private Sale persistSale(UUID associateId, UUID plotId, UUID cycleId, SaleStatus status, Instant recordedAt) {
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setPlotId(plotId);
        sale.setAssociateId(associateId);
        sale.setBuyerName("Jane Buyer");
        sale.setBuyerPhone("9999999999");
        sale.setAmount(new BigDecimal("600000.00"));
        sale.setCycleId(cycleId);
        sale.setLegCredited("L");
        sale.setStatus(status);
        sale.setRecordedAt(recordedAt);
        return entityManager.persist(sale);
    }

    @Test
    void searchRegisterFiltersByAssociateIdAndStatus() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateA = persistAssociate();
        UUID associateB = persistAssociate();
        Sale recordedForA = persistSale(associateA, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        persistSale(associateA, plotId, cycleId, SaleStatus.VOIDED, Instant.now());
        Sale recordedForB = persistSale(associateB, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        entityManager.flush();

        Page<Sale> byAssociate = saleRepository.searchRegister(associateA, null, null, null, PageRequest.of(0, 20));
        assertThat(byAssociate.getContent()).hasSize(2)
            .allMatch(s -> s.getAssociateId().equals(associateA));

        Page<Sale> byStatus = saleRepository.searchRegister(null, SaleStatus.RECORDED, null, null, PageRequest.of(0, 20));
        assertThat(byStatus.getContent()).extracting(Sale::getId)
            .containsExactlyInAnyOrder(recordedForA.getId(), recordedForB.getId());

        Page<Sale> byBoth = saleRepository.searchRegister(associateA, SaleStatus.RECORDED, null, null, PageRequest.of(0, 20));
        assertThat(byBoth.getContent()).extracting(Sale::getId).containsExactly(recordedForA.getId());

        Page<Sale> noFilters = saleRepository.searchRegister(null, null, null, null, PageRequest.of(0, 20));
        assertThat(noFilters.getTotalElements()).isEqualTo(3);
    }

    @Test
    void searchRegisterFiltersByRecordedDateRangeUsingAnExclusiveUpperBound() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();
        Instant inRange = Instant.parse("2026-01-15T00:00:00Z");
        Instant outOfRange = Instant.parse("2026-02-15T00:00:00Z");
        Sale inRangeSale = persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, inRange);
        persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, outOfRange);
        entityManager.flush();

        Page<Sale> result = saleRepository.searchRegister(
            null, null,
            Instant.parse("2026-01-01T00:00:00Z"), Instant.parse("2026-02-01T00:00:00Z"),
            PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Sale::getId).containsExactly(inRangeSale.getId());
    }

    @Test
    void searchRegisterOrdersByRecordedAtDescending() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateId = persistAssociate();
        Instant earlier = Instant.parse("2026-01-10T00:00:00Z");
        Instant later = Instant.parse("2026-01-20T00:00:00Z");
        Sale earlierSale = persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, earlier);
        Sale laterSale = persistSale(associateId, plotId, cycleId, SaleStatus.RECORDED, later);
        entityManager.flush();

        Page<Sale> result = saleRepository.searchRegister(null, null, null, null, PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Sale::getId)
            .containsExactly(laterSale.getId(), earlierSale.getId());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `mvn test -Dtest=SaleRepositoryTest`
Expected: compile failure — `searchRegister` is not a method on `SaleRepository`.

- [ ] **Step 3: Implement `searchRegister(...)` on `SaleRepository`**

Edit `backend/src/main/java/com/plotchain/sales/SaleRepository.java`:

```java
package com.plotchain.sales;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface SaleRepository extends JpaRepository<Sale, UUID> {

    // Cycle-management unit 4 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #4 / Data model section): owned by the Sales package but added here since Sales'
    // own units never needed it -- the settlement batch's one query to load this cycle's
    // RECORDED sale volume for the in-memory leg-volume rollup. VOIDED sales are excluded by
    // the status filter; the batch never sees them.
    List<Sale> findByCycleIdAndStatus(UUID cycleId, SaleStatus status);

    // Sales unit 6 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Admin register -- GET /api/admin/sales"): all four filters are optional (null = "don't
    // filter on this"), same IS NULL OR pattern as AssociateRepository.searchDirectory.
    // recordedToExclusive is an EXCLUSIVE upper bound, same convention as searchDirectory's
    // joinedToExclusive: callers pass the day AFTER the last day to include.
    // recordedFrom/recordedToExclusive get the explicit CAST(... AS timestamp) treatment
    // searchDirectory's joinedFrom/joinedToExclusive use, for the same reason documented there:
    // Postgres must assign every bind parameter a static type up front, and a bare Instant used
    // only in an "? IS NULL" check with no adjoining comparison at that position can't be
    // inferred otherwise. associateId/status don't need it -- Hibernate resolves UUID- and
    // enum-typed parameters from their Java type alone.
    // ORDER BY recordedAt DESC: newest-first, the natural read order for a running sales log.
    @Query("""
        SELECT s FROM Sale s
        WHERE (:associateId IS NULL OR s.associateId = :associateId)
        AND (:status IS NULL OR s.status = :status)
        AND (CAST(:recordedFrom AS timestamp) IS NULL OR s.recordedAt >= :recordedFrom)
        AND (CAST(:recordedToExclusive AS timestamp) IS NULL OR s.recordedAt < :recordedToExclusive)
        ORDER BY s.recordedAt DESC
        """)
    Page<Sale> searchRegister(
        @Param("associateId") UUID associateId,
        @Param("status") SaleStatus status,
        @Param("recordedFrom") Instant recordedFrom,
        @Param("recordedToExclusive") Instant recordedToExclusive,
        Pageable pageable);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mvn test -Dtest=SaleRepositoryTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleRepository.java backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java
git commit -m "feat(sales): add SaleRepository.searchRegister for the admin sales register"
```

---

### Task 2: `SaleService.list(...)` and `AdminSalePageResponse`

**Files:**
- Create: `backend/src/main/java/com/plotchain/sales/AdminSalePageResponse.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `SaleRepository.searchRegister(UUID, SaleStatus, Instant, Instant, Pageable): Page<Sale>` (Task 1). `SaleService`'s existing private `toResponse(Sale): SaleResponse` (already defined at the bottom of `SaleService.java`, reused unchanged here).
- Produces: `SaleService.list(UUID associateId, SaleStatus status, LocalDate recordedFrom, LocalDate recordedTo, int page, int size): AdminSalePageResponse`. `AdminSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements)` — Task 3's `SaleController.list()` returns this directly.

- [ ] **Step 1: Write the failing service tests**

Add to `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`. First add these imports alongside the existing ones near the top of the file:

```java
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.util.List;
```

(`ArgumentCaptor` is already imported; `Instant`/`LocalDate`/`UUID` are already imported. Only add the ones not already present — check the existing import block before duplicating.)

Then add these tests at the end of the class, before the closing brace, mirroring `AdminAssociateServiceTest.listReturnsAPageMappedToSummaries` / `listConvertsJoinedDateRangeToAnExclusiveUpperBoundInstant`:

```java
    // Sales unit 6 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Admin register -- GET /api/admin/sales"): list() delegation and date-range conversion.
    @Test
    void listReturnsAPageMappedToSaleResponses() {
        Sale sale = recordedSale(UUID.randomUUID(), PLOT_ID);
        when(saleRepository.searchRegister(
            eq(ASSOCIATE_ID), eq(SaleStatus.RECORDED), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(java.util.List.of(sale), PageRequest.of(0, 20), 1));

        AdminSalePageResponse response = saleService.list(ASSOCIATE_ID, SaleStatus.RECORDED, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.sales()).hasSize(1);
        assertThat(response.sales().get(0).id()).isEqualTo(sale.getId());
        assertThat(response.sales().get(0).status()).isEqualTo("RECORDED");
    }

    @Test
    void listConvertsRecordedDateRangeToAnExclusiveUpperBoundInstant() {
        when(saleRepository.searchRegister(isNull(), isNull(), any(), any(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(java.util.List.of()));

        saleService.list(null, null, LocalDate.of(2026, 1, 1), LocalDate.of(2026, 1, 31), 0, 20);

        ArgumentCaptor<Instant> fromCaptor = ArgumentCaptor.forClass(Instant.class);
        ArgumentCaptor<Instant> toCaptor = ArgumentCaptor.forClass(Instant.class);
        verify(saleRepository).searchRegister(isNull(), isNull(), fromCaptor.capture(), toCaptor.capture(), any());
        assertThat(fromCaptor.getValue()).isEqualTo(Instant.parse("2026-01-01T00:00:00Z"));
        // Exclusive upper bound: the day AFTER recordedTo, so Jan 31 itself is included.
        assertThat(toCaptor.getValue()).isEqualTo(Instant.parse("2026-02-01T00:00:00Z"));
    }

    @Test
    void listPassesNullFiltersThroughWhenNoneAreProvided() {
        when(saleRepository.searchRegister(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(java.util.List.of()));

        AdminSalePageResponse response = saleService.list(null, null, null, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(0);
        verify(saleRepository).searchRegister(isNull(), isNull(), isNull(), isNull(), eq(PageRequest.of(0, 20)));
    }
```

`SaleServiceTest` already has `import static org.mockito.ArgumentMatchers.any;` and `import static org.mockito.Mockito.verify;` / `when`. Add `import static org.mockito.ArgumentMatchers.eq;` and `import static org.mockito.ArgumentMatchers.isNull;` if not already present (check the existing static-import block first).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mvn test -Dtest=SaleServiceTest`
Expected: compile failure — `SaleService.list(...)` and `AdminSalePageResponse` don't exist yet.

- [ ] **Step 3: Create `AdminSalePageResponse`**

Create `backend/src/main/java/com/plotchain/sales/AdminSalePageResponse.java`:

```java
package com.plotchain.sales;

import java.util.List;

public record AdminSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements) {}
```

- [ ] **Step 4: Implement `SaleService.list(...)`**

Edit `backend/src/main/java/com/plotchain/sales/SaleService.java`. Add these imports to the existing import block:

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.time.ZoneOffset;
import java.util.List;
```

(`UUID`, `BigDecimal`, `Instant`, `LocalDate` are already imported.)

Add this method, placed after `voidSale(...)` and before the private `toResponse(Sale)` helper:

```java
    // Sales unit 6 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Admin register -- GET /api/admin/sales"): same optional-filter, page/size-clamped-by-the-
    // caller pattern as AdminAssociateService.list(). recordedTo is converted to an EXCLUSIVE
    // upper-bound Instant the same way joinedTo is in that method -- recorded_at is a TIMESTAMP
    // column, so a bare same-day Instant would exclude same-day sales on the last day requested.
    public AdminSalePageResponse list(
            UUID associateId, SaleStatus status, LocalDate recordedFrom, LocalDate recordedTo, int page, int size) {
        Instant recordedFromInstant = recordedFrom == null
            ? null : recordedFrom.atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant recordedToExclusive = recordedTo == null
            ? null : recordedTo.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();

        Page<Sale> result = saleRepository.searchRegister(
            associateId, status, recordedFromInstant, recordedToExclusive, PageRequest.of(page, size));

        List<SaleResponse> sales = result.getContent().stream().map(this::toResponse).toList();
        return new AdminSalePageResponse(sales, page, size, result.getTotalElements());
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `mvn test -Dtest=SaleServiceTest`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/AdminSalePageResponse.java backend/src/main/java/com/plotchain/sales/SaleService.java backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): add SaleService.list for the admin sales register"
```

---

### Task 3: `GET /api/admin/sales` controller endpoint + security matcher

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `SaleService.list(UUID, SaleStatus, LocalDate, LocalDate, int, int): AdminSalePageResponse` (Task 2).
- Produces: `GET /api/admin/sales` HTTP endpoint — the unit's actual deliverable, nothing downstream consumes this in Java.

- [ ] **Step 1: Write the failing controller test**

Add to `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`, at the end of the class before the closing brace. Add `import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;` to the existing static imports if not already present, and `import java.util.List;` to the plain imports.

```java
    @Test
    void listReturns200WithFilters() throws Exception {
        UUID saleId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        SaleResponse sale = new SaleResponse(
            saleId, UUID.randomUUID(), associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), UUID.randomUUID(), "L", "RECORDED", null, Instant.now());
        AdminSalePageResponse page = new AdminSalePageResponse(List.of(sale), 0, 20, 1);
        when(saleService.list(eq(associateId), eq(SaleStatus.RECORDED), any(), any(), eq(0), eq(20)))
            .thenReturn(page);

        mockMvc.perform(get("/api/admin/sales")
                .param("associateId", associateId.toString())
                .param("status", "RECORDED")
                .param("recordedFrom", "2026-01-01")
                .param("recordedTo", "2026-01-31")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sales[0].id").value(saleId.toString()))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
```

`SaleControllerTest` already imports `static org.mockito.ArgumentMatchers.any;` and `static org.mockito.ArgumentMatchers.eq;`. Confirm both are present (both are used by the existing void tests) before relying on them here.

- [ ] **Step 2: Run the test to verify it fails**

Run: `mvn test -Dtest=SaleControllerTest`
Expected: compile failure — `SaleService.list(...)` exists (Task 2), but `SaleController` has no `GET` mapping yet, so the request 404s / the mock is never satisfied. (If it compiles, expect a 404 or 403 rather than 200, since the route doesn't exist.)

- [ ] **Step 3: Add the `GET` mapping to `SaleController`**

Edit `backend/src/main/java/com/plotchain/sales/SaleController.java`. Add these imports:

```java
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.time.LocalDate;
```

Add this method, after the constructor and before `record(...)` (or after `voidSale(...)` — placement within the class doesn't matter, but keep it grouped with the other two sale-lifecycle endpoints):

```java
    @GetMapping
    public AdminSalePageResponse list(
            @RequestParam(required = false) UUID associateId,
            @RequestParam(required = false) SaleStatus status,
            @RequestParam(required = false) LocalDate recordedFrom,
            @RequestParam(required = false) LocalDate recordedTo,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return saleService.list(associateId, status, recordedFrom, recordedTo, page, size);
    }
```

- [ ] **Step 4: Add the `SecurityConfig` matcher**

Edit `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`. Insert a new matcher directly after the existing `POST /api/admin/sales/*/void` matcher (the block ending `.hasAuthority("ADMIN")` right before `.requestMatchers(HttpMethod.POST, "/api/**")`):

```java
                // Admin sales register: ADMIN-only, per Sales unit 6
                // (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
                // "Admin register -- GET /api/admin/sales, ADMIN-only" and the Testing section:
                // "record/void/register are ADMIN-only"), same target-role-model pattern as the
                // record/void matchers directly above and GET /api/admin/cycles further down --
                // not the admin-family hasAnyAuthority(...) pattern most other admin GETs still
                // use. Grouped here with the other /api/admin/sales matchers for readability; a
                // GET never collides with the POST/PUT/PATCH/DELETE blanket rules above
                // regardless of placement, so there's no first-match-wins ordering requirement
                // forcing it to live in one spot over the other.
                .requestMatchers(HttpMethod.GET, "/api/admin/sales")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 5: Add the `SecurityConfigTest` role-matrix test**

Edit `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`. Add this test after `adminSalesVoidIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (the existing void role-matrix test), using the same `@ParameterizedTest @EnumSource(AssociateRole.class)` shape. Unlike the record/void matrices, the ADMIN branch here asserts `200`, not `404`: `SaleRepository` is unmocked in this test class (runs against the real, empty H2 test datastore), so a `GET` with no filters simply returns an empty page — 200, not a not-found.

```java
    // Sales unit 6: GET /api/admin/sales is ADMIN-only, the same target-role-model pattern as
    // the record/void matchers above and GET /api/admin/cycles further up. An ADMIN token
    // reaches the real (H2, unmocked) SaleRepository and gets 200 with an empty page -- there's
    // no not-found case for a list endpoint, unlike record/void's single-resource lookups.
    // Every other role, including the soon-to-be-deleted admin-family sub-roles, is blocked at
    // the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSalesListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/sales")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }
```

- [ ] **Step 6: Run both test classes to verify everything passes**

Run: `mvn test -Dtest=SaleControllerTest,SecurityConfigTest`
Expected: PASS.

- [ ] **Step 7: Run the full backend test suite**

Run (from `backend/`): `mvn test`
Expected: PASS — confirms nothing in the shared `SecurityConfig` matcher chain or `SaleService`/`SaleController` regressed any earlier unit (record, void).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleController.java backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/sales/SaleControllerTest.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(sales): add GET /api/admin/sales, ADMIN-only admin sales register"
```

---

## Self-Review Notes

- **Spec coverage:** "Admin register — GET /api/admin/sales, ADMIN-only... optional filters associateId, status, recordedFrom/recordedTo, page/size (clamped 0-100)" is covered end to end (Tasks 1–3). The Testing section's one named requirement ("200 on list with filters") is covered by `listReturns200WithFilters` in Task 3, plus the `SecurityConfigTest` ADMIN-only matrix and the repository/service-level filter tests that go a level deeper than the spec's one-line requirement, matching how thoroughly units 2–5 were already tested in this codebase.
- **Placeholder scan:** no TBD/TODO markers; every step has literal code.
- **Type consistency:** `SaleService.list(UUID, SaleStatus, LocalDate, LocalDate, int, int): AdminSalePageResponse` is the same signature used to define it in Task 2 and to call it in Task 3's controller. `SaleRepository.searchRegister(UUID, SaleStatus, Instant, Instant, Pageable): Page<Sale>` is identical between Task 1's definition and Task 2's call site. `AdminSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements)` matches its one usage site in `SaleService.list(...)` and its one read site in the Task 3 controller test (`page.sales[0].id`).
