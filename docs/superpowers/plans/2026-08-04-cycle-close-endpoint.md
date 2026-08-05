# Cycle Close Endpoint (Transactional Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/admin/cycles/{id}/close`, ADMIN-only, with the transactional row-lock/status-check skeleton the spec's settlement batch will later run inside — a second concurrent close attempt against the same cycle blocks on the row lock, then re-checks status; closing a cycle that isn't `OPEN` is rejected with 409. No settlement/batch computation (leg-volume rollup, Matching, ledger entries, etc.) is implemented — that is cycle-management unit 4's job, inserted later into the same transactional method without changing this unit's method signature or transaction boundary.

**Architecture:** `CycleController` gains a `POST /{id}/close` handler delegating to a new `CycleService.close(UUID id)`, `@Transactional`. Its first statement is a new `CycleRepository.findByIdForUpdate(UUID)` (`@Lock(PESSIMISTIC_WRITE)` + `@Query`) — this single query serves as both the 404 check (empty `Optional` → `CycleNotFoundException`) and the row-lock acquisition; there is no separate pre-transaction read. After the lock is held, a status check (`!= OPEN` → `CycleAlreadyClosedException`) gates the placeholder success path (`OPEN` → return a placeholder `CycleCloseResponse`, no batch logic). Both new exceptions get a new `CycleExceptionHandler` (`@RestControllerAdvice`, `cycle` package) mapping `CycleNotFoundException` → 404 and `CycleAlreadyClosedException` → 409. `SecurityConfig` gets a new `hasAuthority("ADMIN")`-only matcher for this route, placed among the file's other narrower POST rules (before the blanket admin-family POST rule), not next to the sibling `GET /api/admin/cycles` matcher — see Global Constraints for why. A dedicated `CycleCloseConcurrencyTest` exercises the row-lock/serialization mechanism directly against `CycleService` (real H2 test datasource, two threads, no HTTP/JWT layer), since unit 4's not-yet-built `CLOSED` transition means the "first succeeds and closes" side of the concurrency scenario has to be stood in for manually.

**Tech Stack:** Spring Boot 3 (Java), Spring Data JPA (`@Lock(LockModeType.PESSIMISTIC_WRITE)`), Spring `@Transactional`, Spring Security (`SecurityConfig` matchers), JUnit 5 + MockMvc + Mockito + AssortJ, H2 (`MODE=PostgreSQL`) for tests, `java.util.concurrent` (`ExecutorService`/`CountDownLatch`/`Future`) + `TransactionTemplate` for the concurrency test.

## Global Constraints

