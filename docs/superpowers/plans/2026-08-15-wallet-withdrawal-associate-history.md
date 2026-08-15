# Wallet/Withdrawal Unit 9 — Associate Own Withdrawal History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/associates/me/withdrawals` (any authenticated associate), a paginated, filterable self-scoped withdrawal-request history, reusing `WithdrawalRequestRepository.search(...)` unmodified by passing the caller's own id where unit 6's admin queue passes the admin-supplied filter.

**Architecture:** New `AssociateWithdrawalController` — a bare `@RestController` with one full-path `@GetMapping`, not a method added to the existing `WithdrawalController` (whose class-level `@RequestMapping("/api/admin/withdrawals")` would make an absolute method path compose incorrectly). It calls a new `WithdrawalService.myList(...)` sibling to the existing `adminList(...)`, both backed by the same `WithdrawalRequestRepository.search(associateId, status, Pageable)` unit 6 already built generically enough for this reuse. Response shape is a new pair of records, `AssociateWithdrawalResponse`/`AssociateWithdrawalPageResponse`, deliberately without `associateId`/`associateUserId`/`associateName` fields since every row is always the caller's own — no batch-associate-lookup helper needed at all (a difference from `adminList`, which does the batch lookup). This exactly mirrors the `income` package's established split: `LedgerController` (admin, class-level `@RequestMapping`) / `AssociateLedgerController` (bare, full-path `@GetMapping`) sharing one `LedgerService`, and `AdminLedgerEntryResponse` / `AssociateLedgerEntryResponse` as two purpose-built response types rather than one shared type with nulled-out fields.

**Tech Stack:** Spring Boot (Spring MVC `@RestController`, `@AuthenticationPrincipal`), JUnit 5 + Mockito (`@ExtendWith(MockitoExtension.class)`) for the service test, `@SpringBootTest` + `MockMvc` + real JWT (`JwtService`) for the controller test and the `SecurityConfigTest` reachability addition — matching the patterns already used in `income.AssociateLedgerControllerTest`/`income.LedgerServiceTest` and `withdrawal.WithdrawalServiceTest`/`withdrawal.WithdrawalControllerTest`.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (§ "Own withdrawal history — `GET /api/associates/me/withdrawals`, any authenticated associate", Decision 14). Unit definition: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`, unit 9.

## Global Constraints

- `associateId` comes from `@AuthenticationPrincipal` only — never a request parameter; passing `associateId` on the query string is silently ignored (no matching `@RequestParam` to bind to), the same guarantee `AssociateLedgerController` already provides.
- `status` (optional), `page`/`size` filters, same clamp shape as unit 6: `page = Math.max(page, 0); size = Math.min(size, 100);` in the controller, default `page=0`/`size=20`.
- Response is `AssociateWithdrawalPageResponse` of `AssociateWithdrawalResponse` rows — **no** `associateId`/`associateUserId`/`associateName` fields (Decision 14).
- Never returns another associate's rows regardless of filter values passed — enforced by construction (the id is never taken from the request), proven by a test that passes a different `associateId` on the query string and asserts it's ignored.
- Reachable by any authenticated associate token, no ADMIN restriction; unauthenticated → 401. No new `SecurityConfig` matcher — a bare GET never collides with the blanket POST/PUT/PATCH/DELETE write rules, so it falls through to `anyRequest().authenticated()`, same as `GET /api/associates/me/ledger` and `GET /api/associates/me/wallet`.
- Reuses `WithdrawalRequestRepository.search(UUID associateId, WithdrawalRequestStatus status, Pageable)` unmodified — no new repository method, no migration.

---

## File Structure

- **Create** `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalResponse.java` — the self-view row record (no associate-identity fields).
- **Create** `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalPageResponse.java` — the page wrapper record.
- **Modify** `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java` — add `myList(UUID associateId, WithdrawalRequestStatus status, int page, int size)` and a private `toAssociateResponse(WithdrawalRequest)` mapper.
- **Create** `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalController.java` — the bare `@RestController` with `GET /api/associates/me/withdrawals`.
- **Modify** `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java` — add `myList(...)` tests.
- **Create** `backend/src/test/java/com/plotchain/withdrawal/AssociateWithdrawalControllerTest.java` — 200/filters/empty/clamping/ignored-query-param/401 cases, mirroring `income.AssociateLedgerControllerTest`.
- **Modify** `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add `associateMeWithdrawalsIsReachableByAnAssociateToken`, mirroring the existing `associateMeLedgerIsReachableByAnAssociateToken`/`associateMeWalletIsReachableByAnAssociateToken` tests.

