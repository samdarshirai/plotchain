# Plot Booking Unit 9: Admin Overdue EMI Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/admin/emi-reports/overdue` returns a paged report of `ACTIVE` bookings that have at least one overdue installment, one row per booking, oldest overdue due date first.

**Architecture:** One grouped JPQL query on `PlotBookingRepository` (inner-joins `EmiInstallment`, `Associate`, `Plot` by their UUID columns; the entities have no JPA relations) does the `COUNT/SUM/MIN` aggregation, with a hand-written count query so `totalElements` counts bookings. A NEW `OverdueReportService` (injected `Clock`) and NEW `AdminEmiReportController` keep the change merge-safe against units 6/7/8, which edit `BookingService`/`BookingController`. `SecurityConfig` needs one explicit ADMIN GET matcher (see Global Constraints: there is NO blanket admin GET rule).

**Tech Stack:** Java 21, Spring Boot 3.3.4, Spring Data JPA/Hibernate 6 (H2 in tests via Flyway), JUnit 5, MockMvc, AssertJ.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decisions 7, 11, 12; Flow "Overdue report"; "Resolved decisions (post-slice)" #8) and the unit 9 section plus "Carry-forward notes" of `docs/superpowers/plans/2026-10-01-plot-booking-units.md`.

## Global Constraints

