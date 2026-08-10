# Sales Void Guards (Sales unit 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/admin/sales/{id}/void` so that voiding a `Sale` that doesn't exist returns 404, voiding a `Sale` that is already `VOIDED` returns 409, and neither case writes anything to any table.

**Architecture:** Adds a `voidSale(UUID id, VoidSaleRequest request)` method to the existing `SaleService`, implementing only flow steps 1-2 of the "Void a sale" flow (lookup + already-voided guard) and ending in an `UnsupportedOperationException` placeholder for steps 3-6, mirroring the exact guard-only convention `SaleService.recordSale()` established in Sales unit 2 (commit `2a55b33`). Wires that method to a new controller endpoint, maps its two new exceptions to HTTP statuses via the existing `SalesExceptionHandler`, and adds an ADMIN-only Spring Security matcher following the same pattern as the existing `POST /api/admin/sales` and `POST /api/admin/cycles/*/close` matchers.

**Tech Stack:** Spring Boot (Java), Spring Security, Spring Data JPA, JUnit 5 + Mockito (service tests), MockMvc + real JWT + real Spring Security filter chain (controller and security tests), H2 in-memory DB for `@SpringBootTest` tests.

## Global Constraints

- Endpoint: `POST /api/admin/sales/{id}/void`, ADMIN-only, body `{reason: string}` (source spec line 65).
- This unit implements ONLY flow steps 1-2 — lookup (404 if missing) and already-voided guard (409). Steps 3-6 (the actual `Sale`/`Plot`/`LedgerEntry` mutations) are Sales unit 5's job — do not implement them here, and do not implement partial pieces of them (e.g. no `Plot`/`LedgerEntry` repository calls in this unit's `voidSale()` at all).
- `SaleNotFoundException` (new) → 404 → `id` doesn't resolve on void (spec's error handling table, line 103).
- `SaleAlreadyVoidedException` (new) → 409 → voiding an already-`VOIDED` sale (spec's error handling table, line 104).
- New exception classes are plain `RuntimeException` subclasses taking the relevant UUID and building a message, matching `PlotNotFoundException`/`PlotNotAvailableException`/`AssociateNotFoundException`'s existing shape exactly — no `@ResponseStatus` annotation; HTTP mapping happens via `SalesExceptionHandler`, matching how `PlotNotAvailableException` is already mapped.
- No new package: everything new lives in the existing `com.plotchain.sales` package (`SaleService`, `SaleController`, `SalesExceptionHandler` are modified in place; `SaleNotFoundException`, `SaleAlreadyVoidedException`, `VoidSaleRequest` are new files in that same package).
- No migration needed: `SaleStatus.RECORDED`/`VOIDED` already exist (Sales unit 3); this unit reads `Sale.status`, never writes it.
- No `SaleRepository` change needed: `SaleRepository extends JpaRepository<Sale, UUID>` already provides `findById(UUID)`, which is all this unit's guard needs (no row lock — nothing is mutated in this unit, so `findByIdForUpdate`-style locking is not required; the actual mutation added in unit 5 can decide separately whether it needs one).

---

### Task 1: `SaleService.voidSale()` guards, new exception types, `VoidSaleRequest`

**Files:**
- Create: `backend/src/main/java/com/plotchain/sales/SaleNotFoundException.java`
- Create: `backend/src/main/java/com/plotchain/sales/SaleAlreadyVoidedException.java`
- Create: `backend/src/main/java/com/plotchain/sales/VoidSaleRequest.java`
- Modify: `backend/src/main/java/com/plotchain/sales/SaleService.java:127-129` (insert new method between the closing `}` of `recordSale()` and the `toResponse()` helper)
- Test: `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`

**Interfaces:**
- Consumes: `SaleRepository.findById(UUID)` (inherited from `JpaRepository`, already available — no repository change). `Sale.getStatus()`, `SaleStatus.VOIDED` (both exist from Sales unit 3).
- Produces: `SaleService.voidSale(UUID id, VoidSaleRequest request)` returns `SaleResponse` on the (not-yet-implemented) happy path; throws `SaleNotFoundException` when the id doesn't resolve; throws `SaleAlreadyVoidedException` when `sale.getStatus() == SaleStatus.VOIDED`; throws `UnsupportedOperationException` as a placeholder once both guards pass (Sales unit 5 replaces that placeholder). `VoidSaleRequest(String reason)` — plain record, no validation annotation. `SaleNotFoundException(UUID saleId)` and `SaleAlreadyVoidedException(UUID saleId)` — both `RuntimeException` subclasses. Task 2 consumes all of these.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/sales/SaleServiceTest.java`, immediately before the final closing `}` of the class (after `recordSaleThrowsIllegalStateExceptionWhenNoCompensationPlanVersionIsConfigured`):

```java
    // Sales unit 4 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", steps 1-2): guard-only tests. The happy-path reversal (steps 3-6) is
    // Sales unit 5's job -- voidSaleReachesThePlaceholderWhenGuardsPass below only proves the
    // guards let a RECORDED sale through, not that anything gets reversed.
    @Test
    void voidSaleThrowsSaleNotFoundExceptionWhenTheSaleDoesNotExist() {
        UUID saleId = UUID.randomUUID();
        when(saleRepository.findById(saleId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(SaleNotFoundException.class);

        verify(saleRepository, never()).save(any());
        verify(plotRepository, never()).save(any());
        verify(ledgerEntryRepository, never()).save(any());
    }

    @Test
    void voidSaleThrowsSaleAlreadyVoidedExceptionWhenTheSaleIsAlreadyVoided() {
        UUID saleId = UUID.randomUUID();
        Sale voidedSale = new Sale();
        voidedSale.setId(saleId);
        voidedSale.setStatus(SaleStatus.VOIDED);
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(voidedSale));

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(SaleAlreadyVoidedException.class);

        verify(saleRepository, never()).save(any());
        verify(plotRepository, never()).save(any());
        verify(ledgerEntryRepository, never()).save(any());
    }

    @Test
    void voidSaleReachesThePlaceholderWhenGuardsPass() {
        UUID saleId = UUID.randomUUID();
        Sale recordedSale = new Sale();
        recordedSale.setId(saleId);
        recordedSale.setStatus(SaleStatus.RECORDED);
        when(saleRepository.findById(saleId)).thenReturn(Optional.of(recordedSale));

        assertThatThrownBy(() -> saleService.voidSale(saleId, new VoidSaleRequest("Buyer backed out")))
            .isInstanceOf(UnsupportedOperationException.class);

        verify(saleRepository, never()).save(any());
        verify(plotRepository, never()).save(any());
        verify(ledgerEntryRepository, never()).save(any());
    }
```

No new imports are needed: `Sale`, `SaleStatus`, `SaleService` are in the same package as the test (`com.plotchain.sales`); `Optional`, `UUID`, `any`, `never`, `verify`, `when`, `assertThatThrownBy` are already imported in this file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=SaleServiceTest test`
Expected: FAIL to compile — `voidSale`, `VoidSaleRequest`, `SaleNotFoundException`, `SaleAlreadyVoidedException` don't exist yet.

- [ ] **Step 3: Create `SaleNotFoundException.java`**

```java
package com.plotchain.sales;

import java.util.UUID;

public class SaleNotFoundException extends RuntimeException {
    public SaleNotFoundException(UUID saleId) {
        super("Sale not found: " + saleId);
    }
}
```

- [ ] **Step 4: Create `SaleAlreadyVoidedException.java`**

```java
package com.plotchain.sales;

import java.util.UUID;

public class SaleAlreadyVoidedException extends RuntimeException {
    public SaleAlreadyVoidedException(UUID saleId) {
        super("Sale is already voided: " + saleId);
    }
}
```

- [ ] **Step 5: Create `VoidSaleRequest.java`**

```java
package com.plotchain.sales;

// reason is deliberately unvalidated here (no @NotBlank) -- per the source spec's Decision 6 /
// Data model section, void_reason is "required by the API when voiding, not by the DB
// constraint," mirroring how KycDecisionRequest's reason is conditionally required at the
// request-validation layer elsewhere in this codebase, not via bean validation on the record
// itself. This unit (Sales unit 4) only implements the reject-path guards (missing/
// already-voided Sale); actually persisting and validating reason belongs to Sales unit 5,
// which fills in flow steps 3-6 on SaleService.voidSale().
public record VoidSaleRequest(String reason) {}
```

- [ ] **Step 6: Add `voidSale()` to `SaleService.java`**

In `backend/src/main/java/com/plotchain/sales/SaleService.java`, insert the following method between the closing `}` of `recordSale()` (line 127) and the `private SaleResponse toResponse(Sale sale)` helper (line 129):

```java
    // Sales unit 4 (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
    // flow "Void a sale", steps 1-2): guards only. Sales unit 5 inserts the happy-path
    // Sale->VOIDED flip, voidReason assignment, Plot->AVAILABLE flip, and LedgerEntry reversal
    // between the already-voided guard below and the placeholder throw -- sequentially, without
    // changing this method's signature -- following the same guard-only convention
    // recordSale's Sales unit 2 established (see commit 2a55b33, "Sales unit 2 ... guards
    // only").
    public SaleResponse voidSale(UUID id, VoidSaleRequest request) {
        Sale sale = saleRepository.findById(id)
            .orElseThrow(() -> new SaleNotFoundException(id));

        if (sale.getStatus() == SaleStatus.VOIDED) {
            throw new SaleAlreadyVoidedException(id);
        }

        // Placeholder: unit 5 replaces this line with the Sale->VOIDED flip, voidReason
        // assignment, Plot->AVAILABLE flip, and LedgerEntry reversal (source spec flow
        // steps 3-6).
        throw new UnsupportedOperationException(
            "Sale void happy path is not yet implemented (Sales unit 5)");
    }
