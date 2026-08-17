# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admin-family users a real landing dashboard at `/admin/dashboard` — business-health stats first (associates, wallet, sales/revenue, cycle income), pending-action counts second (KYC, withdrawals) — replacing the current split landing on `/admin/associates/new` / `/settings`.

**Architecture:** Extend the existing `AdminStatsResponse`/`AdminStatsService` (backend, `com.plotchain.stats`) with sales-this-cycle, revenue-this-cycle, and pending-withdrawals fields — no new service, no migration. Add a new `AdminDashboardComponent` (frontend) that supersedes the buried `/settings/admin-stats` sub-page, consuming the same `/api/admin/stats` endpoint. Collapse the admin-family post-auth redirect (`postAuthLandingPath`) to a single `/admin/dashboard` destination.

**Tech Stack:** Spring Boot / JPA (backend), Angular standalone components + ngx-translate (frontend), JUnit 5 + Mockito + MockMvc (backend tests), Jasmine/Karma (frontend tests).

**Spec:** `docs/superpowers/specs/2026-08-17-admin-dashboard-design.md`

## Global Constraints

- One shared dashboard for all admin-family roles (`ADMIN_FAMILY_ROLES` currently contains only `'ADMIN'`, defined in `frontend/src/app/admin/admin.guard.ts:9` — do not special-case `'ADMIN'` by string anywhere new; use the set).
- Business stats lead the layout; action-queue counts (KYC pending, withdrawals pending) are a secondary strip below, each linking to its existing queue screen — no queue UI is duplicated on the dashboard itself.
- No widgets for e-PIN, Support Tickets, or Announcements — those domain specs are not built yet.
- No e2e tests — Playwright stays deferred per the project's standing e2e-testing-plan decision.
- `AdminStatsService.getStats()` must keep tolerating "no OPEN cycle" without throwing (returns `currentCycle: null`) — the two new cycle-scoped fields (`salesThisCycle`, `revenueThisCycle`) live inside `CurrentCycleStats`, so they inherit this null-safety for free rather than needing their own convention.

---

## File Structure

**Backend (extends existing files, no new files):**
- `backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java` — add `pendingWithdrawals` (top-level) and `salesThisCycle`/`revenueThisCycle` (inside `CurrentCycleStats`)
- `backend/src/main/java/com/plotchain/stats/AdminStatsService.java` — compute the three new fields
- `backend/src/main/java/com/plotchain/sales/SaleRepository.java` — two new query methods
- `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java` — one new query method

**Frontend (new `admin-dashboard/` slice, replacing `settings/admin-stats/`):**
- `frontend/src/app/admin-dashboard/admin-dashboard.model.ts` — response shape (supersedes `settings/admin-stats/admin-stats.model.ts`)
- `frontend/src/app/admin-dashboard/admin-dashboard.service.ts` — `GET /api/admin/stats` (supersedes `admin-stats.service.ts`)
- `frontend/src/app/admin-dashboard/admin-dashboard.component.ts` — the screen itself: KPI tiles, cycle card, KYC breakdown, pending withdrawals, quick actions (supersedes `admin-stats.component.ts`, adds the new tiles + quick actions row)
- `frontend/src/app/admin-dashboard/admin-dashboard.service.spec.ts`, `admin-dashboard.component.spec.ts`

**Frontend (modified):**
- `frontend/src/app/auth/post-auth-redirect.ts` — collapse the ADMIN-vs-rest branch to one `/admin/dashboard` destination
- `frontend/src/app/app.routes.ts` — add `/admin/dashboard` route, remove `/settings/admin-stats` route
- `frontend/src/app/settings/settings-nav-rail.component.ts` — remove the Admin Stats nav item
- `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json` — add `adminDashboard.*`, remove `settings.adminStats.*` and `settings.sections.adminStats`

**Frontend (deleted, Task 4):** `frontend/src/app/settings/admin-stats/` (all 5 files) — fully superseded by `admin-dashboard/`.

---

### Task 1: Backend — extend AdminStatsResponse with sales/revenue/pending-withdrawals

**Files:**
- Modify: `backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java`
- Modify: `backend/src/main/java/com/plotchain/stats/AdminStatsService.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleRepository.java`
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java`
- Test: `backend/src/test/java/com/plotchain/stats/AdminStatsServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/stats/AdminStatsControllerTest.java`

**Interfaces:**
- Produces: `AdminStatsResponse(long totalAssociates, KycBreakdown kycBreakdown, BigDecimal totalWalletBalance, long pendingWithdrawals, CurrentCycleStats currentCycle)`, and `CurrentCycleStats(UUID cycleId, LocalDate periodStart, LocalDate periodEnd, long daysRemaining, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal totalIncome, long newAssociatesThisCycle, long salesThisCycle, BigDecimal revenueThisCycle)` — this is the exact JSON shape Task 2's frontend model must match field-for-field.
- Consumes: `SaleRepository.countByCycleIdAndStatus(UUID, SaleStatus)`, `SaleRepository.sumAmountByCycleIdAndStatus(UUID, SaleStatus)`, `WithdrawalRequestRepository.countByStatus(WithdrawalRequestStatus)` — all new in this task.

- [ ] **Step 1: Write the failing service test — extend both existing test cases**

Edit `backend/src/test/java/com/plotchain/stats/AdminStatsServiceTest.java`:

```java
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
import com.plotchain.withdrawal.WithdrawalRequestStatus;
```

Add two new mocks and pass them into the constructor call in `setUp()`:

```java
    @Mock AssociateRepository associateRepository;
    @Mock WalletRepository walletRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock CycleRepository cycleRepository;
    @Mock SaleRepository saleRepository;
    @Mock WithdrawalRequestRepository withdrawalRequestRepository;

    AdminStatsService adminStatsService;

    @BeforeEach
    void setUp() {
        adminStatsService = new AdminStatsService(
            associateRepository, walletRepository, ledgerEntryRepository, cycleRepository,
            saleRepository, withdrawalRequestRepository);
    }
