# Sponsor's Matching Income + Self Performance Bonus on Cycle Income Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `sponsorMatchingIncome` and `selfPerformanceBonus` to the dashboard's cycle income card, sourced from `IncomeType.SPONSOR_MATCHING`/`SELF_PERFORMANCE` ledger entries that already exist but aren't surfaced anywhere on the dashboard.

**Architecture:** Backend: two more `ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(...)` calls in `DashboardService.getDashboard`, same pattern as the existing DIRECT/MATCHING calls, feeding two new fields on the `CycleIncome` record. `totalIncome` is unaffected — it's already `sumNetAmountByAssociateAndCycle`, an all-types sum for the cycle, so it already includes these amounts today even though nothing shows them broken out. Frontend: two new lines in `cycle-income-card.component.ts`, matching the existing direct/matching lines.

**Tech Stack:** Spring Boot 3.3.x (Java 21), JUnit 5 + Mockito + AssertJ, Angular 18 standalone components, Jasmine/Karma, `@ngx-translate/core`.

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` (§3.1 table rows `CycleIncome.sponsorMatchingIncome` / `CycleIncome.selfPerformanceBonus`; §3.2 income-card ordering: Direct / Matching / Sponsor's Matching / Self Performance / Royalty / Total — this plan builds the two Sponsor's Matching/Self Performance rows only, Royalty Bonus is a separate unit)

## Global Constraints

- Every associate-facing string needs both an English (`frontend/src/assets/i18n/en.json`) and Hindi (`frontend/src/assets/i18n/hi.json`) translation key — no hardcoded UI text.
- No new migration, no new repository method — `LedgerEntryRepository.sumNetAmountByAssociateCycleAndType` and `IncomeType.SPONSOR_MATCHING`/`SELF_PERFORMANCE` already exist.
- Currency values render via Angular's `currency:'INR'` pipe, matching every other money field on this card.

---

### Task 1: Backend — extend `CycleIncome` with sponsor's matching income and self performance bonus

**Files:**
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java:20`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java:76-78`, `:132`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Consumes: `LedgerEntryRepository.sumNetAmountByAssociateCycleAndType(UUID associateId, UUID cycleId, IncomeType type)` (already exists, already used for DIRECT/MATCHING), `IncomeType.SPONSOR_MATCHING`, `IncomeType.SELF_PERFORMANCE` (already exist in the enum).
- Produces: `DashboardResponse.CycleIncome` record gains two new components, in this order: `sponsorMatchingIncome`, `selfPerformanceBonus` (both `BigDecimal`), appended after `matchingIncome` and before `totalIncome`. Task 2 (frontend) reads these as `data.sponsorMatchingIncome` / `data.selfPerformanceBonus` on the `CycleIncome` TS interface.

- [ ] **Step 1: Write the failing service-level test**

Add two assertions to the existing `aggregatesAllDashboardWidgetsForAnAssociate` test in `DashboardServiceTest.java` (it already stubs DIRECT and MATCHING at lines 97-100 — add two more stubs right after them, and two more assertions right after the existing `matchingIncome`/`totalIncome` assertions at lines 125-127):

```java
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.SPONSOR_MATCHING))
            .thenReturn(BigDecimal.valueOf(300));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.SELF_PERFORMANCE))
            .thenReturn(BigDecimal.valueOf(200));
```

(placed directly after the existing `IncomeType.MATCHING` stub, before the `sumNetAmountByAssociateAndCycle` stub)

```java
        assertThat(response.cycleIncome().sponsorMatchingIncome()).isEqualByComparingTo("300");
        assertThat(response.cycleIncome().selfPerformanceBonus()).isEqualByComparingTo("200");
```

(placed directly after `assertThat(response.cycleIncome().matchingIncome())...` and before `assertThat(response.cycleIncome().totalIncome())...`)

Also add a new, separate test for the zero-income case — a fresh associate with no ledger entries of these two types yet. `projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction` (lines 147-196) already stubs `sumNetAmountByAssociateCycleAndType(any(), any(), any())` to return `BigDecimal.ZERO` for every type, which already covers this case implicitly — add one assertion to that existing test, right after the `projectedMatchAmount` assertion at line 194:

```java
        assertThat(response.cycleIncome().sponsorMatchingIncome()).isEqualByComparingTo("0");
        assertThat(response.cycleIncome().selfPerformanceBonus()).isEqualByComparingTo("0");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: compile error — `CycleIncome` has no method `sponsorMatchingIncome()`/`selfPerformanceBonus()` yet.

- [ ] **Step 3: Extend the `CycleIncome` record**

In `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java:20`, change:

```java
    public record CycleIncome(UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal totalIncome) {}
```

to:

```java
    public record CycleIncome(UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal sponsorMatchingIncome, BigDecimal selfPerformanceBonus, BigDecimal totalIncome) {}
```

- [ ] **Step 4: Populate the two new fields in `DashboardService`**

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java:76-78`, currently:

```java
        BigDecimal direct = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.MATCHING);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycle.getId());
```

change to:

```java
        BigDecimal direct = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.MATCHING);
        BigDecimal sponsorMatching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.SPONSOR_MATCHING);
        BigDecimal selfPerformance = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.SELF_PERFORMANCE);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycle.getId());
```

Then in the same file at line 132, currently:

```java
            new DashboardResponse.CycleIncome(cycle.getId(), direct, matching, total),
```

change to:

```java
            new DashboardResponse.CycleIncome(cycle.getId(), direct, matching, sponsorMatching, selfPerformance, total),
