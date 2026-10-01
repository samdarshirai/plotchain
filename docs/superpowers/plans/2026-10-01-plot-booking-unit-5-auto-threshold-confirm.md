# Plot Booking Unit 5 — AUTO_THRESHOLD Confirms the Booking Inside the Pay Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the global `booking_emi_config` rule is `AUTO_THRESHOLD` and, after a payment, paid% (sum of `PAID` installment amounts / `booking.total_amount`) >= `confirmThresholdPercent`, `recordPayment` confirms the booking in the same transaction and returns a `BookingResponse` with status `CONFIRMED`.

**Architecture:** Fill the empty package-private seam `BookingService.afterInstallmentPaid(booking, installments, actorId)` (unit 2). It reads the current global config singleton, evaluates the threshold with exact `BigDecimal` math, and calls unit 4's `confirmLocked(booking, actorId)`. No new endpoint, DTO, migration, exception or controller change; the only production file touched is `BookingService.java`, and only inside the seam plus one private helper. Atomicity comes for free from `recordPayment`'s existing `@Transactional`; this plan's job is to prove it on the real DB.

**Tech Stack:** Spring Boot 3.3.4 (so `@SpyBean`, NOT `@MockitoSpyBean`), JPA/Hibernate, Flyway (H2 in tests), JUnit 5, Mockito, AssertJ.

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decisions 1, 2, 8; Flow "Record payment" last sentence; Open items; Testing "auto-threshold"; Resolved decisions #3 and #6). Unit queue: `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (unit 5 + "Carry-forward notes"). Prior plans: `2026-10-01-plot-booking-unit-2-pay-installment.md`, `2026-10-01-plot-booking-unit-4-manual-confirm.md`.

## Global Constraints

