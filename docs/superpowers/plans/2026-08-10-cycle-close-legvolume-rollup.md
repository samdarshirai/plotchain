# Cycle Close — Leg-Volume Rollup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement cycle-management unit 4 — closing an `OPEN` cycle computes leg-volume rollup tree-wide via a single in-memory post-order DFS, flips `OPEN → CALCULATING → CLOSED` inside one transaction, and opens the next cycle.

**Architecture:** Replace the placeholder body of `CycleService.close(UUID id)` (unit 3's row-lock/status-check skeleton, unchanged) with: flip to `CALCULATING`, load every `Associate` and every `RECORDED` `Sale` for the cycle, run a post-order DFS from the root Admin (`parentId == null`) computing `subtreeVolume`/`leftLegVolume`/`rightLegVolume` per Decision #4, write one `LegVolume` row per associate, flip to `CLOSED`, call the existing `getOrOpenCurrent()`, return an expanded `CycleCloseResponse`. All of it stays inside `close()`'s existing `@Transactional` boundary — no new class, no new transaction.

**Tech Stack:** Spring Boot, Spring Data JPA, JUnit 5 + Mockito (`@ExtendWith(MockitoExtension.class)`) for pure unit tests, `@SpringBootTest` + H2 (`MODE=PostgreSQL`) for the two DB-backed integration tests this unit touches.

## Global Constraints

- Source spec: `docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md`. Primary citations: Decision #4 (leg-volume rollup algorithm), Decision #2 (transaction/lock, already implemented), flow "Settlement batch" steps 1 (partial), 2, 8.
- **Scope boundary — do not implement flow steps 3–7** (Matching Income, Rank progression, Sponsor Matching, Royalty, Reward/Rank Income). No `LedgerEntry` row is written anywhere in this unit. Those steps are separate units (5–9), each inserting logic into this same method later.
- **Decision #10 (`CompensationPlanVersion` resolution) is deliberately NOT touched in this unit.** The spec's flow step 1 text bundles "resolve the CompensationPlanVersion" into the same sentence as loading associates/sales, but nothing this unit's leg-volume rollup math does consumes a percentage — only Matching (step 3, unit 5) needs it. Resolving it now would be unused code with no caller in this unit; unit 5's plan adds it at the point it's actually consumed.
- **`CycleCloseResponse` stays named `CycleCloseResponse` (not renamed to the spec's eventual `SettlementResult`) and gains exactly two new fields this unit can honestly populate: `legVolumeRowsWritten` (int) and `newCycleId` (UUID).** Renaming now, before any per-income-type breakdown exists, would just be a rename with no new information — a later unit (5 or whichever first writes `LedgerEntry` rows) would rename it again to add the fields it actually needs. One deliberate rename at that point beats two speculative ones now. The existing `cycleId`/`status` fields are unchanged in meaning.
- **`LegVolume` gains public setters for `carriedForwardLeft`/`carriedForwardRight` in this unit, even though this unit's own logic only ever constructs rows with those two fields at `BigDecimal.ZERO`.** Unit 5 (Matching, Decision #5) must mutate exactly those two fields on the *same* `LegVolume` rows this unit creates ("the excess on the larger leg is written into that same LegVolume row's carriedForwardLeft/carriedForwardRight"), and the entity is currently fully immutable after construction (only a full constructor + getters). Adding the two setters now is purely additive, changes no existing behavior, and removes a forward-compatibility landmine from unit 5's plan — unlike the `CompensationPlanVersion` case above, this isn't unused *logic*, it's a capability being added to an entity that this very unit already constructs rows of, at zero cost and no ambiguity about how it'll be used later (that's unit 5's call).
- **Root-finding degrades gracefully to zero `LegVolume` rows when zero `Associate` rows exist**, rather than throwing. Production guarantees exactly one root (`parentId == null`, the Admin, per the role-capability spec's resolved migration). But this codebase's own test fixtures (`CycleCloseConcurrencyTest`, confirmed by inspection: `AdminBootstrapRunner` doesn't fire under the `test` profile since bootstrap email/password properties are unset, and no dev seed migration is on the test Flyway classpath) start with **zero** `Associate` rows, and that test's `close()` call must keep succeeding after this unit lands. Implementation treats "every associate whose `parentId == null`" as a list of roots and DFS-walks each — this handles zero roots (nothing to roll up) and the production one-root case identically, without a hard assumption that would break the existing concurrency test.
- Follow this codebase's established pattern of an explicit `repository.save(entity)` call after mutating a managed JPA entity's fields (see `SaleService.recordSale`'s `plot.setStatus(...); plotRepository.save(plot);`), rather than relying on Hibernate dirty-checking alone.
- BigDecimal test assertions use AssertJ's `isEqualByComparingTo(String)` (scale-insensitive), matching `SaleServiceTest`'s established convention — never plain `isEqualTo` for `BigDecimal`.
- `close()`'s self-invocation of `getOrOpenCurrent()` (both methods on the same `CycleService` instance) bypasses the Spring AOP transactional proxy, but this is not a problem here: `getOrOpenCurrent()` carries no `@Transactional` of its own, so the call just runs as plain Java inside the transaction `close()`'s proxy already started — exactly what Decision #1/#8 require ("inside the same transaction").
- No new Java types are introduced by this unit (no `SettlementService`, no `SettlementResult`) — per the task's own "Current codebase state" framing, this unit's code lives inside the existing `CycleService.close()`, extending unit 3's skeleton in place.

---

### Task 1: `SaleRepository.findByCycleIdAndStatus` (cross-package addition)

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleRepository.java`

**Interfaces:**
- Produces: `SaleRepository.findByCycleIdAndStatus(UUID cycleId, SaleStatus status): List<Sale>` — consumed by Task 4's `CycleService.close()`.

This method is owned by the Sales package but added here because Sales' own units never needed it — the spec's Data model section calls this out explicitly ("owned by the Sales package, added here since Sales didn't need it"). It's a plain two-field derived Spring Data query (exact equality on `cycleId` and `status`, no custom `@Query`, no join, no ordering) — the same shape as dozens of other derived finders already unstyled-tested in this codebase (e.g. `AssociateRepository.findByParentId`). No dedicated repository test is added for it; Task 4's fixture-tree test exercises its expected behavior via a mocked `SaleRepository`, and adding a `@DataJpaTest` for a one-line derived query would require seeding a full `Project → Plot → Associate → Cycle → Sale` FK chain for no behavioral payoff.

- [ ] **Step 1: Add the method and update the file's stale comment**

Current file:
```java
package com.plotchain.sales;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Bare marker interface for this unit -- no custom queries yet. Sales unit 3 (record happy
// path) is the first caller that needs SaleRepository.save(Sale); units 6/7 (admin register,
// associate own-view) will add the filtered/paginated finder methods they need at that point.
public interface SaleRepository extends JpaRepository<Sale, UUID> {
}
```

Replace with:
```java
package com.plotchain.sales;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface SaleRepository extends JpaRepository<Sale, UUID> {

    // Cycle-management unit 4 (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #4 / Data model section): owned by the Sales package but added here since Sales'
    // own units never needed it -- the settlement batch's one query to load this cycle's
    // RECORDED sale volume for the in-memory leg-volume rollup. VOIDED sales are excluded by
    // the status filter; the batch never sees them.
    List<Sale> findByCycleIdAndStatus(UUID cycleId, SaleStatus status);
}
```

- [ ] **Step 2: Compile the module**

Run: `cd backend && mvn -q -pl . compile` (or `./mvnw compile` if a wrapper exists — check `backend/pom.xml`'s sibling for `mvnw` first)
Expected: BUILD SUCCESS, no other file references this interface's old "bare marker" shape.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleRepository.java
git commit -m "feat(sales): add SaleRepository.findByCycleIdAndStatus for cycle-close leg-volume rollup"
```

---

### Task 2: `LegVolume` — add `carriedForwardLeft`/`carriedForwardRight` setters

**Files:**
- Modify: `backend/src/main/java/com/plotchain/legvolume/LegVolume.java`

**Interfaces:**
- Produces: `LegVolume.setCarriedForwardLeft(BigDecimal): void`, `LegVolume.setCarriedForwardRight(BigDecimal): void` — not called anywhere in this unit's own logic (Task 4 always constructs `LegVolume` rows with `carriedForwardLeft`/`carriedForwardRight` both `BigDecimal.ZERO` via the existing full constructor); added purely as forward-compatibility for cycle-management unit 5 (Matching), which must mutate these two fields on the same rows this unit writes.

No dedicated test is added for these two one-line setters — this codebase has no precedent of testing bare entity accessor methods in isolation (no `CycleTest`, `AssociateTest`, etc. exist), and these setters have zero callers until unit 5 exercises them through its own Matching test.

- [ ] **Step 1: Add the setters**

Current relevant section of `LegVolume.java`:
```java
    public UUID getId() { return id; }
    public UUID getAssociateId() { return associateId; }
    public UUID getCycleId() { return cycleId; }
    public BigDecimal getLeftLegVolume() { return leftLegVolume; }
    public BigDecimal getRightLegVolume() { return rightLegVolume; }
    public BigDecimal getCarriedForwardLeft() { return carriedForwardLeft; }
    public BigDecimal getCarriedForwardRight() { return carriedForwardRight; }
}
```

Replace with:
```java
    public UUID getId() { return id; }
    public UUID getAssociateId() { return associateId; }
    public UUID getCycleId() { return cycleId; }
    public BigDecimal getLeftLegVolume() { return leftLegVolume; }
    public BigDecimal getRightLegVolume() { return rightLegVolume; }
    public BigDecimal getCarriedForwardLeft() { return carriedForwardLeft; }
    public BigDecimal getCarriedForwardRight() { return carriedForwardRight; }

    // Cycle-management unit 4 adds these two setters as forward-compatibility for unit 5
    // (Matching Income, Decision #5): unit 5 mutates carriedForwardLeft/carriedForwardRight on
    // the SAME LegVolume row a cycle's rollup just wrote, to carry the unmatched excess into
    // next cycle's rollup. Unit 4's own logic never calls these -- it only ever constructs rows
    // with both fields at BigDecimal.ZERO via the constructor above.
    public void setCarriedForwardLeft(BigDecimal carriedForwardLeft) { this.carriedForwardLeft = carriedForwardLeft; }
    public void setCarriedForwardRight(BigDecimal carriedForwardRight) { this.carriedForwardRight = carriedForwardRight; }
}
```

- [ ] **Step 2: Compile the module**

Run: `cd backend && mvn -q compile`
Expected: BUILD SUCCESS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/plotchain/legvolume/LegVolume.java
git commit -m "feat(legvolume): add carriedForward setters (forward-compat for unit 5 Matching)"
```

---

### Task 3: `CycleCloseResponse` — expand response shape

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java`

**Interfaces:**
- Produces: `record CycleCloseResponse(UUID cycleId, CycleStatus status, int legVolumeRowsWritten, UUID newCycleId)` — consumed by Task 4 (`CycleService.close()`'s return statement), Task 5 (`CycleControllerTest`), Task 6 (`CycleCloseConcurrencyTest`).

This task only changes the record's shape; it does not yet compile cleanly on its own (every existing caller that constructs a 2-arg `CycleCloseResponse` breaks) — Tasks 4–6 fix each call site as part of their own work. That's expected and matches how this plan's tasks are sequenced (this task exists on its own because the *reasoning* for the shape is a standalone decision worth its own commit message, not because it's independently buildable mid-sequence).

- [ ] **Step 1: Replace the record**

Current file:
```java
package com.plotchain.cycle;

import java.util.UUID;

// Placeholder success response for POST /api/admin/cycles/{id}/close. Cycle-management unit 4
// (the settlement batch) will replace what this method reports once it exists -- entries
// written per income type, total net amount, the newly-reopened cycle's id -- but this unit's
// scope stops at "lock acquired, status confirmed OPEN, nothing thrown."
public record CycleCloseResponse(UUID cycleId, CycleStatus status) {}
```

Replace with:
```java
package com.plotchain.cycle;

import java.util.UUID;

// Cycle-management unit 4 expands this from unit 3's placeholder. legVolumeRowsWritten and
// newCycleId are the two facts unit 4's leg-volume-rollup-only scope can honestly report --
// units 5-9 (Matching, Rank, Sponsor Matching, Royalty, Reward), which start writing
// LedgerEntry rows, are expected to add per-income-type fields here (or fold this into the
// spec's eventual full SettlementResult shape) once they have something to report, not before.
// Deliberately kept as this same record/name rather than renamed now: a rename today, before
// any income-type breakdown exists, would just be a rename with no new information, and the
// first unit that actually needs new fields would rename it again anyway.
public record CycleCloseResponse(UUID cycleId, CycleStatus status, int legVolumeRowsWritten, UUID newCycleId) {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleCloseResponse.java
git commit -m "feat(cycle): expand CycleCloseResponse with legVolumeRowsWritten and newCycleId"
```

(Compilation is intentionally left broken until Task 4 fixes `CycleService` and `CycleServiceTest` in the same task's steps — don't run a full build between Task 3 and Task 4.)

---

### Task 4: `CycleService.close()` — leg-volume rollup implementation

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleService.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findAll(): List<Associate>` (inherited `JpaRepository` method — no new repository method; Decision #4's "load every Associate ... into memory once" is satisfied by the existing method), `Associate.getId()/getParentId()/getPosition()`, `SaleRepository.findByCycleIdAndStatus(UUID, SaleStatus): List<Sale>` (Task 1), `Sale.getAssociateId()/getAmount()`, `LegVolumeRepository.findByAssociateIdAndCycleId(UUID, UUID): Optional<LegVolume>` (existing), `LegVolumeRepository.saveAll(Iterable<LegVolume>): List<LegVolume>` (inherited), `LegVolume`'s existing full constructor `(UUID id, UUID associateId, UUID cycleId, BigDecimal leftLegVolume, BigDecimal rightLegVolume, BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight)`, `CycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus): Optional<Cycle>` (existing, reused unmodified for `CLOSED`), `CycleCloseResponse` (Task 3's 4-arg shape).
- Produces: `CycleService(CycleRepository, AssociateRepository, LegVolumeRepository, SaleRepository)` — the new 4-arg constructor every caller (`CycleController` via Spring DI — no change needed there, it's autowired; `CycleServiceTest`; `CycleCloseConcurrencyTest` — no change needed, it's `@Autowired`) must account for.

- [ ] **Step 1: Update `CycleServiceTest`'s constructor calls and add the three new `@Mock` fields (mechanical, no behavior change yet)**

In `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`, add three new imports and three new `@Mock` fields, then update every `new CycleService(cycleRepository)` call site (9 occurrences, one per `@Test` method) to the 4-arg form.

Add these imports alongside the existing ones:
```java
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import org.mockito.ArgumentCaptor;
```
and this static import:
```java
import static org.mockito.ArgumentMatchers.eq;
```

Change:
```java
    @Mock CycleRepository cycleRepository;
    CycleService service;
```
to:
```java
    @Mock CycleRepository cycleRepository;
    @Mock AssociateRepository associateRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock SaleRepository saleRepository;
    CycleService service;
```

Then, in every one of the 9 test methods, change:
```java
        service = new CycleService(cycleRepository);
```
to:
```java
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository);
```
(Use a single `replace_all` edit — the string `service = new CycleService(cycleRepository);` is identical and unique-as-a-pattern across all 9 occurrences.)

- [ ] **Step 2: Replace the placeholder `closeSucceeds...` test with a "no associates" case, and run it to confirm it fails to compile/fails red**

Replace:
```java
    @Test
    void closeSucceedsAndReturnsAPlaceholderResponseWhenStatusIsOpen() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));

        CycleCloseResponse response = service.close(cycle.getId());

        assertThat(response.cycleId()).isEqualTo(cycle.getId());
        assertThat(response.status()).isEqualTo(CycleStatus.OPEN);
    }
```
with:
```java
    @Test
    void closeWithNoAssociatesWritesNoLegVolumeRowsAndStillClosesAndReopens() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository);
        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        CycleCloseResponse response = service.close(cycle.getId());

        assertThat(response.cycleId()).isEqualTo(cycle.getId());
        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
        assertThat(response.legVolumeRowsWritten()).isEqualTo(0);
        assertThat(response.newCycleId()).isNotNull();
        assertThat(response.newCycleId()).isNotEqualTo(cycle.getId());
        verify(legVolumeRepository).saveAll(List.of());
    }
