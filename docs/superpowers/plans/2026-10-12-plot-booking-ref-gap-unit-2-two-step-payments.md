# Plot-booking reference-gap U2: two-step payments (enter -> confirm) Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes. TDD: red, green, next. Do NOT edit the units tracking file (coordinator does). Do NOT touch frontend, register filters, or discount (U3/U5/U6).

**Goal:** `recordPayment` only ENTERS a payment (PENDING -> ENTERED); a new admin-only `confirmPayment` / bulk `confirmPayments` moves ENTERED -> PAID and is the only thing that feeds Paid/Due, AUTO_THRESHOLD and the EMI report.

**Branch/base:** master at fb4b442 (U1 merged: `InstallmentStatus.ENTERED`, `BookingEventType.PAY_CONFIRMED`, `PaymentMode`, `EmiInstallment.confirmedAt/confirmedBy/paymentMode`, V45).

**Tech:** Spring Boot, JPA, Mockito (`@ExtendWith(MockitoExtension.class)`), real-DB `@SpringBootTest` integration tests, MockMvc. Run from `backend/`: `mvn test -Dtest=A,B`. JDK21 default works. Known pre-existing noise on master: 4 JwtServiceTest/SecretsEncryptionServiceTest failures, 5 CycleClose*IntegrationTest errors (ignore, do not "fix").

## Decisions (with the code facts they rest on)

1. **PR-visible semantic change:** `PATCH /api/admin/bookings/{id}/installments/{n}/pay` now ENTERS (status ENTERED, booking response paidAmount unchanged, no auto-confirm). Old behaviour (immediate PAID + threshold check) moves to `.../confirm`. Call out in the PR description.
2. **paymentMode is required** on `RecordPaymentRequest` (`@NotNull PaymentMode`). Invalid enum string -> Jackson parse error -> existing `ApiExceptionHandler` HttpMessageNotReadable -> 400 (verify in the controller test; if it is not 400, add nothing new, report). Breaking for the current frontend `pay()` caller (U5/U6 must send it) -> listed below.
3. **dueAmount bug to fix (not in the U2 brief, found in code):** `toResponses` (BookingService L495) computes `dueAmount = sumByStatus(PENDING)`. Once ENTERED exists, entering a payment would REDUCE due. Change to `PENDING + ENTERED`. `paidAmount` stays `sumByStatus(PAID)`. Invariant: paid + due = total for ACTIVE bookings (token is PAID).
4. **Overdue unchanged (PENDING only):** an ENTERED installment past its due date is NOT overdue (money was received; it awaits admin confirmation). `BookingOverdue`, the `toResponses` overdue flag (`status == PENDING && dueDate < today`), `PlotBookingRepository` overdue queries, `OverdueReportRow` are untouched. Document in a comment on `BookingOverdue`. Verified by grep: only `BookingOverdue` (PENDING) and `EmiInstallmentRepository.findEmiReport` (PAID) filter by status in JPQL; `BookingRegisterService` has no status sums.
5. **Security (verified, no SecurityConfig change):** `SecurityConfig` L290-296 blanket `POST|PATCH /api/**` -> `hasAuthority("ADMIN")`; there is no earlier POST/PATCH matcher covering `/api/admin/payments/**` or `/api/admin/bookings/*/installments/*` (earlier POST matchers are exact: cycles, withdrawals, sales, bookings, epins). The existing `adminBookingPayIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` test in `SecurityConfigTest` (L631) is the pattern. Keeping SecurityConfig untouched avoids a U3 merge conflict.
6. **Confirm allowed on ACTIVE or CONFIRMED bookings (owner decision Q1); CANCELLED -> 409 `BookingNotActiveException`.** `afterInstallmentPaid` (threshold auto-confirm) runs ONLY when the booking is ACTIVE, so a CONFIRMED booking never re-confirms and never gets a second Sale. This removes the stranded-ENTERED edge case.
7. **Bulk semantics:** one `@Transactional`; reject empty (400) and > 200 items (400) via bean validation; lock ALL distinct bookings first in ascending `bookingId` order (`findByIdForUpdate`), then process. Within a booking, mark all of its listed installments PAID first and call `afterInstallmentPaid` ONCE per booking at the end (otherwise the first item could auto-confirm the booking and the second item of the same booking would 409 on "not ACTIVE", failing a legitimate bulk). Missing booking/installment -> 404 (existing exceptions), not-ENTERED or booking-not-ACTIVE -> 409, message names the offending booking and installment. Duplicate items in one request -> 400 (explicit check up front; `IllegalArgumentException`-style via a new tiny exception mapped 400, or bean-validation-free check returning the existing `Map.of("error",...)` shape). Offending item = first in lock order (bookingId, installmentNumber), documented.
8. **Cancel:** ENTERED -> VOID alongside PENDING; PAID untouched; event detail gains `; unconfirmed payments voided: N` (N = count of ENTERED voided; omit nothing: always appended, N may be 0). `paid:` in the note stays PAID-only.
9. **Response additive fields:** `EmiInstallmentResponse` gains `PaymentMode paymentMode, Instant confirmedAt` with a retained 6-arg constructor (existing tests at BookingControllerTest L148 and AssociateBookingControllerTest L54 keep compiling). `BookingResponse` needs no change (installments carry it; paid/due semantics above).

