# Plot Booking Unit 7: Transfer an ACTIVE Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/admin/bookings/{id}/transfer` (ADMIN) reassigns an ACTIVE booking to another ACTIVE associate, keeping installments/payments, and writes a `TRANSFERRED` booking_event.

**Architecture:** One new `@Transactional` method `BookingService.transferBooking` that row-locks the booking first (Decision 8), runs guards in a fixed order, then does exactly two writes (booking.associate_id, one event). One new 400 exception, one new request record, one new controller method returning the updated `BookingResponse` (200). Tests live in NEW classes so unit 6 (cancel) rebases trivially.

**Tech Stack:** Spring Boot 3.3.4, JPA/Hibernate, H2 via Flyway in tests, JUnit 5, AssertJ, Mockito (`@SpyBean`, `@MockBean`), MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decisions 5, 8, 12; Flow "Transfer"; Error handling; Testing; Resolved decision #4). Unit queue: `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (unit 7 + Carry-forward notes).

## Global Constraints

- Backend only. Work in a git worktree; run every `mvn` command from the **worktree's** `backend/` dir, never the main checkout.
- Lock order is booking -> plot everywhere (Decision 8). Transfer takes only the booking lock (it never touches the plot).
- ADMIN-only via the existing blanket `/api/admin/**` POST rule: **no `SecurityConfig.java` edit**.
- Boot 3.3.4: use `@SpyBean` / `@MockBean`, not `@MockitoSpyBean`.
- `AssociateNotFoundException` and `PlotNotFoundException` are mapped globally (Projects/Dashboard handlers); do NOT add handlers for them in `BookingExceptionHandler`.
- Booking tests that seed `Associate` rows use `AssociateRole.ADMIN` (chk_associate_rank_required, V4, forces a rank for ASSOCIATE rows). Copy the seeding helpers from `BookingConfirmIntegrationTest`.
- Env noise: a full `mvn test` shows ~55 spurious Mockito errors (JDK21/25 mismatch) plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Last targeted baseline: 349 tests green on master. Only run targeted `-Dtest=` commands and compare against that.
- Do not touch `plot-booking-units.md` or any status index (coordinator's job).

## Design decisions (read first)

1. **Check order (no writes on any 4xx):** lock booking (404 `BookingNotFoundException`) -> status != ACTIVE (409 `BookingNotActiveException`) -> target == current associate (400 `SameAssociateTransferException`) -> target lookup (404 `AssociateNotFoundException`) -> target.status != ACTIVE (400 `InvalidTransferTargetException`). Same-associate is checked before the target lookup because it needs no read, and the current associate exists by FK, so the answer is deterministic. All guards run before the first mutation; Hibernate only flushes the booking on mutation, so a 4xx leaves zero writes.
2. **Ineligible target exception: new `InvalidTransferTargetException` (400), NOT `AssociateNotActiveException`.** The existing one is already mapped to **409** by `EPinExceptionHandler` (a global `@RestControllerAdvice`), but the spec (Resolved decision #4) requires **400** for PENDING/suspended targets. Reusing it would return the wrong status, and adding a second handler for the same type in `BookingExceptionHandler` would be an order-dependent double mapping (the mistake called out in the existing handler's header comment). So: new type, one handler, message names the target id and its status. "Not ACTIVE" is `status != AssociateStatus.ACTIVE` (same predicate as `EPinService.allocate/transfer`), so PENDING, SUSPENDED and any future status are all rejected.
3. **Response: updated `BookingResponse`, 200** (same as pay/confirm), built with the existing package-private `toResponse(booking, installments)`; `associateId` in the body is the new owner.
4. **Event detail:** `"from <oldAssociateId> to <newAssociateId>"`; actor = authenticated admin id.
5. **Target role is not restricted** to `ASSOCIATE` (spec silent; `createBooking` doesn't restrict either, and test fixtures use ADMIN-role rows). Flagged for the coordinator.
6. **No lock on the target associate row.** A target suspended in the instant between the check and the commit slips through; same accepted window as `EPinService`. Flagged.
7. **Sale credit:** `confirmLocked` reads `booking.getAssociateId()` at confirm time (unit 4), so a pre-confirm transfer moves the credited seller. This is the intended behavior and is pinned by a test (Task 2). A CONFIRMED booking cannot be transferred (409), so a Sale's associate never diverges from its booking's.

## File Structure

- Create `backend/src/main/java/com/plotchain/booking/InvalidTransferTargetException.java`
- Create `backend/src/main/java/com/plotchain/booking/TransferBookingRequest.java`
- Modify `backend/src/main/java/com/plotchain/booking/BookingService.java` (append one method + one import)
- Modify `backend/src/main/java/com/plotchain/booking/BookingController.java` (append one endpoint)
- Modify `backend/src/main/java/com/plotchain/booking/BookingExceptionHandler.java` (append one handler)
- Create `backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java` (real DB: Tasks 1-4)
- Create `backend/src/test/java/com/plotchain/booking/BookingTransferControllerTest.java` (Task 5)
- Modify `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (append rows after the confirm rows, Task 6)

**Rebase over unit 6 (cancel) will touch:** `BookingService` (both append a method near `confirmBooking`; keep both; add `import com.plotchain.associate.AssociateStatus;` alongside existing imports), `BookingController` (both append endpoints; keep both), `BookingExceptionHandler` (both append handlers at the end; keep both), `SecurityConfigTest` (both append rows after the confirm rows; keep both). `BookingServiceTest` is not touched by this plan. No shared code is refactored. After unit 6 lands, add one extra test (noted in Task 4) that a CANCELLED booking transfers as 409.

## Review Focus

- Target is PENDING or SUSPENDED: 400, booking unchanged, no event (Task 1).
- Self-transfer where the id also is non-ACTIVE or nonexistent: still 400 same-associate? Not reachable for nonexistent; covered by order test (Task 1).
- Transfer of CONFIRMED booking: 409, no change (Task 1).
- Sale credited to the new associate after transfer + confirm (Task 2).
- Old associate loses / new associate gains the booking in own view (Task 2).
- Transfer vs concurrent confirm/pay: lock serializes, no sale/booking owner divergence (Task 4).
- Missing/`null` `associateId` body: 400 not 500 (Task 5).

---

### Task 1: Service transfer: happy path and every 4xx guard (real DB)

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/InvalidTransferTargetException.java`
- Modify: `backend/src/main/java/com/plotchain/booking/BookingService.java`
- Test: `backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java`

**Interfaces:**
- Consumes: `PlotBookingRepository.findByIdForUpdate`, `AssociateRepository.findById`, `BookingEvent.of(UUID bookingId, BookingEventType, UUID actorId, String detail, Instant)`, `BookingService.toResponse(PlotBooking, List<EmiInstallment>)` (package-private), `BookingNotFoundException(UUID)`, `BookingNotActiveException(UUID)`, `SameAssociateTransferException(UUID)`, `AssociateNotFoundException(UUID)`.
- Produces: `public BookingResponse BookingService.transferBooking(UUID bookingId, UUID targetAssociateId, UUID actorId)`; `new InvalidTransferTargetException(UUID associateId, AssociateStatus status)` (RuntimeException).

- [ ] **Step 1: Create the test class with fixtures and the first tests**

```java
package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Real-DB (H2 via Flyway) proof for BookingService.transferBooking (plot-booking unit 7).
@SpringBootTest
@ActiveProfiles("test")
class BookingTransferIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    // Pass-through spy (reset by Spring after each test); Task 3 makes the TRANSFERRED save fail.
    @SpyBean BookingEventRepository bookingEventRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;

    private UUID projectId;
    private final List<UUID> associateIds = new ArrayList<>();
    private final List<UUID> plotIds = new ArrayList<>();
    private int plotSeq = 0;

    @AfterEach
    void cleanUp() {
        // sale <-> booking FKs are circular: null plot_booking.sale_id first.
        for (UUID a : associateIds) {
            jdbc.update("UPDATE plot_booking SET sale_id = NULL WHERE associate_id = ?", a);
        }
        List<Sale> sales = saleRepository.findAll().stream()
            .filter(s -> associateIds.contains(s.getAssociateId())).toList();
        for (Sale s : sales) {
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAllBySourceRef(s.getId()));
        }
        saleRepository.deleteAll(sales);
        List<PlotBooking> bookings = plotBookingRepository.findAll().stream()
            .filter(b -> plotIds.contains(b.getPlotId())).toList();
        for (PlotBooking b : bookings) {
            bookingEventRepository.deleteAll(bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(b.getId()));
            emiInstallmentRepository.deleteAll(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()));
        }
        plotBookingRepository.deleteAll(bookings);
        plotIds.forEach(plotRepository::deleteById);
        if (projectId != null) projectRepository.deleteById(projectId);
        associateIds.forEach(associateRepository::deleteById);
    }

    // ---- fixtures (copied from BookingConfirmIntegrationTest, parameterised) ----------------------

    private UUID seedPlot() {
        return new TransactionTemplate(transactionManager).execute(s -> {
            if (projectId == null) {
                Project p = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
                projectRepository.saveAndFlush(p);
                projectId = p.getId();
            }
            Plot plot = new Plot(UUID.randomUUID(), projectId, "T-" + (++plotSeq), PlotType.NORMAL,
                new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
                PlotStatus.AVAILABLE);
            plotRepository.saveAndFlush(plot);
            plotIds.add(plot.getId());
            return plot.getId();
        });
    }

    private UUID seedAssociate(AssociateStatus status) {
        return new TransactionTemplate(transactionManager).execute(s -> {
            UUID id = UUID.randomUUID();
            Associate a = new Associate();
            a.setId(id);
            a.setPosition("L");
            a.setName("Test Associate");
            a.setKycStatus(KycStatus.VERIFIED);
            a.setJoinedAt(Instant.now());
            a.setCumulativeMatchedVolume(BigDecimal.ZERO);
            a.setUserId("u-" + id);
            a.setEmail(id + "@test.local");
            a.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
            a.setRole(AssociateRole.ADMIN);
            a.setStatus(status);
            associateRepository.saveAndFlush(a);
            associateIds.add(id);
            return id;
        });
    }

    private BookingResponse seedBooking(UUID ownerId) {
        return bookingService.createBooking(new CreateBookingRequest(seedPlot(), ownerId, "Jane Buyer", null));
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private UUID ownerOf(UUID bookingId) {
        return jdbc.queryForObject("SELECT associate_id FROM plot_booking WHERE id = ?", UUID.class, bookingId);
    }

    private int transferredEvents(UUID bookingId) {
        return count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'TRANSFERRED'", bookingId);
    }

    // ---- happy path ----------------------------------------------------------------------------

    @Test
    void transferReassignsTheBookingKeepsInstallmentsAndPaymentsAndWritesOneTransferredEvent() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        UUID admin = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        BigDecimal amt = b.installments().get(0).amount();
        bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(amt, "UTR-1", null), admin);

        BookingResponse after = bookingService.transferBooking(b.id(), to, admin);

        assertThat(after.associateId()).isEqualTo(to);
        assertThat(after.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(ownerOf(b.id())).isEqualTo(to);
        // installments and the payment carry over untouched
        assertThat(after.installments()).hasSameSizeAs(b.installments());
        assertThat(after.installments().get(0).status()).isEqualTo(InstallmentStatus.PAID);
        assertThat(after.paidAmount()).isEqualByComparingTo(amt);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ?", b.id()))
            .isEqualTo(b.installments().size());
        assertThat(jdbc.queryForObject(
            "SELECT payment_ref FROM emi_installment WHERE booking_id = ? AND installment_number = 1",
            String.class, b.id())).isEqualTo("UTR-1");
        // plot untouched
        assertThat(jdbc.queryForObject("SELECT status FROM plot WHERE id = ?", String.class, b.plotId()))
            .isEqualTo("BOOKED");
        // exactly one TRANSFERRED event with actor and from -> to detail
        assertThat(transferredEvents(b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT detail FROM booking_event WHERE booking_id = ? AND type = 'TRANSFERRED'",
            String.class, b.id())).isEqualTo("from " + from + " to " + to);
        assertThat(jdbc.queryForObject(
            "SELECT actor_id FROM booking_event WHERE booking_id = ? AND type = 'TRANSFERRED'",
            UUID.class, b.id())).isEqualTo(admin);
    }

    // ---- 4xx: right exception AND nothing written -------------------------------------------------

    private void assertNothingWritten(UUID bookingId, UUID expectedOwner, int expectedTotalEvents) {
        assertThat(ownerOf(bookingId)).isEqualTo(expectedOwner);
        assertThat(transferredEvents(bookingId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?", bookingId))
            .isEqualTo(expectedTotalEvents);
    }

    @Test
    void unknownBookingIs404() {
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        UUID missing = UUID.randomUUID();
        assertThatThrownBy(() -> bookingService.transferBooking(missing, to, to))
            .isInstanceOf(BookingNotFoundException.class);
    }

    @Test
    void confirmedBookingIs409AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        bookingService.confirmBooking(b.id(), from);   // writes 1 CONFIRMED event

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), to, from))
            .isInstanceOf(BookingNotActiveException.class);
        assertNothingWritten(b.id(), from, 1);
    }

    @Test
    void sameAssociateTargetIs400AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), from, from))
            .isInstanceOf(SameAssociateTransferException.class);
        assertNothingWritten(b.id(), from, 0);
    }

    @Test
    void unknownTargetIs404AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), UUID.randomUUID(), from))
            .isInstanceOf(AssociateNotFoundException.class);
        assertNothingWritten(b.id(), from, 0);
    }

    @Test
    void pendingTargetIs400AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID pending = seedAssociate(AssociateStatus.PENDING);
        BookingResponse b = seedBooking(from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), pending, from))
            .isInstanceOf(InvalidTransferTargetException.class)
            .hasMessageContaining(pending.toString()).hasMessageContaining("PENDING");
        assertNothingWritten(b.id(), from, 0);
    }

    @Test
    void suspendedTargetIs400AndNothingChanges() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID suspended = seedAssociate(AssociateStatus.SUSPENDED);
        BookingResponse b = seedBooking(from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), suspended, from))
            .isInstanceOf(InvalidTransferTargetException.class);
        assertNothingWritten(b.id(), from, 0);
    }

    // Order: a non-ACTIVE booking beats a bad target (409 before 404/400).
    @Test
    void notActiveBookingBeatsAnUnknownTarget() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        bookingService.confirmBooking(b.id(), from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), UUID.randomUUID(), from))
            .isInstanceOf(BookingNotActiveException.class);
    }

    // Order: same-associate (400) beats target eligibility, even when the current owner is SUSPENDED
    // after the booking was made.
    @Test
    void sameAssociateBeatsTargetEligibility() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        jdbc.update("UPDATE associate SET status = 'SUSPENDED' WHERE id = ?", from);

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), from, from))
            .isInstanceOf(SameAssociateTransferException.class);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run (from `<worktree>/backend`): `mvn -q -Dtest=BookingTransferIntegrationTest test`
Expected: COMPILE FAIL (`transferBooking`, `InvalidTransferTargetException` not defined).

- [ ] **Step 3: Create the exception**

```java
package com.plotchain.booking;

import com.plotchain.associate.AssociateStatus;

import java.util.UUID;

// Transfer target exists but is not ACTIVE (PENDING, SUSPENDED, ...). Deliberately NOT
// associate.AssociateNotActiveException: that type is already mapped to 409 by EPinExceptionHandler,
// while the spec (Resolved decision #4) requires 400 here. Mapped in BookingExceptionHandler.
public class InvalidTransferTargetException extends RuntimeException {
    public InvalidTransferTargetException(UUID associateId, AssociateStatus status) {
        super("Cannot transfer booking to associate " + associateId + ": associate is " + status
            + ", must be ACTIVE");
    }
}
```

- [ ] **Step 4: Add the service method.** In `BookingService.java` add `import com.plotchain.associate.AssociateStatus;` with the other associate imports, then insert this method immediately after `confirmLocked(...)` (before `getMyBookings`):

```java
    // Plot-booking unit 7 (spec Flow "Transfer", Decisions 5, 8). Locks the booking FIRST so a transfer
    // racing pay/confirm/cancel serializes on the row. Guard order, all before the first write so every
    // 4xx leaves the database untouched: booking 404 -> not ACTIVE 409 -> same associate 400 ->
    // target 404 -> target not ACTIVE 400 (Resolved decision #4). Installments, payments and the plot
    // are not touched. A later confirm credits whoever owns the booking at confirm time (confirmLocked
    // reads booking.getAssociateId()).
    @Transactional
    public BookingResponse transferBooking(UUID bookingId, UUID targetAssociateId, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }
        UUID fromAssociateId = booking.getAssociateId();
        if (fromAssociateId.equals(targetAssociateId)) {
            throw new SameAssociateTransferException(targetAssociateId);
        }
        Associate target = associateRepository.findById(targetAssociateId)
            .orElseThrow(() -> new AssociateNotFoundException(targetAssociateId));
        if (target.getStatus() != AssociateStatus.ACTIVE) {
            throw new InvalidTransferTargetException(targetAssociateId, target.getStatus());
        }

        booking.setAssociateId(targetAssociateId);
        plotBookingRepository.save(booking);
        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.TRANSFERRED, actorId,
            "from " + fromAssociateId + " to " + targetAssociateId, clock.instant()));

        return toResponse(booking, emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId));
    }
