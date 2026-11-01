# Direct Income Goes to the Seller's Sponsor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Credit Direct Income (6% of a sale) to the seller's sponsor (`Associate.sponsorId`) instead of the seller, fix the open cycles' existing entries through the admin Recalculate, and make the docs and UI say and show that.

**Architecture:** `SaleService.persistSaleAndIncome` writes the `DIRECT` ledger entry for the seller's sponsor. Every associate must have a sponsor, so a missing one is a data-integrity error. Everything downstream (dashboard, admin stats, ledger register) reads `ledger_entry.associate_id`, so it follows on its own. For existing data, `CycleService.reRateDirectIncome` already runs on every live refresh, admin Recalculate and close. It also re-points each open-cycle Direct entry to the seller's sponsor, including `PAID` ones, and moves the wallet credit with it. The associate Income Statement "Direct" tab shows the seller (the sponsee) and the sale amount on each row.

**Tech Stack:** Spring Boot / JPA / Flyway (backend), Angular (frontend), JUnit 5 + Mockito, Jasmine/Karma.

**Spec:** `compensation-plan-reference.md` §1 ("Direct Income | 6% | The plot sale value | One hop — only the direct sponsor of the seller") and §6 Round 1. Both are transcribed from `Samvardhani Income Process..pdf` p.1: "you" earn 6% × A's ₹10L + 6% × B's ₹10L = ₹1,20,000, where A and B are your sponsees. Product decisions from 2026-11-01:
- Fix existing data by recalculating the open cycles, already-paid entries included.
- Closed-cycle (historical) data is ignored, because the app is still in testing.
- An associate without a sponsor must never exist, except the admin (`AssociateRole.ADMIN`, e.g. the V18 `admin` seed). The admin has no sponsor and may still sell, and nobody earns Direct Income on the admin's sales.

## Global Constraints

- Earner = `seller.getSponsorId()`. This is the **sponsor** (`sponsor_id`), not the binary-tree **parent** (`parent_id`).
- Seller with `role == AssociateRole.ADMIN` and `sponsorId == null`: the sale is recorded and no DIRECT entry is written.
- Any other seller with `sponsorId == null`, or a sponsor id with no associate row, is a data-integrity error: throw `IllegalStateException`, so the transaction rolls back. Never skip silently.
- The seller earns no Direct Income on their own sale.
- Amount math doesn't change: gross = amount × `directIncomePct`/100, minus TDS and the Processing Fee (`adminChargeWithPanPct`).
- Only OPEN cycles are recalculated. Closed cycles are never touched.
- CLAUDE.md table rule: check every changed table at 390px, 800px and 1280px. The container and the page must have `scrollWidth <= clientWidth`.
- Backend `mvn test` shows about 55 spurious Mockito errors from a JDK mismatch (see memory). Run the named test classes, and compare against a master baseline.

## Review Focus

1. **Recalculate run twice.** The second run moves no wallet money and changes no rows: re-pointing happens only when `entry.associateId != seller.sponsorId`. Test in Task 4.
2. **PAID entry re-pointed after the seller already withdrew.** The seller's wallet balance can go negative. That's accepted while in testing: use `creditBalance(seller, net.negate())`, not `debitIfSufficient`, which would silently do nothing. Test in Task 4.
3. **Sponsor has no wallet row yet.** Create `Wallet.zero(sponsorId)` before crediting, as `WalletCreditingService.creditEntries` does. Otherwise `creditBalance` updates 0 rows and the money vanishes. Test in Task 4.
4. **A voided sale's Direct entry.** It's REVERSED, so Recalculate must leave it alone: no re-point, no wallet move. Test in Task 4.
5. **Income Statement Direct tab on a row whose sale lookup misses.** Expected: blank ID and name, no crash. Test in Task 2.
6. **Voiding an admin's sale.** It has zero ledger entries. Today `voidSale` throws `"ledger_entry row missing ..."` in that case. Expected: the void succeeds. Test in Task 1.

---

### Task 1: Credit Direct Income to the sponsor

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java:111-133` (create entry), `:201-210` (void guard)
- Test: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java` (update tests at :182, :263, and any other DIRECT test asserting `getAssociateId()).isEqualTo(ASSOCIATE_ID)`)

**Interfaces:**
- Produces: a DIRECT `LedgerEntry` with `associateId = seller.sponsorId` and `sourceRef = sale.id`. `sourceRef` is unchanged; Tasks 2 and 4 rely on it. Also `public static Optional<UUID> SaleService.directIncomeEarner(Associate seller, AssociateRepository associates)`, used by Task 4.

