# Final Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin "Final Report" screen (Finance menu) showing, per cycle: total business, net commission, per-expense-type expenses, total payout, payout %, and refunds on separate lines.

**Architecture:** New `FinalReportService` in `com.plotchain.cycle` reuses `CycleService.getDetail` for closing totals and adds a per-expense-type sum (DB `expense_type` left-joined to `expense`) over the cycle's dates. New endpoint `GET /api/admin/cycles/{id}/final-report`. New standalone Angular component at `/admin/settings/final-report` with a cycle picker.

**Tech Stack:** Spring Boot + JPA (JPQL), JUnit5/Mockito/MockMvc; Angular standalone components, ngx-translate, Jasmine/Karma-style specs already used in repo.

**Spec:** `docs/superpowers/specs/2026-11-26-final-report-design.md`

## Global Constraints

- Commission = **net** (`CycleDetailResponse.totalNet`).
- Payout % = (net commission + total expenses) / total business, scale 2, `RoundingMode.HALF_UP`; 0 when total business is 0.
- Refunds (types "Plot Cancellation Refund", "Plot Transfer Refund") are listed separately and are NOT in total expenses, total payout or payout %.
- Expense window = `[periodStart, periodEnd or LocalDate.now()]` inclusive (same as existing trip expense).
- Expense names come from `expense_type` rows (DB), never a hardcoded list; refund types are the only names matched in code.
- CLAUDE.md: no table may scroll sideways; use `<thead>`+`<tbody>`, `data-label` on cells; check 390/800/1280px (container and page `scrollWidth <= clientWidth`). Keep money on one line.
- Verify with added+run tests, not by starting the app (project memory); width check still required.
- Commit only when the user asks.

## Review Focus

- Total business = 0 → payout % is 0, no divide-by-zero (Task 1 test).
- OPEN cycle (`periodEnd == null`) → window ends today (Task 1 test).
- Expense dated exactly on `periodStart` / `periodEnd` is included (Task 1 repo-level assertion via service test on window args).
- Expense type with no expenses in the window still appears with 0 (Task 1 test, Task 2 render test).
- Unknown cycle id → 404 (`CycleNotFoundException`); non-admin token → 403 (Task 1 controller tests).
- Cycle with no refunds → empty refunds block shows totals 0, not a crash (Task 2 test).

---

### Task 1: Backend endpoint + Trip-name fix

**Files:**
- Create: `backend/src/main/java/com/plotchain/cycle/CycleFinalReportResponse.java`
- Create: `backend/src/main/java/com/plotchain/cycle/FinalReportService.java`
- Create: `backend/src/main/java/com/plotchain/expense/ExpenseTypeTotal.java`
- Modify: `backend/src/main/java/com/plotchain/expense/ExpenseRepository.java`
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleController.java:38-41` (add endpoint)
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java:129-131` (Trip fix)
- Modify: `backend/src/main/java/com/plotchain/booking/BookingService.java:671,704` (make the two refund-name constants `public`)
- Test: `backend/src/test/java/com/plotchain/cycle/FinalReportServiceTest.java` (new), `CycleControllerTest.java`, `CycleServiceTest.java:155`

**Interfaces:**
- Produces:
  - `public interface ExpenseTypeTotal { String getName(); BigDecimal getTotal(); }` (Spring projection, package `com.plotchain.expense`)
  - `ExpenseRepository.List<ExpenseTypeTotal> sumByTypeBetween(LocalDate from, LocalDate to)`: JPQL `SELECT t.name AS name, COALESCE(SUM(e.amount), 0) AS total FROM ExpenseType t LEFT JOIN Expense e ON e.expenseTypeId = t.id AND e.expenseDate BETWEEN :from AND :to GROUP BY t.name ORDER BY t.name` (every type, zero rows included).
  - `public record NamedAmount(String name, BigDecimal amount)` nested in `CycleFinalReportResponse`.
  - `public record CycleFinalReportResponse(UUID cycleId, LocalDate periodStart, LocalDate periodEnd, CycleStatus status, BigDecimal totalBusiness, BigDecimal netCommission, List<CycleIncomeTypeTotal> incomeTypeTotals, List<NamedAmount> expenses, BigDecimal totalExpenses, BigDecimal totalPayout, BigDecimal payoutPercent, List<NamedAmount> refunds, BigDecimal totalRefunds)`
  - `FinalReportService.CycleFinalReportResponse getFinalReport(UUID cycleId)` (constructor: `CycleService`, `ExpenseRepository`).
  - `GET /api/admin/cycles/{id}/final-report` → `CycleFinalReportResponse`.
- Consumes: `CycleService.getDetail(UUID)` → `CycleDetailResponse` (fields `totalNet`, `totalBusiness`, `incomeTypeTotals`, `periodStart`, `periodEnd`, `status`, `id`).

- [ ] **Step 1: Write failing `FinalReportServiceTest`** (Mockito, mock `CycleService` + `ExpenseRepository`; stub `getDetail` with totalNet 250000, totalBusiness 1000000, period 2026-11-01..2026-11-15; stub `sumByTypeBetween(2026-11-01, 2026-11-15)` with Trip Expense 40000, Salary 10000, Plot Cancellation Refund 30000, Plot Transfer Refund 10000, Office 0). Tests:
  - `splitsRefundsFromExpensesAndComputesPayout`: `expenses` names = {Office, Salary, Trip Expense} (DB order), `refunds` names = {Plot Cancellation Refund, Plot Transfer Refund}; `totalExpenses` = 50000; `totalRefunds` = 40000; `totalPayout` = 300000; `payoutPercent` = 30.00.
  - `zeroBusinessGivesZeroPercent`: totalBusiness 0 → `payoutPercent` = 0.
  - `openCycleUsesTodayAsWindowEnd`: `periodEnd` null → verify `sumByTypeBetween(periodStart, LocalDate.now())`.
  - `keepsZeroAmountTypes`: "Office" present in `expenses` with amount 0.
  - `unknownCycleBubblesNotFound`: `getDetail` throws `CycleNotFoundException` → propagates.