```

No new import is needed — `java.util.UUID` is already imported in `SaleService.java`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=SaleServiceTest test`
Expected: PASS — all `SaleServiceTest` tests, including the three new ones, green.

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleNotFoundException.java \
        backend/src/main/java/com/plotchain/sales/SaleAlreadyVoidedException.java \
        backend/src/main/java/com/plotchain/sales/VoidSaleRequest.java \
        backend/src/main/java/com/plotchain/sales/SaleService.java \
        backend/src/test/java/com/plotchain/sales/SaleServiceTest.java
git commit -m "feat(sales): add SaleService.voidSale() reject-path guards"
```

---

### Task 2: `SaleController` endpoint + `SalesExceptionHandler` mappings

**Files:**
- Modify: `backend/src/main/java/com/plotchain/sales/SaleController.java:24-25` (insert new endpoint between the closing `}` of `record()` and the class's closing `}`)
- Modify: `backend/src/main/java/com/plotchain/sales/SalesExceptionHandler.java:23-24` (insert two new handlers between the closing `}` of `handlePlotNotAvailable()` and the class's closing `}`)
- Test: `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`

**Interfaces:**
- Consumes: `SaleService.voidSale(UUID id, VoidSaleRequest request)`, `SaleNotFoundException`, `SaleAlreadyVoidedException`, `VoidSaleRequest` from Task 1.
- Produces: `POST /api/admin/sales/{id}/void` (200 with `SaleResponse` body on success — not exercised by this unit's tests since the happy path isn't implemented yet; 404 on `SaleNotFoundException`; 409 on `SaleAlreadyVoidedException`). Task 3 consumes this route path.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/sales/SaleControllerTest.java`, immediately before the final closing `}` of the class (after `recordReturns201WithAFullyPopulatedSaleResponse`):