```

In `aggregatesCompanyWideStatsWhenACycleIsOpen()`, add stubs (alongside the existing `ledgerEntryRepository`/`associateRepository` stubs) and assertions:

```java
        when(withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED)).thenReturn(4L);
        when(saleRepository.countByCycleIdAndStatus(cycleId, SaleStatus.RECORDED)).thenReturn(12L);
        when(saleRepository.sumAmountByCycleIdAndStatus(cycleId, SaleStatus.RECORDED))
            .thenReturn(new BigDecimal("2400000"));
```
```java
        assertThat(response.pendingWithdrawals()).isEqualTo(4L);
        assertThat(response.currentCycle().salesThisCycle()).isEqualTo(12L);
        assertThat(response.currentCycle().revenueThisCycle()).isEqualByComparingTo("2400000");
```

In `degradesGracefullyWithANullCurrentCycleWhenNoCycleIsOpen()`, add the withdrawal stub (sales/revenue are inside `currentCycle`, which is already asserted null, so no separate stub is needed for them) and an assertion:

```java
        when(withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED)).thenReturn(0L);
```
```java
        assertThat(response.pendingWithdrawals()).isEqualTo(0L);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=AdminStatsServiceTest`
Expected: FAIL — compile error, `AdminStatsService` constructor doesn't accept 6 arguments yet.

- [ ] **Step 3: Add the two repository query methods**

Edit `backend/src/main/java/com/plotchain/sales/SaleRepository.java`, add inside the interface (after `findByCycleIdAndStatus`, same style as the existing methods' doc comments — this one has no doc comment since it's a plain derived count, same as `AssociateRepository.countByRole`):

```java
    long countByCycleIdAndStatus(UUID cycleId, SaleStatus status);

    @Query("SELECT COALESCE(SUM(s.amount), 0) FROM Sale s WHERE s.cycleId = :cycleId AND s.status = :status")
    BigDecimal sumAmountByCycleIdAndStatus(@Param("cycleId") UUID cycleId, @Param("status") SaleStatus status);
```

Add `import java.math.BigDecimal;` to the top of the file.

Edit `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java`, add inside the interface (after the existing `search` method):

```java
    long countByStatus(WithdrawalRequestStatus status);
```

- [ ] **Step 4: Update AdminStatsResponse**

Replace the full contents of `backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java`:

```java
package com.plotchain.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record AdminStatsResponse(
    long totalAssociates,
    KycBreakdown kycBreakdown,
    BigDecimal totalWalletBalance,
    long pendingWithdrawals,
    CurrentCycleStats currentCycle
) {
    public record KycBreakdown(long pending, long verified, long rejected) {}

    public record CurrentCycleStats(
        UUID cycleId,
        LocalDate periodStart,
        LocalDate periodEnd,
        long daysRemaining,
        BigDecimal directIncome,
        BigDecimal matchingIncome,
        BigDecimal totalIncome,
        long newAssociatesThisCycle,
        long salesThisCycle,
        BigDecimal revenueThisCycle
    ) {}
}
```

- [ ] **Step 5: Update AdminStatsService**

Replace the full contents of `backend/src/main/java/com/plotchain/stats/AdminStatsService.java`:

```java
package com.plotchain.stats;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.WalletRepository;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
import com.plotchain.withdrawal.WithdrawalRequestStatus;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

@Service
public class AdminStatsService {

    private final AssociateRepository associateRepository;
    private final WalletRepository walletRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final CycleRepository cycleRepository;
    private final SaleRepository saleRepository;
    private final WithdrawalRequestRepository withdrawalRequestRepository;

    public AdminStatsService(
        AssociateRepository associateRepository,
        WalletRepository walletRepository,
        LedgerEntryRepository ledgerEntryRepository,
        CycleRepository cycleRepository,
        SaleRepository saleRepository,
        WithdrawalRequestRepository withdrawalRequestRepository
    ) {
        this.associateRepository = associateRepository;
        this.walletRepository = walletRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.cycleRepository = cycleRepository;
        this.saleRepository = saleRepository;
        this.withdrawalRequestRepository = withdrawalRequestRepository;
    }