- [ ] **Step 2: Run** `cd backend && mvn -q test -Dtest=FinalReportServiceTest` → FAIL (classes missing).
- [ ] **Step 3: Implement** the repo query + projection, records, and `FinalReportService`. Refund names matched case-insensitively against `BookingService.REFUND_EXPENSE_TYPE` / `TRANSFER_REFUND_EXPENSE_TYPE` (made `public static final`); everything else is an expense. Percent: `totalPayout.multiply(100).divide(totalBusiness, 2, HALF_UP)`.
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Controller test** in `CycleControllerTest`: `finalReportReturnsBreakdownForAdminToken` (mock `FinalReportService`, assert `$.payoutPercent`, `$.expenses[0].name`, `$.refunds[0].amount`), `finalReportIsForbiddenForNonAdmin` (associate token → 403), `finalReportReturns404WhenCycleMissing` (mirror existing `detailReturns404...`). Run → FAIL, then add `@GetMapping("/{id}/final-report")` in `CycleController` (inject `FinalReportService`) → PASS.
- [ ] **Step 6: Trip fix.** In `CycleService.getDetail` replace the `"Trip"` literal with a `private static final String TRIP_EXPENSE_TYPE = "Trip Expense"` (the V93 seeded system type). Update `CycleServiceTest.java:155` stub to `"Trip Expense"`. Run `mvn -q test -Dtest='CycleServiceTest,CycleControllerTest,FinalReportServiceTest'` → PASS (ignore the known spurious Mockito JDK errors only if they are in unrelated classes).

---

### Task 2: Frontend screen, route, menu entry

**Files:**
- Create: `frontend/src/app/admin/models/final-report.model.ts`
- Create: `frontend/src/app/admin/final-report/final-report.service.ts` (+ `.spec.ts`)
- Create: `frontend/src/app/admin/final-report/final-report.component.ts` (+ `.spec.ts`)
- Modify: `frontend/src/app/app.routes.ts:134` (add child), `frontend/src/app/app.routes.spec.ts` (~line 205 pattern)
- Modify: `frontend/src/app/admin-nav-categories.model.ts:61` and `admin-nav-categories.model.spec.ts:23`
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json` (`settings.sections.finalReport`, `admin.finalReport.*`)

**Interfaces:**
- Consumes: `CycleManagementService.list(status: '', page: 0, size: 100): Observable<CyclePage>` for the picker; `GET /api/admin/cycles/{id}/final-report`.
- Produces:
  - `FinalReport` interface mirroring `CycleFinalReportResponse` (`cycleId, periodStart, periodEnd: string|null, status: CycleStatus, totalBusiness, netCommission, incomeTypeTotals: CycleIncomeTypeTotal[], expenses: NamedAmount[], totalExpenses, totalPayout, payoutPercent, refunds: NamedAmount[], totalRefunds`), `NamedAmount { name: string; amount: number }`.
  - `FinalReportService.get(cycleId: string): Observable<FinalReport>`.
  - `FinalReportComponent` selector `app-final-report`, route `final-report` with `data: { sectionKey: 'finalReport' }`; nav item `{ key: 'finalReport', labelKey: 'settings.sections.finalReport', path: '/admin/settings/final-report' }` placed right after `cycleManagement` in `finance`.

- [ ] **Step 1: Failing specs.**
  - service spec: `get('c1')` issues GET `/api/admin/cycles/c1/final-report`.
  - nav spec: finance row becomes `['ledgerRegister','cycleManagement','finalReport','payoutApproval','expenseTypes']`.
  - routes spec: `final-report` child has `data` equal `{ sectionKey: 'finalReport' }`.
  - component spec: loads cycles, auto-selects the first, calls `get`; renders payout % as text (e.g. `30.00%`); renders every expense row incl. a 0 one; refunds render in a separate section with their own total and are absent from the payout total cell; empty `refunds` array renders without error; changing the picker calls `get` with the new id; HTTP error shows `app-inline-banner`.
- [ ] **Step 2: Run** `cd frontend && npx ng test --watch=false --include='src/app/admin/final-report/**/*.spec.ts' --include='src/app/admin-nav-categories.model.spec.ts' --include='src/app/app.routes.spec.ts'` → FAIL.
- [ ] **Step 3: Implement** the model, service, component (standalone; imports `CommonModule, FormsModule, TranslateModule, InlineBannerComponent`; money via `formatInr` from `shared/utils/plot-grid.util`; cycle `<select>` labelled like `ledger-register` does with `periodStart – periodEnd|ongoing`). Layout: summary block (business, net commission, total expenses, total payout, payout %), income-by-type table, expenses table, refunds table. Tables are plain `<table><thead><tbody>` with `data-label` cells; own SCSS prefix `final-report__`; styles in the component (or `_admin.scss` if that is where sibling screens put theirs) with no `min-width`/`overflow-x`.
- [ ] **Step 4: Wire** route, nav item, `en.json` + `hi.json` strings (en: "Final Report"; hi: "अंतिम रिपोर्ट"). Keep key sets identical in both files.
- [ ] **Step 5: Run** the Step 2 command → PASS; then `npx ng build` (type check) → no errors.
- [ ] **Step 6: Width check** at 390px, 800px, 1280px for the three tables and the page (`scrollWidth <= clientWidth`). Use a component spec that sets host width and asserts `.table--stacked` handling is not blocked, or the repo's existing e2e width helper if one exists (`frontend/e2e`); report what was checked.