```

- [ ] **Step 5: Run the service test to verify it passes**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: PASS, all tests in the class green.

- [ ] **Step 6: Add a controller-level assertion proving end-to-end wiring**

In `DashboardControllerTest.java`, `returnsDashboardJsonForTheAuthenticatedAssociate` (lines 67-112) already stubs `sumNetAmountByAssociateCycleAndType(any(), any(), any())` to return `BigDecimal.ZERO` for every type (line 95), so the new fields will already resolve to `0` under that stub. Add two `jsonPath` assertions to the existing chain at lines 108-111:

```java
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.teamSnapshot.totalDownline").value(12))
            .andExpect(jsonPath("$.associate.name").value("Asha Kumar"))
            .andExpect(jsonPath("$.associate.joinedAt").value(joinedAt.toString()))
            .andExpect(jsonPath("$.cycleIncome.sponsorMatchingIncome").value(0))
            .andExpect(jsonPath("$.cycleIncome.selfPerformanceBonus").value(0));
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && mvn test -q`
Expected: PASS except the pre-existing, unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` dev-secret-guard failures (4 total, environment-dependent JDK/Mockito mismatch — see `issues.md`). No other class should show new failures.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java backend/src/main/java/com/plotchain/dashboard/DashboardService.java backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "feat(dashboard): add sponsor's matching income and self performance bonus to cycle income"
```

---

### Task 2: Frontend — render Sponsor's Matching and Self Performance rows on the cycle income card

**Files:**
- Modify: `frontend/src/app/dashboard/models/dashboard-response.model.ts:10-15`
- Modify: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.spec.ts:18`
- Modify: `frontend/src/assets/i18n/en.json:4-6`
- Modify: `frontend/src/assets/i18n/hi.json:4-6`

**Interfaces:**
- Consumes: Task 1's `DashboardResponse.CycleIncome` JSON shape — `sponsorMatchingIncome`, `selfPerformanceBonus` fields (both numbers, both always present, `0` when no ledger entries of that type exist yet).
- Produces: no new consumers in this plan.

- [ ] **Step 1: Write the failing component test**

In `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts`, replace the `beforeEach` fixture data and the first test with:

```typescript
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CycleIncomeCardComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(CycleIncomeCardComponent);
    fixture.componentInstance.data = {
      cycleId: 'c1',
      directIncome: 1000,
      matchingIncome: 500,
      sponsorMatchingIncome: 300,
      selfPerformanceBonus: 200,
      totalIncome: 2000
    };
    fixture.detectChanges();
  });

  it('renders direct, matching, sponsor matching, self performance, and total income', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1,000');
    expect(text).toContain('500');
    expect(text).toContain('300');
    expect(text).toContain('200');
    expect(text).toContain('2,000');
  });
```

Leave the second test (`links to the income statement screen`) unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-income-card.component.spec.ts'`
Expected: FAIL — TS compile error, `sponsorMatchingIncome`/`selfPerformanceBonus` don't exist on type `CycleIncome`.

- [ ] **Step 3: Extend the `CycleIncome` TS interface**

In `frontend/src/app/dashboard/models/dashboard-response.model.ts:10-15`, currently:

```typescript
export interface CycleIncome {
  cycleId: string;
  directIncome: number;
  matchingIncome: number;
  totalIncome: number;
}
```

change to:

```typescript
export interface CycleIncome {
  cycleId: string;
  directIncome: number;
  matchingIncome: number;
  sponsorMatchingIncome: number;
  selfPerformanceBonus: number;
  totalIncome: number;
}
```

- [ ] **Step 4: Add i18n keys**

In `frontend/src/assets/i18n/en.json`, currently (lines 4-6):

```json
    "direct": "Direct",
    "matching": "Matching",
    "total": "Total",
```

change to:

```json
    "direct": "Direct",
    "matching": "Matching",
    "sponsorMatching": "Sponsor's Matching",
    "selfPerformance": "Self Performance Bonus",
    "total": "Total",
```

In `frontend/src/assets/i18n/hi.json`, currently (lines 4-6):

```json
    "direct": "प्रत्यक्ष",
    "matching": "मैचिंग",
    "total": "कुल",
```

change to:

```json
    "direct": "प्रत्यक्ष",
    "matching": "मैचिंग",
    "sponsorMatching": "स्पॉन्सर मैचिंग",
    "selfPerformance": "सेल्फ परफॉर्मेंस बोनस",
    "total": "कुल",
```

- [ ] **Step 5: Add the two template rows**

In `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts`, currently:

```typescript
  template: `
    <a class="cycle-income-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</div>
      <div class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</div>
      <div class="total">{{ 'dashboard.total' | translate }}: {{ data.totalIncome | currency:'INR' }}</div>
    </a>
  `
```

change to:

```typescript
  template: `
    <a class="cycle-income-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</div>
      <div class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</div>
      <div class="sponsor-matching">{{ 'dashboard.sponsorMatching' | translate }}: {{ data.sponsorMatchingIncome | currency:'INR' }}</div>
      <div class="self-performance">{{ 'dashboard.selfPerformance' | translate }}: {{ data.selfPerformanceBonus | currency:'INR' }}</div>
      <div class="total">{{ 'dashboard.total' | translate }}: {{ data.totalIncome | currency:'INR' }}</div>
    </a>
  `
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-income-card.component.spec.ts'`
Expected: PASS.

- [ ] **Step 7: Fix the other `CycleIncome` fixture broken by the interface change**

`frontend/src/app/dashboard/dashboard.component.spec.ts:18` has its own `CycleIncome` literal that predates the two new required fields and will now fail TS compilation. Currently:

```typescript
    cycleIncome: { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, totalIncome: 1500 },
```

change to:

```typescript
    cycleIncome: { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, sponsorMatchingIncome: 300, selfPerformanceBonus: 200, totalIncome: 2000 },
```

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/dashboard/models/dashboard-response.model.ts frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts frontend/src/app/dashboard/dashboard.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): render sponsor's matching income and self performance bonus rows"
```