- Rule/threshold come from the **current** global `booking_emi_config` singleton (`BookingEmiConfigRepository.findBySingletonGuardTrue()`) at pay time. No per-booking snapshot, not per-project (Resolved decision #3).
- Condition: `AUTO_THRESHOLD` and paid% >= `confirmThresholdPercent`. Under `MANUAL`, paying never auto-confirms (Decision 1). Manual confirm (unit 4) is untouched and still never reads the config.
- Auto-confirm = unit 4's confirm flow (`confirmLocked`), inside the same transaction as the pay. If confirm fails, the payment rolls back too.
- Auto-confirm writes both a `PAID` and a `CONFIRMED` `booking_event` (Resolved decision #6).
- Lock order is **booking row, then plot row**, never the reverse (Decision 8). `recordPayment` holds only the booking lock (`findByIdForUpdate`, first statement); `confirmLocked` takes the plot lock itself. Do not add a plot lock anywhere else.
- Paid% math is exact `BigDecimal`: `paid * 100 >= total * threshold` via `compareTo`. No `double`, no division.
- Pay response is the updated `BookingResponse` (status `CONFIRMED` when auto-confirmed).
- No `SecurityConfig` change, no new route (pay endpoint and its 403/401 matrix are unit 2's).
- `booking -> sales` is the only allowed package direction; do not import `booking` from `sales`.
- Backend-only. Do NOT edit `docs/superpowers/plans/2026-10-01-plot-booking-units.md` (coordinator's job).
- Keep `BookingService` changes minimal: units 6-9 edit the same file later.

## Decisions made in this plan (spec was silent; flagged for the reviewer)

1. **Plot drift (plot no longer `BOOKED` when auto-confirm fires).** `confirmLocked` throws `booking.PlotNotAvailableException` (409) and the **whole pay rolls back** (installment stays `PENDING`, no `PAID` event). This follows the spec ("payment rolls back if confirm fails") and is deliberately accepted: it is data drift reachable only if an admin edited the plot status via plot CRUD while a booking was ACTIVE, and 409 surfaces it loudly instead of recording money against a booking that can never confirm. Consequence: until the plot is fixed, no further payment can be recorded on that booking once the threshold would be crossed. Pays that do not reach the threshold are unaffected. Tested at unit level (Task 1) and on the real DB (Task 2).
2. **Config row missing -> `IllegalStateException`** (500), the same message as `createBooking`. The V14 migration seeds the row and `singleton_guard` makes a second one impossible, so this is unreachable in practice; silent skip would hide misconfiguration. Requires existing `recordPayment` success-path unit tests to stub a `MANUAL` config (Task 1, Step 1).
3. **`KYC_GATED`** (allowed by the DB CHECK, not in this spec) never auto-confirms; only the literal `"AUTO_THRESHOLD"` does.
4. **Defensive threshold guard:** under `AUTO_THRESHOLD`, a `null` or `<= 0` threshold means "no auto-confirm" (not an error, so payment recording is never blocked by a bad config row). `BookingEmiConfigService` already rejects such a config at write time; the guard is belt-and-braces. A threshold `> 100` is accepted by the config service and simply never reached (paid can't exceed total); pinned by a test, not changed.
5. **Config changes are not retroactive.** Changing the rule/threshold does not confirm existing bookings; the next payment on a booking evaluates the then-current config (so a booking already above a newly lowered threshold confirms on its next pay). Pinned by a real-DB test.
6. **Numerator** = every installment currently `PAID` (earlier payments plus the one just recorded), not just the new one. `recordPayment` mutates the very `EmiInstallment` object that sits in the `installments` list passed to the seam, so the just-paid row is already `PAID` in that list; no re-query.
7. **Event ordering:** `PAID` and `CONFIRMED` are written in that order but both take `clock.instant()`, so `created_at` may tie. Tests assert one of each, never their relative order.
8. **Actor** of the auto `CONFIRMED` event = the admin who recorded the payment (`actorId` threaded through the seam).

## Review Focus

- Paid% off-by-one-cent / rounding: 299999.99 of 600000.00 at 50% must NOT confirm, 300000.01 must (Task 1 boundary tests; Task 2 real-DB cent test).
- Threshold 100% with a booking whose last installment absorbed rounding (e.g. 3 installments of a price not divisible by 3): must confirm exactly when the last installment is paid (Task 2 `confirmsAtOneHundredPercent...`).
- Pay that crosses the threshold while the plot has drifted: payment must not be half-recorded (Task 2 drift test).
- Two admins paying different installments of one booking simultaneously, each alone below the threshold but together over it: lost-update would leave the booking `ACTIVE` forever (Task 3 race test).
- Pay racing a manual confirm: exactly one Sale, loser gets 409 not a unique-index/plot error (Task 3).
- Global config left mutated by a test leaking into other test classes sharing the H2 context (Task 2 fixture restores the row in `@AfterEach`).

## Lock-ordering audit (verified against the code)

- `recordPayment`: `plotBookingRepository.findByIdForUpdate(bookingId)` is its first statement, then installments, then (via the seam) `confirmLocked`, whose first statement is `plotRepository.findByIdForUpdate(plotId)`. Booking -> plot, same as `confirmBooking`.
- `createBooking` locks plot first but only inserts a brand-new booking nobody else can reference, so it cannot invert (unit 4 audit).
- The config read (`findBySingletonGuardTrue`) is a plain, unlocked read of a row nothing locks; it cannot deadlock.
- Future cancel (unit 6) must stay booking -> plot.

## File Structure

- Modify `backend/src/main/java/com/plotchain/booking/BookingService.java` — fill `afterInstallmentPaid`, add private `thresholdReached`.
- Modify `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java` — stub `MANUAL` config in existing success-path pay tests; add auto-threshold unit tests.
- Create `backend/src/test/java/com/plotchain/booking/BookingAutoConfirmIntegrationTest.java` — real-DB: confirm at/below threshold, both events, rollback via `@SpyBean`, drift, config change, already-CONFIRMED, races.

No other file changes (verified in Task 4).

## Running tests (read first)

Run everything from the **worktree's** `backend` directory (`<worktree>/backend`), never the main checkout:

```bash
cd <worktree>/backend && mvn -q -Dtest=BookingServiceTest test
```

Environment noise: a full `mvn test` shows ~55 spurious Mockito errors (JDK21/25 mismatch) and 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Targeted classes run clean; last known count on master is 324 tests. Judge this unit by the targeted `-Dtest=` runs below, not a full run. Per project convention do not mark the unit merged in the tracking file; the coordinator does that.

---

### Task 1: Threshold decision in the `afterInstallmentPaid` seam (Mockito unit tests)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/booking/BookingService.java` (seam at the empty `afterInstallmentPaid`, plus one private method)
- Test: `backend/src/test/java/com/plotchain/booking/BookingServiceTest.java`

**Interfaces:**
- Consumes: `BookingEmiConfigRepository.findBySingletonGuardTrue(): Optional<BookingEmiConfig>`; `BookingEmiConfig.getConfirmRule(): String`, `getConfirmThresholdPercent(): Integer`; existing `sumByStatus(List<EmiInstallment>, InstallmentStatus)`; unit 4's `confirmLocked(PlotBooking, UUID)`.
- Produces: `void afterInstallmentPaid(PlotBooking booking, List<EmiInstallment> installments, UUID actorId)` now confirms when the rule/threshold says so (signature unchanged).

- [ ] **Step 1: Make existing success-path pay tests config-aware, add fixtures, write the failing tests**

In `BookingServiceTest`, add a fixture next to `emiConfig(...)` (reuse `emiConfig`'s style; `BookingEmiConfig` has setters for rule and threshold):

```java
private void stubConfig(String rule, Integer threshold) {
    BookingEmiConfig config = new BookingEmiConfig();
    config.setConfirmRule(rule);
    config.setConfirmThresholdPercent(threshold);
    when(bookingEmiConfigRepository.findBySingletonGuardTrue()).thenReturn(Optional.of(config));
}

// 4 installments of 150000.00 against the fixture total of 600000.00, first `paid` already PAID
// (the one under test is passed PENDING by the caller via the index).
private EmiInstallment[] fourInstallments(InstallmentStatus... statuses) {
    EmiInstallment[] rows = new EmiInstallment[4];
    for (int n = 1; n <= 4; n++) {
        rows[n - 1] = installment(n, "150000.00", LocalDate.of(2026, 6 + n, 15), statuses[n - 1]);
    }
    return rows;
}
```

Existing `recordPayment` tests that reach the seam (the ones asserting a successful pay: `recordPaymentMarksInstallmentPaid...`, `recordPaymentUsesSuppliedPaidAt...`, `recordPaymentAcceptsAPaidAtLaterThanTheClock`, `recordPaymentDoesNotRequireEarlierInstallmentsToBePaid`, `recordPaymentOnAPastDueInstallmentClearsItsOverdueFlag`) must now call `stubConfig("MANUAL", null);` as their first line. Error-path tests (404/409/400) never reach the seam and must NOT get the stub (strict stubs would fail them).

Add the new tests (imports needed, skip any already present: `org.mockito.InOrder`, `static org.mockito.Mockito.inOrder`, `static org.mockito.Mockito.never`, `static org.mockito.Mockito.verifyNoInteractions`, `static org.mockito.ArgumentMatchers.eq`, `org.mockito.ArgumentCaptor`; `PlotStatus`, `SaleResponse` and the `plotWithStatus(...)`, `saleResponse(...)` helpers already exist from unit 4):

```java
private PlotBooking lockedAutoBooking(EmiInstallment... installments) {
    PlotBooking booking = lockedBookingWith(installments);
    return booking;
}

private void stubPlotAndSale(PlotStatus plotStatus, UUID saleId) {
    when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(plotStatus)));
    when(saleService.recordConfirmedBooking(any(), any(), any(), any(), any(), any()))
        .thenReturn(saleResponse(saleId));
}

@Test
void autoThresholdAtExactlyTheThresholdConfirmsInTheSameCallAndWritesPaidThenConfirmedEvents() {
    stubConfig("AUTO_THRESHOLD", 50);
    UUID saleId = UUID.randomUUID();
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PAID, InstallmentStatus.PENDING,
        InstallmentStatus.PENDING, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);
    stubPlotAndSale(PlotStatus.BOOKED, saleId);

    BookingResponse response = bookingService.recordPayment(booking.getId(), 2, pay("150000.00"), ACTOR_ID);

    // 150000 (prior) + 150000 (just paid) = 300000 = 50% of 600000: the just-paid row counts.
    assertThat(booking.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
    assertThat(booking.getSaleId()).isEqualTo(saleId);
    assertThat(response.status()).isEqualTo(BookingStatus.CONFIRMED);
    assertThat(response.paidAmount()).isEqualByComparingTo("300000.00");
    ArgumentCaptor<BookingEvent> events = ArgumentCaptor.forClass(BookingEvent.class);
    verify(bookingEventRepository, org.mockito.Mockito.times(2)).save(events.capture());
    assertThat(events.getAllValues()).extracting(BookingEvent::getType)
        .containsExactlyInAnyOrder(BookingEventType.PAID, BookingEventType.CONFIRMED);
    assertThat(events.getAllValues()).allMatch(e -> ACTOR_ID.equals(e.getActorId()));
}

@Test
void autoThresholdBelowTheThresholdDoesNotConfirmAndNeverTouchesPlotOrSale() {
    stubConfig("AUTO_THRESHOLD", 50);
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PENDING, InstallmentStatus.PENDING,
        InstallmentStatus.PENDING, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);

    BookingResponse response = bookingService.recordPayment(booking.getId(), 1, pay("150000.00"), ACTOR_ID);

    assertThat(booking.getStatus()).isEqualTo(BookingStatus.ACTIVE);
    assertThat(response.status()).isEqualTo(BookingStatus.ACTIVE);
    verifyNoInteractions(plotRepository, saleService);
    verify(bookingEventRepository, org.mockito.Mockito.times(1)).save(any(BookingEvent.class)); // PAID only
}

@Test
void oneCentBelowTheThresholdDoesNotConfirmAndTheCentAboveDoes() {
    // total 600000.00 at 50% -> needs >= 300000.00
    stubConfig("AUTO_THRESHOLD", 50);
    EmiInstallment low = installment(1, "299999.99", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING);
    EmiInstallment high = installment(2, "300000.01", LocalDate.of(2026, 8, 15), InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(low, high);

    bookingService.recordPayment(booking.getId(), 1, pay("299999.99"), ACTOR_ID);
    assertThat(booking.getStatus()).isEqualTo(BookingStatus.ACTIVE);

    stubPlotAndSale(PlotStatus.BOOKED, UUID.randomUUID());
    PlotBooking booking2 = lockedAutoBooking(
        installment(1, "299999.99", LocalDate.of(2026, 7, 15), InstallmentStatus.PENDING),
        installment(2, "300000.01", LocalDate.of(2026, 8, 15), InstallmentStatus.PENDING));
    bookingService.recordPayment(booking2.getId(), 2, pay("300000.01"), ACTOR_ID);
    assertThat(booking2.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
}

@Test
void oneHundredPercentThresholdConfirmsOnlyWhenTheLastInstallmentIsPaid() {
    stubConfig("AUTO_THRESHOLD", 100);
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PAID, InstallmentStatus.PAID,
        InstallmentStatus.PAID, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);
    stubPlotAndSale(PlotStatus.BOOKED, UUID.randomUUID());

    bookingService.recordPayment(booking.getId(), 4, pay("150000.00"), ACTOR_ID);

    assertThat(booking.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
}

@Test
void oneHundredPercentThresholdDoesNotConfirmWithOneInstallmentStillPending() {
    stubConfig("AUTO_THRESHOLD", 100);
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PAID, InstallmentStatus.PAID,
        InstallmentStatus.PENDING, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);

    bookingService.recordPayment(booking.getId(), 3, pay("150000.00"), ACTOR_ID);

    assertThat(booking.getStatus()).isEqualTo(BookingStatus.ACTIVE);
}

@Test
void onePercentThresholdConfirmsOnTheFirstPayment() {
    stubConfig("AUTO_THRESHOLD", 1);
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PENDING, InstallmentStatus.PENDING,
        InstallmentStatus.PENDING, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);
    stubPlotAndSale(PlotStatus.BOOKED, UUID.randomUUID());

    bookingService.recordPayment(booking.getId(), 1, pay("150000.00"), ACTOR_ID);   // 25% >= 1%

    assertThat(booking.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
}

@Test
void thresholdAboveOneHundredIsNeverReachedEvenWhenFullyPaid() {
    stubConfig("AUTO_THRESHOLD", 101);
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PAID, InstallmentStatus.PAID,
        InstallmentStatus.PAID, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);

    bookingService.recordPayment(booking.getId(), 4, pay("150000.00"), ACTOR_ID);

    assertThat(booking.getStatus()).isEqualTo(BookingStatus.ACTIVE);
    verifyNoInteractions(plotRepository, saleService);
}

@Test
void manualAndKycGatedRulesNeverAutoConfirmEvenWhenFullyPaid() {
    for (String rule : List.of("MANUAL", "KYC_GATED")) {
        org.mockito.Mockito.reset(bookingEmiConfigRepository, plotBookingRepository, emiInstallmentRepository);
        stubConfig(rule, null);
        EmiInstallment[] rows = fourInstallments(InstallmentStatus.PAID, InstallmentStatus.PAID,
            InstallmentStatus.PAID, InstallmentStatus.PENDING);
        PlotBooking booking = lockedAutoBooking(rows);

        bookingService.recordPayment(booking.getId(), 4, pay("150000.00"), ACTOR_ID);

        assertThat(booking.getStatus()).as(rule).isEqualTo(BookingStatus.ACTIVE);
    }
    verifyNoInteractions(plotRepository, saleService);
}

@Test
void autoThresholdWithNullOrNonPositiveThresholdDoesNotConfirmAndDoesNotBlockThePayment() {
    for (Integer bad : new Integer[] {null, 0, -5}) {
        org.mockito.Mockito.reset(bookingEmiConfigRepository, plotBookingRepository, emiInstallmentRepository);
        stubConfig("AUTO_THRESHOLD", bad);
        EmiInstallment[] rows = fourInstallments(InstallmentStatus.PAID, InstallmentStatus.PAID,
            InstallmentStatus.PAID, InstallmentStatus.PENDING);
        PlotBooking booking = lockedAutoBooking(rows);

        BookingResponse response = bookingService.recordPayment(booking.getId(), 4, pay("150000.00"), ACTOR_ID);

        assertThat(response.status()).as("threshold " + bad).isEqualTo(BookingStatus.ACTIVE);
        assertThat(rows[3].getStatus()).isEqualTo(InstallmentStatus.PAID);
    }
    verifyNoInteractions(plotRepository, saleService);
}

@Test
void autoConfirmLocksTheBookingBeforeThePlot() {
    stubConfig("AUTO_THRESHOLD", 25);
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PENDING, InstallmentStatus.PENDING,
        InstallmentStatus.PENDING, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);
    stubPlotAndSale(PlotStatus.BOOKED, UUID.randomUUID());

    bookingService.recordPayment(booking.getId(), 1, pay("150000.00"), ACTOR_ID);

    InOrder order = inOrder(plotBookingRepository, plotRepository);
    order.verify(plotBookingRepository).findByIdForUpdate(booking.getId());
    order.verify(plotRepository).findByIdForUpdate(PLOT_ID);
}

@Test
void autoConfirmOnAPlotThatIsNoLongerBookedThrowsPlotNotAvailable() {
    stubConfig("AUTO_THRESHOLD", 25);
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PENDING, InstallmentStatus.PENDING,
        InstallmentStatus.PENDING, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);
    when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.AVAILABLE)));

    assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("150000.00"), ACTOR_ID))
        .isInstanceOf(PlotNotAvailableException.class);

    verifyNoInteractions(saleService);     // fails fast; rollback itself is proven on the real DB in Task 2
}

@Test
void aSaleFailureDuringAutoConfirmPropagatesSoTheTransactionRollsBack() {
    stubConfig("AUTO_THRESHOLD", 25);
    EmiInstallment[] rows = fourInstallments(InstallmentStatus.PENDING, InstallmentStatus.PENDING,
        InstallmentStatus.PENDING, InstallmentStatus.PENDING);
    PlotBooking booking = lockedAutoBooking(rows);
    when(plotRepository.findByIdForUpdate(PLOT_ID)).thenReturn(Optional.of(plotWithStatus(PlotStatus.BOOKED)));
    when(saleService.recordConfirmedBooking(any(), any(), any(), any(), any(), any()))
        .thenThrow(new IllegalStateException("simulated sale failure"));

    assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("150000.00"), ACTOR_ID))
        .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulated");
}

@Test
void payOnANonActiveBookingIs409AndNeverReadsConfigOrConfirms() {
    PlotBooking booking = bookingWithBuyer();
    booking.setStatus(BookingStatus.CONFIRMED);
    when(plotBookingRepository.findByIdForUpdate(booking.getId())).thenReturn(Optional.of(booking));

    assertThatThrownBy(() -> bookingService.recordPayment(booking.getId(), 1, pay("1"), ACTOR_ID))
        .isInstanceOf(BookingNotActiveException.class);

    verifyNoInteractions(bookingEmiConfigRepository, plotRepository, saleService, bookingEventRepository);
}
```

(`PlotNotAvailableException` and `BookingNotActiveException` are in package `com.plotchain.booking`, no import needed.)

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingServiceTest test`
Expected: FAIL. The at-threshold, 100%, 1% and lock-order tests fail (nothing confirms yet); the below-threshold/MANUAL tests may pass trivially, and the stubbed-but-unused `findBySingletonGuardTrue` stubs fail with `UnnecessaryStubbingException` (the config is not read yet). Both are the expected red.

- [ ] **Step 3: Implement the seam**

In `BookingService.java`, replace the empty `afterInstallmentPaid` body (keep its signature and package-private visibility) and update its comment:

```java
    // Unit 5: AUTO_THRESHOLD auto-confirm (spec Decision 1, Flow "Record payment"). Runs inside
    // recordPayment's locked transaction, after the PAID event and before the response is built, so
    // the response reflects a CONFIRMED booking. Holds only the booking lock; confirmLocked takes the
    // plot lock itself (booking -> plot, Decision 8). Any failure in confirmLocked propagates and
    // rolls the whole pay back (installment write + PAID event included).
    // Config is read fresh from the global singleton every call (Resolved decision #3): no snapshot.
    void afterInstallmentPaid(PlotBooking booking, List<EmiInstallment> installments, UUID actorId) {
        BookingEmiConfig config = bookingEmiConfigRepository.findBySingletonGuardTrue()
            .orElseThrow(() -> new IllegalStateException(
                "booking_emi_config row missing - V14 migration seeds it"));
        if (thresholdReached(booking, installments, config)) {
            confirmLocked(booking, actorId);
        }
    }

    // `installments` already contains the just-paid row as PAID (recordPayment mutates the same
    // object that is in this list). Exact math, no division: paid/total >= threshold/100
    // <=> paid*100 >= total*threshold. Only the literal AUTO_THRESHOLD rule qualifies (MANUAL and
    // KYC_GATED never auto-confirm); a null/<=0 threshold never confirms rather than blocking the pay.
    private boolean thresholdReached(PlotBooking booking, List<EmiInstallment> installments,
                                     BookingEmiConfig config) {
        if (!"AUTO_THRESHOLD".equals(config.getConfirmRule())) {
            return false;
        }
        Integer threshold = config.getConfirmThresholdPercent();
        BigDecimal total = booking.getTotalAmount();
        if (threshold == null || threshold <= 0 || total.signum() <= 0) {
            return false;
        }
        BigDecimal paid = sumByStatus(installments, InstallmentStatus.PAID);
        return paid.multiply(BigDecimal.valueOf(100))
            .compareTo(total.multiply(BigDecimal.valueOf(threshold))) >= 0;
    }
```

`BookingEmiConfig` is already imported in this file.

- [ ] **Step 4: Run to verify the tests pass**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingServiceTest test`
Expected: PASS (all existing + new). If an old success-path pay test fails with "booking_emi_config row missing", it is missing its `stubConfig("MANUAL", null)` line (Step 1).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/booking/BookingService.java backend/src/test/java/com/plotchain/booking/BookingServiceTest.java
git commit -m "feat(booking): AUTO_THRESHOLD confirms inside recordPayment via afterInstallmentPaid (unit 5)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Real-DB proof — confirm at/below threshold, both events, atomic rollback, drift, config change

**Files:**
- Create: `backend/src/test/java/com/plotchain/booking/BookingAutoConfirmIntegrationTest.java`
- (Temporarily mutate `BookingService.java` for the mutation check; revert before commit.)

**Interfaces:**
- Consumes: `BookingService.createBooking(CreateBookingRequest)`, `recordPayment(UUID, int, RecordPaymentRequest, UUID)`, `confirmBooking(UUID, UUID)`; `BookingResponse.id()/status()/paidAmount()/installments()` (`EmiInstallmentResponse.installmentNumber()/amount()`); `BookingEventRepository` (as `@SpyBean`), `BookingEventType`; `PlotNotAvailableException`.
- Produces: the test class and its helpers (`setConfig`, `seedBooking`, `payInstallment`) that Task 3 extends in the same file.

The global `booking_emi_config` singleton is shared mutable state across every `@SpringBootTest` class (one cached context, one H2). This class saves the row in `@BeforeEach` and restores it in `@AfterEach`; never leave it changed.

- [ ] **Step 1: Write the test class with the fixtures and the failing tests**

```java
package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
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
import org.junit.jupiter.api.BeforeEach;
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
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;

// Real-DB (H2 via Flyway) proof for plot-booking unit 5: AUTO_THRESHOLD confirms inside recordPayment.
// Harness mirrors BookingConfirmIntegrationTest (committed rows, manual cleanup, circular sale<->booking
// FKs nulled first) plus save/restore of the global booking_emi_config singleton.
@SpringBootTest
@ActiveProfiles("test")
class BookingAutoConfirmIntegrationTest {

    @Autowired BookingService bookingService;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlotBookingRepository plotBookingRepository;
    @Autowired EmiInstallmentRepository emiInstallmentRepository;
    // Pass-through spy (reset by Spring after each test) so one test can make the CONFIRMED event write
    // fail AFTER the PAID write, the sale insert and the plot flip. Boot 3.3.4: @SpyBean.
    @SpyBean BookingEventRepository bookingEventRepository;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired JdbcTemplate jdbc;

    private UUID plotId;
    private UUID projectId;
    private UUID associateId;
    private Map<String, Object> originalConfig;

    @BeforeEach
    void saveConfig() {
        originalConfig = jdbc.queryForMap(
            "SELECT emi_enabled, default_installment_count, confirm_rule, confirm_threshold_percent FROM booking_emi_config");
    }

    @AfterEach
    void cleanUp() {
        jdbc.update("UPDATE booking_emi_config SET emi_enabled = ?, default_installment_count = ?, "
                + "confirm_rule = ?, confirm_threshold_percent = ?, updated_at = CURRENT_TIMESTAMP",
            originalConfig.get("EMI_ENABLED"), originalConfig.get("DEFAULT_INSTALLMENT_COUNT"),
            originalConfig.get("CONFIRM_RULE"), originalConfig.get("CONFIRM_THRESHOLD_PERCENT"));
        if (associateId != null) {
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
        if (projectId != null) projectRepository.deleteById(projectId);
        if (associateId != null) associateRepository.deleteById(associateId);
    }

    // Plot price is 600000.00. With emiEnabled=true and count=4 every installment is 150000.00.
    private void setConfig(boolean emiEnabled, int count, String rule, Integer threshold) {
        jdbc.update("UPDATE booking_emi_config SET emi_enabled = ?, default_installment_count = ?, "
                + "confirm_rule = ?, confirm_threshold_percent = ?, updated_at = CURRENT_TIMESTAMP",
            emiEnabled, count, rule, threshold);
    }

    private UUID seedAvailablePlot() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            Project project = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
            projectRepository.saveAndFlush(project);
            projectId = project.getId();
            Plot plot = new Plot(UUID.randomUUID(), project.getId(), "A-101", PlotType.NORMAL,
                new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
                PlotStatus.AVAILABLE);
            plotRepository.saveAndFlush(plot);
            return plot.getId();
        });
    }

    private UUID seedAssociate() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            UUID id = UUID.randomUUID();
            Associate associate = new Associate();
            associate.setId(id);
            associate.setPosition("L");
            associate.setName("Test Associate");
            associate.setKycStatus(KycStatus.VERIFIED);
            associate.setJoinedAt(Instant.now());
            associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
            associate.setUserId("u-" + id);
            associate.setEmail(id + "@test.local");
            associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
            // ADMIN, not ASSOCIATE: chk_associate_rank_required (V4) demands a rank_id for ASSOCIATE rows;
            // this row is also the FK-satisfying actor.
            associate.setRole(AssociateRole.ADMIN);
            associateRepository.saveAndFlush(associate);
            return id;
        });
    }

    private void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    // Config MUST be set before this: the schedule is generated from the config at booking time.
    private BookingResponse seedBooking() {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();
        return bookingService.createBooking(new CreateBookingRequest(plotId, associateId, "Jane Buyer", null));
    }

    private BookingResponse payInstallment(BookingResponse b, int n) {
        BigDecimal amount = b.installments().get(n - 1).amount();
        return bookingService.recordPayment(b.id(), n, new RecordPaymentRequest(amount, "UTR-" + n, null), associateId);
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private String bookingStatus(UUID id) {
        return jdbc.queryForObject("SELECT status FROM plot_booking WHERE id = ?", String.class, id);
    }

    private String plotStatus() {
        return jdbc.queryForObject("SELECT status FROM plot WHERE id = ?", String.class, plotId);
    }

    // ---- confirm / not confirm -------------------------------------------------------------------

    @Test
    void payCrossingTheThresholdConfirmsInTheSameCallWithLinkedSaleSoldPlotAndBothEvents() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();

        BookingResponse first = payInstallment(b, 1);                // 25%: below
        assertThat(first.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(plotStatus()).isEqualTo("BOOKED");

        BookingResponse second = payInstallment(b, 2);               // 50%: at threshold exactly

        assertThat(second.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(second.paidAmount()).isEqualByComparingTo("300000.00");
        assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(2);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED' AND actor_id = ?",
            b.id(), associateId)).isEqualTo(1);
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("CONFIRMED_AT")).isNotNull();
        assertThat(row.get("SALE_ID")).isNotNull();
    }

    @Test
    void payBelowTheThresholdDoesNotConfirm() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();

        BookingResponse after = payInstallment(b, 1);

        assertThat(after.status()).isEqualTo(BookingStatus.ACTIVE);
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id())).isZero();
    }

    @Test
    void underManualPayingEveryInstallmentNeverAutoConfirms() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();

        for (int n = 1; n <= 4; n++) payInstallment(b, n);

        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isZero();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(4);
        // admin can still confirm manually afterwards (unit 4), proving MANUAL left it ACTIVE, not stuck
        assertThat(bookingService.confirmBooking(b.id(), associateId).status()).isEqualTo(BookingStatus.CONFIRMED);
    }

    @Test
    void oneHundredPercentThresholdConfirmsOnlyOnTheLastPaymentEvenWithRoundingInTheLastInstallment() {
        setConfig(true, 7, "AUTO_THRESHOLD", 100);       // 600000/7 does not divide: last installment absorbs the remainder
        BookingResponse b = seedBooking();

        for (int n = 1; n < 7; n++) {
            assertThat(payInstallment(b, n).status()).as("after installment " + n).isEqualTo(BookingStatus.ACTIVE);
        }
        BookingResponse last = payInstallment(b, 7);

        assertThat(last.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(last.paidAmount()).isEqualByComparingTo("600000.00");
    }

    @Test
    void onePercentThresholdConfirmsOnTheFirstPayment() {
        setConfig(true, 4, "AUTO_THRESHOLD", 1);
        BookingResponse b = seedBooking();

        assertThat(payInstallment(b, 1).status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
    }

    // ---- config is read at pay time, not snapshotted --------------------------------------------

    @Test
    void theRuleAndThresholdInForceAtPayTimeApplyNotThoseAtBookingCreation() {
        setConfig(true, 4, "MANUAL", null);
        BookingResponse b = seedBooking();                 // created under MANUAL
        payInstallment(b, 1);
        payInstallment(b, 2);                              // 50% paid, still ACTIVE under MANUAL
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");

        setConfig(true, 4, "AUTO_THRESHOLD", 50);          // switching is NOT retroactive...
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");

        BookingResponse after = payInstallment(b, 3);      // ...the next pay evaluates the current config: 75% >= 50%

        assertThat(after.status()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
    }

    @Test
    void raisingTheThresholdBetweenPaymentsDefersTheConfirm() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        setConfig(true, 4, "AUTO_THRESHOLD", 100);         // raised before the pay that would have hit 50%

        assertThat(payInstallment(b, 2).status()).isEqualTo(BookingStatus.ACTIVE);
        payInstallment(b, 3);
        assertThat(payInstallment(b, 4).status()).isEqualTo(BookingStatus.CONFIRMED);
    }

    // ---- atomicity ------------------------------------------------------------------------------

    // The CONFIRMED event write fails AFTER the installment is PAID, the PAID event is written, the sale +
    // ledger rows are inserted and the plot is flipped to SOLD, so only the surrounding transaction can
    // undo all of it.
    @Test
    void aFailureInTheConfirmStepRollsBackThePaymentTheSaleAndThePlotFlip() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);                              // committed, below threshold
        doThrow(new IllegalStateException("simulated confirm failure"))
            .when(bookingEventRepository).save(argThat(e -> e.getType() == BookingEventType.CONFIRMED));

        assertThatThrownBy(() -> payInstallment(b, 2))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("simulated");

        // fresh JDBC reads (no persistence context involved)
        assertThat(jdbc.queryForObject(
            "SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 2",
            String.class, b.id())).isEqualTo("PENDING");
        assertThat(jdbc.queryForObject(
            "SELECT payment_ref FROM emi_installment WHERE booking_id = ? AND installment_number = 2",
            String.class, b.id())).isNull();
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id()))
            .isEqualTo(1);                                  // only installment 1's
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id()))
            .isZero();
        assertThat(plotStatus()).isEqualTo("BOOKED");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", associateId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM ledger_entry WHERE associate_id = ?", associateId)).isZero();
        Map<String, Object> row = jdbc.queryForMap(
            "SELECT status, confirmed_at, sale_id FROM plot_booking WHERE id = ?", b.id());
        assertThat(row.get("STATUS")).isEqualTo("ACTIVE");
        assertThat(row.get("CONFIRMED_AT")).isNull();
        assertThat(row.get("SALE_ID")).isNull();
    }

    // Decision 1 (this plan): plot drift makes the auto-confirm fail with 409 and the pay rolls back too.
    // Unlike unit 4's drift test this one writes the installment and PAID event BEFORE the failure, so it
    // also proves rollback.
    @Test
    void autoConfirmOnADriftedPlotIs409AndTheWholePayRollsBack() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        jdbc.update("UPDATE plot SET status = 'AVAILABLE' WHERE id = ?", plotId);   // drift

        assertThatThrownBy(() -> payInstallment(b, 2)).isInstanceOf(PlotNotAvailableException.class);

        assertThat(jdbc.queryForObject(
            "SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 2",
            String.class, b.id())).isEqualTo("PENDING");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(1);
        assertThat(bookingStatus(b.id())).isEqualTo("ACTIVE");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE associate_id = ?", associateId)).isZero();
        assertThat(plotStatus()).isEqualTo("AVAILABLE");   // untouched by the failed pay
        // a pay that does NOT cross the threshold still works on a drifted plot (documented consequence)
        setConfig(true, 4, "AUTO_THRESHOLD", 100);
        assertThat(payInstallment(b, 2).status()).isEqualTo(BookingStatus.ACTIVE);
    }

    // ---- already confirmed ----------------------------------------------------------------------

    @Test
    void payingAnAlreadyConfirmedBookingIs409AndNeverConfirmsTwice() {
        setConfig(true, 4, "AUTO_THRESHOLD", 50);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);
        payInstallment(b, 2);                              // auto-confirmed here

        assertThatThrownBy(() -> payInstallment(b, 3)).isInstanceOf(BookingNotActiveException.class);

        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject(
            "SELECT status FROM emi_installment WHERE booking_id = ? AND installment_number = 3",
            String.class, b.id())).isEqualTo("PENDING");
    }
}
```

Note on column keys: H2 returns upper-case column names from `queryForMap` (as in the existing `BookingConfirmIntegrationTest`, which uses lower-case keys because `JdbcTemplate`'s `ColumnMapRowMapper` map is case-insensitive). If a key lookup returns null unexpectedly, the map is case-insensitive in Spring's `LinkedCaseInsensitiveMap`, so either case works; keep one style per file.

- [ ] **Step 2: Run to verify the right tests fail**

If Task 1 is already implemented, this class passes immediately. To observe red, first stash the implementation: `git stash push backend/src/main/java/com/plotchain/booking/BookingService.java`, run, then `git stash pop`.

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingAutoConfirmIntegrationTest test`
Expected with the seam empty (stashed): `payCrossingTheThreshold...`, `oneHundredPercent...`, `onePercent...`, `theRuleAndThreshold...`, `raisingTheThreshold...` (last assertion), `aFailureInTheConfirmStep...` (no exception thrown), `autoConfirmOnADriftedPlot...`, `payingAnAlreadyConfirmed...` FAIL; `payBelow...` and `underManual...` PASS.

- [ ] **Step 3: Run with the Task 1 implementation in place**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingAutoConfirmIntegrationTest test`
Expected: PASS (all tests in the class).

- [ ] **Step 4: Mutation check — atomicity (REQUIRED, then revert)**

Removing `@Transactional` alone breaks every test for the wrong reason (`findByIdForUpdate` is `PESSIMISTIC_WRITE` and throws `TransactionRequiredException` outside a transaction). Do what unit 4's honest mutation did:

1. In `BookingService.recordPayment`, delete `@Transactional` AND change `plotBookingRepository.findByIdForUpdate(bookingId)` to `plotBookingRepository.findById(bookingId)`.
2. In `confirmLocked`, change `plotRepository.findByIdForUpdate(lockedBooking.getPlotId())` to `plotRepository.findById(lockedBooking.getPlotId())`.
3. Run `cd <worktree>/backend && mvn -q -Dtest=BookingAutoConfirmIntegrationTest#aFailureInTheConfirmStepRollsBackThePaymentTheSaleAndThePlotFlip+autoConfirmOnADriftedPlotIs409AndTheWholePayRollsBack test`.
   Expected: BOTH FAIL on a rollback assertion (installment 2 is `PAID`, a second `PAID` event exists, and for the spy test also a sale row / plot `SOLD`), not on a `TransactionRequiredException`. If the failure message is `TransactionRequiredException`, a lock call was missed; fix the mutation until the failure is an assertion about persisted state.
4. `git checkout -- backend/src/main/java/com/plotchain/booking/BookingService.java` (this reverts to the last commit, i.e. Task 1's committed version) and re-run the two tests: PASS. Record the failing assertion messages in the commit/PR notes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingAutoConfirmIntegrationTest.java
git commit -m "test(booking): real-DB proof that auto-confirm is atomic with the pay, honours drift and config changes (unit 5)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Concurrency — pay vs manual confirm, and two pays straddling the threshold

**Files:**
- Modify: `backend/src/test/java/com/plotchain/booking/BookingAutoConfirmIntegrationTest.java` (append two tests; no new imports beyond those already in Task 2's file)

**Interfaces:**
- Consumes: Task 2's helpers `setConfig`, `seedBooking`, `payInstallment`, `count`, `bookingStatus`, `plotStatus`, `awaitQuietly`; `BookingService.confirmBooking`.
- Produces: nothing for later tasks.

Both tests rely on the booking row lock taken first in `recordPayment` and `confirmBooking`, so they serialize; the loser re-reads committed state after the winner commits.

- [ ] **Step 1: Write the tests**

Append inside the class:

```java
    // Single installment (EMI disabled) at 100%: the pay itself would auto-confirm, so pay and manual
    // confirm genuinely compete for the same confirm. The booking lock serializes them: the loser re-reads
    // the committed state and gets BookingNotActiveException (409), never a plot-lock or unique-index error.
    @Test
    void aPayRacingAManualConfirmYieldsExactlyOneSaleAndTheLoserGets409() throws Exception {
        setConfig(false, 1, "AUTO_THRESHOLD", 100);
        BookingResponse b = seedBooking();
        BigDecimal total = b.installments().get(0).amount();

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<BookingResponse> pay = pool.submit(() -> {
            awaitQuietly(start);
            return bookingService.recordPayment(b.id(), 1, new RecordPaymentRequest(total, "UTR-R", null), associateId);
        });
        Future<BookingResponse> confirm = pool.submit(() -> {
            awaitQuietly(start);
            return bookingService.confirmBooking(b.id(), associateId);
        });
        start.countDown();

        boolean payWon = true;
        boolean confirmWon = true;
        try {
            pay.get(10, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            assertThat(e.getCause()).isInstanceOf(BookingNotActiveException.class);
            payWon = false;
        }
        try {
            confirm.get(10, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            assertThat(e.getCause()).isInstanceOf(BookingNotActiveException.class);
            confirmWon = false;
        }
        pool.shutdownNow();

        assertThat(payWon ^ confirmWon).as("exactly one of pay/confirm wins").isTrue();
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id())).isEqualTo(1);
        assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        // state is consistent with who won: a losing pay left the installment PENDING and wrote no PAID event
        assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE booking_id = ?", String.class, b.id()))
            .isEqualTo(payWon ? "PAID" : "PENDING");
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id()))
            .isEqualTo(payWon ? 1 : 0);
    }

    // 4 installments, threshold 75%, installment 1 pre-paid (25%). Two admins pay installments 2 and 3 at
    // the same time. Alone, each leaves 50% (below 75%); together 75%. Because the booking lock serializes
    // them and the second pay re-reads installments AFTER the first commits, the second sees 75% and
    // confirms: both pays succeed and there is exactly one Sale. Without the lock (lost update) both would
    // see 50% and the booking would sit ACTIVE at 75% paid forever.
    @Test
    void twoPaysThatTogetherCrossTheThresholdConfirmExactlyOnceWithNoLostUpdate() throws Exception {
        setConfig(true, 4, "AUTO_THRESHOLD", 75);
        BookingResponse b = seedBooking();
        payInstallment(b, 1);

        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<BookingResponse>> results = new ArrayList<>();
        for (int n : new int[] {2, 3}) {
            results.add(pool.submit(() -> {
                awaitQuietly(start);
                return payInstallment(b, n);
            }));
        }
        start.countDown();
        for (Future<BookingResponse> f : results) {
            f.get(10, TimeUnit.SECONDS);                   // both succeed: neither is "already paid"/"not active"
        }
        pool.shutdownNow();

        assertThat(count("SELECT COUNT(*) FROM emi_installment WHERE booking_id = ? AND status = 'PAID'", b.id())).isEqualTo(3);
        assertThat(bookingStatus(b.id())).isEqualTo("CONFIRMED");
        assertThat(plotStatus()).isEqualTo("SOLD");
        assertThat(count("SELECT COUNT(*) FROM sale WHERE booking_id = ?", b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'CONFIRMED'", b.id())).isEqualTo(1);
        assertThat(count("SELECT COUNT(*) FROM booking_event WHERE booking_id = ? AND type = 'PAID'", b.id())).isEqualTo(3);
    }
```

- [ ] **Step 2: Run to verify they pass**

Run: `cd <worktree>/backend && mvn -q -Dtest=BookingAutoConfirmIntegrationTest test`
Expected: PASS. Run the two new tests 5 times in a row (`for i in 1 2 3 4 5; do mvn -q -Dtest='BookingAutoConfirmIntegrationTest#aPayRacing*+twoPaysThatTogether*' test || break; done`) to check they are not flaky; both must pass every time. If `aPayRacing...` ever reports `PlotNotAvailableException` as a cause, the booking lock is not serializing: stop and investigate rather than loosening the assertion.

- [ ] **Step 3: Mutation check — the booking lock is what serializes (REQUIRED, then revert)**

1. Keep `@Transactional`. In `recordPayment` change `plotBookingRepository.findByIdForUpdate(bookingId)` to `plotBookingRepository.findById(bookingId)`; do the same in `confirmBooking`. (The plot lock in `confirmLocked` stays, so the transaction is real and no `TransactionRequiredException` appears.)
2. Run the two race tests repeatedly (the loop in Step 2, 10 iterations).
   Expected: `twoPaysThatTogetherCross...` FAILS in at least one iteration (booking `ACTIVE` with 3 paid and no sale: the lost update) and/or `aPayRacingAManualConfirm...` FAILS (cause is a plot-lock `PlotNotAvailableException` or both "win"). The race is probabilistic without the lock; the guarantee being tested is the lock, so a mutated run that never fails in 10 iterations means the test is not racing: raise to `ExecutorService` threads started via the latch with a `Thread.yield()` loop, or increase iterations, before accepting the test.
3. `git checkout -- backend/src/main/java/com/plotchain/booking/BookingService.java` and re-run: PASS. Record the observed failures in the commit/PR notes.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/booking/BookingAutoConfirmIntegrationTest.java
git commit -m "test(booking): pay vs confirm and straddling pays serialize on the booking lock (unit 5)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Regression run, security/no-surface confirmation, final verification

**Files:** none modified (verification only). If a step fails, fix the cause in the file the failure names, not by loosening a test.

**Interfaces:** Consumes Tasks 1-3. Produces: evidence for the reviewer.

- [ ] **Step 1: Confirm the diff is minimal and touches no routes or security**

Run: `git diff --stat master...HEAD` (from the worktree)
Expected: exactly three files: `BookingService.java`, `BookingServiceTest.java`, `BookingAutoConfirmIntegrationTest.java`. No `SecurityConfig.java`, no `BookingController.java`, no migration, no DTO. Pay's route `PATCH /api/admin/bookings/{id}/installments/{n}/pay` is unit 2's and stays covered by its existing 403/401 cases in `SecurityConfigTest`; this unit adds no route, so Decision 12 needs no new matrix row.

- [ ] **Step 2: Run the touched and neighbouring booking/sales/config classes (targeted)**

```bash
cd <worktree>/backend && mvn -q -Dtest='BookingServiceTest,BookingAutoConfirmIntegrationTest,BookingConfirmIntegrationTest,BookingPaymentIntegrationTest,BookingConcurrencyTest,BookingControllerTest,SecurityConfigTest,BookingEmiConfig*Test,SaleServiceTest' test
```

Expected: PASS. `BookingPaymentIntegrationTest` and `BookingConfirmIntegrationTest` assume the seeded `MANUAL` config; if either fails with an unexpected auto-confirm, `BookingAutoConfirmIntegrationTest` leaked a config change (its `@AfterEach` restore must run) — fix the leak.

- [ ] **Step 3: Full-suite sanity (noise expected)**

Run: `cd <worktree>/backend && mvn test`
Expected: only the known noise: ~55 spurious Mockito errors (JDK21/25 mismatch) and the 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures. Test count rises from the last known 324 by the new unit tests plus 12 integration tests. Any other failure is this unit's regression.

- [ ] **Step 4: Report**

Hand back: commit range, the two mutation-check failure messages (Task 2 Step 4, Task 3 Step 3), and the list of "Decisions made in this plan" so the coordinator can record them. Do not edit `2026-10-01-plot-booking-units.md`.

---

## Self-review (done)

- **Spec coverage:** Decision 1 (Task 1 rule/threshold tests, Task 2 manual-under-MANUAL), Decision 2 (Task 2 linked sale), Decision 8 (lock-order unit test, Task 3 races), Flow last sentence (Tasks 1-2), Testing "auto-threshold at/below" (Task 1 + 2), Resolved #3 (Task 2 config-change tests), Resolved #6 (both events asserted Task 1 and 2), carry-forward (spy rollback test, Task 2 + mutation). Acceptance: response `CONFIRMED` asserted Tasks 1 and 2.
- **Placeholders:** none; every step has its code or exact command.
- **Type consistency:** `afterInstallmentPaid(PlotBooking, List<EmiInstallment>, UUID)`, `confirmLocked(PlotBooking, UUID)`, `RecordPaymentRequest(BigDecimal, String, Instant)`, `BookingResponse.status()/paidAmount()/installments()`, and test helpers `stubConfig`, `fourInstallments`, `lockedAutoBooking`, `stubPlotAndSale`, `setConfig`, `seedBooking`, `payInstallment` are used consistently.
- **Review Focus lines** each map to a test (rounding/cent: Task 1 + the 7-installment 100% test; drift: Task 2; straddling pays and pay-vs-confirm: Task 3; config leak: Task 2 fixture).
