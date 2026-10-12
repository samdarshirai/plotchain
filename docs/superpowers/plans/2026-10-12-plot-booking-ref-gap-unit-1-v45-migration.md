# Plot-booking reference-gap U1 — V45 migration + entities Implementation Plan

> For agentic workers: use superpowers:executing-plans or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax. Do NOT commit unless the coordinator says so.

**Goal:** One migration (V45) adds the ENTERED installment state, confirm columns, payment mode, PAY_CONFIRMED event type and booking price/discount snapshots; Java entities/enums mirror it. No behaviour change in `BookingService` beyond populating new snapshot columns.

**Spec:** `docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md` section U1. Lesson (V26 header): widening a Java enum without widening the DB CHECK fails only on a real insert, so every enum change here is paired with a real-DB test. V43 shows the portable named-constraint pattern (`DROP CONSTRAINT` + `ADD CONSTRAINT`); this works on H2 (PostgreSQL mode) and Postgres because both V41 constraints are named.

**Tech:** Spring Boot, Flyway, JPA with `ddl-auto: validate` (so entity columns must match V45 exactly), H2 PostgreSQL mode in tests (`@DataJpaTest` + `@ActiveProfiles("test")`).

## Decisions (read before starting)
1. **New plot_booking snapshot columns are nullable in the DB** (`list_price`, `area_sqft`, `rate`). Reason: existing tests insert `plot_booking` rows via raw JDBC (`PlotBookingSchemaTest` line ~38) and via entities that never set them; NOT NULL would break them. Backfill covers all real rows; `createBooking` always sets them. `discount` is `NOT NULL DEFAULT 0` (same reason it is safe: the default fills raw inserts). Entity fields use `BigDecimal` with `@Column(name=...)`, `discount` initialised to `BigDecimal.ZERO` so entity-created rows satisfy NOT NULL.
2. `total_amount` is untouched (stays = list_price - discount; U3 applies the discount). U1 writes discount = 0, so `total_amount == list_price`.
3. `installment.confirmed_by` FK is inline `REFERENCES associate(id)` (same style as V41 `recorded_by`).
4. `payment_mode` is nullable (PENDING rows have none; backfilled PAID rows keep NULL, since the mode of historic payments is unknown). The CHECK allows NULL implicitly.
5. Token installment (`paymentRef = "TOKEN"`) is created already PAID, so it also gets `confirmed_at = bookedAt`, `confirmed_by = associate who made the booking`. `createBooking(CreateBookingRequest)` has no actor parameter: use `request.associateId()` (the booking's associate). If a real actor id is wanted, that is a U2 concern.
6. `BookingService.recordPayment` is NOT touched (still sets PAID). Two-step flow = U2. New PAID rows written by it will have `confirmed_*` NULL until U2; acceptable and noted.

## File map
- Create: `backend/src/main/resources/db/migration/V45__plot_booking_reference_gap.sql`
- Create: `backend/src/main/java/com/plotchain/booking/PaymentMode.java`
- Modify: `backend/src/main/java/com/plotchain/booking/InstallmentStatus.java`, `BookingEventType.java`, `EmiInstallment.java`, `PlotBooking.java`, `BookingService.java` (createBooking + computeSchedule only)
- Modify tests: `backend/src/test/java/com/plotchain/booking/PlotBookingSchemaTest.java`
- Create test: `backend/src/test/java/com/plotchain/booking/V45MigrationTest.java`
- Possibly modify: `BookingServiceTest` (or whichever existing test covers `createBooking`) for the new assertions.

Test command used throughout (backend dir): `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn test -Dtest=<A,B>`.
Known env noise: a full `mvn test` shows ~55 spurious Mockito errors (JDK 21/25 mismatch). Always run targeted classes, and for any full run diff the failure list against a master baseline (`git stash`-free way: run on a clean master worktree, save the failing-test names, compare). Do not "fix" those errors.

---

## Task 0: Baseline
- [ ] Run `cd /Users/ronalisenapati/Ronali/plotchain/backend && mvn test -Dtest='PlotBookingSchemaTest,V41MigrationTest,BookingServiceTest,BookingEventTest*'` (drop any pattern that matches nothing; `ls src/test/java/com/plotchain/booking` to pick the booking classes). Expected: BUILD SUCCESS or only the known Mockito env errors. Save the output's pass/fail list as the baseline for Task 6.

## Task 1: Failing real-DB schema tests (red)
Edit `PlotBookingSchemaTest.java`. Reuse existing helpers `persistBooking()`, `persistInstallment(bookingId)`, `jdbc`. Add imports only if missing (`BigDecimal`, `List` are already imported).

- [ ] Update `bookingEventAcceptsEveryValidType`: add `"PAY_CONFIRMED"` to the type list and change expected count 4 -> 5.
- [ ] Add tests:

```java
@Test
void emiInstallmentAcceptsEnteredStatus() {
    EmiInstallment i = persistInstallment(persistBooking().getId());
    jdbc.update("UPDATE emi_installment SET status = 'ENTERED' WHERE id = ?", i.getId());
    assertThat(jdbc.queryForObject("SELECT status FROM emi_installment WHERE id = ?", String.class, i.getId())).isEqualTo("ENTERED");
}

@Test
void dbRejectsAnInvalidPaymentMode() {
    EmiInstallment i = persistInstallment(persistBooking().getId());
    assertThatThrownBy(() -> jdbc.update("UPDATE emi_installment SET payment_mode = 'BOGUS' WHERE id = ?", i.getId()))
        .isInstanceOf(DataIntegrityViolationException.class);
}

@Test
void emiInstallmentAcceptsEveryPaymentModeAndNull() {
    EmiInstallment i = persistInstallment(persistBooking().getId());
    for (String mode : List.of("CASH", "CHEQUE", "UPI", "BANK_TRANSFER", "OTHER")) {
        jdbc.update("UPDATE emi_installment SET payment_mode = ? WHERE id = ?", mode, i.getId());
    }
    jdbc.update("UPDATE emi_installment SET payment_mode = NULL WHERE id = ?", i.getId());
}

@Test
void dbRejectsANegativeDiscount() {
    PlotBooking b = persistBooking();
    assertThatThrownBy(() -> jdbc.update("UPDATE plot_booking SET discount = -1 WHERE id = ?", b.getId()))
        .isInstanceOf(DataIntegrityViolationException.class);
}

@Test
void discountDefaultsToZeroWhenOmittedFromTheInsert() {
    // reuse the raw-INSERT shape of sqlDefaultsGiveActiveAndPendingWhenStatusIsOmittedFromTheInsert
    // (copy its plot/associate/booking id setup), then:
    // assertThat(jdbc.queryForObject("SELECT discount FROM plot_booking WHERE id = ?", BigDecimal.class, bookingId))
    //     .isEqualByComparingTo("0");
}

@Test
void confirmedByMustReferenceAnExistingAssociate() {
    EmiInstallment i = persistInstallment(persistBooking().getId());
    assertThatThrownBy(() -> jdbc.update("UPDATE emi_installment SET confirmed_by = ? WHERE id = ?", UUID.randomUUID(), i.getId()))
        .isInstanceOf(DataIntegrityViolationException.class);
}
```
(Fill in the commented body of `discountDefaultsToZero...` by copying the setup from the existing `sqlDefaults...` test.)

- [ ] Run `mvn test -Dtest=PlotBookingSchemaTest`. Expected: the new tests FAIL (ENTERED/PAY_CONFIRMED rejected by check; unknown columns `payment_mode`, `discount`, `confirmed_by`). Existing tests still pass.

## Task 2: V45 migration (green for DB level)
- [ ] Create `backend/src/main/resources/db/migration/V45__plot_booking_reference_gap.sql`:

```sql
-- plot-booking reference-gap unit 1 (docs/superpowers/plans/2026-10-12-plot-booking-reference-gap-plan.md, U1).
-- Two-step payments: PENDING -> ENTERED (admin keyed it in) -> PAID (confirmed). PAID keeps meaning
-- "confirmed", so every existing PAID reader stays valid. Enum + CHECK widened together (see V26 lesson).
-- Both CHECKs below are named in V41, so DROP/ADD is portable across Postgres and H2 (same as V43).

-- (a) emi_installment
ALTER TABLE emi_installment DROP CONSTRAINT chk_emi_installment_status;
ALTER TABLE emi_installment ADD CONSTRAINT chk_emi_installment_status
    CHECK (status IN ('PENDING','ENTERED','PAID','VOID'));
ALTER TABLE emi_installment ADD COLUMN confirmed_at TIMESTAMP;
ALTER TABLE emi_installment ADD COLUMN confirmed_by UUID REFERENCES associate(id);
ALTER TABLE emi_installment ADD COLUMN payment_mode VARCHAR(24);
ALTER TABLE emi_installment ADD CONSTRAINT chk_emi_installment_payment_mode
    CHECK (payment_mode IN ('CASH','CHEQUE','UPI','BANK_TRANSFER','OTHER'));
-- Existing PAID rows (token installments included) were entered and confirmed in one step.
UPDATE emi_installment SET confirmed_at = paid_at, confirmed_by = recorded_by WHERE status = 'PAID';

-- (b) booking_event (PAY_CONFIRMED is 13 chars, fits VARCHAR(16))
ALTER TABLE booking_event DROP CONSTRAINT chk_booking_event_type;
ALTER TABLE booking_event ADD CONSTRAINT chk_booking_event_type
    CHECK (type IN ('PAID','CONFIRMED','CANCELLED','TRANSFERRED','PAY_CONFIRMED'));

-- (c) plot_booking price snapshot. total_amount stays = list_price - discount.
-- list_price/area_sqft/rate are nullable: pre-existing raw-INSERT tests omit them; backfill + createBooking fill them.
ALTER TABLE plot_booking ADD COLUMN list_price NUMERIC(14,2);
ALTER TABLE plot_booking ADD COLUMN discount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE plot_booking ADD CONSTRAINT chk_plot_booking_discount CHECK (discount >= 0);
ALTER TABLE plot_booking ADD COLUMN area_sqft NUMERIC(14,2);
ALTER TABLE plot_booking ADD COLUMN rate NUMERIC(14,2);
UPDATE plot_booking SET list_price = total_amount;
UPDATE plot_booking SET
    area_sqft = (SELECT p.area_sqft FROM plot p WHERE p.id = plot_booking.plot_id),
    rate      = (SELECT p.rate      FROM plot p WHERE p.id = plot_booking.plot_id);
```
- [ ] Run `mvn test -Dtest=PlotBookingSchemaTest`. Expected: the new tests PASS. (If `DROP CONSTRAINT chk_booking_event_type` errors on H2, V43 proves the same syntax works for a named check; look for a typo.) `ddl-auto: validate` is satisfied because entities have not added the new columns yet (validate ignores extra DB columns).

## Task 3: Failing V45 migration test (red -> green)
Create `backend/src/test/java/com/plotchain/booking/V45MigrationTest.java` on the `V41MigrationTest` shape: private H2 `jdbc:h2:mem:v45migration;MODE=PostgreSQL;DB_CLOSE_DELAY=-1`, `Flyway.configure()...target("44")...migrate()`, seed, then `target("45")`. Copy its helpers `seedPlot`, `seedAssociate`, `seedBooking` BUT note post-V41 `plot_booking.buyer_name` is NOT NULL, so seedBooking must insert `buyer_name` (`'Buyer'`) — V41MigrationTest seeded at V40 and did not need it.

Seed at V44 (use raw SQL):
- plot `A-1`: area 1200, rate 500, price 600000 (existing helper values) and plot `A-2` with different values (e.g. area 900, rate 700, price 630000) so the join backfill is distinguishable.
- booking A: `total_amount = 600000` on plot A-1; booking B: `total_amount = 630000` on plot A-2.
- installments on booking A, inserted with explicit column lists: (1) `status='PAID', paid_at=TIMESTAMP '2026-01-01 10:00:00', recorded_by=<assocA>, payment_ref='TOKEN'`; (2) `status='PENDING'`; (3) `status='VOID'`.

Assertions after `target("45")`:
- PAID installment: `confirmed_at == paid_at`, `confirmed_by == recorded_by`, `payment_mode IS NULL`.
- PENDING and VOID installments: `confirmed_at IS NULL`, `confirmed_by IS NULL`.
- booking A: `list_price == 600000`, `discount == 0`, `area_sqft == 1200`, `rate == 500`, `total_amount == 600000`; booking B: `list_price == 630000`, `area_sqft == 900`, `rate == 700`.
- Use `queryForObject(..., BigDecimal.class)` + `isEqualByComparingTo`; timestamps via `java.sql.Timestamp.class`.
- A post-migration insert of `booking_event` type `PAY_CONFIRMED` succeeds (needs the booking and `actor_id = assocA`).

- [ ] Write it; run `mvn test -Dtest=V45MigrationTest`. Expected: PASS (Task 2 already made the SQL real). To prove the test is not vacuous, temporarily comment out the `UPDATE emi_installment SET confirmed_at...` line in V45, rerun, see it FAIL, then restore the line.

## Task 4: Java enums and entities (keeps `validate` green)
- [ ] `InstallmentStatus.java`: `public enum InstallmentStatus { PENDING, ENTERED, PAID, VOID }`.
- [ ] `BookingEventType.java`: `public enum BookingEventType { PAID, CONFIRMED, CANCELLED, TRANSFERRED, PAY_CONFIRMED }`.
- [ ] Create `PaymentMode.java`: `public enum PaymentMode { CASH, CHEQUE, UPI, BANK_TRANSFER, OTHER }` (package `com.plotchain.booking`).
- [ ] `EmiInstallment.java`: add fields + getters/setters in the file's existing style:
```java
@Column(name = "confirmed_at")
private Instant confirmedAt;

@Column(name = "confirmed_by")
private UUID confirmedBy;

@Enumerated(EnumType.STRING)
@Column(name = "payment_mode")
private PaymentMode paymentMode;
```
- [ ] `PlotBooking.java`: add
```java
@Column(name = "list_price")
private BigDecimal listPrice;

@Column(nullable = false)
private BigDecimal discount = BigDecimal.ZERO;

@Column(name = "area_sqft")
private BigDecimal areaSqft;

private BigDecimal rate;
```
plus getters/setters. (`BigDecimal` is already imported.)
- [ ] Grep for exhaustive uses that a new enum constant could break: `grep -rn "InstallmentStatus\|BookingEventType" backend/src/main` — `EmiInstallmentResponse`, `BookingOverdue`, `EmiInstallmentRepository`, `BookingEvent` reference them; confirm none use an exhaustive `switch` (earlier grep found only an unrelated `switch` in `AssociateBookingController`, so none expected). Overdue logic filters `PENDING` only; ENTERED is intentionally not overdue-relevant yet (U2).

## Task 5: createBooking populates snapshots (red -> green)
- [ ] Find the existing createBooking unit test: `grep -ln "createBooking" backend/src/test/java/com/plotchain/booking/*.java`. Add assertions there (or a new test in the same class) that after `createBooking`:
  - saved booking has `listPrice == plot.getPrice()`, `discount` compares equal to 0, `areaSqft == plot.getAreaSqft()`, `rate == plot.getRate()`, `totalAmount == plot.getPrice()`;
  - the token installment (installmentNumber 1) has `confirmedAt == bookedAt` (the injected clock instant) and `confirmedBy == request.associateId()`; other installments have both null.
  Run `mvn test -Dtest=<that class>` — expected FAIL (nulls).
- [ ] `BookingService.createBooking`: after `booking.setTotalAmount(plot.getPrice());` add
```java
booking.setListPrice(plot.getPrice());
booking.setDiscount(BigDecimal.ZERO);
booking.setAreaSqft(plot.getAreaSqft());
booking.setRate(plot.getRate());
```
  (`Plot` already exposes `getAreaSqft()`/`getRate()`; confirm with `grep -n "getAreaSqft\|getRate" backend/src/main/java/com/plotchain/projects/Plot.java`.)
- [ ] `computeSchedule` is a private method with signature `(BigDecimal, BigDecimal, BookingEmiConfig, Instant)`; add a `UUID tokenConfirmedBy` parameter (call site passes `associate.getId()`), and in the token installment block add
```java
tokenInstallment.setConfirmedAt(bookedAt);
tokenInstallment.setConfirmedBy(tokenConfirmedBy);
```
  Do NOT touch `recordPayment` or anything else in `BookingService`.
- [ ] Rerun the createBooking test class: expected PASS.

## Task 6: Regression check
- [ ] `mvn test -Dtest='PlotBookingSchemaTest,V41MigrationTest,V45MigrationTest,<createBooking test class>,<other booking test classes from ls>'` — all green except known Mockito env noise; diff the list against the Task 0 baseline: no new failures.
- [ ] Optional broader run: `mvn test` in the backend, compare failing names to a master baseline (run `git worktree add ../baseline master`-style clean checkout once, or compare to the baseline recorded by the coordinator). Expected: only the ~55 JDK/Mockito errors, identical set. Any other failure must be explained by this change (likely a test that does a raw `INSERT INTO plot_booking` listing all columns — fine with nullable/default columns — or an enum-count assertion).

## Task 7: Manual Postgres smoke (H2-only until now)
Uses a scratch database so dev data is untouched. `plotchain-db-1` listens on 5434, user/password/db `plotchain`.
- [ ] `docker exec plotchain-db-1 psql -U plotchain -d postgres -c "CREATE DATABASE v45smoke"` — expected `CREATE DATABASE`.
- [ ] Start the backend against it so Flyway applies V1..V45 on real Postgres and `ddl-auto: validate` checks the entities: `cd /Users/ronalisenapati/Ronali/plotchain/backend && DB_NAME=v45smoke mvn spring-boot:run` (add any other required env the `run` skill lists, e.g. JWT secret). Expected log lines: `Migrating schema "public" to version "45 - plot booking reference gap"` and `Started ... in N seconds` with no `SchemaManagementException`. Stop it with Ctrl-C.
- [ ] Verify constraints on real Postgres:
```
docker exec plotchain-db-1 psql -U plotchain -d v45smoke -c "\d emi_installment" -c "\d plot_booking" -c "SELECT conname FROM pg_constraint WHERE conname IN ('chk_emi_installment_status','chk_emi_installment_payment_mode','chk_booking_event_type','chk_plot_booking_discount')"
```
  Expected: 4 constraint rows; new columns present; `discount numeric(14,2) not null default 0`.
- [ ] Backfill smoke on real Postgres: `docker exec plotchain-db-1 psql -U plotchain -d v45smoke -c "SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1"` -> `45`. (Fresh DB has no rows to backfill; the backfill is proven by `V45MigrationTest`. For an extra check, repeat the migration against a copy of dev data: `CREATE DATABASE v45copy TEMPLATE plotchain` while the dev DB is idle, run the app with `DB_NAME=v45copy`, then `SELECT count(*) FROM emi_installment WHERE status='PAID' AND confirmed_at IS NULL` must be 0 and `SELECT count(*) FROM plot_booking WHERE list_price IS NULL OR area_sqft IS NULL` must be 0.)
- [ ] Clean up: `docker exec plotchain-db-1 psql -U plotchain -d postgres -c "DROP DATABASE v45smoke"` (and `v45copy` if created).

## Done when
- V45 exists and passes `PlotBookingSchemaTest`, `V45MigrationTest`, createBooking test, and untouched pre-existing booking tests.
- `BookingService.recordPayment` unchanged; diff limited to the files in the file map.
- Postgres smoke recorded (migration applied + app starts with `validate`).
- Do not edit `plot-booking-reference-gap-units.md` (coordinator marks U1 merged) and do not commit.
