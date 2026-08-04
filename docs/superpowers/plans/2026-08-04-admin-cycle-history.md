# Admin Cycle History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/admin/cycles`, a paginated, optionally status-filtered, admin-only read endpoint over the existing `Cycle` table, so admins can see cycle history (id, period, status).

**Architecture:** Standard three-layer slice mirroring `AdminAssociateController` → `AdminAssociateService` → `AssociateRepository`: a new `CycleController` (`cycle` package) delegates to a new `CycleService.list(...)`, which queries two new sort-ordered `CycleRepository` finder methods (`findAllByOrderByPeriodStartDesc` / `findByStatusOrderByPeriodStartDesc`) and maps the result `Page<Cycle>` to a new `CyclePageResponse`/`CycleSummaryResponse` DTO pair. `SecurityConfig` gets one new `requestMatchers` rule for `GET /api/admin/cycles`, `hasAuthority("ADMIN")` only — not the admin-family pattern the existing GET endpoints (`/api/admin/associates`, `/api/admin/kyc`, `/api/admin/stats`) still use, since this route is new and built directly to the role-capability spec's target model (see Global Constraints).

**Tech Stack:** Spring Boot 3 (Java), Spring Data JPA, Spring Security (`@PreAuthorize`/`SecurityConfig` matchers), JUnit 5 + MockMvc + Mockito, H2 (`MODE=PostgreSQL`) for `@DataJpaTest`/`@SpringBootTest` tests, Flyway-managed schema (no new migration needed — `cycle` table already exists, `V1__create_dashboard_tables.sql`).

## Global Constraints

- Pagination clamping: `page = Math.max(page, 0)`; `size = Math.min(size, 100)` — done in the controller, exact convention copied from `AdminAssociateController.list` (`backend/src/main/java/com/plotchain/associate/AdminAssociateController.java:31-32`) and `KycReviewController.list` (`backend/src/main/java/com/plotchain/associate/KycReviewController.java:22-23`). Do not invent a different clamp shape (e.g. no floor on `size`, no cap on `page`).
- Route is `hasAuthority("ADMIN")` only, **not** the codebase's current `hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")` admin-family pattern used by every other existing admin GET (`/api/admin/associates`, `/api/admin/tree/*`, `/api/admin/kyc`, `/api/admin/stats`). This is a deliberate deviation from the codebase's *current* pattern: `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` (already sliced, unit 1 approved but not yet implemented) collapses every `hasAnyAuthority(...)` rule in `SecurityConfig.java` to `hasAuthority("ADMIN")` and deletes the `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` roles outright. Since `/api/admin/cycles` is a brand-new route being added after that decision was made, it's built directly to the target role model rather than to the soon-to-be-removed one — avoids adding code that would need to be touched again the moment role-capability unit 1 lands. This unit's acceptance criterion ("an associate token gets 403") is satisfied either way; the difference only shows up for tokens carrying the soon-to-be-deleted sub-roles, which now correctly get 403 on this endpoint ahead of the wider collapse.
- This is a pure read. No new write path, no `SettlementService`, no `POST /close` endpoint, no cycle-detail (`GET /api/admin/cycles/{id}`) endpoint — those are explicitly out of scope for this unit even though they appear in the same spec section.
- No new database migration. The `cycle` table (`id`, `period_start`, `period_end`, `status`) already exists via `V1__create_dashboard_tables.sql` and the `Cycle` JPA entity already maps it exactly (`backend/src/main/java/com/plotchain/cycle/Cycle.java`).
- No frontend/Angular changes and nothing under `docs/design/` — backend-only unit.

---

## File Structure