```

Run: `cd backend && mvn -q -Dtest=CycleServiceTest test`
Expected: compile failure (`CycleService` constructor still takes 1 arg, `close()` still returns the old 2-field shape) — this is the "red" step; Step 3 makes it compile and pass.

- [ ] **Step 3: Add the fixture-tree rollup test**

Add this test to `CycleServiceTest` (place it near the other `close*` tests):
```java
    @Test
    void closeComputesLegVolumeRollupTreeWideOnAMixedFixtureTreeAndWritesOneRowPerAssociate() {
        service = new CycleService(cycleRepository, associateRepository, legVolumeRepository, saleRepository);

        // Fixture tree (Admin is the root, per the role-model spec):
        //           admin
        //          /      \
        //        b1(L)    b2(R)
        //       /   \      /   \
        //     c1(L) c2(R) c3(L) d(R)
        // c1 sells 100, c2 sells 50, c3 sells 30, d sells nothing. b1 carries forward
        // (20 left / 5 right) from a seeded prior CLOSED cycle's LegVolume row; nobody else
        // has a prior-cycle row.
        Associate admin = associateFixture(null, null);
        Associate b1 = associateFixture(admin.getId(), "L");
        Associate b2 = associateFixture(admin.getId(), "R");
        Associate c1 = associateFixture(b1.getId(), "L");
        Associate c2 = associateFixture(b1.getId(), "R");
        Associate c3 = associateFixture(b2.getId(), "L");
        Associate d = associateFixture(b2.getId(), "R");
        when(associateRepository.findAll()).thenReturn(List.of(admin, b1, b2, c1, c2, c3, d));

        Cycle cycle = newCycle(CycleStatus.OPEN);
        when(cycleRepository.findByIdForUpdate(cycle.getId())).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        when(saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED)).thenReturn(List.of(
            saleFixture(c1.getId(), cycle.getId(), new BigDecimal("100")),
            saleFixture(c2.getId(), cycle.getId(), new BigDecimal("50")),
            saleFixture(c3.getId(), cycle.getId(), new BigDecimal("30"))
        ));

        Cycle priorClosedCycle = newCycle(CycleStatus.CLOSED);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.of(priorClosedCycle));
        // General case: nobody has a prior-cycle LegVolume row.
        when(legVolumeRepository.findByAssociateIdAndCycleId(any(UUID.class), eq(priorClosedCycle.getId())))
            .thenReturn(Optional.empty());
        // Override for b1: carried forward 20 left / 5 right from the prior CLOSED cycle.
        LegVolume b1PriorLegVolume = new LegVolume(UUID.randomUUID(), b1.getId(), priorClosedCycle.getId(),
            BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("20"), new BigDecimal("5"));
        when(legVolumeRepository.findByAssociateIdAndCycleId(b1.getId(), priorClosedCycle.getId()))
            .thenReturn(Optional.of(b1PriorLegVolume));

        CycleCloseResponse response = service.close(cycle.getId());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<LegVolume>> legVolumesCaptor = ArgumentCaptor.forClass(List.class);
        verify(legVolumeRepository).saveAll(legVolumesCaptor.capture());
        List<LegVolume> written = legVolumesCaptor.getValue();

        assertThat(written).hasSize(7);
        assertLegVolume(written, admin.getId(), cycle.getId(), "150", "30");
        assertLegVolume(written, b1.getId(), cycle.getId(), "120", "55");
        assertLegVolume(written, b2.getId(), cycle.getId(), "30", "0");
        assertLegVolume(written, c1.getId(), cycle.getId(), "0", "0");
        assertLegVolume(written, c2.getId(), cycle.getId(), "0", "0");
        assertLegVolume(written, c3.getId(), cycle.getId(), "0", "0");
        assertLegVolume(written, d.getId(), cycle.getId(), "0", "0");

        assertThat(response.legVolumeRowsWritten()).isEqualTo(7);
        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
    }

    private void assertLegVolume(List<LegVolume> written, UUID associateId, UUID cycleId,
                                  String expectedLeft, String expectedRight) {
        LegVolume match = written.stream()
            .filter(lv -> associateId.equals(lv.getAssociateId()))
            .findFirst()
            .orElseThrow(() -> new AssertionError("no LegVolume row written for associate " + associateId));
        assertThat(match.getCycleId()).isEqualTo(cycleId);
        assertThat(match.getLeftLegVolume()).isEqualByComparingTo(expectedLeft);
        assertThat(match.getRightLegVolume()).isEqualByComparingTo(expectedRight);
        // Unit 4 never sets these to anything but zero -- unit 5 (Matching) is what writes into
        // them, on these same rows, later.
        assertThat(match.getCarriedForwardLeft()).isEqualByComparingTo("0");
        assertThat(match.getCarriedForwardRight()).isEqualByComparingTo("0");
    }

    private Associate associateFixture(UUID parentId, String position) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setParentId(parentId);
        associate.setPosition(position);
        return associate;
    }

    private Sale saleFixture(UUID associateId, UUID cycleId, BigDecimal amount) {
        Sale sale = new Sale();
        sale.setId(UUID.randomUUID());
        sale.setAssociateId(associateId);
        sale.setCycleId(cycleId);
        sale.setAmount(amount);
        sale.setStatus(SaleStatus.RECORDED);
        return sale;
    }