```java
    @Test
    void voidReturns404WhenTheSaleDoesNotExist() throws Exception {
        UUID saleId = UUID.randomUUID();
        when(saleService.voidSale(eq(saleId), any(VoidSaleRequest.class)))
            .thenThrow(new SaleNotFoundException(saleId));

        mockMvc.perform(post("/api/admin/sales/{id}/void", saleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void voidReturns409WhenTheSaleIsAlreadyVoided() throws Exception {
        UUID saleId = UUID.randomUUID();
        when(saleService.voidSale(eq(saleId), any(VoidSaleRequest.class)))
            .thenThrow(new SaleAlreadyVoidedException(saleId));

        mockMvc.perform(post("/api/admin/sales/{id}/void", saleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isConflict());
    }

    @Test
    void voidIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/sales/{id}/void", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().isForbidden());
    }
```

Add one new static import at the top of `SaleControllerTest.java`, alongside the existing `import static org.mockito.ArgumentMatchers.any;`:

```java
import static org.mockito.ArgumentMatchers.eq;
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=SaleControllerTest test`
Expected: FAIL to compile — `saleService.voidSale(...)` doesn't exist on the controller-visible surface yet, and `POST /api/admin/sales/{id}/void` doesn't exist, so `voidIsForbiddenForAnAssociateToken` would also fail (404 from no handler, not 403 — though the other two won't even compile first).

- [ ] **Step 3: Add the endpoint to `SaleController.java`**

Insert between the closing `}` of `record()` (line 24) and the class's closing `}` (line 25):

```java
    @PostMapping("/{id}/void")
    public ResponseEntity<SaleResponse> voidSale(
            @PathVariable UUID id, @RequestBody VoidSaleRequest request) {
        return ResponseEntity.ok(saleService.voidSale(id, request));
    }
```

Add two new imports at the top of `SaleController.java`, alongside the existing ones:

```java
import org.springframework.web.bind.annotation.PathVariable;

import java.util.UUID;
```

- [ ] **Step 4: Add the exception mappings to `SalesExceptionHandler.java`**

Insert between the closing `}` of `handlePlotNotAvailable()` (line 23) and the class's closing `}` (line 24):

```java
    @ExceptionHandler(SaleNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleSaleNotFound(SaleNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(SaleAlreadyVoidedException.class)
    public ResponseEntity<Map<String, String>> handleSaleAlreadyVoided(SaleAlreadyVoidedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

No new imports needed — `HttpStatus`, `ResponseEntity`, `Map` are already imported.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=SaleControllerTest test`
Expected: PASS — all `SaleControllerTest` tests, including the three new ones, green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/sales/SaleController.java \
        backend/src/main/java/com/plotchain/sales/SalesExceptionHandler.java \
        backend/src/test/java/com/plotchain/sales/SaleControllerTest.java
git commit -m "feat(sales): add POST /api/admin/sales/{id}/void controller and exception mappings"
```

---

### Task 3: ADMIN-only `SecurityConfig` matcher for the void route

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java:94-96` (insert new matcher between the existing `POST /api/admin/sales` matcher and the blanket `POST /api/**` rule)
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `POST /api/admin/sales/{id}/void` route from Task 2; `SaleNotFoundException` → 404 mapping from Task 2 (this task's test relies on that mapping to distinguish "passed security, hit the real empty H2 `sale` table, 404'd" from "blocked at the security layer, 403").
- Produces: nothing consumed by a later task — this is the last task in this unit.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, immediately before the final `kycDecisionIsForbiddenForASupportToken` test (i.e. after `adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`):

```java
    // Sales unit 4: POST /api/admin/sales/{id}/void is ADMIN-only, the same target-role-model
    // pattern as POST /api/admin/sales directly above and /api/admin/cycles/*/close further up.
    // A random, non-existent saleId reaches the real (H2, unmocked) SaleRepository and 404s for
    // the ADMIN token -- proof the request passed the security layer, not proof of any
    // particular business outcome, same "assert not 403" reasoning as
    // passwordChangeIsReachableByAnAssociateToken below. Every other role, including the
    // soon-to-be-deleted admin-family sub-roles, is blocked at the filter layer before the
    // controller ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminSalesVoidIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        mockMvc.perform(post("/api/admin/sales/{id}/void", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{\"reason\":\"Buyer backed out\"}"))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }
```

No new imports needed — `post`, `status`, `ParameterizedTest`, `EnumSource`, `AssociateRole`, `UUID` are all already imported in this file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest test`
Expected: FAIL — without the new matcher, the void route falls through to the blanket `POST /api/**` rule, which grants access to every admin-family role (`FINANCE`, `KYC_REVIEWER`, `SUPPORT`, `SUPER_ADMIN`), not just `ADMIN`, so those roles get 404 instead of the expected 403.

- [ ] **Step 3: Add the matcher to `SecurityConfig.java`**

Insert between the closing of the existing `POST /api/admin/sales` matcher (ending `.hasAuthority("ADMIN")` at line 95) and the blanket `POST /api/**` rule (line 96):

```java
                // Void a sale: ADMIN-only, per Sales unit 4
                // (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
                // Decision 8 and the Testing section: "record/void/register are ADMIN-only"),
                // same target-role-model reasoning as the record-a-sale matcher directly above.
                // Declared here, before the blanket POST rule, for the same first-match-wins
                // reason documented on that matcher -- a narrower POST rule declared after the
                // blanket rule below would never be reached. This unit's own scope is guards
                // only (unknown or already-voided Sale rejected with no side effects); Sales
                // unit 5's actual reversal reuses this same matcher, no security change needed
                // when that unit lands.
                .requestMatchers(HttpMethod.POST, "/api/admin/sales/*/void")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest test`
Expected: PASS — `adminSalesVoidIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` green for all six `AssociateRole` values.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS — no regressions in any other test class (in particular `SaleServiceTest`, `SaleControllerTest`, `SaleRecordConcurrencyTest`, and the rest of `SecurityConfigTest`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(sales): make POST /api/admin/sales/{id}/void ADMIN-only"
```
