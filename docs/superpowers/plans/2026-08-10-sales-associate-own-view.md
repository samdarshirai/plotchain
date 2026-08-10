# Sales Associate Own View (Sales unit 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/associates/me/sales`, reachable by any authenticated associate, returning a paginated, view-only page of `Sale` rows for the caller and their full descendant subtree — self plus every associate below them in the binary tree.

**Architecture:** A new `AssociateRepository.findSelfAndDownlineIds(...)` native recursive-CTE query (mirroring `findAncestorChainIds`'s exact `CAST(... AS VARCHAR)`/parse-back pattern for H2-vs-Postgres driver compatibility) resolves the caller's self-plus-downline ID set. A new `SaleRepository.findByAssociateIdInOrderByRecordedAtDesc(...)` derived query filters `Sale` rows down to that ID set. `SaleService.getMySales(...)` composes the two and maps the result into a new `AssociateSalePageResponse` (a distinct record from the existing `AdminSalePageResponse`, following this codebase's per-endpoint page-envelope convention — e.g. `AdminAssociatePageResponse` is never reused outside its own admin endpoint either). A new `AssociateSaleController` — a bare `@RestController` with one `@GetMapping`, mirroring `DashboardController`'s and `PasswordController`'s shape, not added to the existing ADMIN-only `SaleController` (whose class-level `@RequestMapping("/api/admin/sales")` would make an absolute-path method mapping compose incorrectly) — resolves the caller's ID via `@AuthenticationPrincipal UUID associateId`, exactly like those two controllers already do. No `SecurityConfig` matcher is needed: a bare `GET` never collides with the blanket `POST`/`PUT`/`PATCH`/`DELETE` write rules, so the route falls through to `anyRequest().authenticated()` the same way `GET /api/associates/me/dashboard` already does with no matcher of its own.

**Tech Stack:** Spring Boot 3 (Spring Data JPA, Spring Security, Spring MVC), JUnit 5 + Mockito + AssertJ, MockMvc, H2 (Postgres-compatibility mode) for repository/integration tests, Maven (`mvn test -Dtest=ClassName` from `backend/`).

## Global Constraints

- Page/size clamping: `page = Math.max(page, 0)`, `size = Math.min(size, 100)` — done in the controller, exactly like `SaleController.list()` and every other paginated endpoint in this codebase. Default `page=0`, `size=20`.
- The caller's associate ID always comes from `@AuthenticationPrincipal UUID associateId` (the verified JWT subject) — never from a request parameter. This endpoint has no `associateId` query param at all; it is self-scoped by construction, the same comment already on `PasswordController.changePassword(...)`.
- `findSelfAndDownlineIds` returns `List<String>`, parsed to `List<UUID>` in a `default` method — the same H2-vs-Postgres driver reasoning already documented on `AssociateRepository.findAncestorChainIds`: a bare native scalar query needs the `CAST(... AS VARCHAR)`/parse-back pattern to behave identically on both databases (Postgres's driver returns `java.util.UUID` for a `uuid` column; H2's driver returns a raw `byte[]`, which has no `ConversionService` path to `UUID` and blows up only in H2-backed tests).
- The recursive CTE's base case is `id = :associateId` (not `parent_id = :associateId` like `countDownline`), because the caller's own sales must be included, not just descendants'.
- No new database migration — both `sale` and `associate` already have every column this unit's queries need.
- No new `SecurityConfig` matcher — `GET /api/associates/me/sales` reaches `anyRequest().authenticated()` on its own, matching `GET /api/associates/me/dashboard`.
- Response shape is `AssociateSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements)` — reuses the existing `SaleResponse` record for each row, a new page-envelope record for this endpoint (do not reuse `AdminSalePageResponse`, which is scoped to `/api/admin/sales`).

---

## File Structure

- **Modify** `backend/src/main/java/com/plotchain/associate/AssociateRepository.java` — add `findSelfAndDownlineIds(...)` + `findSelfAndDownline(...)` default method.
- **Modify** `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java` — add the new query's test.
- **Modify** `backend/src/main/java/com/plotchain/sales/SaleRepository.java` — add `findByAssociateIdInOrderByRecordedAtDesc(...)`.
- **Modify** `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java` — add the new query's test.
- **Create** `backend/src/main/java/com/plotchain/sales/AssociateSalePageResponse.java` — page envelope record.
- **Modify** `backend/src/main/java/com/plotchain/sales/SaleService.java` — add `getMySales(...)`.
- **Modify** `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java` — add `getMySales(...)` tests (mocked repositories).
- **Create** `backend/src/main/java/com/plotchain/sales/AssociateSaleController.java` — the new self-service controller.
- **Create** `backend/src/test/java/com/plotchain/sales/AssociateSaleControllerTest.java` — MockMvc + real JWT, mirroring `SaleControllerTest`'s shape.
- **Modify** `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add the "reachable by an associate token" test.

---

### Task 1: `AssociateRepository.findSelfAndDownlineIds(...)` — self plus full descendant subtree

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Consumes: `Associate` (existing entity, `backend/src/main/java/com/plotchain/associate/Associate.java`) — `id`, `parentId` columns.
- Produces: `AssociateRepository.findSelfAndDownline(UUID associateId): List<UUID>` — Task 3's `SaleService.getMySales(...)` calls this directly. (The raw native-query method `findSelfAndDownlineIds(UUID associateId): List<String>` is also on the interface, same two-method shape as `findAncestorChainIds`/`findAncestorChain`, but nothing outside this file calls the raw one directly.)

- [ ] **Step 1: Write the failing repository test**

Add to `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`, after `findAncestorChainReturnsRootToTargetInclusiveInOrder` (the last test in the file, just before the private helper methods):

```java
    @Test
    void findSelfAndDownlineReturnsTheCallerPlusEveryDescendantExcludingSiblingsAncestorsAndUnrelated() {
        RankTier rank = persistRank("Sales Associate", 1);
        Associate root = persistAssociate("VP00001", "Root", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        Associate caller = persistAssociate("VP00002", "Caller", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        caller.setParentId(root.getId());
        Associate sibling = persistAssociate("VP00003", "Sibling", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        sibling.setParentId(root.getId());
        Associate child = persistAssociate("VP00004", "Child", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        child.setParentId(caller.getId());
        Associate grandchild = persistAssociate("VP00005", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
        Associate unrelated = persistAssociate("VP00006", "Unrelated", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        entityManager.flush();

        List<UUID> ids = associateRepository.findSelfAndDownline(caller.getId());

        // Includes the caller itself (base case is id = :associateId, not parent_id =
        // :associateId like countDownline) plus every descendant, however deep.
        assertThat(ids).containsExactlyInAnyOrder(caller.getId(), child.getId(), grandchild.getId());
        // Excludes the sibling (same parent, not a descendant), the ancestor (root), and an
        // unrelated associate in a different branch entirely.
        assertThat(ids).doesNotContain(root.getId(), sibling.getId(), unrelated.getId());
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `mvn test -Dtest=AssociateRepositoryTest`
Expected: compile failure — `findSelfAndDownline` is not a method on `AssociateRepository`.

- [ ] **Step 3: Implement `findSelfAndDownlineIds(...)` and `findSelfAndDownline(...)` on `AssociateRepository`**

Edit `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`. Add this method and default method after `findAncestorChain(...)` (right before the `searchDirectory` comment block):

```java
    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales"): the associate's own sales plus
    // their full descendant subtree, for SaleService.getMySales() to filter Sale rows by.
    //
    // Base case is id = :associateId, not parent_id = :associateId like countDownline above --
    // this list must include the caller's own sales too, not just descendants'.
    //
    // Returns String, not UUID, cast via CAST(id AS VARCHAR): the same H2-vs-Postgres driver
    // reasoning as findAncestorChainIds above -- a bare native scalar query leaves Hibernate to
    // trust whatever the JDBC driver's getObject() hands back for the column, and H2's driver
    // returns a raw byte[] for a uuid column where Postgres's returns java.util.UUID, blowing
    // up with ConverterNotFoundException in H2-backed tests only. CAST to VARCHAR sidesteps the
    // driver-specific mapping and is standard SQL on both databases; the default method below
    // parses the canonical UUID text form back into UUID in Java. Do not "simplify" this back to
    // List<UUID> on the native query -- it will pass on Postgres and fail on H2.
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT CAST(id AS VARCHAR) FROM downline
        """, nativeQuery = true)
    List<String> findSelfAndDownlineIds(@Param("associateId") UUID associateId);

    default List<UUID> findSelfAndDownline(UUID associateId) {
        return findSelfAndDownlineIds(associateId).stream().map(UUID::fromString).toList();
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mvn test -Dtest=AssociateRepositoryTest`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRepository.java backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat(associate): add findSelfAndDownline for the associate own-sales view"
```

---

### Task 2: `SaleRepository.findByAssociateIdInOrderByRecordedAtDesc(...)` — filter by the ID set

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleRepository.java`
- Test: `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java`

**Interfaces:**
- Consumes: `Sale` (existing entity), `SaleStatus` enum — no direct dependency on Task 1, only on `Sale`'s existing `associateId`/`recordedAt` columns.
- Produces: `SaleRepository.findByAssociateIdInOrderByRecordedAtDesc(List<UUID> associateIds, Pageable pageable): Page<Sale>` — Task 3's `SaleService.getMySales(...)` calls this directly.

- [ ] **Step 1: Write the failing repository test**

Add to `backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java`, after `searchRegisterOrdersByRecordedAtDescending` (the last test in the file, just before the closing brace). Add `import java.util.List;` to the existing import block if not already present.

```java
    @Test
    void findByAssociateIdInOrderByRecordedAtDescReturnsOnlyMatchingAssociatesNewestFirst() {
        UUID projectId = persistProject();
        UUID plotId = persistPlot(projectId);
        UUID cycleId = persistCycle();
        UUID associateA = persistAssociate();
        UUID associateB = persistAssociate();
        UUID associateC = persistAssociate();
        Instant earlier = Instant.parse("2026-01-10T00:00:00Z");
        Instant later = Instant.parse("2026-01-20T00:00:00Z");
        Sale earlierSale = persistSale(associateA, plotId, cycleId, SaleStatus.RECORDED, earlier);
        Sale laterSale = persistSale(associateB, plotId, cycleId, SaleStatus.RECORDED, later);
        // Not in the IN-list below -- must be excluded even though it's a real, persisted sale.
        persistSale(associateC, plotId, cycleId, SaleStatus.RECORDED, Instant.now());
        entityManager.flush();

        Page<Sale> result = saleRepository.findByAssociateIdInOrderByRecordedAtDesc(
            List.of(associateA, associateB), PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Sale::getId)
            .containsExactly(laterSale.getId(), earlierSale.getId());
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mvn test -Dtest=SaleRepositoryTest`
Expected: compile failure — `findByAssociateIdInOrderByRecordedAtDesc` is not a method on `SaleRepository`.

- [ ] **Step 3: Implement `findByAssociateIdInOrderByRecordedAtDesc(...)` on `SaleRepository`**

Edit `backend/src/main/java/com/plotchain/sales/SaleRepository.java`. Add this method after `findByCycleIdAndStatus(...)` and before the `searchRegister` `@Query` block:

```java
    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales"): filters Sale rows down to the
    // caller's self-plus-downline ID set (AssociateRepository.findSelfAndDownline). A plain
    // Spring Data derived query -- no @Query needed, unlike searchRegister's optional-filter
    // shape, since this always has exactly one non-optional filter (the ID set) and a fixed
    // sort order. ORDER BY recordedAt DESC: same newest-first convention as searchRegister.
    Page<Sale> findByAssociateIdInOrderByRecordedAtDesc(List<UUID> associateIds, Pageable pageable);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mvn test -Dtest=SaleRepositoryTest`
Expected: PASS (all tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleRepository.java backend/src/test/java/com/plotchain/sales/SaleRepositoryTest.java
git commit -m "feat(sales): add SaleRepository.findByAssociateIdInOrderByRecordedAtDesc"
```

---

### Task 3: `SaleService.getMySales(...)` and `AssociateSalePageResponse`

**Files:**
- Create: `backend/src/main/java/com/plotchain/sales/AssociateSalePageResponse.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Modify: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findSelfAndDownline(UUID): List<UUID>` (Task 1). `SaleRepository.findByAssociateIdInOrderByRecordedAtDesc(List<UUID>, Pageable): Page<Sale>` (Task 2). `SaleService`'s existing private `toResponse(Sale): SaleResponse` (already defined at the bottom of `SaleService.java`, reused unchanged here).
- Produces: `SaleService.getMySales(UUID associateId, int page, int size): AssociateSalePageResponse`. `AssociateSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements)` — Task 4's `AssociateSaleController.getMySales()` returns this directly.

- [ ] **Step 1: Write the failing service tests**

Add to `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`, at the end of the class before the closing brace. All needed imports (`ArgumentCaptor`, `Page`, `PageImpl`, `PageRequest`, `List`, `eq`, `isNull`, `any`, `verify`, `when`) are already present in this file.

```java
    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales"): getMySales() resolves the caller's
    // self-plus-downline ID set first, then filters Sale rows by it.
    @Test
    void getMySalesResolvesSelfAndDownlineIdsThenFiltersSalesByThem() {
        List<UUID> selfAndDownlineIds = List.of(ASSOCIATE_ID, UUID.randomUUID());
        when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(selfAndDownlineIds);
        Sale sale = recordedSale(UUID.randomUUID(), PLOT_ID);
        when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(
            eq(selfAndDownlineIds), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(sale), PageRequest.of(0, 20), 1));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, 0, 20);

        verify(associateRepository).findSelfAndDownline(ASSOCIATE_ID);
        verify(saleRepository).findByAssociateIdInOrderByRecordedAtDesc(
            selfAndDownlineIds, PageRequest.of(0, 20));
        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.sales()).hasSize(1);
        assertThat(response.sales().get(0).id()).isEqualTo(sale.getId());
        assertThat(response.sales().get(0).status()).isEqualTo("RECORDED");
    }

    @Test
    void getMySalesReturnsAnEmptyPageWhenTheCallerHasNoSalesInTheirSubtree() {
        when(associateRepository.findSelfAndDownline(ASSOCIATE_ID)).thenReturn(List.of(ASSOCIATE_ID));
        when(saleRepository.findByAssociateIdInOrderByRecordedAtDesc(
            eq(List.of(ASSOCIATE_ID)), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AssociateSalePageResponse response = saleService.getMySales(ASSOCIATE_ID, 0, 20);

        assertThat(response.totalElements()).isEqualTo(0);
        assertThat(response.sales()).isEmpty();
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `mvn test -Dtest=SaleServiceTest`
Expected: compile failure — `SaleService.getMySales(...)` and `AssociateSalePageResponse` don't exist yet.

- [ ] **Step 3: Create `AssociateSalePageResponse`**

Create `backend/src/main/java/com/plotchain/sales/AssociateSalePageResponse.java`:

```java
package com.plotchain.sales;

import java.util.List;

public record AssociateSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements) {}
```

- [ ] **Step 4: Implement `SaleService.getMySales(...)`**

Edit `backend/src/main/java/com/plotchain/sales/SaleService.java`. All needed imports (`Page`, `PageRequest`, `UUID`, `List`) are already present from the `list(...)` method added in Sales unit 6. Add this method, placed after `list(...)` and before the private `toResponse(Sale)` helper:

```java
    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales"): self + full descendant subtree,
    // view-only, paginated. associateId always comes from the caller's own JWT (see
    // AssociateSaleController) -- there is no path for one associate to view another's sales
    // through this method.
    public AssociateSalePageResponse getMySales(UUID associateId, int page, int size) {
        List<UUID> selfAndDownlineIds = associateRepository.findSelfAndDownline(associateId);

        Page<Sale> result = saleRepository.findByAssociateIdInOrderByRecordedAtDesc(
            selfAndDownlineIds, PageRequest.of(page, size));

        List<SaleResponse> sales = result.getContent().stream().map(this::toResponse).toList();
        return new AssociateSalePageResponse(sales, page, size, result.getTotalElements());
    }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `mvn test -Dtest=SaleServiceTest`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/AssociateSalePageResponse.java backend/src/main/java/com/plotchain/sales/SaleService.java backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): add SaleService.getMySales for the associate own-sales view"
```

---

### Task 4: `GET /api/associates/me/sales` controller endpoint

**Files:**
- Create: `backend/src/main/java/com/plotchain/sales/AssociateSaleController.java`
- Create: `backend/src/test/java/com/plotchain/sales/AssociateSaleControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `SaleService.getMySales(UUID, int, int): AssociateSalePageResponse` (Task 3).
- Produces: `GET /api/associates/me/sales` HTTP endpoint — the unit's actual deliverable, nothing downstream consumes this in Java.

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/sales/AssociateSaleControllerTest.java`, mirroring `SaleControllerTest`'s shape (real Spring Security filter chain via `@SpringBootTest` + `@AutoConfigureMockMvc`, `AssociateRepository` and `SaleService` mocked, a `tokenFor(...)` helper that stubs `associateRepository.findById(...)` for the JWT filter):

```java
package com.plotchain.sales;

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
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateSaleControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean SaleService saleService;

    // Unlike SaleControllerTest's tokenFor(role) (which mints a random associateId per call),
    // this test needs to know the associateId ahead of time -- it's how we prove
    // AssociateSaleController resolves the caller's OWN id from the JWT, not from a request
    // parameter (this endpoint accepts none).
    private String tokenFor(AssociateRole role, UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(role);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getMySalesReturns200WithThePageForTheCallersOwnJwtAssociateId() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID saleId = UUID.randomUUID();
        SaleResponse sale = new SaleResponse(
            saleId, UUID.randomUUID(), associateId, "Jane Buyer", "9999999999", null,
            new BigDecimal("600000.00"), UUID.randomUUID(), "L", "RECORDED", null, Instant.now());
        AssociateSalePageResponse page = new AssociateSalePageResponse(List.of(sale), 0, 20, 1);
        when(saleService.getMySales(eq(associateId), eq(0), eq(20))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.sales[0].id").value(saleId.toString()))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void getMySalesClampsPageAndSizeTheSameWayTheAdminRegisterDoes() throws Exception {
        UUID associateId = UUID.randomUUID();
        AssociateSalePageResponse page = new AssociateSalePageResponse(List.of(), 0, 100, 0);
        when(saleService.getMySales(eq(associateId), eq(0), eq(100))).thenReturn(page);

        mockMvc.perform(get("/api/associates/me/sales")
                .param("page", "-1")
                .param("size", "500")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.size").value(100));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mvn test -Dtest=AssociateSaleControllerTest`
Expected: compile failure / 404s — `AssociateSaleController` doesn't exist yet, so `GET /api/associates/me/sales` has no handler.

- [ ] **Step 3: Create `AssociateSaleController`**

Create `backend/src/main/java/com/plotchain/sales/AssociateSaleController.java`:

```java
package com.plotchain.sales;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
// "Associate own view -- GET /api/associates/me/sales, any authenticated associate"): a bare
// @RestController with one route, same shape as DashboardController and PasswordController --
// not added to SaleController, whose class-level @RequestMapping("/api/admin/sales") would make
// an absolute-path method mapping here compose incorrectly (Spring concatenates class + method
// paths rather than treating a leading "/" as an override).
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/dashboard already does with no matcher of its own.
@RestController
public class AssociateSaleController {

    private final SaleService saleService;

    public AssociateSaleController(SaleService saleService) {
        this.saleService = saleService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never
    // from the request, so no caller can view another associate's sales through this route --
    // same reasoning as PasswordController.changePassword(...).
    @GetMapping("/api/associates/me/sales")
    public AssociateSalePageResponse getMySales(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return saleService.getMySales(associateId, page, size);
    }
}
```

- [ ] **Step 4: Run the controller test to verify it passes**

Run: `mvn test -Dtest=AssociateSaleControllerTest`
Expected: PASS (both tests).

- [ ] **Step 5: Add the `SecurityConfigTest` reachability test**

Edit `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`. Add this test after `passwordChangeIsReachableByAnAssociateToken` (the existing "reachable by an associate token" precedent):

```java
    // Sales unit 7 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // "Associate own view -- GET /api/associates/me/sales, any authenticated associate"): needs
    // no explicit SecurityConfig matcher -- a bare GET never collides with the blanket
    // POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/dashboard already
    // does with no matcher of its own. This test proves the route is reachable by an ordinary
    // associate token, not accidentally blocked by 403.
    //
    // AssociateRepository is a @MockBean in this test class; findSelfAndDownlineIds is
    // unstubbed and returns null by default, which SaleService.getMySales()'s call chain trips
    // on downstream (a null ID list reaching the real, unmocked SaleRepository) -- a 500, not a
    // 403. Same "assert not 403" reasoning as passwordChangeIsReachableByAnAssociateToken above:
    // only a 403 here would mean the route regressed to being blocked at the security layer.
    @Test
    void associateMeSalesIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/sales")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().is(not(403)));
    }
```

- [ ] **Step 6: Run the security test to verify it passes**

Run: `mvn test -Dtest=SecurityConfigTest`
Expected: PASS (all tests, including the new one).

- [ ] **Step 7: Run the full backend test suite**

Run (from `backend/`): `mvn test`
Expected: PASS — confirms nothing in `SaleService`, `AssociateRepository`, or the shared `SecurityConfig` matcher chain regressed any earlier unit (record, void, admin register).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/AssociateSaleController.java backend/src/test/java/com/plotchain/sales/AssociateSaleControllerTest.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(sales): add GET /api/associates/me/sales, the associate own-sales view"
```

---

## Self-Review Notes

- **Spec coverage:** "Associate own view — GET /api/associates/me/sales, any authenticated associate... Self + full descendant subtree, view-only, paginated" is covered end to end (Tasks 1–4). The new `AssociateRepository` method matches the spec's exact snippet (base case `id = :associateId`, not `parent_id = :associateId`), extended with the `CAST(... AS VARCHAR)` the spec's prose (not its illustrative snippet) calls for, mirroring `findAncestorChainIds` precisely. `SaleService` filters `SaleRepository` by `associateId IN (selfAndDownlineIds)` as specified. Both Testing-section bullets for this unit are covered: `AssociateRepositoryTest`'s new test (Task 1) asserts the caller-plus-descendants/excludes-siblings-ancestors-unrelated shape verbatim from the spec; `SecurityConfigTest`'s new test (Task 4) asserts reachability by an associate token. `SaleService`/`AssociateSaleController` tests go a level deeper than the spec's two named requirements, matching how thoroughly units 2–6 were already tested in this codebase.
- **Placeholder scan:** no TBD/TODO markers; every step has literal code.
- **Type consistency:** `AssociateRepository.findSelfAndDownline(UUID): List<UUID>` is the same signature defined in Task 1 and called in Task 3. `SaleRepository.findByAssociateIdInOrderByRecordedAtDesc(List<UUID>, Pageable): Page<Sale>` is identical between Task 2's definition and Task 3's call site. `SaleService.getMySales(UUID, int, int): AssociateSalePageResponse` matches between Task 3's definition and Task 4's controller call site. `AssociateSalePageResponse(List<SaleResponse> sales, int page, int size, long totalElements)` matches its one production usage site (`SaleService.getMySales`) and its read sites in the Task 3/4 tests (`response.sales()`, `page.sales[0].id`).
