# Plot Booking Unit 2: Admin Records a Per-Installment Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `PATCH /api/admin/bookings/{id}/installments/{n}/pay` lets an admin mark one installment `PAID` (amount must match), writes a `PAID` `booking_event`, and returns the updated `BookingResponse`.

**Architecture:** One new `@Transactional BookingService.recordPayment(...)` that row-locks the `PlotBooking` first (`findByIdForUpdate`, already merged in unit 1), validates in the spec's order, mutates the installment, writes a `BookingEvent` (new entity + repository over the V41 `booking_event` table), then calls an empty package-private seam `afterInstallmentPaid(...)` where units 4/5 will later add the confirm / `AUTO_THRESHOLD` logic. The response is built with the existing `toResponse` from the in-memory (already mutated) installment list.

**Tech Stack:** Spring Boot 3 / JPA / Flyway / H2 (tests, PostgreSQL mode) / JUnit5 + Mockito + AssertJ.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decisions 6, 7, 8, 12; Flow "Record payment"; Error handling; Testing; "Resolved decisions (post-slice)" item 1). Unit source: `docs/superpowers/plans/2026-10-01-plot-booking-units.md`, unit 2. Style template: `docs/superpowers/plans/2026-10-01-plot-booking-unit-1-buyer-status-own-view.md`.

## Global Constraints

- Backend only. No frontend change: unit 1 already added `status`, `paidAt`, `overdue` etc. to the TS model, and no UI calls this endpoint until unit 12.
- No new migration: `booking_event` (`id, booking_id, type, actor_id, detail VARCHAR(500), created_at`, CHECK type in `PAID/CONFIRMED/CANCELLED/TRANSFERRED`) and `emi_installment.paid_at/payment_ref VARCHAR(100)/recorded_by` already exist in V41.
- Check order inside the lock (Flow "Record payment", Error handling): booking missing 404 -> booking not `ACTIVE` 409 `BookingNotActiveException` -> installment `n` missing 404 `InstallmentNotFoundException` -> installment not `PENDING` 409 `InstallmentNotPayableException` -> amount != installment amount 400.
- `findByIdForUpdate` must be the first repository call in the `@Transactional` method (Decision 8; comment on `PlotBookingRepository`).
- Installments may be paid in any order (Decision 6): no "previous installment paid" check.
- Overdue is derived, never stored (Decision 7). Paying a past-due installment simply flips it to `PAID`, and `toResponse` then reports `overdue=false`.
- ADMIN-only via the existing blanket PATCH rule in `SecurityConfig` (Decision 12): associate 403, unauthenticated 401. No `SecurityConfig` edit.
- Amounts compare with `BigDecimal.compareTo`, never `equals` (scale: `100000` vs `100000.00`).
- Pay does NOT confirm, does NOT apply the `AUTO_THRESHOLD` rule, and does NOT touch the plot or `Sale` (units 4/5). Do not touch `SaleService`/`Sale` (unit 3 is being planned concurrently).
- Backend test env noise: whole-module `mvn test` shows ~55 spurious Mockito errors (JDK21/25 mismatch) plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Run only the targeted classes named per task, from `/Users/ronalisenapati/Ronali/plotchain/backend`; treat only failures inside them as real. `BookingServiceTest` is Mockito-based and may itself hit the noise: compare against a run on unmodified `master` before concluding a regression.
- No commit is made by the plan author. Commit steps are for the executor, each ending with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do NOT edit `docs/superpowers/plans/2026-10-01-plot-booking-units.md` or the status index; the coordinator marks the unit merged.

## Review Focus

