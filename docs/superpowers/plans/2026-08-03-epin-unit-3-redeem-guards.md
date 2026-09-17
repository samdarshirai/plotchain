# e-PIN Redeem Guards (epin-domain unit 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/admin/epins/{id}/redeem` so that redeeming an `id` that doesn't resolve to an `EPin` returns 404, redeeming an already-`USED` `EPin` returns 409, and redeeming with an `associateId` that doesn't resolve to an `Associate` returns 404 — with no `EPin` or `Associate` row changed in any of the three cases.

**Architecture:** Adds a `redeem(UUID id, RedeemEPinRequest request, UUID actorId)` method to the existing `EPinService`, implementing only flow steps 1-3 of the spec's "Redeem" flow (EPin lookup, already-used guard, associate lookup) and ending in an `UnsupportedOperationException` placeholder for steps 4-5, mirroring the exact guard-only convention `SaleService.voidSale()` established in Sales unit 4 (`docs/superpowers/plans/2026-08-10-sales-void-guards.md`, commit-comment precedent still live in `SaleService.java`). Wires that method to a new controller endpoint, maps its two new exceptions to HTTP statuses via a new `EPinExceptionHandler` (the third `AssociateNotFoundException` case needs no new mapping — it's already handled globally by `DashboardExceptionHandler`), and adds an ADMIN-only Spring Security matcher following the same pattern as the existing `POST /api/admin/epins` and `POST /api/admin/sales/*/void` matchers.

**Tech Stack:** Spring Boot (Java), Spring Security, Spring Data JPA, JUnit 5 + Mockito (service tests), MockMvc + real JWT + real Spring Security filter chain (controller and security tests), H2 in-memory DB for `@SpringBootTest` tests.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md` (Flows "Redeem" steps 1-3; Data model; Error handling table; Testing). Unit detail: `docs/superpowers/plans/2026-08-03-epin-units.md`, unit 3.

## Global Constraints

- Endpoint: `POST /api/admin/epins/{id}/redeem`, ADMIN-only, body `RedeemEPinRequest(associateId, redemptionType, linkedEntityId)` (spec Decision 10, Flows "Redeem").
- This unit implements ONLY flow steps 1-3 — EPin lookup (404 if missing), already-used guard (409), associate lookup (404 if missing). Steps 4-5 (the actual `EPin` status/redemption-field write) are epin-domain unit 4's job — do not implement them here, and do not implement partial pieces of them (no `epinRepository.save(...)` call anywhere in this unit's `redeem()` at all).
- `EPinNotFoundException` (new) → 404 → `id` doesn't resolve on redeem (spec's error handling table).
- `EPinAlreadyRedeemedException` (new) → 409 → redeeming an `EPin` whose `status` is already `USED` (spec's error handling table).
- `AssociateNotFoundException` (existing, `com.plotchain.associate`) → 404 → `associateId` in the redeem request doesn't resolve (spec's error handling table). Reused as-is — no new exception type, no new HTTP mapping (already global via `DashboardExceptionHandler`).
- New exception classes are plain `RuntimeException` subclasses taking the `EPin` id (`UUID`) and building a message, matching `SaleNotFoundException`/`SaleAlreadyVoidedException`'s existing shape exactly — no `@ResponseStatus` annotation; HTTP mapping happens via a new `EPinExceptionHandler`, matching how `SalesExceptionHandler` maps `SaleNotFoundException`/`SaleAlreadyVoidedException`.
- No new package: everything new lives in the existing `com.plotchain.epin` package (`EPinService`, `EPinController` are modified in place; `EPinNotFoundException`, `EPinAlreadyRedeemedException`, `RedeemEPinRequest`, `EPinExceptionHandler` are new files in that same package).
- `RedeemEPinRequest` includes all three fields from the spec's Data model now (`associateId`, `redemptionType`, `linkedEntityId`), even though only `associateId`/`redemptionType` are validated (`@NotNull`) and used by this unit's guards — so unit 4 doesn't need to redefine the DTO. `linkedEntityId` is deliberately left unvalidated (spec Decision 7: nullable, no FK).
- `EPinService.redeem(...)` gains a new constructor dependency on `AssociateRepository` (existing, `com.plotchain.associate.AssociateRepository`) — its inherited `findById(UUID)` is all this unit's third guard needs, no new repository query. `EPinService`'s constructor becomes two-arg (`EPinRepository`, `AssociateRepository`); update every call site (`EPinServiceTest`'s `setUp()` is the only other one — Spring wires the real controller constructor automatically).
- No migration needed: `EPinStatus.UNUSED`/`USED` and all five redemption columns already exist and are mapped on `EPin` (epin-domain units 1/2); this unit reads `EPin.status`, never writes it.
- No `EPinRepository` change needed: `EPinRepository extends JpaRepository<EPin, UUID>` already provides `findById(UUID)`, which is all this unit's first guard needs (no row lock — nothing is mutated in this unit).

---

### Task 1: `EPinService.redeem()` guards, new exception types, `RedeemEPinRequest`

**Files:**
- Create: `backend/src/main/java/com/plotchain/epin/EPinNotFoundException.java`
- Create: `backend/src/main/java/com/plotchain/epin/EPinAlreadyRedeemedException.java`
- Create: `backend/src/main/java/com/plotchain/epin/RedeemEPinRequest.java`
- Modify: `backend/src/main/java/com/plotchain/epin/EPinService.java` (constructor gains `AssociateRepository`; add `redeem(...)` method after `list(...)`, before the `toResponse` helper)
- Test: `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java`

**Interfaces:**
- Consumes: `EPinRepository.findById(UUID)` (inherited from `JpaRepository`, already available). `AssociateRepository.findById(UUID)` (inherited from `JpaRepository`, existing class `com.plotchain.associate.AssociateRepository` — new constructor dependency for `EPinService`). `EPin.getStatus()`, `EPinStatus.USED` (both exist from unit 1/2). `AssociateNotFoundException(UUID)` (existing, `com.plotchain.associate.AssociateNotFoundException`).
- Produces: `EPinService.redeem(UUID id, RedeemEPinRequest request, UUID actorId)` returns `EPinResponse` on the (not-yet-implemented) happy path; throws `EPinNotFoundException` when `id` doesn't resolve; throws `EPinAlreadyRedeemedException` when `epin.getStatus() == EPinStatus.USED`; throws `AssociateNotFoundException` when `request.associateId()` doesn't resolve; throws `UnsupportedOperationException` as a placeholder once all three guards pass (epin-domain unit 4 replaces that placeholder). `RedeemEPinRequest(UUID associateId, RedemptionType redemptionType, UUID linkedEntityId)` — record with `@NotNull` on `associateId`/`redemptionType`. `EPinNotFoundException(UUID epinId)` and `EPinAlreadyRedeemedException(UUID epinId)` — both `RuntimeException` subclasses. Task 2 consumes all of these.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java`, immediately before the final closing `}` of the class (after `listReturnsAnEmptyPageWhenSearchFindsNothing`):