- Create: `backend/src/main/java/com/plotchain/cycle/CycleController.java` — `@RestController`, `@RequestMapping("/api/admin/cycles")`, one `@GetMapping` handler. Mirrors `AdminAssociateController`'s shape.
- Create: `backend/src/main/java/com/plotchain/cycle/CycleService.java` — one public method, `list(CycleStatus status, int page, int size)`, queries `CycleRepository` and maps to the response DTO.
- Create: `backend/src/main/java/com/plotchain/cycle/CycleSummaryResponse.java` — record: `id`, `periodStart`, `periodEnd`, `status`.
- Create: `backend/src/main/java/com/plotchain/cycle/CyclePageResponse.java` — record: `cycles` (list of summaries), `page`, `size`, `totalElements`. Mirrors `AdminAssociatePageResponse`'s shape exactly (`backend/src/main/java/com/plotchain/associate/AdminAssociatePageResponse.java`).
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleRepository.java` — add two finder methods (below).
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add one `requestMatchers(HttpMethod.GET, "/api/admin/cycles")` rule, `hasAuthority("ADMIN")` only (not admin-family — see Global Constraints), placed alongside the other admin-only GET rules (after the `/api/admin/stats` rule, before the public branding rules — see Task 4).
- Create: `backend/src/test/java/com/plotchain/cycle/CycleRepositoryTest.java` — `@DataJpaTest`, proves the two new finder methods sort and filter correctly.
- Create: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` — `@ExtendWith(MockitoExtension.class)`, proves clamping-independent mapping logic (page/size passthrough, status branching, DTO mapping).
- Create: `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java` — `@SpringBootTest` + `@AutoConfigureMockMvc`, MockMvc + real JWT, proves clamping happens in the controller and the endpoint returns 200 with the right shape.
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add one parameterized test asserting `/api/admin/cycles` is reachable only for `ADMIN` and 403 for every other role, structurally mirroring (but not matching the outcome of) `adminStatsIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate` (lines 380-386).

**Interfaces produced by this unit** (nothing later in this plan consumes them — this is the only task set — but stated for clarity):
- `CycleRepository.findAllByOrderByPeriodStartDesc(Pageable): Page<Cycle>`
- `CycleRepository.findByStatusOrderByPeriodStartDesc(CycleStatus, Pageable): Page<Cycle>`
- `CycleService.list(CycleStatus status, int page, int size): CyclePageResponse`
- `CycleSummaryResponse(UUID id, LocalDate periodStart, LocalDate periodEnd, CycleStatus status)`
- `CyclePageResponse(List<CycleSummaryResponse> cycles, int page, int size, long totalElements)`

---

## Task 1: Repository finder methods

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleRepository.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleRepositoryTest.java` (create)

**Interfaces:**
- Consumes: existing `Cycle` entity (`id: UUID`, `periodStart: LocalDate`, `periodEnd: LocalDate`, `status: CycleStatus`), existing `CycleStatus` enum (`OPEN, CALCULATING, CLOSED, PAID`).
- Produces: `Page<Cycle> findAllByOrderByPeriodStartDesc(Pageable pageable)`, `Page<Cycle> findByStatusOrderByPeriodStartDesc(CycleStatus status, Pageable pageable)` — used by `CycleService` in Task 2.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/cycle/CycleRepositoryTest.java`:

```java
package com.plotchain.cycle;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
@ActiveProfiles("test")
class CycleRepositoryTest {

    @Autowired
    CycleRepository cycleRepository;

    private Cycle newCycle(LocalDate start, LocalDate end, CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(start);
        cycle.setPeriodEnd(end);
        cycle.setStatus(status);
        return cycleRepository.save(cycle);
    }

    @Test
    void findAllByOrderByPeriodStartDescReturnsMostRecentCycleFirst() {
        Cycle older = newCycle(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 15), CycleStatus.CLOSED);
        Cycle newer = newCycle(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 15), CycleStatus.OPEN);

        Page<Cycle> result = cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Cycle::getId).containsExactly(newer.getId(), older.getId());
        assertThat(result.getTotalElements()).isEqualTo(2);
    }

    @Test
    void findByStatusOrderByPeriodStartDescNarrowsToMatchingStatusOnly() {
        newCycle(LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 15), CycleStatus.CLOSED);
        Cycle open = newCycle(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 15), CycleStatus.OPEN);

        Page<Cycle> result = cycleRepository.findByStatusOrderByPeriodStartDesc(CycleStatus.OPEN, PageRequest.of(0, 20));

        assertThat(result.getContent()).extracting(Cycle::getId).containsExactly(open.getId());
        assertThat(result.getTotalElements()).isEqualTo(1);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=CycleRepositoryTest`