- Amount `100000` vs installment `100000.00` must be accepted (compareTo), `99999.99` must 400 (Task 3 unit test).
- Missing, zero or negative `amount`, blank `paymentRef`, `paymentRef` > 100 chars must 400 and not reach the service or surface as a 500 from the `VARCHAR(100)` column (Task 4 tests).
- Paying installment 3 while 1 and 2 are `PENDING` succeeds (Task 3 unit test; Task 6 DB test pays the last installment first).
- Paying a `VOID` installment (cancelled booking's leftovers) or an already `PAID` one is 409, and a cancelled/confirmed booking is 409 before the installment is even looked at (Task 3).
- Two simultaneous pays on one installment: exactly one wins, loser gets 409, exactly one `PAID` event row and one `payment_ref` persisted (Task 6).
- A rejected pay (any 4xx) must leave no `PAID` event and no changed installment (Task 3 `never()` verifications; Task 6 mismatch rollback check).
- Omitted `paidAt` defaults to the injected `Clock`'s now, and a supplied one is stored as given (Task 3).

## File Structure

All backend paths below are relative to `backend/src/main/java/com/plotchain/booking/` (main) or `backend/src/test/java/com/plotchain/booking/` (test) unless prefixed.

- Create `BookingEventType.java`, `BookingEvent.java`, `BookingEventRepository.java`: audit row, first writer is this unit; units 4/6/7 reuse it.
- Create `PaymentAmountMismatchException.java`, `RecordPaymentRequest.java`.
- Modify `BookingExceptionHandler.java` (+ one mapping), `BookingService.java` (+ `recordPayment`, seam, constructor arg), `BookingController.java` (+ PATCH route).
- Tests: modify `BookingExceptionHandlerTest`, `BookingServiceTest`, `BookingControllerTest`, `auth/SecurityConfigTest`; create `BookingEventRepositoryTest`, `BookingPaymentIntegrationTest`.

**Response decision:** return the updated `BookingResponse` with 200 (not 204, not a payment DTO). Rationale: the admin UI (unit 12) needs the refreshed paid/due totals and the installment row in one round trip; `toResponse` already computes them; unit 5's auto-confirm will flip `status` to `CONFIRMED` in the same call, and returning the whole booking is the only shape that carries that without a second GET.

---

### Task 1: `BookingEvent` entity and repository

**Files:**
- Create: `BookingEventType.java`, `BookingEvent.java`, `BookingEventRepository.java`
- Test: `BookingEventRepositoryTest.java`

**Interfaces:**
- Produces: `enum BookingEventType { PAID, CONFIRMED, CANCELLED, TRANSFERRED }`; `BookingEvent` with no-arg ctor + `static BookingEvent of(UUID bookingId, BookingEventType type, UUID actorId, String detail, Instant createdAt)` (generates the id) and getters `getId/getBookingId/getType/getActorId/getDetail/getCreatedAt`; `BookingEventRepository extends JpaRepository<BookingEvent, UUID>` with `List<BookingEvent> findByBookingIdOrderByCreatedAtAsc(UUID bookingId)`.

- [ ] **Step 1: Write the failing test**

Create `BookingEventRepositoryTest.java`. Reuse the persistence helpers of `PlotBookingSchemaTest` (read it: `persistProject/persistPlot/persistAssociate` and `persistBooking()` build a valid booking via `TestEntityManager`); copy those private helpers into this class verbatim, then:

```java
@DataJpaTest
@ActiveProfiles("test")
class BookingEventRepositoryTest {

    @Autowired BookingEventRepository bookingEventRepository;
    @Autowired TestEntityManager entityManager;
    @Autowired JdbcTemplate jdbc;
    // + the copied persistProject/persistPlot/persistAssociate/persistBooking helpers

    @Test
    void savesAPaidEventAndReadsItBackOldestFirst() {
        PlotBooking b = persistBooking();
        Instant t0 = Instant.parse("2026-06-15T10:00:00Z");
        bookingEventRepository.saveAndFlush(
            BookingEvent.of(b.getId(), BookingEventType.PAID, b.getAssociateId(), "installment 1", t0));
        bookingEventRepository.saveAndFlush(
            BookingEvent.of(b.getId(), BookingEventType.PAID, b.getAssociateId(), null, t0.plusSeconds(60)));

        List<BookingEvent> events = bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(b.getId());

        assertThat(events).hasSize(2);
        assertThat(events.get(0).getDetail()).isEqualTo("installment 1");
        assertThat(events.get(0).getType()).isEqualTo(BookingEventType.PAID);
        // DB-level: the enum is stored as the plain string the V41 CHECK constraint expects.
        assertThat(jdbc.queryForObject(
            "SELECT type FROM booking_event WHERE id = ?", String.class, events.get(0).getId()))
            .isEqualTo("PAID");
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `mvn -q test -Dtest=BookingEventRepositoryTest`
Expected: FAIL (compilation: `BookingEvent` not defined).

- [ ] **Step 3: Implement**

```java
// BookingEventType.java
package com.plotchain.booking;

public enum BookingEventType { PAID, CONFIRMED, CANCELLED, TRANSFERRED }
```

```java
// BookingEvent.java
package com.plotchain.booking;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "booking_event")
public class BookingEvent {

    @Id
    private UUID id;

    @Column(name = "booking_id", nullable = false)
    private UUID bookingId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private BookingEventType type;

    @Column(name = "actor_id", nullable = false)
    private UUID actorId;

    private String detail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected BookingEvent() {}

    public static BookingEvent of(UUID bookingId, BookingEventType type, UUID actorId, String detail, Instant createdAt) {
        BookingEvent e = new BookingEvent();
        e.id = UUID.randomUUID();
        e.bookingId = bookingId;
        e.type = type;
        e.actorId = actorId;
        e.detail = detail;
        e.createdAt = createdAt;
        return e;
    }

