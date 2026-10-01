# Plot Booking Unit 3 — Extract `SaleService.recordConfirmedBooking` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull the sale-persistence + Direct Income + Self-Performance-Bonus logic out of `SaleService.recordSale` into a shared private core, and add a public `recordConfirmedBooking(PlotBooking, Plot)` that uses it for a `BOOKED` plot, with `recordSale` behaviour unchanged.

**Architecture:** `recordSale` keeps its guards (lock plot, must be `AVAILABLE`; associate; project) and then calls a new private `persistSaleAndIncome(...)` (Plot->SOLD flip when plot != null, cycle lookup, Sale save, plan version, Direct Income, SPB). `recordConfirmedBooking` does its own guard (plot must be `BOOKED`), loads associate/project, and calls the same core with `amount = booking.totalAmount`, buyer fields from the booking, `note = "Confirmed from booking {id}"`, `bookingId = booking.getId()`. No new dependencies, constructor unchanged. No endpoint, no `BookingService` edit (unit 4 wires it).

**Tech Stack:** Java 21, Spring Boot, JPA, JUnit 5 + Mockito + AssertJ, Maven (`backend/`).

**Spec:** `docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md` (Decision 2, Decision 3, Testing, Resolved decisions); unit queue `docs/superpowers/plans/2026-10-01-plot-booking-units.md` unit 3.

## Global Constraints

- PURE REFACTOR for `recordSale`: same statement order of observable effects (plot lock -> AVAILABLE guard -> associate -> project -> SOLD flip -> cycle -> sale save -> plan version -> Direct ledger -> SPB), same exceptions, same persisted values. `voidSale` untouched.
- Sale amount = `booking.total_amount`; `buyerName`/`buyerPhone` from booking; `projectId` from the plot; `note` = `"Confirmed from booking {id}"`; `sale.booking_id` = booking id (Decision 2).
- `recordConfirmedBooking` accepts a `BOOKED` plot and flips it to `SOLD`; it does NOT lock the plot or booking itself (caller, unit 4, holds the Decision 8 locks) and does NOT change booking status/`sale_id`/events (unit 4).
- Do not touch `BookingService`, `PlotBooking`, `EmiInstallment` (unit 2 is being planned concurrently in that package). Read-only use of `PlotBooking` getters is fine.
- No endpoint, no migration, no frontend, no edits to the units file or status index.
- Leg-volume: at sale time only the `legCredited` snapshot is written (`associate.getPosition()`); leg-volume rollup happens at cycle close from `Sale` rows (`CycleService.rollUpLegVolumes`), so parity is proven via `legCredited` + `cycleId`.

## Review Focus

