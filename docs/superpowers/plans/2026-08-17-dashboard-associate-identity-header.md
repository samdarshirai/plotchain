# Associate Identity Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an identity header to the top of the associate dashboard — associate ID, name, rank, phone, joined date, and (when it has happened) rank-upgrade date, with an initials avatar in place of a photo.

**Architecture:** Three sequential layers, each independently testable. Task 1 (backend) adds a `rank_changed_at` timestamp column to `associate`, set only when `CycleService`'s existing rank-promotion branch actually promotes someone — not at initial provisioning. Task 2 (backend) surfaces that plus the associate's already-loaded identity fields (`name`, `phone`, `joined_at`, `user_id`, current rank name) as a new top-level `associate` field on `DashboardResponse`, populated from data `DashboardService.getDashboard` already fetches — no new queries. Task 3 (frontend) adds a new `AssociateIdentityHeaderComponent`, wired first in `DashboardComponent`'s render order, reusing the initials-avatar algorithm already established in `DigitalIdCardComponent`.

**Tech Stack:** Java 21, Spring Boot 3.3.x, Flyway, JUnit 5 + Mockito + AssertJ (backend). Angular 18 standalone components, `@ngx-translate/core`, Jasmine/Karma (frontend).

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` (Unit 2 of its build plan) — §1, §2 ("Profile photo, resolved" / "Rank upgrade date, resolved"), §3.1, §3.2.

## Global Constraints

- All associate-facing UI strings go through `@ngx-translate/core` translation keys with English (`en.json`) and Hindi (`hi.json`) entries — no hardcoded UI copy (base dashboard plan's Global Constraints, still binding).
- Money fields are `BigDecimal`/`NUMERIC` — not touched by this plan (no monetary fields in this unit).
- `rank_changed_at` is set only on an actual rank promotion (`CycleService`'s `advanceRanks`), never on initial provisioning (`AssociateProvisioningService.create`) — spec §2, §3.1.
- No photo upload — the widget renders an initials avatar computed client-side, same algorithm as `DigitalIdCardComponent.initials` (`frontend/src/app/digital-id-card/digital-id-card.component.ts:158-170`) — spec §2.
- `dashboard/` ships zero CSS today (confirmed by the spec's own investigation) — this plan follows that convention: no `styles` block on the new widget. A later unit (spec's Unit 8) does the styling pass for the whole `dashboard/` tree in one go.

---

### Task 1: Track when an associate's rank actually changes

**Files:**
- Create: `backend/src/main/resources/db/migration/V29__associate_rank_changed_at.sql`
- Modify: `backend/src/main/java/com/plotchain/associate/Associate.java`
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java:441-445`
- Test: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/associate/AssociateProvisioningServiceTest.java`

**Interfaces:**
- Produces: `Associate.getRankChangedAt()` / `.setRankChangedAt(Instant)` — `Instant`, nullable. Task 2 reads this getter directly; no other new method.

- [ ] **Step 1: Write the failing test — promotion sets the timestamp**

In `CycleServiceTest.java`, add a new assertion to the existing promotion test `closeAdvancesRankWhenCumulativeMatchedVolumeCrossesOneThreshold` (the test already promotes `root` from Bronze to Silver — just add one more assertion after the existing `assertThat(root.getRankId()).isEqualTo(silverId);` at line 899):

```java
        assertThat(root.getRankId()).isEqualTo(silverId);
        assertThat(root.getRankChangedAt()).isNotNull();
```

Add a second assertion to the existing no-promotion test `closeKeepsCurrentRankUnchangedWhenMatchedVolumeDoesNotCrossAnyNewThreshold` (after its existing `assertThat(root.getRankId()).isEqualTo(silverId);` — the last line of that test):

```java
        assertThat(root.getCumulativeMatchedVolume()).isEqualByComparingTo("200");
        assertThat(root.getRankId()).isEqualTo(silverId);
        assertThat(root.getRankChangedAt()).isNull();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=CycleServiceTest#closeAdvancesRankWhenCumulativeMatchedVolumeCrossesOneThreshold,CycleServiceTest#closeKeepsCurrentRankUnchangedWhenMatchedVolumeDoesNotCrossAnyNewThreshold`
Expected: both FAIL to compile — `Associate` has no `getRankChangedAt()` method yet.