```

Also add this import (`BigDecimal` is likely not yet imported in this file):
```java
import java.math.BigDecimal;
```

Hand-computed expected values (Decision #4's formula, verified by hand before writing this test):
- Leaves (`c1`, `c2`, `c3`, `d`): no children → `leftLegVolume = rightLegVolume = 0` unconditionally (the "for each node with at least one child" carve-out means leaves skip the carried-forward lookup entirely).
- `b1` (children `c1` left, `c2` right): `leftSubtree = subtreeVolume(c1) = 100`, `rightSubtree = subtreeVolume(c2) = 50`. `leftLegVolume = 100 + carriedForwardLeft(20) = 120`. `rightLegVolume = 50 + carriedForwardRight(5) = 55`.
- `b2` (children `c3` left, `d` right): `leftSubtree = subtreeVolume(c3) = 30`, `rightSubtree = subtreeVolume(d) = 0`. No prior-cycle row → `leftLegVolume = 30 + 0 = 30`, `rightLegVolume = 0 + 0 = 0`.
- `admin` (children `b1` left, `b2` right): `leftSubtree = subtreeVolume(b1) = 0(own) + 100 + 50 = 150`. `rightSubtree = subtreeVolume(b2) = 0(own) + 30 + 0 = 30`. No prior-cycle row → `leftLegVolume = 150`, `rightLegVolume = 30`.

- [ ] **Step 4: Implement `CycleService.close()` and the rollup helpers**

Replace `CycleService.java` in full:
```java
package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.sales.Sale;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class CycleService {

    private final CycleRepository cycleRepository;
    private final AssociateRepository associateRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final SaleRepository saleRepository;

    public CycleService(
        CycleRepository cycleRepository,
        AssociateRepository associateRepository,
        LegVolumeRepository legVolumeRepository,
        SaleRepository saleRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.associateRepository = associateRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.saleRepository = saleRepository;
    }

    public CyclePageResponse list(CycleStatus status, int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Cycle> result = status == null
            ? cycleRepository.findAllByOrderByPeriodStartDesc(pageable)
            : cycleRepository.findByStatusOrderByPeriodStartDesc(status, pageable);

        return new CyclePageResponse(
            result.getContent().stream().map(this::toSummary).toList(),
            page, size, result.getTotalElements());
    }

    // Cycle-management unit 3 (row lock + OPEN check, unchanged) + unit 4 (everything from the
    // CALCULATING flip onward) -- docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
    // Decision #2, settlement batch flow steps 1, 2, 8. Steps 3-7 (Matching, Rank, Sponsor
    // Matching, Royalty, Reward) are NOT implemented here -- units 5-9 insert their own logic
    // between the rollup below and the CLOSED flip, without changing this method's signature or
    // transaction boundary, the same sequential-insertion pattern unit 3 -> unit 4 already used.
    @Transactional
    public CycleCloseResponse close(UUID id) {
        Cycle cycle = cycleRepository.findByIdForUpdate(id)
            .orElseThrow(() -> new CycleNotFoundException(id));

        if (cycle.getStatus() != CycleStatus.OPEN) {
            throw new CycleAlreadyClosedException(cycle.getId());
        }

        // Flow step 1 (partial): write only, not a separate commit -- Decision #2 -- so this
        // isn't externally observable mid-batch under this design, and rolls back along with
        // everything else if a later step throws.
        cycle.setStatus(CycleStatus.CALCULATING);
        cycleRepository.save(cycle);

        List<Associate> associates = associateRepository.findAll();
        List<Sale> sales = saleRepository.findByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);

        // Flow step 2.
        List<LegVolume> legVolumes = rollUpLegVolumes(cycle.getId(), associates, sales);
        legVolumeRepository.saveAll(legVolumes);

        // Flow step 8. getOrOpenCurrent() is a plain (non-@Transactional) self-invocation here,
        // so it runs inside the transaction this @Transactional method's proxy already started
        // -- exactly what Decision #1/#8 require, with no separate commit.
        cycle.setStatus(CycleStatus.CLOSED);
        cycleRepository.save(cycle);
        Cycle nextCycle = getOrOpenCurrent();

        return new CycleCloseResponse(cycle.getId(), cycle.getStatus(), legVolumes.size(), nextCycle.getId());
    }

    // Decision #4: a single in-memory post-order DFS pass, not N recursive SQL queries. Builds
    // parent->children adjacency from a plain findAll() (this decision's own "load every
    // Associate ... into memory once" language, and this platform's expected scale per the
    // spec's Open Question #1, don't call for a leaner projection query), then walks every root
    // (parentId == null -- exactly one in production, the Admin; zero in an associate-less
    // environment like this codebase's own CycleCloseConcurrencyTest fixture, which then simply
    // rolls up nothing rather than throwing).
    private List<LegVolume> rollUpLegVolumes(UUID cycleId, List<Associate> associates, List<Sale> sales) {
        Map<UUID, BigDecimal> ownSaleVolume = new HashMap<>();
        for (Sale sale : sales) {
            ownSaleVolume.merge(sale.getAssociateId(), sale.getAmount(), BigDecimal::add);
        }

        Map<UUID, Associate> leftChildOf = new HashMap<>();
        Map<UUID, Associate> rightChildOf = new HashMap<>();
        List<UUID> rootIds = new ArrayList<>();
        for (Associate associate : associates) {
            UUID parentId = associate.getParentId();
            if (parentId == null) {
                rootIds.add(associate.getId());
            } else if ("R".equals(associate.getPosition())) {
                rightChildOf.put(parentId, associate);
            } else {
                leftChildOf.put(parentId, associate);
            }
        }

        UUID previousClosedCycleId = cycleRepository
            .findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)
            .map(Cycle::getId)
            .orElse(null);

        List<LegVolume> legVolumes = new ArrayList<>();
        for (UUID rootId : rootIds) {
            rollUpSubtree(rootId, cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);
        }
        return legVolumes;
    }

    // Post-order: recurses into both children before computing this node's own subtreeVolume,
    // matching Decision #4's subtreeVolume(node) = own + subtreeVolume(left) + subtreeVolume(right)
    // (0 for a missing child). Appends exactly one LegVolume row for this node to legVolumes
    // (unconditionally, even all-zero) before returning, and returns this node's subtreeVolume
    // so its parent's own call can consume it as one of its two child terms.
    private BigDecimal rollUpSubtree(
        UUID associateId,
        UUID cycleId,
        UUID previousClosedCycleId,
        Map<UUID, BigDecimal> ownSaleVolume,
        Map<UUID, Associate> leftChildOf,
        Map<UUID, Associate> rightChildOf,
        List<LegVolume> legVolumes
    ) {
        Associate leftChild = leftChildOf.get(associateId);
        Associate rightChild = rightChildOf.get(associateId);

        BigDecimal leftSubtreeVolume = leftChild == null
            ? BigDecimal.ZERO
            : rollUpSubtree(leftChild.getId(), cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);
        BigDecimal rightSubtreeVolume = rightChild == null
            ? BigDecimal.ZERO
            : rollUpSubtree(rightChild.getId(), cycleId, previousClosedCycleId, ownSaleVolume, leftChildOf, rightChildOf, legVolumes);

        BigDecimal ownVolume = ownSaleVolume.getOrDefault(associateId, BigDecimal.ZERO);
        BigDecimal subtreeVolume = ownVolume.add(leftSubtreeVolume).add(rightSubtreeVolume);

        BigDecimal leftLegVolume = BigDecimal.ZERO;
        BigDecimal rightLegVolume = BigDecimal.ZERO;
        if (leftChild != null || rightChild != null) {
            BigDecimal carriedForwardLeft = BigDecimal.ZERO;
            BigDecimal carriedForwardRight = BigDecimal.ZERO;
            if (previousClosedCycleId != null) {
                LegVolume priorCycleLegVolume = legVolumeRepository
                    .findByAssociateIdAndCycleId(associateId, previousClosedCycleId)
                    .orElse(null);
                if (priorCycleLegVolume != null) {
                    carriedForwardLeft = priorCycleLegVolume.getCarriedForwardLeft();
                    carriedForwardRight = priorCycleLegVolume.getCarriedForwardRight();
                }
            }
            leftLegVolume = leftSubtreeVolume.add(carriedForwardLeft);
            rightLegVolume = rightSubtreeVolume.add(carriedForwardRight);
        }

        legVolumes.add(new LegVolume(
            UUID.randomUUID(), associateId, cycleId, leftLegVolume, rightLegVolume, BigDecimal.ZERO, BigDecimal.ZERO));

        return subtreeVolume;
    }

    // Sales unit 1 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // Decision 5): returns today's OPEN cycle under the PRD's 1st-15th / 16th-end-of-month
    // cadence, creating one only if no existing cycle covers today. Reuses the existing
    // findFirstByStatusOrderByPeriodStartDesc query rather than adding a new repository method,
    // since at most one OPEN cycle is expected to exist at a time; if the most recent OPEN
    // cycle's stored period doesn't cover today (e.g. it's stale), a new cycle is created for
    // today's period without inspecting older OPEN cycles.
    public Cycle getOrOpenCurrent() {
        LocalDate today = LocalDate.now();

        return cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .filter(cycle -> covers(cycle, today))
            .orElseGet(() -> openNewCycle(today));
    }

    private boolean covers(Cycle cycle, LocalDate date) {
        return !date.isBefore(cycle.getPeriodStart()) && !date.isAfter(cycle.getPeriodEnd());
    }

    private Cycle openNewCycle(LocalDate today) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(periodStartFor(today));
        cycle.setPeriodEnd(periodEndFor(today));
        cycle.setStatus(CycleStatus.OPEN);
        return cycleRepository.save(cycle);
    }

    private LocalDate periodStartFor(LocalDate date) {
        return date.getDayOfMonth() <= 15 ? date.withDayOfMonth(1) : date.withDayOfMonth(16);
    }

    private LocalDate periodEndFor(LocalDate date) {
        return date.getDayOfMonth() <= 15
            ? date.withDayOfMonth(15)
            : date.withDayOfMonth(date.lengthOfMonth());
    }

    private CycleSummaryResponse toSummary(Cycle cycle) {
        return new CycleSummaryResponse(cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), cycle.getStatus());
    }
}
```

- [ ] **Step 5: Run `CycleServiceTest` and confirm everything passes**

Run: `cd backend && mvn -q -Dtest=CycleServiceTest test`
Expected: all tests pass, including the two new/replaced ones and the 7 pre-existing ones (now compiling against the 4-arg constructor).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/cycle/CycleService.java backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java
git commit -m "feat(cycle): implement leg-volume rollup in CycleService.close()

Post-order DFS from the root Admin (Decision #4): subtreeVolume =
own RECORDED sale volume + child subtree volumes, leg volume =
child subtree volume + prior-closed-cycle carried-forward. One
LegVolume row per associate, unconditionally. Cycle flips
OPEN -> CALCULATING -> CLOSED inside the existing @Transactional
boundary, then reopens the next cycle via getOrOpenCurrent().
Steps 3-7 (Matching, Rank, Sponsor Matching, Royalty, Reward) are
out of scope -- units 5-9."
```

