# CycleService.getOrOpenCurrent() Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `CycleService.getOrOpenCurrent()`, which returns today's `OPEN` `Cycle`, creating one under the PRD's 1st–15th / 16th–end-of-month cadence only when no existing cycle covers today.

**Architecture:** One new method on the existing `CycleService` (`backend/src/main/java/com/plotchain/cycle/CycleService.java`), reusing the existing `CycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus)` query. No new package, no new repository method, no new endpoint, no new migration — `cycle`/`period_start`/`period_end`/`status` columns already exist (`V1__create_dashboard_tables.sql`). Logic: compute `[periodStart, periodEnd]` for today from `LocalDate.now()`; fetch the most recent `OPEN` cycle; if it exists and its stored period covers today, return it; otherwise build and save a brand-new `Cycle` with today's computed boundaries and `status = OPEN`.

**Tech Stack:** Java 17+, Spring Boot, Spring Data JPA, JUnit 5 + Mockito (`MockitoExtension`), AssertJ.

## Global Constraints

- PRD cadence (source spec Decision 5, `docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md`): two periods per month — 1st through 15th, and 16th through the actual last day of the month (leap Februaries etc. — compute via `LocalDate`, never hardcode "30").
- Lives in the existing `com.plotchain.cycle` package, as a new method on the existing `CycleService` — do not create a `sales` package, do not touch `CycleService.close()` or `CycleRepository.findByIdForUpdate(...)`.
- Do not add a repository query beyond what already exists (`findFirstByStatusOrderByPeriodStartDesc`) — it is sufficient per the "at most one OPEN cycle at a time" assumption already documented on that method's callers.
- `Cycle` has no `@GeneratedValue`; new instances must get their id via `setId(UUID.randomUUID())`, matching `LegVolume.empty()`'s pattern in `backend/src/main/java/com/plotchain/legvolume/LegVolume.java`.
- No `Clock` abstraction exists anywhere in this codebase — every date-dependent service (`DashboardService`, `CompensationPlanService`, `AdminStatsService`) calls `LocalDate.now()` directly, and their tests compute expected values from `LocalDate.now()` at test-run time rather than mocking a clock. Follow that convention exactly; do not introduce a `Clock` bean as part of this unit.
- Out of scope: no concurrency/row-locking for duplicate-creation races (unlike `close()`, no dedicated concurrency test is requested for this unit — see Testing section of the source spec, only three `CycleServiceTest` bullets are listed). Do not add `@Transactional` or pessimistic locking here.
- Out of scope: `Sale`/`Plot`/`LedgerEntry` work (Sales units 2+) and the settlement batch (cycle-management's own separate, later-planned unit 4). Do not touch `CycleController`, `CyclePageResponse`, `CycleSummaryResponse`, `CycleCloseResponse`, `CycleAlreadyClosedException`, `CycleNotFoundException`, or `NoOpenCycleException`.

---

## File Structure

- **Modify:** `backend/src/main/java/com/plotchain/cycle/CycleService.java` — add `getOrOpenCurrent()` plus three small private helpers (period-start calc, period-end calc, covers-today check). No constructor change; `cycleRepository` is already a field.
- **Modify:** `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java` — add three tests for `getOrOpenCurrent()`, reusing the file's existing `newCycle(CycleStatus)` helper pattern and adding one new helper for building a cycle with explicit period bounds.

No other files change. No migration needed (table/columns already exist). No new exception types needed (all three acceptance scenarios return successfully — nothing throws).

---

## Task 1: `CycleService.getOrOpenCurrent()`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `CycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus status)` → `Optional<Cycle>` (existing, already imported via the `CycleRepository cycleRepository` field); `CycleRepository.save(Cycle)` → `Cycle` (inherited from `JpaRepository`, not yet called anywhere in `CycleService` — will need `import` nothing extra, it's inherited).
- Produces: `public Cycle getOrOpenCurrent()` — no arguments, returns the `Cycle` entity directly (not a DTO/response record, since this is an internal collaborator method for future Sales code, not an HTTP endpoint). Future callers (cycle-management unit 4, Sales unit 3) call `cycleService.getOrOpenCurrent()` and read `.getId()` off the result.

- [ ] **Step 1: Write the three failing tests**

Add these three tests to `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`, inside the existing `CycleServiceTest` class (after the existing `close()` tests, before the closing brace). Also add the new `newCycleWithBounds` helper next to the existing `newCycle` helper at the top of the class:

```java
    private Cycle newCycleWithBounds(LocalDate start, LocalDate end, CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(start);
        cycle.setPeriodEnd(end);
        cycle.setStatus(status);
        return cycle;
    }

    private LocalDate expectedPeriodStart(LocalDate date) {
        return date.getDayOfMonth() <= 15 ? date.withDayOfMonth(1) : date.withDayOfMonth(16);
    }

    private LocalDate expectedPeriodEnd(LocalDate date) {
        return date.getDayOfMonth() <= 15
            ? date.withDayOfMonth(15)
            : date.withDayOfMonth(date.lengthOfMonth());
    }
```

Then the three test methods:

```java
    @Test
    void getOrOpenCurrentCreatesANewCycleWhenNoCycleCoversToday() {
        service = new CycleService(cycleRepository);
        LocalDate today = LocalDate.now();
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.empty());
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getPeriodStart()).isEqualTo(expectedPeriodStart(today));
        assertThat(result.getPeriodEnd()).isEqualTo(expectedPeriodEnd(today));
        assertThat(result.getStatus()).isEqualTo(CycleStatus.OPEN);
        assertThat(result.getId()).isNotNull();
        verify(cycleRepository).save(any(Cycle.class));
    }

    @Test
    void getOrOpenCurrentReturnsTheExistingOpenCycleWhenItCoversToday() {
        service = new CycleService(cycleRepository);
        LocalDate today = LocalDate.now();
        Cycle existing = newCycleWithBounds(expectedPeriodStart(today), expectedPeriodEnd(today), CycleStatus.OPEN);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(existing));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getId()).isEqualTo(existing.getId());
        verify(cycleRepository, never()).save(any(Cycle.class));
    }

    @Test
    void getOrOpenCurrentCreatesTheNextCycleWhenTheExistingOpenCycleDoesNotCoverToday() {
        service = new CycleService(cycleRepository);
        LocalDate today = LocalDate.now();
        // Deliberately a stale period comfortably in the past relative to "today", regardless
        // of which day-of-month the test happens to run on: [-40, -26] days never overlaps
        // today's computed [periodStart, periodEnd] window (that window is at most 31 days wide
        // and always includes today itself).
        Cycle stale = newCycleWithBounds(today.minusDays(40), today.minusDays(26), CycleStatus.OPEN);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(stale));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Cycle result = service.getOrOpenCurrent();

        assertThat(result.getId()).isNotEqualTo(stale.getId());
        assertThat(result.getPeriodStart()).isEqualTo(expectedPeriodStart(today));
        assertThat(result.getPeriodEnd()).isEqualTo(expectedPeriodEnd(today));
        assertThat(result.getStatus()).isEqualTo(CycleStatus.OPEN);
        verify(cycleRepository).save(any(Cycle.class));
    }
```

Add the two missing static imports to the top of the test file (it currently imports `assertThat`, `assertThatThrownBy`, and `when` from Mockito/AssertJ — `any`, `verify`, and `never` are not yet imported):

```java
import static org.mockito.Mockito.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q -Dtest=CycleServiceTest test`

Expected: compile failure — `cannot find symbol: method getOrOpenCurrent()` (the method doesn't exist on `CycleService` yet).

- [ ] **Step 3: Implement `getOrOpenCurrent()`**

Edit `backend/src/main/java/com/plotchain/cycle/CycleService.java`. Add the `LocalDate`/`UUID` imports needed (`UUID` is already imported for `close(UUID id)`; add `java.time.LocalDate`), then add the method and its three private helpers anywhere inside the class (e.g. directly below `close(...)`, above `toSummary(...)`):

```java
    // Sales unit 1 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // Decision 5): returns today's OPEN cycle under the PRD's 1st-15th / 16th-end-of-month
    // cadence, creating one only if no existing cycle covers today. Reuses the existing
    // findFirstByStatusOrderByPeriodStartDesc query rather than adding a new repository method,
    // since at most one OPEN cycle is expected to exist at a time; if the most recent OPEN
    // cycle's stored period doesn't cover today (e.g. it's stale), a new cycle is created for
    // today's period without inspecting older OPEN cycles.
    public Cycle getOrOpenCurrent() {
        LocalDate today = LocalDate.now();

        return cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .filter(cycle -> covers(cycle, today))
            .orElseGet(() -> openNewCycle(today));
    }

    private boolean covers(Cycle cycle, LocalDate date) {
        return !date.isBefore(cycle.getPeriodStart()) && !date.isAfter(cycle.getPeriodEnd());
    }

    private Cycle openNewCycle(LocalDate today) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(periodStartFor(today));
        cycle.setPeriodEnd(periodEndFor(today));
        cycle.setStatus(CycleStatus.OPEN);
        return cycleRepository.save(cycle);
    }

    private LocalDate periodStartFor(LocalDate date) {
        return date.getDayOfMonth() <= 15 ? date.withDayOfMonth(1) : date.withDayOfMonth(16);
    }

    private LocalDate periodEndFor(LocalDate date) {
        return date.getDayOfMonth() <= 15
            ? date.withDayOfMonth(15)
            : date.withDayOfMonth(date.lengthOfMonth());
    }
```

The full modified file should read (imports section plus the new method placement):

```java
package com.plotchain.cycle;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

@Service
public class CycleService {

    private final CycleRepository cycleRepository;

    public CycleService(CycleRepository cycleRepository) {
        this.cycleRepository = cycleRepository;
    }

    public CyclePageResponse list(CycleStatus status, int page, int size) {
        // ... unchanged ...
    }

    @Transactional
    public CycleCloseResponse close(UUID id) {
        // ... unchanged ...
    }

    public Cycle getOrOpenCurrent() {
        // ... as above ...
    }

    private boolean covers(Cycle cycle, LocalDate date) {
        // ... as above ...
    }

    private Cycle openNewCycle(LocalDate today) {
        // ... as above ...
    }

    private LocalDate periodStartFor(LocalDate date) {
        // ... as above ...
    }

    private LocalDate periodEndFor(LocalDate date) {
        // ... as above ...
    }

    private CycleSummaryResponse toSummary(Cycle cycle) {
        // ... unchanged ...
    }
}
```

(`list(...)`, `close(...)`, and `toSummary(...)` bodies are unchanged — shown collapsed here only to make the insertion point unambiguous. Do not actually delete their bodies.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q -Dtest=CycleServiceTest test`

Expected: all tests in `CycleServiceTest` pass (the 5 pre-existing `list`/`close` tests plus the 3 new `getOrOpenCurrent` tests = 8 total).

- [ ] **Step 5: Run the full backend test suite to confirm no regressions**

Run: `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn -q test`

Expected: BUILD SUCCESS. This confirms nothing in `AdminAssociateService`, `TreeExplorerService`, `DashboardService`, or `AdminStatsService` (all consumers of `findFirstByStatusOrderByPeriodStartDesc`) was disturbed, since Task 1 only adds new methods and does not modify `CycleRepository` or those other callers.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleService.java backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): add CycleService.getOrOpenCurrent() for today's OPEN cycle"
```

---

## Self-Review Notes

- **Spec coverage:** All three `CycleServiceTest` bullets from the source spec's Testing section (no-cycle case, covers-today case, doesn't-cover-today case) map 1:1 to the three tests in Step 1. Decision 5's cadence rule (1st–15th / 16th–end-of-month, real month length via `LocalDate`) is implemented in `periodStartFor`/`periodEndFor` using `date.lengthOfMonth()`, not a hardcoded 30. The "creating one only if none exists" / "no duplicate" requirement is covered by the `verify(cycleRepository, never()).save(...)` assertion in the covers-today test.
- **Placeholder scan:** No TBD/TODO markers; every step has literal code, not a description of code.
- **Type consistency:** `getOrOpenCurrent()` returns `Cycle` (the entity) everywhere it's referenced in this plan — matches how `close()` and `list()` already return typed values from this same service, and matches how the source spec's own flow (`cycle = cycleService.getOrOpenCurrent()`) uses the result (`cycle.id`, i.e. the entity, not a DTO).
