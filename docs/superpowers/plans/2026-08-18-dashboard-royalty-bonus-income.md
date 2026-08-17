# Royalty Bonus on Cycle Income Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `royaltyBonus` (amount) and `royaltyBonusPct` (the volume-slab percentage that produced it) to the dashboard's cycle income card, completing the card's income breakdown (Direct / Matching / Sponsor's Matching / Self Performance / Royalty / Total) per the spec's full ordering.

**Architecture:** Backend: `royaltyBonus` is a `ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(...)` call, same pattern as every other income line already on this card. `royaltyBonusPct` is a new lookup: `RoyaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(planVersionId, matchedVolume)` — a volume-slab match against the same `min(left, right)` leg volume `DashboardService` already computes for `projectedMatchAmount`, using the same `CompensationPlanVersion` row already fetched for `matchingIncomePct`. No new migration; `RoyaltyBonusRateRepository` and its seeded slabs (`V23__royalty_bonus_rate_volume_slab.sql`) already exist and are already used the same way by `CycleService`'s own royalty-bonus computation. Frontend: one more row on `cycle-income-card.component.ts`, showing the bonus amount and the percentage that produced it together.

**Tech Stack:** Spring Boot 3.3.x (Java 21), Spring Data JPA, JUnit 5 + Mockito + AssertJ, Angular 18 standalone components, Jasmine/Karma, `@ngx-translate/core`.

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` (§3.1 table rows `CycleIncome.royaltyBonus` / `CycleIncome.royaltyBonusPct`; §3.2 income-card ordering places Royalty immediately before Total)

## Global Constraints

- Every associate-facing string needs both an English (`frontend/src/assets/i18n/en.json`) and Hindi (`frontend/src/assets/i18n/hi.json`) translation key — no hardcoded UI text.
- No new migration — `RoyaltyBonusRateRepository`, `RoyaltyBonusRate`, `IncomeType.ROYALTY`, and the seeded `royalty_bonus_rate` rows (`V23`) already exist and must be reused as-is.
- `royaltyBonusPct` is `0` (not an error, not a thrown exception) when no slab matches the associate's current matched volume — this is the same "no-op, not a failure" convention `RoyaltyBonusRateRepository`'s own javadoc documents and `CycleService` already follows.
- `totalIncome` must remain unchanged (`sumNetAmountByAssociateAndCycle`, an all-types cycle sum) — it already implicitly includes `royaltyBonus` once ledger entries of that type exist; this task only adds the two new broken-out fields.
- Currency values render via Angular's `currency:'INR'` pipe, matching every other money field on this card.

---

### Task 1: Backend — extend `CycleIncome` with royalty bonus amount and percentage

**Files:**
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java:20`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Consumes: `LedgerEntryRepository.sumNetAmountByAssociateCycleAndType(UUID associateId, UUID cycleId, IncomeType type)` (already exists), `IncomeType.ROYALTY` (already exists in the enum). `RoyaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(UUID planVersionId, BigDecimal matchedVolume)` returning `Optional<RoyaltyBonusRate>` (already exists, package `com.plotchain.compensation`, already used the same way in `CycleService.java:548-563`). `RoyaltyBonusRate.getRoyaltyPct()` returns `BigDecimal` (already exists).
- Produces: `DashboardResponse.CycleIncome` record gains two new components, appended after `selfPerformanceBonus` and before `totalIncome`: `royaltyBonus`, `royaltyBonusPct` (both `BigDecimal`). Task 2 (frontend) reads these as `data.royaltyBonus` / `data.royaltyBonusPct` on the `CycleIncome` TS interface. `DashboardService`'s constructor gains an 8th parameter, `RoyaltyBonusRateRepository royaltyBonusRateRepository`, appended after the existing `CompensationPlanVersionRepository compensationPlanVersionRepository` param — this is the exact order every test's `new DashboardService(...)` call must use.

- [ ] **Step 1: Write the failing service-level test**

In `DashboardServiceTest.java`, add the 8th mock field, right after the existing `CompensationPlanVersionRepository` mock (around line 51):

```java
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
```

Add the import (alongside the existing `com.plotchain.compensation.*` imports):

```java
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
```

Update the `@BeforeEach` constructor call to pass the new mock as the 8th argument:

```java
    @BeforeEach
    void setUp() {
        dashboardService = new DashboardService(
            associateRepository, rankTierRepository, cycleRepository,
            ledgerEntryRepository, legVolumeRepository, walletRepository,
            announcementRepository, compensationPlanVersionRepository,
            royaltyBonusRateRepository);
    }
```