No migration, no new exception type, no change to `WithdrawalController`/`WithdrawalRequestRepository`/`AdminWithdrawalResponse`/`AdminWithdrawalPageResponse`, no `SecurityConfig.java` change.

---

## Task 1: `WithdrawalService.myList(...)` and the associate-self response DTOs

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalResponse.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalPageResponse.java`
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`

**Interfaces:**
- Consumes: `WithdrawalRequestRepository.search(UUID associateId, WithdrawalRequestStatus status, Pageable pageable): Page<WithdrawalRequest>` (existing, from unit 6 — no changes).
- Produces: `AssociateWithdrawalPageResponse myList(UUID associateId, WithdrawalRequestStatus status, int page, int size)` on `WithdrawalService` — consumed by Task 2's `AssociateWithdrawalController`.
- Produces: `record AssociateWithdrawalResponse(UUID id, BigDecimal amount, WithdrawalRequestStatus status, String reason, String bankReference, Instant requestedAt, Instant decidedAt, Instant disbursedAt)`.
- Produces: `record AssociateWithdrawalPageResponse(List<AssociateWithdrawalResponse> requests, int page, int size, long totalElements)`.

- [ ] **Step 1: Write the failing service tests**

Add to `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`, directly after the existing `adminListReturnsAnEmptyPageWhenSearchFindsNothing` test (around line 288, before `decideThrowsWhenTheRequestIsUnknown`):

```java
    // Flow "Own withdrawal history" (Decision 14; unit 9's associate-self equivalent of
    // adminListReturnsAPageMappedToResponsesWithBatchResolvedAssociateFields above): myList
    // reuses the exact same search() call as adminList, but maps to AssociateWithdrawalResponse
    // (no associate-identity fields) and does no associate batch-lookup at all -- every row is
    // always the caller's own, so there's nothing to resolve.
    @Test
    void myListReturnsAPageMappedToResponsesWithNoAssociateIdentityFields() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);

        when(withdrawalRequestRepository.search(eq(ASSOCIATE_ID), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 20), 1));

        AssociateWithdrawalPageResponse response = withdrawalService.myList(ASSOCIATE_ID, null, 0, 20);

        assertThat(response.totalElements()).isEqualTo(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.requests()).hasSize(1);
        AssociateWithdrawalResponse row = response.requests().get(0);
        assertThat(row.id()).isEqualTo(requestId);
        assertThat(row.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(row.amount()).isEqualByComparingTo("1000.00");
        verifyNoInteractions(associateRepository);
    }

    // Proves associateId is always passed through non-null (the caller's own id) alongside the
    // status filter -- this is the "own requests only" guarantee at the service layer. A
    // different associateId is never accepted as a parameter here at all (the caller-scoping
    // itself is Task 2's controller-layer guarantee); this test only proves the value that does
    // arrive is threaded straight through to search() unchanged.
    @Test
    void myListAlwaysPassesTheCallersAssociateIdAndTheStatusFilterThroughToSearchUnchanged() {
        when(withdrawalRequestRepository.search(
            eq(ASSOCIATE_ID), eq(WithdrawalRequestStatus.DISBURSED), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        withdrawalService.myList(ASSOCIATE_ID, WithdrawalRequestStatus.DISBURSED, 0, 20);

        verify(withdrawalRequestRepository).search(
            eq(ASSOCIATE_ID), eq(WithdrawalRequestStatus.DISBURSED), eq(PageRequest.of(0, 20)));
    }

    @Test
    void myListReturnsAnEmptyPageWhenSearchFindsNothing() {
        when(withdrawalRequestRepository.search(eq(ASSOCIATE_ID), isNull(), eq(PageRequest.of(0, 20))))
            .thenReturn(new PageImpl<>(List.of()));

        AssociateWithdrawalPageResponse response = withdrawalService.myList(ASSOCIATE_ID, null, 0, 20);

        assertThat(response.requests()).isEmpty();
        assertThat(response.totalElements()).isZero();
    }
```

