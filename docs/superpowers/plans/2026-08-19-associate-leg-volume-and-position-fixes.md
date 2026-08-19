# Admin Leg-Volume Parity Fix + Position-Required Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two outstanding, previously-parked findings from the associate-dashboard-parity spec's build:

1. `TreeExplorerService` (admin tree explorer + the associate's own `/me/tree` view) and `AdminAssociateService` (admin associate detail screen) both read leg volume from the currently OPEN cycle — the exact bug `docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md` already found and fixed in `DashboardService`, but never applied here. `leg_volume` rows are only ever written at cycle CLOSE, so this lookup always finds nothing: every leg-volume figure on both admin screens is silently always zero in production.
2. An associate can be created with a `parentId` set but no `position` — the admin create-associate form has no required validator on its L/R toggle, and `AssociateProvisioningService` silently skips the placement-conflict check when `position` is null. That associate is real (counted in `totalDownline`, credited to the left leg by `CycleService`'s matching-income rollup — its `else` branch treats "not R" as left), but invisible to the per-leg associate counts the dashboard's team-snapshot widget shows (`AssociateRepository.countDownlineByPosition` filters on `position = 'L'`/`'R'`, matching neither). `totalDownline` can then exceed `leftAssociates + rightAssociates` with no explanation on screen.

**Architecture:** Fix 1 mirrors the already-shipped `DashboardService` fix exactly: swap `CycleStatus.OPEN` for `CycleStatus.CLOSED` in the one `cycleRepository.findFirstByStatusOrderByPeriodStartDesc` call each service makes before looking up `LegVolume`, no other logic changes. Fix 2 closes the data-integrity gap at its root — validation in `AssociateProvisioningService` (service-level, returns a clear 409) plus a DB `CHECK` constraint (defense in depth against any other future write path) — and adds the missing required-field UX on the admin create-associate form so an admin sees the problem before submitting, not after.

**Tech Stack:** Spring Boot 3.3.x (Java 21), Spring Data JPA, JUnit 5 + Mockito + AssertJ, `@DataJpaTest`/`@SpringBootTest` against H2 (MODE=PostgreSQL), Flyway migrations, Angular 18 standalone components, Reactive Forms, Jasmine/Karma, `@ngx-translate/core`.

**Spec:** No formal spec document — both fixes were surfaced as parked findings during the associate-dashboard-parity build's final reviews (`docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md`'s own final review, and `docs/superpowers/plans/2026-08-18-dashboard-team-snapshot-leg-split.md`'s final review) and documented as follow-ups, not fixed in-place at the time. This plan is that follow-up.

## Global Constraints

- Fix 1 changes ONLY which cycle's `LegVolume` row gets read — no new query, no schema change, no change to either service's response shape. `0` (never `null`/exception) for an associate with no closed cycles yet, same as every other leg-volume read in this codebase.
- Fix 2's DB `CHECK` constraint (`parent_id IS NULL OR position IS NOT NULL`) is safe to add with no backfill: verified no seed data and no currently-passing `@DataJpaTest`/`@SpringBootTest` fixture persists an associate with `parent_id` set and `position` null, EXCEPT three tests in `AssociateRepositoryTest.java` this plan's Task 2 fixes as part of adding the constraint (fixing them is not optional — skipping it breaks the suite).
- Fix 2's new `PositionRequiredException` follows this codebase's existing convention for `AssociateProvisioningService` business-rule violations: mapped to `409 CONFLICT` via `AssociateProvisioningExceptionHandler`, same status as the sibling `PlacementUnavailableException`/`EmailAlreadyRegisteredException`.
- Every new associate-facing string needs both an English (`frontend/src/assets/i18n/en.json`) and Hindi (`frontend/src/assets/i18n/hi.json`) translation key.

---

### Task 1: Backend — fix admin leg-volume reads to source from the last CLOSED cycle

**Files:**
- Modify: `backend/src/main/java/com/plotchain/tree/TreeExplorerService.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AdminAssociateService.java`
- Modify: `backend/src/test/java/com/plotchain/tree/TreeExplorerServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/tree/AssociateTreeControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java`

**Interfaces:** No signature changes anywhere in this task — every change is internal to a method body (which `CycleStatus` gets queried) or a test stub's argument. Nothing downstream of these two services or six test files needs to change.

- [ ] **Step 1: `TreeExplorerService` — read the last closed cycle**

In `backend/src/main/java/com/plotchain/tree/TreeExplorerService.java`, currently:

```java
    public TreeNodeResponse subtree(UUID associateId, int depth) {
        Associate root = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        Map<UUID, RankTier> ranksById = rankTierRepository.findAllByOrderByRankOrder().stream()
            .collect(Collectors.toMap(RankTier::getId, r -> r));
        Optional<Cycle> openCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN);
        return buildNode(root, depth, ranksById, openCycle);
    }
```

change to:

```java
    public TreeNodeResponse subtree(UUID associateId, int depth) {
        Associate root = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        Map<UUID, RankTier> ranksById = rankTierRepository.findAllByOrderByRankOrder().stream()
            .collect(Collectors.toMap(RankTier::getId, r -> r));
        // leg_volume rows are written only at cycle CLOSE (CycleService#rollUpSubtree), keyed to
        // the cycle being closed -- the currently OPEN cycle never has a row of its own, so this
        // lookup was a structural no-op that always fell through to zero (same bug already fixed
        // in DashboardService, see docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md).
        // Reading the last CLOSED cycle instead is "current standing as of the last close."
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        return buildNode(root, depth, ranksById, latestClosedCycle);
    }
```

Then, further down, currently:

```java
    private TreeNodeResponse buildNode(Associate a, int remainingDepth, Map<UUID, RankTier> ranksById,
                                        Optional<Cycle> openCycle) {
        BigDecimal[] legs = legVolumesFor(a.getId(), openCycle);
        List<TreeNodeResponse> children = remainingDepth <= 0
            ? List.of()
            : associateRepository.findByParentId(a.getId()).stream()
                .map(child -> buildNode(child, remainingDepth - 1, ranksById, openCycle))
                .toList();
```

change the parameter name and its two internal uses (leave everything else in the method body unchanged):

```java
    private TreeNodeResponse buildNode(Associate a, int remainingDepth, Map<UUID, RankTier> ranksById,
                                        Optional<Cycle> latestClosedCycle) {
        BigDecimal[] legs = legVolumesFor(a.getId(), latestClosedCycle);
        List<TreeNodeResponse> children = remainingDepth <= 0
            ? List.of()
            : associateRepository.findByParentId(a.getId()).stream()
                .map(child -> buildNode(child, remainingDepth - 1, ranksById, latestClosedCycle))
                .toList();
```

Finally, currently:

```java
    private BigDecimal[] legVolumesFor(UUID associateId, Optional<Cycle> openCycle) {
        if (openCycle.isEmpty()) {
            return new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO};
        }
        return legVolumeRepository.findByAssociateIdAndCycleId(associateId, openCycle.get().getId())
            .map(lv -> new BigDecimal[]{lv.getLeftLegVolume(), lv.getRightLegVolume()})
            .orElse(new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
    }
```

change to:

```java
    private BigDecimal[] legVolumesFor(UUID associateId, Optional<Cycle> latestClosedCycle) {
        if (latestClosedCycle.isEmpty()) {
            return new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO};
        }
        return legVolumeRepository.findByAssociateIdAndCycleId(associateId, latestClosedCycle.get().getId())
            .map(lv -> new BigDecimal[]{lv.getLeftLegVolume(), lv.getRightLegVolume()})
            .orElse(new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
    }
```

- [ ] **Step 2: `AdminAssociateService` — read the last closed cycle**

In `backend/src/main/java/com/plotchain/associate/AdminAssociateService.java`, in `toDetail`, currently:

```java
        Optional<Cycle> openCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN);
        BigDecimal leftLegVolume = BigDecimal.ZERO;
        BigDecimal rightLegVolume = BigDecimal.ZERO;
        if (openCycle.isPresent()) {
            Optional<LegVolume> legVolume =
                legVolumeRepository.findByAssociateIdAndCycleId(a.getId(), openCycle.get().getId());
            leftLegVolume = legVolume.map(LegVolume::getLeftLegVolume).orElse(BigDecimal.ZERO);
            rightLegVolume = legVolume.map(LegVolume::getRightLegVolume).orElse(BigDecimal.ZERO);
        }
```

change to:

```java
        // Same fix as DashboardService/TreeExplorerService: leg_volume rows are written only at
        // cycle CLOSE, so reading the OPEN cycle here was a structural no-op that always fell
        // through to zero. See docs/superpowers/plans/2026-08-18-dashboard-leg-volume-fixes.md.
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        BigDecimal leftLegVolume = BigDecimal.ZERO;
        BigDecimal rightLegVolume = BigDecimal.ZERO;
        if (latestClosedCycle.isPresent()) {
            Optional<LegVolume> legVolume =
                legVolumeRepository.findByAssociateIdAndCycleId(a.getId(), latestClosedCycle.get().getId());
            leftLegVolume = legVolume.map(LegVolume::getLeftLegVolume).orElse(BigDecimal.ZERO);
            rightLegVolume = legVolume.map(LegVolume::getRightLegVolume).orElse(BigDecimal.ZERO);
        }
```

- [ ] **Step 3: Update test stubs — mechanical rename, `CycleStatus.OPEN` to `CycleStatus.CLOSED`**

In each file below, every occurrence of `cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)` changes to `cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)`. Do not change anything else on these lines (the `.thenReturn(...)` value, whatever it is, stays exactly as-is) and do not touch any other line in these files. Confirm none of these files has any pre-existing `CycleStatus.CLOSED` reference before starting (there is none currently in any of the five) — if you find one, stop and report rather than guessing which is which.

`backend/src/test/java/com/plotchain/tree/TreeExplorerServiceTest.java` — 6 occurrences, at the lines containing:
```java
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());
```
(appears 3 times, in `subtreeBuildsNestedChildrenUpToDepth`, `subtreeDoesNotDescendPastTheRequestedDepth`, `subtreeFlagsStagnantWhenJoinedOverNinetyDaysAgoWithNoDirectDownline`) and:
```java
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(openCycle));
```
(appears 3 times, in `subtreeDoesNotFlagSkewedWhenBothLegsAreZero`, `subtreeFlagsSkewedLegsWhenOneLegIsAtLeastTenTimesTheOther`, `subtreeDoesNotFlagSkewedWhenLegsAreWithinTheRatioThreshold`) — all 6 become `CycleStatus.CLOSED` in place, `openCycle` (the local variable name in the `.thenReturn(Optional.of(openCycle))` calls) stays as-is, do not rename it.

`backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java` — 5 occurrences, all of the form `cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)` (one in `getReturnsFullDetailWithSponsorParentAndLegVolumes` returning `Optional.of(openCycle)`, four in `suspendSetsStatusAndRecordsAudit`/`suspendEvictsTheAssociateFromTheStatusCache`/`reactivateSetsStatusBackToActive`/`reactivateEvictsTheAssociateFromTheStatusCache` returning `Optional.empty()`).

`backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java` — 2 occurrences (in `subtreeReturnsTheRootNodeForAnyAdminFamilyToken` and `subtreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum`), both `.thenReturn(Optional.empty())`.

`backend/src/test/java/com/plotchain/tree/AssociateTreeControllerTest.java` — 2 occurrences (in `myTreeReturnsTheCallersOwnSubtreeScopedByTheJwtPrincipal` and `myTreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum`), both `.thenReturn(Optional.empty())`.

`backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java` — 2 occurrences (in `suspendSucceedsForAnAdminToken` and `tokenForANewlySuspendedAssociateIsRejectedOnTheVeryNextRequest`), both `.thenReturn(Optional.empty())`.

- [ ] **Step 4: Run the affected tests to verify they pass**

Run: `cd backend && mvn test -Dtest=TreeExplorerServiceTest,AdminAssociateServiceTest,TreeExplorerControllerTest,AssociateTreeControllerTest,AdminAssociateControllerTest -pl . -q`
Expected: PASS, all tests in all five classes green.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && mvn test -q`
Expected: PASS except the pre-existing, unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` dev-secret-guard failures (4 total, environment-dependent JDK/Mockito mismatch — see `issues.md`). No other class should show a new failure.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/tree/TreeExplorerService.java \
        backend/src/main/java/com/plotchain/associate/AdminAssociateService.java \
        backend/src/test/java/com/plotchain/tree/TreeExplorerServiceTest.java \
        backend/src/test/java/com/plotchain/associate/AdminAssociateServiceTest.java \
        backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java \
        backend/src/test/java/com/plotchain/tree/AssociateTreeControllerTest.java \
        backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java
git commit -m "fix(tree,associate): read leg volume from the last closed cycle, not the open one"
```

---

### Task 2: Backend — require `position` whenever `parentId` is set

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/PositionRequiredException.java`
- Create: `backend/src/main/resources/db/migration/V30__associate_position_required_with_parent.sql`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningService.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateProvisioningServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`

**Interfaces:**
- Produces: `PositionRequiredException(UUID parentId)`, an unchecked `RuntimeException`, mapped to HTTP 409 with body `{"error": "..."}`. Task 3 (frontend) matches on `err.error?.error` starting with `"Position is required"`, exactly the pattern `messageForConflict` already uses for `PlacementUnavailableException`'s `"Placement already occupied"` prefix.

- [ ] **Step 1: Write the failing service test**

In `backend/src/test/java/com/plotchain/associate/AssociateProvisioningServiceTest.java`, add this test directly after `rejectsAnUnknownParent`:

```java
    @Test
    void rejectsMissingPositionWhenAParentIsSpecified() {
        UUID parentId = UUID.randomUUID();
        when(associateRepository.existsByEmail("new@plotchain.test")).thenReturn(false);
        when(associateRepository.findById(parentId)).thenReturn(Optional.of(new Associate()));

        assertThatThrownBy(() -> service.create(
            new CreateAssociateRequest("Jane Doe", "new@plotchain.test", null, parentId, null)))
            .isInstanceOf(PositionRequiredException.class);
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=AssociateProvisioningServiceTest -pl . -q`
Expected: compile error — `PositionRequiredException` doesn't exist yet.

- [ ] **Step 3: Create the exception**

Create `backend/src/main/java/com/plotchain/associate/PositionRequiredException.java`:

```java
package com.plotchain.associate;

import java.util.UUID;

public class PositionRequiredException extends RuntimeException {
    public PositionRequiredException(UUID parentId) {
        super("Position is required when a parent is specified: parent " + parentId);
    }
}
```

- [ ] **Step 4: Wire it into `AssociateProvisioningService`**

In `backend/src/main/java/com/plotchain/associate/AssociateProvisioningService.java`, currently:

```java
        if (request.parentId() != null) {
            associateRepository.findById(request.parentId())
                .orElseThrow(() -> new AssociateNotFoundException(request.parentId()));
            if (request.position() != null
                && associateRepository.existsByParentIdAndPosition(request.parentId(), request.position())) {
                throw new PlacementUnavailableException(request.parentId(), request.position());
            }
        }
```

change to:

```java
        if (request.parentId() != null) {
            associateRepository.findById(request.parentId())
                .orElseThrow(() -> new AssociateNotFoundException(request.parentId()));
            // A parent with no position would be invisible to the per-leg associate counts
            // (AssociateRepository.countDownlineByPosition filters on position = 'L'/'R') while
            // still being counted in totalDownline and credited to a leg by CycleService's
            // matching-income rollup ("R".equals(position) ? right : left treats null as left) --
            // silently correct for volume, silently wrong for the leg headcount shown on screen.
            if (request.position() == null) {
                throw new PositionRequiredException(request.parentId());
            }
            if (associateRepository.existsByParentIdAndPosition(request.parentId(), request.position())) {
                throw new PlacementUnavailableException(request.parentId(), request.position());
            }
        }
```

- [ ] **Step 5: Map it to a 409 in the exception handler**

In `backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java`, currently:

```java
    @ExceptionHandler(PlacementUnavailableException.class)
    public ResponseEntity<Map<String, String>> handlePlacementTaken(PlacementUnavailableException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

add directly after it:

```java
    @ExceptionHandler(PositionRequiredException.class)
    public ResponseEntity<Map<String, String>> handlePositionRequired(PositionRequiredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

- [ ] **Step 6: Run the service test to verify it passes**

Run: `cd backend && mvn test -Dtest=AssociateProvisioningServiceTest -pl . -q`
Expected: PASS, all tests in the class green (including the new one; the existing `createsAnAssociateWithATemporaryPasswordThatMustBeChanged`/`rejectsADuplicateEmail`/`failsClearlyWhenNoRankTiersAreConfigured` tests all pass `parentId: null`, so they're unaffected).

- [ ] **Step 7: Add the DB-level `CHECK` constraint**

Create `backend/src/main/resources/db/migration/V30__associate_position_required_with_parent.sql`:

```sql
-- Defense in depth alongside AssociateProvisioningService's own validation: an associate with a
-- parent but no position is invisible to AssociateRepository.countDownlineByPosition's per-leg
-- counts (dashboard team snapshot) while still counted in countDownline and credited to a leg by
-- CycleService's matching-income rollup. Safe to add with no backfill: no seed data or currently
-- passing test persists this combination (verified 2026-08-19 against every @DataJpaTest/
-- @SpringBootTest fixture in the suite).
ALTER TABLE associate ADD CONSTRAINT chk_associate_position_required_with_parent
    CHECK (parent_id IS NULL OR position IS NOT NULL);
```

- [ ] **Step 8: Fix the three existing tests this constraint would otherwise break**

`backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java` has three tests that persist a child associate with `parentId` set but never call `.setPosition(...)` — each will now violate the new `CHECK` constraint on `entityManager.flush()`. Add a `.setPosition("L")` call directly after each `.setParentId(...)` call listed below (the specific position value doesn't matter to any of these three tests — none of them assert on `position` or rely on which leg — `"L"` is picked only for consistency with this file's other fixtures).

In `countByParentIdCountsOnlyDirectChildren`, currently:

```java
        child.setParentId(parent.getId());
        Associate grandchild = persistAssociate("VP00003", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
        entityManager.flush();
```

change to:

```java
        child.setParentId(parent.getId());
        child.setPosition("L");
        Associate grandchild = persistAssociate("VP00003", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
        grandchild.setPosition("L");
        entityManager.flush();
```

In `findAncestorChainReturnsRootToTargetInclusiveInOrder`, currently:

```java
        middle.setParentId(root.getId());
        Associate leaf = persistAssociate("VP00003", "Leaf", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        leaf.setParentId(middle.getId());
        entityManager.flush();
```

change to:

```java
        middle.setParentId(root.getId());
        middle.setPosition("L");
        Associate leaf = persistAssociate("VP00003", "Leaf", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        leaf.setParentId(middle.getId());
        leaf.setPosition("L");
        entityManager.flush();
```

In `findSelfAndDownlineReturnsTheCallerPlusEveryDescendantExcludingSiblingsAncestorsAndUnrelated`, currently:

```java
        caller.setParentId(root.getId());
        Associate sibling = persistAssociate("VP00003", "Sibling", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        sibling.setParentId(root.getId());
        Associate child = persistAssociate("VP00004", "Child", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        child.setParentId(caller.getId());
        Associate grandchild = persistAssociate("VP00005", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
```

change to:

```java
        caller.setParentId(root.getId());
        caller.setPosition("L");
        Associate sibling = persistAssociate("VP00003", "Sibling", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        sibling.setParentId(root.getId());
        sibling.setPosition("R");
        Associate child = persistAssociate("VP00004", "Child", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        child.setParentId(caller.getId());
        child.setPosition("L");
        Associate grandchild = persistAssociate("VP00005", "Grandchild", AssociateRole.ASSOCIATE, rank.getId(),
            KycStatus.PENDING, AssociateStatus.ACTIVE, Instant.now());
        grandchild.setParentId(child.getId());
        grandchild.setPosition("L");
```

(`sibling` gets `"R"` instead of `"L"` only because `caller` and `sibling` share the same parent — two children of the same parent can't both legitimately occupy `"L"` in real data, though the `CHECK` constraint itself doesn't enforce that uniqueness. Keeping them distinct here matches how a real tree would look, even though this particular test doesn't assert on it.)

- [ ] **Step 9: Run the full backend test suite**

Run: `cd backend && mvn test -q`
Expected: PASS except the pre-existing, unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` dev-secret-guard failures (4 total). No other class should show a new failure — in particular, confirm `AssociateRepositoryTest` shows zero new `CHECK` constraint violation errors (a Flyway/Hibernate constraint violation manifests as a test *error*, not a plain assertion *failure* — check the surefire report for `AssociateRepositoryTest` specifically if the aggregate count looks off).

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/PositionRequiredException.java \
        backend/src/main/resources/db/migration/V30__associate_position_required_with_parent.sql \
        backend/src/main/java/com/plotchain/associate/AssociateProvisioningService.java \
        backend/src/main/java/com/plotchain/associate/AssociateProvisioningExceptionHandler.java \
        backend/src/test/java/com/plotchain/associate/AssociateProvisioningServiceTest.java \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat(associate): require position when a parent is specified"
```

---

### Task 3: Frontend — require the L/R toggle on the create-associate form when a parent is selected, plus a pre-existing wallet-card wrap fix

**Files:**
- Modify: `frontend/src/app/admin/create-associate.component.ts`
- Modify: `frontend/src/app/admin/create-associate.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`
- Modify: `frontend/src/styles/_app-shell.scss`

**Interfaces:**
- Consumes: Task 2's `PositionRequiredException` message shape — a 409 with `{"error": "Position is required when a parent is specified: parent <uuid>"}`, matched by prefix `"Position is required"` in `messageForConflict`, same pattern the existing `"Placement already occupied"`/`"Email already registered"` prefixes already use.
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Fix an existing test the new cross-field validator will otherwise break**

`submits the selected parent associate UUID from the dropdown` sets `parentId` but never `position` — once Step 4 adds the cross-field validator, this makes `form.invalid` true and `onSubmit()` returns before ever sending the HTTP request, so this existing test's `httpMock.expectOne('/api/associates')` would start failing (no request was ever made). Fix it now, before adding the validator, so the test suite stays green at every intermediate step. Currently:

```typescript
  it('submits the selected parent associate UUID from the dropdown', () => {
    fixture.componentInstance.associates = [{ id: '22222222-2222-2222-2222-222222222222', userId: 'VP00001', name: 'Root Left', role: 'ASSOCIATE' }];
    fixture.componentInstance.form.patchValue({
      name: 'Jane Doe',
      email: 'jane@plotchain.test',
      parentId: '22222222-2222-2222-2222-222222222222'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates');
    expect(req.request.body.parentId).toBe('22222222-2222-2222-2222-222222222222');
    req.flush({ associateId: 'assoc-1', userId: 'VP00002', temporaryPassword: 'Temp1234!' });
  });
```

change to:

```typescript
  it('submits the selected parent associate UUID from the dropdown', () => {
    fixture.componentInstance.associates = [{ id: '22222222-2222-2222-2222-222222222222', userId: 'VP00001', name: 'Root Left', role: 'ASSOCIATE' }];
    fixture.componentInstance.form.patchValue({
      name: 'Jane Doe',
      email: 'jane@plotchain.test',
      parentId: '22222222-2222-2222-2222-222222222222',
      position: 'L'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates');
    expect(req.request.body.parentId).toBe('22222222-2222-2222-2222-222222222222');
    req.flush({ associateId: 'assoc-1', userId: 'VP00002', temporaryPassword: 'Temp1234!' });
  });
```

- [ ] **Step 2: Write the failing component test for the new validator**

In `frontend/src/app/admin/create-associate.component.spec.ts`, add this test directly after `submits the selected parent associate UUID from the dropdown`:

```typescript
  it('requires a placement position when a parent is selected, and blocks submit until one is chosen', () => {
    fixture.componentInstance.associates = [{ id: '22222222-2222-2222-2222-222222222222', userId: 'VP00001', name: 'Root Left', role: 'ASSOCIATE' }];
    fixture.componentInstance.form.patchValue({
      name: 'Jane Doe',
      email: 'jane@plotchain.test',
      parentId: '22222222-2222-2222-2222-222222222222'
    });

    expect(fixture.componentInstance.form.invalid).toBe(true);
    fixture.componentInstance.onSubmit();
    httpMock.expectNone('/api/associates');

    fixture.componentInstance.onPlacementSelect('L');

    expect(fixture.componentInstance.form.invalid).toBe(false);
    fixture.componentInstance.onSubmit();
    httpMock.expectOne('/api/associates').flush({ associateId: 'assoc-1', userId: 'VP00002', temporaryPassword: 'Temp1234!' });
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/create-associate.component.spec.ts'`
Expected: FAIL — `form.invalid` is `false` immediately after setting `parentId` alone (no cross-field validator exists yet), so the test's first assertion fails.

- [ ] **Step 4: Add the cross-field validator**

In `frontend/src/app/admin/create-associate.component.ts`, currently:

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
```

change to:

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, ReactiveFormsModule, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
```

Then, directly before the `@Component` decorator, add (mirroring `change-password.component.ts`'s `passwordsMatchValidator` — a plain function, not a class method, following this codebase's existing convention for cross-field validators):

```typescript
// A parent with no position is invisible to the per-leg associate counts the dashboard shows
// (AssociateRepository.countDownlineByPosition filters on position = 'L'/'R') while still being
// counted in totalDownline -- see AssociateProvisioningService's matching server-side guard.
function positionRequiredWhenParentSelectedValidator(group: AbstractControl): ValidationErrors | null {
  const parentId = group.get('parentId')?.value;
  const position = group.get('position')?.value;
  return parentId && !position ? { positionRequired: true } : null;
}
```

Then, currently:

```typescript
  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    sponsorId: [''],
    parentId: [''],
    position: ['']
  });

  created: CreateAssociateResponse | null = null;
  submitError: string | null = null;
  associates: AssociateSummary[] = [];
  private serverFieldErrors: Record<string, string> = {};
```

change to:

```typescript
  form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    sponsorId: [''],
    parentId: [''],
    position: ['']
  }, { validators: positionRequiredWhenParentSelectedValidator });

  created: CreateAssociateResponse | null = null;
  submitError: string | null = null;
  associates: AssociateSummary[] = [];
  attemptedSubmit = false;
  private serverFieldErrors: Record<string, string> = {};
```

Then, currently:

```typescript
  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, sponsorId, parentId, position } = this.form.getRawValue();
    this.adminService
      .createAssociate({
        name,
        email,
        sponsorId: sponsorId || undefined,
        parentId: parentId || undefined,
        position: position || undefined
      })
      .subscribe({
        next: response => {
          this.created = response;
          this.serverFieldErrors = {};
          this.submitError = null;
          this.form.reset();
        },
```

change to:

```typescript
  onSubmit(): void {
    this.serverFieldErrors = {};
    this.submitError = null;
    this.attemptedSubmit = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, sponsorId, parentId, position } = this.form.getRawValue();
    this.adminService
      .createAssociate({
        name,
        email,
        sponsorId: sponsorId || undefined,
        parentId: parentId || undefined,
        position: position || undefined
      })
      .subscribe({
        next: response => {
          this.created = response;
          this.serverFieldErrors = {};
          this.submitError = null;
          this.attemptedSubmit = false;
          this.form.reset();
        },
```

Then add a new getter directly after the existing `fieldError` method:

```typescript
  get positionRequiredMessage(): string | undefined {
    if (this.attemptedSubmit && this.form.hasError('positionRequired')) {
      return this.translate.instant('admin.validation.positionRequired');
    }
    return undefined;
  }
```

Then, in the template, currently:

```typescript
            <app-toggle-group
              [options]="placementOptions"
              [value]="form.value.position || null"
              (valueChange)="onPlacementSelect($event)"
            ></app-toggle-group>
          </div>
        </div>
```

change to:

```typescript
            <app-toggle-group
              [options]="placementOptions"
              [value]="form.value.position || null"
              (valueChange)="onPlacementSelect($event)"
            ></app-toggle-group>
          </div>
          <app-field-error [message]="positionRequiredMessage"></app-field-error>
        </div>
```

Finally, extend `messageForConflict` — currently:

```typescript
  private messageForConflict(backendMessage: string | undefined): string {
    if (backendMessage?.startsWith('Email already registered')) {
      return this.translate.instant('admin.validation.emailTaken');
    }
    if (backendMessage?.startsWith('Placement already occupied')) {
      return this.translate.instant('admin.validation.placementUnavailable');
    }
```

change to:

```typescript
  private messageForConflict(backendMessage: string | undefined): string {
    if (backendMessage?.startsWith('Email already registered')) {
      return this.translate.instant('admin.validation.emailTaken');
    }
    if (backendMessage?.startsWith('Placement already occupied')) {
      return this.translate.instant('admin.validation.placementUnavailable');
    }
    if (backendMessage?.startsWith('Position is required')) {
      return this.translate.instant('admin.validation.positionRequired');
    }
```

- [ ] **Step 5: Add the i18n key**

In `frontend/src/assets/i18n/en.json`, inside `admin.validation`, currently:

```json
      "placementUnavailable": "That placement is already occupied. Choose a different leg.",
      "noRankTiersConfigured": "No rank tiers are configured; an associate cannot be created without a rank.",
```

change to:

```json
      "placementUnavailable": "That placement is already occupied. Choose a different leg.",
      "positionRequired": "Choose a left or right leg for the selected parent.",
      "noRankTiersConfigured": "No rank tiers are configured; an associate cannot be created without a rank.",
```

In `frontend/src/assets/i18n/hi.json`, inside `admin.validation`, currently:

```json
      "placementUnavailable": "यह प्लेसमेंट पहले से भरी हुई है। कोई अन्य लेग चुनें।",
```

change to:

```json
      "placementUnavailable": "यह प्लेसमेंट पहले से भरी हुई है। कोई अन्य लेग चुनें।",
      "positionRequired": "चयनित पैरेंट के लिए बायाँ या दायाँ लेग चुनें।",
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/create-associate.component.spec.ts'`
Expected: PASS, all tests in the file green (including the new one and every pre-existing test — `renders the temporary password and clears the form on success` sends `parentId: undefined`, so the new validator never fires for it; `does not submit when the form is invalid` sends no `parentId` at all, same).

- [ ] **Step 7: Confirm i18n key parity**

Run: `cd frontend && node -e "
const en = require('./src/assets/i18n/en.json');
const hi = require('./src/assets/i18n/hi.json');
function keys(o,p=''){let r=[];for(const k in o){const kp=p?p+'.'+k:k; if(typeof o[k]==='object') r=r.concat(keys(o[k],kp)); else r.push(kp);} return r;}
const ek=keys(en).sort(), hk=keys(hi).sort();
console.log('en', ek.length, 'hi', hk.length);
console.log('missing in hi:', ek.filter(k=>!hk.includes(k)));
console.log('missing in en:', hk.filter(k=>!ek.includes(k)));
"`
Expected: `en` and `hi` counts equal, both "missing" lists empty.

- [ ] **Step 8: Fix the pre-existing `wallet-card` text-wrap bug found during the styling pass's final review**

Confirmed pre-existing on `master` (not introduced by the associate-dashboard-parity styling work, `git blame` traces it to the earlier app-wide brand rollout) but never fixed: `.dashboard .wallet-card`'s `withdraw-info` line uses `white-space: nowrap`, which overflows the card at any viewport narrower than the full sentence's width and gets painted over by the neighboring card. In `frontend/src/styles/_app-shell.scss`, currently:

```scss
.dashboard .wallet-card .withdraw-info {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.875rem;
  white-space: nowrap;
}
```

change to:

```scss
.dashboard .wallet-card .withdraw-info {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.875rem;
}
```

- [ ] **Step 9: Run the full frontend test suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: all green, same pass count as before this task plus the one new test.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/app/admin/create-associate.component.ts \
        frontend/src/app/admin/create-associate.component.spec.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json \
        frontend/src/styles/_app-shell.scss
git commit -m "feat(admin): require placement position when a parent is selected; fix wallet-card text wrap"
```