```java
    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 1-3): guard-only tests. The happy-path write (step 4-5) is
    // epin-domain unit 4's job -- redeemReachesThePlaceholderWhenAllGuardsPass below only
    // proves the guards let an UNUSED EPin with a resolvable associateId through, not that
    // anything gets written.
    @Test
    void redeemThrowsEPinNotFoundExceptionWhenTheEPinDoesNotExist() {
        UUID epinId = UUID.randomUUID();
        when(epinRepository.findById(epinId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(UUID.randomUUID(), RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(EPinNotFoundException.class);

        verify(epinRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void redeemThrowsEPinAlreadyRedeemedExceptionWhenTheEPinIsAlreadyUsed() {
        UUID epinId = UUID.randomUUID();
        EPin usedEPin = new EPin();
        usedEPin.setId(epinId);
        usedEPin.setStatus(EPinStatus.USED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(usedEPin));

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(UUID.randomUUID(), RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(EPinAlreadyRedeemedException.class);

        verify(epinRepository, never()).save(any());
        verify(associateRepository, never()).findById(any());
    }

    @Test
    void redeemThrowsAssociateNotFoundExceptionWhenTheAssociateIdDoesNotResolve() {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(associateId, RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(epinRepository, never()).save(any());
    }

    @Test
    void redeemReachesThePlaceholderWhenAllGuardsPass() {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(new Associate()));

        assertThatThrownBy(() -> epinService.redeem(epinId,
                new RedeemEPinRequest(associateId, RedemptionType.ACTIVATION, null), UUID.randomUUID()))
            .isInstanceOf(UnsupportedOperationException.class);

        verify(epinRepository, never()).save(any());
    }
```