This will not compile yet — `AssociateWithdrawalPageResponse`, `AssociateWithdrawalResponse`, and `WithdrawalService.myList(...)` don't exist. `verifyNoInteractions` is already statically imported in this file (used elsewhere in the class); no import changes needed.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn test -Dtest=WithdrawalServiceTest -q`
Expected: compile error — `cannot find symbol: class AssociateWithdrawalPageResponse` (or `AssociateWithdrawalResponse`, or `method myList`).

- [ ] **Step 3: Create the response DTOs**

Create `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalResponse.java`:

```java
package com.plotchain.withdrawal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// Wallet/withdrawal unit 9 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 14): mirrors income.AssociateLedgerEntryResponse's pattern -- a separate record from
// AdminWithdrawalResponse, not one shared type with associate-identity fields nulled out.
// Deliberately carries NO associateId/associateUserId/associateName fields: every row returned
// by GET /api/associates/me/withdrawals is always the caller's own, so echoing an associate
// identity back would be redundant at best and misleading at worst.
public record AssociateWithdrawalResponse(
    UUID id,
    BigDecimal amount,
    WithdrawalRequestStatus status,
    String reason,
    String bankReference,
    Instant requestedAt,
    Instant decidedAt,
    Instant disbursedAt
) {}
```

Create `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalPageResponse.java`:

```java
package com.plotchain.withdrawal;

import java.util.List;

// Wallet/withdrawal unit 9: same page-wrapper shape as AdminWithdrawalPageResponse, field named
// "requests" to match that sibling's vocabulary (mirrors how income.AssociateLedgerPageResponse
// follows income.AdminLedgerPageResponse's "entries" field name).
public record AssociateWithdrawalPageResponse(
    List<AssociateWithdrawalResponse> requests, int page, int size, long totalElements) {}
```

- [ ] **Step 4: Add `myList(...)` to `WithdrawalService`**

In `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`, add this method directly after `adminList(...)` (before the `decide(...)` Javadoc-comment block):

```java
    // Flow "Own withdrawal history" (Decision 14): associateId is always the caller's own id,
    // supplied by AssociateWithdrawalController from @AuthenticationPrincipal -- never null,
    // never taken from a request parameter. Reuses the exact same search() call as adminList()
    // above, passing the caller's id where that method passes the admin-supplied filter -- no
    // new repository method, per unit 6's forward-compatibility note on
    // WithdrawalRequestRepository.search. No associate batch-lookup here at all: every row
    // belongs to the caller, so there's nothing to resolve (unlike adminList, which needs
    // associatesById() for cross-associate rows).
    public AssociateWithdrawalPageResponse myList(UUID associateId, WithdrawalRequestStatus status, int page, int size) {
        Page<WithdrawalRequest> result = withdrawalRequestRepository.search(
            associateId, status, PageRequest.of(page, size));

        List<AssociateWithdrawalResponse> rows = result.getContent().stream()
            .map(this::toAssociateResponse)
            .toList();
        return new AssociateWithdrawalPageResponse(rows, page, size, result.getTotalElements());
    }
```

Add this private helper directly after the existing `toResponse(WithdrawalRequest, Associate)` method (at the end of the class, before the closing brace):

```java
    private AssociateWithdrawalResponse toAssociateResponse(WithdrawalRequest withdrawalRequest) {
        return new AssociateWithdrawalResponse(
            withdrawalRequest.getId(),
            withdrawalRequest.getAmount(),
            withdrawalRequest.getStatus(),
            withdrawalRequest.getReason(),
            withdrawalRequest.getBankReference(),
            withdrawalRequest.getRequestedAt(),
            withdrawalRequest.getDecidedAt(),
            withdrawalRequest.getDisbursedAt());
    }
```

No new imports are needed in `WithdrawalService.java` — `Page`, `PageRequest`, `List`, and `UUID` are already imported for `adminList(...)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=WithdrawalServiceTest -q`
Expected: PASS, including the three new `myList*` tests and every pre-existing test in the class (`adminList*`, `decide*`, `disburse*`, `submitRequest*`).

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalResponse.java \
        backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalPageResponse.java \
        backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java \
        backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java
git commit -m "feat(withdrawal): add WithdrawalService.myList for associate self-history"
```

---

## Task 2: `AssociateWithdrawalController` — `GET /api/associates/me/withdrawals`

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalController.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/AssociateWithdrawalControllerTest.java`