    // Unlike DashboardService.getDashboard, this does NOT throw/409 when there's no OPEN cycle:
    // an admin still wants total associates / wallet balance / pending withdrawals regardless of
    // cycle state, so currentCycle simply comes back null and the rest of the stats still
    // populate.
    public AdminStatsResponse getStats() {
        long totalAssociates = associateRepository.countByRole(AssociateRole.ASSOCIATE);

        AdminStatsResponse.KycBreakdown kycBreakdown = new AdminStatsResponse.KycBreakdown(
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)
        );

        BigDecimal totalWalletBalance = walletRepository.sumAllBalances();
        long pendingWithdrawals = withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED);

        AdminStatsResponse.CurrentCycleStats currentCycle = cycleRepository
            .findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .map(this::currentCycleStats)
            .orElse(null);

        return new AdminStatsResponse(totalAssociates, kycBreakdown, totalWalletBalance, pendingWithdrawals, currentCycle);
    }

    private AdminStatsResponse.CurrentCycleStats currentCycleStats(Cycle cycle) {
        BigDecimal direct = ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.MATCHING);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByCycle(cycle.getId());

        long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), cycle.getPeriodEnd()));

        // :end is an EXCLUSIVE upper bound, same convention as AdminAssociateService.list /
        // AssociateRepository#searchDirectory: pass the day *after* periodEnd to include
        // associates who joined on periodEnd itself.
        Instant start = cycle.getPeriodStart().atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant endExclusive = cycle.getPeriodEnd().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        long newAssociates = associateRepository.countByRoleAndJoinedBetween(AssociateRole.ASSOCIATE, start, endExclusive);

        long salesThisCycle = saleRepository.countByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);
        BigDecimal revenueThisCycle = saleRepository.sumAmountByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);

        return new AdminStatsResponse.CurrentCycleStats(
            cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), daysRemaining,
            direct, matching, total, newAssociates, salesThisCycle, revenueThisCycle
        );
    }
}
```

- [ ] **Step 6: Run the service test to verify it passes**

Run: `cd backend && mvn test -Dtest=AdminStatsServiceTest`
Expected: PASS (2 tests)

- [ ] **Step 7: Extend the controller test**

Edit `backend/src/test/java/com/plotchain/stats/AdminStatsControllerTest.java` — add two `@MockBean`s and stub them in the existing test:

```java
import com.plotchain.sales.SaleRepository;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
```
```java
    @MockBean AssociateRepository associateRepository;
    @MockBean WalletRepository walletRepository;
    @MockBean LedgerEntryRepository ledgerEntryRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean SaleRepository saleRepository;
    @MockBean WithdrawalRequestRepository withdrawalRequestRepository;
```

In `returnsCompanyWideStatsJsonForAnAdminToken()`, add a stub and an assertion (no cycle is open in this test, so `saleRepository` is never called — no stub needed for it):

```java
        when(withdrawalRequestRepository.countByStatus(com.plotchain.withdrawal.WithdrawalRequestStatus.REQUESTED))
            .thenReturn(2L);
```
```java
            .andExpect(jsonPath("$.pendingWithdrawals").value(2));
```

- [ ] **Step 8: Run the full stats test suite**

Run: `cd backend && mvn test -Dtest=AdminStatsServiceTest,AdminStatsControllerTest`
Expected: PASS (4 tests total)

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java \
        backend/src/main/java/com/plotchain/stats/AdminStatsService.java \
        backend/src/main/java/com/plotchain/sales/SaleRepository.java \
        backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java \
        backend/src/test/java/com/plotchain/stats/AdminStatsServiceTest.java \
        backend/src/test/java/com/plotchain/stats/AdminStatsControllerTest.java
git commit -m "feat(stats): add sales/revenue-this-cycle and pending-withdrawals to admin stats"
```

---

### Task 2: Frontend — AdminDashboardComponent (model, service, component)

**Files:**
- Create: `frontend/src/app/admin-dashboard/admin-dashboard.model.ts`
- Create: `frontend/src/app/admin-dashboard/admin-dashboard.service.ts`
- Create: `frontend/src/app/admin-dashboard/admin-dashboard.component.ts`
- Test: `frontend/src/app/admin-dashboard/admin-dashboard.service.spec.ts`
- Test: `frontend/src/app/admin-dashboard/admin-dashboard.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `GET /api/admin/stats` returning Task 1's `AdminStatsResponse` JSON shape; `StatTileComponent` (`frontend/src/app/shared/components/stat-tile/stat-tile.component.ts`) — `@Input() label!: string`, `@Input() value!: string`, `@Input() tone?: 'default' | 'accent' | 'success'`.
- Produces: `AdminDashboardComponent` selector `app-admin-dashboard`, routed at `/admin/dashboard` in Task 3.

- [ ] **Step 1: Write the model**

Create `frontend/src/app/admin-dashboard/admin-dashboard.model.ts`:

```typescript
// Field-for-field with the backend's AdminStatsResponse record (backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java).
// BigDecimal fields serialize as JSON numbers, same convention as dashboard-response.model.ts.
export interface KycBreakdown {
  pending: number;
  verified: number;
  rejected: number;
}