```

- [ ] **Step 5: Run to verify it passes**

Run: `mvn -q -Dtest=BookingTransferIntegrationTest test`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/InvalidTransferTargetException.java backend/src/main/java/com/plotchain/booking/BookingService.java backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java
git commit -m "feat(booking): transferBooking service with ordered guards (unit 7)"
```

---

### Task 2: Sale credit follows the transfer; own view moves (real DB)

**Files:**
- Test: `backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java` (append tests; no production change expected)

**Interfaces:**
- Consumes: `BookingService.transferBooking`, `BookingService.confirmBooking(UUID, UUID)`, `BookingService.getMyBookings(UUID associateId, int page, int size)` returning `AssociateBookingPageResponse` (check its accessor name for the list in `AssociateBookingPageResponse.java`, likely `bookings()`), `LedgerEntryRepository.findAllBySourceRef(UUID)`, `LedgerEntry.getAssociateId()`.
- Produces: nothing.

- [ ] **Step 1: Write the tests**

```java
    // Must-handle (2): confirm credits booking.getAssociateId() at confirm time, so transfer-then-confirm
    // makes the NEW associate the seller and puts the ledger entries on the new associate, none on the old.
    @Test
    void confirmAfterTransferCreatesTheSaleAndLedgerEntriesForTheNewAssociate() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);

        bookingService.transferBooking(b.id(), to, to);
        bookingService.confirmBooking(b.id(), to);

        Sale sale = saleRepository.findAll().stream()
            .filter(s -> b.id().equals(s.getBookingId())).findFirst().orElseThrow();
        assertThat(sale.getAssociateId()).isEqualTo(to);
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", from)).isZero();
        assertThat(count("SELECT COUNT(*) FROM ledger_entry WHERE associate_id = ?", from)).isZero();
        // Every ledger entry sourced from this sale belongs to the new associate (look at
        // BookingConfirmIntegrationTest's parity test: if the seeded ADMIN-role seller gets an entry, also
        // assert the list is non-empty here so the claim is not vacuous).
        assertThat(ledgerEntryRepository.findAllBySourceRef(sale.getId()))
            .allSatisfy(e -> assertThat(e.getAssociateId()).isEqualTo(to));
        assertThat(ownerOf(b.id())).isEqualTo(to);
    }

    // Must-handle (3): own view (GET /api/associates/me/bookings reads getMyBookings) follows the owner.
    @Test
    void afterTransferTheOldAssociateNoLongerSeesTheBookingAndTheNewOneDoes() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        assertThat(bookingService.getMyBookings(from, 0, 10).bookings())
            .extracting(BookingResponse::id).contains(b.id());

        bookingService.transferBooking(b.id(), to, to);

        assertThat(bookingService.getMyBookings(from, 0, 10).bookings())
            .extracting(BookingResponse::id).doesNotContain(b.id());
        assertThat(bookingService.getMyBookings(to, 0, 10).bookings())
            .extracting(BookingResponse::id).contains(b.id());
    }

    // The new owner can be transferred onward (and back): chained transfers each write one event.
    @Test
    void chainedTransfersEachWriteOneEvent() {
        UUID a = seedAssociate(AssociateStatus.ACTIVE);
        UUID c = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(a);
        bookingService.transferBooking(b.id(), c, a);
        bookingService.transferBooking(b.id(), a, a);
        assertThat(ownerOf(b.id())).isEqualTo(a);
        assertThat(transferredEvents(b.id())).isEqualTo(2);
    }
```