    public UUID getId() { return id; }
    public UUID getBookingId() { return bookingId; }
    public BookingEventType getType() { return type; }
    public UUID getActorId() { return actorId; }
    public String getDetail() { return detail; }
    public Instant getCreatedAt() { return createdAt; }
}
```

```java
// BookingEventRepository.java
package com.plotchain.booking;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface BookingEventRepository extends JpaRepository<BookingEvent, UUID> {
    List<BookingEvent> findByBookingIdOrderByCreatedAtAsc(UUID bookingId);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn -q test -Dtest='BookingEventRepositoryTest,PlotBookingSchemaTest'`
Expected: PASS (schema test confirms V41 CHECK tests untouched; `ddl-auto: validate` confirms the mapping matches the table).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/BookingEvent*.java backend/src/test/java/com/plotchain/booking/BookingEventRepositoryTest.java
git commit -m "feat(booking): BookingEvent entity and repository over V41 booking_event"
```

---

### Task 2: `PaymentAmountMismatchException` and its 400 mapping

**Files:**
- Create: `PaymentAmountMismatchException.java`
- Modify: `BookingExceptionHandler.java`
- Test: `BookingExceptionHandlerTest.java`

**Interfaces:**
- Produces: `new PaymentAmountMismatchException(UUID bookingId, int installmentNumber, BigDecimal expected)`; handler method `handlePaymentAmountMismatch` -> 400 with body `{"error": message}`.

- [ ] **Step 1: Write the failing test** (append to `BookingExceptionHandlerTest`)

```java
    @Test
    void paymentAmountMismatchIs400() {
        var r = handler.handlePaymentAmountMismatch(
            new PaymentAmountMismatchException(id, 2, new java.math.BigDecimal("100000.00")));
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(r.getBody().get("error")).contains("100000.00");
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `mvn -q test -Dtest=BookingExceptionHandlerTest`
Expected: FAIL (compilation).

- [ ] **Step 3: Implement**

```java
package com.plotchain.booking;

import java.math.BigDecimal;
import java.util.UUID;

public class PaymentAmountMismatchException extends RuntimeException {
    public PaymentAmountMismatchException(UUID bookingId, int installmentNumber, BigDecimal expected) {
        super("Payment amount must equal the installment amount " + expected.toPlainString()
            + " (installment " + installmentNumber + " of booking " + bookingId + ")");
    }
}
```

In `BookingExceptionHandler`, add (next to `handleSameAssociateTransfer`) and update the class comment's list of owned types only if it enumerates them:

```java
    @ExceptionHandler(PaymentAmountMismatchException.class)
    public ResponseEntity<Map<String, String>> handlePaymentAmountMismatch(PaymentAmountMismatchException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn -q test -Dtest=BookingExceptionHandlerTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/PaymentAmountMismatchException.java backend/src/main/java/com/plotchain/booking/BookingExceptionHandler.java backend/src/test/java/com/plotchain/booking/BookingExceptionHandlerTest.java
git commit -m "feat(booking): PaymentAmountMismatchException mapped to 400"
```

---

### Task 3: `RecordPaymentRequest` and `BookingService.recordPayment`

**Files:**
- Create: `RecordPaymentRequest.java`
- Modify: `BookingService.java`
- Test: `BookingServiceTest.java`

**Interfaces:**
- Consumes (unit 1, merged): `plotBookingRepository.findByIdForUpdate(UUID)`, `emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(UUID)`, `toResponse(PlotBooking, List<EmiInstallment>)`, `BookingNotFoundException(UUID)`, `BookingNotActiveException(UUID)`, `InstallmentNotFoundException(UUID,int)`, `InstallmentNotPayableException(UUID,int)`; Task 1 `BookingEvent.of`; Task 2 `PaymentAmountMismatchException`.
- Produces: `record RecordPaymentRequest(BigDecimal amount, String paymentRef, Instant paidAt)`; `BookingResponse BookingService.recordPayment(UUID bookingId, int installmentNumber, RecordPaymentRequest request, UUID actorId)`; the `BookingService` constructor gains a `BookingEventRepository` argument placed after `EmiInstallmentRepository` and before `Clock`.

- [ ] **Step 1: Write the failing tests**

In `BookingServiceTest`: add `@Mock BookingEventRepository bookingEventRepository;`, change `setUp` to `new BookingService(plotRepository, associateRepository, bookingEmiConfigRepository, plotBookingRepository, emiInstallmentRepository, bookingEventRepository, clock)` (the only `new BookingService(` call in the repo, verified by grep), then add. The file already has helpers `bookingWithBuyer()` (status defaults `ACTIVE`) and `installment(n, amount, due, status)`.

```java
    private static final UUID ACTOR_ID = UUID.randomUUID();

    private PlotBooking lockedBookingWith(EmiInstallment... installments) {
        PlotBooking booking = bookingWithBuyer();
        when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));
        when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()))
            .thenReturn(List.of(installments));
        return booking;
    }

    private RecordPaymentRequest pay(String amount) {
        return new RecordPaymentRequest(new BigDecimal(amount), "UTR-1", null);
    }

    @Test
    void recordPaymentMarksInstallmentPaidStampsFieldsWritesEventAndReturnsUpdatedBooking() {
        EmiInstallment i1 = installment(1, "100000.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
        EmiInstallment i2 = installment(2, "100000.00", LocalDate.of(2026, 8, 15), InstallmentStatus.PENDING);
        PlotBooking booking = lockedBookingWith(i1, i2);

        BookingResponse response = bookingService.recordPayment(booking.getId(), 1, pay("100000"), ACTOR_ID);

        assertThat(i1.getStatus()).isEqualTo(InstallmentStatus.PAID);
        assertThat(i1.getPaidAt()).isEqualTo(NOW);              // paidAt omitted -> Clock now
        assertThat(i1.getPaymentRef()).isEqualTo("UTR-1");
        assertThat(i1.getRecordedBy()).isEqualTo(ACTOR_ID);
        assertThat(i2.getStatus()).isEqualTo(InstallmentStatus.PENDING);
        verify(emiInstallmentRepository).save(i1);

        ArgumentCaptor<BookingEvent> event = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(event.capture());
        assertThat(event.getValue().getType()).isEqualTo(BookingEventType.PAID);
        assertThat(event.getValue().getBookingId()).isEqualTo(booking.getId());
        assertThat(event.getValue().getActorId()).isEqualTo(ACTOR_ID);
        assertThat(event.getValue().getCreatedAt()).isEqualTo(NOW);
        assertThat(event.getValue().getDetail()).contains("1").contains("100000").contains("UTR-1");

        assertThat(response.paidAmount()).isEqualByComparingTo("100000.00");
        assertThat(response.dueAmount()).isEqualByComparingTo("100000.00");
        assertThat(response.installments().get(0).status()).isEqualTo(InstallmentStatus.PAID);
    }

    @Test
    void recordPaymentUsesSuppliedPaidAtAndTrimsPaymentRef() {
        EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
        PlotBooking booking = lockedBookingWith(i1);
        Instant earlier = Instant.parse("2026-06-10T08:00:00Z");

        bookingService.recordPayment(booking.getId(), 1,
            new RecordPaymentRequest(new BigDecimal("100.00"), "  UTR-9  ", earlier), ACTOR_ID);

        assertThat(i1.getPaidAt()).isEqualTo(earlier);
        assertThat(i1.getPaymentRef()).isEqualTo("UTR-9");
    }

    @Test
    void recordPaymentDoesNotRequireEarlierInstallmentsToBePaid() {
        EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
        EmiInstallment i3 = installment(3, "100.00", LocalDate.of(2026, 9, 15), InstallmentStatus.PENDING);
        PlotBooking booking = lockedBookingWith(i1, i3);

        bookingService.recordPayment(booking.getId(), 3, pay("100.00"), ACTOR_ID);

        assertThat(i3.getStatus()).isEqualTo(InstallmentStatus.PAID);
        assertThat(i1.getStatus()).isEqualTo(InstallmentStatus.PENDING);
    }

    @Test
    void recordPaymentOnAPastDueInstallmentClearsItsOverdueFlag() {
        EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 6, 1), InstallmentStatus.PENDING); // before NOW
        PlotBooking booking = lockedBookingWith(i1);

        BookingResponse response = bookingService.recordPayment(booking.getId(), 1, pay("100.00"), ACTOR_ID);

        assertThat(response.installments().get(0).overdue()).isFalse();
    }

    @Test
    void recordPaymentOnUnknownBookingIs404AndWritesNothing() {
        UUID id = UUID.randomUUID();
        when(plotBookingRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.recordPayment(id, 1, pay("1"), ACTOR_ID))
            .isInstanceOf(BookingNotFoundException.class);
        verify(bookingEventRepository, never()).save(any());
        verify(emiInstallmentRepository, never()).save(any());
    }

    @Test
    void recordPaymentOnNonActiveBookingIs409BeforeLookingAtInstallments() {
        for (BookingStatus status : List.of(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)) {
            PlotBooking booking = bookingWithBuyer();
            booking.setStatus(status);
            when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));

            assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("1"), ACTOR_ID))
                .isInstanceOf(BookingNotActiveException.class);
        }
        verify(emiInstallmentRepository, never()).findByBookingIdOrderByInstallmentNumberAsc(any());
        verify(bookingEventRepository, never()).save(any());
    }

    @Test
    void recordPaymentOnUnknownInstallmentNumberIs404() {
        PlotBooking booking = lockedBookingWith(
            installment(1, "100.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING));

        assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 9, pay("100.00"), ACTOR_ID))
            .isInstanceOf(InstallmentNotFoundException.class);
        verify(bookingEventRepository, never()).save(any());
    }

    @Test
    void recordPaymentOnPaidOrVoidInstallmentIs409AndLeavesItUntouched() {
        for (InstallmentStatus status : List.of(InstallmentStatus.PAID, InstallmentStatus.VOID)) {
            EmiInstallment i1 = installment(1, "100.00", LocalDate.of(2026, 7, 15), status);
            i1.setPaymentRef("original");
            PlotBooking booking = lockedBookingWith(i1);

            assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("100.00"), ACTOR_ID))
                .isInstanceOf(InstallmentNotPayableException.class);
            assertThat(i1.getStatus()).isEqualTo(status);
            assertThat(i1.getPaymentRef()).isEqualTo("original");
        }
        verify(bookingEventRepository, never()).save(any());
    }

    @Test
    void recordPaymentWithWrongAmountIs400AndLeavesInstallmentPending() {
        EmiInstallment i1 = installment(1, "100000.00", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
        PlotBooking booking = lockedBookingWith(i1);

        assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("99999.99"), ACTOR_ID))
            .isInstanceOf(PaymentAmountMismatchException.class);
        assertThat(i1.getStatus()).isEqualTo(InstallmentStatus.PENDING);
        assertThat(i1.getRecordedBy()).isNull();
        verify(emiInstallmentRepository, never()).save(any());
        verify(bookingEventRepository, never()).save(any());
    }
