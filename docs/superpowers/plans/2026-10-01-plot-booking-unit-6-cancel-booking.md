# Plot Booking Unit 6: Admin Cancels an ACTIVE Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `POST /api/admin/bookings/{id}/cancel` cancels an `ACTIVE` booking: booking `CANCELLED`, plot back to `AVAILABLE` (if still `BOOKED`), `PENDING` installments `VOID`, `PAID` installments untouched, one `CANCELLED` `booking_event` carrying the reason and the total paid.

**Architecture:** One new `@Transactional` method `BookingService.cancelBooking` (locks booking, then plot, same order as `confirmLocked`), one new DTO `CancelBookingRequest`, one new controller method, and one new `PlotBookingRepository` finder (the stale-booking plot guard). No migration (V41 already has `cancelled_at`, `cancel_reason VARCHAR(255)`, `booking_event.detail VARCHAR(500)`, `CANCELLED` in the event CHECK), no `SecurityConfig` change (blanket `POST /api/**` ADMIN rule at `SecurityConfig.java:277` already covers it, Decision 12), no `BookingExceptionHandler` change (`BookingNotActiveException` -> 409, `BookingNotFoundException` -> 404 already mapped). All new tests live in NEW test classes so unit 7 (transfer) can rebase with near-zero conflicts.

**Tech Stack:** Spring Boot 3.3.4, JPA/Hibernate, H2 via Flyway in tests, JUnit 5, Mockito (`@SpyBean`, NOT `@MockitoSpyBean`), AssertJ, MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decisions 4, 8, 12; Flow "Cancel"; Error handling; Testing; Resolved decision #2). Unit queue: `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (unit 6, Carry-forward notes, Known follow-ups).

## Global Constraints