- [ ] **Step 1: Write failing tests in `SaleServiceTest`.** Give the seller fixture a `SPONSOR_ID` and stub `associateRepository.findById(SPONSOR_ID)`.
  - `paymentCreditsDirectIncomeToTheSellersSponsor`: captured DIRECT entry has `getAssociateId() == SPONSOR_ID`.
  - Update `recordInstallmentPaymentCreditsDirectIncomeForTheInstallmentAmount` and `paymentSavesADirectIncomeLedgerEntryMatchingRound1DocFixture` to assert `SPONSOR_ID`. The ₹60,000 gross on ₹10,00,000 stays.
  - `paymentThrowsWhenNonAdminSellerHasNoSponsor`: role `ASSOCIATE` with `sponsorId == null` throws `IllegalStateException`.
  - `adminSaleWithNoSponsorIsRecordedWithoutDirectIncome`: role `ADMIN` with `sponsorId == null`. The sale is saved, and `verify(ledgerEntryRepository, never()).save(argThat(e -> e.getIncomeType() == IncomeType.DIRECT))`.
  - `voidSaleSucceedsWhenTheSaleHasNoLedgerEntries`: `findAllBySourceRef` returns `List.of()`. No throw, and the sale is VOIDED.
  - `paymentThrowsWhenSponsorRowIsMissing`: `findById(SPONSOR_ID)` returns empty and throws `IllegalStateException`.
- [ ] **Step 2: Run** `cd backend && mvn -q test -Dtest=SaleServiceTest`. Expected: the new and updated cases FAIL.
- [ ] **Step 3: Implement** a `public static Optional<UUID> directIncomeEarner(Associate seller, AssociateRepository associates)` in `SaleService`, so Task 4 reuses the same rule. If `sponsorId` is null and the role is `ADMIN`, return `Optional.empty()`. If `sponsorId` is null for any other role, throw `IllegalStateException("associate " + id + " has no sponsor - every associate must have one")`. Check the row exists with `associateRepository.existsById`, or throw `IllegalStateException("sponsor row missing for associate " + id)`. Otherwise return `Optional.of(sponsorId)`. Wrap the DIRECT block in `directIncomeEarner(associate).ifPresent(...)` and use the earner in place of `sale.getAssociateId()` on line 124. In `voidSale`, delete the empty-list `IllegalStateException`; the loop already handles an empty list. Update that comment too: an admin's sale has no Direct entry. Update the "Flow step 8" comment to cite `compensation-plan-reference.md` §1.
- [ ] **Step 4: Run** the same command. Expected: PASS. Other failures should only be the known Mockito/JDK noise, matching the master baseline.
- [ ] **Step 5: Commit** `fix(sales): Direct Income credits the seller's sponsor, not the seller`

### Task 2: Income Statement Direct tab shows the seller and the sale amount