Expected: FAIL — compile error, `findAllByOrderByPeriodStartDesc`/`findByStatusOrderByPeriodStartDesc` do not exist on `CycleRepository`.

- [ ] **Step 3: Add the finder methods**

Edit `backend/src/main/java/com/plotchain/cycle/CycleRepository.java`:

```java
package com.plotchain.cycle;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CycleRepository extends JpaRepository<Cycle, UUID> {
    Optional<Cycle> findFirstByStatusOrderByPeriodStartDesc(CycleStatus status);

    // Admin cycle-history list, unfiltered: most recent period first.
    Page<Cycle> findAllByOrderByPeriodStartDesc(Pageable pageable);

    // Admin cycle-history list, narrowed by the optional ?status= filter.
    Page<Cycle> findByStatusOrderByPeriodStartDesc(CycleStatus status, Pageable pageable);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=CycleRepositoryTest`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleRepository.java backend/src/test/java/com/plotchain/cycle/CycleRepositoryTest.java
git commit -m "feat(cycle): add sorted/filterable finder methods for admin cycle history"
```

---

## Task 2: DTOs and `CycleService.list`

**Files:**
- Create: `backend/src/main/java/com/plotchain/cycle/CycleSummaryResponse.java`
- Create: `backend/src/main/java/com/plotchain/cycle/CyclePageResponse.java`
- Create: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` (create)

**Interfaces:**
- Consumes: `CycleRepository.findAllByOrderByPeriodStartDesc(Pageable)`, `CycleRepository.findByStatusOrderByPeriodStartDesc(CycleStatus, Pageable)` (Task 1).
- Produces: `CycleService.list(CycleStatus status, int page, int size): CyclePageResponse` — consumed by `CycleController` in Task 3. `status == null` means unfiltered; `page`/`size` are passed through as-is (already clamped by the caller — this service does not re-clamp, matching `AdminAssociateService.list`'s division of responsibility where the controller clamps and the service trusts its inputs).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`:

```java
package com.plotchain.cycle;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CycleServiceTest {

    @Mock CycleRepository cycleRepository;
    CycleService service;

    private Cycle newCycle(CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(status);
        return cycle;
    }

    @Test
    void listWithNoStatusFilterDelegatesToFindAll() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(cycle), PageRequest.of(0, 20), 1));

        CyclePageResponse response = service.list(null, 0, 20);

        assertThat(response.cycles()).hasSize(1);
        assertThat(response.cycles().get(0).id()).isEqualTo(cycle.getId());
        assertThat(response.cycles().get(0).periodStart()).isEqualTo(cycle.getPeriodStart());
        assertThat(response.cycles().get(0).periodEnd()).isEqualTo(cycle.getPeriodEnd());
        assertThat(response.cycles().get(0).status()).isEqualTo(CycleStatus.OPEN);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(1);
    }

    @Test
    void listWithStatusFilterDelegatesToFindByStatus() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED, PageRequest.of(1, 10)))
            .thenReturn(new PageImpl<>(List.of(cycle), PageRequest.of(1, 10), 11));

        CyclePageResponse response = service.list(CycleStatus.CLOSED, 1, 10);

        assertThat(response.cycles()).extracting(CycleSummaryResponse::status).containsExactly(CycleStatus.CLOSED);
        assertThat(response.page()).isEqualTo(1);
        assertThat(response.size()).isEqualTo(10);
        assertThat(response.totalElements()).isEqualTo(11);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=CycleServiceTest`
Expected: FAIL — compile error, `CycleService`/`CyclePageResponse`/`CycleSummaryResponse` do not exist.

- [ ] **Step 3: Write the DTOs and service**

Create `backend/src/main/java/com/plotchain/cycle/CycleSummaryResponse.java`:

```java
package com.plotchain.cycle;

import java.time.LocalDate;
import java.util.UUID;

public record CycleSummaryResponse(UUID id, LocalDate periodStart, LocalDate periodEnd, CycleStatus status) {}
```

Create `backend/src/main/java/com/plotchain/cycle/CyclePageResponse.java`:

```java
package com.plotchain.cycle;

import java.util.List;

public record CyclePageResponse(List<CycleSummaryResponse> cycles, int page, int size, long totalElements) {}
```

Create `backend/src/main/java/com/plotchain/cycle/CycleService.java`:

```java
package com.plotchain.cycle;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
public class CycleService {

    private final CycleRepository cycleRepository;

    public CycleService(CycleRepository cycleRepository) {
        this.cycleRepository = cycleRepository;
    }

    public CyclePageResponse list(CycleStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Cycle> result = status == null
            ? cycleRepository.findAllByOrderByPeriodStartDesc(pageable)
            : cycleRepository.findByStatusOrderByPeriodStartDesc(status, pageable);

        return new CyclePageResponse(
            result.getContent().stream().map(this::toSummary).toList(),
            page, size, result.getTotalElements());
    }

    private CycleSummaryResponse toSummary(Cycle cycle) {
        return new CycleSummaryResponse(cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), cycle.getStatus());
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=CycleServiceTest`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleSummaryResponse.java \
        backend/src/main/java/com/plotchain/cycle/CyclePageResponse.java \
        backend/src/main/java/com/plotchain/cycle/CycleService.java \
        backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): add CycleService.list for admin cycle history"