- Plotless `recordSale` (plotId null): no plot lookup/save, no SPB, still Direct Income -- pinned in Task 2 and re-run after Task 3.
- `recordSale` on a `BOOKED` plot must still throw `PlotNotAvailableException` (core must not relax the guard) -- Task 2.
- `recordConfirmedBooking` on an `AVAILABLE`/`SOLD` plot must throw and write nothing -- Task 4.
- Rollback atomicity: missing compensation plan version throws `IllegalStateException` (both entry points) -- existing test for `recordSale`, new for confirmed path in Task 4.
- SPB gating on the booked plot's `areaSqft` and KYC-gated status works identically for the confirmed path -- Task 4/5.
- `sale.booking_id` unique: a second `recordConfirmedBooking` for the same booking cannot create a second Sale (DB-level; noted, tested in unit 4's concurrency test, not here).

## Decision recorded: option (a)

Unit 3's acceptance criteria say `recordConfirmedBooking` must exist and be unit-tested ("Service-level test: ledger/leg-volume effects of `recordConfirmedBooking` match `recordSale`"), so this unit extracts the shared core AND adds `recordConfirmedBooking` as a thin public method, tested directly. Unit 4 only calls it.

## File Structure

- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java` (extract core, add method)
- Modify (tests): `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java` (characterization gap-fill + new method unit tests)
- Create (test): `backend/src/test/java/com/plotchain/sales/SaleServiceConfirmedBookingIntegrationTest.java`

---

### Task 1: Record the test baseline

**Files:** none changed.

- [ ] **Step 1: Run the safety-net classes and save the result**

Run (from `/Users/ronalisenapati/Ronali/plotchain/backend`):
`mvn -q test -Dtest='SaleServiceTest,SaleControllerTest,SaleRepositoryTest,SaleRecordConcurrencyTest,SaleServiceSelfPerformanceBonusIntegrationTest,AssociateSaleControllerTest' 2>&1 | tee /tmp/unit3-baseline.txt | tail -40`
Expected: all green. Note: ~55 spurious Mockito errors (JDK21/25 mismatch) and 4 pre-existing `JwtServiceTest`/`SecretsEncryptionServiceTest` failures are env noise and outside these classes; if any of the six classes above show Mockito inline-mock errors, record the exact count in the baseline file and compare counts (not just green/red) in every later run.

- [ ] **Step 2: Note the per-class pass counts** (Tests run / Failures / Errors) in the commit message of Task 2 for later comparison. No commit now.

---

### Task 2: Characterization gap-fill on `recordSale` (before touching code)

**Files:**
- Modify (test): `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:** Consumes existing helpers in that file: `stubHappyPathGuardsAndDependencies()`, `requestFor(...)`, `plotWithStatus(...)`, `associateWithPosition(...)`, `compensationPlanVersion()`, `PLOT_ID`, `CYCLE_ID`. Produces: tests that pin behaviour the refactor must preserve.

- [ ] **Step 1: Check what is already pinned**

Run: `grep -n "void " backend/src/test/java/com/plotchain/sales/SaleServiceTest.java | head -60`
Look for tests covering each of: (i) plotless sale (null plotId) skips `plotRepository`, no SPB, Direct entry saved; (ii) `BOOKED` plot -> `PlotNotAvailableException` and nothing saved; (iii) saved Sale has `legCredited == associate.position`, `cycleId`, `amount == request.price()`, `status RECORDED`, `bookingId == null`; (iv) Direct ledger gross/tds/admin/net numbers for plan version fixture (10% direct, 5% tds, 4%... as in fixture) with `sourceRef == sale.id`. Add only the ones missing.

- [ ] **Step 2: Write each missing test** in the existing style (Mockito strict stubs, `stubHappyPathGuardsAndDependencies()`), e.g. for (iii):

```java
@Test
void recordSaleLeavesBookingIdNullAndSnapshotsLegAndCycle() {
    stubHappyPathGuardsAndDependencies();

    saleService.recordSale(requestFor(PLOT_ID, ASSOCIATE_ID));

    ArgumentCaptor<Sale> saleCaptor = ArgumentCaptor.forClass(Sale.class);
    verify(saleRepository).save(saleCaptor.capture());
    Sale saved = saleCaptor.getValue();
    assertThat(saved.getBookingId()).isNull();
    assertThat(saved.getLegCredited()).isEqualTo("L");
    assertThat(saved.getCycleId()).isEqualTo(CYCLE_ID);
    assertThat(saved.getAmount()).isEqualByComparingTo("600000.00");
    assertThat(saved.getStatus()).isEqualTo(SaleStatus.RECORDED);
}
```

Write (i), (ii), (iv) the same way if Step 1 found them missing (concrete assertions, no placeholders; for (ii) use `plotWithStatus(PlotStatus.BOOKED)`, assert `PlotNotAvailableException` and `verify(saleRepository, never()).save(any())`).

- [ ] **Step 3: Run — these must PASS on unmodified production code** (they characterize it)

Run: `mvn -q test -Dtest=SaleServiceTest` (in `backend/`)
Expected: PASS, same counts as baseline plus the new tests.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "test(sales): characterize recordSale before extracting core

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Extract the private core from `recordSale`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java` (`recordSale`, currently the SOLD flip through the SPB block)

**Interfaces:** Produces private
`SaleResponse persistSaleAndIncome(Plot plot, Associate associate, Project project, String buyerName, String buyerPhone, String buyerEmail, String note, BigDecimal amount, UUID bookingId)`
where `plot` may be null (plotless sale). Moves the existing code verbatim; the only new values are the parameters.

- [ ] **Step 1: Refactor (tests already green, this is the "refactor" step)**

In `recordSale`, after the associate and project lookups, replace everything from `// Flow step 4` to the end with:

```java
return persistSaleAndIncome(plot, associate, project,
    request.buyerName(), request.buyerPhone(), request.buyerEmail(),
    request.note(), request.price(), null);
```

Create the private method directly below `recordSale`. Its body is the moved code, unchanged apart from: the Sale setters use the parameters (`sale.setBuyerName(buyerName)`, `setBuyerPhone`, `setBuyerEmail`, `setNote(note)`, `setAmount(amount)`), plus one new line `sale.setBookingId(bookingId);`, and the last line stays `return toResponse(sale, plot, associate, project);`. Keep all existing comments with the moved blocks (Flow steps 4-9, SPB comment). Do not reorder any statement. Keep `@Transactional` on `recordSale` only (private method runs in its transaction).

- [ ] **Step 2: Run the full safety net**

Run: the Task 1 command.
Expected: identical pass counts to Task 1 + Task 2's new tests; no new failures.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleService.java
git commit -m "refactor(sales): extract persistSaleAndIncome core from recordSale

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `recordConfirmedBooking` (unit-tested)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java`
- Modify (test): `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `persistSaleAndIncome(...)` (Task 3); `PlotBooking` getters `getId()`, `getAssociateId()`, `getTotalAmount()`, `getBuyerName()`, `getBuyerPhone()`; `Plot.getProjectId()`, `Plot.getStatus()`.
- Produces (unit 4 calls this): `public SaleResponse recordConfirmedBooking(PlotBooking booking, Plot plot)` — `@Transactional`; caller must already hold the booking and plot row locks and pass the locked `Plot`.

- [ ] **Step 1: Write failing tests** in `SaleServiceTest` (add `import com.plotchain.booking.PlotBooking;` and a fixture):

```java
private static final UUID BOOKING_ID = UUID.randomUUID();

private PlotBooking bookingFixture() {
    PlotBooking b = new PlotBooking();
    b.setId(BOOKING_ID);
    b.setPlotId(PLOT_ID);
    b.setAssociateId(ASSOCIATE_ID);
    b.setTotalAmount(new BigDecimal("600000.00"));
    b.setBuyerName("Jane Buyer");
    b.setBuyerPhone("9999999999");
    return b;
}

private void stubConfirmedPathDependencies() {
    when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associateWithPosition("L")));
    when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(projectFixture()));
    when(cycleService.getOrOpenCurrent()).thenReturn(cycleWithId(CYCLE_ID));
    when(saleRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    when(ledgerEntryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    when(compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
        .thenReturn(Optional.of(compensationPlanVersion()));
}
```

NOTE: `plotWithStatus` builds the plot with `projectId = UUID.randomUUID()`, not `PROJECT_ID`. For these tests build the plot as
`new Plot(PLOT_ID, PROJECT_ID, "A-101", PlotType.NORMAL, new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"), PlotStatus.BOOKED)` so `projectId` comes from the plot (Decision 2).

Tests:

1. `recordConfirmedBookingFlipsBookedPlotToSoldAndLinksSaleToBooking` — asserts `plot.getStatus()==SOLD`, `verify(plotRepository).save(plot)`, saved Sale: `bookingId==BOOKING_ID`, `plotId==PLOT_ID`, `projectId==PROJECT_ID`, `associateId`, `amount==600000.00` (use `bookingFixture().setTotalAmount(new BigDecimal("750000.00"))` to prove amount comes from the booking, not the plot), `buyerName`/`buyerPhone` from booking, `note=="Confirmed from booking " + BOOKING_ID`, `status RECORDED`, `legCredited=="L"`, `cycleId==CYCLE_ID`; response `status()=="RECORDED"`, `plotNo()=="A-101"`.
2. `recordConfirmedBookingCreditsSameDirectIncomeAsRecordSaleForSameInputs` — run `recordSale` (AVAILABLE plot via `stubHappyPathGuardsAndDependencies`, price 600000.00) capturing the Direct `LedgerEntry` (`ArgumentCaptor`, `getAllValues().get(0)`), then in a second test method-local flow reset mocks is awkward, so instead: compute expected from the fixture plan version (gross = 600000 x 10%, tds, admin, net) via helper `assertDirectEntry(LedgerEntry e, Sale s)` shared by both a recordSale test (Task 2, (iv)) and this one; assert gross/tds/admin/net `isEqualByComparingTo` the same literals, `incomeType DIRECT`, `status PENDING`, `sourceRef==sale.id`, `cycleId==CYCLE_ID`. (Same literal expectations in both tests is the parity proof; no mock reset needed.)
3. `recordConfirmedBookingRejectsPlotThatIsNotBooked` — `@ParameterizedTest`/two tests for `AVAILABLE` and `SOLD`: `assertThatThrownBy` -> `PlotNotAvailableException`; `verify(saleRepository, never()).save(any())`, `verify(ledgerEntryRepository, never()).save(any())`, `verify(plotRepository, never()).save(any())`.
4. `recordConfirmedBookingCreditsSelfPerformanceBonusForBookedPlotArea` — `when(selfPerformanceBonusConfigService.isEnabled()).thenReturn(true)`; plot `areaSqft` 3000 (>= tier-2 threshold 3000 in fixture); expect 2 ledger saves, second `SELF_PERFORMANCE` with gross `600000 x 2% = 12000`, `sourceRef == sale.id`. Mirrors existing recordSale SPB test.
5. `recordConfirmedBookingThrowsWhenCompensationPlanMissing` — plan repo returns `Optional.empty()`; `assertThatThrownBy` -> `IllegalStateException` message contains `compensation_plan_version`.

- [ ] **Step 2: Run to verify they fail**

Run: `mvn -q test -Dtest=SaleServiceTest`
Expected: COMPILE FAIL (`recordConfirmedBooking` undefined).

- [ ] **Step 3: Implement** in `SaleService.java`, placed directly after `persistSaleAndIncome`:

```java
// Plot-booking lifecycle unit 3 (docs/superpowers/specs/role-capability/2026-10-01-plot-booking-lifecycle-design.md,
// Decision 2). Called by BookingService.confirm (unit 4), which already holds the PlotBooking
// and Plot row locks (Decision 8) and passes the locked Plot. Same cycle/ledger/SPB logic as
// recordSale via persistSaleAndIncome; differs only in the guard (plot must be BOOKED, not
// AVAILABLE) and in where the Sale's fields come from. Booking status/sale_id/event stay with
// the caller.
@Transactional
public SaleResponse recordConfirmedBooking(PlotBooking booking, Plot plot) {
    if (plot.getStatus() != PlotStatus.BOOKED) {
        throw new PlotNotAvailableException(plot.getId());
    }

    Associate associate = associateRepository.findById(booking.getAssociateId())
        .orElseThrow(() -> new AssociateNotFoundException(booking.getAssociateId()));

    Project project = projectRepository.findById(plot.getProjectId())
        .orElseThrow(() -> new ProjectNotFoundException(plot.getProjectId()));

    return persistSaleAndIncome(plot, associate, project,
        booking.getBuyerName(), booking.getBuyerPhone(), null,
        "Confirmed from booking " + booking.getId(), booking.getTotalAmount(), booking.getId());
}
```

Add `import com.plotchain.booking.PlotBooking;`. (Sales already depends on projects/associate packages; booking -> sales dependency already exists via `BookingService`, so this adds a sales -> booking import. If a package-cycle check exists, run it; otherwise accept — see Decisions below.)

- [ ] **Step 4: Run to verify they pass**

Run: `mvn -q test -Dtest=SaleServiceTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleService.java backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): recordConfirmedBooking accepts a BOOKED plot, sets sale.booking_id

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: DB integration — linked Sale, ledger parity, void unaffected

**Files:**
- Create: `backend/src/test/java/com/plotchain/sales/SaleServiceConfirmedBookingIntegrationTest.java`

**Interfaces:** Consumes `SaleService.recordConfirmedBooking(PlotBooking, Plot)`, `SaleService.voidSale(UUID, VoidSaleRequest)`. Model on `SaleServiceSelfPerformanceBonusIntegrationTest` (`@SpringBootTest @ActiveProfiles("test")`, `@Autowired` repos, `@AfterEach` cleanup deleting ledger entries by `sourceRef`, then sale, then booking, plot, project, associate, plan version).

- [ ] **Step 1: Write the failing/new test**

Setup (copy the fixture style from the SPB integration test: plan version effective 2025-06-01, VERIFIED associate position `L`, project, plot `BOOKED` area 3000 price 1000000), plus a persisted `PlotBooking` (`id`, `plotId`, `associateId`, `totalAmount 900000.00`, `installmentCount 3`, `bookedAt now`, `status ACTIVE`, `buyerName "Jane Buyer"`; inject `PlotBookingRepository` from `com.plotchain.booking`), then `SaleResponse r = saleService.recordConfirmedBooking(booking, plotRepository.findById(plotId).get());`.

Test 1 `recordConfirmedBookingPersistsLinkedSaleSoldPlotAndDirectIncome`: re-read from repos: `Sale.getBookingId()==bookingId`, `amount==900000.00`, `note`, `legCredited=="L"`, plot status `SOLD`, one `DIRECT` ledger entry with `sourceRef==sale.id`, gross `== 900000 x directPct/100` (plan fixture 6.00 -> 54000.00).

Test 2 `voidingTheLinkedSaleReturnsPlotToAvailableAndLeavesBookingUntouched` (Decision 3): call `saleService.voidSale(saleId, new VoidSaleRequest("test"))`; plot `AVAILABLE`, all ledger entries `REVERSED`, booking row unchanged (`status` still `ACTIVE` here since this unit does not flip it — assert it equals what was saved).

Test 3 `plotlessRecordSaleStillWorks` is already covered in Task 2; do not duplicate.

- [ ] **Step 2: Run**

Run: `mvn -q test -Dtest=SaleServiceConfirmedBookingIntegrationTest`
Expected: PASS (production code exists from Task 4; if it fails for FK/NOT NULL reasons on `plot_booking`, fix fixture columns per `PlotBooking` fields and V41 migration, not production code).

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/sales/SaleServiceConfirmedBookingIntegrationTest.java
git commit -m "test(sales): integration for recordConfirmedBooking and linked-sale void

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Final regression

**Files:** none changed.

- [ ] **Step 1: Safety net plus neighbours**

Run: `mvn -q test -Dtest='Sale*Test,AssociateSaleControllerTest,BookingServiceTest,BookingConcurrencyTest,PlotBookingSchemaTest,V41MigrationTest,SecurityConfigTest,EPinServiceTest,AdminStatsServiceTest'`
Expected: same pass counts as before the unit; only known env noise (Mockito JDK mismatch, Jwt/SecretsEncryption) may differ and must match the baseline.

- [ ] **Step 2: Confirm scope** — `git diff 391635e --stat` lists only `SaleService.java`, `SaleServiceTest.java`, the new integration test, and this plan file. No `booking/` main files, no controller, no migration.

---

## Decisions the spec did not settle (flagged)

1. **Signature** `recordConfirmedBooking(PlotBooking booking, Plot plot)`: spec says `(booking, …)`. Chosen: caller passes the already-locked `Plot` so the method does not re-lock/re-read (Decision 8 puts locks in confirm). Returns `SaleResponse` (carries sale id) rather than `Sale`, matching `recordSale`.
2. **Wrong-status plot** throws the existing `sales.PlotNotAvailableException` (409 via `SalesExceptionHandler`); spec names no exception.
3. **`buyerEmail`** is null for confirmed sales (booking has no email field).
4. **Leg-volume** parity is via `legCredited`/`cycleId` snapshots; actual leg-volume rows are produced at cycle close, so there is no sale-time leg-volume code to extract.
5. **Package coupling**: `sales` now imports `booking.PlotBooking` while `booking` already imports `sales` (booking->`SaleService` in unit 4). Accepted (same module, no cycle enforcement found); alternative is passing primitives, rejected as noisier.
6. **Method visibility** public + `@Transactional` (needed cross-package); spec says "internal".