```

(The `installment(...)` helper does not set `paymentRef`; the `i1.setPaymentRef("original")` call above uses the existing setter. If a Mockito strict-stubs `UnnecessaryStubbingException` fires in the not-active test because `findByBookingId...` is never stubbed there, that is intended: it is never stubbed.)

- [ ] **Step 2: Run to verify it fails**

Run: `mvn -q test -Dtest=BookingServiceTest`
Expected: FAIL (compilation: `RecordPaymentRequest`, `recordPayment`, 7-arg constructor).

- [ ] **Step 3: Implement**

`RecordPaymentRequest.java` (bean validation lands here so Task 4 only has to prove it; this is the final shape):

```java
package com.plotchain.booking;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

// amount is the admin's confirmation of what was collected; the server never takes it as the
// source of truth, only checks it equals the installment's own amount (Decision 6, resolved
// decision 1). paidAt is optional: absent means "now" per the injected Clock. @Size(max = 100)
// matches emi_installment.payment_ref VARCHAR(100) so an oversized ref is a 400, not a 500.
public record RecordPaymentRequest(
    @NotNull @DecimalMin(value = "0.00", inclusive = false) BigDecimal amount,
    @NotBlank @Size(max = 100) String paymentRef,
    Instant paidAt
) {}
```

`BookingService`: add field `private final BookingEventRepository bookingEventRepository;`, constructor parameter after `emiInstallmentRepository` (before `clock`), assignment; then add (place after `createBooking`):

```java
    // Row-locks the booking FIRST (Decision 8) so two simultaneous pays on one installment
    // serialize: the loser re-reads the installment as PAID and gets 409. Check order is the
    // spec's Flow "Record payment". Installments are deliberately payable in any order.
    @Transactional
    public BookingResponse recordPayment(UUID bookingId, int installmentNumber,
                                         RecordPaymentRequest request, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }

        List<EmiInstallment> installments =
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId);
        EmiInstallment installment = installments.stream()
            .filter(i -> i.getInstallmentNumber() == installmentNumber)
            .findFirst()
            .orElseThrow(() -> new InstallmentNotFoundException(bookingId, installmentNumber));
        if (installment.getStatus() != InstallmentStatus.PENDING) {
            throw new InstallmentNotPayableException(bookingId, installmentNumber);
        }
        // compareTo, not equals: 100000 and 100000.00 are the same money.
        if (request.amount().compareTo(installment.getAmount()) != 0) {
            throw new PaymentAmountMismatchException(bookingId, installmentNumber, installment.getAmount());
        }

        Instant now = clock.instant();
        String paymentRef = request.paymentRef().trim();
        installment.setStatus(InstallmentStatus.PAID);
        installment.setPaidAt(request.paidAt() != null ? request.paidAt() : now);
        installment.setPaymentRef(paymentRef);
        installment.setRecordedBy(actorId);
        emiInstallmentRepository.save(installment);

        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.PAID, actorId,
            "installment " + installmentNumber + ", amount " + installment.getAmount().toPlainString()
                + ", ref " + paymentRef, now));

        afterInstallmentPaid(booking, installments, actorId);
        return toResponse(booking, installments);
    }

    // Seam for later units, deliberately empty here: unit 5 adds the AUTO_THRESHOLD check and
    // calls unit 4's confirm from this spot, inside the same locked transaction, after the PAID
    // event above and before the response is built (so the response reflects a CONFIRMED booking).
    void afterInstallmentPaid(PlotBooking booking, List<EmiInstallment> installments, UUID actorId) {
        // no-op until units 4/5
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn -q test -Dtest=BookingServiceTest`
Expected: PASS (new and the pre-existing createBooking/getMyBookings tests, which still compile through the updated `setUp`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/RecordPaymentRequest.java backend/src/main/java/com/plotchain/booking/BookingService.java backend/src/test/java/com/plotchain/booking/BookingServiceTest.java
git commit -m "feat(booking): BookingService.recordPayment with PAID event and confirm seam"
```

---

### Task 4: PATCH endpoint and request validation

**Files:**
- Modify: `BookingController.java`
- Test: `BookingControllerTest.java`

**Interfaces:**
- Consumes: Task 3 `bookingService.recordPayment(UUID, int, RecordPaymentRequest, UUID)`; admin actor id via `@AuthenticationPrincipal UUID actorId` (same as `AdminAssociateController`; the JWT filter's principal is the associate UUID).
- Produces: `PATCH /api/admin/bookings/{id}/installments/{n}/pay` -> 200 `BookingResponse`.

- [ ] **Step 1: Write the failing tests**

In `BookingControllerTest` (it `@MockBean`s `BookingService` and `AssociateRepository`; its `tokenFor(role)` hides the associate id, so add a variant and make the old one delegate to it):

```java
    private String tokenFor(UUID id, AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(id);
        associate.setRole(role);
        when(associateRepository.findById(id)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }
    // existing: private String tokenFor(AssociateRole role) { return tokenFor(UUID.randomUUID(), role); }

    private static final String PAY_BODY = """
        {"amount":100000.00,"paymentRef":"UTR-1"}
        """;

    private org.springframework.test.web.servlet.ResultActions pay(UUID bookingId, int n, String body) throws Exception {
        return mockMvc.perform(patch("/api/admin/bookings/{id}/installments/{n}/pay", bookingId, n)
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
            .contentType("application/json").content(body));
    }

    @Test
    void payReturns200WithTheUpdatedBookingAndPassesTheAdminAsActor() throws Exception {
        UUID bookingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        BookingResponse updated = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.ACTIVE, "Jane Buyer", new BigDecimal("200000.00"), 2, Instant.now(),
            new BigDecimal("100000.00"), new BigDecimal("100000.00"), List.of());
        when(bookingService.recordPayment(eq(bookingId), eq(1), any(RecordPaymentRequest.class), eq(adminId)))
            .thenReturn(updated);

        mockMvc.perform(patch("/api/admin/bookings/{id}/installments/{n}/pay", bookingId, 1)
                .header("Authorization", "Bearer " + tokenFor(adminId, AssociateRole.ADMIN))
                .contentType("application/json").content(PAY_BODY))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(bookingId.toString()))
            .andExpect(jsonPath("$.paidAmount").value(100000.00));
    }

    @Test
    void payMapsServiceExceptionsToTheSpecStatuses() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.recordPayment(eq(id), eq(1), any(), any())).thenThrow(new BookingNotFoundException(id));
        when(bookingService.recordPayment(eq(id), eq(2), any(), any())).thenThrow(new BookingNotActiveException(id));
        when(bookingService.recordPayment(eq(id), eq(3), any(), any())).thenThrow(new InstallmentNotFoundException(id, 3));
        when(bookingService.recordPayment(eq(id), eq(4), any(), any())).thenThrow(new InstallmentNotPayableException(id, 4));
        when(bookingService.recordPayment(eq(id), eq(5), any(), any()))
            .thenThrow(new PaymentAmountMismatchException(id, 5, new BigDecimal("1.00")));

        pay(id, 1, PAY_BODY).andExpect(status().isNotFound());
        pay(id, 2, PAY_BODY).andExpect(status().isConflict());
        pay(id, 3, PAY_BODY).andExpect(status().isNotFound());
        pay(id, 4, PAY_BODY).andExpect(status().isConflict());
        pay(id, 5, PAY_BODY).andExpect(status().isBadRequest());
    }

    @Test
    void payRejectsInvalidBodiesWith400WithoutCallingTheService() throws Exception {
        UUID id = UUID.randomUUID();
        String longRef = "x".repeat(101);
        for (String body : List.of(
                "{\"paymentRef\":\"UTR-1\"}",                                  // amount missing
                "{\"amount\":0,\"paymentRef\":\"UTR-1\"}",                     // zero
                "{\"amount\":-5.00,\"paymentRef\":\"UTR-1\"}",                 // negative
                "{\"amount\":100.00}",                                         // paymentRef missing
                "{\"amount\":100.00,\"paymentRef\":\"   \"}",                  // blank
                "{\"amount\":100.00,\"paymentRef\":\"" + longRef + "\"}")) {   // > 100
            pay(id, 1, body).andExpect(status().isBadRequest());
        }
        org.mockito.Mockito.verifyNoInteractions(bookingService);
    }
```

Imports to add: `patch` from `MockMvcRequestBuilders`, `eq` from `ArgumentMatchers`.

- [ ] **Step 2: Run to verify it fails**

Run: `mvn -q test -Dtest=BookingControllerTest`
Expected: FAIL (405/404 on the PATCH route).

- [ ] **Step 3: Implement** (in `BookingController`; add imports for `PatchMapping`, `PathVariable`, `AuthenticationPrincipal`, `java.util.UUID`)

```java
    // Admin records one installment's payment on an associate's behalf (Decisions 6, 12).
    // Returns the whole updated booking (200), not 204: the admin UI needs refreshed paid/due
    // totals, and unit 5's auto-confirm will flip status in this same call.
    @PatchMapping("/{id}/installments/{n}/pay")
    public BookingResponse pay(@PathVariable UUID id, @PathVariable("n") int installmentNumber,
                               @Valid @RequestBody RecordPaymentRequest request,
                               @AuthenticationPrincipal UUID actorId) {
        return bookingService.recordPayment(id, installmentNumber, request, actorId);
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `mvn -q test -Dtest='BookingControllerTest,BookingExceptionHandlerTest'`
Expected: PASS. If the 400 bodies return 500, bean-validation's `MethodArgumentNotValidException` mapping lives in `ApiExceptionHandler`; the existing create tests already rely on it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/BookingController.java backend/src/test/java/com/plotchain/booking/BookingControllerTest.java
git commit -m "feat(booking): PATCH /api/admin/bookings/{id}/installments/{n}/pay"
```

---

### Task 5: Security matrix for the new PATCH route

**Files:**
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (no `SecurityConfig` edit: the blanket `PATCH /api/**` ADMIN rule already covers it; this test is the proof)

- [ ] **Step 1: Write the tests** (next to `adminBookingsCreateIsReachableOnlyForAdmin...`, same real-H2/unmocked-repository approach)

```java
    // plot-booking unit 2 (Decision 12): PATCH .../installments/{n}/pay rides the blanket ADMIN
    // write rule. A random booking id reaches the real BookingService for the ADMIN token, whose
    // findByIdForUpdate is empty -> 404, proving the request passed the security layer (same
    // "not 403" reasoning as adminBookingsCreate above). Every other role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingPayIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(patch("/api/admin/bookings/{id}/installments/1/pay", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"amount\":100.00,\"paymentRef\":\"UTR-1\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingPayIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(patch("/api/admin/bookings/{id}/installments/1/pay", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"amount\":100.00,\"paymentRef\":\"UTR-1\"}"))
            .andExpect(status().isUnauthorized());
    }
```

Add `import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;` if missing.

- [ ] **Step 2: Run**

Run: `mvn -q test -Dtest=SecurityConfigTest`
Expected: PASS (these exercise already-correct config, so there is no red step; if a role other than ADMIN gets 404 instead of 403, the blanket rule does not match PATCH and `SecurityConfig` needs an explicit `.requestMatchers(HttpMethod.PATCH, "/api/admin/bookings/*/installments/*/pay").hasAuthority("ADMIN")` above the blanket rules, grouped with the `POST /api/admin/bookings` matcher; add it and re-run).

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(booking): security matrix for installment pay route"
```

---

### Task 6: End-to-end DB assertions and concurrency

**Files:**
- Create: `backend/src/test/java/com/plotchain/booking/BookingPaymentIntegrationTest.java`

**Interfaces:**
- Consumes: real `BookingService.createBooking(...)` / `recordPayment(...)`, `PlotBookingRepository.findByIdForUpdate`, `BookingEventRepository`.

- [ ] **Step 1: Write the tests**

Same harness as `BookingConcurrencyTest` (`@SpringBootTest @ActiveProfiles("test")`, committed rows, manual cleanup). Copy its `seedAvailablePlot`, `seedAssociate` (ADMIN-role row, see its comment) and `awaitQuietly` helpers verbatim, keep fields `plotId/projectId/associateId`, and make `cleanUp()` delete **events first**, then installments, bookings, plot, project, associate:

```java
    @AfterEach
    void cleanUp() {
        if (associateId != null) {
            List<PlotBooking> bookings = plotBookingRepository.findAll().stream()
                .filter(b -> associateId.equals(b.getAssociateId())).toList();
            for (PlotBooking booking : bookings) {
                bookingEventRepository.deleteAll(
                    bookingEventRepository.findByBookingIdOrderByCreatedAtAsc(booking.getId()));
                emiInstallmentRepository.deleteAll(
                    emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId()));
            }
            plotBookingRepository.deleteAll(bookings);
        }
        if (plotId != null) plotRepository.deleteById(plotId);
        if (projectId != null) projectRepository.deleteById(projectId);
        if (associateId != null) associateRepository.deleteById(associateId);
    }
```

Fields additionally autowired: `BookingEventRepository bookingEventRepository`, `JdbcTemplate jdbc`. Helper:

```java
    private BookingResponse seedBooking() {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();
        return bookingService.createBooking(new CreateBookingRequest(plotId, associateId, "Jane Buyer", null));
    }

    private int lastInstallmentNumber(BookingResponse b) {
        return b.installments().get(b.installments().size() - 1).installmentNumber();
    }
    private BigDecimal lastInstallmentAmount(BookingResponse b) {
        return b.installments().get(b.installments().size() - 1).amount();
    }
```

(`EmiInstallmentResponse` accessor names are `installmentNumber()`/`amount()`, per the record built in `toResponse`; confirm by reading the record before use.) Tests:

```java
    @Test
    void payPersistsInstallmentFieldsAndExactlyOnePaidEventInTheDatabase() {
        BookingResponse b = seedBooking();
        int n = lastInstallmentNumber(b);   // last first: proves out-of-order against the real DB

        BookingResponse after = bookingService.recordPayment(b.id(), n,
            new RecordPaymentRequest(lastInstallmentAmount(b), "UTR-7", null), associateId);

        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, paid_at, payment_ref, recorded_by FROM emi_installment WHERE booking_id = ? AND installment_number = ?",
            b.id(), n);
        assertThat(row.get("status")).isEqualTo("PAID");
        assertThat(row.get("paid_at")).isNotNull();
        assertThat(row.get("payment_ref")).isEqualTo("UTR-7");
        assertThat(row.get("recorded_by")).isEqualTo(associateId);
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID' AND actor_id = ?",
            Integer.class, b.id(), associateId)).isEqualTo(1);
        assertThat(after.paidAmount()).isEqualByComparingTo(lastInstallmentAmount(b));
        assertThat(jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, b.id()))
            .isEqualTo("ACTIVE");          // pay never confirms (units 4/5)
        assertThat(plotRepository.findById(plotId).orElseThrow().getStatus()).isEqualTo(PlotStatus.BOOKED);
    }

    @Test
    void rejectedPayLeavesNoEventAndNoPaidInstallment() {
        BookingResponse b = seedBooking();
        int n = lastInstallmentNumber(b);

        assertThatThrownBy(() -> bookingService.recordPayment(b.id(), n,
            new RecordPaymentRequest(new BigDecimal("0.01"), "UTR-X", null), associateId))
            .isInstanceOf(PaymentAmountMismatchException.class);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?",
            Integer.class, b.id())).isZero();
        assertThat(jdbc.queryForObject(
            "SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'",
            Integer.class, b.id())).isZero();
    }

    @Test
    void twoSimultaneousPaysOnTheSameInstallmentSucceedExactlyOnce() throws Exception {
        BookingResponse b = seedBooking();
        int n = lastInstallmentNumber(b);
        BigDecimal amount = lastInstallmentAmount(b);

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<BookingResponse>> results = new ArrayList<>();
        for (String ref : List.of("REF-A", "REF-B")) {
            results.add(pool.submit(() -> {
                awaitQuietly(start);
                return bookingService.recordPayment(b.id(), n, new RecordPaymentRequest(amount, ref, null), associateId);
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
                assertThat(e.getCause()).isInstanceOf(InstallmentNotPayableException.class);   // -> 409
                conflicts++;
            }
        }
        pool.shutdownNow();

        assertThat(ok).isEqualTo(1);
        assertThat(conflicts).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'",
            Integer.class, b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT payment_ref FROM emi_installment WHERE booking_id = ? AND installment_number = ?",
            String.class, b.id(), n)).isIn("REF-A", "REF-B");
    }

    @Test
    void payBlocksWhileAnotherTransactionHoldsTheBookingLockThenProceeds() throws Exception {
        BookingResponse b = seedBooking();
        int n = lastInstallmentNumber(b);
        BigDecimal amount = lastInstallmentAmount(b);

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

        Future<BookingResponse> pay = pool.submit(() -> {
            events.add("pay-calling");
            BookingResponse r = bookingService.recordPayment(b.id(), n,
                new RecordPaymentRequest(amount, "UTR-L", null), associateId);
            events.add("pay-returned");
            return r;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "pay-calling");   // pay is blocked on the row lock

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        pay.get(5, TimeUnit.SECONDS);
        assertThat(events).containsExactly("holder-locked", "pay-calling", "pay-returned");
        pool.shutdownNow();
    }
```

Imports: everything `BookingConcurrencyTest` imports, plus `java.util.Map`, `java.util.concurrent.ExecutionException`, `org.springframework.jdbc.core.JdbcTemplate`.

- [ ] **Step 2: Run to verify**

Run: `mvn -q test -Dtest=BookingPaymentIntegrationTest`
Expected: PASS. (Implementation already exists from Task 3, so the value is the real-DB proof. To see the concurrency test genuinely guard something, temporarily replace `findByIdForUpdate` with `findById` in `recordPayment`: `twoSimultaneousPays...` should then flake/fail with two successes or a constraint error. Revert.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingPaymentIntegrationTest.java
git commit -m "test(booking): DB-level and concurrency proof for installment pay"
```

---

## Final verification (executor)

- [ ] From `/Users/ronalisenapati/Ronali/plotchain/backend`: `mvn -q test -Dtest='BookingEventRepositoryTest,BookingExceptionHandlerTest,BookingServiceTest,BookingControllerTest,AssociateBookingControllerTest,BookingConcurrencyTest,BookingPaymentIntegrationTest,PlotBookingSchemaTest,V41MigrationTest,SecurityConfigTest'`. All pass. `BookingServiceTest` may show the known Mockito/JDK noise: compare with an unmodified `master` run.
- [ ] Optional full `mvn test` only to confirm the failure set equals the documented baseline (~55 Mockito errors + 4 `JwtServiceTest`/`SecretsEncryptionServiceTest` failures) with no new class names.
- [ ] Confirm no file under `sales/` and no `SaleService`/`Sale` change appears in `git diff --stat`.

## Self-Review

- Spec coverage: lock-first + check order + 404/409/409/400 (T3, T4 mapping, T6); sets PAID/paid_at default now/payment_ref/recorded_by (T3, T6 DB row); `PAID` booking_event (T1, T3, T6); any-order (T3, T6); concurrent pay exactly once (T6); associate 403 / unauth 401 (T5); validation `@NotNull`/`@DecimalMin`/`@Size` (T3 record, T4 tests); no auto-confirm, seam only (T3, T6 asserts status stays `ACTIVE`, plot `BOOKED`); overdue cleared on pay (T3).
- Placeholder scan: none; the only conditional is T5's documented fallback matcher.
- Type consistency: `recordPayment(UUID, int, RecordPaymentRequest, UUID)` identical in T3/T4/T6; `BookingEvent.of(bookingId, type, actorId, detail, createdAt)` identical in T1/T3; constructor arg order (`..., emiInstallmentRepository, bookingEventRepository, clock`) used only in T3's `setUp`.

## Decisions the spec did not settle (flagged)

1. **Response shape**: updated `BookingResponse`, 200 (justification above).
2. **`paymentRef` is required** (`@NotBlank`, max 100): spec's DTO lists it without a `?` (only `paidAt` is optional) but never says non-blank. Trimmed before storing.
3. **`paidAt` future values are accepted** (no `@PastOrPresent`): spec silent; client/server clock skew would make a strict check flaky. Easy to add later.
4. **`BookingEvent.detail` format for PAID**: `"installment {n}, amount {amount}, ref {ref}"` (spec only says a `PAID` event is written).
5. **Amount mismatch uses a new `PaymentAmountMismatchException` -> 400** (spec defines no exception type for it), and the body amount is compared with `compareTo`.
6. **Seam**: package-private empty `afterInstallmentPaid(booking, installments, actorId)` called after the `PAID` event and before `toResponse`; units 4/5 fill it.
7. **`BookingEventType` defines all four V41 values now** (only `PAID` used here) to avoid churn in units 4/6/7.