export interface CurrentCycleStats {
  cycleId: string;
  periodStart: string;
  periodEnd: string;
  daysRemaining: number;
  directIncome: number;
  matchingIncome: number;
  totalIncome: number;
  newAssociatesThisCycle: number;
  salesThisCycle: number;
  revenueThisCycle: number;
}

export interface AdminStatsResponse {
  totalAssociates: number;
  kycBreakdown: KycBreakdown;
  totalWalletBalance: number;
  pendingWithdrawals: number;
  currentCycle: CurrentCycleStats | null;
}
```

- [ ] **Step 2: Write the failing service test**

Create `frontend/src/app/admin-dashboard/admin-dashboard.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStatsResponse } from './admin-dashboard.model';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let httpMock: HttpTestingController;

  const stats: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 2,
    currentCycle: {
      cycleId: 'c1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      daysRemaining: 28,
      directIncome: 1000,
      matchingIncome: 500,
      totalIncome: 1500,
      newAssociatesThisCycle: 5,
      salesThisCycle: 12,
      revenueThisCycle: 2400000
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AdminDashboardService]
    });
    service = TestBed.inject(AdminDashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches stats from GET /api/admin/stats and round-trips the response', () => {
    let result: AdminStatsResponse | undefined;
    service.getStats().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/admin/stats');
    expect(req.request.method).toBe('GET');
    req.flush(stats);

    expect(result).toEqual(stats);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin-dashboard/admin-dashboard.service.spec.ts'`
Expected: FAIL — `Cannot find module './admin-dashboard.service'`

- [ ] **Step 4: Write the service**

Create `frontend/src/app/admin-dashboard/admin-dashboard.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AdminStatsResponse } from './admin-dashboard.model';

@Injectable({ providedIn: 'root' })
export class AdminDashboardService {
  constructor(private http: HttpClient) {}

  getStats(): Observable<AdminStatsResponse> {
    return this.http.get<AdminStatsResponse>('/api/admin/stats');
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin-dashboard/admin-dashboard.service.spec.ts'`
Expected: PASS (1 test)

- [ ] **Step 6: Add i18n keys**

Edit `frontend/src/assets/i18n/en.json` — add a new top-level `adminDashboard` object (place it near the existing `dashboard` object for discoverability):

```json
  "adminDashboard": {
    "heading": "Dashboard",
    "totalAssociatesLabel": "Total Associates",
    "walletBalanceLabel": "Total Wallet Balance",
    "salesThisCycleLabel": "Sales This Cycle",
    "revenueThisCycleLabel": "Revenue This Cycle",
    "currentCycleTitle": "Current Cycle",
    "periodLabel": "Period",
    "daysRemainingLabel": "Days Remaining",
    "directIncomeLabel": "Direct Income",
    "matchingIncomeLabel": "Matching Income",
    "totalIncomeLabel": "Total Income",
    "newAssociatesLabel": "New Associates This Cycle",
    "noCycleEmptyState": "No open cycle right now.",
    "kycBreakdownTitle": "KYC Breakdown",
    "kycPendingLabel": "Pending",
    "kycVerifiedLabel": "Verified",
    "kycRejectedLabel": "Rejected",
    "pendingWithdrawalsLabel": "Pending Withdrawals",
    "quickActionsTitle": "Quick Actions",
    "recordSaleAction": "+ Record Sale",
    "provisionAssociateAction": "+ Provision Associate",
    "loadError": "Couldn't load the dashboard. Try again later."
  },
```

Edit `frontend/src/assets/i18n/hi.json` — add the matching object in the same position:

```json
  "adminDashboard": {
    "heading": "डैशबोर्ड",
    "totalAssociatesLabel": "कुल एसोसिएट्स",
    "walletBalanceLabel": "कुल वॉलेट बैलेंस",
    "salesThisCycleLabel": "इस चक्र में बिक्री",
    "revenueThisCycleLabel": "इस चक्र का राजस्व",
    "currentCycleTitle": "वर्तमान चक्र",
    "periodLabel": "अवधि",
    "daysRemainingLabel": "शेष दिन",
    "directIncomeLabel": "प्रत्यक्ष आय",
    "matchingIncomeLabel": "मैचिंग आय",
    "totalIncomeLabel": "कुल आय",
    "newAssociatesLabel": "इस चक्र में नए एसोसिएट्स",
    "noCycleEmptyState": "अभी कोई खुला चक्र नहीं है।",
    "kycBreakdownTitle": "केवाईसी विवरण",
    "kycPendingLabel": "लंबित",
    "kycVerifiedLabel": "सत्यापित",
    "kycRejectedLabel": "अस्वीकृत",
    "pendingWithdrawalsLabel": "लंबित निकासी",
    "quickActionsTitle": "त्वरित कार्रवाई",
    "recordSaleAction": "+ बिक्री दर्ज करें",
    "provisionAssociateAction": "+ एसोसिएट जोड़ें",
    "loadError": "डैशबोर्ड लोड नहीं हो सका। बाद में पुनः प्रयास करें।"
  },
```

- [ ] **Step 7: Write the failing component test**

Create `frontend/src/app/admin-dashboard/admin-dashboard.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminDashboardComponent } from './admin-dashboard.component';
import { AdminStatsResponse } from './admin-dashboard.model';

describe('AdminDashboardComponent', () => {
  let fixture: ComponentFixture<AdminDashboardComponent>;
  let httpMock: HttpTestingController;

  const statsWithCycle: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 2,
    currentCycle: {
      cycleId: 'c1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      daysRemaining: 28,
      directIncome: 1000,
      matchingIncome: 500,
      totalIncome: 1500,
      newAssociatesThisCycle: 5,
      salesThisCycle: 12,
      revenueThisCycle: 2400000
    }
  };

  const statsWithoutCycle: AdminStatsResponse = {
    totalAssociates: 42,
    kycBreakdown: { pending: 3, verified: 35, rejected: 4 },
    totalWalletBalance: 12345.67,
    pendingWithdrawals: 0,
    currentCycle: null
  };

  function flushInitialLoad(response: AdminStatsResponse = statsWithCycle): void {
    httpMock.expectOne('/api/admin/stats').flush(response);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboardComponent, HttpClientTestingModule, TranslateModule.forRoot(), RouterTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminDashboardComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders tiles for total associates, wallet balance, sales/revenue this cycle, KYC breakdown, and pending withdrawals', () => {
    flushInitialLoad();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('42');
    expect(text).toContain('12345.67');
    expect(text).toContain('12');
    expect(text).toContain('2,400,000');
    expect(text).toContain('3');
    expect(text).toContain('35');
    expect(text).toContain('4');
    expect(text).toContain('2');
  });

  it('renders an empty state instead of cycle figures when currentCycle is null', () => {
    flushInitialLoad(statsWithoutCycle);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.noCycleEmptyState');
    expect(text).not.toContain('2400000');
  });

  it('sets loadError and renders the error message when the request fails', () => {
    httpMock.expectOne('/api/admin/stats').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('adminDashboard.loadError');
  });

  it('links the pending withdrawals tile to the payout approval queue', () => {
    flushInitialLoad();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/settings/payout-approval"]');
    expect(link).toBeTruthy();
  });

  it('links the KYC pending tile to the KYC review queue', () => {
    flushInitialLoad();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href="/settings/kyc-queue"]');
    expect(link).toBeTruthy();
  });

  it('renders quick action links to Record Sale and Provision Associate', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.querySelector('a[href="/admin/sales/new"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('a[href="/admin/associates/new"]')).toBeTruthy();
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin-dashboard/admin-dashboard.component.spec.ts'`
Expected: FAIL — `Cannot find module './admin-dashboard.component'`

- [ ] **Step 9: Write the component**

Create `frontend/src/app/admin-dashboard/admin-dashboard.component.ts`:

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStatsResponse } from './admin-dashboard.model';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, StatTileComponent],
  providers: [CurrencyPipe],
  template: `
    <div class="admin-dashboard card">
      <h1 class="card-title">{{ 'adminDashboard.heading' | translate }}</h1>

      <p *ngIf="loadError" class="admin-dashboard__load-error">{{ 'adminDashboard.loadError' | translate }}</p>

      <ng-container *ngIf="stats as s">
        <div class="admin-dashboard__tiles">
          <app-stat-tile
            [label]="'adminDashboard.totalAssociatesLabel' | translate"
            [value]="s.totalAssociates.toString()"
          ></app-stat-tile>
          <app-stat-tile
            [label]="'adminDashboard.walletBalanceLabel' | translate"
            [value]="formatCurrency(s.totalWalletBalance)"
          ></app-stat-tile>
          <app-stat-tile
            [label]="'adminDashboard.salesThisCycleLabel' | translate"
            [value]="(s.currentCycle?.salesThisCycle ?? 0).toString()"
          ></app-stat-tile>
          <app-stat-tile
            [label]="'adminDashboard.revenueThisCycleLabel' | translate"
            [value]="formatCurrency(s.currentCycle?.revenueThisCycle ?? 0)"
          ></app-stat-tile>
        </div>

        <section class="admin-dashboard__cycle">
          <h2>{{ 'adminDashboard.currentCycleTitle' | translate }}</h2>
          <ng-container *ngIf="s.currentCycle as cycle; else noCycle">
            <div class="admin-dashboard__tiles">
              <app-stat-tile
                [label]="'adminDashboard.periodLabel' | translate"
                [value]="cycle.periodStart + ' – ' + cycle.periodEnd"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.daysRemainingLabel' | translate"
                [value]="cycle.daysRemaining.toString()"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.directIncomeLabel' | translate"
                [value]="formatCurrency(cycle.directIncome)"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.matchingIncomeLabel' | translate"
                [value]="formatCurrency(cycle.matchingIncome)"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.totalIncomeLabel' | translate"
                [value]="formatCurrency(cycle.totalIncome)"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.newAssociatesLabel' | translate"
                [value]="cycle.newAssociatesThisCycle.toString()"
              ></app-stat-tile>
            </div>
          </ng-container>
          <ng-template #noCycle>
            <p class="admin-dashboard__empty">{{ 'adminDashboard.noCycleEmptyState' | translate }}</p>
          </ng-template>
        </section>

        <section class="admin-dashboard__kyc">
          <h2>{{ 'adminDashboard.kycBreakdownTitle' | translate }}</h2>
          <div class="admin-dashboard__tiles">
            <a [routerLink]="['/settings', 'kyc-queue']" class="admin-dashboard__tile-link">
              <app-stat-tile
                [label]="'adminDashboard.kycPendingLabel' | translate"
                [value]="s.kycBreakdown.pending.toString()"
              ></app-stat-tile>
            </a>
            <app-stat-tile
              [label]="'adminDashboard.kycVerifiedLabel' | translate"
              [value]="s.kycBreakdown.verified.toString()"
            ></app-stat-tile>
            <app-stat-tile
              [label]="'adminDashboard.kycRejectedLabel' | translate"
              [value]="s.kycBreakdown.rejected.toString()"
            ></app-stat-tile>
          </div>
        </section>

        <section class="admin-dashboard__withdrawals">
          <a [routerLink]="['/settings', 'payout-approval']" class="admin-dashboard__tile-link">
            <app-stat-tile
              [label]="'adminDashboard.pendingWithdrawalsLabel' | translate"
              [value]="s.pendingWithdrawals.toString()"
              tone="accent"
            ></app-stat-tile>
          </a>
        </section>

        <section class="admin-dashboard__quick-actions">
          <h2>{{ 'adminDashboard.quickActionsTitle' | translate }}</h2>
          <a [routerLink]="['/admin', 'sales', 'new']" class="brand-button brand-button--secondary">
            {{ 'adminDashboard.recordSaleAction' | translate }}
          </a>
          <a [routerLink]="['/admin', 'associates', 'new']" class="brand-button brand-button--secondary">
            {{ 'adminDashboard.provisionAssociateAction' | translate }}
          </a>
        </section>
      </ng-container>
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  private adminDashboardService = inject(AdminDashboardService);
  private currencyPipe = inject(CurrencyPipe);

  stats: AdminStatsResponse | null = null;
  loadError = false;

  ngOnInit(): void {
    this.loadStats();
  }

  formatCurrency(value: number): string {
    return this.currencyPipe.transform(value, 'INR', 'symbol', '1.0-2') ?? String(value);
  }

  private loadStats(): void {
    this.loadError = false;
    this.adminDashboardService.getStats().subscribe({
      next: res => (this.stats = res),
      error: () => (this.loadError = true)
    });
  }
}
```