- Cancel is for `ACTIVE` bookings only; `CONFIRMED` or `CANCELLED` is 409 `BookingNotActiveException`; unknown id is 404 `BookingNotFoundException` (Decision 4, Error handling).
- `cancel_reason` required, blank is 400 (Flow "Cancel").
- `PAID` installments are untouched, amounts retained as a note only, no refund accounting (Decision 4).
- Cancel stores the reason AND total paid amount in the `CANCELLED` `booking_event.detail`; no new column (Resolved decision #2).
- Cancel never frees a plot that is not `BOOKED`, nor a `BOOKED` plot held by another `ACTIVE`/`CONFIRMED` booking (stale-booking guard, decisions 2 and 2b).
- Locking: `PlotBookingRepository.findByIdForUpdate` first, then `PlotRepository.findByIdForUpdate`. LOCK ORDER IS BOOKING -> PLOT EVERYWHERE (Decision 8; same as `confirmLocked`, `recordPayment` -> auto-confirm). Never take the plot lock first on an existing booking.
- ADMIN only: associate token 403, unauthenticated 401 (Decision 12).
- Boot 3.3.4: use `@SpyBean`; `@MockitoSpyBean` does not exist here.
- Shared singletons: `booking_emi_config` is a global row; any test that changes it must save/restore it (see `BookingAutoConfirmIntegrationTest.saveConfig/cleanUp`).
- Circular FKs: `sale.booking_id -> plot_booking` and `plot_booking.sale_id -> sale`; test cleanup must `UPDATE plot_booking SET sale_id = NULL` before deleting sales.
- Do NOT refactor shared code (`BookingService` existing methods, `toResponse`, `sumByStatus`), and do NOT edit `BookingServiceTest`, `BookingControllerTest`, or `BookingExceptionHandlerTest` (units 7 edits them).
- Env noise: a full `mvn test` shows ~55 spurious Mockito errors (JDK21/25 mismatch) plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. They are unrelated. Last targeted baseline: 349 tests green on master. Always run targeted `-Dtest=` commands, from the WORKTREE's `backend` dir (not the main checkout): `cd <worktree>/backend && mvn -q -Dtest=ClassName test`.

## Decisions the spec did not settle (made here, flagged for review)

1. **Response = updated `BookingResponse`, HTTP 200** (like pay/confirm). Admin UI (unit 12) needs the refreshed status, `paidAmount`, and `dueAmount` (0 after cancel, VOID rows shown with `status=VOID`). A 204 would force a refetch. `installments[].overdue` is false for VOID (existing `toResponse` only flags `PENDING`).
2. **Plot drift: cancel never fails on plot state.** Plot handling is a three-way decision, evaluated under the booking+plot locks:
   - plot is `BOOKED` and NO other `ACTIVE`/`CONFIRMED` booking holds this `plot_id` -> flip to `AVAILABLE` (normal case).
   - plot is `BOOKED` but ANOTHER `ACTIVE`/`CONFIRMED` booking holds it (the cancelled booking was stale: the plot drifted and was re-booked) -> leave the plot `BOOKED`, still cancel, append `; plot kept: held by booking <otherId>` to the event detail.
   - plot is not `BOOKED` (`SOLD` or `AVAILABLE`, i.e. drift) -> leave it, still cancel, append `; plot left <STATUS>`. The other-holder query is NOT consulted here (nothing would be flipped anyway).
   Rationale: cancel is the repair tool and must not be blockable by drift; a `SOLD` plot is never freed (it would be sellable twice); a plot held by another live booking is never freed (the stale-booking guard, below). Interaction of the two rules: "only flip from BOOKED" is checked first; the holder guard only matters inside the `BOOKED` branch. Stale booking A + plot `SOLD` by confirmed booking B -> `plot left SOLD`. Stale A + plot `BOOKED` by B (ACTIVE or CONFIRMED) -> `plot kept: held by booking B`. At most one suffix is ever written.
2b. **Stale-booking plot guard (added after plan review).** New `PlotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(UUID plotId, UUID excludedBookingId, Collection<BookingStatus> statuses)` returning `Optional<PlotBooking>` (Optional rather than boolean so the holder's id can go in the event detail). Called as `(plotId, bookingId, List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED))`. It runs after both locks are held (booking -> plot, order unchanged); because `createBooking` takes the plot row lock before it inserts a booking, holding the plot lock serialises "is there another holder" against a concurrent re-book of the same plot. A CANCELLED booking never counts as a holder. Derived-query note: `plotId`, `id` and `status` are all mapped fields on `PlotBooking` (`UUID`, `UUID`, `@Enumerated(STRING) BookingStatus`), so `findFirstByPlotIdAndIdNotAndStatusIn` derives without `@Query`; Task 1 proves it against the real schema when the integration tests run (Task 4).
3. **`reason` validation:** `@NotBlank @Size(max = 255)` (matches `plot_booking.cancel_reason VARCHAR(255)` in V41), stored trimmed. Detail (`reason: ...; paid: ...; plot left ...`) is at most about 330 chars, under `booking_event.detail VARCHAR(500)`.
4. **Event detail format** (pinned by tests): `reason: <trimmed reason>; paid: <total PAID sum, scale 2>` plus optional `; plot left <STATUS>`. Zero paid renders `paid: 0.00`.
5. **Cancel vs pay is not always "one winner".** Under `MANUAL`, pay-then-cancel both succeed (pay legitimately precedes; the PAID installment is retained). The invariant is: no lost update (detail's paid total equals the final sum of `PAID` installments; PAID events match PAID rows) and pay-after-cancel is 409. Exactly-one-winner holds for cancel vs confirm, cancel vs cancel, and cancel vs an auto-confirming pay.
6. **No handler/`SecurityConfig` change**, no new exception.

## Review Focus

- Plot drifted to `SOLD`/`AVAILABLE` under an `ACTIVE` booking: cancel succeeds, plot untouched, note in detail (Task 1 unit, Task 4 integration).
- Stale booking whose plot was re-booked by another ACTIVE/CONFIRMED booking: cancel succeeds, the plot and the other booking are untouched (Task 1 unit, Task 4 integration).
- 255-char reason plus the longest suffix (`; plot kept: held by booking <uuid>`, about 70 chars) must fit `VARCHAR(500)` (Task 4).
- Reason with surrounding whitespace is stored trimmed; whitespace-only is 400 (Task 1, Task 2).
- Cancelling with zero payments (paid 0.00) and with all-but-one paid (Task 1, Task 4).
- Pay/confirm/re-cancel after cancel are 409 and write nothing; re-booking the freed plot works (Task 4).
- Cancel waiting on a holder of the booking lock then seeing its committed state (Task 6).

## File Structure

- Create `backend/src/main/java/com/plotchain/booking/CancelBookingRequest.java` — request DTO.
- Modify `backend/src/main/java/com/plotchain/booking/BookingService.java` — add `cancelBooking` (append directly after `confirmLocked`, before `getMyBookings`). Only new import: `java.util.Optional` (`RoundingMode`, `PlotStatus`, `Plot`, `BigDecimal`, `Instant`, `List` already imported).
- Modify `backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java` — append `findFirstByPlotIdAndIdNotAndStatusIn` after `findByIdForUpdate`; add `import java.util.Collection;`.
- Modify `backend/src/main/java/com/plotchain/booking/BookingController.java` — add `cancel` after `confirm`. No new imports needed.
- Create `backend/src/test/java/com/plotchain/booking/BookingCancelServiceTest.java` — Mockito unit tests (own `@BeforeEach`, copies the 8-arg `BookingService` constructor call from `BookingServiceTest.setUp`).
- Create `backend/src/test/java/com/plotchain/booking/BookingCancelControllerTest.java` — MockMvc with `@MockBean BookingService`.
- Create `backend/src/test/java/com/plotchain/booking/BookingCancelIntegrationTest.java` — real-DB behaviour, atomicity, concurrency.
- Modify `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — append rows after `adminBookingConfirmIsUnauthorizedWithoutAToken` (line ~589).

---

### Task 1: `CancelBookingRequest` + `BookingService.cancelBooking` (unit-tested)

**Files:**
- Create: `backend/src/main/java/com/plotchain/booking/CancelBookingRequest.java`
- Modify: `backend/src/main/java/com/plotchain/booking/BookingService.java` (insert after `confirmLocked`; needs `java.util.Optional` import)
- Modify: `backend/src/main/java/com/plotchain/booking/PlotBookingRepository.java` (append the other-holder finder)
- Test: `backend/src/test/java/com/plotchain/booking/BookingCancelServiceTest.java`

**Interfaces:**
- Consumes: `PlotBookingRepository.findByIdForUpdate(UUID)`, `PlotRepository.findByIdForUpdate(UUID)`, `PlotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(UUID, UUID, Collection<BookingStatus>)` (new, this task), `EmiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(UUID)`, `BookingEvent.of(bookingId, type, actorId, detail, createdAt)`, private `sumByStatus`, package-private `toResponse`.
- Produces: `Optional<PlotBooking> PlotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(UUID plotId, UUID excludedBookingId, Collection<BookingStatus> statuses)`; `record CancelBookingRequest(String reason)`; `public BookingResponse BookingService.cancelBooking(UUID bookingId, CancelBookingRequest request, UUID actorId)`.

- [ ] **Step 1: Create the DTO** (needed for the test to compile)

```java
package com.plotchain.booking;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

// reason is required (Flow "Cancel", 400 on blank). @Size(max = 255) matches
// plot_booking.cancel_reason VARCHAR(255) (V41) so an oversized reason is a 400, not a 500.
// The service stores it trimmed.
public record CancelBookingRequest(@NotBlank @Size(max = 255) String reason) {}
```

- [ ] **Step 2: Write the failing unit tests**

```java
package com.plotchain.booking;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.payments.BookingEmiConfig;
import com.plotchain.payments.BookingEmiConfigRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.sales.SaleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

// Unit 6. Separate from BookingServiceTest on purpose (unit 7 edits that file).
@ExtendWith(MockitoExtension.class)
class BookingCancelServiceTest {

    @Mock PlotRepository plotRepository;
    @Mock AssociateRepository associateRepository;
    @Mock BookingEmiConfigRepository bookingEmiConfigRepository;
    @Mock PlotBookingRepository plotBookingRepository;
    @Mock EmiInstallmentRepository emiInstallmentRepository;
    @Mock BookingEventRepository bookingEventRepository;
    @Mock SaleService saleService;

    private BookingService bookingService;
    private static final UUID PLOT_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private static final UUID ACTOR_ID = UUID.randomUUID();
    private static final Instant NOW = Instant.parse("2026-06-15T10:00:00Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    @BeforeEach
    void setUp() {
        bookingService = new BookingService(
            plotRepository, associateRepository, bookingEmiConfigRepository,
            plotBookingRepository, emiInstallmentRepository, bookingEventRepository, saleService, clock);
    }

    private EmiInstallment inst(int n, String amount, LocalDate due, InstallmentStatus status) {
        EmiInstallment i = new EmiInstallment();
        i.setId(UUID.randomUUID());
        i.setInstallmentNumber(n);
        i.setAmount(new BigDecimal(amount));
        i.setDueDate(due);
        i.setStatus(status);
        return i;
    }

    private Plot plot(PlotStatus status) {
        return new Plot(PLOT_ID, UUID.randomUUID(), "A-101", PlotType.NORMAL,
            new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), status);
    }

    // Booking locked + ACTIVE, plot locked with given status, installments as given.
    private PlotBooking locked(PlotStatus plotStatus, EmiInstallment... installments) {
        PlotBooking b = new PlotBooking();
        b.setId(UUID.randomUUID());
        b.setPlotId(PLOT_ID);
        b.setAssociateId(ASSOCIATE_ID);
        b.setBuyerName("Jane Buyer");
        b.setTotalAmount(new BigDecimal("600000.00"));
        b.setInstallmentCount(installments.length);
        b.setBookedAt(NOW);
        lenient().when(plotBookingRepository.findByIdForUpdate(b.getId())).thenReturn(Optional.of(b));
        lenient().when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plot(plotStatus)));
        lenient().when(emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(b.getId()))
            .thenReturn(List.of(installments));
        return b;
    }

    private CancelBookingRequest req(String reason) { return new CancelBookingRequest(reason); }

    @Test
    void cancelVoidsPendingKeepsPaidFreesPlotStampsBookingAndWritesEventWithReasonAndPaidTotal() {
        EmiInstallment paid = inst(1, "150000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PAID);
        EmiInstallment p2 = inst(2, "150000.00", LocalDate.of(2026, 8, 1), InstallmentStatus.PENDING);
        EmiInstallment p3 = inst(3, "300000.00", LocalDate.of(2026, 5, 1), InstallmentStatus.PENDING); // overdue
        PlotBooking b = locked(PlotStatus.BOOKED, paid, p2, p3);
        Plot[] plotHolder = new Plot[1];
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenAnswer(inv -> {
            plotHolder[0] = plot(PlotStatus.BOOKED);
            return Optional.of(plotHolder[0]);
        });

        BookingResponse r = bookingService.cancelBooking(b.getId(), req("  buyer withdrew  "), ACTOR_ID);

        assertThat(paid.getStatus()).isEqualTo(InstallmentStatus.PAID);
        assertThat(p2.getStatus()).isEqualTo(InstallmentStatus.VOID);
        assertThat(p3.getStatus()).isEqualTo(InstallmentStatus.VOID);
        assertThat(plotHolder[0].getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        verify(plotRepository).save(plotHolder[0]);
        assertThat(b.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(b.getCancelledAt()).isEqualTo(NOW);
        assertThat(b.getCancelReason()).isEqualTo("buyer withdrew");           // trimmed
        verify(plotBookingRepository).save(b);

        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getType()).isEqualTo(BookingEventType.CANCELLED);
        assertThat(ev.getValue().getBookingId()).isEqualTo(b.getId());
        assertThat(ev.getValue().getActorId()).isEqualTo(ACTOR_ID);
        assertThat(ev.getValue().getCreatedAt()).isEqualTo(NOW);
        assertThat(ev.getValue().getDetail()).isEqualTo("reason: buyer withdrew; paid: 150000.00");

        assertThat(r.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(r.paidAmount()).isEqualByComparingTo("150000.00");
        assertThat(r.dueAmount()).isEqualByComparingTo("0");                  // VOID is not due
        assertThat(r.installments()).extracting(EmiInstallmentResponse::status)
            .containsExactly(InstallmentStatus.PAID, InstallmentStatus.VOID, InstallmentStatus.VOID);
        assertThat(r.installments()).noneMatch(EmiInstallmentResponse::overdue); // VOID never overdue
    }

    @Test
    void cancelWithNothingPaidRecordsZeroPaid() {
        PlotBooking b = locked(PlotStatus.BOOKED,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));

        bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID);

        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail()).isEqualTo("reason: x; paid: 0.00");
    }

    @Test
    void cancelLocksTheBookingBeforeThePlotAndNeverUsesAnUnlockedFind() {
        PlotBooking b = locked(PlotStatus.BOOKED,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));

        bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID);

        InOrder order = inOrder(plotBookingRepository, plotRepository);
        order.verify(plotBookingRepository).findByIdForUpdate(b.getId());
        order.verify(plotRepository).findByIdForUpdate(PLOT_ID);
        verify(plotRepository, never()).findById(any());
        verify(plotBookingRepository, never()).findById(any());
    }

    @Test
    void cancelOfAnUnknownBookingIs404AndTouchesNothingElse() {
        UUID id = UUID.randomUUID();
        when(plotBookingRepository.findByIdForUpdate(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bookingService.cancelBooking(id, req("x"), ACTOR_ID))
            .isInstanceOf(BookingNotFoundException.class);
        verifyNoInteractions(plotRepository, emiInstallmentRepository, bookingEventRepository);
    }

    @Test
    void cancelOfAConfirmedOrCancelledBookingIs409AndWritesNothing() {
        for (BookingStatus status : List.of(BookingStatus.CONFIRMED, BookingStatus.CANCELLED)) {
            PlotBooking b = locked(PlotStatus.SOLD,
                inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PAID));
            b.setStatus(status);

            assertThatThrownBy(() -> bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID))
                .isInstanceOf(BookingNotActiveException.class);
        }
        verify(plotRepository, never()).findByIdForUpdate(any());
        verify(plotRepository, never()).save(any());
        verify(emiInstallmentRepository, never()).saveAll(any());
        verify(bookingEventRepository, never()).save(any());
    }

    // Decision (plan): drift never blocks cancel; a non-BOOKED plot is left exactly as found.
    @Test
    void cancelWithASoldPlotSucceedsLeavesThePlotSoldAndNotesItInTheEvent() {
        PlotBooking b = locked(PlotStatus.SOLD,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));
        Plot sold = plot(PlotStatus.SOLD);
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(sold));

        BookingResponse r = bookingService.cancelBooking(b.getId(), req("drift"), ACTOR_ID);

        assertThat(r.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(sold.getStatus()).isEqualTo(PlotStatus.SOLD);
        verify(plotRepository, never()).save(any());
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail()).isEqualTo("reason: drift; paid: 0.00; plot left SOLD");
    }

    @Test
    void cancelWithAnAlreadyAvailablePlotLeavesItAvailableAndNotesIt() {
        PlotBooking b = locked(PlotStatus.AVAILABLE,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));

        bookingService.cancelBooking(b.getId(), req("drift"), ACTOR_ID);

        verify(plotRepository, never()).save(any());
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail()).endsWith("; plot left AVAILABLE");
    }

    // Stale-booking guard. Another ACTIVE/CONFIRMED booking holds the plot: do not free it, still cancel.
    @Test
    void cancelKeepsTheBookedPlotWhenAnotherLiveBookingHoldsItAndNotesTheHolder() {
        PlotBooking b = locked(PlotStatus.BOOKED,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));
        Plot booked = plot(PlotStatus.BOOKED);
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(booked));
        PlotBooking other = new PlotBooking();
        other.setId(UUID.randomUUID());
        when(plotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(
            PLOT_ID, b.getId(), List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED)))
            .thenReturn(Optional.of(other));

        BookingResponse r = bookingService.cancelBooking(b.getId(), req("stale"), ACTOR_ID);

        assertThat(r.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(b.getStatus()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(booked.getStatus()).isEqualTo(PlotStatus.BOOKED);          // untouched
        verify(plotRepository, never()).save(any());
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail())
            .isEqualTo("reason: stale; paid: 0.00; plot kept: held by booking " + other.getId());
    }

    // Normal case: no other holder -> plot freed, no suffix. The guard query is asked with exactly
    // (plot, THIS booking excluded, [ACTIVE, CONFIRMED]).
    @Test
    void cancelFreesTheBookedPlotWhenNoOtherLiveBookingHoldsIt() {
        PlotBooking b = locked(PlotStatus.BOOKED,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));
        Plot booked = plot(PlotStatus.BOOKED);
        when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(booked));
        when(plotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(
            PLOT_ID, b.getId(), List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED)))
            .thenReturn(Optional.empty());

        bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID);

        assertThat(booked.getStatus()).isEqualTo(PlotStatus.AVAILABLE);
        verify(plotRepository).save(booked);
        ArgumentCaptor<BookingEvent> ev = ArgumentCaptor.forClass(BookingEvent.class);
        verify(bookingEventRepository).save(ev.capture());
        assertThat(ev.getValue().getDetail()).doesNotContain("plot kept").doesNotContain("plot left");
    }

    // A SOLD / AVAILABLE plot is never freed and the holder query is not even consulted.
    @Test
    void theOtherHolderQueryIsNotConsultedWhenThePlotIsNotBooked() {
        PlotBooking b = locked(PlotStatus.SOLD,
            inst(1, "600000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PENDING));

        bookingService.cancelBooking(b.getId(), req("x"), ACTOR_ID);

        verify(plotBookingRepository, never()).findFirstByPlotIdAndIdNotAndStatusIn(any(), any(), any());
    }

    // Unit-5 follow-up: "VOID installment exclusion from paid% has no unit test". VOID can now exist.
    // 4 x 150000 of 600000. 2 PAID + 1 VOID + 1 PENDING = 50% paid. At threshold 75 that must NOT
    // confirm; if VOID were wrongly counted as paid it would be 75% and would confirm.
    @Test
    void voidInstallmentsDoNotCountTowardsPaidPercentForAutoConfirm() {
        PlotBooking b = locked(PlotStatus.BOOKED);
        List<EmiInstallment> rows = List.of(
            inst(1, "150000.00", LocalDate.of(2026, 7, 1), InstallmentStatus.PAID),
            inst(2, "150000.00", LocalDate.of(2026, 8, 1), InstallmentStatus.PAID),
            inst(3, "150000.00", LocalDate.of(2026, 9, 1), InstallmentStatus.VOID),
            inst(4, "150000.00", LocalDate.of(2026, 10, 1), InstallmentStatus.PENDING));
        BookingEmiConfig cfg = org.mockito.Mockito.mock(BookingEmiConfig.class);
        when(cfg.getConfirmRule()).thenReturn("AUTO_THRESHOLD");
        when(cfg.getConfirmThresholdPercent()).thenReturn(75);
        when(bookingEmiConfigRepository.findBySingletonGuardTrue()).thenReturn(Optional.of(cfg));

        bookingService.afterInstallmentPaid(b, rows, ACTOR_ID);

        verifyNoInteractions(saleService);                                   // not confirmed
        assertThat(b.getStatus()).isEqualTo(BookingStatus.ACTIVE);
    }
}
```

Note for the implementer: `BookingEmiConfig` is a concrete class; the repo has a JDK21/25 Mockito/ByteBuddy issue with mocking concrete classes (see `BookingServiceTest.stubConfig` and `BookingServiceTest.emiConfig` for how they construct one). Replace the `mock(BookingEmiConfig.class)` lines with the same construction used by `BookingServiceTest.stubConfig("AUTO_THRESHOLD", 75)` (a real instance with setters). Keep the assertions.

- [ ] **Step 3: Run to verify failure**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingCancelServiceTest test`
Expected: compilation FAIL, `cancelBooking` not defined on `BookingService`.

- [ ] **Step 3b: Add the other-holder finder** to `PlotBookingRepository` (append after `findByIdForUpdate`; add `import java.util.Collection;`):

```java
    // Unit 6 stale-booking guard: is there ANOTHER booking in the given statuses on this plot?
    // Derived query (plotId, id, status are all mapped fields). Must be called under the plot row lock.
    // Unit 8 (admin register) also appends to this interface; both are pure appends.
    Optional<PlotBooking> findFirstByPlotIdAndIdNotAndStatusIn(
        UUID plotId, UUID excludedBookingId, Collection<BookingStatus> statuses);
```

- [ ] **Step 4: Implement `cancelBooking`** (insert in `BookingService` right after `confirmLocked`)

```java
    // Plot-booking unit 6 (spec Flow "Cancel", Decisions 4, 8). Locks the booking FIRST so a concurrent
    // pay / confirm / cancel serializes on it (the loser re-reads CANCELLED/CONFIRMED and gets 409),
    // then the plot. LOCK ORDER IS BOOKING -> PLOT EVERYWHERE (Decision 8), same as confirmLocked.
    // PAID installments are untouched; PENDING -> VOID; amounts retained as a note only (no refunds).
    // Plot goes BOOKED -> AVAILABLE only if it is currently BOOKED AND no other ACTIVE/CONFIRMED booking holds it. Any other status is plot drift (a BOOKED plot held by another live booking is kept the same way):
    // cancel must stay possible (it is the repair tool, unlike confirm which 409s on drift), and
    // flipping a SOLD plot to AVAILABLE would let a sold plot be sold twice. The drift is recorded in
    // the event detail instead. Reason + paid total live in booking_event.detail (Resolved decision #2).
    @Transactional
    public BookingResponse cancelBooking(UUID bookingId, CancelBookingRequest request, UUID actorId) {
        PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)
            .orElseThrow(() -> new BookingNotFoundException(bookingId));
        if (booking.getStatus() != BookingStatus.ACTIVE) {
            throw new BookingNotActiveException(bookingId);
        }
        Plot plot = plotRepository.findByIdForUpdate(booking.getPlotId())
            .orElseThrow(() -> new IllegalStateException(
                "plot row missing for booking " + bookingId + " - plot_id has an FK constraint"));

        List<EmiInstallment> installments =
            emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(bookingId);
        for (EmiInstallment installment : installments) {
            if (installment.getStatus() == InstallmentStatus.PENDING) {
                installment.setStatus(InstallmentStatus.VOID);
            }
        }
        emiInstallmentRepository.saveAll(installments);

        String plotNote = "";
        if (plot.getStatus() == PlotStatus.BOOKED) {
            // Stale-booking guard: runs under the booking + plot locks. If the plot drifted and another
            // live booking now holds it, freeing it would double-sell it; keep it and say so.
            Optional<PlotBooking> holder = plotBookingRepository.findFirstByPlotIdAndIdNotAndStatusIn(
                plot.getId(), bookingId, List.of(BookingStatus.ACTIVE, BookingStatus.CONFIRMED));
            if (holder.isPresent()) {
                plotNote = "; plot kept: held by booking " + holder.get().getId();
            } else {
                plot.setStatus(PlotStatus.AVAILABLE);
                plotRepository.save(plot);
            }
        } else {
            plotNote = "; plot left " + plot.getStatus();
        }

        Instant now = clock.instant();
        String reason = request.reason().trim();
        booking.setStatus(BookingStatus.CANCELLED);
        booking.setCancelledAt(now);
        booking.setCancelReason(reason);
        plotBookingRepository.save(booking);

        BigDecimal paid = sumByStatus(installments, InstallmentStatus.PAID).setScale(2, RoundingMode.HALF_UP);
        bookingEventRepository.save(BookingEvent.of(bookingId, BookingEventType.CANCELLED, actorId,
            "reason: " + reason + "; paid: " + paid.toPlainString() + plotNote, now));

        return toResponse(booking, installments);
    }
```

- [ ] **Step 5: Run to verify pass**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingCancelServiceTest test`
Expected: PASS (11 tests).

- [ ] **Step 6: Mutation check (then revert)**: (a) in `cancelBooking` swap `plotBookingRepository.findByIdForUpdate` for `findById` -> `cancelLocksTheBooking...` fails; (b) make the plot flip unconditional -> `cancelWithASoldPlot...` fails; (c) delete the holder check (always free the plot) -> `cancelKeepsTheBookedPlot...` fails; (d) change `sumByStatus(..PAID)` use in `thresholdReached` to count non-PENDING -> the VOID test fails (temporary edit, revert).

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/CancelBookingRequest.java backend/src/main/java/com/plotchain/booking/BookingService.java backend/src/test/java/com/plotchain/booking/BookingCancelServiceTest.java
git commit -m "feat(booking): cancelBooking service with VOID installments, plot release and CANCELLED event (unit 6)"
```

---

### Task 2: Controller endpoint + validation

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/BookingController.java` (after `confirm`)
- Test: `backend/src/test/java/com/plotchain/booking/BookingCancelControllerTest.java`

**Interfaces:**
- Consumes: `BookingService.cancelBooking(UUID, CancelBookingRequest, UUID)`.
- Produces: `POST /api/admin/bookings/{id}/cancel` -> 200 `BookingResponse`.

- [ ] **Step 1: Write the failing test** (setup mirrors `BookingControllerTest`: `@SpringBootTest @AutoConfigureMockMvc @ActiveProfiles("test")`, `@MockBean AssociateRepository`, `@MockBean BookingService`, same `tokenFor` helper)

```java
package com.plotchain.booking;

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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BookingCancelControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    private String tokenFor(UUID id, AssociateRole role) {
        Associate a = new Associate();
        a.setId(id);
        a.setRole(role);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));
        return jwtService.generateToken(a);
    }

    private org.springframework.test.web.servlet.ResultActions cancel(UUID bookingId, String adminTokenFor, String body) throws Exception {
        return mockMvc.perform(post("/api/admin/bookings/{id}/cancel", bookingId)
            .header("Authorization", "Bearer " + adminTokenFor)
            .contentType("application/json").content(body));
    }

    @Test
    void cancelReturns200WithTheUpdatedBookingAndPassesTheActorAndReason() throws Exception {
        UUID actor = UUID.randomUUID();
        UUID bookingId = UUID.randomUUID();
        BookingResponse response = new BookingResponse(bookingId, UUID.randomUUID(), UUID.randomUUID(),
            BookingStatus.CANCELLED, "Jane Buyer", new BigDecimal("600000.00"), 1, Instant.now(),
            BigDecimal.ZERO, BigDecimal.ZERO, List.of());
        when(bookingService.cancelBooking(eq(bookingId), eq(new CancelBookingRequest("changed mind")), eq(actor)))
            .thenReturn(response);

        cancel(bookingId, tokenFor(actor, AssociateRole.ADMIN), "{\"reason\":\"changed mind\"}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void cancelOfAnUnknownBookingIs404() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.cancelBooking(eq(id), any(), any())).thenThrow(new BookingNotFoundException(id));
        cancel(id, tokenFor(UUID.randomUUID(), AssociateRole.ADMIN), "{\"reason\":\"x\"}")
            .andExpect(status().isNotFound());
    }

    @Test
    void cancelOfANonActiveBookingIs409() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.cancelBooking(eq(id), any(), any())).thenThrow(new BookingNotActiveException(id));
        cancel(id, tokenFor(UUID.randomUUID(), AssociateRole.ADMIN), "{\"reason\":\"x\"}")
            .andExpect(status().isConflict());
    }

    @Test
    void cancelWithABlankMissingOrOversizedReasonIs400AndNeverReachesTheService() throws Exception {
        String token = tokenFor(UUID.randomUUID(), AssociateRole.ADMIN);
        UUID id = UUID.randomUUID();
        cancel(id, token, "{\"reason\":\"\"}").andExpect(status().isBadRequest());
        cancel(id, token, "{\"reason\":\"   \"}").andExpect(status().isBadRequest());
        cancel(id, token, "{}").andExpect(status().isBadRequest());
        cancel(id, token, "{\"reason\":null}").andExpect(status().isBadRequest());
        cancel(id, token, "{\"reason\":\"" + "x".repeat(256) + "\"}").andExpect(status().isBadRequest());
        cancel(id, token, "").andExpect(status().isBadRequest());           // no body at all
        verify(bookingService, never()).cancelBooking(any(), any(), any());
    }

    @Test
    void cancelWithAReasonOfExactly255CharactersIsAccepted() throws Exception {
        UUID id = UUID.randomUUID();
        when(bookingService.cancelBooking(eq(id), any(), any())).thenThrow(new BookingNotFoundException(id));
        cancel(id, tokenFor(UUID.randomUUID(), AssociateRole.ADMIN), "{\"reason\":\"" + "x".repeat(255) + "\"}")
            .andExpect(status().isNotFound());                              // got past validation
    }

    @Test
    void cancelIsForbiddenForAnAssociateTokenAndUnauthorizedWithoutOne() throws Exception {
        UUID id = UUID.randomUUID();
        cancel(id, tokenFor(UUID.randomUUID(), AssociateRole.ASSOCIATE), "{\"reason\":\"x\"}")
            .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/bookings/{id}/cancel", id).contentType("application/json")
            .content("{\"reason\":\"x\"}")).andExpect(status().isUnauthorized());
        verify(bookingService, never()).cancelBooking(any(), any(), any());
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingCancelControllerTest test`
Expected: FAIL (404/405 from missing mapping; 200 test fails).

- [ ] **Step 3: Add the endpoint** (in `BookingController`, after `confirm`)

```java
    // Admin cancels an ACTIVE booking (Decisions 4, 12). Returns the updated booking (200), like
    // pay/confirm: the admin UI needs the refreshed status and paid/due totals (VOID rows, due = 0).
    @PostMapping("/{id}/cancel")
    public BookingResponse cancel(@PathVariable UUID id, @Valid @RequestBody CancelBookingRequest request,
                                  @AuthenticationPrincipal UUID actorId) {
        return bookingService.cancelBooking(id, request, actorId);
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingCancelControllerTest test`
Expected: PASS (6 tests). If the "no body at all" case yields 400 only via `HttpMessageNotReadableException` default handling, that is fine; if some global handler maps it differently, adjust the expectation to the observed existing behaviour and note it.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/BookingController.java backend/src/test/java/com/plotchain/booking/BookingCancelControllerTest.java
git commit -m "feat(booking): POST /api/admin/bookings/{id}/cancel endpoint with validation (unit 6)"
```

---

### Task 3: `SecurityConfigTest` matrix rows (no `SecurityConfig` change)

**Files:**
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (append right after `adminBookingConfirmIsUnauthorizedWithoutAToken`, ~line 589)

- [ ] **Step 1: Confirm no config change needed.** Read `SecurityConfig.java:277` (`POST /api/**` -> `hasAuthority("ADMIN")`) and confirm no earlier matcher shadows `/api/admin/bookings/*/cancel`. Do not edit `SecurityConfig`.

- [ ] **Step 2: Add the rows** (same pattern as the confirm rows; valid body so ADMIN passes validation and reaches the real service -> 404 for a random id; the other roles are 403 at the filter, before validation)

```java
    // plot-booking unit 6 (Decision 12): POST .../cancel rides the blanket ADMIN write rule. ADMIN with a
    // random booking id reaches the real BookingService and 404s (proves it passed security); every other
    // role is 403 at the filter.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminBookingCancelIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/cancel", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"reason\":\"buyer withdrew\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }

    @Test
    void adminBookingCancelIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/bookings/{id}/cancel", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"reason\":\"buyer withdrew\"}"))
            .andExpect(status().isUnauthorized());
    }
```

- [ ] **Step 3: Run**: `cd <worktree>/backend && mvn -q -Dtest=SecurityConfigTest test`. Expected: PASS (new rows green; existing rows unchanged).

- [ ] **Step 4: Commit**: `git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java && git commit -m "test(security): cancel booking ADMIN-only matrix rows (unit 6)"`

---

### Task 4: Real-DB behaviour tests (`BookingCancelIntegrationTest`, part 1)

**Files:**
- Create: `backend/src/test/java/com/plotchain/booking/BookingCancelIntegrationTest.java`

**Interfaces:** Consumes `bookingService.createBooking/recordPayment/confirmBooking/cancelBooking`. This task creates the harness reused by Tasks 5-6.

- [ ] **Step 1: Write the harness and behaviour tests.** Harness = copy of `BookingAutoConfirmIntegrationTest` verbatim for: imports, `@SpringBootTest @ActiveProfiles("test")`, autowired fields, `@SpyBean BookingEventRepository bookingEventRepository`, `plotId/projectId/associateId/originalConfig`, `saveConfig()` (`@BeforeEach`), `cleanUp()` (`@AfterEach`, including `UPDATE plot_booking SET sale_id = NULL`, sales/ledger deletion, events/installments/bookings deletion, plot/project/associate deletion, config restore), `setConfig`, `seedAvailablePlot`, `seedAssociate`, `awaitQuietly`, `seedBooking`, `payInstallment`, `count`, `bookingStatus`, `plotStatus`. Copy, do not extract a shared base class (keeps unit 7 conflict-free; the repo already tolerates this duplication). Then add:

```java
    private String eventDetail(UUID bookingId, String type) {
        return jdbc.queryForObject(
            "SELECT detail FROM booking_event WHERE booking_id = ? AND type = ?", String.class, bookingId, type);
    }

    @Test
    void cancelPersistsEverythingAndLeavesPaidInstallmentsUntouched() {
        setConfig(true, 4, "MANUAL", null);                       // 4 x 150000.00
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        payInstallment(b, 3);                                      // out of order is fine

        BookingResponse after = bookingService.cancelBooking(b.id(), new CancelBookingRequest("  buyer withdrew "), associateId);

        assertThat(after.status()).isEqualTo(BookingStatus.CANCELLED);
        assertThat(after.paidAmount()).isEqualByComparingTo("300000.00");
        assertThat(after.dueAmount()).isEqualByComparingTo("0");
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, cancelled_at, cancel_reason, confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("STATUS")).isEqualTo("CANCELLED");
        assertThat(row.get("CANCELLED_AT")).isNotNull();
        assertThat(row.get("CANCEL_REASON")).isEqualTo("buyer withdrew");
        assertThat(row.get("CONFIRMED_AT")).isNull();
        assertThat(row.get("SALE_ID")).isNull();
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'", b.id())).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PENDING'", b.id())).isZero();
        // PAID rows keep their payment fields
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID' AND payment_ref IS NOT NULL AND paid_at IS NOT NULL", b.id())).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED' AND actor_id = ?", b.id(), associateId)).isEqualTo(1);
        assertThat(eventDetail(b.id(), "CANCELLED")).isEqualTo("reason: buyer withdrew; paid: 300000.00");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", associateId)).isZero();
    }

    @Test
    void a255CharReasonFitsTheEventDetailColumnEvenWithTheLongestSuffix() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        reBookUnderneath(b);                                       // forces the longest suffix: plot kept: held by booking <uuid>
        String reason = "r".repeat(255);

        bookingService.cancelBooking(b.id(), new CancelBookingRequest(reason), associateId);

        assertThat(eventDetail(b.id(), "CANCELLED")).startsWith("reason: " + reason).contains("plot kept: held by booking");
        assertThat(jdbc.queryForObject("SELECT cancel_reason FROM plot_booking WHERE id = ?", String.class, b.id())).hasSize(255);
    }

    @Test
    void cancelOfAConfirmedBookingIs409AndChangesNothing() {
        setConfig(false, 1, "MANUAL", null);
        BookingResponse b = seedBooking();
        bookingService.confirmBooking(b.id(), associateId);

        assertThatThrownBy(() -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId))
            .isInstanceOf(BookingNotActiveException.class);
        assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
    }

    @Test
    void cancelOfAnAlreadyCancelledBookingIs409AndWritesNoSecondEvent() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("first"), associateId);

        assertThatThrownBy(() -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("second"), associateId))
            .isInstanceOf(BookingNotActiveException.class);
        assertThat(jdbc.queryForObject("SELECT cancel_reason FROM plot_booking WHERE id = ?", String.class, b.id())).isEqualTo("first");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isEqualTo(1);
    }

    @Test
    void cancelOfAnUnknownBookingIs404() {
        assertThatThrownBy(() -> bookingService.cancelBooking(UUID.randomUUID(), new CancelBookingRequest("x"), UUID.randomUUID()))
            .isInstanceOf(BookingNotFoundException.class);
    }

    // Decision (plan): plot drift never blocks cancel.
    @Test
    void cancelWithASoldPlotSucceedsAndLeavesThePlotSold() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        jdbc.update("UPDATE plot SET status = 'SOLD' WHERE id = ?", plotId);

        bookingService.cancelBooking(b.id(), new CancelBookingRequest("drift"), associateId);

        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        assertThat(eventDetail(b.id(), "CANCELLED")).endsWith("; plot left SOLD");
    }

    @Test
    void cancelWithAnAvailablePlotSucceedsAndLeavesThePlotAvailable() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        jdbc.update("UPDATE plot SET status = 'AVAILABLE' WHERE id = ?", plotId);

        bookingService.cancelBooking(b.id(), new CancelBookingRequest("drift"), associateId);

        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
        assertThat(eventDetail(b.id(), "CANCELLED")).endsWith("; plot left AVAILABLE");
    }

    // After cancel, the existing pay guard (booking not ACTIVE) rejects every pay: the VOID installment
    // can never be paid, nothing is written.
    // Stale-booking guard, real DB. A is ACTIVE; the plot is then (manually) freed and re-booked by B,
    // leaving A stale on a plot B holds. Cancelling A must not free B's plot.
    private BookingResponse reBookUnderneath(BookingResponse a) {
        jdbc.update("UPDATE plot SET status = 'AVAILABLE' WHERE id = ?", plotId);
        return bookingService.createBooking(new CreateBookingRequest(plotId, associateId, "Buyer B", null));
    }

    @Test
    void cancellingAStaleBookingDoesNotFreeAPlotHeldByAnotherActiveBooking() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse a = seedBooking();
        BookingResponse b = reBookUnderneath(a);                  // plot BOOKED by B (ACTIVE)

        bookingService.cancelBooking(a.id(), new CancelBookingRequest("stale"), associateId);

        assertThat(bookingStatus(a.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("BOOKED");             // NOT freed
        assertThat(eventDetail(a.id(), "CANCELLED")).endsWith("; plot kept: held by booking " + b.id());
        // B completely untouched
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PENDING'", b.id())).isEqualTo(4);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ?", b.id())).isZero();
        // and B can still be cancelled normally, which now frees the plot
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("ok"), associateId);
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }

    @Test
    void cancellingAStaleBookingDoesNotFreeAPlotHeldByAConfirmedBooking() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse a = seedBooking();
        BookingResponse b = reBookUnderneath(a);
        // CONFIRMED holder while the plot is still BOOKED (hand-set; a real confirm would make it SOLD,
        // which is the separate "plot left SOLD" path already covered above)
        jdbc.update("UPDATE plot_booking SET status = 'CONFIRMED' WHERE id = ?", b.id());

        bookingService.cancelBooking(a.id(), new CancelBookingRequest("stale"), associateId);

        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(eventDetail(a.id(), "CANCELLED")).endsWith("; plot kept: held by booking " + b.id());
        assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
    }

    @Test
    void aCancelledOtherBookingOnThePlotDoesNotCountAsAHolder() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse a = seedBooking();
        BookingResponse b = reBookUnderneath(a);
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("b out"), associateId);   // frees plot
        jdbc.update("UPDATE plot SET status = 'BOOKED' WHERE id = ?", plotId);                  // A stale again

        bookingService.cancelBooking(a.id(), new CancelBookingRequest("a out"), associateId);

        assertThat(plotStatus()).isEqualTo("AVAILABLE");          // only a CANCELLED booking remains
        assertThat(eventDetail(a.id(), "CANCELLED")).doesNotContain("plot kept");
    }

    @Test
    void payAfterCancelIs409ForVoidAndPaidInstallmentsAndWritesNothing() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId);
        int paidEventsBefore = count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id());

        assertThatThrownBy(() -> payInstallment(b, 2)).isInstanceOf(BookingNotActiveException.class);   // VOID row
        assertThatThrownBy(() -> payInstallment(b, 1)).isInstanceOf(BookingNotActiveException.class);   // PAID row
        assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 2",
            String.class, b.id())).isEqualTo("VOID");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(paidEventsBefore);
    }

    @Test
    void confirmAfterCancelIs409AndCreatesNoSale() {
        setConfig(false, 1, "MANUAL", null);
        BookingResponse b = seedBooking();
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId);

        assertThatThrownBy(() -> bookingService.confirmBooking(b.id(), associateId)).isInstanceOf(BookingNotActiveException.class);
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", associateId)).isZero();
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }

    @Test
    void theFreedPlotCanBeBookedAgainAndTheCancelledBookingStaysCancelled() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse first = seedBooking();
        bookingService.cancelBooking(first.id(), new CancelBookingRequest("x"), associateId);

        BookingResponse second = bookingService.createBooking(
            new CreateBookingRequest(plotId, associateId, "New Buyer", null));

        assertThat(second.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(second.id()).isNotEqualTo(first.id());
        assertThat(second.installments()).hasSize(4).allMatch(i -> i.status() == InstallmentStatus.PENDING);
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(bookingStatus(first.id())).isEqualTo("CANCELLED");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", first.id())).isEqualTo(4);
        // and the new booking can itself be cancelled (full cycle)
        bookingService.cancelBooking(second.id(), new CancelBookingRequest("again"), associateId);
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }
```

Imports to add beyond the copied set: `java.util.Map` is already there; nothing else.

- [ ] **Step 2: Run**: `cd <worktree>/backend && mvn -q -Dtest=BookingCancelIntegrationTest test`. Expected: PASS (13 tests) since Task 1 already implemented the service. (Written after the unit tests because these are verification of already-implemented behaviour against the real DB; if any fails, the failure is a real bug to fix in `cancelBooking`, not in the test.)

- [ ] **Step 3: Commit**: `git add backend/src/test/java/com/plotchain/booking/BookingCancelIntegrationTest.java && git commit -m "test(booking): real-DB cancel behaviour, drift, post-cancel pay/confirm and re-booking (unit 6)"`

---

### Task 5: Atomicity proof with `@SpyBean` (same class)

**Files:**
- Modify: `backend/src/test/java/com/plotchain/booking/BookingCancelIntegrationTest.java` (add imports `static org.mockito.ArgumentMatchers.argThat`, `static org.mockito.Mockito.doThrow` if not already copied from the harness; both are in the harness imports)

- [ ] **Step 1: Add the test**

```java
    // Real rollback proof. The CANCELLED event write is the LAST write, so it fails AFTER the installments
    // were voided, the plot flipped to AVAILABLE and the booking row set to CANCELLED. Only the
    // surrounding transaction can undo them. Reads are fresh JDBC (no persistence context).
    @Test
    void aFailureAfterTheInstallmentsAreVoidedAndThePlotFlippedRollsTheWholeCancelBack() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        doThrow(new IllegalStateException("simulated event write failure"))
            .when(bookingEventRepository).save(argThat(e -> e.getType() == BookingEventType.CANCELLED));

        assertThatThrownBy(() -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulated");

        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PENDING'", b.id())).isEqualTo(3);
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'", b.id())).isEqualTo(1);
        assertThat(plotStatus()).isEqualTo("BOOKED");
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, cancelled_at, cancel_reason FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("STATUS")).isEqualTo("ACTIVE");
        assertThat(row.get("CANCELLED_AT")).isNull();
        assertThat(row.get("CANCEL_REASON")).isNull();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
        // booking still cancellable afterwards (nothing left half-done / lock released)
        org.mockito.Mockito.reset(bookingEventRepository);
        bookingService.cancelBooking(b.id(), new CancelBookingRequest("retry"), associateId);
        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
    }
```

- [ ] **Step 2: Run**: `cd <worktree>/backend && mvn -q -Dtest=BookingCancelIntegrationTest#aFailureAfterTheInstallmentsAreVoidedAndThePlotFlippedRollsTheWholeCancelBack test`. Expected: PASS.

- [ ] **Step 3: Honest mutation check (then revert).** Temporarily BOTH (a) remove `@Transactional` from `cancelBooking` AND (b) change `plotBookingRepository.findByIdForUpdate(bookingId)` to `plotBookingRepository.findById(bookingId)` and the plot lookup to `plotRepository.findById(...)` in `cancelBooking` only. (Removing only `@Transactional` makes the `PESSIMISTIC_WRITE` query throw `TransactionRequiredException`, which would fail the test for the wrong reason and prove nothing.) Re-run: the test must fail on the assertions (VOID count non-zero / plot `AVAILABLE` / booking `CANCELLED`). Revert both edits and confirm green.

- [ ] **Step 4: Commit**: `git add backend/src/test/java/com/plotchain/booking/BookingCancelIntegrationTest.java && git commit -m "test(booking): cancel atomicity rollback proof via SpyBean (unit 6)"`

---

### Task 6: Concurrency tests (same class)

**Files:**
- Modify: `backend/src/test/java/com/plotchain/booking/BookingCancelIntegrationTest.java` (add imports used by the copied confirm race tests: `ExecutorService`, `Executors`, `Future`, `CountDownLatch`, `TimeUnit`, `ExecutionException`, `ArrayList`, `AtomicReference`; most come with the harness copy)

Race tests use `@RepeatedTest(10)` (`org.junit.jupiter.api.RepeatedTest`): `@AfterEach` cleanup and fresh seed run per repetition. Every `pool.shutdownNow()` goes in a `finally` (unit-5 cosmetic lesson).

- [ ] **Step 1: Add the tests**

```java
    // Helper: run two callables at the same instant; returns each outcome (null = success, else the cause).
    private List<Throwable> race(java.util.concurrent.Callable<?> a, java.util.concurrent.Callable<?> b) throws Exception {
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<?>> fs = new ArrayList<>();
            for (java.util.concurrent.Callable<?> c : List.of(a, b)) {
                fs.add(pool.submit(() -> { awaitQuietly(start); return c.call(); }));
            }
            start.countDown();
            List<Throwable> out = new ArrayList<>();
            for (Future<?> f : fs) {
                try { f.get(10, TimeUnit.SECONDS); out.add(null); }
                catch (ExecutionException e) { out.add(e.getCause()); }
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    @RepeatedTest(10)
    void twoSimultaneousCancelsYieldExactlyOneWinnerAndOneEvent() throws Exception {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);

        List<Throwable> r = race(
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("A"), associateId),
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("B"), associateId));

        assertThat(r.stream().filter(java.util.Objects::isNull)).hasSize(1);
        assertThat(r.stream().filter(java.util.Objects::nonNull)).hasSize(1)
            .allSatisfy(t -> assertThat(t).isInstanceOf(BookingNotActiveException.class));
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isEqualTo(1);
        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isEqualTo(3);
    }

    // Cancel vs manual confirm: exactly one winner, state consistent with the winner.
    @RepeatedTest(10)
    void aCancelRacingAManualConfirmYieldsExactlyOneWinner() throws Exception {
        setConfig(false, 1, "MANUAL", null);
        BookingResponse b = seedBooking();

        List<Throwable> r = race(
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId),
            () -> bookingService.confirmBooking(b.id(), associateId));

        boolean cancelWon = r.get(0) == null;
        boolean confirmWon = r.get(1) == null;
        assertThat(cancelWon ^ confirmWon).as("exactly one winner").isTrue();
        Throwable loser = cancelWon ? r.get(1) : r.get(0);
        assertThat(loser).isInstanceOf(BookingNotActiveException.class);
        if (cancelWon) {
            assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
            assertThat(plotStatus()).isEqualTo("AVAILABLE");
            assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isZero();
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id())).isZero();
        } else {
            assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
            assertThat(plotStatus()).isEqualTo("SOLD");
            assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
        }
    }

    // Cancel vs a pay that auto-confirms (single installment, AUTO_THRESHOLD 100): exactly one winner.
    // Exercises booking -> plot lock order from both sides (pay's auto-confirm and cancel both take the
    // plot lock after the booking lock): a lock-order inversion would deadlock/time out here.
    @RepeatedTest(10)
    void aCancelRacingAnAutoConfirmingPayYieldsExactlyOneWinner() throws Exception {
        setConfig(false, 1, "AUTO_THRESHOLD", 100);
        BookingResponse b = seedBooking();
        BigDecimal total = b.installments().get(0).amount();

        List<Throwable> r = race(
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId),
            () -> bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(total, "UTR-R", null), associateId));

        boolean cancelWon = r.get(0) == null;
        boolean payWon = r.get(1) == null;
        assertThat(cancelWon ^ payWon).as("exactly one winner").isTrue();
        assertThat(cancelWon ? r.get(1) : r.get(0)).isInstanceOf(BookingNotActiveException.class);
        if (cancelWon) {
            assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
            assertThat(plotStatus()).isEqualTo("AVAILABLE");
            assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE booking_id = ?", String.class, b.id())).isEqualTo("VOID");
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isZero();
            assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isZero();
        } else {
            assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
            assertThat(plotStatus()).isEqualTo("SOLD");
            assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE booking_id = ?", String.class, b.id())).isEqualTo("PAID");
            assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
        }
    }

    // Cancel vs a plain pay under MANUAL: pay-then-cancel legitimately BOTH succeed (the paid installment
    // is retained), cancel-then-pay is 409 for the pay. Invariant under every interleaving: no lost
    // update. The cancel event's "paid" total equals the final sum of PAID installments, and PAID events
    // match PAID rows.
    @RepeatedTest(10)
    void aCancelRacingAPlainPayNeverLosesTheUpdate() throws Exception {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        BigDecimal amount = b.installments().get(0).amount();

        List<Throwable> r = race(
            () -> bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId),
            () -> bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(amount, "UTR-R", null), associateId));

        assertThat(r.get(0)).as("cancel always succeeds on an ACTIVE booking").isNull();
        if (r.get(1) != null) {
            assertThat(r.get(1)).isInstanceOf(BookingNotActiveException.class);
        }
        int paidRows = count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'", b.id());
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(paidRows);
        assertThat(eventDetail(b.id(), "CANCELLED")).endsWith("paid: " + (paidRows == 1 ? "150000.00" : "0.00"));
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PENDING'", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isEqualTo(3 + (1 - paidRows));
        assertThat(bookingStatus(b.id())).isEqualTo("CANCELLED");
        assertThat(plotStatus()).isEqualTo("AVAILABLE");
    }

    // Deterministic proof the booking is read WITH the lock (the races above can pass by luck without it).
    // A holder transaction takes the booking lock and sets CONFIRMED (simulating a confirm that commits
    // first). cancel must park on the lock, then see CONFIRMED and 409, and must NOT have touched the plot.
    // Same polling pattern as BookingConfirmIntegrationTest.confirmWaitsForAHolderOfTheBookingLock...
    @Test
    void cancelWaitsForAHolderOfTheBookingLockAndThenSeesItsCommittedState() throws Exception {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();
        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicReference<Thread> cancelThread = new java.util.concurrent.atomic.AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        try {
            Future<?> holder = pool.submit(() -> tx.executeWithoutResult(s -> {
                PlotBooking locked = plotBookingRepository.findByIdForUpdate(b.id()).orElseThrow();
                locked.setStatus(BookingStatus.CONFIRMED);
                plotBookingRepository.save(locked);
                lockHeld.countDown();
                awaitQuietly(releaseLock);
            }));
            assertThat(lockHeld.await(5, TimeUnit.SECONDS)).isTrue();

            Future<BookingResponse> cancel = pool.submit(() -> {
                cancelThread.set(Thread.currentThread());
                return bookingService.cancelBooking(b.id(), new CancelBookingRequest("x"), associateId);
            });
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < deadline) {
                Thread t = cancelThread.get();
                if (t != null && (t.getState() == Thread.State.WAITING || t.getState() == Thread.State.TIMED_WAITING
                        || t.getState() == Thread.State.BLOCKED)) {
                    break;
                }
                Thread.sleep(5);
            }
            assertThat(cancel.isDone()).as("cancel must still be waiting on the holder's lock").isFalse();

            releaseLock.countDown();
            holder.get(5, TimeUnit.SECONDS);
            assertThatThrownBy(() -> cancel.get(10, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class).hasCauseInstanceOf(BookingNotActiveException.class);
        } finally {
            pool.shutdownNow();
        }
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'VOID'", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CANCELLED'", b.id())).isZero();
    }
```

Note: the holder test leaves a `CONFIRMED` booking with no sale; cleanup only deletes by associate so that is fine.

- [ ] **Step 2: Run**: `cd <worktree>/backend && mvn -q -Dtest=BookingCancelIntegrationTest test`. Expected: PASS (all, including 10 repetitions each of 4 race tests).

- [ ] **Step 3: Mutation checks (then revert each).** (a) In `cancelBooking` swap `plotBookingRepository.findByIdForUpdate` -> `findById` (keep `@Transactional`): `cancelWaitsForAHolder...` MUST fail deterministically (cancel completes instead of parking); the races may or may not fail, which is why that test exists. (b) Swap the plot lookup `plotRepository.findByIdForUpdate` -> `findById` in `cancelBooking`: races stay green (the booking lock already serializes); note this as expected, the plot lock matters for the createBooking/recordSale paths that lock the plot without a booking. (c) Remove the `status != ACTIVE` guard: `twoSimultaneousCancels` and `cancelOfAConfirmed...` fail. Revert all.

- [ ] **Step 4: Commit**: `git add backend/src/test/java/com/plotchain/booking/BookingCancelIntegrationTest.java && git commit -m "test(booking): cancel concurrency (two cancels, cancel vs pay, cancel vs confirm, lock-wait proof) (unit 6)"`

---

### Task 7: Regression pass

- [ ] **Step 1:** Run the booking package and security tests together from the worktree backend dir:

`cd <worktree>/backend && mvn -q -Dtest='Booking*Test,AssociateBookingControllerTest,PlotBookingSchemaTest,V41MigrationTest,SecurityConfigTest,SaleServiceTest' test`

Expected: all green. Baseline before this unit: 349 targeted tests green on master; expect roughly 349 + 11 (service) + 6 (controller) + 4 (security: 3 ADMIN-role-param rows + 1) + about 14 integration cases and 40 repeated-race executions. Do not trust the exact total, trust zero failures.

- [ ] **Step 2:** Do NOT use a full `mvn test` as the gate: it shows about 55 spurious Mockito errors (JDK21/25 mismatch) plus 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures, none related to this unit. If run for info, compare the failing set with master's.

- [ ] **Step 3:** `git status` clean except the intended files; no edits to `SecurityConfig.java`, `BookingExceptionHandler.java`, `BookingServiceTest.java`, `BookingControllerTest.java`, or the units/status files (the coordinator marks the unit merged).

---

## Notes for later units (rebase surface)

- Unit 7 (transfer) also appends to `BookingService.java` (add `transferBooking` after `cancelBooking`), `BookingController.java` (add `transfer` after `cancel`), `SecurityConfigTest.java` (rows after the cancel rows), and possibly `BookingExceptionHandler`/`BookingServiceTest`. My only edits to shared files are pure appends at the same anchor points (after `confirmLocked`, after `confirm`, after the confirm security rows), so expect trivial adjacent-hunk conflicts only in those three files; resolve by keeping both.
- `PlotBookingRepository.java` is now edited by unit 6 (appends `findFirstByPlotIdAndIdNotAndStatusIn` plus `import java.util.Collection;`). Unit 8 (register search query) also appends to this interface, so expect an adjacent-hunk conflict and a possible duplicate `java.util.Collection` import; keep both methods and one import.
- Units 8/9 (register/overdue) touch `PlotBookingRepository`/`BookingService` read paths and `toResponse` consumers; cancel does not alter any existing signature. They will now see `CANCELLED` bookings with `VOID` installments: the overdue report must keep filtering `ACTIVE` bookings and `PENDING` installments (VOID is never overdue; `toResponse` already guarantees this).
- Unit 12 (UI): surface the 409 for cancel on non-`ACTIVE`; show `plot left <STATUS>` from the event if an event/detail view is ever added; Cancel action disabled unless `ACTIVE`.
- Unit 7 (transfer) does not need the holder guard (transfer never changes plot status).

## Self-Review

- Spec coverage: Decision 4 (Tasks 1, 4), Decision 8 locking and order (Task 1 order test, Task 6 races/holder), Decision 12 (Tasks 2, 3), Flow "Cancel" 400 (Task 2), Error handling 404/409 (Tasks 1, 2, 4), Testing concurrency (Task 6), Resolved decision #2 (Tasks 1, 4 detail format). Task criteria from the units file all mapped; must-handle items 1 (Task 5), 2 (Task 6), 3 (Tasks 1, 4, including the stale-booking guard), 4 (Task 4 + VOID threshold unit test in Task 1), 5 (Task 4), 6 (Tasks 1, 2), 7 (existing `BookingEventRepositoryTest` already persists every `BookingEventType`; no new test needed), 8 (Task 3), 9 (file structure and notes).
- Placeholders: none, except the explicit instruction in Task 1 Step 2 to build `BookingEmiConfig` the way `BookingServiceTest` does (the mock lines shown are replaced by that construction).
- Type consistency: `cancelBooking(UUID, CancelBookingRequest, UUID)` used identically in service, controller, and all tests; `CancelBookingRequest(String reason)`.