In `aggregatesAllDashboardWidgetsForAnAssociate` (the test with existing-income stubs), the compensation plan version fixture is currently constructed inline inside the stub call and its generated id is never captured — you need the id to stub the royalty lookup with a matching `planVersionId`. Change this line (currently around line 105-107):

```java
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion(new BigDecimal("7.00"))));
```

to:

```java
        CompensationPlanVersion planVersion = compensationPlanVersion(new BigDecimal("7.00"));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(planVersion));
```

Then add two more stubs directly after it — this test's `legVolume` is `LegVolume.empty(associateId, cycleId)` (both legs zero), so the matched volume the royalty lookup receives is `BigDecimal.ZERO`:

```java
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.ROYALTY))
            .thenReturn(BigDecimal.valueOf(400));
        when(royaltyBonusRateRepository
                .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
                    planVersion.getId(), BigDecimal.ZERO))
            .thenReturn(Optional.of(new RoyaltyBonusRate(UUID.randomUUID(), planVersion.getId(), BigDecimal.ZERO, new BigDecimal("3.00"))));
```

This test's income stubs now sum to 2400 (1000 + 500 + 300 + 200 + 400), so bump the existing `sumNetAmountByAssociateAndCycle` stub and its `totalIncome` assertion to match — keeping the fixture arithmetically consistent with the real invariant that `totalIncome` is the all-types sum (a prior unit's final review flagged an inconsistent fixture here as a Minor; this plan fixes it going forward instead of repeating it). Change:

```java
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycleId))
            .thenReturn(BigDecimal.valueOf(2000));
```

to:

```java
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycleId))
            .thenReturn(BigDecimal.valueOf(2400));
```

and change the assertion:

```java
        assertThat(response.cycleIncome().totalIncome()).isEqualByComparingTo("2000");
```

to:

```java
        assertThat(response.cycleIncome().totalIncome()).isEqualByComparingTo("2400");
```

Then add two new assertions directly after the existing `selfPerformanceBonus` assertion:

```java
        assertThat(response.cycleIncome().royaltyBonus()).isEqualByComparingTo("400");
        assertThat(response.cycleIncome().royaltyBonusPct()).isEqualByComparingTo("3.00");
```

Now the zero-income case. In `projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction`, `ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any())` is already stubbed to return `BigDecimal.ZERO` for every `IncomeType`, so `royaltyBonus` is already covered — no new stub needed there. `royaltyBonusRateRepository` is deliberately left unstubbed in this test: Mockito's default answer for an `Optional`-returning method is `Optional.empty()` (the same pattern `CycleServiceTest` already documents and relies on for its own "no slab configured" coverage), so `royaltyBonusPct` resolves to `0` with no stub at all. Add two assertions directly after the existing `projectedMatchAmount` assertion (around line 194):

```java
        assertThat(response.cycleIncome().royaltyBonus()).isEqualByComparingTo("0");
        assertThat(response.cycleIncome().royaltyBonusPct()).isEqualByComparingTo("0");
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: compile error — `DashboardService`'s constructor doesn't take 8 arguments yet, and `CycleIncome` has no `royaltyBonus()`/`royaltyBonusPct()` methods yet.

- [ ] **Step 3: Extend the `CycleIncome` record**

In `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java:20`, currently:

```java
    public record CycleIncome(UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal sponsorMatchingIncome, BigDecimal selfPerformanceBonus, BigDecimal totalIncome) {}
```

change to:

```java
    public record CycleIncome(UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal sponsorMatchingIncome, BigDecimal selfPerformanceBonus, BigDecimal royaltyBonus, BigDecimal royaltyBonusPct, BigDecimal totalIncome) {}
```

- [ ] **Step 4: Wire the new repository and fields into `DashboardService`**

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, add the imports:

```java
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
```

Add the field (after the existing `compensationPlanVersionRepository` field):

```java
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final RoyaltyBonusRateRepository royaltyBonusRateRepository;
```

Add the constructor parameter (as the 8th, last, param) and assignment:

```java
    public DashboardService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        LegVolumeRepository legVolumeRepository,
        WalletRepository walletRepository,
        AnnouncementRepository announcementRepository,
        CompensationPlanVersionRepository compensationPlanVersionRepository,
        RoyaltyBonusRateRepository royaltyBonusRateRepository
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.walletRepository = walletRepository;
        this.announcementRepository = announcementRepository;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.royaltyBonusRateRepository = royaltyBonusRateRepository;
    }
