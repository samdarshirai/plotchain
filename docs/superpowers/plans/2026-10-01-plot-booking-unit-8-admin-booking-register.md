# Plot Booking Unit 8: Admin Booking Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN `GET /api/admin/bookings` returns a paged, filterable (`status`, `associateId`, `plotId`, `projectId`, `overdue=true`) `AdminBookingPageResponse` of extended `BookingResponse` rows, newest booking first.

**Architecture:** One null-safe JPQL `@Query` on `PlotBookingRepository` (the approach `EPinRepository.search` already uses) with `EXISTS` subqueries for the project and overdue filters, so `totalElements` is never inflated. A NEW `BookingRegisterService` + NEW `AdminBookingRegisterController` hold the feature; the service loads the page's installments in ONE `findByBookingIdIn...` query, groups them in memory and maps rows with the existing package-private `BookingService.toResponse(booking, installments)` (already takes preloaded installments, so no refactor). The overdue predicate lives in one constants class (`BookingOverdue`) that unit 9 reuses.

**Tech Stack:** Spring Boot 3.3.4, Spring Data JPA/Hibernate 6 (JPQL), Flyway + H2 (test profile), JUnit 5 / AssertJ / MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decisions 7, 11, 12; Flow "Admin register"; Data model `AdminBookingPageResponse`; Testing; "Resolved decisions (post-slice)" #5 and #8). Unit queue: `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (unit 8 + carry-forward notes).

## Global Constraints

