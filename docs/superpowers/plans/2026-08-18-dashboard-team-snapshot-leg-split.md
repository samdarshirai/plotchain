# Team Snapshot — Left/Right Associate Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `leftAssociates`/`rightAssociates` (per-leg downline counts, seeded at the associate's immediate left/right child) to the dashboard's team snapshot widget.

**Architecture:** Backend: one new recursive-CTE `@Query` method on `AssociateRepository`, the exact same shape as the existing `countDownline` (`AssociateRepository.java:18-25`) but seeded at `WHERE parent_id = :associateId AND position = :position` instead of just `parent_id = :associateId` — reuses the `position` column (`"L"`/`"R"`) `existsByParentIdAndPosition` already reads (`AssociateRepository.java:57`) and `CycleService` already writes/compares (`"R".equals(associate.getPosition())`). Fed into two new fields on `DashboardResponse.TeamSnapshot`. Frontend: two more rows on `team-snapshot.component.ts`, reusing the `dashboard.leftLeg`/`dashboard.rightLeg` i18n keys the leg-volume gauge already uses — no new translation keys needed.

**Tech Stack:** Spring Boot 3.3.x (Java 21), Spring Data JPA (native `@Query`, `WITH RECURSIVE`), `@DataJpaTest` against H2 (MODE=PostgreSQL), JUnit 5 + Mockito + AssertJ, Angular 18 standalone components, Jasmine/Karma, `@ngx-translate/core`.

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` §3.1 (`TeamSnapshot.leftAssociates` / `rightAssociates` row: *"new `AssociateRepository` query, same recursive-CTE shape as `countDownline`... but seeded at `SELECT id FROM associate WHERE parent_id = :associateId AND position = :position` instead of just `parent_id = :associateId`"*) and §3.2 (widget order item 7: *"Team snapshot — now also shows the left/right associate split"*).

## Global Constraints

- Every associate-facing string needs both an English (`frontend/src/assets/i18n/en.json`) and Hindi (`frontend/src/assets/i18n/hi.json`) translation key — no hardcoded UI text. This unit needs none new: it reuses the existing `dashboard.leftLeg`/`dashboard.rightLeg` keys (`"L"`/`"R"` in English, already Hindi-translated) the leg-volume gauge widget already renders.
- `0` (a `count(*)` on an empty CTE result, never `null`) for an associate with no child in that position yet — same "no-op, not a failure" convention every other count on this dashboard follows. No `COALESCE` needed: `count(*)` over zero rows already returns `0`, never `null`, in both H2 and Postgres.
- No migration, no schema change — `position` already exists on `associate` and is already populated for every associate with a parent.
- `DashboardControllerTest`'s "real service behind mocked repository interfaces" pattern (`@SpringBootTest` + `@AutoConfigureMockMvc` + `@MockBean` on every repository interface, never on the concrete `DashboardService`) — the new `AssociateRepository` method calls this task adds need a matching `@MockBean` stub, or the unstubbed mock returns `0L` (Mockito's default for a primitive `long`-returning method is `0`, not an exception) which happens to be harmless here but should still be stubbed explicitly so the test asserts real values, not defaults.

---

### Task 1: Backend — add the left/right downline count query to `AssociateRepository`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Produces: `AssociateRepository.countDownlineByPosition(UUID associateId, String position)` returning `long`, `0` when the associate has no child in that position. Task 2's `DashboardService` calls this twice directly, once with `"L"` and once with `"R"`.

- [ ] **Step 1: Write the failing repository test**

In `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`, add this test directly after the existing `countDownlineCountsAllDescendantsRegardlessOfDepth` test (this file already has a `newAssociate(UUID parentId, String position, UUID rankId)` helper at the bottom — reuse it, don't redefine it):

```java
    @Test
    void countDownlineByPositionCountsOnlyTheGivenLegRegardlessOfDepth() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate root = newAssociate(null, null, rank.getId());
        Associate leftChild = newAssociate(root.getId(), "L", rank.getId());
        Associate leftGrandchild = newAssociate(leftChild.getId(), "L", rank.getId());
        Associate rightChild = newAssociate(root.getId(), "R", rank.getId());
        associateRepository.saveAll(java.util.List.of(root, leftChild, leftGrandchild, rightChild));
        entityManager.flush();

        assertThat(associateRepository.countDownlineByPosition(root.getId(), "L")).isEqualTo(2);
        assertThat(associateRepository.countDownlineByPosition(root.getId(), "R")).isEqualTo(1);
    }

    @Test
    void countDownlineByPositionReturnsZeroWhenNoChildOccupiesThatPosition() {
        RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(10000));
        entityManager.persist(rank);

        Associate root = newAssociate(null, null, rank.getId());
        Associate leftChild = newAssociate(root.getId(), "L", rank.getId());
        associateRepository.saveAll(java.util.List.of(root, leftChild));
        entityManager.flush();

        assertThat(associateRepository.countDownlineByPosition(root.getId(), "R")).isEqualTo(0);
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=AssociateRepositoryTest -pl . -q`
Expected: compile error — `AssociateRepository` has no `countDownlineByPosition` method yet.

- [ ] **Step 3: Add the query method**

In `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`, directly after the existing `countDownline` method (currently lines 18-25):

```java
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline
        """, nativeQuery = true)
    long countDownline(@Param("associateId") UUID associateId);
```

add:

```java
    // Team snapshot's per-leg associate counts (dashboard spec §3.1): identical shape to
    // countDownline above, but the CTE's base case is seeded at the immediate LEFT or RIGHT
    // child (position = :position) instead of every immediate child -- everything from there
    // down is that child's own subtree, so this genuinely counts "how many associates are in my
    // left leg" / "in my right leg", not a filtered slice of the combined downline.
    @Query(value = """
        WITH RECURSIVE downline(id) AS (
            SELECT id FROM associate WHERE parent_id = :associateId AND position = :position
            UNION ALL
            SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
        )
        SELECT count(*) FROM downline
        """, nativeQuery = true)
    long countDownlineByPosition(@Param("associateId") UUID associateId, @Param("position") String position);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=AssociateRepositoryTest -pl . -q`
Expected: PASS, all tests in the class green (including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRepository.java backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat(associate): add per-leg downline count query"
```

---

### Task 2: Backend — wire `leftAssociates`/`rightAssociates` into `DashboardResponse.TeamSnapshot`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java:24`
- Modify: `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`

**Interfaces:**
- Consumes: Task 1's `AssociateRepository.countDownlineByPosition(UUID, String)` → `long`.
- Produces: `DashboardResponse.TeamSnapshot` record gains two new components, appended after `newJoinsThisCycle`: `leftAssociates`, `rightAssociates` (both `long`). Task 3 (frontend) reads these as `data.leftAssociates` / `data.rightAssociates` on the `TeamSnapshot` TS interface.

- [ ] **Step 1: Write the failing service-level test**

In `backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java`, `aggregatesAllDashboardWidgetsForAnAssociate` currently stubs `associateRepository.countDownline(associateId)`. Add two more stubs directly after that existing stub:

```java
        when(associateRepository.countDownlineByPosition(associateId, "L")).thenReturn(7L);
        when(associateRepository.countDownlineByPosition(associateId, "R")).thenReturn(5L);
```

Then add two assertions directly after the existing `assertThat(response.teamSnapshot().newJoinsThisCycle())...` assertion:

```java
        assertThat(response.teamSnapshot().leftAssociates()).isEqualTo(7L);
        assertThat(response.teamSnapshot().rightAssociates()).isEqualTo(5L);
```

Two other tests in this file call `associateRepository.countDownline(...)` but don't assert on `teamSnapshot()` — they still need a stub for the new method, or the real service call hits an unstubbed mock. Add the same one-line stub directly after each test's existing `countDownline` stub:

In `currentLegVolumeDefaultsToZeroWhenTheAssociateHasNeverBeenThroughAClose`, directly after `when(associateRepository.countDownline(any())).thenReturn(0L);`:

```java
        when(associateRepository.countDownlineByPosition(any(), any())).thenReturn(0L);
```

In `projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction`, directly after `when(associateRepository.countDownline(associateId)).thenReturn(0L);`:

```java
        when(associateRepository.countDownlineByPosition(any(), any())).thenReturn(0L);
```

(Use the `any()`/`any()` two-arg form for both — neither test cares about the specific position argument. Only `aggregatesAllDashboardWidgetsForAnAssociate` needs position-specific stubs, because it's the one asserting on the resulting values. `rejectsTheDashboardForAnAccountWithNoRank` and `throwsAssociateNotFoundExceptionWhenAssociateDoesNotExist` both throw before reaching this line — no stub needed in either.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: compile error — `TeamSnapshot` has no `leftAssociates()`/`rightAssociates()` methods yet.

- [ ] **Step 3: Extend the `TeamSnapshot` record**

In `backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java:24`, currently:

```java
    public record TeamSnapshot(long totalDownline, long activeToday, long newJoinsThisCycle) {}
```

change to:

```java
    public record TeamSnapshot(long totalDownline, long activeToday, long newJoinsThisCycle, long leftAssociates, long rightAssociates) {}
```

- [ ] **Step 4: Populate the two new fields in `DashboardService`**

In `backend/src/main/java/com/plotchain/dashboard/DashboardService.java`, directly after the existing `long newJoins = associateRepository.countJoinedBetween(...)` block, add:

```java
        long leftAssociates = associateRepository.countDownlineByPosition(associateId, "L");
        long rightAssociates = associateRepository.countDownlineByPosition(associateId, "R");
```

Then, in the `return new DashboardResponse(...)` block, change:

```java
            new DashboardResponse.TeamSnapshot(totalDownline, activeToday, newJoins),
```

to:

```java
            new DashboardResponse.TeamSnapshot(totalDownline, activeToday, newJoins, leftAssociates, rightAssociates),
```

- [ ] **Step 5: Run the service test to verify it passes**

Run: `cd backend && mvn test -Dtest=DashboardServiceTest -pl . -q`
Expected: PASS, all tests in the class green.

- [ ] **Step 6: Add controller-level assertions proving end-to-end wiring**

In `backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java`'s `returnsDashboardJsonForTheAuthenticatedAssociate`, add a stub directly after the existing `associateRepository.countDownline(any())` stub:

```java
        when(associateRepository.countDownlineByPosition(any(), any())).thenReturn(0L);
```

Add two assertions to the existing `jsonPath` chain, after the existing `$.legVolume.newBookedAreaSqft` assertion:

```java
            .andExpect(jsonPath("$.legVolume.newBookedAreaSqft").value(0))
            .andExpect(jsonPath("$.teamSnapshot.leftAssociates").value(0))
            .andExpect(jsonPath("$.teamSnapshot.rightAssociates").value(0));
```

- [ ] **Step 7: Run the controller test to verify it passes**

Run: `cd backend && mvn test -Dtest=DashboardControllerTest -pl . -q`
Expected: PASS, all tests in the class green.

- [ ] **Step 8: Run the full backend test suite**

Run: `cd backend && mvn test -q`
Expected: PASS except the pre-existing, unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` dev-secret-guard failures (4 total, environment-dependent JDK/Mockito mismatch — see `issues.md`). No other class should show a new failure.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java backend/src/main/java/com/plotchain/dashboard/DashboardService.java backend/src/test/java/com/plotchain/dashboard/DashboardServiceTest.java backend/src/test/java/com/plotchain/dashboard/DashboardControllerTest.java
git commit -m "feat(dashboard): add left/right associate split to team snapshot"
```

---

### Task 3: Frontend — render the left/right associate split on the team snapshot widget

**Files:**
- Modify: `frontend/src/app/dashboard/models/dashboard-response.model.ts:44-48`
- Modify: `frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.ts`
- Modify: `frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.spec.ts`
- Modify: `frontend/src/app/dashboard/dashboard.component.spec.ts:22`

**Interfaces:**
- Consumes: Task 2's `DashboardResponse.TeamSnapshot` JSON shape — `leftAssociates`, `rightAssociates` fields (both numbers, always present, `0` when the associate has no child in that position).
- Produces: no new consumers in this plan.

- [ ] **Step 1: Write the failing component test**

In `frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.spec.ts`, add the two new fields to the fixture in `beforeEach` and add `TranslateModule.forRoot()` to the `imports` (the component currently renders no translated text; this task adds its first two, following the exact `TranslateModule` setup `leg-volume-gauge.component.spec.ts` already uses):

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TeamSnapshotComponent } from './team-snapshot.component';

describe('TeamSnapshotComponent', () => {
  let fixture: ComponentFixture<TeamSnapshotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamSnapshotComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(TeamSnapshotComponent);
    fixture.componentInstance.data = {
      totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2,
      leftAssociates: 7, rightAssociates: 5
    };
    fixture.detectChanges();
  });

  it('renders downline size, active-today count, and new joins', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('12');
    expect(text).toContain('3');
    expect(text).toContain('2');
  });

  it('renders the left and right associate split', () => {
    const left = fixture.nativeElement.querySelector('.left-associates').textContent;
    const right = fixture.nativeElement.querySelector('.right-associates').textContent;
    expect(left).toContain('7');
    expect(right).toContain('5');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/team-snapshot.component.spec.ts'`
Expected: FAIL — TS compile error, `leftAssociates`/`rightAssociates` don't exist on type `TeamSnapshot`, and the new test can't find `.left-associates`/`.right-associates` elements.

- [ ] **Step 3: Extend the `TeamSnapshot` TS interface**

In `frontend/src/app/dashboard/models/dashboard-response.model.ts:44-48`, currently:

```typescript
export interface TeamSnapshot {
  totalDownline: number;
  activeToday: number;
  newJoinsThisCycle: number;
}
```

change to:

```typescript
export interface TeamSnapshot {
  totalDownline: number;
  activeToday: number;
  newJoinsThisCycle: number;
  leftAssociates: number;
  rightAssociates: number;
}
```

- [ ] **Step 4: Add the template rows**

In `frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.ts`, currently:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TeamSnapshot } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-team-snapshot',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="team-snapshot">
      <div class="total-downline">{{ data.totalDownline }}</div>
      <div class="active-today">{{ data.activeToday }}</div>
      <div class="new-joins">{{ data.newJoinsThisCycle }}</div>
    </div>
  `
})
export class TeamSnapshotComponent {
  @Input({ required: true }) data!: TeamSnapshot;
}
```

change to:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TeamSnapshot } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-team-snapshot',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="team-snapshot">
      <div class="total-downline">{{ data.totalDownline }}</div>
      <div class="active-today">{{ data.activeToday }}</div>
      <div class="new-joins">{{ data.newJoinsThisCycle }}</div>
      <div class="left-associates">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftAssociates }}</div>
      <div class="right-associates">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightAssociates }}</div>
    </div>
  `
})
export class TeamSnapshotComponent {
  @Input({ required: true }) data!: TeamSnapshot;
}
```

No i18n file changes needed — `dashboard.leftLeg`/`dashboard.rightLeg` already exist in both `en.json` and `hi.json` (added by the base leg-volume-gauge unit).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/team-snapshot.component.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Fix the other `TeamSnapshot` fixture broken by the interface change**

`frontend/src/app/dashboard/dashboard.component.spec.ts:22` has its own `TeamSnapshot` literal that predates the two new required fields and will now fail TS compilation. Currently:

```typescript
    teamSnapshot: { totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2 },
```

change to:

```typescript
    teamSnapshot: { totalDownline: 12, activeToday: 3, newJoinsThisCycle: 2, leftAssociates: 7, rightAssociates: 5 },
```

- [ ] **Step 7: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/app/dashboard/models/dashboard-response.model.ts frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.ts frontend/src/app/dashboard/widgets/team-snapshot/team-snapshot.component.spec.ts frontend/src/app/dashboard/dashboard.component.spec.ts
git commit -m "feat(dashboard): render left/right associate split on team snapshot"
```