## Files

| File | Change |
|---|---|
| `booking/RecordPaymentRequest.java` | add `@NotNull PaymentMode paymentMode` (4th component, before `paidAt`) |
| `booking/EmiInstallmentResponse.java` | add `paymentMode`, `confirmedAt` + 6-arg ctor |
| `booking/PaymentRef.java` (new) | `record PaymentRef(@NotNull UUID bookingId, @Min(1) int installmentNumber)` |
| `booking/ConfirmPaymentsRequest.java` (new) | `record(@NotEmpty @Size(max = 200) List<@Valid PaymentRef> items)` with `@Valid` on the list |
| `booking/InstallmentNotEnteredException.java` (new) | 409, message names booking + installment |
| `booking/DuplicatePaymentRefException.java` (new, tiny) | 400, names the duplicated item |
| `booking/BookingExceptionHandler.java` | two new `@ExceptionHandler`s |
| `booking/BookingService.java` | recordPayment, confirmPayment, confirmPayments, cancelBooking, toResponses |
| `booking/BookingController.java` | `confirmPayment` endpoint (booking-scoped) |
| `booking/AdminPaymentController.java` (new) | `POST /api/admin/payments/confirm` |
| `booking/BookingOverdue.java` | comment only |

Keep U2 diffs in BookingService localized to the methods above (U3 edits `createBooking` and register code later).

## Callers and tests to update (grep results)

Backend main: `BookingController.pay` -> `BookingService.recordPayment` (only caller).

Backend tests constructing `RecordPaymentRequest` / calling `recordPayment` (all need the new `paymentMode` arg, use `PaymentMode.CASH`, and revisit expectations):
- `BookingServiceTest` (37 hits, L580-L700 region, helper `pay(String)` at L580; L593/610/639/652 assert PAID -> now ENTERED; L867-926 `afterInstallmentPaid` threshold tests keep PAID rows and are unaffected)
- `BookingPaymentIntegrationTest` (8 hits; L137-215 and the lock test L216)
- `BookingAutoConfirmIntegrationTest` (helper L164 `pay(...)`, L381 race test; 13 tests all assume pay triggers threshold -> they must pay AND confirm)
- `BookingCancelIntegrationTest` (L166 helper, L501, L533)
- `BookingTransferIntegrationTest` (L173, L464)
- `BookingControllerTest` (L173-222 pay tests; `PAY_BODY` constant; L148 `EmiInstallmentResponse` 6-arg)
- `AssociateBookingControllerTest` (L54 `EmiInstallmentResponse`, unaffected thanks to the retained ctor)
- `SecurityConfigTest` (L631-646 pay body JSON must add `"paymentMode":"CASH"` or the ADMIN branch becomes 400 not 404)
- `BookingCancelServiceTest` (PAID/VOID cases, add ENTERED case)
- Not needing edits: `BookingConfirmIntegrationTest`, `BookingConcurrencyTest` (grep: no recordPayment use; manual confirm/create only), `BookingRegisterTestData`, `OverdueReportIntegrationTest`, `PlotBookingSchemaTest`, `ReportsRepositoryTest` (set statuses directly).

Frontend callers of PATCH `.../pay` (U5/U6 only, DO NOT edit here):
- `frontend/src/app/admin/admin-bookings-emi/bookings-emi.service.ts` L25-26 (`pay`) and `bookings-emi.service.spec.ts` L47-56
- `frontend/src/app/admin/admin-bookings-emi/booking-seal.component.ts` L283 and `booking-seal.component.spec.ts` L90, 118, 131 (spec at L118 flushes `status:'CONFIRMED'` after pay: obsolete semantics)
- `booking-seal.component.ts` L70 renders `PAID` paidAt only; ENTERED rows need i18n key `admin.bookingsEmi.installment.ENTERED` (U5).