---

### Task 5: `CycleControllerTest` — update the close-success test for the new response shape

**Files:**
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java`

**Interfaces:**
- Consumes: `CycleCloseResponse`'s 4-arg shape (Task 3).

- [ ] **Step 1: Replace the placeholder test**

Replace:
```java
    @Test
    void closeReturnsThePlaceholderResponseForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(cycleService.close(cycleId)).thenReturn(new CycleCloseResponse(cycleId, CycleStatus.OPEN));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cycleId").value(cycleId.toString()))
            .andExpect(jsonPath("$.status").value("OPEN"));
    }
```
with:
```java
    @Test
    void closeReturnsTheSettlementResultForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        UUID newCycleId = UUID.randomUUID();
        when(cycleService.close(cycleId))
            .thenReturn(new CycleCloseResponse(cycleId, CycleStatus.CLOSED, 3, newCycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/close", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cycleId").value(cycleId.toString()))
            .andExpect(jsonPath("$.status").value("CLOSED"))
            .andExpect(jsonPath("$.legVolumeRowsWritten").value(3))
            .andExpect(jsonPath("$.newCycleId").value(newCycleId.toString()));
    }
```

- [ ] **Step 2: Run the controller test**

Run: `cd backend && mvn -q -Dtest=CycleControllerTest test`
Expected: all tests pass, including `listReturnsAPageForAnAdminToken`, the 404/409 close tests (unaffected), and the renamed close-success test.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java
git commit -m "test(cycle): update close-success controller test for expanded CycleCloseResponse"
```