- [ ] **Step 10: Run it to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='src/app/admin-dashboard/**/*.spec.ts'`
Expected: PASS (7 tests: 1 in `admin-dashboard.service.spec.ts` + 6 in `admin-dashboard.component.spec.ts`)

If any test fails on tile text matching (e.g. currency formatting), adjust the assertion to match `CurrencyPipe`'s actual output rather than changing the component — the existing `AdminStatsComponent` spec (`frontend/src/app/settings/admin-stats/admin-stats.component.spec.ts:67-77`) is the reference for exact formatting behavior (`1,000`, `91,500`, comma-grouped, no decimals shown for whole numbers only when `1.0-2` is used — verify against the real rendered output, don't assume).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/admin-dashboard/ frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(admin-dashboard): add AdminDashboardComponent with stats, KYC/withdrawal links, quick actions"
```

---

### Task 3: Frontend — route admin-family logins to /admin/dashboard

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/auth/post-auth-redirect.ts`
- Modify: `frontend/src/app/auth/post-auth-redirect.spec.ts`
- Modify: `frontend/src/app/auth/root-redirect.guard.spec.ts`
- Modify: `frontend/src/app/auth/login.component.spec.ts`
- Modify: `frontend/src/app/auth/change-password.component.spec.ts`

**Interfaces:**
- Consumes: Task 2's `AdminDashboardComponent` (import + route registration).
- Produces: `postAuthLandingPath(role, state, incompleteStepPath)` now returns `/admin/dashboard` for every admin-family role once launched (was `role === 'ADMIN' ? '/admin/associates/new' : '/settings'`) — `rootRedirectGuard`, `login.component.ts`, and `change-password.component.ts` all consume this function and need no changes themselves.

- [ ] **Step 1: Write the failing test for the collapsed redirect**

Edit `frontend/src/app/auth/post-auth-redirect.spec.ts`, replace the two tests that assert the old ADMIN-specific destination:

```typescript
  it('sends every admin-family role to /admin/dashboard once launched', () => {
    for (const role of ADMIN_FAMILY_ROLES) {
      expect(postAuthLandingPath(role, launchedState, () => 'company-profile')).toBe('/admin/dashboard');
    }
  });

  it('never invokes incompleteStepPath when launched', () => {
    const spy = jasmine.createSpy('incompleteStepPath').and.returnValue('company-profile');
    postAuthLandingPath('ADMIN', launchedState, spy);
    expect(spy).not.toHaveBeenCalled();
  });