## Tasks

### Task 1: Request/response shape (compile-level, no behaviour)

- [ ] Add `@NotNull PaymentMode paymentMode` to `RecordPaymentRequest` (order: amount, paymentRef, paymentMode, paidAt). Update the header comment.
- [ ] Add `paymentMode`, `confirmedAt` to `EmiInstallmentResponse` + 6-arg compatibility constructor (nulls).
- [ ] Create `PaymentRef`, `ConfirmPaymentsRequest`, `InstallmentNotEnteredException`, `DuplicatePaymentRefException`; add handlers (409 / 400, body `Map.of("error", ex.getMessage())`).
- [ ] Mechanical test fix so everything compiles: in the 8 test files above replace `new RecordPaymentRequest(X, "REF", null)` with `new RecordPaymentRequest(X, "REF", PaymentMode.CASH, null)` (sed on the pattern `, null)` within `new RecordPaymentRequest(`; review the diff by hand). Add `"paymentMode":"CASH"` to `PAY_BODY` (BookingControllerTest) and the SecurityConfigTest pay JSON.
- [ ] `mvn test -Dtest=BookingControllerTest,SecurityConfigTest -q` -> compile OK; old pay assertions still green (service mocked); `payRejectsInvalidBodiesWith400` still 400.
- [ ] Run `mvn test-compile -q` for the whole module.

### Task 2: recordPayment enters (RED first)

- [ ] In `BookingServiceTest` rewrite `recordPaymentMarksInstallmentPaid...` (L585) to expect: `i1.getStatus()==ENTERED`, `paidAt==NOW`, `paymentRef`, `paymentMode==CASH`, `recordedBy`, `confirmedAt==null`; event type `PAID`; `response.paidAmount()==0` (or token-only if rows include a PAID token), `response.dueAmount()==200000.00` (entered must NOT reduce due); `installments().get(0).status()==ENTERED`. Add `verify(bookingEmiConfigRepository, never()).findBySingletonGuardTrue()` (proves no threshold path on entry; remove `stubConfig` from these tests to avoid strict-stub errors). Rename tests `recordPaymentEnters...`.
- [ ] Update L639/L652 tests the same way; the "not PENDING" 409 test at ~L704 loop: statuses `PAID, VOID` plus add `ENTERED` (re-entering an ENTERED installment is 409 `InstallmentNotPayableException`).
- [ ] Run `mvn test -Dtest=BookingServiceTest` -> RED.
- [ ] Implement in `recordPayment`: `setStatus(ENTERED)`, `setPaymentMode(request.paymentMode())`, drop the `afterInstallmentPaid` call, keep ACTIVE check, exact-amount check, `BookingEventType.PAID` event (detail: `"entered: installment N, amount A, ref R, mode M"`; existing assertions use `contains`). Update the method comment and the `afterInstallmentPaid` comment (now called from confirm).
- [ ] `toResponses`: map new response fields; `dueAmount = sumByStatus(PENDING).add(sumByStatus(ENTERED))` (helper `sumByStatuses(installments, PENDING, ENTERED)`); leave the overdue flag as is.
- [ ] GREEN: `mvn test -Dtest=BookingServiceTest`.

### Task 3: confirmPayment (single)

RED tests in `BookingServiceTest` (a new section; reuse `lockedBookingWith`, `installment`, `stubConfig`):
- [ ] `confirmPaymentMarksEnteredInstallmentPaidStampsConfirmedAtAndByAndWritesPayConfirmedEvent` (i1 ENTERED, MANUAL config): status PAID, `confirmedAt==NOW`, `confirmedBy==ACTOR_ID`, event type `PAY_CONFIRMED`, response paid=100000 due=100000.
- [ ] `confirmPaymentOnAnUnenteredInstallmentIs409` for PENDING, PAID, VOID (`InstallmentNotEnteredException`), no event, no save.
- [ ] `confirmPaymentOnACancelledBookingIs409` (`BookingNotActiveException`, no writes) and 404s for unknown booking / installment.
- [ ] `confirmPaymentOnAConfirmedBookingPromotesToPaidWithoutReconfirming`: booking CONFIRMED, i2 ENTERED -> PAID + `PAY_CONFIRMED` event; `verify(saleService, never())`, `verify(plotRepository, never()).findByIdForUpdate(any())`, `verify(bookingEmiConfigRepository, never()).findBySingletonGuardTrue()`; booking status unchanged.
- [ ] `confirmPaymentCrossingTheThresholdAutoConfirmsTheBooking` (AUTO_THRESHOLD 50; two ENTERED/PAID rows; stub `saleService.recordConfirmedBooking` + plot as in the existing auto-confirm unit tests at L867+): booking CONFIRMED, events `PAY_CONFIRMED` then `CONFIRMED`.
- [ ] `enteredPaymentsDoNotCountTowardTheThreshold`: AUTO_THRESHOLD 50, rows: PAID token 10%, ENTERED 60% -> `bookingService.afterInstallmentPaid(...)` does not confirm (`verify(saleService, never())`); after confirming it does.
- [ ] Run -> RED. Implement:

```java
@Transactional
public BookingResponse confirmPayment(UUID bookingId, int installmentNumber, UUID actorId) {
    PlotBooking booking = plotBookingRepository.findByIdForUpdate(bookingId)   // booking lock first
        .orElseThrow(() -> new BookingNotFoundException(bookingId));
    return confirmEntered(booking, List.of(installmentNumber), actorId);       // plot lock only inside confirmLocked
}

// shared by single + bulk. PRECONDITION: booking row already locked by the caller.
private BookingResponse confirmEntered(PlotBooking booking, List<Integer> numbers, UUID actorId) {
    if (booking.getStatus() != BookingStatus.ACTIVE && booking.getStatus() != BookingStatus.CONFIRMED)
        throw new BookingNotActiveException(booking.getId());   // CANCELLED -> 409
    List<EmiInstallment> installments = emiInstallmentRepository.findByBookingIdOrderByInstallmentNumberAsc(booking.getId());
    Instant now = clock.instant();
    for (int n : numbers) {
        EmiInstallment i = installments.stream().filter(x -> x.getInstallmentNumber() == n).findFirst()
            .orElseThrow(() -> new InstallmentNotFoundException(booking.getId(), n));
        if (i.getStatus() != InstallmentStatus.ENTERED) throw new InstallmentNotEnteredException(booking.getId(), n);
        i.setStatus(InstallmentStatus.PAID); i.setConfirmedAt(now); i.setConfirmedBy(actorId);
        emiInstallmentRepository.save(i);
        bookingEventRepository.save(BookingEvent.of(booking.getId(), BookingEventType.PAY_CONFIRMED, actorId,
            "installment " + n + ", amount " + i.getAmount().toPlainString() + ", ref " + i.getPaymentRef(), now));
    }
    if (booking.getStatus() == BookingStatus.ACTIVE) {
        afterInstallmentPaid(booking, installments, actorId);   // once per booking; sums PAID only; never on CONFIRMED
    }
    return toResponse(booking, installments);
}
```
- [ ] GREEN `mvn test -Dtest=BookingServiceTest`.

### Task 4: confirmPayments (bulk)

RED tests (`BookingServiceTest`, Mockito; use `InOrder` on `plotBookingRepository.findByIdForUpdate`):
- [ ] `bulkConfirmLocksBookingsInAscendingIdOrderRegardlessOfRequestOrder` (items given B-high, B-low, B-high; verify lock order low then high, each booking locked once).
- [ ] `bulkConfirmTwoInstallmentsOfOneBookingThatTogetherCrossTheThresholdSucceeds` (proves single `afterInstallmentPaid` per booking; no 409 on the second item).
- [ ] `bulkConfirmFailsOnFirstOffendingItemAndMessageNamesIt` (second booking has a PENDING installment -> `InstallmentNotEnteredException` with that booking id/number).
- [ ] `bulkConfirmRejectsDuplicateItems` (`DuplicatePaymentRefException`, no repository interaction at all).
- [ ] `bulkConfirmReturnsOneResponsePerBookingInLockOrder` (return type `List<BookingResponse>`).
- [ ] RED, implement:

```java
@Transactional
public List<BookingResponse> confirmPayments(List<PaymentRef> items, UUID actorId) {
    // controller bean-validation guarantees 1..200 non-null; service re-checks duplicates (defence for non-HTTP callers)
    SortedMap<UUID, List<Integer>> byBooking = new TreeMap<>();   // UUID natural order == lock order
    Set<PaymentRef> seen = new HashSet<>();
    for (PaymentRef r : items) {
        if (!seen.add(r)) throw new DuplicatePaymentRefException(r.bookingId(), r.installmentNumber());
        byBooking.computeIfAbsent(r.bookingId(), k -> new ArrayList<>()).add(r.installmentNumber());
    }
    Map<UUID, PlotBooking> locked = new LinkedHashMap<>();
    for (UUID id : byBooking.keySet())        // lock ALL bookings first, ascending: deadlock-safe vs other bulks
        locked.put(id, plotBookingRepository.findByIdForUpdate(id).orElseThrow(() -> new BookingNotFoundException(id)));
    List<BookingResponse> out = new ArrayList<>();
    byBooking.forEach((id, nums) -> { Collections.sort(nums); out.add(confirmEntered(locked.get(id), nums, actorId)); });
    return out;                               // any throw rolls back everything (single tx)
}
```
Note: `UUID.compareTo` on java.util.UUID is signed-long based; any consistent total order is fine for deadlock avoidance.
- [ ] GREEN.