- Spec: `docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md`. Cite: Decision #2 (line ~26, the row-lock concurrency guard), Decision #3 (line ~28, "re-run" = retry after failure), the settlement batch's step 1 (line ~80, "lock and resolve inputs"), the `POST /api/admin/cycles/{id}/close` endpoint flow (lines ~99-112), and the concurrency test description (line ~118).
- Route is `hasAuthority("ADMIN")` only — **not** the codebase's `hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")` admin-family pattern. Same target-role-model reasoning already used for the sibling `GET /api/admin/cycles` matcher (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java:168-175`), which explicitly anticipates this route (see that comment block).
- **Placement deviation, stated explicitly because it matters for correctness, not just style**: the new POST matcher must be declared *before* `SecurityConfig`'s blanket `.requestMatchers(HttpMethod.POST, "/api/**").hasAnyAuthority(...)` rule (currently at `SecurityConfig.java:71-72`), not physically next to the GET `/api/admin/cycles` matcher at lines 168-175. Spring Security's `authorizeHttpRequests` is first-match-wins (the file's own comments at lines 40-53 establish this for the `POST /api/company/admins` narrower rule). If this unit's POST matcher were declared after line 71 (e.g. right next to the GET matcher, which is what a naive reading of "keep new admin-cycle rules together" would suggest), the blanket admin-family POST rule would match first and silently grant `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` access — violating the ADMIN-only requirement. The matcher goes up near the file's other narrower POST rules (after the `/api/company/admins` rule, before the blanket POST rule), with a comment cross-referencing the GET matcher, and the GET matcher's own comment gets updated to point back (see Task 5).
- The transactional method's **first statement** acquires the row lock — `CycleRepository.findByIdForUpdate` — and that same query result serves as the 404 check too (empty → `CycleNotFoundException`). Do not add a separate plain `cycleRepository.findById(id)` read before it: the acceptance criteria for this unit are explicit that there is no separate pre-transaction check, and combining existence + lock into one query is the simplest way to satisfy that literally.
- Status guard is `cycle.getStatus() != CycleStatus.OPEN`, not an enumeration of `CLOSED`/`PAID` — matches this unit's own title ("closing a cycle that isn't OPEN is rejected") and Decision #2's framing. `CALCULATING` is not reachable by any code path in this codebase yet (only unit 4's batch will ever write it, and always inside the same locked transaction), but the guard is written to reject it too, for the same reason Decision #2 gives.
- No settlement/batch logic. No `SettlementService`, no leg-volume rollup, no `LedgerEntry` writes, no rank progression, no `CALCULATING`/`CLOSED` status flips, no call to `cycleService.getOrOpenCurrent()` (which does not exist yet in this codebase — it belongs to the separate Sales domain spec). The `close()` method's placeholder body returns a `CycleCloseResponse` and does not mutate the cycle. Do not build any part of unit 4 "for completeness."
- `CycleService.close(UUID id)`'s signature and `@Transactional` boundary are the interface unit 4 builds on. Do not add extra parameters or split the lock-acquire/status-check into a separate method — unit 4 needs to insert its logic directly between the status check and the `return` in the same method body.
- No new database migration. `Cycle`/`CycleStatus` already exist (`V1__create_dashboard_tables.sql`); this unit adds a repository query method, not a schema change.
- No frontend/Angular changes.

---

## File Structure

- Modify: `backend/src/main/java/com/plotchain/cycle/CycleRepository.java` — add `findByIdForUpdate(UUID id): Optional<Cycle>`, `@Lock(LockModeType.PESSIMISTIC_WRITE)` + `@Query`.
- Create: `backend/src/main/java/com/plotchain/cycle/CycleNotFoundException.java` — thrown when `findByIdForUpdate` returns empty.
- Create: `backend/src/main/java/com/plotchain/cycle/CycleAlreadyClosedException.java` — thrown when the locked cycle's status isn't `OPEN`.
- Create: `backend/src/main/java/com/plotchain/cycle/CycleExceptionHandler.java` — `@RestControllerAdvice` mapping the two exceptions above to 404/409. No exception handler currently exists in the `cycle` package (`NoOpenCycleException`'s handler lives in `com.plotchain.dashboard.DashboardExceptionHandler`, a different package); this unit's two new exceptions get their own package-scoped handler, matching the repo's per-package `@RestControllerAdvice` convention (`CompensationExceptionHandler`, `AssociateProvisioningExceptionHandler`, etc.).
- Create: `backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java` — placeholder success response record: `(UUID cycleId, CycleStatus status)`. Unit 4 will replace this record's shape/usage when it has real settlement results to report; this unit's job is only the transactional skeleton around it.
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java` — add `close(UUID id): CycleCloseResponse`, `@Transactional`.
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleController.java` — add `@PostMapping("/{id}/close")`.
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add the new ADMIN-only POST matcher (placement per Global Constraints), update the GET `/api/admin/cycles` matcher's comment to cross-reference it.
- Modify: `backend/src/test/resources/application-test.yml` — bump H2's `LOCK_TIMEOUT` so the concurrency test (Task 6) has headroom before a lock-wait would time out; see Task 6 for why.
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleRepositoryTest.java` — add tests for `findByIdForUpdate`.
- Create: `backend/src/test/java/com/plotchain/cycle/CycleExceptionHandlerTest.java` — standalone `MockMvcBuilders.standaloneSetup` test (mirrors `CompensationExceptionHandlerTest`'s pattern), no Spring context.
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` — add tests for `close()`.
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java` — add tests for the close endpoint.
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add the ADMIN-only-vs-403 parameterized test for the close route.
- Create: `backend/src/test/java/com/plotchain/cycle/CycleCloseConcurrencyTest.java` — the row-lock/serialization test, real Spring context + real H2 datasource, two threads.

**Interfaces produced by this unit:**
- `CycleRepository.findByIdForUpdate(UUID id): Optional<Cycle>` (Task 1) — consumed by `CycleService.close` (Task 3).
- `CycleNotFoundException(UUID id)`, `CycleAlreadyClosedException(UUID id)` (Task 2) — consumed by `CycleService.close` (Task 3) and asserted against by `CycleExceptionHandler`/`CycleExceptionHandlerTest` (Task 2), `CycleControllerTest` (Task 4), `CycleCloseConcurrencyTest` (Task 6).
- `CycleCloseResponse(UUID cycleId, CycleStatus status)` (Task 3) — consumed by `CycleController.close` (Task 4), `CycleControllerTest`/`SecurityConfigTest` (Tasks 4-5), `CycleCloseConcurrencyTest` (Task 6).
- `CycleService.close(UUID id): CycleCloseResponse` (Task 3) — consumed by `CycleController.close` (Task 4) and `CycleCloseConcurrencyTest` (Task 6).
- `POST /api/admin/cycles/{id}/close` → 200 `CycleCloseResponse` | 404 | 409 (Task 4) — the endpoint itself; nothing later in this plan consumes it as code, but Task 5's `SecurityConfig` matcher and its test target this exact route.

---

## Task 1: `CycleRepository.findByIdForUpdate`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleRepository.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleRepositoryTest.java`

**Interfaces:**
- Consumes: existing `Cycle` entity, existing `CycleStatus` enum.
- Produces: `Optional<Cycle> findByIdForUpdate(UUID id)` — used by `CycleService.close` in Task 3 and directly by `CycleCloseConcurrencyTest` in Task 6 (both the "holder" and the real close-call sides of that test call this method, one directly, one via the service).

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/cycle/CycleRepositoryTest.java` (add `import java.util.Optional;` to the existing import block):

```java
    @Test
    void findByIdForUpdateReturnsTheCycleWhenItExists() {
        Cycle cycle = newCycle(LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 15), CycleStatus.OPEN);

        Optional<Cycle> result = cycleRepository.findByIdForUpdate(cycle.getId());

        assertThat(result).isPresent();
        assertThat(result.get().getId()).isEqualTo(cycle.getId());
        assertThat(result.get().getStatus()).isEqualTo(CycleStatus.OPEN);
    }

    @Test
    void findByIdForUpdateReturnsEmptyWhenTheCycleDoesNotExist() {
        Optional<Cycle> result = cycleRepository.findByIdForUpdate(UUID.randomUUID());

        assertThat(result).isEmpty();
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=CycleRepositoryTest`
Expected: FAIL — compile error, `findByIdForUpdate` does not exist on `CycleRepository`.

- [ ] **Step 3: Add the locking finder method**

Edit `backend/src/main/java/com/plotchain/cycle/CycleRepository.java`:

```java
package com.plotchain.cycle;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface CycleRepository extends JpaRepository<Cycle, UUID> {
    Optional<Cycle> findFirstByStatusOrderByPeriodStartDesc(CycleStatus status);

    // Admin cycle-history list, unfiltered: most recent period first.
    Page<Cycle> findAllByOrderByPeriodStartDesc(Pageable pageable);

    // Admin cycle-history list, narrowed by the optional ?status= filter.
    Page<Cycle> findByStatusOrderByPeriodStartDesc(CycleStatus status, Pageable pageable);

    // Row-lock acquisition for POST /close (cycle-management unit 3, Decision #2 of
    // docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md):
    // must be the FIRST statement inside CycleService.close()'s @Transactional method, and
    // its result doubles as the 404 check (empty Optional -> no separate pre-transaction
    // read needed). A second concurrent call against the same id blocks here -- a Postgres
    // row lock, not application code -- until the first transaction commits or rolls back.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Cycle c WHERE c.id = :id")
    Optional<Cycle> findByIdForUpdate(@Param("id") UUID id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=CycleRepositoryTest`
Expected: PASS (4 tests: the 2 existing plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleRepository.java backend/src/test/java/com/plotchain/cycle/CycleRepositoryTest.java
git commit -m "feat(cycle): add pessimistic-lock finder for cycle close"
```

---

## Task 2: `CycleNotFoundException`, `CycleAlreadyClosedException`, `CycleExceptionHandler`

**Files:**
- Create: `backend/src/main/java/com/plotchain/cycle/CycleNotFoundException.java`
- Create: `backend/src/main/java/com/plotchain/cycle/CycleAlreadyClosedException.java`
- Create: `backend/src/main/java/com/plotchain/cycle/CycleExceptionHandler.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleExceptionHandlerTest.java` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `CycleNotFoundException(UUID id)`, `CycleAlreadyClosedException(UUID id)` — thrown by `CycleService.close` in Task 3, mapped to 404/409 by `CycleExceptionHandler` (this task), verified end-to-end by `CycleControllerTest` in Task 4.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/cycle/CycleExceptionHandlerTest.java`. This mirrors `CompensationExceptionHandlerTest`'s standalone-MockMvc pattern (`backend/src/test/java/com/plotchain/compensation/CompensationExceptionHandlerTest.java`) — no Spring context, a throwaway controller that throws each exception, real HTTP/JSON/exception-mapping path via `MockMvcBuilders.standaloneSetup(...).setControllerAdvice(...)`:

```java
package com.plotchain.cycle;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CycleExceptionHandlerTest {

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
            .setControllerAdvice(new CycleExceptionHandler())
            .build();
    }

    @Test
    void cycleNotFoundExceptionReturns404WithErrorMessage() throws Exception {
        mockMvc.perform(post("/test/cycle-not-found"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void cycleAlreadyClosedExceptionReturns409WithErrorMessage() throws Exception {
        mockMvc.perform(post("/test/cycle-already-closed"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").exists());
    }

    @RestController
    static class TestController {

        @PostMapping("/test/cycle-not-found")
        public ResponseEntity<Void> cycleNotFound() {
            throw new CycleNotFoundException(UUID.randomUUID());
        }

        @PostMapping("/test/cycle-already-closed")
        public ResponseEntity<Void> cycleAlreadyClosed() {
            throw new CycleAlreadyClosedException(UUID.randomUUID());
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=CycleExceptionHandlerTest`
Expected: FAIL — compile error, `CycleNotFoundException`/`CycleAlreadyClosedException`/`CycleExceptionHandler` do not exist.

- [ ] **Step 3: Write the exceptions and handler**

Create `backend/src/main/java/com/plotchain/cycle/CycleNotFoundException.java`:

```java
package com.plotchain.cycle;

import java.util.UUID;

public class CycleNotFoundException extends RuntimeException {
    public CycleNotFoundException(UUID id) {
        super("Cycle not found: " + id);
    }
}
```

Create `backend/src/main/java/com/plotchain/cycle/CycleAlreadyClosedException.java`:

```java
package com.plotchain.cycle;

import java.util.UUID;

public class CycleAlreadyClosedException extends RuntimeException {
    public CycleAlreadyClosedException(UUID id) {
        super("Cycle is not open, cannot close: " + id);
    }
}
```

Create `backend/src/main/java/com/plotchain/cycle/CycleExceptionHandler.java`:

```java
package com.plotchain.cycle;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class CycleExceptionHandler {

    @ExceptionHandler(CycleNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleCycleNotFound(CycleNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(CycleAlreadyClosedException.class)
    public ResponseEntity<Map<String, String>> handleCycleAlreadyClosed(CycleAlreadyClosedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=CycleExceptionHandlerTest`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleNotFoundException.java \
        backend/src/main/java/com/plotchain/cycle/CycleAlreadyClosedException.java \
        backend/src/main/java/com/plotchain/cycle/CycleExceptionHandler.java \
        backend/src/test/java/com/plotchain/cycle/CycleExceptionHandlerTest.java
git commit -m "feat(cycle): add CycleNotFoundException/CycleAlreadyClosedException and their handler"
```

---

## Task 3: `CycleCloseResponse` and `CycleService.close`

**Files:**
- Create: `backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java`
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `CycleRepository.findByIdForUpdate(UUID): Optional<Cycle>` (Task 1), `CycleNotFoundException(UUID)`, `CycleAlreadyClosedException(UUID)` (Task 2).
- Produces: `CycleService.close(UUID id): CycleCloseResponse`, `@Transactional` — consumed by `CycleController.close` in Task 4 and directly by `CycleCloseConcurrencyTest` in Task 6. `CycleCloseResponse(UUID cycleId, CycleStatus status)` — consumed by Tasks 4-6.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` (add `import static org.assertj.core.api.Assertions.assertThatThrownBy;` to the existing static-import block; the file already has a `newCycle(CycleStatus)` helper from the existing `list()` tests — reuse it):

```java
    @Test
    void closeThrowsCycleNotFoundExceptionWhenTheCycleDoesNotExist() {
        service = new CycleService(cycleRepository);
        UUID id = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.close(id)).isInstanceOf(CycleNotFoundException.class);
    }

    @Test
    void closeThrowsCycleAlreadyClosedExceptionWhenStatusIsClosed() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        assertThatThrownBy(() -> service.close(cycle.getId())).isInstanceOf(CycleAlreadyClosedException.class);
    }

    @Test
    void closeThrowsCycleAlreadyClosedExceptionWhenStatusIsPaid() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.PAID);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        assertThatThrownBy(() -> service.close(cycle.getId())).isInstanceOf(CycleAlreadyClosedException.class);
    }

    @Test
    void closeSucceedsAndReturnsAPlaceholderResponseWhenStatusIsOpen() {
        service = new CycleService(cycleRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        CycleCloseResponse response = service.close(cycle.getId());

        assertThat(response.cycleId()).isEqualTo(cycle.getId());
        assertThat(response.status()).isEqualTo(CycleStatus.OPEN);
    }
```

Note: `newCycle(CycleStatus)` sets `id = UUID.randomUUID()` but does not set it on the `Cycle` object before mocking — check the existing helper in the file; it must return a `Cycle` with a non-null id (it already does, per the file's current `list()` tests using `cycle.getId()`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=CycleServiceTest`
Expected: FAIL — compile error, `service.close(...)`, `CycleCloseResponse` do not exist.

- [ ] **Step 3: Write the response type and service method**

Create `backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java`:

```java
package com.plotchain.cycle;

import java.util.UUID;

// Placeholder success response for POST /api/admin/cycles/{id}/close. Cycle-management unit 4
// (the settlement batch) will replace what this method reports once it exists -- entries
// written per income type, total net amount, the newly-reopened cycle's id -- but this unit's
// scope stops at "lock acquired, status confirmed OPEN, nothing thrown."
public record CycleCloseResponse(UUID cycleId, CycleStatus status) {}
```

Edit `backend/src/main/java/com/plotchain/cycle/CycleService.java`:

```java
package com.plotchain.cycle;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

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

    // Cycle-management unit 3: POST /api/admin/cycles/{id}/close's transactional skeleton
    // (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch step 1). The FIRST statement acquires the row lock --
    // deliberately not a separate pre-transaction existence/status check -- so a second
    // concurrent call against the same id blocks here (a Postgres row lock, not application
    // code) until this transaction commits or rolls back, then re-reads status under its own
    // lock.
    //
    // Unit 4 (the settlement batch: leg-volume rollup, Matching, Sponsor Matching, Royalty,
    // Reward, ledger entries, the CALCULATING/CLOSED status flip, and reopening the next
    // cycle via cycleService.getOrOpenCurrent()) inserts its logic between the status check
    // below and the placeholder return, without changing this method's signature or
    // transaction boundary.
    @Transactional
    public CycleCloseResponse close(UUID id) {
        Cycle cycle = cycleRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new CycleNotFoundException(id));

        // "Closing a cycle that isn't OPEN is rejected" (this unit's title): the guard is
        // "not OPEN", not an enumeration of CLOSED/PAID. CALCULATING isn't reachable by any
        // code path in this codebase yet (only unit 4's batch will ever write it, always
        // inside this same locked transaction), but is rejected here too for the same reason.
        if (cycle.getStatus() != CycleStatus.OPEN) {
            throw new CycleAlreadyClosedException(cycle.getId());
        }

        // Placeholder: unit 4 replaces this line with the settlement batch.
        return new CycleCloseResponse(cycle.getId(), cycle.getStatus());
    }

    private CycleSummaryResponse toSummary(Cycle cycle) {
        return new CycleSummaryResponse(cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), cycle.getStatus());
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=CycleServiceTest`
Expected: PASS (6 tests: the 2 existing `list()` tests plus the 4 new `close()` tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java \
        backend/src/main/java/com/plotchain/cycle/CycleService.java \
        backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): add CycleService.close transactional lock/status-check skeleton"
```

---

## Task 4: `CycleController.close`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleController.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java`

**Interfaces:**
- Consumes: `CycleService.close(UUID): CycleCloseResponse` (Task 3).
- Produces: `POST /api/admin/cycles/{id}/close` → 200 `CycleCloseResponse` | 404 (`CycleNotFoundException`) | 409 (`CycleAlreadyClosedException`) — targeted by `SecurityConfig`'s new matcher and `SecurityConfigTest` in Task 5.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java` (add `import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;` to the existing static-import block, alongside the existing `get` import):

```java
    @Test
    void closeReturnsThePlaceholderResponseForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.close(cycleId)).thenReturn(new CycleCloseResponse(cycleId, CycleStatus.OPEN));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cycleId").value(cycleId.toString()))
            .andExpect(jsonPath("$.status").value("OPEN"));
    }

    @Test
    void closeReturns404WhenTheCycleDoesNotExist() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.close(cycleId)).thenThrow(new CycleNotFoundException(cycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }

    @Test
    void closeReturns409WhenTheCycleIsNotOpen() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.close(cycleId)).thenThrow(new CycleAlreadyClosedException(cycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isConflict());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=CycleControllerTest`
Expected: FAIL — compile error, `CycleService.close(...)` does not exist yet on the mock's target type (it does, from Task 3), and `POST /api/admin/cycles/{id}/close` 404s (no handler mapped) since `CycleController` has no `close` method yet.

- [ ] **Step 3: Add the controller handler**

Edit `backend/src/main/java/com/plotchain/cycle/CycleController.java`:

```java
package com.plotchain.cycle;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

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

    @PostMapping("/{id}/close")
    public CycleCloseResponse close(@PathVariable UUID id) {
        return cycleService.close(id);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=CycleControllerTest`
Expected: PASS (7 tests: the 4 existing `list` tests plus the 3 new `close` tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleController.java backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java
git commit -m "feat(cycle): add POST /api/admin/cycles/{id}/close controller endpoint"
```

---

## Task 5: Wire `SecurityConfig` (ADMIN-only) and lock it with `SecurityConfigTest`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `POST /api/admin/cycles/{id}/close` (Task 4) — must exist for this test to hit a real, non-404 endpoint. `CycleRepository.findByIdForUpdate` (Task 1) — stubbed in the test.
- Produces: nothing new consumed elsewhere in this plan.

- [ ] **Step 1: Write the failing test**

Edit `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`. Add these imports alongside the existing ones near the top (after `import com.plotchain.cycle.CycleRepository;`):

```java
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleStatus;
```

Add this test, placed directly after `adminCyclesIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (currently ending around line 409 of the file):

```java
    // ADMIN-only, cycle-management unit 3's POST /api/admin/cycles/{id}/close matcher --
    // declared up near the file's other narrower POST rules, before the blanket POST rule
    // (see that matcher's own comment for why it isn't declared here next to the sibling GET
    // matcher above). cycleRepository.findByIdForUpdate is stubbed to return an OPEN cycle so
    // an ADMIN token reaches 200; every other role, including the soon-to-be-deleted
    // admin-family sub-roles, gets 403 at the filter layer before the controller/service ever
    // runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminCyclesCloseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setPeriodStart(java.time.LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(java.time.LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(cycle));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest`
Expected: FAIL — every role currently gets 200 (or a non-403 status), since `POST /api/admin/cycles/*/close` falls through to the blanket `hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")` POST rule — every admin-family role (not just `ADMIN`) currently passes, so the non-`ADMIN` admin-family cases in the parameterized test (expecting 403) fail.

- [ ] **Step 3: Add the `SecurityConfig` matcher and update the sibling comment**

Edit `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`. Insert the new matcher immediately before the blanket POST rule (currently `.requestMatchers(HttpMethod.POST, "/api/**")` at line 71):

```java
                // Cycle close: ADMIN-only, per cycle-management unit 3
                // (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
                // "POST /api/admin/cycles/{id}/close -- ADMIN-only"), same target-role-model
                // reasoning as the GET /api/admin/cycles matcher further down. Declared HERE,
                // before the blanket POST rule, not next to that GET matcher: first-match-wins
                // (see the Admin Team creation comment above) means a narrower POST rule
                // declared after the blanket POST "/api/**" rule below would never be reached --
                // the blanket rule would match first and grant admin-family access instead of
                // the ADMIN-only access this route requires.
                .requestMatchers(HttpMethod.POST, "/api/admin/cycles/*/close")
                    .hasAuthority("ADMIN")
```

Then update the existing GET `/api/admin/cycles` matcher's comment (currently lines 168-175) to stop describing this route as a future unit and instead point to where it actually landed:

```java
                // Admin cycle history: ADMIN-only, not the admin-family hasAnyAuthority(...)
                // pattern every other admin GET above still uses. Built directly to the target
                // role model from role-capability unit 1 (approved, not yet implemented) rather
                // than to the pattern that spec deletes. Read-only; the write counterpart, POST
                // /api/admin/cycles/{id}/close (cycle-management unit 3), has its own ADMIN-only
                // matcher declared up near the other narrower POST rules, above the blanket
                // POST "/api/**" rule -- not here, since first-match-wins would otherwise let
                // the blanket rule swallow it (see that matcher's own comment for why).
                .requestMatchers(HttpMethod.GET, "/api/admin/cycles")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest`
Expected: PASS — all `SecurityConfigTest` tests pass, including the new `adminCyclesCloseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (6 sub-cases: `ADMIN` gets 200, every other role gets 403).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(cycle): restrict POST /api/admin/cycles/{id}/close to ADMIN role only"
```

---

## Task 6: Concurrency test — row lock blocks, then re-checks status

**Files:**
- Modify: `backend/src/test/resources/application-test.yml`
- Create: `backend/src/test/java/com/plotchain/cycle/CycleCloseConcurrencyTest.java`

**Interfaces:**
- Consumes: `CycleService.close(UUID): CycleCloseResponse` (Task 3), `CycleRepository.findByIdForUpdate(UUID)` (Task 1), `CycleAlreadyClosedException` (Task 2).
- Produces: nothing consumed elsewhere in this plan — this is the final task.

This test targets `CycleService` directly (no HTTP/JWT layer): the mechanism under test — a second `SELECT ... FOR UPDATE` blocking until the first transaction resolves, then re-reading status — is a database property, and adding MockMvc/JWT would only add indirection without adding coverage (the endpoint's own request/response wiring is already covered by `CycleControllerTest` in Task 4). It needs the **real** H2 test datasource, not a mocked repository, since the blocking behavior only exists at the database level: `@SpringBootTest` (no `@Transactional` on the test itself — that would wrap everything in one connection/transaction and defeat the point).

Because cycle-management unit 4 (the settlement batch that would normally flip a cycle's status to `CLOSED`) doesn't exist yet, the second test method below manually mutates status inside the "holder" thread's transaction to stand in for what unit 4 will eventually do at commit time — this is how the spec's concurrency scenario ("second call blocks, then gets 409 once the first succeeds and closes") gets exercised now instead of waiting on unit 4.

- [ ] **Step 1: Give the lock-wait test headroom against H2's default timeout**

H2's default `LOCK_TIMEOUT` is 1000ms; this test's second thread should never need to wait anywhere near that long in practice, but CI slowness makes it worth a safety margin so a slow run gets a real assertion failure instead of a flaky `LockTimeoutException`. Edit `backend/src/test/resources/application-test.yml`:

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:plotchain;MODE=PostgreSQL;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000
    username: sa
    password: ""
  jpa:
    hibernate:
      ddl-auto: validate
  flyway:
    locations: classpath:db/migration

jwt:
  secret: test-secret-key-at-least-32-bytes-long-for-hs256
  expiration-minutes: 60
```

(Only the `url` line changes — appends `;LOCK_TIMEOUT=10000`.)

- [ ] **Step 2: Write the failing test**

Create `backend/src/test/java/com/plotchain/cycle/CycleCloseConcurrencyTest.java`:

```java
package com.plotchain.cycle;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Exercises the row-lock/serialization mechanism (Decision #2 of
// docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md) directly
// against CycleService, using the real H2 (MODE=PostgreSQL) test datasource -- the behavior
// under test is a property of the database (SELECT ... FOR UPDATE blocking a second transaction
// until the first resolves), not application code, so a mocked repository couldn't exercise it.
//
// Cycle-management unit 4 (the settlement batch) doesn't exist yet, so nothing in this codebase
// currently writes CLOSED/PAID. The second test below manually flips status inside the "holder"
// transaction to stand in for what unit 4 will eventually do at commit time, so the
// blocks-then-409 path can be proven now instead of waiting on unit 4 to exist.
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseConcurrencyTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired PlatformTransactionManager transactionManager;

    private UUID cycleId;

    @AfterEach
    void cleanUp() {
        if (cycleId != null) {
            cycleRepository.deleteById(cycleId);
        }
    }

    private UUID seedOpenCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> cycleRepository.saveAndFlush(cycle));
        return cycle.getId();
    }

    private void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Test
    void secondCloseBlocksUntilFirstTransactionResolvesThenSucceedsIfStatusIsStillOpen() throws Exception {
        cycleId = seedOpenCycle();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            cycleRepository.findByIdForUpdate(cycleId).orElseThrow();
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
            // Transaction commits when this lambda returns, releasing the row lock. No status
            // change here: this stands in for a failed/abandoned first attempt (Decision #3),
            // proving the second caller's own lock-then-recheck succeeds against a still-OPEN row.
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<CycleCloseResponse> second = pool.submit(() -> {
            events.add("second-calling");
            CycleCloseResponse response = cycleService.close(cycleId);
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300); // give the second call time to attempt (and block on) the lock
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        CycleCloseResponse response = second.get(5, TimeUnit.SECONDS);

        assertThat(events).containsExactly("holder-locked", "second-calling", "second-returned");
        assertThat(response.status()).isEqualTo(CycleStatus.OPEN);
        pool.shutdownNow();
    }

    @Test
    void secondCloseBlocksUntilFirstTransactionResolvesThenGets409IfFirstClosedTheCycle() throws Exception {
        cycleId = seedOpenCycle();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            Cycle locked = cycleRepository.findByIdForUpdate(cycleId).orElseThrow();
            // Stands in for unit 4's future CALCULATING -> CLOSED flip at the end of a
            // successful settlement batch, which doesn't exist yet in this codebase.
            locked.setStatus(CycleStatus.CLOSED);
            cycleRepository.save(locked);
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<CycleCloseResponse> second = pool.submit(() -> {
            events.add("second-calling");
            CycleCloseResponse response = cycleService.close(cycleId);
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);

        assertThatThrownBy(second::get).hasCauseInstanceOf(CycleAlreadyClosedException.class);
        pool.shutdownNow();
    }
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=CycleCloseConcurrencyTest`
Expected: PASS (2 tests). If either test is flaky on `assertThat(events).containsExactly("holder-locked", "second-calling")` (i.e. `second-returned`/`holder-committing` appears too early), the `Thread.sleep(300)` window is too short for the environment — this indicates the row lock isn't actually blocking, which would be a real bug (most likely `findByIdForUpdate` missing `@Lock(PESSIMISTIC_WRITE)`, or the test accidentally running the "holder" and "second" work on the same thread/transaction) rather than a timing fluke to paper over with a longer sleep; diagnose before increasing the sleep.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/resources/application-test.yml backend/src/test/java/com/plotchain/cycle/CycleCloseConcurrencyTest.java
git commit -m "test(cycle): add concurrency test for POST /close row-lock serialization"
```

---

## Final verification

- [ ] Run the full backend test suite once all six tasks are committed: `cd backend && ./mvnw test`
Expected: PASS, no regressions in any other test class (in particular `AdminAssociateControllerTest`, the rest of `SecurityConfigTest`, and `DashboardServiceTest`/`DashboardExceptionHandler`-adjacent tests — which reference `NoOpenCycleException`, unrelated to this unit's new exceptions — should be unaffected).