```

Then, in `getDashboard`, currently:

```java
        BigDecimal matchingIncomePct = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .map(CompensationPlanVersion::getMatchingIncomePct)
            .orElseThrow(() -> new IllegalStateException("compensation_plan_version row missing - V8 migration seeds it"));
        BigDecimal projectedMatch = legVolume.getLeftLegVolume()
            .min(legVolume.getRightLegVolume())
            .multiply(matchingIncomePct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
```

change to (this captures the whole `CompensationPlanVersion` instead of mapping straight to its percent, since the royalty lookup below needs the version's id; and extracts `matchedVolume` as its own variable since both `projectedMatch` and the royalty lookup use the same `min(left, right)` value):

```java
        CompensationPlanVersion planVersion = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .orElseThrow(() -> new IllegalStateException("compensation_plan_version row missing - V8 migration seeds it"));
        BigDecimal matchingIncomePct = planVersion.getMatchingIncomePct();
        BigDecimal matchedVolume = legVolume.getLeftLegVolume().min(legVolume.getRightLegVolume());
        BigDecimal projectedMatch = matchedVolume.multiply(matchingIncomePct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
```

Then, right after the existing `selfPerformance` line, add:

```java
        BigDecimal royaltyBonus = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.ROYALTY);
        BigDecimal royaltyBonusPct = royaltyBonusRateRepository
            .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(planVersion.getId(), matchedVolume)
            .map(RoyaltyBonusRate::getRoyaltyPct)
            .orElse(BigDecimal.ZERO);
```

Finally, in the `return new DashboardResponse(...)` block, change:

```java
            new DashboardResponse.CycleIncome(cycle.getId(), direct, matching, sponsorMatching, selfPerformance, total),
```

to:

```java
            new DashboardResponse.CycleIncome(cycle.getId(), direct, matching, sponsorMatching, selfPerformance, royaltyBonus, royaltyBonusPct, total),
```

- [ ] **Step 5: Run the service test to verify it passes**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: PASS, all tests in the class green.

- [ ] **Step 6: Add a controller-level `@MockBean` and assertions proving end-to-end wiring**

`DashboardControllerTest.java` is a `@SpringBootTest` with `@MockBean` on 7 repository interfaces; it does not currently mock `CompensationPlanVersionRepository` or `RoyaltyBonusRateRepository`, relying on the real seeded `V8`/`V23` migration data for those. Mocking `RoyaltyBonusRateRepository` explicitly here (rather than relying on real seeded slab data) keeps this test deterministic and matches the pattern already used for the other 7 repos.

Add the import:

```java
import com.plotchain.compensation.RoyaltyBonusRateRepository;
```

Add the `@MockBean`, after the existing `AnnouncementRepository` one:

```java
    @MockBean AnnouncementRepository announcementRepository;
    @MockBean RoyaltyBonusRateRepository royaltyBonusRateRepository;
```

In `returnsDashboardJsonForTheAuthenticatedAssociate`, add a stub directly after the existing `sumNetAmountByAssociateAndCycle` stub:

```java
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(any(), any()))
            .thenReturn(Optional.empty());
```

Add two assertions to the existing `jsonPath` chain, after the existing `sponsorMatchingIncome`/`selfPerformanceBonus` assertions:

```java
            .andExpect(jsonPath("$.cycleIncome.sponsorMatchingIncome").value(0))
            .andExpect(jsonPath("$.cycleIncome.selfPerformanceBonus").value(0))
            .andExpect(jsonPath("$.cycleIncome.royaltyBonus").value(0))
            .andExpect(jsonPath("$.cycleIncome.royaltyBonusPct").value(0));
```

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && mvn test -q`
Expected: PASS except the pre-existing, unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` dev-secret-guard failures (4 total, environment-dependent JDK/Mockito mismatch — see `issues.md`). No other class should show new failures.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java backend/src/main/java/com/plotchain/dashboard/DashboardService.java backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "feat(dashboard): add royalty bonus amount and percentage to cycle income"
```

---

### Task 2: Frontend — render the Royalty Bonus row on the cycle income card