### Task 5: cancelBooking voids ENTERED

- [ ] RED in `BookingCancelServiceTest`: rows PAID, ENTERED, PENDING -> result PAID, VOID, VOID; captured CANCELLED event detail contains `unconfirmed payments voided: 1` and `paid: <PAID sum only>`; case with zero ENTERED contains `voided: 0`. Update the existing detail assertions only if they use equality (they use `contains` in current style; check).
- [ ] Implement in `cancelBooking` loop: count ENTERED; `status == PENDING || status == ENTERED` -> VOID; append `"; unconfirmed payments voided: " + n` to the event detail. Update the method comment ("PAID untouched; PENDING and ENTERED -> VOID").
- [ ] GREEN `mvn test -Dtest=BookingCancelServiceTest`.

### Task 6: Endpoints (controller tests, RED first)

`BookingControllerTest` (`@SpringBootTest` + MockMvc + `@MockBean BookingService`, helper `tokenFor(role)`):
- [ ] `confirmPaymentReturns200AndPassesAdminAsActor`: `POST /api/admin/bookings/{id}/installments/{n}/confirm` -> 200, `verify(bookingService).confirmPayment(id, 2, adminId)`.
- [ ] `confirmPaymentMapsExceptions`: 404 (`BookingNotFoundException`, `InstallmentNotFoundException`), 409 (`BookingNotActiveException`, `InstallmentNotEnteredException`).
- [ ] `confirmPaymentIsForbiddenForAnAssociateToken` (and 403 for every non-ADMIN role is already covered by SecurityConfigTest below) and 401 with no token.
- [ ] `bulkConfirmReturns200WithBookingsAndPassesActor`, `bulkConfirmMapsExceptions` (409, 404, 400 duplicate), `bulkConfirmIsForbiddenForAnAssociateToken`.
- [ ] `bulkConfirmRejectsInvalidBodiesWith400WithoutCallingTheService`: `{}`, `{"items":[]}`, `{"items":null}`, 201 items, item missing `bookingId`, `installmentNumber` 0, non-UUID bookingId. `verifyNoInteractions(bookingService)`.
- [ ] `payRejectsMissingOrInvalidPaymentMode`: body without `paymentMode`, with `"paymentMode":"BITCOIN"` -> 400, service untouched; valid `"UPI"` -> 200 and `ArgumentCaptor<RecordPaymentRequest>` has `UPI`.
- [ ] Implement: in `BookingController` `@PostMapping("/{id}/installments/{n}/confirm")` returns `bookingService.confirmPayment(id, n, actorId)`. New `AdminPaymentController` `@RestController @RequestMapping("/api/admin/payments")` with `@PostMapping("/confirm") List<BookingResponse> confirm(@Valid @RequestBody ConfirmPaymentsRequest r, @AuthenticationPrincipal UUID actorId)`. Response shape for bulk is a plain JSON array of updated bookings (U5 service decides what to show; note in PR).
- [ ] `SecurityConfigTest` add two parameterised `@EnumSource(AssociateRole.class)` tests following L631: single confirm (random ids -> ADMIN 404, others 403) and bulk (body `{"items":[{"bookingId":"<random uuid>","installmentNumber":1}]}` -> ADMIN 404, others 403) plus 401 without token for each. No `SecurityConfig` edit (decision 5). If a role other than ADMIN unexpectedly reaches the controller, STOP and add explicit matchers.
- [ ] `mvn test -Dtest=BookingControllerTest,SecurityConfigTest`.

### Task 7: Real-DB integration tests

Add a small shared helper in each affected IT (or one package-private `PaymentTestSupport` if two files need it; do not over-engineer): `enterAndConfirm(b, n, amount)`.