**Interfaces:**
- Consumes: `WithdrawalService.myList(UUID associateId, WithdrawalRequestStatus status, int page, int size): AssociateWithdrawalPageResponse` (Task 1).
- Produces: `GET /api/associates/me/withdrawals` — no new interface consumed by later tasks (this is the last backend task in this unit).

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/withdrawal/AssociateWithdrawalControllerTest.java`:

```java
package com.plotchain.withdrawal;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// MockMvc + real JWT via JwtService, mirroring income.AssociateLedgerControllerTest's shape --
// the real Spring Security filter chain runs, so this also proves the 401 case end to end.
// SecurityConfigTest additionally covers reachability by an ordinary associate token; this file
// focuses on this controller's own request/response shape and the "always the caller's own id"
// guarantee.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateWithdrawalControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean WithdrawalService withdrawalService;

    // Unlike a role-only tokenFor(role) (which mints a random associateId per call), this test
    // needs to know the associateId ahead of time -- it's how we prove
    // AssociateWithdrawalController resolves the caller's OWN id from the JWT, not from a
    // request parameter (this endpoint accepts none).
    private String tokenFor(AssociateRole role, UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(role);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getMyWithdrawalsReturns200WithFiltersAndTheCallersOwnAssociateId() throws Exception {
        UUID associateId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        AssociateWithdrawalResponse row = new AssociateWithdrawalResponse(
            requestId, new BigDecimal("1000.00"), WithdrawalRequestStatus.DISBURSED,
            null, "BANK-REF-001", Instant.now(), Instant.now(), Instant.now());
        AssociateWithdrawalPageResponse page = new AssociateWithdrawalPageResponse(List.of(row), 0, 20, 1);
        when(withdrawalService.myList(eq(associateId), eq(WithdrawalRequestStatus.DISBURSED), eq(0), eq(20)))
            .thenReturn(page);

        mockMvc.perform(get("/api/associates/me/withdrawals")
                .param("status", "DISBURSED")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requests[0].id").value(requestId.toString()))
            .andExpect(jsonPath("$.requests[0].status").value("DISBURSED"))
            .andExpect(jsonPath("$.requests[0].bankReference").value("BANK-REF-001"))
            .andExpect(jsonPath("$.requests[0].associateId").doesNotExist())
            .andExpect(jsonPath("$.requests[0].associateUserId").doesNotExist())
            .andExpect(jsonPath("$.requests[0].associateName").doesNotExist())
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void getMyWithdrawalsReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(withdrawalService.myList(eq(associateId), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateWithdrawalPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.requests").isEmpty())
            .andExpect(jsonPath("$.totalElements").value(0));
    }

    // Proves the endpoint has no associateId request parameter at all: passing one is simply
    // ignored by Spring MVC (no matching @RequestParam to bind to), so the service is still
    // called with the JWT-derived id, never the query-string value. This is the acceptance
    // criterion "never returns another associate's rows regardless of filter values passed."
    @Test
    void getMyWithdrawalsIgnoresAnAssociateIdQueryParameterIfOnePassed() throws Exception {
        UUID callerId = UUID.randomUUID();
        UUID otherAssociateId = UUID.randomUUID();
        when(withdrawalService.myList(eq(callerId), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateWithdrawalPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/withdrawals")
                .param("associateId", otherAssociateId.toString())
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, callerId)))
            .andExpect(status().isOk());

        verify(withdrawalService).myList(eq(callerId), isNull(), eq(0), eq(20));
    }

    @Test
    void getMyWithdrawalsClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(withdrawalService.myList(eq(associateId), isNull(), eq(0), eq(100)))
            .thenReturn(new AssociateWithdrawalPageResponse(List.of(), 0, 100, 0));

        mockMvc.perform(get("/api/associates/me/withdrawals").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk());

        verify(withdrawalService).myList(eq(associateId), isNull(), eq(0), eq(100));
    }

    @Test
    void getMyWithdrawalsClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(withdrawalService.myList(eq(associateId), isNull(), eq(0), eq(20)))
            .thenReturn(new AssociateWithdrawalPageResponse(List.of(), 0, 20, 0));

        mockMvc.perform(get("/api/associates/me/withdrawals").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, associateId)))
            .andExpect(status().isOk());

        verify(withdrawalService).myList(eq(associateId), isNull(), eq(0), eq(20));
    }

    @Test
    void getMyWithdrawalsReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/withdrawals"))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=AssociateWithdrawalControllerTest -q`