- Overdue is derived, never stored: installment `status = PENDING` AND `due_date < today`, today = `LocalDate.now(clock)` (UTC) via the injected `java.time.Clock` bean (`epin/EPinConfig`). Due today is NOT overdue.
- `overdue=true` is restricted to `ACTIVE` bookings (Resolved decision #5).
- Register sorts `booked_at` DESC (Resolved decision #8); this plan adds `id` DESC as the deterministic tiebreaker.
- `page >= 0`, `size <= 100` clamped in the controller (Decision 11).
- Admin-only: associate token 403, unauthenticated 401 (Decision 12). `SecurityConfig` has NO blanket `GET /api/admin/**` rule (only POST/PUT/PATCH/DELETE `/api/**` blankets), so an unmatched GET falls to `anyRequest().authenticated()` and would let any associate in. An explicit `GET /api/admin/bookings` -> `hasAuthority("ADMIN")` matcher is required.
- Package direction: `booking -> sales` allowed, never the reverse. This unit stays inside `booking` (+ `auth/SecurityConfig`).
- No frontend. No Flyway migration (all columns exist since V41).
- Env noise on test runs: ~55 spurious Mockito errors from the JDK21/25 mismatch and 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures on FULL runs. Last targeted baseline: 349 tests green on master. Run only targeted `-Dtest=` classes from the worktree's `backend/` dir (NOT the main checkout), e.g. `cd <worktree>/backend && mvn -q test -Dtest=PlotBookingRegisterRepositoryTest`.
- Do NOT edit `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (coordinator's job).

## Review Focus

- `size=0` (or negative): `PageRequest.of` throws -> 500 in the existing controllers; this controller clamps `size` to `[1,100]`. Test pins it.
- `status=BOGUS` / malformed UUID: expect 400, not 500. Test pins it.
- `overdue=false` or omitted: must mean "no overdue filter" (all statuses), not "only non-overdue". Test pins it.
- A booking with several overdue installments counted once and `totalElements` exact (EXISTS, not JOIN). Test pins it.
- Unknown `projectId`/`plotId`/`associateId`: empty page 200, not 404. Test pins it.
- Page past the end: empty `bookings`, `totalElements` still the true total. Test pins it.
- Two bookings with the same `booked_at`: stable order across pages (id DESC tiebreaker). Test pins it.
- Booking with zero installments maps to paid=0/due=0/empty list without error. Test pins it.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/main/java/com/plotchain/booking/BookingOverdue.java` | Create | Shared JPQL fragments for the overdue rule (unit 9 reuses) |
| `backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java` | Modify | Add `search(...)` |
| `backend/src/main/java/com/plotchain/booking/EmiInstallmentRepository.java` | Modify | Add `findByBookingIdInOrderByInstallmentNumberAsc` |
| `backend/src/main/java/com/plotchain/booking/AdminBookingPageResponse.java` | Create | Page DTO |
| `backend/src/main/java/com/plotchain/booking/BookingRegisterService.java` | Create | Register query + N+1-free mapping |
| `backend/src/main/java/com/plotchain/booking/AdminBookingRegisterController.java` | Create | `GET /api/admin/bookings`, clamping |
| `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` | Modify | ADMIN matcher for the GET |
| `backend/src/test/java/com/plotchain/booking/BookingRegisterTestData.java` | Create | Shared seed helper for the two real-DB tests |
| `backend/src/test/java/com/plotchain/booking/PlotBookingRegisterRepositoryTest.java` | Create | Filters/ordering/count against H2 |
| `backend/src/test/java/com/plotchain/booking/BookingRegisterServiceTest.java` | Create | Mapping, overdue flags with fixed Clock, one-query installment load |
| `backend/src/test/java/com/plotchain/booking/AdminBookingRegisterControllerTest.java` | Create | Param binding, clamping, 400s |
| `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` | Modify | 403/401 matrix |

**Why new service/controller (not BookingService/BookingController):** units 6 and 7 edit `BookingService`/`BookingController`; the register touches neither, so merges stay trivial. The new controller is a bare `@RestController` with an absolute `@GetMapping("/api/admin/bookings")`, same shape as `AssociateBookingController` (a class-level `@RequestMapping` on `BookingController` would compose badly). `BookingController` only has `@PostMapping` at `/api/admin/bookings`; different HTTP method, so no ambiguous mapping. Reuse of `BookingService.toResponse` means `BookingService` is only read, never edited. Dependency to watch: if unit 6/7 change `toResponse`'s signature, adjust the call in Task 2.

**Why JPQL (not derived queries / Specifications):** derived queries cannot combine five optional filters; `EPinRepository.search` already solves the same problem with `(:p IS NULL OR e.x = :p)` JPQL, and `JpaSpecificationExecutor` is not used anywhere in the repo. Match the repo. The overdue and project filters are `EXISTS` subqueries (entities hold plain UUID columns, no associations, so a join is not even available), keeping the count query honest.

Seed matrix (used by Tasks 1-2; "today" = 2026-06-15), all in two projects P1/P2 and two associates A1/A2:

| Booking | Assoc | Project | Status | bookedAt | Installments |
|---|---|---|---|---|---|
| B1 | A1 | P1 | ACTIVE | T+1d | #1 PENDING due 06-14 (overdue), #2 PENDING due 06-10 (overdue), #3 PENDING due 07-15 |
| B2 | A1 | P1 | ACTIVE | T+2d | #1 PENDING due 06-15 (due today: NOT overdue) |
| B3 | A2 | P1 | ACTIVE | T+3d | #1 PAID due 05-01, #2 PENDING due 08-01 |
| B4 | A2 | P2 | CONFIRMED | T+4d | #1 PENDING due 05-01 (past due but booking CONFIRMED) |
| B5 | A1 | P2 | CANCELLED | T+5d | #1 VOID due 05-01 |
| B6 | A2 | P2 | ACTIVE | T+6d | #1 PENDING due 06-14 (overdue) |
| B7 | A2 | P2 | ACTIVE | T+6d (same as B6) | #1 PAID due 05-01 |
| B8 | A1 | P1 | ACTIVE | T+0d | no installments |

Expected `overdue=true` set: {B1, B6}. Full order (booked_at DESC, id DESC): [B6/B7 by id DESC, B5, B4, B3, B2, B1, B8].

---

### Task 1: Overdue fragments + repository `search` (real-DB test)

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/BookingOverdue.java`
- Modify: `backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java`
- Create: `backend/src/test/java/com/plotchain/booking/BookingRegisterTestData.java`
- Test: `backend/src/test/java/com/plotchain/booking/PlotBookingRegisterRepositoryTest.java`

**Interfaces:**
- Consumes: entities `PlotBooking`, `EmiInstallment`, `Plot`, `Project`, `Associate`; enums `BookingStatus`, `InstallmentStatus`.
- Produces:
  - `BookingOverdue.INSTALLMENT_CONDITION` and `BookingOverdue.EXISTS_OVERDUE` (package-private `static final String`; alias contract: outer booking alias `b`, subquery installment alias `i`, named param `:today` of type `LocalDate`).
  - `Page<PlotBooking> PlotBookingRepository.search(BookingStatus status, UUID associateId, UUID plotId, UUID projectId, boolean overdueOnly, LocalDate today, Pageable pageable)`. Caller supplies the sort (`booked_at DESC, id DESC`) in the `Pageable`.
  - Test helper `BookingRegisterTestData` (see Step 1) returning the seeded matrix.

- [ ] **Step 1: Write the shared seed helper and the failing repository test**

`BookingRegisterTestData.java` (plain class, constructed with the repositories; all writes use `saveAndFlush` and the caller test is `@Transactional` so everything rolls back, no cleanup code):

```java
package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

// Seeds the unit-8 matrix (see plan). Call inside a @Transactional test: nothing is cleaned up.
class BookingRegisterTestData {
    static final Instant T = Instant.parse("2026-06-01T00:00:00Z");
    static final LocalDate TODAY = LocalDate.of(2026, 6, 15);

    UUID p1, p2, a1, a2;
    PlotBooking b1, b2, b3, b4, b5, b6, b7, b8;

    private final AssociateRepository associates;
    private final ProjectRepository projects;
    private final PlotRepository plots;
    private final PlotBookingRepository bookings;
    private final EmiInstallmentRepository installments;

    BookingRegisterTestData(AssociateRepository associates, ProjectRepository projects, PlotRepository plots,
                            PlotBookingRepository bookings, EmiInstallmentRepository installments) {
        this.associates = associates; this.projects = projects; this.plots = plots;
        this.bookings = bookings; this.installments = installments;
    }

    BookingRegisterTestData seed() {
        p1 = project("Reg P1");
        p2 = project("Reg P2");
        a1 = associate();
        a2 = associate();
        b1 = booking(a1, p1, BookingStatus.ACTIVE, 1);
        inst(b1, 1, InstallmentStatus.PENDING, "2026-06-14");
        inst(b1, 2, InstallmentStatus.PENDING, "2026-06-10");
        inst(b1, 3, InstallmentStatus.PENDING, "2026-07-15");
        b2 = booking(a1, p1, BookingStatus.ACTIVE, 2);
        inst(b2, 1, InstallmentStatus.PENDING, "2026-06-15");
        b3 = booking(a2, p1, BookingStatus.ACTIVE, 3);
        inst(b3, 1, InstallmentStatus.PAID, "2026-05-01");
        inst(b3, 2, InstallmentStatus.PENDING, "2026-08-01");
        b4 = booking(a2, p2, BookingStatus.CONFIRMED, 4);
        inst(b4, 1, InstallmentStatus.PENDING, "2026-05-01");
        b5 = booking(a1, p2, BookingStatus.CANCELLED, 5);
        inst(b5, 1, InstallmentStatus.VOID, "2026-05-01");
        b6 = booking(a2, p2, BookingStatus.ACTIVE, 6);
        inst(b6, 1, InstallmentStatus.PENDING, "2026-06-14");
        b7 = booking(a2, p2, BookingStatus.ACTIVE, 6);          // same booked_at as b6: tiebreak case
        inst(b7, 1, InstallmentStatus.PAID, "2026-05-01");
        b8 = booking(a1, p1, BookingStatus.ACTIVE, 0);          // zero installments
        return this;
    }

    private UUID project(String name) {
        Project p = new Project(UUID.randomUUID(), name, "Hyderabad", null, null, Instant.now());
        return projects.saveAndFlush(p).getId();
    }

    private UUID associate() {
        UUID id = UUID.randomUUID();
        Associate a = new Associate();
        a.setId(id);
        a.setPosition("L");
        a.setName("Reg Associate");
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setUserId("u-" + id);
        a.setEmail(id + "@test.local");
        a.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        a.setRole(AssociateRole.ADMIN);   // chk_associate_rank_required: ASSOCIATE rows need a rank_id
        return associates.saveAndFlush(a).getId();
    }

    private PlotBooking booking(UUID associateId, UUID projectId, BookingStatus status, int bookedDayOffset) {
        Plot plot = plots.saveAndFlush(new Plot(UUID.randomUUID(), projectId, "R-" + UUID.randomUUID().toString().substring(0, 8),
            PlotType.NORMAL, new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
            status == BookingStatus.CONFIRMED ? PlotStatus.SOLD : PlotStatus.BOOKED));
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(plot.getId());
        b.setAssociateId(associateId);
        b.setTotalAmount(new BigDecimal("600000.00"));
        b.setInstallmentCount(3);
        b.setBookedAt(T.plusSeconds(86400L * bookedDayOffset));
        b.setBuyerName("Buyer " + bookedDayOffset);
        b.setStatus(status);
        return bookings.saveAndFlush(b);
    }

    private void inst(PlotBooking b, int n, InstallmentStatus status, String due) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setBookingId(b.getId());
        i.setInstallmentNumber(n);
        i.setAmount(new BigDecimal("200000.00"));
        i.setDueDate(LocalDate.parse(due));
        i.setStatus(status);
        installments.saveAndFlush(i);
    }
}
```

(Before writing, confirm `Project`'s 6-arg constructor and `Plot`'s 8-arg constructor against `BookingPaymentIntegrationTest.seedAvailablePlot`, which uses exactly these; and that `EmiInstallment`/`PlotBooking` have the setters used above, they do per the merged entities. If a plot/status CHECK or unique constraint rejects a seed row, fix the helper, not the production code.)

`PlotBookingRegisterRepositoryTest.java`:

```java
package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static com.plotchain.booking.BookingRegisterTestData.TODAY;
import static org.assertj.core.api.Assertions.assertThat;

// Real-DB (H2 + Flyway) proof of the register query. @Transactional => every test rolls back.
// Every assertion scopes to the seeded projects (via projectId or an id-filter) because other
// test classes may leave committed rows behind.
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PlotBookingRegisterRepositoryTest {

    static final Sort NEWEST_FIRST = Sort.by(Sort.Direction.DESC, "bookedAt").and(Sort.by(Sort.Direction.DESC, "id"));

    @Autowired PlotBookingRepository repo;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;
    @Autowired EmiInstallmentRepository installments;

    BookingRegisterTestData d;

    @BeforeEach
    void seed() {
        d = new BookingRegisterTestData(associates, projects, plots, repo, installments).seed();
    }

    private Page<PlotBooking> search(BookingStatus status, UUID associateId, UUID plotId, UUID projectId,
                                     boolean overdue, int page, int size) {
        return repo.search(status, associateId, plotId, projectId, overdue, TODAY,
            PageRequest.of(page, size, NEWEST_FIRST));
    }

    private static List<UUID> ids(Page<PlotBooking> p) { return p.getContent().stream().map(PlotBooking::getId).toList(); }

    // b6 and b7 share booked_at, so their relative order is id DESC.
    private List<UUID> b6b7ByIdDesc() {
        return List.of(d.b6.getId(), d.b7.getId()).stream().sorted(java.util.Comparator.reverseOrder()).toList();
    }

    @Test
    void projectFilterAloneReturnsBothProjectsInNewestFirstOrderWithExactTotals() {
        Page<PlotBooking> p1 = search(null, null, null, d.p1, false, 0, 50);
        assertThat(ids(p1)).containsExactly(d.b3.getId(), d.b2.getId(), d.b1.getId(), d.b8.getId());
        assertThat(p1.getTotalElements()).isEqualTo(4);

        Page<PlotBooking> p2 = search(null, null, null, d.p2, false, 0, 50);
        List<UUID> expected = new java.util.ArrayList<>(b6b7ByIdDesc());
        expected.add(d.b5.getId());
        expected.add(d.b4.getId());
        assertThat(ids(p2)).containsExactlyElementsOf(expected);   // tiebreak: id DESC
        assertThat(p2.getTotalElements()).isEqualTo(4);
    }

    @Test
    void statusFilter() {
        assertThat(ids(search(BookingStatus.CONFIRMED, null, null, d.p2, false, 0, 50))).containsExactly(d.b4.getId());
        assertThat(ids(search(BookingStatus.CANCELLED, null, null, d.p2, false, 0, 50))).containsExactly(d.b5.getId());
        assertThat(search(BookingStatus.ACTIVE, null, null, d.p1, false, 0, 50).getTotalElements()).isEqualTo(4);
    }

    @Test
    void associateAndPlotFilters() {
        assertThat(ids(search(null, d.a1, null, d.p1, false, 0, 50)))
            .containsExactly(d.b2.getId(), d.b1.getId(), d.b8.getId());
        assertThat(ids(search(null, null, d.b3.getPlotId(), null, false, 0, 50))).containsExactly(d.b3.getId());
        // plot + wrong project = empty (filters AND together)
        assertThat(search(null, null, d.b3.getPlotId(), d.p2, false, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void overdueOnlyReturnsActiveBookingsWithAPendingInstallmentDueBeforeToday() {
        Page<PlotBooking> both = search(null, null, null, d.p1, true, 0, 50);
        assertThat(ids(both)).containsExactly(d.b1.getId());          // b2 due TODAY excluded, b3 PAID/future excluded
        Page<PlotBooking> p2 = search(null, null, null, d.p2, true, 0, 50);
        assertThat(ids(p2)).containsExactly(d.b6.getId());            // b4 CONFIRMED, b5 VOID, b7 PAID excluded
    }

    @Test
    void overdueWithTwoOverdueInstallmentsCountsTheBookingOnceAndTotalIsNotInflated() {
        // b1 has TWO overdue installments; a JOIN would give totalElements 2 and a duplicate row.
        Page<PlotBooking> p = search(null, d.a1, null, d.p1, true, 0, 50);
        assertThat(ids(p)).containsExactly(d.b1.getId());
        assertThat(p.getTotalElements()).isEqualTo(1);
    }

    @Test
    void overdueBoundaryUsesStrictlyBeforeToday() {
        // b2's only installment is due 06-15. today=06-15 -> not overdue; today=06-16 -> overdue.
        assertThat(repo.search(null, null, null, d.p1, true, TODAY.plusDays(1), PageRequest.of(0, 50, NEWEST_FIRST))
            .getContent()).extracting(PlotBooking::getId).contains(d.b2.getId());
        assertThat(repo.search(null, null, null, d.p1, true, TODAY, PageRequest.of(0, 50, NEWEST_FIRST))
            .getContent()).extracting(PlotBooking::getId).doesNotContain(d.b2.getId());
    }

    @Test
    void overdueNeverIncludesConfirmedOrCancelledEvenWithPastDuePendingInstallments() {
        assertThat(search(BookingStatus.CONFIRMED, null, null, d.p2, true, 0, 50).getTotalElements()).isZero();
        assertThat(search(BookingStatus.CANCELLED, null, null, d.p2, true, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void combinedFilters() {
        assertThat(ids(search(BookingStatus.ACTIVE, d.a2, null, d.p2, true, 0, 50))).containsExactly(d.b6.getId());
        assertThat(search(BookingStatus.ACTIVE, d.a1, null, d.p2, false, 0, 50).getTotalElements()).isZero();
    }

    @Test
    void unknownIdsGiveAnEmptyPage() {
        assertThat(search(null, UUID.randomUUID(), null, null, false, 0, 50).getTotalElements()).isZero();
        assertThat(search(null, null, UUID.randomUUID(), null, false, 0, 50).getTotalElements()).isZero();
        assertThat(search(null, null, null, UUID.randomUUID(), false, 0, 50).getContent()).isEmpty();
    }

    @Test
    void paginationKeepsTheTrueTotalAndAStableOrderAcrossPages() {
        Page<PlotBooking> first = search(null, null, null, d.p2, false, 0, 3);
        Page<PlotBooking> second = search(null, null, null, d.p2, false, 1, 3);
        Page<PlotBooking> beyond = search(null, null, null, d.p2, false, 5, 3);
        assertThat(first.getTotalElements()).isEqualTo(4);
        assertThat(ids(first)).hasSize(3);
        assertThat(ids(second)).containsExactly(d.b4.getId());
        assertThat(beyond.getContent()).isEmpty();
        assertThat(beyond.getTotalElements()).isEqualTo(4);
    }
}
```

- [ ] **Step 2: Run the test to confirm it fails**

Run (from `<worktree>/backend`): `mvn -q test -Dtest=PlotBookingRegisterRepositoryTest`
Expected: compilation error, `search` / `BookingOverdue` not defined.

- [ ] **Step 3: Implement `BookingOverdue` and `search`**

`BookingOverdue.java`:

```java
package com.plotchain.booking;

// ONE definition of "overdue" for JPQL (Decision 7): PENDING and due strictly before :today.
// Compile-time constants so they can be concatenated into @Query strings. Alias contract:
// outer booking alias `b`, installment alias `i`, named parameter `:today` (LocalDate, the
// caller's LocalDate.now(clock)). Unit 9 (overdue report) reuses these; the Java-side flag in
// BookingService.toResponse must stay equivalent (pinned by BookingRegisterServiceTest).
final class BookingOverdue {
    private BookingOverdue() {}

    // For queries that already join/scan installments `i` (e.g. unit 9's GROUP BY count/sum/min).
    static final String INSTALLMENT_CONDITION =
        "i.status = com.plotchain.booking.InstallmentStatus.PENDING AND i.dueDate < :today";

    // For filtering bookings `b` without multiplying rows.
    static final String EXISTS_OVERDUE =
        "EXISTS (SELECT 1 FROM EmiInstallment i WHERE i.bookingId = b.id AND " + INSTALLMENT_CONDITION + ")";
}
```

Add to `PlotBookingRepository` (imports `java.time.LocalDate`, `java.util.UUID` already, `org.springframework.data.domain.Page/Pageable` already):

```java
    // Admin register (plot-booking unit 8). Null-safe optional filters, same JPQL pattern as
    // EPinRepository.search. project_id lives on plot, so projectId is an EXISTS (no join => no
    // duplicate rows); overdue is EXISTS too, restricted to ACTIVE bookings (Resolved decision #5).
    // `today` is always non-null; `overdueOnly` is a primitive so no null-typed boolean binding.
    // Sort comes from the Pageable (booked_at DESC, id DESC); the count query is derived from this one.
    @Query("""
        SELECT b FROM PlotBooking b
        WHERE (:status IS NULL OR b.status = :status)
        AND (:associateId IS NULL OR b.associateId = :associateId)
        AND (:plotId IS NULL OR b.plotId = :plotId)
        AND (:projectId IS NULL OR EXISTS (SELECT 1 FROM Plot p WHERE p.id = b.plotId AND p.projectId = :projectId))
        AND (:overdueOnly = false OR (b.status = com.plotchain.booking.BookingStatus.ACTIVE AND """
        + BookingOverdue.EXISTS_OVERDUE + "))")
    Page<PlotBooking> search(
        @Param("status") BookingStatus status,
        @Param("associateId") UUID associateId,
        @Param("plotId") UUID plotId,
        @Param("projectId") UUID projectId,
        @Param("overdueOnly") boolean overdueOnly,
        @Param("today") LocalDate today,
        Pageable pageable);
```

Note: a text block followed by `+` is still a constant expression, valid in an annotation. If Hibernate rejects the derived count query, add an explicit `countQuery = "SELECT COUNT(b) FROM PlotBooking b WHERE ..."` using the same WHERE (duplicate via a second constant `REGISTER_WHERE` in `BookingOverdue`-style) rather than weakening the test.

- [ ] **Step 4: Run to confirm it passes**

Run: `mvn -q test -Dtest=PlotBookingRegisterRepositoryTest`
Expected: PASS (10 tests). If a null-UUID bind fails on H2 or Postgres typing, mirror exactly how `EPinRepository.search` binds `UUID` params (it is the proven pattern here).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/BookingOverdue.java \
        backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java \
        backend/src/test/java/com/plotchain/booking/BookingRegisterTestData.java \
        backend/src/test/java/com/plotchain/booking/PlotBookingRegisterRepositoryTest.java
git commit -m "feat(booking): register search query with EXISTS overdue/project filters (unit 8)"
```

---

### Task 2: `BookingRegisterService` (one installments query, reuse `toResponse`)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/EmiInstallmentRepository.java`
- Create: `backend/src/main/java/com/plotchain/booking/AdminBookingPageResponse.java`
- Create: `backend/src/main/java/com/plotchain/booking/BookingRegisterService.java`
- Test: `backend/src/test/java/com/plotchain/booking/BookingRegisterServiceTest.java`

**Interfaces:**
- Consumes: `PlotBookingRepository.search(...)` (Task 1); `BookingService.toResponse(PlotBooking, List<EmiInstallment>)` (package-private, merged unit 1); `BookingOverdue`; seed helper from Task 1.
- Produces:
  - `record AdminBookingPageResponse(List<BookingResponse> bookings, int page, int size, long totalElements)`
  - `List<EmiInstallment> EmiInstallmentRepository.findByBookingIdInOrderByInstallmentNumberAsc(Collection<UUID> bookingIds)`
  - `AdminBookingPageResponse BookingRegisterService.list(BookingStatus status, UUID associateId, UUID plotId, UUID projectId, boolean overdue, int page, int size)` (annotated `@Transactional(readOnly = true)`; expects already-clamped `page`/`size`).

- [ ] **Step 1: Write the failing service test**

Uses a `@Primary` fixed `Clock` (2026-06-15T10:00Z) so `LocalDate.now(clock)` is the seeded TODAY for both the service filter and `BookingService.toResponse`; `@SpyBean` on the installment repository proves the single batched query.

```java
package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class BookingRegisterServiceTest {

    @TestConfiguration
    static class FixedClockConfig {
        @Bean @Primary
        Clock fixedClock() { return Clock.fixed(Instant.parse("2026-06-15T10:00:00Z"), ZoneOffset.UTC); }
    }

    @Autowired BookingRegisterService service;
    @Autowired PlotBookingRepository bookings;
    @Autowired AssociateRepository associates;
    @Autowired ProjectRepository projects;
    @Autowired PlotRepository plots;
    @SpyBean EmiInstallmentRepository installments;

    BookingRegisterTestData d;

    @BeforeEach
    void seed() {
        d = new BookingRegisterTestData(associates, projects, plots, bookings, installments).seed();
        reset(installments);   // forget the seeding calls; only count the service's reads
    }

    private static List<UUID> ids(com.plotchain.booking.AdminBookingPageResponse p) {
        return p.bookings().stream().map(BookingResponse::id).toList();
    }

    @Test
    void rowsCarryStatusBuyerPaidDueAndPerInstallmentOverdueFlagsFromTheInjectedClock() {
        AdminBookingPageResponse page = service.list(null, d.a1, null, d.p1, false, 0, 50);
        assertThat(ids(page)).containsExactly(d.b2.getId(), d.b1.getId(), d.b8.getId());

        BookingResponse b1 = page.bookings().get(1);
        assertThat(b1.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(b1.buyerName()).isEqualTo("Buyer 1");
        assertThat(b1.installments()).extracting(EmiInstallmentResponse::installmentNumber).containsExactly(1, 2, 3);
        assertThat(b1.installments()).extracting(EmiInstallmentResponse::overdue).containsExactly(true, true, false);
        assertThat(b1.paidAmount()).isEqualByComparingTo("0");
        assertThat(b1.dueAmount()).isEqualByComparingTo("600000.00");

        // due today is NOT overdue
        assertThat(page.bookings().get(0).installments().get(0).overdue()).isFalse();
        // zero installments maps cleanly
        BookingResponse b8 = page.bookings().get(2);
        assertThat(b8.installments()).isEmpty();
        assertThat(b8.paidAmount()).isEqualByComparingTo("0");
        assertThat(b8.dueAmount()).isEqualByComparingTo("0");
    }

    @Test
    void paidAndVoidInstallmentsAreNeverFlaggedOverdueEvenWhenPastDue() {
        AdminBookingPageResponse p2 = service.list(null, null, null, d.p2, false, 0, 50);
        BookingResponse b5 = p2.bookings().stream().filter(b -> b.id().equals(d.b5.getId())).findFirst().orElseThrow();
        BookingResponse b7 = p2.bookings().stream().filter(b -> b.id().equals(d.b7.getId())).findFirst().orElseThrow();
        assertThat(b5.installments().get(0).overdue()).isFalse();   // VOID
        assertThat(b7.installments().get(0).overdue()).isFalse();   // PAID
    }

    @Test
    void overdueFilterAgreesWithTheRowFlags() {
        AdminBookingPageResponse overdue = service.list(null, null, null, null, true, 0, 100);
        List<BookingResponse> mine = overdue.bookings().stream()
            .filter(b -> List.of(d.b1.getId(), d.b6.getId()).contains(b.id())
                      || List.of(d.b2.getId(), d.b3.getId(), d.b4.getId()).contains(b.id())).toList();
        assertThat(mine).extracting(BookingResponse::id).containsExactlyInAnyOrder(d.b1.getId(), d.b6.getId());
        // every returned row (including any leftovers from other tests) has >=1 overdue installment and is ACTIVE
        assertThat(overdue.bookings()).allSatisfy(b -> {
            assertThat(b.status()).isEqualTo(BookingStatus.ACTIVE);
            assertThat(b.installments()).anyMatch(EmiInstallmentResponse::overdue);
        });
    }

    @Test
    void loadsInstallmentsForTheWholePageInExactlyOneQuery() {
        AdminBookingPageResponse page = service.list(null, null, null, d.p1, false, 0, 50);
        assertThat(page.bookings()).hasSize(4);
        verify(installments, times(1)).findByBookingIdInOrderByInstallmentNumberAsc(anyCollection());
        verify(installments, never()).findByBookingIdOrderByInstallmentNumberAsc(any());
    }

    @Test
    void anEmptyPageSkipsTheInstallmentQueryAndReturnsZeroTotal() {
        AdminBookingPageResponse page = service.list(null, UUID.randomUUID(), null, null, false, 0, 20);
        assertThat(page.bookings()).isEmpty();
        assertThat(page.totalElements()).isZero();
        assertThat(page.page()).isZero();
        assertThat(page.size()).isEqualTo(20);
        verify(installments, never()).findByBookingIdInOrderByInstallmentNumberAsc(anyCollection());
    }

    @Test
    void pageEnvelopeEchoesPageSizeAndTrueTotal() {
        AdminBookingPageResponse page = service.list(null, null, null, d.p2, false, 1, 3);
        assertThat(page.page()).isEqualTo(1);
        assertThat(page.size()).isEqualTo(3);
        assertThat(page.totalElements()).isEqualTo(4);
        assertThat(page.bookings()).hasSize(1);
        assertThat(page.bookings().get(0).id()).isEqualTo(d.b4.getId());
    }
}
```

Remove the unused `Collection` import if the compiler warns.

- [ ] **Step 2: Run to confirm it fails**

Run: `mvn -q test -Dtest=BookingRegisterServiceTest`
Expected: compilation error (`BookingRegisterService`, `AdminBookingPageResponse`, new repo method missing).

- [ ] **Step 3: Implement**

`EmiInstallmentRepository` add (import `java.util.Collection`):

```java
    // One query for a whole register page (avoids the per-booking N+1 in getMyBookings).
    // Ordered by number so each booking's group is already in schedule order.
    List<EmiInstallment> findByBookingIdInOrderByInstallmentNumberAsc(Collection<UUID> bookingIds);
```

`AdminBookingPageResponse.java`:

```java
package com.plotchain.booking;

import java.util.List;

public record AdminBookingPageResponse(List<BookingResponse> bookings, int page, int size, long totalElements) {}
```

`BookingRegisterService.java`:

```java
package com.plotchain.booking;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

// Plot-booking unit 8 (spec Flow "Admin register", Decision 11). Separate from BookingService on
// purpose: units 6/7 edit BookingService, this read path must not conflict with them. Rows are
// mapped by BookingService.toResponse (package-private, takes preloaded installments), so the
// overdue flag has one Java definition; the filter's overdue definition is BookingOverdue (JPQL).
@Service
public class BookingRegisterService {

    // booked_at DESC (Resolved decision #8); id DESC makes ties deterministic across pages.
    private static final Sort NEWEST_FIRST =
        Sort.by(Sort.Direction.DESC, "bookedAt").and(Sort.by(Sort.Direction.DESC, "id"));

    private final PlotBookingRepository plotBookingRepository;
    private final EmiInstallmentRepository emiInstallmentRepository;
    private final BookingService bookingService;
    private final Clock clock;

    public BookingRegisterService(PlotBookingRepository plotBookingRepository,
                                  EmiInstallmentRepository emiInstallmentRepository,
                                  BookingService bookingService, Clock clock) {
        this.plotBookingRepository = plotBookingRepository;
        this.emiInstallmentRepository = emiInstallmentRepository;
        this.bookingService = bookingService;
        this.clock = clock;
    }

    // page/size must already be clamped by the caller (controller).
    @Transactional(readOnly = true)
    public AdminBookingPageResponse list(BookingStatus status, UUID associateId, UUID plotId, UUID projectId,
                                         boolean overdue, int page, int size) {
        Page<PlotBooking> result = plotBookingRepository.search(
            status, associateId, plotId, projectId, overdue, LocalDate.now(clock),
            PageRequest.of(page, size, NEWEST_FIRST));

        List<UUID> bookingIds = result.getContent().stream().map(PlotBooking::getId).toList();
        Map<UUID, List<EmiInstallment>> byBooking = bookingIds.isEmpty() ? Map.of()
            : emiInstallmentRepository.findByBookingIdInOrderByInstallmentNumberAsc(bookingIds).stream()
                .collect(Collectors.groupingBy(EmiInstallment::getBookingId));

        List<BookingResponse> rows = result.getContent().stream()
            .map(b -> bookingService.toResponse(b, byBooking.getOrDefault(b.getId(), List.of())))
            .toList();
        return new AdminBookingPageResponse(rows, page, size, result.getTotalElements());
    }
}
```

(`groupingBy` over an already-ordered stream preserves per-group order. Confirm `EmiInstallment.getBookingId()` exists; the entity has the field `bookingId` and `setBookingId`.)

- [ ] **Step 4: Run to confirm it passes**

Run: `mvn -q test -Dtest=BookingRegisterServiceTest+PlotBookingRegisterRepositoryTest`
Expected: PASS. If `@SpyBean` on the repository proxy misbehaves under this JDK (Boot 3.3.4: use `@SpyBean`, not `@MockitoSpyBean`), fall back to asserting statement count via Hibernate `Statistics#getPrepareStatementCount` (enable `hibernate.generate_statistics` for the test) instead of dropping the one-query assertion.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/EmiInstallmentRepository.java \
        backend/src/main/java/com/plotchain/booking/AdminBookingPageResponse.java \
        backend/src/main/java/com/plotchain/booking/BookingRegisterService.java \
        backend/src/test/java/com/plotchain/booking/BookingRegisterServiceTest.java
git commit -m "feat(booking): BookingRegisterService maps a register page with one installments query (unit 8)"
```

---

### Task 3: Controller, security matcher, and HTTP tests

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/AdminBookingRegisterController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (directly after the `POST /api/admin/bookings` matcher, ~line 236)
- Test: `backend/src/test/java/com/plotchain/booking/AdminBookingRegisterControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (append after `adminBookingConfirmIsUnauthorizedWithoutAToken`, ~line 589)

**Interfaces:**
- Consumes: `BookingRegisterService.list(BookingStatus, UUID, UUID, UUID, boolean, int, int)`, `AdminBookingPageResponse` (Task 2).
- Produces: `GET /api/admin/bookings?status=&associateId=&plotId=&projectId=&overdue=&page=&size=` -> `AdminBookingPageResponse`.

- [ ] **Step 1: Write the failing tests**

`AdminBookingRegisterControllerTest.java` (mocked service, same `@MockBean` + token pattern as `BookingControllerTest`; copy its `tokenFor` helper and imports):

```java
package com.plotchain.booking;

// imports as BookingControllerTest (+ org.mockito.Mockito.verify, ArgumentMatchers.anyInt/anyBoolean/isNull,
// MockMvcRequestBuilders.get)

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminBookingRegisterControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean BookingRegisterService registerService;

    // tokenFor(role): identical to BookingControllerTest.tokenFor(AssociateRole)

    private String admin() { return "Bearer " + tokenFor(AssociateRole.ADMIN); }

    @Test
    void noParamsUsesDefaultsAndReturnsTheEnvelope() throws Exception {
        when(registerService.list(any(), any(), any(), any(), eq(false), eq(0), eq(20)))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 20, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bookings").isEmpty())
            .andExpect(jsonPath("$.page").value(0))
            .andExpect(jsonPath("$.size").value(20))
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void filtersAreBoundAndForwarded() throws Exception {
        UUID assoc = UUID.randomUUID(), plot = UUID.randomUUID(), project = UUID.randomUUID();
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 2, 5, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
                .param("status", "ACTIVE").param("associateId", assoc.toString())
                .param("plotId", plot.toString()).param("projectId", project.toString())
                .param("overdue", "true").param("page", "2").param("size", "5"))
            .andExpect(status().isOk());
        verify(registerService).list(BookingStatus.ACTIVE, assoc, plot, project, true, 2, 5);
    }

    @Test
    void overdueFalseOrOmittedMeansNoOverdueFilter() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 20, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("overdue", "false"))
            .andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, 0, 20);
    }

    @Test
    void pageAndSizeAreClamped() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 100, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin())
            .param("page", "-3").param("size", "1000")).andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, 0, 100);
    }

    @Test
    void sizeZeroOrNegativeIsClampedToOneNotA500() throws Exception {
        when(registerService.list(any(), any(), any(), any(), anyBoolean(), anyInt(), anyInt()))
            .thenReturn(new AdminBookingPageResponse(List.of(), 0, 1, 0));
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("size", "0"))
            .andExpect(status().isOk());
        verify(registerService).list(null, null, null, null, false, 0, 1);
    }

    @Test
    void badStatusOrBadUuidIs400() throws Exception {
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("status", "BOGUS"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/admin/bookings").header("Authorization", admin()).param("associateId", "nope"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void getDoesNotCollideWithPostOnTheSamePath() throws Exception {
        // POST still reaches BookingController (validation 400 on an empty body, not 405/ambiguous)
        mockMvc.perform(post("/api/admin/bookings").header("Authorization", admin())
                .contentType("application/json").content("{}"))
            .andExpect(status().isBadRequest());
    }
}
```

`SecurityConfigTest` append (real H2, unmocked `BookingRegisterService`, so ADMIN gets 200 with a page; follows the `adminSalesList...` pattern):

```java
    // plot-booking unit 8 (Decision 12): GET /api/admin/bookings needs its OWN ADMIN matcher --
    // SecurityConfig has no blanket GET /api/admin/**, so without it any authenticated associate
    // would fall through to anyRequest().authenticated() and read every booking. ADMIN reaches the
    // real (H2, unmocked) register query and gets 200; every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingRegisterIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/admin/bookings")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }

    @Test
    void adminBookingRegisterIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/bookings")).andExpect(status().isUnauthorized());
    }

    @Test
    void adminBookingRegisterWithOverdueFilterIsAlsoAdminOnly() throws Exception {
        mockMvc.perform(get("/api/admin/bookings").param("overdue", "true")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
```

- [ ] **Step 2: Run to confirm they fail**

Run: `mvn -q test -Dtest=AdminBookingRegisterControllerTest+SecurityConfigTest`
Expected: controller test fails to compile or 404/405 (no GET mapping); the security 403 assertion for a non-admin role FAILS (a non-admin gets 200 or 404 through `anyRequest().authenticated()`), which proves the matcher is needed.

- [ ] **Step 3: Implement**

`AdminBookingRegisterController.java`:

```java
package com.plotchain.booking;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Bare @RestController with an absolute path (same shape as AssociateBookingController): a
// class-level @RequestMapping("/api/admin/bookings") already sits on BookingController, which
// only maps POST/PATCH under it. This GET shares the path with POST /api/admin/bookings; Spring
// routes by HTTP method, so there is no ambiguity (pinned by getDoesNotCollideWithPostOnTheSamePath).
@RestController
public class AdminBookingRegisterController {

    private final BookingRegisterService registerService;

    public AdminBookingRegisterController(BookingRegisterService registerService) {
        this.registerService = registerService;
    }

    @GetMapping("/api/admin/bookings")
    public AdminBookingPageResponse list(
            @RequestParam(required = false) BookingStatus status,
            @RequestParam(required = false) UUID associateId,
            @RequestParam(required = false) UUID plotId,
            @RequestParam(required = false) UUID projectId,
            @RequestParam(defaultValue = "false") boolean overdue,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(Math.max(size, 1), 100);   // min 1: PageRequest.of rejects size < 1 (would be a 500)
        return registerService.list(status, associateId, plotId, projectId, overdue, page, size);
    }
}
```

`SecurityConfig.java`, directly after the existing `POST /api/admin/bookings` matcher:

```java
                // Admin booking register (plot-booking unit 8, Decision 12): GET needs its own
                // matcher -- there is no blanket GET /api/admin/** rule, so without this an
                // associate token would fall through to anyRequest().authenticated().
                .requestMatchers(HttpMethod.GET, "/api/admin/bookings")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run to confirm they pass**

Run: `mvn -q test -Dtest=AdminBookingRegisterControllerTest+SecurityConfigTest+BookingControllerTest+AssociateBookingControllerTest`
Expected: PASS. If `@MockBean` on the concrete `BookingRegisterService` hits the documented Mockito/JDK issue, mirror how `BookingControllerTest` already mocks `BookingService` (it works there); do not skip the clamp tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/AdminBookingRegisterController.java \
        backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/booking/AdminBookingRegisterControllerTest.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(booking): GET /api/admin/bookings register endpoint, ADMIN-only (unit 8)"
```

---

### Task 4: Regression pass

**Files:** none (verification only; no unit-file/status edits).

- [ ] **Step 1: Run every booking-package test plus security**

Run (from `<worktree>/backend`): `mvn -q test -Dtest='com.plotchain.booking.*Test,SecurityConfigTest'`
Expected: all green (baseline: 349 targeted tests green on master before this unit; this unit adds about 24). Do not chase the ~55 spurious Mockito errors or the 4 `JwtServiceTest`/`SecretsEncryptionServiceTest` failures that appear only on FULL runs; they are the known JDK21/25 env noise and pre-existing.

- [ ] **Step 2: Confirm the diff touches only the files listed in File Structure**

Run: `git diff --stat master...HEAD`
Expected: no change to `BookingService.java`, `BookingController.java`, any migration, or the `-units.md` file.

(No commit; the coordinator marks the unit merged.)

---

## Notes for unit 9 (overdue report) reuse

- Import nothing new: `BookingOverdue.INSTALLMENT_CONDITION` / `EXISTS_OVERDUE` are package-private in `com.plotchain.booking`. A grouped report query concatenates them, e.g. `SELECT b.id, COUNT(i), SUM(i.amount), MIN(i.dueDate) FROM PlotBooking b, EmiInstallment i WHERE i.bookingId = b.id AND b.status = ...ACTIVE AND ` + `BookingOverdue.INSTALLMENT_CONDITION` + ` GROUP BY b.id`, binding `:today = LocalDate.now(clock)`.
- Unit 9 needs its own `GET /api/admin/emi-reports/overdue` SecurityConfig matcher (same no-blanket-GET reason); it should sit next to the one added here.

## Self-Review

- Spec coverage: GET + page/size clamp (Task 3), filters and combos (Task 1), extended rows with overdue flags (Task 2), booked_at DESC + tiebreaker (Tasks 1-2), ADMIN-only 403/401 + route collision (Task 3), overdue ACTIVE-only and due-today boundary (Task 1/2), no N+1 (Task 2 spy), EXISTS not JOIN (Task 1 inflation test), reusable predicate (BookingOverdue).
- Type consistency: `search(BookingStatus, UUID, UUID, UUID, boolean, LocalDate, Pageable)` used identically in Tasks 1-2; `list(BookingStatus, UUID, UUID, UUID, boolean, int, int)` identical in Tasks 2-3; `findByBookingIdInOrderByInstallmentNumberAsc(Collection<UUID>)` identical in service and spy assertions.
- No placeholders; each code step contains the code.