- [ ] **Step 2: Run** `mvn -q -Dtest=BookingTransferIntegrationTest test`. Expected: PASS (production behavior already exists from Task 1; these are characterization tests). If the accessor name on `AssociateBookingPageResponse` differs, fix the test, not production.

- [ ] **Step 3: Mutation check (do not commit).** In `confirmLocked`, temporarily replace `lockedBooking.getAssociateId()` with a stale value is not possible; instead temporarily comment out `booking.setAssociateId(targetAssociateId);` in `transferBooking` and confirm the three new tests plus Task 1's happy path FAIL. Revert.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java
git commit -m "test(booking): transfer moves sale credit and own view (unit 7)"
```

---

### Task 3: Atomicity: a failing TRANSFERRED event save rolls the reassignment back

**Files:**
- Test: `backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java` (append)

**Interfaces:**
- Consumes: the `@SpyBean BookingEventRepository bookingEventRepository` already declared in Task 1.

- [ ] **Step 1: Write the test** (add imports `static org.mockito.ArgumentMatchers.argThat` and `static org.mockito.Mockito.doThrow`)

```java
    // The TRANSFERRED event write fails AFTER booking.associate_id was changed and saved, so only the
    // surrounding transaction can undo the reassignment. Boot 3.3.4: @SpyBean.
    @Test
    void aFailureWritingTheTransferredEventRollsTheReassignmentBack() {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        doThrow(new IllegalStateException("simulated event failure"))
            .when(bookingEventRepository).save(argThat(e -> e.getType() == BookingEventType.TRANSFERRED));

        assertThatThrownBy(() -> bookingService.transferBooking(b.id(), to, from))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulated");

        // fresh JDBC read (no persistence context)
        assertThat(ownerOf(b.id())).isEqualTo(from);
        assertThat(transferredEvents(b.id())).isZero();
    }