```

---

## Task 3: `CycleController`

**Files:**
- Create: `backend/src/main/java/com/plotchain/cycle/CycleController.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java` (create)

**Interfaces:**
- Consumes: `CycleService.list(CycleStatus, int, int): CyclePageResponse` (Task 2).
- Produces: `GET /api/admin/cycles?status=&page=&size=` → 200 `CyclePageResponse` JSON. No new interface consumed by later tasks in this plan (Task 4 only touches `SecurityConfig`, independent of this class's internals).

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java`. This test only exercises the controller's clamping/wiring behavior with `CycleService` mocked — it does not assert 403-for-associate (that belongs to `SecurityConfigTest`, Task 4, which exercises the real filter chain end to end):

```java
package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CycleControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean CycleService cycleService;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void listReturnsAPageForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.list(isNull(), eq(0), eq(20))).thenReturn(
            new CyclePageResponse(
                List.of(new CycleSummaryResponse(cycleId, java.time.LocalDate.of(2026, 7, 1),
                    java.time.LocalDate.of(2026, 7, 15), CycleStatus.OPEN)),
                0, 20, 1));

        mockMvc.perform(get("/api/admin/cycles")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cycles[0].id").value(cycleId.toString()))
            .andExpect(jsonPath("$.cycles[0].status").value("OPEN"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listPassesTheStatusFilterThrough() throws Exception {
        when(cycleService.list(eq(CycleStatus.CLOSED), eq(0), eq(20)))
            .thenReturn(new CyclePageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/admin/cycles").param("status", "CLOSED")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(cycleService).list(CycleStatus.CLOSED, 0, 20);
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(cycleService.list(any(), eq(0), eq(100))).thenReturn(new CyclePageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/admin/cycles").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        ArgumentCaptor<Integer> sizeCaptor = ArgumentCaptor.forClass(Integer.class);
        verify(cycleService).list(any(), eq(0), sizeCaptor.capture());
        assertThat(sizeCaptor.getValue()).isEqualTo(100);
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(cycleService.list(any(), eq(0), eq(20))).thenReturn(new CyclePageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/admin/cycles").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        verify(cycleService).list(any(), eq(0), eq(20));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=CycleControllerTest`
Expected: FAIL — compile error, `CycleController` does not exist (no `@RestController` mapped to `/api/admin/cycles`, so MockMvc would 404/fail to resolve even after a stub — write the real class in Step 3 directly since there's no meaningful intermediate "stub" for a single-endpoint controller).

- [ ] **Step 3: Write `CycleController`**

Create `backend/src/main/java/com/plotchain/cycle/CycleController.java`:

```java
package com.plotchain.cycle;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/cycles")
public class CycleController {

    private final CycleService cycleService;

    public CycleController(CycleService cycleService) {
        this.cycleService = cycleService;
    }

    @GetMapping
    public CyclePageResponse list(
        @RequestParam(required = false) CycleStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return cycleService.list(status, page, size);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=CycleControllerTest`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleController.java backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java
git commit -m "feat(cycle): add GET /api/admin/cycles controller"
```

---

## Task 4: Wire `SecurityConfig` (`ADMIN`-only, ahead of the role-capability collapse) and lock it with `SecurityConfigTest`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `CycleController`'s `/api/admin/cycles` route (Task 3) — must exist for this test to hit a real, non-404 endpoint.
- Produces: nothing new consumed elsewhere in this plan — this is the final task.

- [ ] **Step 1: Write the failing test**

Edit `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`. Add this import alongside the existing ones near the top of the file (after `import com.plotchain.company.SetupStateRepository;`):

```java
import com.plotchain.cycle.CycleRepository;
```

Add `@MockBean CycleRepository cycleRepository;` next to the existing `@MockBean` fields (after `@MockBean SetupStateRepository setupStateRepository;`).

Add this test, placed directly after `adminStatsIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate` (around line 386 of the current file):

```java
    // Deliberately NOT the isAdminFamily() convention used by the other parameterized tests in
    // this file (e.g. adminStatsIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate).
    // This route is built directly to the target role model from
    // docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md
    // (role-capability unit 1, approved, not yet implemented): only ADMIN gets 200 here, every
    // other role — including the SUPER_ADMIN/FINANCE/KYC_REVIEWER/SUPPORT roles that unit deletes
    // outright — gets 403, same as ASSOCIATE. cycleRepository is @MockBean'd here (see stub below).
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminCyclesIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        stubEmptyCyclePage();
        mockMvc.perform(get("/api/admin/cycles")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest#adminCyclesIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`
Expected: FAIL — every role (including `ASSOCIATE`) currently gets 200, because `/api/admin/cycles` falls through to `anyRequest().authenticated()` (no matcher restricts it yet), so every non-`ADMIN` case in the parameterized test (expecting 403) fails. This resolves once Step 3's stub and matcher are added.

Note: because `@ParameterizedTest` runs 6 sub-tests (one per `AssociateRole` value), you may need to run `./mvnw test -Dtest=SecurityConfigTest` (whole class) if your Maven/Surefire version doesn't support selecting a single parameterized case by method name.

- [ ] **Step 3: Add the `stubEmptyCyclePage()` helper and the `SecurityConfig` matcher**

Add a `stubEmptyCyclePage()` helper near the other private helpers in `SecurityConfigTest` (e.g. right after `stubLaunched()`) — the test body written in Step 1 already calls it:

```java
    private void stubEmptyCyclePage() {
        when(cycleRepository.findAllByOrderByPeriodStartDesc(org.springframework.data.domain.PageRequest.of(0, 20)))
            .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of()));
    }
```

Then edit `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`: add a new matcher immediately after the `/api/admin/stats` rule (after line 167's closing of that block, before the Phase 5 public-branding comment block at line 168):

```java
                // Admin cycle history: ADMIN-only, not the admin-family hasAnyAuthority(...)
                // pattern every other admin GET above still uses. Built directly to the target
                // role model from role-capability unit 1 (approved, not yet implemented) rather
                // than to the pattern that spec deletes. Read-only; there is no corresponding
                // write matcher here because POST /api/admin/cycles/{id}/close (a future unit)
                // will need its own matcher when it's built, also ADMIN-only per that same spec.
                .requestMatchers(HttpMethod.GET, "/api/admin/cycles")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest`
Expected: PASS — all `SecurityConfigTest` tests pass, including the new parameterized `adminCyclesIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (6 sub-cases: `ADMIN` gets 200, every other role — `ASSOCIATE` and the four soon-to-be-deleted sub-roles — gets 403).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(cycle): restrict GET /api/admin/cycles to ADMIN role only"
```

---

## Final verification

- [ ] Run the full backend test suite once all four tasks are committed: `cd backend && ./mvnw test`
Expected: PASS, no regressions in any other test class (in particular `AdminAssociateControllerTest`, `KycReviewController`-adjacent tests, and the rest of `SecurityConfigTest` should be unaffected by this unit's additions).