Add these imports at the top of `EPinServiceTest.java`, alongside the existing ones:

```java
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
```

```java
import java.util.Optional;
```

And add a new mock field, alongside the existing `@Mock EPinRepository epinRepository;`:

```java
    @Mock AssociateRepository associateRepository;
```

- [ ] **Step 2: Update `setUp()` to construct `EPinService` with both mocks**

In `backend/src/test/java/com/plotchain/epin/EPinServiceTest.java`, change:

```java
    @BeforeEach
    void setUp() {
        epinService = new EPinService(epinRepository);
    }
```

to:

```java
    @BeforeEach
    void setUp() {
        epinService = new EPinService(epinRepository, associateRepository);
    }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=EPinServiceTest test`
Expected: FAIL to compile — `redeem`, `RedeemEPinRequest`, `EPinNotFoundException`, `EPinAlreadyRedeemedException`, and the two-arg `EPinService` constructor don't exist yet.

- [ ] **Step 4: Create `EPinNotFoundException.java`**

```java
package com.plotchain.epin;

import java.util.UUID;

public class EPinNotFoundException extends RuntimeException {
    public EPinNotFoundException(UUID epinId) {
        super("E-PIN not found: " + epinId);
    }
}
```

- [ ] **Step 5: Create `EPinAlreadyRedeemedException.java`**

```java
package com.plotchain.epin;

import java.util.UUID;

public class EPinAlreadyRedeemedException extends RuntimeException {
    public EPinAlreadyRedeemedException(UUID epinId) {
        super("E-PIN is already redeemed: " + epinId);
    }
}
```

- [ ] **Step 6: Create `RedeemEPinRequest.java`**

```java
package com.plotchain.epin;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Flows "Redeem", Data model): associateId/redemptionType are required (@NotNull, 400 on
// violation via ApiExceptionHandler's existing MethodArgumentNotValidException mapping).
// linkedEntityId is deliberately unvalidated -- Decision 7: nullable, no FK constraint, and
// expected to stay null for ACTIVATION redemptions (redeemedTo already identifies the
// associate). All three fields are defined now, in this guards-only unit, so epin-domain unit
// 4's happy path doesn't need to redefine this record.
public record RedeemEPinRequest(
    @NotNull UUID associateId,
    @NotNull RedemptionType redemptionType,
    UUID linkedEntityId
) {}
```

- [ ] **Step 7: Add the `AssociateRepository` dependency and `redeem()` to `EPinService.java`**

In `backend/src/main/java/com/plotchain/epin/EPinService.java`, add two imports alongside the existing ones:

```java
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
```

Change the constructor from:

```java
    private final EPinRepository epinRepository;

    public EPinService(EPinRepository epinRepository) {
        this.epinRepository = epinRepository;
    }
```

to:

```java
    private final EPinRepository epinRepository;
    private final AssociateRepository associateRepository;

    public EPinService(EPinRepository epinRepository, AssociateRepository associateRepository) {
        this.epinRepository = epinRepository;
        this.associateRepository = associateRepository;
    }
```

Then insert the following method between the closing `}` of `list(...)` and the `private EPinResponse toResponse(EPin epin)` helper:

```java
    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 1-3): guards only. epin-domain unit 4 inserts the happy-path
    // status/redeemedTo/redeemedBy/redeemedAt/redemptionType/linkedEntityId writes and
    // epinRepository.save between the associate-lookup guard below and the placeholder throw --
    // sequentially, without changing this method's signature -- following the same guard-only
    // convention SaleService.voidSale's Sales unit 4 established
    // (docs/superpowers/plans/2026-08-10-sales-void-guards.md).
    public EPinResponse redeem(UUID id, RedeemEPinRequest request, UUID actorId) {
        EPin epin = epinRepository.findById(id)
            .orElseThrow(() -> new EPinNotFoundException(id));

        if (epin.getStatus() == EPinStatus.USED) {
            throw new EPinAlreadyRedeemedException(id);
        }

        associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        // Placeholder: epin-domain unit 4 replaces this line with the status/redeemedTo/
        // redeemedBy/redeemedAt/redemptionType/linkedEntityId writes and epinRepository.save
        // (spec flow steps 4-5).
        throw new UnsupportedOperationException(
            "e-PIN redeem happy path is not yet implemented (epin-domain unit 4)");
    }
```