```

- [ ] **Step 2: Run** `mvn -q -Dtest=BookingTransferIntegrationTest#aFailureWritingTheTransferredEventRollsTheReassignmentBack test`. Expected: PASS.

- [ ] **Step 3: Honest mutation check (do not commit).** Remove `@Transactional` from `transferBooking` AND change `findByIdForUpdate(bookingId)` to `findById(bookingId)` (removing only `@Transactional` makes the pessimistic lock throw `TransactionRequiredException`, which would fail the test for the wrong reason). Re-run: the test must FAIL on `ownerOf(...)` being `to`. Revert both.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java
git commit -m "test(booking): transfer is atomic with its event (unit 7)"
```

---

### Task 4: Concurrency: the booking lock serializes transfer against confirm and pay

**Files:**
- Test: `backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java` (append)

**Interfaces:**
- Consumes: `PlotBookingRepository.findByIdForUpdate`, `TransactionTemplate`, plus new imports `java.util.concurrent.*`, `com.plotchain.projects`-none, `static org.assertj.core.api.Assertions.assertThat`.

- [ ] **Step 1: Write the tests**

```java
    private void awaitQuietly(CountDownLatch latch) {
        try { latch.await(5, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
    }

    // Deterministic lock proof: hold the booking row lock in one transaction; a concurrent transfer must
    // BLOCK until it commits. With findByIdForUpdate swapped for findById the transfer would not block.
    @Test
    void transferBlocksWhileAnotherTransactionHoldsTheBookingLock() throws Exception {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(s -> {
                plotBookingRepository.findByIdForUpdate(b.id()).orElseThrow();
                lockHeld.countDown();
                awaitQuietly(release);
            }));
            assertThat(lockHeld.await(5, TimeUnit.SECONDS)).isTrue();
            Future<BookingResponse> transfer = pool.submit(() -> bookingService.transferBooking(b.id(), to, from));

            Thread.sleep(500);
            assertThat(transfer.isDone()).as("transfer must wait for the booking lock").isFalse();
            release.countDown();
            holder.get(10, TimeUnit.SECONDS);
            assertThat(transfer.get(10, TimeUnit.SECONDS).associateId()).isEqualTo(to);
        } finally {
            release.countDown();
            pool.shutdownNow();
        }
    }

    // Must-handle (5): transfer racing a manual confirm, repeated. Whichever wins, the invariants hold:
    // the Sale (if any) belongs to the booking's final owner; a transfer that lost is BookingNotActive (409)
    // with no TRANSFERRED event; a transfer that won happened strictly before the confirm.
    @Test
    void transferRacingConfirmNeverLeavesTheSaleCreditedToTheWrongAssociate() throws Exception {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        int transferWins = 0;
        int confirmWins = 0;
        for (int i = 0; i < 20; i++) {
            BookingResponse b = seedBooking(from);
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            Future<BookingResponse> transfer = pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.transferBooking(b.id(), to, from);
            });
            Future<BookingResponse> confirm = pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.confirmBooking(b.id(), from);
            });
            start.countDown();
            boolean transferred = true;
            try {
                try {
                    transfer.get(10, TimeUnit.SECONDS);
                } catch (ExecutionException e) {
                    assertThat(e.getCause()).isInstanceOf(BookingNotActiveException.class);
                    transferred = false;
                }
                confirm.get(10, TimeUnit.SECONDS);      // confirm always succeeds: transfer never makes it fail
            } finally {
                pool.shutdownNow();
            }
            UUID owner = ownerOf(b.id());
            assertThat(owner).isEqualTo(transferred ? to : from);
            assertThat(jdbc.queryForObject("SELECT associate_id FROM sale WHERE booking_id = ?", UUID.class, b.id()))
                .as("sale seller must equal the booking's final owner").isEqualTo(owner);
            assertThat(transferredEvents(b.id())).isEqualTo(transferred ? 1 : 0);
            if (transferred) transferWins++; else confirmWins++;
        }
        // informational: with the lock either order is legal; log so a reviewer can see both occur
        System.out.println("transfer-vs-confirm: transferWins=" + transferWins + " confirmWins=" + confirmWins);
    }

    // Transfer racing a pay: both succeed in either order; payment is never lost, owner is the target.
    @Test
    void transferRacingAPayLosesNeitherWrite() throws Exception {
        UUID from = seedAssociate(AssociateStatus.ACTIVE);
        UUID to = seedAssociate(AssociateStatus.ACTIVE);
        BookingResponse b = seedBooking(from);
        BigDecimal amt = b.installments().get(0).amount();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> t = pool.submit(() -> { awaitQuietly(start); return bookingService.transferBooking(b.id(), to, from); });
            Future<?> p = pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(amt, "UTR-X", null), from);
            });
            start.countDown();
            t.get(10, TimeUnit.SECONDS);
            p.get(10, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertThat(ownerOf(b.id())).isEqualTo(to);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 1", String.class, b.id()))
            .isEqualTo("PAID");
        assertThat(transferredEvents(b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(1);
    }
```

- [ ] **Step 2: Run** `mvn -q -Dtest=BookingTransferIntegrationTest test`. Expected: PASS. Note that if the default `booking_emi_config` is `AUTO_THRESHOLD` with a low threshold, the pay test may auto-confirm; if `transferRacingAPayLosesNeitherWrite` fails with `BookingNotActiveException`, set the config to MANUAL in the test with the save/restore pattern from `BookingAutoConfirmIntegrationTest.saveConfig/cleanUp`.

- [ ] **Step 3: Mutation check (do not commit).** Swap `findByIdForUpdate` for `findById` in `transferBooking`: `transferBlocksWhileAnotherTransactionHoldsTheBookingLock` must FAIL deterministically (the transfer completes while the lock is held); the race loop may also fail intermittently (sale seller != owner), so do not rely on it alone. Revert.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingTransferIntegrationTest.java
git commit -m "test(booking): booking lock serializes transfer vs confirm/pay (unit 7)"
```

- [ ] **Step 5 (only after unit 6 is on the branch you rebased onto):** add `transferOfACancelledBookingIs409` (create, `cancelBooking` per unit 6's signature, then `transferBooking` throws `BookingNotActiveException`, owner unchanged) and `transferRacingCancel...` modeled on the confirm race. If unit 6 is not yet merged, skip and tell the coordinator.

---

### Task 5: HTTP layer: request record, endpoint, 400 mapping, validation

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/TransferBookingRequest.java`
- Modify: `backend/src/main/java/com/plotchain/booking/BookingController.java`
- Modify: `backend/src/main/java/com/plotchain/booking/BookingExceptionHandler.java`
- Test: `backend/src/test/java/com/plotchain/booking/BookingTransferControllerTest.java`

**Interfaces:**
- Consumes: `BookingService.transferBooking(UUID, UUID, UUID)`.
- Produces: `record TransferBookingRequest(@NotNull UUID associateId)`; `POST /api/admin/bookings/{id}/transfer` -> 200 `BookingResponse`.

- [ ] **Step 1: Write the failing controller test.** Model on `BookingControllerTest` (same annotations, `@MockBean AssociateRepository`, `@MockBean BookingService`, `tokenFor` helper that stubs `associateRepository.findById` for the JWT filter). Copy the `BookingResponse` construction used in `BookingControllerTest.confirmReturns200...` (line ~227) for the 200 case.

```java
package com.plotchain.booking;

// imports as in BookingControllerTest, plus AssociateNotFoundException, AssociateStatus,
// static ...MockMvcRequestBuilders.post, ...MockMvcResultMatchers.{status,jsonPath}

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingTransferControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    private String tokenFor(UUID id, AssociateRole role) { /* identical to BookingControllerTest.tokenFor(UUID, role) */ }

    private static String body(UUID associateId) { return "{\"associateId\":\"" + associateId + "\"}"; }

    @Test
    void transferReturns200WithTheUpdatedBookingAndPassesTheAdminAsActor() throws Exception {
        UUID bookingId = UUID.randomUUID(), target = UUID.randomUUID(), adminId = UUID.randomUUID();
        BookingResponse updated = /* BookingResponse with id=bookingId, associateId=target, status ACTIVE */;
        when(bookingService.transferBooking(bookingId, target, adminId)).thenReturn(updated);

        mockMvc.perform(post("/api/admin/bookings/{id}/transfer", bookingId)
                .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN))
                .contentType("application/json").content(body(target)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(bookingId.toString()))
            .andExpect(jsonPath("$.associateId").value(target.toString()));
    }

    @Test
    void transferMapsServiceExceptionsToTheSpecStatuses() throws Exception {
        String admin = "Bearer " + tokenFor(UUID.randomUUID(), AssociateRole.ADMIN);
        UUID missing = UUID.randomUUID(), notActive = UUID.randomUUID(), same = UUID.randomUUID(),
            noTarget = UUID.randomUUID(), badTarget = UUID.randomUUID(), target = UUID.randomUUID();
        when(bookingService.transferBooking(eq(missing), any(), any())).thenThrow(new BookingNotFoundException(missing));
        when(bookingService.transferBooking(eq(notActive), any(), any())).thenThrow(new BookingNotActiveException(notActive));
        when(bookingService.transferBooking(eq(same), any(), any())).thenThrow(new SameAssociateTransferException(target));
        when(bookingService.transferBooking(eq(noTarget), any(), any())).thenThrow(new AssociateNotFoundException(target));
        when(bookingService.transferBooking(eq(badTarget), any(), any()))
            .thenThrow(new InvalidTransferTargetException(target, AssociateStatus.PENDING));

        for (Object[] c : new Object[][] {{missing, 404}, {notActive, 409}, {same, 400}, {noTarget, 404}, {badTarget, 400}}) {
            mockMvc.perform(post("/api/admin/bookings/{id}/transfer", c[0]).header("Authorization", admin)
                    .contentType("application/json").content(body(target)))
                .andExpect(status().is((Integer) c[1]));
        }
    }

    @Test
    void invalidTargetBodyHas400AndTheMessageNamesTheStatus() throws Exception {
        UUID id = UUID.randomUUID(), target = UUID.randomUUID();
        when(bookingService.transferBooking(eq(id), any(), any()))
            .thenThrow(new InvalidTransferTargetException(target, AssociateStatus.SUSPENDED));
        mockMvc.perform(post("/api/admin/bookings/{id}/transfer", id)
                .header("Authorization", "Bearer " + tokenFor(UUID.randomUUID(), AssociateRole.ADMIN))
                .contentType("application/json").content(body(target)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("SUSPENDED")));
    }

    @Test
    void missingOrNullAssociateIdIs400AndNeverReachesTheService() throws Exception {
        String admin = "Bearer " + tokenFor(UUID.randomUUID(), AssociateRole.ADMIN);
        for (String json : new String[] {"{}", "{\"associateId\":null}"}) {
            mockMvc.perform(post("/api/admin/bookings/{id}/transfer", UUID.randomUUID())
                    .header("Authorization", admin).contentType("application/json").content(json))
                .andExpect(status().isBadRequest());
        }
        org.mockito.Mockito.verifyNoInteractions(bookingService);
    }
}
```

(The skeleton comments above mark the only two places to copy from `BookingControllerTest`; everything else is final.)

- [ ] **Step 2: Run** `mvn -q -Dtest=BookingTransferControllerTest test`. Expected: compile FAIL (`TransferBookingRequest`, endpoint missing).

- [ ] **Step 3: Implement.**

`TransferBookingRequest.java`:
```java
package com.plotchain.booking;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record TransferBookingRequest(@NotNull UUID associateId) {}
```

`BookingController.java`: append after `confirm(...)`:
```java
    // Admin transfers an ACTIVE booking to another ACTIVE associate (Decisions 5, 8, 12). Returns the
    // updated booking (200), like pay/confirm.
    @PostMapping("/{id}/transfer")
    public BookingResponse transfer(@PathVariable UUID id, @Valid @RequestBody TransferBookingRequest request,
                                    @AuthenticationPrincipal UUID actorId) {
        return bookingService.transferBooking(id, request.associateId(), actorId);
    }
```

`BookingExceptionHandler.java`: append before the closing brace:
```java
    @ExceptionHandler(InvalidTransferTargetException.class)
    public ResponseEntity<Map<String, String>> handleInvalidTransferTarget(InvalidTransferTargetException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
```

- [ ] **Step 4: Run** `mvn -q -Dtest=BookingTransferControllerTest,BookingControllerTest,BookingExceptionHandlerTest test`. Expected: PASS (existing booking controller/handler tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/TransferBookingRequest.java backend/src/main/java/com/plotchain/booking/BookingController.java backend/src/main/java/com/plotchain/booking/BookingExceptionHandler.java backend/src/test/java/com/plotchain/booking/BookingTransferControllerTest.java
git commit -m "feat(booking): POST /api/admin/bookings/{id}/transfer (unit 7)"
```

---

### Task 6: SecurityConfigTest matrix rows (no SecurityConfig change)

**Files:**
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (append after the confirm rows, ~line 589)

- [ ] **Step 1: Add rows** (same shape as the confirm rows; the ADMIN token reaches the real service with a random id and gets 404, proving it passed the security layer; other roles 403):

```java
    // plot-booking unit 7 (Decision 12): POST .../transfer rides the blanket ADMIN write rule; no
    // SecurityConfig edit. Random booking id -> ADMIN reaches the real service and 404s; other roles 403.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingTransferIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/transfer", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingTransferIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/transfer", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\"}"))
            .andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 2: Run** `mvn -q -Dtest=SecurityConfigTest test`. Expected: PASS without touching `SecurityConfig.java` (this proves the blanket rule covers it). If an ADMIN row returns something other than 404 (e.g. the test class mocks `BookingService`), mirror whatever the confirm rows expect.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(security): transfer endpoint role matrix (unit 7)"
```

---

### Task 7: Targeted regression run

- [ ] **Step 1:** From `<worktree>/backend`: `mvn -q -Dtest='Booking*Test,SecurityConfigTest,PlotBooking*Test,V41MigrationTest,Sale*Test' test`
Expected: all green; compare against the last baseline (349 green on master). Do not run the full suite as the gate: it carries ~55 spurious Mockito errors (JDK21/25 mismatch) and 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures that are unrelated.
- [ ] **Step 2:** `git diff master --stat` must show no change to `SecurityConfig.java`, `plot-booking-units.md` or any status file.

## Self-Review

- Spec coverage: Decision 5 (reassign, carry-over, event, same/unknown/non-ACTIVE target) Tasks 1-2; Decision 8 (booking lock) Tasks 1, 4; Decision 12 (ADMIN only) Task 6; Resolved #4 (400 for PENDING/suspended) Tasks 1, 5; atomicity Task 3; validation Task 5; own view and sale credit Task 2.
- Names are consistent: `transferBooking(UUID bookingId, UUID targetAssociateId, UUID actorId)`, `InvalidTransferTargetException(UUID, AssociateStatus)`, `TransferBookingRequest(associateId)`.
- No placeholders other than the two explicit copy-from markers in Task 5's test skeleton (helper bodies identical to the named existing helper).