```

(This replaces the old `'sends ADMIN to /admin/associates/new once launched'` test — the `'never invokes incompleteStepPath when launched'` test is unchanged, just re-listed here for clarity since it sits right after the one being replaced.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='src/app/auth/post-auth-redirect.spec.ts'`
Expected: FAIL — `postAuthLandingPath('ADMIN', launchedState, ...)` still returns `/admin/associates/new`, not `/admin/dashboard`.

- [ ] **Step 3: Update postAuthLandingPath**

Edit `frontend/src/app/auth/post-auth-redirect.ts`, change the last line:

```typescript
  return '/admin/dashboard';
```

(replacing `return role === 'ADMIN' ? '/admin/associates/new' : '/settings';`)

- [ ] **Step 4: Run it to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='src/app/auth/post-auth-redirect.spec.ts'`
Expected: PASS

- [ ] **Step 5: Update the dependent specs**

Edit `frontend/src/app/auth/root-redirect.guard.spec.ts`, in the test `'redirects ADMIN to /admin/associates/new once launched'`:

```typescript
  it('redirects ADMIN to /admin/dashboard once launched', done => {
    authService.getRole.and.returnValue('ADMIN');
    setupService.getState.and.returnValue(of(launchedState));

    const result$ = TestBed.runInInjectionContext(() => rootRedirectGuard({} as any, {} as any)) as any;
    result$.subscribe((result: UrlTree) => {
      expect(result.toString()).toBe(router.parseUrl('/admin/dashboard').toString());
      done();
    });
  });