The Direct tab currently fills "Associate ID / Name" with the viewer's own profile (`income-statement.component.ts:576-577`) and "Amount" with the income gross. After Task 1, each row is income from a sponsee's sale, so those columns should show that sponsee and the sale amount.

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/AssociateLedgerEntryResponse.java` (add fields)
- Modify: `backend/src/main/java/com/plotchain/income/LedgerService.java` (`myList`, `toAssociateResponse`)
- Modify: `frontend/src/app/income-statement/models/associate-ledger-entry.model.ts`
- Modify: `frontend/src/app/income-statement/income-statement.component.ts:573-585`
- Test: `backend/src/test/java/com/plotchain/income/LedgerServiceTest.java`, `frontend/src/app/income-statement/income-statement.component.spec.ts`

**Interfaces:**
- Consumes: DIRECT `sourceRef` = sale id (Task 1).
- Produces: `AssociateLedgerEntryResponse` gains `String sponseeName, BigDecimal saleAmount`, appended after `sponseeMatchingAmount`. These are filled only for DIRECT rows. DIRECT rows also fill the existing `sponseeUserId` with the seller's `userId`. Everything is null on a lookup miss. The TS model gains `sponseeName?: string | null; saleAmount?: number | null;`.

- [ ] **Step 1: Write a failing backend test** `myListDirectRowCarriesSellerAndSaleAmount`: a DIRECT entry with `sourceRef = saleId`. The sale has `associateId = SELLER_ID` and `amount = 1000000`. The seller has `userId "PC1002"` and `name "A"`. Response row: `sponseeUserId == "PC1002"`, `sponseeName == "A"`, `saleAmount == 1000000`. Second case: the sale is missing, so all three are null.
- [ ] **Step 2: Write a failing frontend test** `direct tab shows seller id, name and sale amount`: a row with `sponseeUserId 'PC1002'`, `sponseeName 'A'`, `saleAmount 1000000` and `grossAmount 60000` renders associateId `PC1002`, name `A`, an amount of ₹10,00,000.00 and a directIncome of ₹60,000.00. With nulls it renders `''` for the ID and name.
- [ ] **Step 3: Run** `mvn -q test -Dtest=LedgerServiceTest` and `cd frontend && npx ng test --watch=false --include='**/income-statement.component.spec.ts'`. Expected: FAIL.
- [ ] **Step 4: Implement.** In `myList`, batch-load sales for the DIRECT rows' `sourceRef` with `saleRepository.findAllById` (already injected), then their sellers with `associatesById` or `associateRepository.findAllById`. Use one query each, no per-row lookups, same as `sponseeMatchingEntries`. Pass the values into `toAssociateResponse`.  `AdminLedgerEntryResponse` is a separate record: leave it unchanged. In the component, map `associateId: entry.sponseeUserId ?? ''`, `name: entry.sponseeName ?? ''`, `amount: formatCurrency(entry.saleAmount)`. The total row sums `saleAmount` for `amount`.
- [ ] **Step 5: Run** both commands. Expected: PASS.
- [ ] **Step 6: Check the table widths.** Run the app (`run` skill) as an associate with a sponsee sale, open Income Statement and choose Direct. At 390, 800 and 1280px, the table container and the page must have `scrollWidth <= clientWidth`.
- [ ] **Step 7: Commit** `feat(income-statement): Direct tab shows the selling sponsee and sale amount`

### Task 3: Setup preview math and docs

The setup Compensation step's preview says "if an associate sells ₹10L on each leg". Under the PDF rule, Direct comes from the sponsees on both legs: 2 × volume × pct. That is Round 1's ₹1,20,000.

**Files:**
- Modify: `frontend/src/app/setup/steps/compensation/sample-earnings.ts:52-53` (math + comment)
- Test: `frontend/src/app/setup/steps/compensation/sample-earnings.spec.ts`
- Modify docs: `setup-onboarding-spec.md:56` → `applied to each direct sponsee's sale (paid to their sponsor)`; `mlm-land-platform-spec.md:76` → `credited to the seller's sponsor (one hop up sponsor_id). Only the admin has no sponsor, and the admin's own sales earn no Direct Income. See compensation-plan-reference.md §1.`; `docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md:13` → add a dated note: "Superseded 2026-11-01: Direct Income credits the seller's sponsor, see compensation-plan-reference.md §1."

- [ ] **Step 1: Write a failing test** `direct income counts both legs' sponsee sales`: `scenarioVolume 1000000`, `directIncomePct 6` gives `directIncome === 120000`. Update any existing assertion that expects `60000`.
- [ ] **Step 2: Run** `npx ng test --watch=false --include='**/sample-earnings.spec.ts'`. Expected: FAIL.
- [ ] **Step 3: Implement** `directIncome = (2 * scenarioVolume * directIncomePct) / 100`, with a comment citing Round 1.
- [ ] **Step 4: Run.** Expected: PASS. Also run `compensation-step.component.spec.ts`, since it may assert preview totals. Fix any expected numbers there to match.
- [ ] **Step 5: Edit the three doc lines** listed above.
- [ ] **Step 6: Commit** `fix(setup): Direct Income preview counts both legs' sponsee sales; docs updated`

### Task 4: Recalculate re-points open-cycle Direct entries to the sponsor

`computeIncome` (`CycleService.java:245`) runs on every live refresh, on the admin "Recalculate" (`refreshAllOpenCycles`) and on close, and it already calls `reRateDirectIncome`. Extend that method so existing open-cycle entries move to the sponsor. After deploying, the admin presses Recalculate once.

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java:401-424` (`reRateDirectIncome`) and its call at `:263`; constructor gains `WalletRepository`
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java` (add a finder)
- Test: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `SaleService.directIncomeEarner(Associate seller, AssociateRepository associates): Optional<UUID>` from Task 1. `CycleService` already imports the `sales` package. In tests, pass the mocked `AssociateRepository`.
- Produces:
  - `LedgerEntryRepository.findByCycleIdAndIncomeType(UUID cycleId, IncomeType incomeType): List<LedgerEntry>`, a derived query covering every status.
  - `reRateDirectIncome(UUID cycleId, List<Sale> sales, Map<UUID, Associate> associatesById, CompensationPlanVersion planVersion)`. `computeIncome` builds `associatesById` from the `associates` list it already loads.