---

### Task 6: `CycleCloseConcurrencyTest` — update the now-stale comment and assertion

**Files:**
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleCloseConcurrencyTest.java`

Before this unit, the second `POST /close` call in `secondCloseBlocksUntilFirstTransactionResolvesThenSucceedsIfStatusIsStillOpen` returned unit 3's placeholder (`cycle.getStatus()` unchanged, still `OPEN`, since nothing wrote to it). Now that `close()` runs the real batch to completion, that same call closes the cycle for real and returns `CLOSED`. The class-level comment claiming "unit 4 ... doesn't exist yet" is also now false. Neither test needs new seed data — this test class starts with zero `Associate` rows (confirmed: `AdminBootstrapRunner` doesn't fire under the `test` profile), which per this plan's Global Constraints rolls up to zero `LegVolume` rows and still succeeds.

- [ ] **Step 1: Update the class-level comment**

Replace:
```java
// Cycle-management unit 4 (the settlement batch) doesn't exist yet, so nothing in this codebase
// currently writes CLOSED/PAID. The second test below manually flips status inside the "holder"
// transaction to stand in for what unit 4 will eventually do at commit time, so the
// blocks-then-409 path can be proven now instead of waiting on unit 4 to exist.
```
with:
```java
// Cycle-management unit 4 (the settlement batch: leg-volume rollup, OPEN -> CALCULATING ->
// CLOSED, reopen) now exists, and the first test below exercises it directly: this class seeds
// zero Associate rows, so the second call's real batch rolls up zero LegVolume rows and closes
// cleanly. The second test still manually flips status inside the "holder" transaction rather
// than letting a real close() run there too -- it only needs to stand in for "a previous close
// already succeeded," not re-exercise the batch a second time in the same test.
```

- [ ] **Step 2: Update the stale assertion**

Replace:
```java
        assertThat(events).containsExactly("holder-locked", "second-calling", "second-returned");
        assertThat(response.status()).isEqualTo(CycleStatus.OPEN);
        pool.shutdownNow();