**Files:**
- Modify: `frontend/src/app/dashboard/models/dashboard-response.model.ts:10-17`
- Modify: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.spec.ts:18`
- Modify: `frontend/src/assets/i18n/en.json:4-8`
- Modify: `frontend/src/assets/i18n/hi.json:4-8`

**Interfaces:**
- Consumes: Task 1's `DashboardResponse.CycleIncome` JSON shape — `royaltyBonus`, `royaltyBonusPct` fields (both numbers, always present, `0` when no slab matches or no ledger entries of that type exist yet).
- Produces: no new consumers in this plan.

- [ ] **Step 1: Write the failing component test**

In `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts`, add the two new fields to the fixture in `beforeEach`:

```typescript
    fixture.componentInstance.data = {
      cycleId: 'c1',
      directIncome: 1000,
      matchingIncome: 500,
      sponsorMatchingIncome: 300,
      selfPerformanceBonus: 200,
      royaltyBonus: 400,
      royaltyBonusPct: 3,
      totalIncome: 2400
    };
```

Add a new test, after the existing `'renders sponsor matching and self performance income in their own rows'` test:

```typescript
  it('renders royalty bonus with its percentage', () => {
    const royalty = fixture.nativeElement.querySelector('.royalty').textContent;
    expect(royalty).toContain('400');
    expect(royalty).toContain('3');
  });
```

Update the first test's total assertion (it currently checks `'2,000'` for the flattened total; the fixture's total is now `2400`):

```typescript
  it('renders direct, matching, and total income', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1,000');
    expect(text).toContain('500');
    expect(text).toContain('2,400');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/cycle-income-card.component.spec.ts'`
Expected: FAIL — TS compile error, `royaltyBonus`/`royaltyBonusPct` don't exist on type `CycleIncome`, and the new test can't find a `.royalty` element.

- [ ] **Step 3: Extend the `CycleIncome` TS interface**

In `frontend/src/app/dashboard/models/dashboard-response.model.ts:10-17`, currently:

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

change to:

```typescript
export interface CycleIncome {
  cycleId: string;
  directIncome: number;
  matchingIncome: number;
  sponsorMatchingIncome: number;
  selfPerformanceBonus: number;
  royaltyBonus: number;
  royaltyBonusPct: number;
  totalIncome: number;
}
```

- [ ] **Step 4: Add the i18n key**

In `frontend/src/assets/i18n/en.json`, currently (lines 4-8):

```json
    "direct": "Direct",
    "matching": "Matching",
    "sponsorMatching": "Sponsor's Matching",
    "selfPerformance": "Self Performance Bonus",
    "total": "Total",
```

change to:

```json
    "direct": "Direct",
    "matching": "Matching",
    "sponsorMatching": "Sponsor's Matching",
    "selfPerformance": "Self Performance Bonus",
    "royalty": "Royalty Bonus",
    "total": "Total",
```

In `frontend/src/assets/i18n/hi.json`, currently (lines 4-8):

```json
    "direct": "प्रत्यक्ष",
    "matching": "मैचिंग",
    "sponsorMatching": "स्पॉन्सर मैचिंग",
    "selfPerformance": "सेल्फ परफॉर्मेंस बोनस",
    "total": "कुल",
```

change to (`"रॉयल्टी बोनस"` matches this codebase's existing `royaltyBonusLineLabel` translation elsewhere in this same file, e.g. line 729):

```json
    "direct": "प्रत्यक्ष",
    "matching": "मैचिंग",
    "sponsorMatching": "स्पॉन्सर मैचिंग",
    "selfPerformance": "सेल्फ परफॉर्मेंस बोनस",
    "royalty": "रॉयल्टी बोनस",
    "total": "कुल",
```

- [ ] **Step 5: Add the template row**

In `frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts`, currently:

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

change to:

```typescript
  template: `
    <a class="cycle-income-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</div>
      <div class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</div>
      <div class="sponsor-matching">{{ 'dashboard.sponsorMatching' | translate }}: {{ data.sponsorMatchingIncome | currency:'INR' }}</div>
      <div class="self-performance">{{ 'dashboard.selfPerformance' | translate }}: {{ data.selfPerformanceBonus | currency:'INR' }}</div>
      <div class="royalty">{{ 'dashboard.royalty' | translate }} ({{ data.royaltyBonusPct }}%): {{ data.royaltyBonus | currency:'INR' }}</div>
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
    cycleIncome: { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, sponsorMatchingIncome: 300, selfPerformanceBonus: 200, totalIncome: 2000 },
```

change to:

```typescript
    cycleIncome: { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, sponsorMatchingIncome: 300, selfPerformanceBonus: 200, royaltyBonus: 400, royaltyBonusPct: 3, totalIncome: 2400 },
```

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/dashboard/models/dashboard-response.model.ts frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.ts frontend/src/app/dashboard/widgets/cycle-income-card/cycle-income-card.component.spec.ts frontend/src/app/dashboard/dashboard.component.spec.ts frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): render royalty bonus row with its percentage"
```