```

Edit `frontend/src/app/auth/login.component.spec.ts:60-74`, in the test `'navigates to the admin route on an ADMIN login once launched'`:

```typescript
    expect(router.navigate).toHaveBeenCalledWith(['/admin/dashboard']);
```

(replacing `expect(router.navigate).toHaveBeenCalledWith(['/admin/associates/new']);` at line 73)

Edit `frontend/src/app/auth/change-password.component.spec.ts:59-73`, in the test `'navigates to the admin route when an ADMIN completes a forced password change once launched'`:

```typescript
    expect(router.navigate).toHaveBeenCalledWith(['/admin/dashboard']);
```

(replacing `expect(router.navigate).toHaveBeenCalledWith(['/admin/associates/new']);` at line 72)

- [ ] **Step 6: Add the route**

Edit `frontend/src/app/app.routes.ts`. Add the import near the other admin-family imports (after the `AdminStatsComponent` import, line 22):

```typescript
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard.component';
```

Add the route entry near the other top-level `admin/*` routes (after line 59, `admin/withdrawals/new`):

```typescript
  { path: 'admin/dashboard', component: AdminDashboardComponent, canActivate: [authGuard, adminGuard, launchedModeGuard] },
```

- [ ] **Step 7: Run the full affected frontend test set**

Run: `cd frontend && npx ng test --watch=false --include='src/app/auth/**/*.spec.ts' --include='src/app/admin-dashboard/**/*.spec.ts'`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/auth/post-auth-redirect.ts \
        frontend/src/app/auth/post-auth-redirect.spec.ts frontend/src/app/auth/root-redirect.guard.spec.ts \
        frontend/src/app/auth/login.component.spec.ts frontend/src/app/auth/change-password.component.spec.ts
git commit -m "feat(routing): land every admin-family role on /admin/dashboard after auth"
```

---

### Task 4: Frontend — retire /settings/admin-stats

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.ts`
- Modify: `frontend/src/app/settings/settings-nav-rail.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`
- Delete: `frontend/src/app/settings/admin-stats/admin-stats.component.ts`
- Delete: `frontend/src/app/settings/admin-stats/admin-stats.component.spec.ts`
- Delete: `frontend/src/app/settings/admin-stats/admin-stats.service.ts`
- Delete: `frontend/src/app/settings/admin-stats/admin-stats.service.spec.ts`
- Delete: `frontend/src/app/settings/admin-stats/admin-stats.model.ts`

**Interfaces:** None — this task only removes now-dead code; nothing downstream depends on any of these files after Task 3 shipped `/admin/dashboard` as the replacement.

- [ ] **Step 1: Update the nav-rail spec first (TDD for a removal: assert the old row is gone and fix the index math)**

`settings-nav-rail.component.spec.ts` has 9 hardcoded rows appended after the `SECTION_PATHS`-derived ones, in template order: `associateDirectory, treeExplorer, kycQueue, auditLog, adminStats, salesRegister, cycleManagement, ledgerRegister, payoutApproval`. Several tests assert row position as `items.length - N` counting from the end. Removing `adminStats` drops the hardcoded count from 9 to 8, and shifts every row that comes *before* `adminStats` in that order (only `auditLog` has its own test) one position closer to the end — rows *after* `adminStats` (`salesRegister`, `cycleManagement`, `ledgerRegister`, `payoutApproval`) are unaffected since nothing after them changed.

Edit `frontend/src/app/settings/settings-nav-rail.component.spec.ts`:

Line 20, update the count:
```typescript
    expect(items.length).toBe(Object.keys(SECTION_PATHS).length + 8);
```