No new import beyond the two above is needed — `java.util.UUID` is already imported in `EPinService.java`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=EPinServiceTest test`
Expected: PASS — all `EPinServiceTest` tests, including the four new ones, green.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/epin/EPinNotFoundException.java \
        backend/src/main/java/com/plotchain/epin/EPinAlreadyRedeemedException.java \
        backend/src/main/java/com/plotchain/epin/RedeemEPinRequest.java \
        backend/src/main/java/com/plotchain/epin/EPinService.java \
        backend/src/test/java/com/plotchain/epin/EPinServiceTest.java
git commit -m "feat(epin): add EPinService.redeem() reject-path guards"
```

---

### Task 2: `EPinController` endpoint + `EPinExceptionHandler`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/epin/EPinController.java` (insert new endpoint after `list(...)`, before the class's closing `}`)
- Create: `backend/src/main/java/com/plotchain/epin/EPinExceptionHandler.java`
- Test: `backend/src/test/java/com/plotchain/epin/EPinControllerTest.java`

**Interfaces:**
- Consumes: `EPinService.redeem(UUID id, RedeemEPinRequest request, UUID actorId)`, `EPinNotFoundException`, `EPinAlreadyRedeemedException`, `RedeemEPinRequest` from Task 1.
- Produces: `POST /api/admin/epins/{id}/redeem` (200 with `EPinResponse` body on success — not exercised by this unit's tests since the happy path isn't implemented yet; 404 on `EPinNotFoundException` or on the reused `AssociateNotFoundException`; 409 on `EPinAlreadyRedeemedException`; 400 on `@NotNull` violations). Task 3 consumes this route path.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/epin/EPinControllerTest.java`, immediately before the final closing `}` of the class (after `listIsUnauthorizedWithoutAToken`):

```java
    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Flows "Redeem", steps 1-3): guard-only controller tests. The happy path (200 with a
    // fully-populated EPinResponse) is epin-domain unit 4's job.
    @Test
    void redeemReturns404WhenTheEPinDoesNotExist() throws Exception {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        when(epinRepository.findById(epinId)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/admin/epins/{id}/redeem", epinId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"associateId\":\"" + associateId + "\",\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void redeemReturns409WhenTheEPinIsAlreadyRedeemed() throws Exception {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        EPin usedEPin = new EPin();
        usedEPin.setId(epinId);
        usedEPin.setStatus(EPinStatus.USED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(usedEPin));

        mockMvc.perform(post("/api/admin/epins/{id}/redeem", epinId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"associateId\":\"" + associateId + "\",\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void redeemReturns404WhenTheAssociateIdDoesNotResolve() throws Exception {
        UUID epinId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        EPin unusedEPin = new EPin();
        unusedEPin.setId(epinId);
        unusedEPin.setStatus(EPinStatus.UNUSED);
        when(epinRepository.findById(epinId)).thenReturn(Optional.of(unusedEPin));
        when(associateRepository.findById(associateId)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/admin/epins/{id}/redeem", epinId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"associateId\":\"" + associateId + "\",\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void redeemReturns400WhenAssociateIdIsMissing() throws Exception {
        mockMvc.perform(post("/api/admin/epins/{id}/redeem", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.associateId").isNotEmpty());
    }

    @Test
    void redeemReturns400WhenRedemptionTypeIsMissing() throws Exception {
        mockMvc.perform(post("/api/admin/epins/{id}/redeem", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.redemptionType").isNotEmpty());
    }

    @Test
    void redeemIsUnauthorizedWithoutAToken() throws Exception {
        mockMvc.perform(post("/api/admin/epins/{id}/redeem", UUID.randomUUID())
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\",\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void redeemIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/epins/{id}/redeem", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\",\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().isForbidden());
    }
```

No new imports are needed — `EPin`, `EPinStatus`, `UUID`, `Optional`, `post`, `status`, `jsonPath`, `when`, `AssociateRole` are all already imported in this file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=EPinControllerTest test`
Expected: FAIL — `POST /api/admin/epins/{id}/redeem` doesn't exist yet, so every new test fails (404s become 404-from-no-handler which happens to coincide with some expectations but not others — e.g. the 409/400 tests fail outright; run anyway to confirm before implementing).

- [ ] **Step 3: Add the endpoint to `EPinController.java`**

Add one import alongside the existing ones:

```java
import org.springframework.web.bind.annotation.PathVariable;
```

Insert between the closing `}` of `list(...)` and the class's closing `}`:

```java
    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // Decision 10: the path parameter is the EPin's id, not its code): guard-only wiring --
    // EPinService.redeem still ends in a placeholder throw until epin-domain unit 4 lands.
    @PostMapping("/{id}/redeem")
    public ResponseEntity<EPinResponse> redeem(
            @PathVariable UUID id,
            @Valid @RequestBody RedeemEPinRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.ok(epinService.redeem(id, request, actorId));
    }
```

- [ ] **Step 4: Create `EPinExceptionHandler.java`**

```java
package com.plotchain.epin;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// com.plotchain.associate.AssociateNotFoundException (existing, thrown by EPinService.redeem
// on an unknown associateId -- epin-domain unit 3) is already mapped to 404 by the app-wide
// com.plotchain.dashboard.DashboardExceptionHandler -- @RestControllerAdvice beans apply
// across every controller in the application regardless of which package throws the
// exception, so no duplicate handler is added here for it. Same reasoning as
// com.plotchain.sales.SalesExceptionHandler and com.plotchain.withdrawal.WithdrawalExceptionHandler.
@RestControllerAdvice
public class EPinExceptionHandler {

    @ExceptionHandler(EPinNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleEPinNotFound(EPinNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(EPinAlreadyRedeemedException.class)
    public ResponseEntity<Map<String, String>> handleEPinAlreadyRedeemed(EPinAlreadyRedeemedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=EPinControllerTest test`
Expected: PASS — all `EPinControllerTest` tests, including the seven new ones, green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/epin/EPinController.java \
        backend/src/main/java/com/plotchain/epin/EPinExceptionHandler.java \
        backend/src/test/java/com/plotchain/epin/EPinControllerTest.java
git commit -m "feat(epin): add POST /api/admin/epins/{id}/redeem controller and exception mappings"
```

---

### Task 3: ADMIN-only `SecurityConfig` matcher for the redeem route

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` (insert new matcher between the existing `GET /api/admin/epins` matcher and the blanket `POST /api/**` rule)
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `POST /api/admin/epins/{id}/redeem` route from Task 2; `EPinNotFoundException` → 404 mapping from Task 2 (this task's test relies on that mapping to distinguish "passed security, hit the real empty H2 `epin` table, 404'd" from "blocked at the security layer, 403").
- Produces: nothing consumed by a later task — this is the last task in this unit.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, immediately after `adminEpinsListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`:

```java
    // epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
    // "POST /api/admin/epins/{id}/redeem, ADMIN-only", Decision 12): same target-role-model
    // pattern as adminSalesVoidIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above.
    // EPinRepository is NOT @MockBean'd in this class, so an ADMIN token reaches the real (H2,
    // unmocked) EPinRepository -- a random, non-existent epinId 404s via EPinNotFoundException
    // (mapped by EPinExceptionHandler), proof the request passed the security layer, not proof
    // of any particular business outcome, same "assert not 403" reasoning as that void test.
    // Every other role, including the soon-to-be-deleted admin-family sub-roles, is blocked at
    // the filter layer before the controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminEpinsRedeemIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/epins/{id}/redeem", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"associateId\":\"" + UUID.randomUUID() + "\",\"redemptionType\":\"ACTIVATION\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }
```

No new imports needed — `post`, `status`, `ParameterizedTest`, `EnumSource`, `AssociateRole`, `UUID` are all already imported in this file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest test`
Expected: FAIL — without the new matcher, the redeem route falls through to the blanket `POST /api/**` rule, which is already `hasAuthority("ADMIN")` in this two-role-collapsed codebase, so functionally every non-ADMIN role should already get 403 and ADMIN should already get 404 through the blanket rule alone — this test is expected to already pass once Task 2 lands. Run it anyway to confirm before adding the matcher; if it unexpectedly fails, that diagnoses a real gap, not a missing-implementation gap.

- [ ] **Step 3: Add the matcher to `SecurityConfig.java`**

Insert between the existing `GET /api/admin/epins` matcher (ending `.hasAuthority("ADMIN")`) and the blanket `POST /api/**` rule:

```java
                // Redeem an e-PIN: ADMIN-only, per epin-domain unit 3
                // (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
                // Decision 12), same target-role-model reasoning and first-match-wins placement
                // as the void-a-sale matcher above -- not load-bearing on its own (the blanket
                // POST rule below already covers it, since this codebase's write rule is a
                // plain hasAuthority("ADMIN"), not a multi-role list), added for the same
                // readability/grouping reason those matchers document. This unit's own scope is
                // guards only (unknown/already-redeemed EPin or unknown associate rejected with
                // no side effects); epin-domain unit 4's actual write reuses this same matcher,
                // no security change needed when that unit lands.
                .requestMatchers(HttpMethod.POST, "/api/admin/epins/*/redeem")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest test`
Expected: PASS — `adminEpinsRedeemIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` green for both `AssociateRole` values.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS — no regressions in any other test class (in particular `EPinServiceTest`, `EPinControllerTest`, `EPinRepositoryTest`, `EPinCodeGeneratorTest`, and the rest of `SecurityConfigTest`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(epin): make POST /api/admin/epins/{id}/redeem ADMIN-only"
```

---

## Self-review notes (for the plan author, not a task to execute)

- **Spec coverage:** Flow step 1 (EPin lookup, 404 `EPinNotFoundException`) is implemented in Task 1 and asserted by `redeemThrowsEPinNotFoundExceptionWhenTheEPinDoesNotExist` (service) and `redeemReturns404WhenTheEPinDoesNotExist` (controller). Step 2 (already-used guard, 409 `EPinAlreadyRedeemedException`) is implemented in Task 1 and asserted by `redeemThrowsEPinAlreadyRedeemedExceptionWhenTheEPinIsAlreadyUsed`/`redeemReturns409WhenTheEPinIsAlreadyRedeemed`. Step 3 (associate lookup, 404 `AssociateNotFoundException`, reused) is implemented in Task 1 and asserted by `redeemThrowsAssociateNotFoundExceptionWhenTheAssociateIdDoesNotResolve`/`redeemReturns404WhenTheAssociateIdDoesNotResolve`. `@NotNull` 400s on `associateId`/`redemptionType` are asserted by `redeemReturns400WhenAssociateIdIsMissing`/`redeemReturns400WhenRedemptionTypeIsMissing` (Task 2), riding the existing app-wide `ApiExceptionHandler.handleValidationFailure`. 403/401 (Decision 12) are asserted at both the controller level (Task 2's `redeemIsForbiddenForAnAssociateToken`/`redeemIsUnauthorizedWithoutAToken`) and the security-matcher level across every `AssociateRole` value (Task 3's `adminEpinsRedeemIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`).
- **Out-of-scope guardrails respected:** No write to `EPin.status`/`redeemedTo`/`redeemedBy`/`redeemedAt`/`redemptionType`/`linkedEntityId`, no `epinRepository.save(...)` call anywhere in `redeem(...)`'s body, no change to `EPinController.generateBatch`/`list`, no change to `SecurityConfig`'s existing `POST`/`GET /api/admin/epins` matchers — this plan touches only `EPinService.redeem(...)`, one new controller method, one new exception-handler class, two new exception classes, one new request DTO, one new security matcher, and their tests.
- **Placeholder scan:** no TBD/TODO; every step has literal code, not a description of code. The one deliberate `UnsupportedOperationException` "placeholder" is the documented, precedented guards-then-happy-path convention (`SaleService.voidSale`), not an unfinished plan step — epin-domain unit 4 is explicitly chartered to replace it.
- **Type consistency:** `RedeemEPinRequest(UUID associateId, RedemptionType redemptionType, UUID linkedEntityId)` (Task 1) matches exactly between the record definition, `EPinService.redeem(UUID, RedeemEPinRequest, UUID)`'s parameter type, `EPinController.redeem(...)`'s `@RequestBody` type, and every test's construction (`new RedeemEPinRequest(associateId, RedemptionType.ACTIVATION, null)` in `EPinServiceTest`; raw JSON bodies with `associateId`/`redemptionType` keys in `EPinControllerTest`/`SecurityConfigTest`). `EPinService`'s constructor signature (`EPinRepository`, `AssociateRepository`) matches between the production class and `EPinServiceTest.setUp()`'s two-arg call — Spring's real `EPinController` wiring picks up the new constructor automatically since `AssociateRepository` is already a Spring-managed bean (used elsewhere, e.g. `KycReviewService`, `SaleService`).