```
with:
```java
        assertThat(events).containsExactly("holder-locked", "second-calling", "second-returned");
        // Unit 4: the second call's close() now runs the real batch to completion (zero
        // Associates seeded in this class -> zero LegVolume rows), ending in CLOSED, not the
        // pre-unit-4 placeholder's unchanged OPEN.
        assertThat(response.status()).isEqualTo(CycleStatus.CLOSED);
        assertThat(response.newCycleId()).isNotNull();
        pool.shutdownNow();
```

- [ ] **Step 3: Run the concurrency test**

Run: `cd backend && mvn -q -Dtest=CycleCloseConcurrencyTest test`
Expected: both tests pass (the row-lock/blocking mechanism itself is unchanged from unit 3 — only what the second call's successful return value looks like has changed).

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/plotchain/cycle/CycleCloseConcurrencyTest.java
git commit -m "test(cycle): update CycleCloseConcurrencyTest for unit 4's real close() behavior"
```

---

### Task 7: `CycleCloseRollbackTest` — new test proving the mid-batch rollback guarantee

**Files:**
- Create: `backend/src/test/java/com/plotchain/cycle/CycleCloseRollbackTest.java`

**Interfaces:**
- Consumes: `CycleService.close(UUID)` (real `@Autowired` bean), `CycleRepository` (real), `AssociateRepository` (real), `LegVolumeRepository` (`@MockBean`, stubbed to throw on `saveAll`).