- Overdue is derived, never stored: installment `status = PENDING` and `due_date < today (UTC)`; today = `LocalDate.now(clock)` with the injected `java.time.Clock` bean (`epin/EPinConfig` defines `Clock.systemUTC()`). Due today is NOT overdue; `PAID`/`VOID` never overdue (Decision 7).
- Only bookings with `status = ACTIVE` appear (Flow "Overdue report").
- Paged: `page >= 0`, `size <= 100` clamped in the controller (`Math.max(page,0)`, `Math.min(size,100)`), default size 20 (Decision 11; copy `AssociateBookingController`).
- Sort: oldest overdue due date ascending (post-slice decision #8), deterministic tiebreak.
- ADMIN only; associate token 403, no token 401 (Decision 12).
- SecurityConfig finding (verified by reading `auth/SecurityConfig.java`): blanket admin rules exist only for POST/PUT/PATCH/DELETE `/api/**`. Admin GETs each have their own explicit `.requestMatchers(HttpMethod.GET, "/api/admin/...").hasAuthority("ADMIN")`; without one the route falls to `anyRequest().authenticated()` and any associate token would read the report. So a matcher IS required.
- New code goes in the `com.plotchain.booking` package; do not edit `BookingService` or `BookingController`.
- Backend only. No commit of the units file or status index (coordinator does that).
- Do not touch the units file `2026-10-01-plot-booking-units.md`.

## Review Focus

- Booking with 3 overdue installments must be 1 row and `totalElements` 1, not 3 (Task 1 test).
- Installment due exactly today is not overdue; due yesterday is (Task 1 test).
- A booking with only PAID/VOID past-due installments, or `CONFIRMED`/`CANCELLED` status, never appears (Task 1 tests).
- Equal oldest-due-dates must order deterministically so page boundaries don't duplicate/skip rows (Task 1 tie test).
- Page beyond the end returns empty `rows` with correct `totalElements`, not an error (Task 1 test).
- Midnight-UTC flakiness: tests use `Clock.fixed` plus due dates computed from the fixed date, never `LocalDate.now()` (Task 1/2).

## Environment notes

- Run everything from the unit's WORKTREE `backend/` dir (not the main checkout): `cd <worktree>/backend`.
- Known noise: ~55 spurious Mockito errors on full runs from a JDK21/25 mismatch, plus 4 pre-existing failures in `JwtServiceTest`/`SecurityConfigTest`-adjacent secrets tests (`JwtServiceTest`, `SecretsEncryptionServiceTest`) on full runs. Use targeted `-Dtest=` runs. Last targeted baseline on master: 349 tests green.
- Implementation order is 6 -> 7 -> 8 -> 9, so unit 8 WILL be on master. Before Task 1 Step 3 read unit 8's merged code (`git log --oneline master`, look in `booking/` for a `Specification`/repository predicate or JPQL fragment for "EXISTS PENDING installment with due_date < today"). If it is a JPQL fragment/constant or a `Specification<PlotBooking>`, reuse its definition of overdue. A `Specification` cannot express this grouped query, so the likely reuse is: keep the grouped `SELECT`, but take the `EXISTS`/`status`/`dueDate` condition from unit 8 where it is a string constant, or add a test asserting this report's booking set equals the register's `overdue=true` set for the same data (cheap parity guard). Fallback if it does not fit: keep this plan's self-contained query and add that parity test; leave a one-line comment pointing at unit 8's predicate.

## File Structure

- Create `backend/src/main/java/com/plotchain/booking/OverdueReportRow.java` (record, used as JPQL constructor expression and as the response row).
- Create `backend/src/main/java/com/plotchain/booking/OverdueReportPageResponse.java` (record).
- Modify `backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java` (add `findOverdueReport`).
- Create `backend/src/main/java/com/plotchain/booking/OverdueReportService.java`.
- Create `backend/src/main/java/com/plotchain/booking/AdminEmiReportController.java`.
- Modify `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (one matcher).
- Tests: create `backend/src/test/java/com/plotchain/booking/OverdueReportIntegrationTest.java`, `OverdueReportServiceTest.java`, `AdminEmiReportControllerTest.java`; modify `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`.

---

### Task 1: DTOs + grouped repository query (real DB)

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/OverdueReportRow.java`, `OverdueReportPageResponse.java`
- Modify: `backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java`
- Test: `backend/src/test/java/com/plotchain/booking/OverdueReportIntegrationTest.java`

**Interfaces:**
- Produces: `PlotBookingRepository.findOverdueReport(LocalDate today, Pageable pageable): Page<OverdueReportRow>` (pageable must be UNSORTED, order is in the query).
- Produces: `record OverdueReportRow(UUID bookingId, UUID plotId, String plotNo, UUID associateId, String associateName, String buyerName, long overdueCount, BigDecimal overdueAmount, LocalDate oldestDueDate)`; `record OverdueReportPageResponse(List<OverdueReportRow> rows, int page, int size, long totalElements)`.

- [ ] **Step 1: Write the failing test.** Create `OverdueReportIntegrationTest` (`@SpringBootTest @ActiveProfiles("test")`, same harness as `BookingAutoConfirmIntegrationTest`: committed rows, manual cleanup). Copy its `seedAssociate()` pattern (role ADMIN to satisfy `chk_associate_rank_required`; give the name as a parameter) and the `Project`/`Plot` construction. Do NOT use `bookingService.createBooking` (it fixes the schedule); persist `PlotBooking` and `EmiInstallment` entities directly via `plotBookingRepository`/`emiInstallmentRepository` with the setters. Fixed date: `private static final LocalDate TODAY = LocalDate.of(2026, 6, 15);` and all due dates are `TODAY.minusDays(n)`/`TODAY` (no `LocalDate.now()`). Helper signature (implement in the test class):

```java
// seeds plot+booking (+ its own associate if assoc==null) and installments; tracks ids for cleanup
private UUID seedBooking(UUID assocId, String buyer, BookingStatus status, Instant bookedAt,
                         Object[]... installments)   // each = {InstallmentStatus, LocalDate due, String amount}
```

Cleanup in `@AfterEach`: delete installments for tracked bookings, bookings, plots, then the project, then associates (order: installments, bookings, plots, project, associates). Tests (each asserts through `plotBookingRepository.findOverdueReport(TODAY, PageRequest.of(0, 20))`):

```java
@Test void dueTodayIsNotOverdueButDueYesterdayIs() {
    UUID today = seedBooking(null, "Today Buyer", ACTIVE, t(1), row(PENDING, TODAY, "100.00"));
    UUID yday  = seedBooking(null, "Yday Buyer",  ACTIVE, t(2), row(PENDING, TODAY.minusDays(1), "100.00"));
    Page<OverdueReportRow> p = plotBookingRepository.findOverdueReport(TODAY, PageRequest.of(0, 20));
    assertThat(p.getContent()).extracting(OverdueReportRow::bookingId).containsExactly(yday);
    assertThat(p.getTotalElements()).isEqualTo(1);
}
@Test void paidAndVoidPastDueInstallmentsNeverCount_andMixedBookingCountsOnlyPending() {
    // PAID past due, VOID past due, PENDING past due 150.00, PENDING future
    -> one row: overdueCount 1, overdueAmount 150.00, oldestDueDate = the PENDING one
    // second booking with only PAID/VOID past due -> absent
}
@Test void confirmedAndCancelledBookingsAreExcluded() { /* both have a PENDING past-due installment */ }
@Test void manyOverdueInstallmentsOnOneBookingAreOneRowWithCorrectCountSumMinAndTotalElements() {
    // PENDING due T-30 100.00, T-10 200.00, T-1 300.00 -> count 3, sum 600.00, min T-30; totalElements==1
}
@Test void rowCarriesAssociateNameBuyerPlotAndIds() { /* assert associateName, buyerName, plotNo "A-101", plotId, associateId */ }
@Test void sortsByOldestOverdueDueDateAscendingWithBookingIdTiebreak() {
    // b1 oldest due T-5, b2 oldest T-40, b3 oldest T-40 (tie with b2) -> [b2,b3 in id order, b1]
}
@Test void pagingSplitsRowsAndTotalElementsCountsBookings() {
    // 3 bookings, one with 2 overdue installments; size 2 -> page0 2 rows, page1 1 row, total 3
    // page 5 -> empty content, total still 3
}
@Test void emptyWhenNothingOverdue() { /* totalElements 0, content empty */ }
```

Because other tests may leave rows in the shared H2 DB, assert on the seeded booking ids (`extracting(...).contains/containsExactly` over rows filtered to the tracked ids) or make the totals relative: take `before = findOverdueReport(TODAY, PageRequest.of(0,1)).getTotalElements()` first. Prefer the filter approach for order tests (filter content to tracked ids, then assert order) and the delta approach for `totalElements`/paging (use a page size large enough that tracked rows are contiguous only if the DB is otherwise empty; if shared-DB noise makes paging asserts unstable, assert paging via `PageRequest.of(0,1)` on delta totals instead).

- [ ] **Step 2: Run to verify it fails (compile error: `findOverdueReport`/`OverdueReportRow` missing).**

Run: `mvn -q -Dtest=OverdueReportIntegrationTest test`

- [ ] **Step 3: Implement.** First read unit 8's merged predicate (see Environment notes) and reuse where it fits. Records:

```java
public record OverdueReportRow(UUID bookingId, UUID plotId, String plotNo, UUID associateId, String associateName,
                               String buyerName, long overdueCount, BigDecimal overdueAmount, LocalDate oldestDueDate) {}
public record OverdueReportPageResponse(List<OverdueReportRow> rows, int page, int size, long totalElements) {}
```

Repository method (imports `java.time.LocalDate`):

```java
// Unit 9 overdue report. One grouped query: no N+1. Pageable must be unsorted -- order is fixed here
// (oldest overdue due date, then bookedAt, then id) so page boundaries are deterministic.
// Count query counts BOOKINGS (DISTINCT b.id), not joined installment rows.
@Query(value = """
    SELECT new com.plotchain.booking.OverdueReportRow(
        b.id, b.plotId, p.plotNo, b.associateId, a.name, b.buyerName,
        COUNT(i), SUM(i.amount), MIN(i.dueDate))
    FROM PlotBooking b, EmiInstallment i, Associate a, Plot p
    WHERE i.bookingId = b.id AND a.id = b.associateId AND p.id = b.plotId
      AND b.status = com.plotchain.booking.BookingStatus.ACTIVE
      AND i.status = com.plotchain.booking.InstallmentStatus.PENDING AND i.dueDate < :today
    GROUP BY b.id, b.plotId, p.plotNo, b.associateId, a.name, b.buyerName, b.bookedAt
    ORDER BY MIN(i.dueDate) ASC, b.bookedAt ASC, b.id ASC
    """,
    countQuery = """
    SELECT COUNT(DISTINCT b.id)
    FROM PlotBooking b, EmiInstallment i
    WHERE i.bookingId = b.id
      AND b.status = com.plotchain.booking.BookingStatus.ACTIVE
      AND i.status = com.plotchain.booking.InstallmentStatus.PENDING AND i.dueDate < :today
    """)
Page<OverdueReportRow> findOverdueReport(@Param("today") LocalDate today, Pageable pageable);
```

If Hibernate rejects the enum-literal FQNs or `GROUP BY b.id` with non-aggregated select columns on H2, add the missing columns to GROUP BY or switch to `:active`/`:pending` enum params (add them as `@Param` args, pass from the service in Task 2; adjust the test calls). `Associate.getName()`/`Plot.getPlotNo()` are the field names `name`/`plotNo` (confirmed). Justification for grouped JPQL over Specification + in-memory aggregation: paging and the count are done by the DB, one query, no per-row lookups.

- [ ] **Step 4: Run to verify pass.**

Run: `mvn -q -Dtest=OverdueReportIntegrationTest test` (expect all green; if the tie test is flaky because Instant `bookedAt` ties, that is exactly what the `b.id` tiebreak covers).

- [ ] **Step 5: Commit.**

```bash
git add backend/src/main/java/com/plotchain/booking backend/src/test/java/com/plotchain/booking/OverdueReportIntegrationTest.java
git commit -m "feat(booking): grouped overdue-EMI query with booking-level count (unit 9)"
```

---

### Task 2: OverdueReportService with injected Clock

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/OverdueReportService.java`
- Test: `backend/src/test/java/com/plotchain/booking/OverdueReportServiceTest.java`

**Interfaces:**
- Consumes: `PlotBookingRepository.findOverdueReport(LocalDate, Pageable)`.
- Produces: `OverdueReportService(PlotBookingRepository, Clock)` and `OverdueReportPageResponse getOverdueReport(int page, int size)` (no clamping here; controller clamps, same split as `getMyBookings`).

- [ ] **Step 1: Failing test** (Mockito unit test, same style as `BookingServiceTest`: `@ExtendWith(MockitoExtension.class)`, `Clock.fixed(Instant.parse("2026-06-15T23:59:59Z"), ZoneOffset.UTC)`). Test 1: with mock repo returning a one-row `PageImpl`, assert the service passes `LocalDate.of(2026,6,15)` (use an `ArgumentCaptor<LocalDate>`) and an unsorted `PageRequest.of(2, 10)`, and maps `rows/page/size/totalElements`. Test 2: a second clock at `2026-06-16T00:00:00Z` passes `2026-06-16` (UTC date boundary, proves the Clock, not system time, drives "today").

- [ ] **Step 2: Run, expect compile failure.** `mvn -q -Dtest=OverdueReportServiceTest test`

- [ ] **Step 3: Implement.**

```java
@Service
public class OverdueReportService {
    private final PlotBookingRepository plotBookingRepository;
    private final Clock clock;
    public OverdueReportService(PlotBookingRepository plotBookingRepository, Clock clock) { ... }

    @Transactional(readOnly = true)
    public OverdueReportPageResponse getOverdueReport(int page, int size) {
        LocalDate today = LocalDate.now(clock);   // UTC: the Clock bean is Clock.systemUTC()
        Page<OverdueReportRow> result = plotBookingRepository.findOverdueReport(today, PageRequest.of(page, size));
        return new OverdueReportPageResponse(result.getContent(), page, size, result.getTotalElements());
    }
}
```

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Add one real-DB service-level check** to `OverdueReportIntegrationTest`: construct `new OverdueReportService(plotBookingRepository, Clock.fixed(TODAY.atStartOfDay(ZoneOffset.UTC).toInstant(), ZoneOffset.UTC))` (not the Spring bean, so the test is immune to midnight-UTC drift) and assert the seeded overdue booking appears. Run `mvn -q -Dtest='OverdueReportIntegrationTest,OverdueReportServiceTest' test`.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/main/java/com/plotchain/booking/OverdueReportService.java backend/src/test/java/com/plotchain/booking
git commit -m "feat(booking): OverdueReportService derives today from injected Clock (unit 9)"
```

---

### Task 3: Controller + SecurityConfig matcher + security matrix

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/AdminEmiReportController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (add after the `GET /api/admin/withdrawals/eligible-associates` matcher, before the public branding matchers)
- Test: `backend/src/test/java/com/plotchain/booking/AdminEmiReportControllerTest.java`; modify `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `OverdueReportService.getOverdueReport(int page, int size)`.

- [ ] **Step 1: Failing tests.**
  - `AdminEmiReportControllerTest`: copy `AssociateBookingControllerTest` structure (`@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")`, `@MockBean AssociateRepository`, `@MockBean OverdueReportService`, `tokenFor(AssociateRole.ADMIN, id)`). Tests: (a) admin GET returns 200 and JSON `rows[0].bookingId/plotId/associateId/associateName/buyerName/overdueCount/overdueAmount/oldestDueDate`, `page`, `size`, `totalElements`, mocking `getOverdueReport(eq(0), eq(20))`; (b) `page=-1&size=500` calls `getOverdueReport(0, 100)`.
  - `SecurityConfigTest` (append near the booking-confirm tests, same `tokenFor(role)` helper and `@ParameterizedTest @EnumSource(AssociateRole.class)` pattern; real service, real DB, empty/any report is fine): `GET /api/admin/emi-reports/overdue` -> `status().is(role == ADMIN ? 200 : 403)` for every role; and 401 without a token.

- [ ] **Step 2: Run, expect failure** (404 for admin; 200 not 403 for associate roles).

Run: `mvn -q -Dtest='AdminEmiReportControllerTest,SecurityConfigTest' test`

- [ ] **Step 3: Implement.** Bare `@RestController` (same reason as `AssociateBookingController`: avoid class-level `@RequestMapping` composition quirks):

```java
@RestController
public class AdminEmiReportController {
    private final OverdueReportService overdueReportService;
    public AdminEmiReportController(OverdueReportService s) { this.overdueReportService = s; }

    @GetMapping("/api/admin/emi-reports/overdue")
    public OverdueReportPageResponse getOverdue(@RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return overdueReportService.getOverdueReport(page, size);
    }
}
```

SecurityConfig matcher (with a comment in the file's style: GET has no blanket admin rule, so without this any associate could read the report; ordering is irrelevant because it must precede `anyRequest()`):

```java
.requestMatchers(HttpMethod.GET, "/api/admin/emi-reports/overdue")
    .hasAuthority("ADMIN")
```

Edge: `size=0` or negative reaches `PageRequest.of` and throws `IllegalArgumentException` (500). Mirror existing endpoints' behaviour by also clamping `size = Math.max(Math.min(size, 100), 1)`; add a controller test `size=0` -> service called with `(0, 1)`. (Deviation from `AssociateBookingController`, which lacks the lower bound; flagged in report.)

- [ ] **Step 4: Run, expect pass.** `mvn -q -Dtest='AdminEmiReportControllerTest,SecurityConfigTest' test`

- [ ] **Step 5: Commit.**

```bash
git add backend/src/main/java/com/plotchain backend/src/test/java/com/plotchain
git commit -m "feat(booking): GET /api/admin/emi-reports/overdue, ADMIN-only (unit 9)"
```

---

### Task 4: Final verification

- [ ] **Step 1:** Run the booking package plus security: `mvn -q -Dtest='com.plotchain.booking.*Test,SecurityConfigTest,SalesExceptionHandlerTest' test` (adjust the last name to whatever exists; drop it if not). Expect green apart from the known env noise listed above; compare against the 349-green targeted baseline plus the new tests.
- [ ] **Step 2:** Confirm unit 8's predicate was consulted (reused, or the parity test + pointer comment added per fallback) and that `git diff master --stat` touches no `BookingService.java`/`BookingController.java`.
- [ ] **Step 3:** Hand back for the coordinator to mark unit 9 merged (do not edit the units file).

## Self-Review

- Spec coverage: endpoint, ACTIVE-only, derived overdue via Clock, row fields, ASC sort, clamping, 401/403, booking-level total, fixed-Clock tests: all mapped to tasks above.
- Types consistent: `OverdueReportRow` / `OverdueReportPageResponse` / `findOverdueReport` / `getOverdueReport` names used identically in all tasks.