- [ ] **Step 3: Add the migration**

Create `backend/src/main/resources/db/migration/V29__associate_rank_changed_at.sql`:

```sql
ALTER TABLE associate ADD COLUMN rank_changed_at TIMESTAMP NULL;
```

- [ ] **Step 4: Add the field to the `Associate` entity**

In `backend/src/main/java/com/plotchain/associate/Associate.java`, add the field after the existing `lastActiveAt` field (it's the same `Instant`-typed, nullable shape):

```java
    @Column(name = "rank_changed_at")
    private Instant rankChangedAt;
```

Add the getter/setter pair after `getLastActiveAt()`/`setLastActiveAt(...)`:

```java
    public Instant getRankChangedAt() { return rankChangedAt; }
    public void setRankChangedAt(Instant rankChangedAt) { this.rankChangedAt = rankChangedAt; }
```

- [ ] **Step 5: Set it on promotion, only on promotion**

In `backend/src/main/java/com/plotchain/cycle/CycleService.java`, inside `advanceRanks`, change:

```java
            if (highestQualified.getRankOrder() > currentRankOrder) {
                associate.setRankId(highestQualified.getId());
                associateRepository.save(associate);
            }
```

to:

```java
            if (highestQualified.getRankOrder() > currentRankOrder) {
                associate.setRankId(highestQualified.getId());
                associate.setRankChangedAt(Instant.now());
                associateRepository.save(associate);
            }
```

`CycleService.java` already imports `java.time.Instant` (used elsewhere in the file for `LedgerEntry.setCreatedAt(Instant.now())`) — no new import needed.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=CycleServiceTest`
Expected: all `CycleServiceTest` tests PASS, including the two from Step 1.

- [ ] **Step 7: Prove provisioning does not set it**

In `AssociateProvisioningServiceTest.java`, add one assertion to the existing `createsAnAssociateWithATemporaryPasswordThatMustBeChanged` test, alongside its other `created.get*()` assertions (after `assertThat(created.getUserId()).isEqualTo("VP00001");`):

```java
        assertThat(created.getUserId()).isEqualTo("VP00001");
        assertThat(created.getRankChangedAt()).isNull();
```

Run: `cd backend && mvn test -Dtest=AssociateProvisioningServiceTest`
Expected: PASS — `AssociateProvisioningService.create` never calls `setRankChangedAt`, so it stays `null` by default.

- [ ] **Step 8: Full backend compile + affected-module test run**

Run: `cd backend && mvn test -Dtest=CycleServiceTest,AssociateProvisioningServiceTest,DashboardServiceTest,DashboardControllerTest`
Expected: all PASS. (`DashboardServiceTest`/`DashboardControllerTest` are included here only as a regression check — this task doesn't touch them; Task 2 does.)

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/resources/db/migration/V29__associate_rank_changed_at.sql \
        backend/src/main/java/com/plotchain/associate/Associate.java \
        backend/src/main/java/com/plotchain/cycle/CycleService.java \
        backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java \
        backend/src/test/java/com/plotchain/associate/AssociateProvisioningServiceTest.java
git commit -m "feat(associate): track rank_changed_at, set only on real promotion"
```

---

### Task 2: Surface associate identity on the dashboard API

**Depends on:** Task 1 (`Associate.getRankChangedAt()`)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Consumes: `Associate.getUserId()/.getName()/.getPhone()/.getJoinedAt()/.getRankChangedAt()` (all pre-existing except the last, from Task 1); `currentRank.getName()` (already computed locally in `DashboardService.getDashboard`, `DashboardService.java:94-97`).
- Produces: `DashboardResponse.AssociateSummary(String associateId, String name, String rank, String phone, Instant joinedAt, Instant rankChangedAt)`, and a new `DashboardResponse.associate()` accessor. Task 3 consumes exactly these five field names and types.

- [ ] **Step 1: Write the failing test**

In `DashboardServiceTest.java`, extend the `Associate` setup in `aggregatesAllDashboardWidgetsForAnAssociate` (right after the existing `associate.setCumulativeMatchedVolume(BigDecimal.valueOf(4000));` line):

```java
        associate.setUserId("SDI384818");
        associate.setName("Asha Kumar");
        associate.setPhone("9876543210");
        Instant joinedAt = Instant.parse("2025-09-05T05:25:42Z");
        Instant rankChangedAt = Instant.parse("2026-01-10T09:00:00Z");
        associate.setJoinedAt(joinedAt);
        associate.setRankChangedAt(rankChangedAt);
```

(`java.time.Instant` is already imported in this test file — it's used by the `compensationPlanVersion` fixture helper — no new import needed.)

Add assertions after the existing `assertThat(response.kycPendingBannerVisible()).isTrue();` line:

```java
        assertThat(response.associate().associateId()).isEqualTo("SDI384818");
        assertThat(response.associate().name()).isEqualTo("Asha Kumar");
        assertThat(response.associate().rank()).isEqualTo("Sales Associate");
        assertThat(response.associate().phone()).isEqualTo("9876543210");
        assertThat(response.associate().joinedAt()).isEqualTo(joinedAt);
        assertThat(response.associate().rankChangedAt()).isEqualTo(rankChangedAt);
```

In the second test, `projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction`, add one assertion after the existing `assertThat(response.legVolume().projectedMatchAmount())...` line to cover the never-promoted case (that test's `associate` never calls `setRankChangedAt`, so it stays `null`):

```java
        assertThat(response.associate().rankChangedAt()).isNull();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest`
Expected: FAIL to compile — `DashboardResponse` has no `associate()` accessor yet.

- [ ] **Step 3: Add `AssociateSummary` to `DashboardResponse`**

In `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java`, add `AssociateSummary associate` as the first component of the main record, and add the nested record alongside the other nested records:

```java
public record DashboardResponse(
    AssociateSummary associate,
    boolean kycPendingBannerVisible,
    CycleIncome cycleIncome,
    WalletSummary wallet,
    LegVolumeSummary legVolume,
    RankProgress rankProgress,
    TeamSnapshot teamSnapshot,
    CycleCountdown cycleCountdown,
    List<AnnouncementSummary> announcements
) {
    public record AssociateSummary(String associateId, String name, String rank, String phone, Instant joinedAt, Instant rankChangedAt) {}
    public record CycleIncome(UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal totalIncome) {}
    public record WalletSummary(BigDecimal balance) {}
    public record LegVolumeSummary(BigDecimal leftVolume, BigDecimal rightVolume, BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight, BigDecimal projectedMatchAmount) {}
    public record RankProgress(String currentRank, int currentRankOrder, String nextRank, int progressPercent, BigDecimal volumeToNextRank) {}
    public record TeamSnapshot(long totalDownline, long activeToday, long newJoinsThisCycle) {}
    public record CycleCountdown(UUID cycleId, long daysRemaining) {}
    public record AnnouncementSummary(UUID id, String title, Instant publishedAt) {}
}
```

- [ ] **Step 4: Populate it in `DashboardService`**

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, change the `return new DashboardResponse(...)` call (currently starting `associate.getKycStatus() != KycStatus.VERIFIED,`) to pass the new `AssociateSummary` as the first argument:

```java
        return new DashboardResponse(
            new DashboardResponse.AssociateSummary(
                associate.getUserId(), associate.getName(), currentRank.getName(),
                associate.getPhone(), associate.getJoinedAt(), associate.getRankChangedAt()),
            associate.getKycStatus() != KycStatus.VERIFIED,
            new DashboardResponse.CycleIncome(cycle.getId(), direct, matching, total),
            new DashboardResponse.WalletSummary(wallet.getBalance()),
            new DashboardResponse.LegVolumeSummary(
                legVolume.getLeftLegVolume(), legVolume.getRightLegVolume(),
                legVolume.getCarriedForwardLeft(), legVolume.getCarriedForwardRight(),
                projectedMatch),
            new DashboardResponse.RankProgress(
                currentRank.getName(), currentRank.getRankOrder(),
                nextRank.map(RankTier::getName).orElse(null),
                progressPercent, volumeToNextRank),
            new DashboardResponse.TeamSnapshot(totalDownline, activeToday, newJoins),
            new DashboardResponse.CycleCountdown(cycle.getId(), daysRemaining),
            announcements.stream()
                .map(a -> new DashboardResponse.AnnouncementSummary(a.getId(), a.getTitle(), a.getPublishedAt()))
                .toList()
        );
```

`currentRank` is already resolved earlier in the same method (`DashboardService.java:94-97`) — no new lookup.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest`
Expected: all PASS.

- [ ] **Step 6: Update the controller test**

In `DashboardControllerTest.java`, extend the `associate` setup in `returnsDashboardJsonForTheAuthenticatedAssociate` (after the existing `associate.setCumulativeMatchedVolume(BigDecimal.ZERO);` line):

```java
        associate.setUserId("SDI384818");
        associate.setName("Asha Kumar");
        associate.setPhone("9876543210");
        associate.setJoinedAt(Instant.now());
```

(This requires `import java.time.Instant;` — not currently imported; add it alongside the existing `import java.time.LocalDate;`.)

Add one more `jsonPath` assertion to the existing `mockMvc.perform(...)` chain, alongside the existing `.andExpect(jsonPath("$.teamSnapshot.totalDownline").value(12));`:

```java
        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.teamSnapshot.totalDownline").value(12))
            .andExpect(jsonPath("$.associate.name").value("Asha Kumar"));
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=DashboardControllerTest`
Expected: all PASS.

- [ ] **Step 8: Full backend regression check**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest,DashboardControllerTest,CycleServiceTest,AssociateProvisioningServiceTest`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java \
        backend/src/main/java/com/plotchain/dashboard/DashboardService.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java \
        backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "feat(dashboard): surface associate identity in DashboardResponse"
```

---

### Task 3: Render the identity header widget

**Depends on:** Task 2 (`DashboardResponse.associate` field shape)

**Files:**
- Create: `frontend/src/app/dashboard/widgets/associate-identity-header/associate-identity-header.component.ts`
- Create: `frontend/src/app/dashboard/widgets/associate-identity-header/associate-identity-header.component.spec.ts`
- Modify: `frontend/src/app/dashboard/models/dashboard-response.model.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `DashboardResponse.associate: AssociateSummary` (new model field, this task adds the TS interface matching Task 2's JSON shape: `associateId: string; name: string; rank: string; phone: string; joinedAt: string; rankChangedAt: string | null`).
- Produces: `AssociateIdentityHeaderComponent` with `@Input({ required: true }) data!: AssociateSummary`. Nothing later in this plan consumes it — this is the plan's last task.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/dashboard/widgets/associate-identity-header/associate-identity-header.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateIdentityHeaderComponent } from './associate-identity-header.component';

describe('AssociateIdentityHeaderComponent', () => {
  let fixture: ComponentFixture<AssociateIdentityHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssociateIdentityHeaderComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(AssociateIdentityHeaderComponent);
  });

  it('renders associate ID, name, rank, phone, and joined date', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    };
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('SDI384818');
    expect(text).toContain('Asha Kumar');
    expect(text).toContain('Sales Associate');
    expect(text).toContain('9876543210');
  });

  it('renders the rank-changed date when set', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Executive',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: '2026-01-10T09:00:00Z'
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-identity-header__rank-changed')).toBeTruthy();
  });

  it('omits the rank-changed row when never promoted', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-identity-header__rank-changed')).toBeFalsy();
  });

  it('renders an initials avatar derived from the name', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-identity-header__avatar').textContent.trim()).toBe('AK');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx ng test --watch=false --include='**/associate-identity-header.component.spec.ts'`
Expected: FAIL — the component module doesn't exist yet.

- [ ] **Step 3: Add the `AssociateSummary` interface to the model**

In `frontend/src/app/dashboard/models/dashboard-response.model.ts`, add the new interface before `DashboardResponse` and add the field to `DashboardResponse`:

```typescript
export interface AssociateSummary {
  associateId: string;
  name: string;
  rank: string;
  phone: string;
  joinedAt: string;
  rankChangedAt: string | null;
}

export interface CycleIncome {
  cycleId: string;
  directIncome: number;
  matchingIncome: number;
  totalIncome: number;
}
```

(Only the new `AssociateSummary` interface is added above `CycleIncome` — everything below it in the file is unchanged except `DashboardResponse`, below.)

In the same file, add `associate: AssociateSummary;` as the first field of `DashboardResponse`:

```typescript
export interface DashboardResponse {
  associate: AssociateSummary;
  kycPendingBannerVisible: boolean;
  cycleIncome: CycleIncome;
  wallet: WalletSummary;
  legVolume: LegVolumeSummary;
  rankProgress: RankProgress;
  teamSnapshot: TeamSnapshot;
  cycleCountdown: CycleCountdown;
  announcements: AnnouncementSummary[];
}
```

- [ ] **Step 4: Add the i18n keys**

In `frontend/src/assets/i18n/en.json`, inside the `"dashboard"` object, the current last two entries are (`en.json:14-15`):

```json
    "carriedForward": "Carried Forward",
    "loadError": "Something went wrong loading your dashboard. Please try again."
```

Insert four new keys between them, so it reads:

```json
    "carriedForward": "Carried Forward",
    "associateIdLabel": "Associate ID",
    "phoneLabel": "Mobile",
    "joinedAtLabel": "Joined",
    "rankChangedAtLabel": "Rank Upgraded",
    "loadError": "Something went wrong loading your dashboard. Please try again."
```

In `frontend/src/assets/i18n/hi.json`, inside the `"dashboard"` object, the same two entries exist at the same position (`hi.json:14-15`). Insert the matching keys the same way:

```json
    "carriedForward": "कैरी फॉरवर्ड",
    "associateIdLabel": "एसोसिएट आईडी",
    "phoneLabel": "मोबाइल",
    "joinedAtLabel": "शामिल होने की तिथि",
    "rankChangedAtLabel": "रैंक अपग्रेड की तिथि",
    "loadError": "आपका डैशबोर्ड लोड करने में समस्या हुई। कृपया पुनः प्रयास करें।"
```

- [ ] **Step 5: Write the component**

Create `frontend/src/app/dashboard/widgets/associate-identity-header/associate-identity-header.component.ts`:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-associate-identity-header',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="associate-identity-header">
      <span class="associate-identity-header__avatar">{{ initials }}</span>
      <div class="associate-identity-header__details">
        <div class="associate-identity-header__id">{{ 'dashboard.associateIdLabel' | translate }}: {{ data.associateId }}</div>
        <div class="associate-identity-header__name">{{ data.name }}</div>
        <div class="associate-identity-header__rank">{{ data.rank }}</div>
        <div class="associate-identity-header__phone">{{ 'dashboard.phoneLabel' | translate }}: {{ data.phone }}</div>
        <div class="associate-identity-header__joined">{{ 'dashboard.joinedAtLabel' | translate }}: {{ data.joinedAt | date: 'mediumDate' }}</div>
        <div class="associate-identity-header__rank-changed" *ngIf="data.rankChangedAt">{{ 'dashboard.rankChangedAtLabel' | translate }}: {{ data.rankChangedAt | date: 'mediumDate' }}</div>
      </div>
    </div>
  `
})
export class AssociateIdentityHeaderComponent {
  @Input({ required: true }) data!: AssociateSummary;

  // Same algorithm as DigitalIdCardComponent.initials() (frontend/src/app/digital-id-card/digital-id-card.component.ts:158-170):
  // trim -> split on whitespace -> first 2 words -> first letter of each, uppercased.
  get initials(): string {
    const name = this.data.name ?? '';
    if (!name.trim()) {
      return '';
    }
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/associate-identity-header.component.spec.ts'`
Expected: all 4 tests PASS.

- [ ] **Step 7: Wire the widget into `DashboardComponent`**

In `frontend/src/app/dashboard/dashboard.component.ts`, add the import and register the component:

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';
import { AssociateIdentityHeaderComponent } from './widgets/associate-identity-header/associate-identity-header.component';
import { KycBannerComponent } from './widgets/kyc-banner/kyc-banner.component';
import { CycleIncomeCardComponent } from './widgets/cycle-income-card/cycle-income-card.component';
import { WalletCardComponent } from './widgets/wallet-card/wallet-card.component';
import { LegVolumeGaugeComponent } from './widgets/leg-volume-gauge/leg-volume-gauge.component';
import { RankProgressComponent } from './widgets/rank-progress/rank-progress.component';
import { TeamSnapshotComponent } from './widgets/team-snapshot/team-snapshot.component';
import { QuickActionsComponent } from './widgets/quick-actions/quick-actions.component';
import { CycleCountdownComponent } from './widgets/cycle-countdown/cycle-countdown.component';
import { AnnouncementsStripComponent } from './widgets/announcements-strip/announcements-strip.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, TranslateModule, AssociateIdentityHeaderComponent, KycBannerComponent, CycleIncomeCardComponent, WalletCardComponent,
    LegVolumeGaugeComponent, RankProgressComponent, TeamSnapshotComponent,
    QuickActionsComponent, CycleCountdownComponent, AnnouncementsStripComponent
  ],
  template: `
    <div class="dashboard" *ngIf="dashboard as d">
      <app-associate-identity-header [data]="d.associate"></app-associate-identity-header>
      <app-kyc-banner [visible]="d.kycPendingBannerVisible"></app-kyc-banner>
      <app-cycle-income-card [data]="d.cycleIncome"></app-cycle-income-card>
      <app-wallet-card [balance]="d.wallet.balance"></app-wallet-card>
      <app-leg-volume-gauge [data]="d.legVolume"></app-leg-volume-gauge>
      <app-rank-progress [data]="d.rankProgress"></app-rank-progress>
      <app-team-snapshot [data]="d.teamSnapshot"></app-team-snapshot>
      <app-quick-actions></app-quick-actions>
      <app-cycle-countdown [data]="d.cycleCountdown"></app-cycle-countdown>
      <app-announcements-strip [announcements]="d.announcements"></app-announcements-strip>
    </div>
    <div class="dashboard-error" *ngIf="error">{{ 'dashboard.loadError' | translate }}</div>
  `
})
export class DashboardComponent implements OnInit {
  dashboard: DashboardResponse | null = null;
  error: boolean = false;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.dashboardService.getDashboard().subscribe({
      next: d => this.dashboard = d,
      error: () => this.error = true
    });
  }
}
```

- [ ] **Step 8: Update `DashboardComponent`'s spec**

In `frontend/src/app/dashboard/dashboard.component.spec.ts`, add `associate` to `mockResponse` (as the first field) and add the new tag name as the first entry of the expected selectors array:

```typescript
  const mockResponse: DashboardResponse = {
    associate: {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    },
    kycPendingBannerVisible: true,
    cycleIncome: { cycleId: 'c1', directIncome: 1000, matchingIncome: 500, totalIncome: 1500 },
    wallet: { balance: 2500 },
    legVolume: { leftVolume: 3000, rightVolume: 2000, carriedForwardLeft: 0, carriedForwardRight: 1000, projectedMatchAmount: 140 },
    rankProgress: { currentRank: 'Sales Associate', currentRankOrder: 1, nextRank: 'Sales Executive', progressPercent: 40, volumeToNextRank: 6000 },
    teamSnapshot: { totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2 },
    cycleCountdown: { cycleId: 'c1', daysRemaining: 10 },
    announcements: [{ id: 'a1', title: 'Green Valley launch', publishedAt: '2026-07-20T00:00:00Z' }]
  };