Proves Decision #2/#3's rollback guarantee: if any step throws, the whole `@Transactional` method rolls back, including the `CALCULATING` flip from step 1 (never a separate commit) — the cycle ends up exactly as it was before the call, `OPEN`. Mocking only `LegVolumeRepository.saveAll` (the first write this unit's own logic makes after the `CALCULATING` flip) to throw, then re-reading the cycle through the *real* `CycleRepository` bean afterward, proves the flip itself didn't survive — not merely that no `LegVolume` rows exist (which would be trivially true of any mocked repository regardless of whether rollback actually happened).

- [ ] **Step 1: Write the test**

```java
package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

// Cycle-management unit 4, Decision #2/#3 rollback guarantee: if any step of the settlement
// batch throws, the whole @Transactional close() rolls back -- including the OPEN -> CALCULATING
// flip from flow step 1, since it was never a separate commit -- leaving the cycle exactly as it
// was before the call. Only LegVolumeRepository is mocked (to force a mid-batch failure at flow
// step 2, the first write after the CALCULATING flip); CycleRepository and AssociateRepository
// stay real, so re-reading the cycle afterward proves the flip didn't survive, not just that no
// LegVolume rows exist (which a mock would guarantee regardless of whether rollback happened).
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseRollbackTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlatformTransactionManager transactionManager;

    @MockBean LegVolumeRepository legVolumeRepository;

    private UUID cycleId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        if (cycleId != null) {
            cycleRepository.deleteById(cycleId);
        }
        if (associateId != null) {
            associateRepository.deleteById(associateId);
        }
    }

    private UUID seedOpenCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> cycleRepository.saveAndFlush(cycle));
        return cycle.getId();
    }

    // A single root Admin, no children: rollUpSubtree treats it as a leaf, so it never calls
    // LegVolumeRepository.findByAssociateIdAndCycleId (only nodes with >=1 child do) -- only
    // saveAll needs stubbing below.
    private UUID seedRootAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName("Admin Root");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> associateRepository.saveAndFlush(associate));
        return id;
    }

    @Test
    void exceptionMidBatchRollsBackTheCalculatingFlipLeavingTheCycleOpen() {
        cycleId = seedOpenCycle();
        associateId = seedRootAssociate();
        when(legVolumeRepository.saveAll(anyList())).thenThrow(new RuntimeException("simulated mid-batch failure"));

        assertThatThrownBy(() -> cycleService.close(cycleId)).isInstanceOf(RuntimeException.class);

        Cycle reread = cycleRepository.findById(cycleId).orElseThrow();
        assertThat(reread.getStatus()).isEqualTo(CycleStatus.OPEN);
    }
}
```