- [ ] `BookingPaymentIntegrationTest`: rewrite L137 test -> DB row `status='ENTERED'`, `paid_at`, `payment_ref`, `payment_mode='CASH'`, `recorded_by`, `confirmed_at IS NULL`, one `PAID` event, `after.paidAmount()` == token only (0 beyond token), `after.dueAmount()` unchanged, booking stays ACTIVE, plot BOOKED. Rewrite the L161 rejected-pay test (`status = 'ENTERED'` count zero). The simultaneous-pays test (L177) stays valid (loser: `InstallmentNotPayableException`). The lock test (L216) check what it asserts and adjust the status expectation.
- [ ] Real-DB: `confirmingAnEnteredPaymentOnAConfirmedBookingCreatesNoSecondSale` (enter, then `confirmBooking` manually, then `confirmPayment` -> PAID, still exactly one sale row, one `CONFIRMED` event) and `confirmOnACancelledBookingIs409` (enter, cancel -> installment VOID, confirm -> 409).
- [ ] New in the same file: `confirmPromotesToPaidWithConfirmedFieldsAndPayConfirmedEvent`; `doubleConfirmIs409AndWritesOneEvent`; `twoSimultaneousConfirmsOfTheSameInstallmentSucceedExactlyOnce` (copy the latch/pool pattern of L177; loser gets `InstallmentNotEnteredException`; exactly one `PAY_CONFIRMED` event); `bulkConfirmIsAllOrNothing` (two bookings, second item invalid -> first booking's installment still ENTERED, zero PAY_CONFIRMED events, no sale); `bulkConfirmAcrossBookingsSeededInOpposingOrderCompletesWithoutDeadlock` (two threads, bulk [A,B] and [B,A] on disjoint installments, both finish within 10s); `cancelVoidsEnteredAndKeepsPaid` (DB: ENTERED->VOID, PAID stays, cancel event detail mentions count).
- [ ] `BookingAutoConfirmIntegrationTest`: change helper at L164 so it enters and then confirms (`recordPayment` + `confirmPayment`, returns the confirm response) -> the 12 existing threshold tests keep their meaning. Add: `enteredPaymentsNeverAutoConfirmEvenAtOneHundredPercent` (enter all installments, booking ACTIVE, no sale), then confirm last -> CONFIRMED, plus `theRaceTest` at L372/L426: pay race becomes confirm race (enter first, then race `confirmPayment` vs `confirmBooking`/two confirms). The rollback test at L295/L330 (failure in confirm step rolls back payment) now asserts the installment stays ENTERED, no PAY_CONFIRMED event.
- [ ] `BookingCancelIntegrationTest` (L166 helper, L501, L533): helper pays+confirms; the two tests that pay mid-flow check which semantic they need (L501/L533 appear to test pay-vs-cancel races; keep as enter-vs-cancel and assert loser outcome `BookingNotActiveException`).
- [ ] `BookingTransferIntegrationTest` L173/L464: only the new ctor arg; no semantic change expected.
- [ ] Run: `mvn test -Dtest=BookingPaymentIntegrationTest,BookingAutoConfirmIntegrationTest,BookingCancelIntegrationTest,BookingTransferIntegrationTest,BookingConfirmIntegrationTest,BookingConcurrencyTest`.

### Task 8: Docs touch-ups and final verification

- [ ] `BookingOverdue.java`: comment line "ENTERED installments are deliberately not overdue (payment received, awaiting confirmation)". Comment only.
- [ ] Add one assertion each (Mockito, `BookingServiceTest` `toResponses` section around L115-140): ENTERED past-due row -> `overdue == false`; PENDING past-due -> true; EMI report query unchanged (covered by existing `ReportsRepositoryTest`; add one row ENTERED excluded there if the fixture is cheap, otherwise skip and say so).
- [ ] Full backend: `cd backend && mvn test -q`; diff failures against the known baseline (4 Jwt/Secrets + 5 CycleClose + ~55 spurious Mockito noise per memory). Any other failure is U2's.
- [ ] `git status` shows only backend booking sources/tests + this plan. No commit (coordinator commits). No frontend files.

## Open questions for the owner (all resolved)

- Q1 RESOLVED: confirm allowed on ACTIVE or CONFIRMED, never CANCELLED (409); threshold auto-confirm only when ACTIVE (decision 6, Tasks 3/7).
- Q2 RESOLVED: Angular `booking-seal` is the only client of the pay endpoint; U6 updates it.
- Q3 RESOLVED: 404 for a missing booking/installment in bulk is acceptable (whole call rolls back).
- Q4 RESOLVED: bulk response is a JSON array of updated `BookingResponse`.