```

```typescript
  it('renders all nine widgets in the spec-mandated stat-first order', () => {
    const selectors = Array.from(fixture.nativeElement.querySelectorAll('.dashboard > *'))
      .map((el: any) => el.tagName.toLowerCase());
    expect(selectors).toEqual([
      'app-associate-identity-header',
      'app-kyc-banner',
      'app-cycle-income-card',
      'app-wallet-card',
      'app-leg-volume-gauge',
      'app-rank-progress',
      'app-team-snapshot',
      'app-quick-actions',
      'app-cycle-countdown',
      'app-announcements-strip'
    ]);
  });
```

(The test's name still says "nine widgets" — leave it as-is; renaming it is cosmetic and out of scope for this plan. It now asserts ten.)

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd frontend && npx ng test --watch=false --include='**/dashboard.component.spec.ts'`
Expected: PASS.

- [ ] **Step 10: Full frontend regression check**

Run: `cd frontend && npx ng test --watch=false`
Expected: same total pass count as before this task, plus the 4 new `associate-identity-header` tests (no other spec references dashboard widget markup by position except `dashboard.component.spec.ts`, already updated).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/dashboard/widgets/associate-identity-header/ \
        frontend/src/app/dashboard/models/dashboard-response.model.ts \
        frontend/src/app/dashboard/dashboard.component.ts \
        frontend/src/app/dashboard/dashboard.component.spec.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): render associate identity header widget"
```
