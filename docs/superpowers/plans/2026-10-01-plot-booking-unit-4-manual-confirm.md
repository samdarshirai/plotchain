# Plot Booking Unit 4 — Admin Manually Confirms an ACTIVE Booking (Creates a Linked Sale) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/admin/bookings/{id}/confirm` turns an `ACTIVE` booking into `CONFIRMED`, creating a `Sale` linked via `sale.booking_id` and `plot_booking.sale_id`, flipping the plot `BOOKED` -> `SOLD`, and writing a `CONFIRMED` `booking_event`, all in one transaction.

**Architecture:** `BookingService.confirmBooking(bookingId, actorId)` (public, transactional) locks the booking, checks `ACTIVE`, then delegates to a package-private `confirmLocked(booking, actorId)` that locks the plot, calls `SaleService.recordConfirmedBooking(...)` (unit 3), stamps the booking, and writes the event. Unit 5 will call `confirmLocked` from `afterInstallmentPaid` inside `recordPayment`'s transaction. `BookingController` gets one new endpoint. No migration, no sales-package change.

**Tech Stack:** Spring Boot 3, JPA/Hibernate, Flyway (H2 in tests, PostgreSQL in prod), JUnit 5, Mockito, AssertJ, MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decisions 1, 2, 3, 8, 12; Flow "Confirm"; Error handling; Testing; Resolved decisions). Unit queue: `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (unit 4 + "Carry-forward notes" + the "Spec correction": no sale-time leg-volume logic exists; parity is `legCredited`, `cycleId`, ledger entries). Prior units: `2026-10-01-plot-booking-unit-{1,2,3}-*.md`.

## Global Constraints

- ADMIN-only via the existing blanket `/api/admin/**` write rules in `SecurityConfig`; associate token 403, no token 401. No `SecurityConfig` edit needed (Decision 12).
- Lock order is **booking row first, then plot row** (Decision 8). `findByIdForUpdate` must be the first statement of the transaction on each.
- `booking -> sales` is the allowed package dependency direction; `sales` must never import `booking` (`recordConfirmedBooking` takes primitives for this reason).
- Sale amount = `booking.total_amount`; buyer name/phone from the booking; note "Confirmed from booking {id}" (all already done inside `recordConfirmedBooking`, do not re-implement).
- Manual confirm is never blocked by `confirmRule` (Decision 1): confirm does not read `booking_emi_config` at all.
- Voiding the linked sale returns the plot to `AVAILABLE`; booking stays `CONFIRMED` (Decision 3) — no code change, this unit owns the test.
- Do NOT implement threshold/auto-confirm logic (unit 5), cancel (6), transfer (7).
- Backend-only unit. No frontend work.
- Do not edit `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (coordinator's job).

## Decisions made in this plan (spec was silent; flagged for the reviewer)

1. **Non-BOOKED plot handling (carry-forward item 1).** `confirmLocked` checks `plot.getStatus() != PlotStatus.BOOKED` itself, after locking, and throws the existing `booking.PlotNotAvailableException`, which `BookingExceptionHandler` already maps to **409**. It does not catch/translate the sales exception: catching a `RuntimeException` that crossed the `@Transactional` `recordConfirmedBooking` proxy has already marked the shared transaction rollback-only, so a catch-and-rethrow is pure noise and easy to get wrong. The sales exception stays as an unreachable defence-in-depth guard; if it ever leaked, `SalesExceptionHandler` also maps it to 409, so the status code is identical either way. Known wart: the booking exception's message says "not available for booking"; accepted rather than adding a new exception class for a data-drift-only case (reachable only if an admin edited the plot status through plot CRUD while a booking was ACTIVE).
2. **`confirmLocked(PlotBooking lockedBooking, UUID actorId)` takes the booking only and locks the plot itself** (not `(booking, plot, actorId)`). One place enforces booking -> plot order, and unit 5 (which holds only the booking lock inside pay) needs no plot-locking code of its own. Precondition documented in a comment: caller already holds the booking row lock and has verified `ACTIVE`.
3. **Link direction (carry-forward item 4): keep both columns, no new migration.** `sale.booking_id` (FK + unique index `uq_sale_booking_id` from V41) is the authoritative, indexed link and the concurrency backstop. `plot_booking.sale_id` is a denormalised read convenience (set by confirm, per acceptance criteria). It is never queried by `sale_id`, so an index would be dead weight; V41 is the latest migration (next free would be V42) and none is added. **Consequence for tests:** the two FKs are circular (`sale.booking_id -> plot_booking`, `plot_booking.sale_id -> sale`), so test cleanup must null `plot_booking.sale_id` before deleting the sale. Task 3 shows how.
4. **Response shape:** confirm returns `200` with the updated `BookingResponse` (same as pay), not the `SaleResponse`. The sale id is in the booking's event detail and in `sale.booking_id`; the admin UI (unit 12) refetches booking detail.
5. **Event detail text:** `"sale <saleId>, amount <total>"`.
6. **Manual-under-both-rules (Decision 1) is proven at unit level** by asserting `bookingEmiConfigRepository` is never touched, not by flipping the global `booking_emi_config` singleton in an integration test (shared mutable state, restore risk).

## Review Focus

- Booking whose plot was edited away from `BOOKED` (data drift): expect 409, booking stays `ACTIVE`, no sale, no event (Task 1 unit test + Task 3 rollback test).
- Confirm of an already `CONFIRMED` booking (double click / retry): 409, still exactly one sale (Task 3 + Task 4).
- `recordConfirmedBooking` failure mid-way (e.g. missing compensation plan version): booking must not end up `CONFIRMED` without a sale; one transaction (Task 3 rollback test).
- Plot-lock-before-booking-lock inversions causing deadlock under concurrent confirm (Task 1 `InOrder` test + Task 4 concurrency test).
- Cleanup of circular booking/sale FKs breaking later test classes sharing the H2 DB (Task 3 cleanup helper).

## Lock-ordering audit (item 5/6, verified against the code)

- `PlotRepository.findByIdForUpdate` exists (`@Lock(PESSIMISTIC_WRITE)`); `createBooking` locks the plot first, but it then **inserts** a brand-new booking nobody else can reference yet, so it cannot invert against booking -> plot paths.
- `recordPayment` (unit 2) locks the booking only. Unit 5 will add a plot lock after it via `confirmLocked` — booking -> plot, consistent.
- `confirmBooking` (this unit): booking -> plot. Cancel (unit 6) must also be booking -> plot. Transfer (7) booking only.
- Rule for all future code: **never take the plot lock and then the booking lock.** Stated here and in the `confirmLocked` comment.
- `SaleService.recordSale`/`voidSale` do not lock bookings; `voidSale` takes no row locks at all. Out of scope here.

## File Structure

- Modify `backend/src/main/java/com/plotchain/booking/BookingService.java` — add `SaleService` constructor dependency, `confirmBooking`, `confirmLocked`.
- Modify `backend/src/main/java/com/plotchain/booking/BookingController.java` — add `POST /{id}/confirm`.
- Modify `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java` — new constructor arg + confirm unit tests (+ Appendix B test).
- Modify `backend/src/test/java/com/plotchain/booking/BookingControllerTest.java` — confirm controller tests.
- Modify `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — confirm 403/401 matrix.
- Create `backend/src/test/java/com/plotchain/booking/BookingConfirmIntegrationTest.java` — real-DB happy path, parity, void, rollback, concurrency.
- Modify `backend/src/test/java/com/plotchain/booking/BookingEventRepositoryTest.java` — Appendix A (one event per type).

## Running tests (read first)

Run everything from the **worktree's** `backend` directory (`<worktree>/backend`), never the main checkout:

```bash
cd <worktree>/backend && mvn -q -Dtest=BookingServiceTest test
```

Environment noise: a full `mvn test` shows ~55 spurious Mockito errors (JDK21/25 mismatch) and 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Targeted classes ran clean in units 1-3; judge this unit only by the targeted `-Dtest=` runs below. Per project convention do not mark the unit merged in the tracking file; the coordinator does that.

---

### Task 1: `confirmBooking` / `confirmLocked` in `BookingService` (unit tests)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/BookingService.java`
- Test: `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java`

**Interfaces:**
- Consumes: `SaleService.recordConfirmedBooking(UUID bookingId, UUID associateId, String buyerName, String buyerPhone, BigDecimal totalAmount, Plot plot) -> SaleResponse` (unit 3, `com.plotchain.sales`); `PlotBookingRepository.findByIdForUpdate`; `PlotRepository.findByIdForUpdate`; `BookingEvent.of(...)`.
- Produces: `public BookingResponse confirmBooking(UUID bookingId, UUID actorId)`; package-private `void confirmLocked(PlotBooking lockedBooking, UUID actorId)` (unit 5 calls this).

- [ ] **Step 1: Update the test fixture and write failing tests**

In `BookingServiceTest`: add `import com.plotchain.sales.SaleResponse; import com.plotchain.sales.SaleService; import org.mockito.InOrder; import static org.mockito.Mockito.inOrder; import static org.mockito.Mockito.verifyNoInteractions; import static org.mockito.ArgumentMatchers.eq;` (skip any already present), add `@Mock SaleService saleService;`, and change `setUp()` to pass it as the new **last-but-one**... exact order below (SaleService goes after `BookingEventRepository`, before `Clock`):

```java
bookingService = new BookingService(
    plotRepository, associateRepository, bookingEmiConfigRepository,
    plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService, clock);
```

Add these helpers and tests (append near the other `recordPayment` tests):

```java
private Plot plotWithStatus(PlotStatus status) {
    return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
        new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
}

private SaleResponse saleResponse(UUID saleId) {
    return new SaleResponse(saleId, PLOT_ID, ASSOCIATE_ID, "Jane Buyer", null, null,
        new BigDecimal("600000.00"), UUID.randomUUID(), "L", "RECORDED", null, NOW,
        "A-101", "Green Valley", "u1", "Test Associate", "note");
}

// Booking locked + ACTIVE (bookingWithBuyer defaults status ACTIVE), plot locked with given status.
private PlotBooking lockedBookingAndPlot(PlotStatus plotStatus, UUID saleId) {
    PlotBooking booking = bookingWithBuyer();
    when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
    when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
        .thenReturn(List.of());
    Plot plot = plotWithStatus(plotStatus);
    when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plot));
    if (saleId != null) {
        when(saleService.recordConfirmedBooking(any(), any(), any(), any(), any(), any()))
            .thenReturn(saleResponse(saleId));
    }
    return booking;
}

@Test
void confirmBookingCreatesSaleFromBookingFieldsStampsBookingAndWritesConfirmedEvent() {
    UUID saleId = UUID.randomUUID();
    PlotBooking booking = lockedBookingAndPlot(PlotStatus.BOOKED, saleId);
    booking.setBuyerPhone("999");

    BookingResponse response = bookingService.confirmBooking(booking.getId(), ACTOR_ID);

    verify(saleService).recordConfirmedBooking(eq(booking.getId()), eq(ASSOCIATE_ID),
        eq("Jane Buyer"), eq("999"), eq(new BigDecimal("600000.00")), any(Plot.class));
    assertThat(booking.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
    assertThat(booking.getConfirmedAt()).isEqualTo(NOW);
    assertThat(booking.getSaleId()).isEqualTo(saleId);
    verify(plotBookingRepository).save(booking);

    ArgumentCaptor<BookingEvent> event = ArgumentCaptor.forClass(BookingEvent.class);
    verify(bookingEventRepository).save(event.capture());
    assertThat(event.getValue().getType()).isEqualTo(BookingEventType.CONFIRMED);
    assertThat(event.getValue().getBookingId()).isEqualTo(booking.getId());
    assertThat(event.getValue().getActorId()).isEqualTo(ACTOR_ID);
    assertThat(event.getValue().getCreatedAt()).isEqualTo(NOW);
    assertThat(event.getValue().getDetail()).contains(saleId.toString()).contains("600000");
    assertThat(response.status()).isEqualTo(BookingStatus.CONFIRMED);
}

@Test
void confirmBookingLocksTheBookingBeforeThePlotAndNeverUsesAnUnlockedFind() {
    PlotBooking booking = lockedBookingAndPlot(PlotStatus.BOOKED, UUID.randomUUID());

    bookingService.confirmBooking(booking.getId(), ACTOR_ID);

    InOrder order = inOrder(plotBookingRepository, plotRepository);
    order.verify(plotBookingRepository).findByIdForUpdate(booking.getId());
    order.verify(plotRepository).findByIdForUpdate(PLOT_ID);
    verify(plotRepository, never()).findById(any());
}

@Test
void confirmBookingOnUnknownBookingIs404AndTouchesNothingElse() {
    UUID id = UUID.randomUUID();
    when(plotBookingRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> bookingService.confirmBooking(id, ACTOR_ID))
        .isInstanceOf(BookingNotFoundException.class);
    verifyNoInteractions(plotRepository, saleService, bookingEventRepository);
}

@Test
void confirmBookingOnNonActiveBookingIs409BeforeLockingThePlot() {
    for (BookingStatus status : List.of(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)) {
        PlotBooking booking = bookingWithBuyer();
        booking.setStatus(status);
        when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));

        assertThatThrownBy(() -> bookingService.confirmBooking(booking.getId(), ACTOR_ID))
            .isInstanceOf(BookingNotActiveException.class);
        assertThat(booking.getStatus()).isEqualTo(status);
    }
    verifyNoInteractions(plotRepository, saleService, bookingEventRepository);
}

@Test
void confirmBookingWithANonBookedPlotThrowsBookingPlotNotAvailableAndChangesNothing() {
    for (PlotStatus status : List.of(PlotStatus.AVAILABLE, PlotStatus.SOLD)) {
        PlotBooking booking = lockedBookingAndPlot(status, null);

        assertThatThrownBy(() -> bookingService.confirmBooking(booking.getId(), ACTOR_ID))
            .isInstanceOf(PlotNotAvailableException.class);   // booking.PlotNotAvailableException -> 409
        assertThat(booking.getStatus()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(booking.getSaleId()).isNull();
    }
    verifyNoInteractions(saleService, bookingEventRepository);
}

// Decision 1: manual confirm is never gated by confirmRule/threshold, so it never reads the config.
@Test
void confirmBookingNeverConsultsTheEmiConfigSoItIsAllowedUnderBothRules() {
    PlotBooking booking = lockedBookingAndPlot(PlotStatus.BOOKED, UUID.randomUUID());

    bookingService.confirmBooking(booking.getId(), ACTOR_ID);

    verifyNoInteractions(bookingEmiConfigRepository);
}
```

(`PlotNotAvailableException` here resolves to the same-package `com.plotchain.booking.PlotNotAvailableException`; do NOT import the sales one into this test.)

- [ ] **Step 2: Run to verify failure**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingServiceTest test`
Expected: COMPILE FAIL (`BookingService` constructor arity, `confirmBooking` undefined).

- [ ] **Step 3: Implement in `BookingService`**

Add imports `com.plotchain.sales.SaleResponse`, `com.plotchain.sales.SaleService`. Add field `private final SaleService saleService;` and a constructor parameter `SaleService saleService` placed **after** `BookingEventRepository bookingEventRepository` and before `Clock clock`; assign it. Then add, directly below `recordPayment`/`afterInstallmentPaid`:

```java
// Plot-booking unit 4 (spec Flow "Confirm", Decisions 1, 2, 8). Locks the booking FIRST (so two
// simultaneous confirms serialize: the loser re-reads CONFIRMED and gets 409 -- the unique
// sale.booking_id index is only the backstop), then confirmLocked takes the plot lock.
// Allowed under MANUAL and AUTO_THRESHOLD alike: never reads booking_emi_config (Decision 1).
@Transactional
public BookingResponse confirmBooking(UUID bookingId, UUID actorId) {
    PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
        .orElseThrow(() -> new BookingNotFoundException(bookingId));
    if (booking.getStatus() != BookingStatus.ACTIVE) {
        throw new BookingNotActiveException(bookingId);
    }
    confirmLocked(booking, actorId);
    return toResponse(booking, emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));
}

// Reusable confirm step; unit 5 calls this from afterInstallmentPaid inside recordPayment's
// transaction. PRECONDITIONS (not re-checked): caller is inside a transaction, already holds the
// booking row lock (findByIdForUpdate) and has verified status == ACTIVE.
// LOCK ORDER IS BOOKING -> PLOT EVERYWHERE (Decision 8): never take a plot lock and then a
// booking lock, or concurrent confirm/cancel/pay can deadlock. The plot lock is taken here so
// callers cannot forget it or get the order wrong.
void confirmLocked(PlotBooking lockedBooking, UUID actorId) {
    Plot plot = plotRepository.findByIdForUpdate(lockedBooking.getPlotId())
        .orElseThrow(() -> new IllegalStateException(
            "plot row missing for booking " + lockedBooking.getId() + " - plot_id has an FK constraint"));
    // Checked here (not left to SaleService.recordConfirmedBooking's identical guard) so the
    // failure is the booking-flavoured PlotNotAvailableException (409), not a sales exception.
    if (plot.getStatus() != PlotStatus.BOOKED) {
        throw new PlotNotAvailableException(plot.getId());
    }

    // Flips the plot BOOKED -> SOLD and sets sale.booking_id itself.
    SaleResponse sale = saleService.recordConfirmedBooking(
        lockedBooking.getId(), lockedBooking.getAssociateId(), lockedBooking.getBuyerName(),
        lockedBooking.getBuyerPhone(), lockedBooking.getTotalAmount(), plot);

    Instant now = clock.instant();
    lockedBooking.setStatus(BookingStatus.CONFIRMED);
    lockedBooking.setConfirmedAt(now);
    lockedBooking.setSaleId(sale.id());
    plotBookingRepository.save(lockedBooking);

    bookingEventRepository.save(BookingEvent.of(lockedBooking.getId(), BookingEventType.CONFIRMED,
        actorId, "sale " + sale.id() + ", amount " + lockedBooking.getTotalAmount().toPlainString(), now));
}
```

Also update the `afterInstallmentPaid` comment's "unit 4's confirm" to name `confirmLocked` (comment only; leave the body empty).

- [ ] **Step 4: Run to verify pass**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingServiceTest test`
Expected: PASS (all prior tests plus 6 new).

- [ ] **Step 5: Verify no sales -> booking import crept in, then commit**

Run: `grep -rn "plotchain.booking" <worktree>/backend/src/main/java/com/plotchain/sales` — expected: no output.

```bash
git add backend/src/main/java/com/plotchain/booking/BookingService.java backend/src/test/java/com/plotchain/booking/BookingServiceTest.java
git commit -m "feat(booking): confirmBooking/confirmLocked creates linked sale (unit 4)"
```

---

### Task 2: `POST /api/admin/bookings/{id}/confirm` endpoint + security matrix

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/BookingController.java`
- Test: `backend/src/test/java/com/plotchain/booking/BookingControllerTest.java`
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `BookingService.confirmBooking(UUID, UUID)` from Task 1.
- Produces: `POST /api/admin/bookings/{id}/confirm` -> `200 BookingResponse`; 404 (`BookingNotFoundException`), 409 (`BookingNotActiveException`, booking `PlotNotAvailableException`). No handler changes: `BookingExceptionHandler` already maps all three.

- [ ] **Step 1: Write failing tests**

In `BookingControllerTest` (add `import static ...MockMvcRequestBuilders.post` already present):

```java
@Test
void confirmReturns200WithTheConfirmedBookingAndPassesTheAdminAsActor() throws Exception {
    UUID bookingId = UUID.randomUUID();
    UUID adminId = UUID.randomUUID();
    BookingResponse confirmed = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
        BookingStatus.CONFIRMED, "Jane Buyer", new BigDecimal("200000.00"), 2, Instant.now(),
        BigDecimal.ZERO, new BigDecimal("200000.00"), List.of());
    when(bookingService.confirmBooking(bookingId, adminId)).thenReturn(confirmed);

    mockMvc.perform(post("/api/admin/bookings/{id}/confirm", bookingId)
            .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(bookingId.toString()))
        .andExpect(jsonPath("$.status").value("CONFIRMED"));
}

@Test
void confirmMapsServiceExceptionsToTheSpecStatuses() throws Exception {
    UUID missing = UUID.randomUUID();
    UUID notActive = UUID.randomUUID();
    UUID plotGone = UUID.randomUUID();
    when(bookingService.confirmBooking(eq(missing), any())).thenThrow(new BookingNotFoundException(missing));
    when(bookingService.confirmBooking(eq(notActive), any())).thenThrow(new BookingNotActiveException(notActive));
    when(bookingService.confirmBooking(eq(plotGone), any())).thenThrow(new PlotNotAvailableException(UUID.randomUUID()));
    String admin = "Bearer " + tokenFor(AssociateRole.ADMIN);

    mockMvc.perform(post("/api/admin/bookings/{id}/confirm", missing).header("Authorization", admin))
        .andExpect(status().isNotFound());
    mockMvc.perform(post("/api/admin/bookings/{id}/confirm", notActive).header("Authorization", admin))
        .andExpect(status().isConflict());
    mockMvc.perform(post("/api/admin/bookings/{id}/confirm", plotGone).header("Authorization", admin))
        .andExpect(status().isConflict());
}
```

In `SecurityConfigTest`, directly after `adminBookingPayIsUnauthorizedWithoutAToken`:

```java
// plot-booking unit 4 (Decision 12): POST .../confirm rides the blanket ADMIN write rule. A random
// booking id reaches the real BookingService for the ADMIN token and 404s (findByIdForUpdate empty),
// proving the request passed the security layer; every other role is 403 at the filter.
@ParameterizedTest
@EnumSource(AssociateRole.class)
void adminBookingConfirmIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
    mockMvc.perform(post("/api/admin/bookings/{id}/confirm", UUID.randomUUID())
            .header("Authorization", "Bearer " + tokenFor(role)))
        .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
}

@Test
void adminBookingConfirmIsUnauthorizedWithoutAToken() throws Exception {
    mockMvc.perform(post("/api/admin/bookings/{id}/confirm", UUID.randomUUID()))
        .andExpect(status().isUnauthorized());
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingControllerTest+SecurityConfigTest test`
Expected: FAIL (confirm tests get 404/405 because the route is missing; the "reachable for ADMIN -> 404" security case may pass trivially, which is fine — the 200 and 409 controller tests are the real red).

- [ ] **Step 3: Implement**

In `BookingController` add (imports already cover `PostMapping`, `PathVariable`, `AuthenticationPrincipal`):

```java
// Admin manually confirms an ACTIVE booking (Decisions 1, 2, 12), creating the linked Sale.
// Allowed under MANUAL and AUTO_THRESHOLD. Returns the updated booking (200), like pay.
@PostMapping("/{id}/confirm")
public BookingResponse confirm(@PathVariable UUID id, @AuthenticationPrincipal UUID actorId) {
    return bookingService.confirmBooking(id, actorId);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingControllerTest+SecurityConfigTest test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/BookingController.java backend/src/test/java/com/plotchain/booking/BookingControllerTest.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(booking): POST /api/admin/bookings/{id}/confirm endpoint (unit 4)"
```

---

### Task 3: Real-DB integration test — linked sale, parity with `recordSale`, void, rollback

**Files:**
- Create: `backend/src/test/java/com/plotchain/booking/BookingConfirmIntegrationTest.java`

**Interfaces:**
- Consumes: `BookingService.createBooking/confirmBooking`, `SaleService.recordSale/voidSale`, repositories (`SaleRepository`, `LedgerEntryRepository`, `PlotBookingRepository`, `EmiInstallmentRepository`, `BookingEventRepository`, `PlotRepository`, `ProjectRepository`, `AssociateRepository`), `JdbcTemplate`.
- Produces: `seedBooking()` / `cleanUp()` harness reused by Task 4 (same class).

Model the class on `BookingPaymentIntegrationTest` (copy `seedAvailablePlot`, `seedAssociate`, `awaitQuietly`, `seedBooking`). Seeded associate is ADMIN role with position "L" (fine: `recordConfirmedBooking` needs only `position`). The compensation plan version and open cycle come from the migration seed / `CycleService.getOrOpenCurrent` exactly as in `SaleRecordConcurrencyTest` (read its setup if the first run fails on a missing plan version).

- [ ] **Step 1: Write the class (tests fail to compile only if Task 1 is missing; they should go RED on assertions only if behaviour is wrong)**

Class skeleton and shared harness:

```java
package com.plotchain.booking;

// imports: associate.*, income.*, projects.*, sales.*(Sale, SaleRepository, SaleService, SaleResponse,
// CreateSaleRequest, VoidSaleRequest, SaleStatus), JUnit/Spring/AssertJ, java.util.*, concurrency types.

@SpringBootTest
@ActiveProfiles("test")
class BookingConfirmIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired SaleService saleService;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    @Autowired BookingEventRepository bookingEventRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;

    private UUID plotId;
    private UUID secondPlotId;      // only the parity test sets this
    private UUID projectId;
    private UUID associateId;

    // seedAvailablePlot(), seedAssociate(), awaitQuietly(), seedBooking(): copy from
    // BookingPaymentIntegrationTest. Give the plot price "600000.00", area "1200.00".

    @AfterEach
    void cleanUp() {
        if (associateId != null) {
            // The sale <-> booking FKs are circular (sale.booking_id -> plot_booking,
            // plot_booking.sale_id -> sale): null the booking side first, then delete in
            // dependency order (ledger -> sale -> events/installments -> booking).
            jdbc.update("UPDATE plot_booking SET sale_id = NULL WHERE associate_id = ?", associateId);
            List<Sale> sales = saleRepository.findAll().stream()
                .filter(s -> associateId.equals(s.getAssociateId())).toList();
            for (Sale s : sales) {
                ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAllBySourceRef(s.getId()));
            }
            saleRepository.deleteAll(sales);
            List<PlotBooking> bookings = plotBookingRepository.findAll().stream()
                .filter(b -> associateId.equals(b.getAssociateId())).toList();
            for (PlotBooking b : bookings) {
                bookingEventRepository.deleteAll(bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(b.getId()));
                emiInstallmentRepository.deleteAll(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()));
            }
            plotBookingRepository.deleteAll(bookings);
        }
        if (plotId != null) plotRepository.deleteById(plotId);
        if (secondPlotId != null) plotRepository.deleteById(secondPlotId);
        if (projectId != null) projectRepository.deleteById(projectId);
        if (associateId != null) associateRepository.deleteById(associateId);
    }
```

Tests (write all; each asserts against the real DB):

```java
@Test
void confirmPersistsLinkedSaleSoldPlotConfirmedBookingAndOneConfirmedEvent() {
    BookingResponse b = seedBooking();

    BookingResponse after = bookingService.confirmBooking(b.id(), associateId);

    assertThat(after.status()).isEqualTo(BookingStatus.CONFIRMED);
    Sale sale = saleRepository.findAll().stream()
        .filter(s -> b.id().equals(s.getBookingId())).findFirst().orElseThrow();
    assertThat(sale.getAmount()).isEqualByComparingTo("600000.00");
    assertThat(sale.getBuyerName()).isEqualTo("Jane Buyer");
    assertThat(sale.getPlotId()).isEqualTo(plotId);
    assertThat(sale.getNote()).isEqualTo("Confirmed from booking " + b.id());
    assertThat(sale.getStatus()).isEqualTo(SaleStatus.RECORDED);
    assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.SOLD);

    Map<String, Object> row = jdbc.queryForMap(
        "SELECT status, confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
    assertThat(row.get("status")).isEqualTo("CONFIRMED");
    assertThat(row.get("confirmed_at")).isNotNull();
    assertThat(row.get("sale_id")).isEqualTo(sale.getId());
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED' AND actor_id = ?",
        Integer.class, b.id(), associateId)).isEqualTo(1);
}

// Parity (spec correction: there is no sale-time leg-volume logic; parity is legCredited,
// cycleId and the ledger). Same associate, same price, same plot area -> same effects as recordSale.
@Test
void confirmedBookingSaleMatchesRecordSaleOnLegCreditedCycleAndLedger() {
    BookingResponse b = seedBooking();
    secondPlotId = seedSecondAvailablePlot();   // same project, "A-102", same area/price 600000.00

    bookingService.confirmBooking(b.id(), associateId);
    SaleResponse direct = saleService.recordSale(new CreateSaleRequest(
        secondPlotId, associateId, projectId, "Jane Buyer", null, null, null, new BigDecimal("600000.00")));
```

(Check `CreateSaleRequest`'s real component order in `backend/src/main/java/com/plotchain/sales/CreateSaleRequest.java` and match it; the fields needed are plotId, associateId, projectId, buyerName, price, others null.)

```java
    Sale viaBooking = saleRepository.findAll().stream()
        .filter(s -> b.id().equals(s.getBookingId())).findFirst().orElseThrow();
    Sale viaRecordSale = saleRepository.findById(direct.id()).orElseThrow();

    assertThat(viaBooking.getLegCredited()).isEqualTo(viaRecordSale.getLegCredited());
    assertThat(viaBooking.getCycleId()).isEqualTo(viaRecordSale.getCycleId());
    assertThat(ledgerShape(viaBooking.getId())).isEqualTo(ledgerShape(viaRecordSale.getId()));
}

// income type -> "gross/net/status", sorted, so the comparison is independent of row order and SPB config
private List<String> ledgerShape(UUID saleId) {
    return ledgerEntryRepository.findAllBySourceRef(saleId).stream()
        .map(e -> e.getIncomeType() + "/" + e.getGrossAmount().stripTrailingZeros().toPlainString()
            + "/" + e.getNetAmount().stripTrailingZeros().toPlainString() + "/" + e.getStatus())
        .sorted().toList();
}

@Test
void voidingTheLinkedSaleReturnsThePlotToAvailableAndLeavesTheBookingConfirmed() {
    BookingResponse b = seedBooking();
    bookingService.confirmBooking(b.id(), associateId);
    UUID saleId = plotBookingRepository.findById(b.id()).orElseThrow().getSaleId();

    saleService.voidSale(saleId, new VoidSaleRequest("test void"));

    assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.AVAILABLE);
    assertThat(plotBookingRepository.findById(b.id()).orElseThrow().getStatus()).isEqualTo(BookingStatus.CONFIRMED); // Decision 3
    assertThat(saleRepository.findById(saleId).orElseThrow().getStatus()).isEqualTo(SaleStatus.VOIDED);
    assertThat(ledgerEntryRepository.findAllBySourceRef(saleId)).isNotEmpty()
        .allMatch(e -> e.getStatus() == LedgerEntryStatus.REVERSED);
    // A voided linked sale keeps sale.booking_id, and the booking is not ACTIVE, so it cannot be re-confirmed.
    assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId))
        .isInstanceOf(BookingNotActiveException.class);
}

@Test
void confirmingAnAlreadyConfirmedBookingIs409AndStillExactlyOneSale() {
    BookingResponse b = seedBooking();
    bookingService.confirmBooking(b.id(), associateId);

    assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId))
        .isInstanceOf(BookingNotActiveException.class);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale WHERE booking_id = ?", Integer.class, b.id())).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'",
        Integer.class, b.id())).isEqualTo(1);
}

// Data drift: plot edited away from BOOKED while the booking is ACTIVE. Must 409 and leave no trace.
@Test
void confirmWithAPlotThatIsNoLongerBookedIs409AndRollsBackEverything() {
    BookingResponse b = seedBooking();
    jdbc.update("UPDATE plot SET status = 'AVAILABLE' WHERE id = ?", plotId);

    assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId))
        .isInstanceOf(PlotNotAvailableException.class);

    assertThat(jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, b.id())).isEqualTo("ACTIVE");
    assertThat(jdbc.queryForObject("SELECT sale_id FROM plot_booking WHERE id = ?", UUID.class, b.id())).isNull();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale WHERE booking_id = ?", Integer.class, b.id())).isZero();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?", Integer.class, b.id())).isZero();
}

@Test
void confirmOfAnUnknownBookingIs404() {
    assertThatThrownBy(() -> bookingService.confirmBooking(UUID.randomUUID(), UUID.randomUUID()))
        .isInstanceOf(BookingNotFoundException.class);
}
```

`seedSecondAvailablePlot()`: same body as `seedAvailablePlot` but reuses `projectId`, plotNo `"A-102"`, no new project. Verify the `plot.status` column name/CHECK in the Flyway migrations before writing the raw `UPDATE` (grep `status` in `V1*`/plot migration) and use the stored string (`AVAILABLE`).

- [ ] **Step 2: Run to verify**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingConfirmIntegrationTest test`
Expected: all PASS (implementation exists from Task 1). If a test fails, it exposes a real bug in Task 1 code: fix the code, not the assertion. Common harness failures: missing `CreateSaleRequest` arg order; FK-order in cleanUp (re-read the circular-FK note).

- [ ] **Step 3: Sanity-check the rollback test is not vacuous**

Temporarily (do not commit) comment out the `plot.getStatus() != BOOKED` check in `confirmLocked`. `SaleService`'s own guard then throws the sales exception, so `confirmWithAPlotThatIsNoLongerBookedIs409AndRollsBackEverything` must FAIL on `isInstanceOf(PlotNotAvailableException.class)`. Revert after.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingConfirmIntegrationTest.java
git commit -m "test(booking): confirm integration - linked sale, parity, void, rollback (unit 4)"
```

---

### Task 4: Concurrency — two simultaneous confirms yield exactly one Sale

**Files:**
- Modify: `backend/src/test/java/com/plotchain/booking/BookingConfirmIntegrationTest.java` (append tests)

**Interfaces:**
- Consumes: Task 3 harness.
- Produces: proof of Decision 8 locking for confirm.

- [ ] **Step 1: Write the tests**

Mirror `BookingPaymentIntegrationTest.twoSimultaneousPays...` and `payBlocksWhile...`:

```java
@Test
void twoSimultaneousConfirmsYieldExactlyOneSale() throws Exception {
    BookingResponse b = seedBooking();

    CountDownLatch start = new CountDownLatch(1);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    List<Future<BookingResponse>> results = new ArrayList<>();
    for (int i = 0; i < 2; i++) {
        results.add(pool.submit(() -> {
            awaitQuietly(start);
            return bookingService.confirmBooking(b.id(), associateId);
        }));
    }
    start.countDown();

    int ok = 0;
    int conflicts = 0;
    for (Future<BookingResponse> f : results) {
        try {
            f.get(10, TimeUnit.SECONDS);
            ok++;
        } catch (ExecutionException e) {
            // loser re-reads CONFIRMED after the booking lock releases -> 409. Not a unique-index
            // violation: the booking lock serializes them before the sale insert is ever attempted.
            assertThat(e.getCause()).isInstanceOf(BookingNotActiveException.class);
            conflicts++;
        }
    }
    pool.shutdownNow();

    assertThat(ok).isEqualTo(1);
    assertThat(conflicts).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM sale WHERE booking_id = ?", Integer.class, b.id())).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'",
        Integer.class, b.id())).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ledger_entry WHERE source_ref IN (SELECT id FROM sale WHERE booking_id = ?) AND income_type = 'DIRECT'",
        Integer.class, b.id())).isEqualTo(1);
    assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.SOLD);
}

@Test
void confirmBlocksWhileAnotherTransactionHoldsTheBookingLockThenProceeds() throws Exception {
    BookingResponse b = seedBooking();
    CountDownLatch lockHeld = new CountDownLatch(1);
    CountDownLatch releaseLock = new CountDownLatch(1);
    List<String> events = Collections.synchronizedList(new ArrayList<>());
    ExecutorService pool = Executors.newFixedThreadPool(2);
    TransactionTemplate tx = new TransactionTemplate(transactionManager);

    Future<?> holder = pool.submit(() -> tx.executeWithoutResult(s -> {
        plotBookingRepository.findByIdForUpdate(b.id()).orElseThrow();
        events.add("holder-locked");
        lockHeld.countDown();
        awaitQuietly(releaseLock);
    }));
    lockHeld.await(5, TimeUnit.SECONDS);

    Future<BookingResponse> confirm = pool.submit(() -> {
        events.add("confirm-calling");
        BookingResponse r = bookingService.confirmBooking(b.id(), associateId);
        events.add("confirm-returned");
        return r;
    });

    Thread.sleep(300);
    assertThat(events).containsExactly("holder-locked", "confirm-calling");   // blocked on the booking lock

    releaseLock.countDown();
    holder.get(5, TimeUnit.SECONDS);
    confirm.get(5, TimeUnit.SECONDS);
    assertThat(events).containsExactly("holder-locked", "confirm-calling", "confirm-returned");
    pool.shutdownNow();
}
```

Confirm the real ledger table/column names (`ledger_entry`, `source_ref`, `income_type`) against `LedgerEntry`'s `@Table/@Column` before running; adjust the raw SQL if they differ.

- [ ] **Step 2: Run to verify pass**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingConfirmIntegrationTest test`
Expected: PASS, repeat 3 times (`for i in 1 2 3; do mvn -q -Dtest=BookingConfirmIntegrationTest test || break; done`) to shake out flakiness. If the concurrency test sometimes reports a unique-constraint `DataIntegrityViolationException` instead of `BookingNotActiveException`, the booking lock is not being taken first: that is a real defect in Task 1's `confirmBooking`, fix the code.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingConfirmIntegrationTest.java
git commit -m "test(booking): concurrent confirm yields exactly one sale (unit 4)"
```

---

### Task 5 (Appendix A): `booking_event` persists every `BookingEventType` through the entity

Carry-forward item 2 (DB-enum-CHECK lesson). Units 4/5/6/7 are the first to write non-`PAID` events; unit 2 only covered `PAID`.

**Files:**
- Modify: `backend/src/test/java/com/plotchain/booking/BookingEventRepositoryTest.java`

- [ ] **Step 1: Write the test** (append to the class; `persistBooking()` and `jdbc` already exist)

```java
// DB-enum-CHECK lesson: every Java enum value must be accepted by chk_booking_event_type (V41).
// A new BookingEventType added later without a migration fails here, not in production.
@Test
void everyBookingEventTypeIsAcceptedByTheDatabaseCheckConstraint() {
    PlotBooking b = persistBooking();
    Instant t0 = Instant.parse("2026-06-15T10:00:00Z");
    int i = 0;
    for (BookingEventType type : BookingEventType.values()) {
        BookingEvent saved = bookingEventRepository.saveAndFlush(
            BookingEvent.of(b.getId(), type, b.getAssociateId(), "detail " + type, t0.plusSeconds(i++)));
        assertThat(jdbc.queryForObject(
            "SELECT type FROM booking_event WHERE id = ?", String.class, saved.getId()))
            .isEqualTo(type.name());
    }
    assertThat(bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(b.getId()))
        .extracting(BookingEvent::getType)
        .containsExactly(BookingEventType.values());
}
```

- [ ] **Step 2: Run**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingEventRepositoryTest test`
Expected: PASS (V41 CHECK already lists all four). If it fails, the CHECK/enum have drifted: add a migration, do not weaken the test.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingEventRepositoryTest.java
git commit -m "test(booking): every BookingEventType persists through the entity (unit 4)"
```

---

### Task 6 (Appendix B): Pin future `paidAt` accepted by pay; confirm PAID/VOID 409 coverage

Carry-forward item 3.

**Files:**
- Modify: `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java`

Coverage check already done: `recordPaymentOnPaidOrVoidInstallmentIs409AndLeavesItUntouched` (BookingServiceTest) covers both `PAID` and `VOID` -> `InstallmentNotPayableException`, and `BookingControllerTest.payMapsServiceExceptionsToTheSpecStatuses` pins that exception to 409. **No new test for PAID/VOID.** A future `paidAt` is NOT covered (`RecordPaymentRequest.paidAt` has no `@Past`/`@PastOrPresent`, and no test passes one later than the clock), so pin it.

- [ ] **Step 1: Write the test** (next to `recordPaymentUsesSuppliedPaidAtAndTrimsPaymentRef`)

```java
// paidAt is the admin's recorded collection date; it is deliberately NOT validated as past/present
// (backdating and post-dating are both legitimate for cheque/UTR reconciliation). Pins that.
@Test
void recordPaymentAcceptsAPaidAtLaterThanTheClock() {
    EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
    PlotBooking booking = lockedBookingWith(i1);
    Instant future = NOW.plusSeconds(30L * 24 * 3600);

    bookingService.recordPayment(booking.getId(), 1,
        new RecordPaymentRequest(new BigDecimal("100.00"), "UTR-F", future), ACTOR_ID);

    assertThat(i1.getStatus()).isEqualTo(InstallmentStatus.PAID);
    assertThat(i1.getPaidAt()).isEqualTo(future);
}
```

- [ ] **Step 2: Run**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingServiceTest test`
Expected: PASS (pins existing behaviour; no production change).

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingServiceTest.java
git commit -m "test(booking): pin future paidAt accepted by pay (unit 4 appendix)"
```

---

## Final verification (after Task 6)

Run from `<worktree>/backend`:

```bash
mvn -q -Dtest='BookingServiceTest,BookingControllerTest,BookingExceptionHandlerTest,BookingEventRepositoryTest,BookingConfirmIntegrationTest,BookingPaymentIntegrationTest,BookingConcurrencyTest,SecurityConfigTest,SaleServiceTest,SaleServiceConfirmedBookingIntegrationTest,SaleRecordConcurrencyTest' test
```

Expected: all PASS (units 1-3 classes included as the regression net for `recordSale`/`voidSale`/`createBooking`). Do not chase the ~55 Mockito JDK errors or the 4 `JwtServiceTest`/`SecretsEncryptionServiceTest` failures if you run the whole suite; they are pre-existing environment issues.

## Self-review (done)

- Spec coverage: Decisions 1 (Task 1 `verifyNoInteractions` config), 2 (Tasks 1/3), 3 (Task 3 void test), 8 (lock order Task 1 `InOrder`, Task 4 concurrency), 12 (Task 2 matrix); Flow "Confirm" and Error handling 404/409 (Tasks 1-3); Testing bullets service/integration/concurrency/security (Tasks 1-4); carry-forward 1-6 (Decisions section, Tasks 1, 5, 6, lock audit).
- No placeholders; `confirmBooking`/`confirmLocked` signatures identical across tasks. `SaleResponse` 17-arg constructor order copied from `SaleService.buildResponse`.
- Two lookups the implementer must confirm against real code (flagged inline, not guessed): `CreateSaleRequest` component order (Task 3) and raw-SQL table/column names `plot.status`, `ledger_entry.source_ref/income_type` (Tasks 3, 4).