Line 17, update the test description to match (cosmetic, keeps the description honest):
```typescript
  it('renders one row per section plus hardcoded associate directory, tree explorer, kyc queue, audit log, sales register, cycle management, ledger register, and payout approval rows', () => {
```

Lines 31-36, `auditLog` shifts from 6th-from-end to 5th-from-end:
```typescript
  it('marks the audit log row active when the active section key is auditLog', () => {
    fixture.componentInstance.activeSectionKey = 'auditLog';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 5].classList).toContain('settings-nav-rail__item--active');
  });
```

Lines 38-43, delete the `'marks the admin stats row active...'` test entirely and replace it with a removal assertion:

```typescript
  it('no longer renders an admin stats nav row', () => {
    fixture.detectChanges();
    const links: HTMLAnchorElement[] = fixture.nativeElement.querySelectorAll('a');
    const hrefs = Array.from(links).map(a => a.getAttribute('href'));
    expect(hrefs).not.toContain('/settings/admin-stats');
  });
```

`salesRegister` (was `items.length - 4`), `cycleManagement` (`items.length - 3`), `ledgerRegister` (`items.length - 2`), `payoutApproval` (`items.length - 1`), and the final `'links each row...'` test (uses `links[0]`, `links[links.length - 2]`, `links[links.length - 1]`) are all unchanged — verify this by re-reading the file after the edits above rather than re-typing them, since none of their literal index constants move.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='src/app/settings/settings-nav-rail.component.spec.ts'`
Expected: FAIL — the admin-stats `<li>` is still in the template, so `/settings/admin-stats` is still in `hrefs`, and the count/index assertions still expect the old 9-row layout.

- [ ] **Step 3: Remove the nav-rail entry**

Edit `frontend/src/app/settings/settings-nav-rail.component.ts`, delete these three lines (33-35):

```typescript
        <li class="settings-nav-rail__item" [class.settings-nav-rail__item--active]="activeSectionKey === 'adminStats'">
          <a [routerLink]="['/settings', 'admin-stats']">{{ 'settings.sections.adminStats' | translate }}</a>
        </li>
```

- [ ] **Step 4: Remove the route**

Edit `frontend/src/app/app.routes.ts`:
- Delete the import `import { AdminStatsComponent } from './settings/admin-stats/admin-stats.component';` (line 22)
- `admin-stats` is the last entry in the `settings` route's `children` array. Replace lines 92-93:
```typescript
      { path: 'audit-log', component: AuditLogComponent, data: { sectionKey: 'auditLog' } },
      { path: 'admin-stats', component: AdminStatsComponent, data: { sectionKey: 'adminStats' } }
```
with:
```typescript
      { path: 'audit-log', component: AuditLogComponent, data: { sectionKey: 'auditLog' } }
```
(dropping the trailing comma along with the `admin-stats` entry, since `audit-log` is now the last element in the array).

- [ ] **Step 5: Delete the superseded admin-stats files**

```bash
git rm frontend/src/app/settings/admin-stats/admin-stats.component.ts \
       frontend/src/app/settings/admin-stats/admin-stats.component.spec.ts \
       frontend/src/app/settings/admin-stats/admin-stats.service.ts \
       frontend/src/app/settings/admin-stats/admin-stats.service.spec.ts \
       frontend/src/app/settings/admin-stats/admin-stats.model.ts
```

- [ ] **Step 6: Remove the now-dead i18n keys**

Edit `frontend/src/assets/i18n/en.json`: delete the top-level `"adminStats": { ... }` object (the one with `totalAssociatesLabel`/`walletBalanceLabel`/etc. under `settings`), and delete the `"adminStats": "Admin Stats"` line inside `settings.sections`.

Edit `frontend/src/assets/i18n/hi.json`: same two removals (the `settings.adminStats` object and the `settings.sections.adminStats` line).

- [ ] **Step 7: Run the full frontend test suite to confirm nothing else references the removed files**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS, no failures referencing `admin-stats` or missing modules.

- [ ] **Step 8: Build to confirm no dangling imports**

Run: `cd frontend && npx ng build`
Expected: Build succeeds — confirms `app.routes.ts` has no orphaned import of the deleted `AdminStatsComponent` and no JSON syntax errors from the i18n edits.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/app.routes.ts frontend/src/app/settings/settings-nav-rail.component.ts \
        frontend/src/app/settings/settings-nav-rail.component.spec.ts \
        frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "refactor(settings): remove admin-stats sub-page, superseded by /admin/dashboard"
```

---

## Final Verification

- [ ] Backend: `cd backend && mvn test` — full suite passes (aside from the pre-existing, unrelated JDK21/25 Mockito environment failures noted in project memory)
- [ ] Frontend: `cd frontend && npx ng test --watch=false` — full suite passes
- [ ] Frontend: `cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx tsc --noEmit -p tsconfig.spec.json` — clean
- [ ] Manually verify in a running app (per project convention of testing the golden path in-browser before calling UI work done): log in as `admin` / seeded password, confirm landing on `/admin/dashboard`, confirm all tiles render, confirm the KYC-pending, withdrawals, Record Sale, and Provision Associate links navigate correctly.