- [ ] **Step 2: Run the test**

Run: `cd backend && mvn -q -Dtest=CycleCloseRollbackTest test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/cycle/CycleCloseRollbackTest.java
git commit -m "test(cycle): prove mid-batch failure rolls back the CALCULATING flip"
```

---

### Task 8: Full backend test suite + bookkeeping

**Files:**
- Modify: `docs/superpowers/plans/2026-08-03-cycle-management-units.md`

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: BUILD SUCCESS, all tests pass (including every other package's tests — this unit touched shared entities/repositories in `sales` and `legvolume`, so a full run, not just the `cycle` package, is the actual verification this plan is complete).

- [ ] **Step 2: Update the unit-queue bookkeeping row**

In `docs/superpowers/plans/2026-08-03-cycle-management-units.md`, change the unit 4 row:
```
| 4 | backend | Closing an OPEN cycle computes leg-volume rollup tree-wide, OPEN→CLOSED, opens next cycle | 3 | pending | — | — |
```
to:
```
| 4 | backend | Closing an OPEN cycle computes leg-volume rollup tree-wide, OPEN→CLOSED, opens next cycle | 3 | planned | `docs/superpowers/plans/2026-08-10-cycle-close-legvolume-rollup.md` | — |
```

Also update the "Next pending unit" line at the bottom of that file, which currently reads:
```
**Next pending unit:** 2 (no unmet dependencies) or 4 (needs unit 3, now merged — the settlement batch itself: leg-volume rollup, OPEN→CLOSED, opens next cycle). Unit 11 (screen) is blocked until both 2 and 4 land.
```
to:
```
**Next pending unit:** 2 (no unmet dependencies) or 5 (needs unit 4, now planned — Matching Income credited, net of deductions, KYC-gated). Unit 11 (screen) is blocked until both 2 and 4 land; 4 is planned but not yet merged.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-03-cycle-management-units.md
git commit -m "docs: mark cycle-management unit 4 planned, link its plan file"
```

## Self-Review Notes

- **Spec coverage:** flow step 1 (partial: `CALCULATING` flip + load associates/sales — Task 4), step 2 (rollup — Task 4), step 8 (`CLOSED` flip + `getOrOpenCurrent()` — Task 4) are all covered. Steps 3–7 are explicitly out of scope per the task brief and are not touched. Decision #4's exact formula (subtreeVolume, leg volume = child subtree + carried-forward, one row per associate unconditionally, `previousClosedCycleId` via the existing `findFirstByStatusOrderByPeriodStartDesc(CLOSED)`) is implemented and hand-verified against the Task 4 fixture test. Decision #2/#3's rollback guarantee is covered by Task 7. The Testing section's "leg-volume rollup matches hand-computed expected values on a small fixture tree (3–4 levels, mixed L/R, some leaf sales, some carried-forward from a seeded prior CLOSED cycle's LegVolume rows)" is covered exactly by Task 4's fixture (3 levels, mixed L/R, three leaf sales, one carried-forward row, plus an explicit all-zero leaf).
- **Placeholder scan:** no TBD/TODO/"add appropriate handling" language; every step shows the literal code or literal diff to apply.
- **Type consistency:** `CycleCloseResponse(UUID cycleId, CycleStatus status, int legVolumeRowsWritten, UUID newCycleId)` (Task 3) matches every construction site (Task 4's `close()`, Task 4/5/6 tests) and every field-access site (`.legVolumeRowsWritten()`, `.newCycleId()`) used later. `SaleRepository.findByCycleIdAndStatus(UUID, SaleStatus): List<Sale>` (Task 1) matches its one call site in Task 4's `close()`. `LegVolume`'s new setters (Task 2) are unused by this plan's own code, as documented, and don't need to match any call site here.