Expected: compile error / context load failure — `AssociateWithdrawalController` (and its route) doesn't exist yet, so `GET /api/associates/me/withdrawals` isn't mapped.

- [ ] **Step 3: Create `AssociateWithdrawalController`**

Create `backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalController.java`:

```java
package com.plotchain.withdrawal;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Wallet/withdrawal unit 9 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Own withdrawal history -- GET /api/associates/me/withdrawals, any authenticated associate"): a
// bare @RestController with one route, same shape as income.AssociateLedgerController and
// sales.AssociateSaleController -- not added to WithdrawalController, whose class-level
// @RequestMapping("/api/admin/withdrawals") would make an absolute-path method mapping here
// compose incorrectly (Spring concatenates class + method paths rather than treating a leading
// "/" as an override).
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated()
// the same way GET /api/associates/me/ledger and GET /api/associates/me/wallet already do with
// no matcher of their own.
@RestController
public class AssociateWithdrawalController {

    private final WithdrawalService withdrawalService;

    public AssociateWithdrawalController(WithdrawalService withdrawalService) {
        this.withdrawalService = withdrawalService;
    }

    // Self-scoped by construction: the target associate comes from the verified JWT, never from
    // the request -- there is no associateId request parameter on this method at all, so no
    // caller can view another associate's withdrawal history through this route.
    @GetMapping("/api/associates/me/withdrawals")
    public AssociateWithdrawalPageResponse getMyWithdrawals(
            @AuthenticationPrincipal UUID associateId,
            @RequestParam(required = false) WithdrawalRequestStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return withdrawalService.myList(associateId, status, page, size);
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=AssociateWithdrawalControllerTest -q`
Expected: PASS, all six tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/withdrawal/AssociateWithdrawalController.java \
        backend/src/test/java/com/plotchain/withdrawal/AssociateWithdrawalControllerTest.java
git commit -m "feat(withdrawal): add GET /api/associates/me/withdrawals for associate self-history"
```

---

## Task 3: `SecurityConfigTest` reachability proof

**Files:**
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `GET /api/associates/me/withdrawals` (Task 2). No `SecurityConfig.java` change — this task only adds a proving test.

- [ ] **Step 1: Write the failing security test**

Add to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, directly after the existing `associateMeWalletIsReachableByAnAssociateToken` test (around line 665):

```java
    // Wallet/Withdrawal unit 9 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "Own withdrawal history -- GET /api/associates/me/withdrawals, any authenticated
    // associate"): needs no explicit SecurityConfig matcher -- a bare GET never collides with the
    // blanket POST/PUT/PATCH/DELETE write rules above, so it falls through to
    // anyRequest().authenticated() below, the same way GET /api/associates/me/ledger and GET
    // /api/associates/me/wallet already do with no matcher of their own. This test proves the
    // route is reachable by an ordinary associate token, not accidentally blocked by 403.
    //
    // WithdrawalRequestRepository is not @MockBean'd in this class (same "GET /api/admin/withdrawals
    // reaches the real, unmocked-here H2 DB" convention already established further up in this
    // file), so search() runs for real against the empty H2 test DB and returns an empty page --
    // the request reaches a clean 200 with no further stubbing needed, same reasoning as
    // associateMeLedgerIsReachableByAnAssociateToken above.
    @Test
    void associateMeWithdrawalsIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=SecurityConfigTest#associateMeWithdrawalsIsReachableByAnAssociateToken -q`
Expected: FAIL with 404 (route doesn't exist) if Task 2 hasn't landed yet in this test run's classpath. If Tasks 1–2 are already committed (the expected order when executing this plan sequentially), this test should already pass on the first run — in that case, skip ahead to Step 3's verification and confirm it passes rather than expecting red-then-green; do not skip writing the test itself.

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=SecurityConfigTest -q`
Expected: PASS, including the new test and every pre-existing test in the class.

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(auth): prove GET /api/associates/me/withdrawals is reachable by an associate token"
```

---

## Final verification

- [ ] Run the full backend suite: `cd backend && mvn test -q`
- Expected: all tests pass. (Per the JDK/Mockito environment note in project memory, a JDK21/25 mismatch on this machine produces ~55 spurious Mockito errors unrelated to any code change — if those specific pre-existing failures appear, they are not caused by this plan's changes; confirm no *new* failures beyond that known baseline.)