- [ ] **Step 1: Write failing tests in `CycleServiceTest`** (`refreshAllOpenCycles` or `refreshLiveIncome` path):
  - `recalculateRePointsPendingDirectEntryToSponsor`: a PENDING DIRECT entry on `SELLER_ID` for a ₹10,00,000 sale. The seller's sponsor is `SPONSOR_ID`. After refresh: `associateId == SPONSOR_ID`, gross ₹60,000 (re-rated as today), and no `walletRepository` interaction.
  - `recalculateRePointsPaidDirectEntryAndMovesWalletCredit`: a PAID entry on `SELLER_ID` with net ₹55,800. After refresh: `associateId == SPONSOR_ID`, status still PAID, amounts unchanged. Verify `creditBalance(SELLER_ID, -55800)` and `creditBalance(SPONSOR_ID, 55800)`.
  - `recalculateCreatesSponsorWalletBeforeCrediting`: `existsById(SPONSOR_ID)` is false. Verify `save(Wallet.zero(SPONSOR_ID))` happens before the credit (`InOrder`).
  - `recalculateIsIdempotentForDirectEntries`: an entry already on `SPONSOR_ID` gets no re-point and `verifyNoInteractions(walletRepository)`.
  - `recalculateLeavesReversedDirectEntryAlone`: a REVERSED entry on `SELLER_ID` (its sale is voided, so it's not in `sales`) stays unchanged, with no wallet calls.
  - `recalculateThrowsWhenNonAdminSellerHasNoSponsor`: `IllegalStateException`.
  - `recalculateReversesDirectEntryOnAdminSale`: a PENDING entry on the admin, for the admin's own sale, becomes REVERSED with no wallet calls. A PAID one also becomes REVERSED, with `creditBalance(ADMIN_ID, -net)`.
- [ ] **Step 2: Run** `mvn -q test -Dtest=CycleServiceTest`. Expected: the new cases FAIL. Update the test's `CycleService` constructor for the new `WalletRepository` mock.
- [ ] **Step 3: Implement.** In `reRateDirectIncome`, loop over `findByCycleIdAndIncomeType(cycleId, DIRECT)`, skipping REVERSED rows and rows whose sale is not in `sales`. Resolve the earner as `associatesById.get(sale.getAssociateId()).getSponsorId()`, with the null and missing checks. If the earner is empty (an admin's sale), set the entry REVERSED. If it was PAID, first `creditBalance(old, net.negate())`. Otherwise, if `entry.associateId != earner`:
  - If the entry is PAID: create the sponsor wallet if missing, then `walletRepository.creditBalance(old, net.negate())` and `walletRepository.creditBalance(earner, net)`.
  - Set `associateId = earner`.

  Then re-rate the amounts only if the entry isn't PAID, as today. Save if anything changed. Update the method comment: it now also enforces the earner rule on existing rows, and PAID rows move their wallet credit. Add `// ponytail: seller balance may go negative if they already withdrew; fine while in testing, add a clawback flow before go-live with real money.`
- [ ] **Step 4: Run** `mvn -q test -Dtest=CycleServiceTest,SaleServiceTest`. Expected: PASS, apart from the known noise.
- [ ] **Step 5: Check on a dev DB clone.** The memory notes say to verify via a DB clone, and the IDE owns :8081. Start the app (`run` skill) and log in as admin. Go to Associate Directory and press Recalculate. Then:
  - A sponsor's dashboard Direct figure equals 6% of their sponsees' open-cycle sales.
  - The seller's Direct figure is 0.
  - The sponsor's wallet balance went up by the PAID entries' net, and the seller's went down by the same.
  - Pressing Recalculate a second time changes no balances.
- [ ] **Step 6: Commit** `fix(cycle): Recalculate moves open-cycle Direct Income to the seller's sponsor`

---

**Not in this plan:**
- Closed cycles: these are testing data, so they're ignored by decision.
- A clawback flow for negative seller balances, which is only needed before go-live.
- An admin Ledger Register "seller" column. Add it when admins ask; the earner column is already correct.
- A DB constraint for "sponsor required unless ADMIN". The code checks it instead (Task 1). Add a `CHECK (sponsor_id IS NOT NULL OR role = 'ADMIN')` once test data is clean.
