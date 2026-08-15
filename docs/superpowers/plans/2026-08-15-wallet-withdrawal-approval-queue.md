# Wallet/Withdrawal Unit 6 — Admin Approval Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/admin/withdrawals` (ADMIN-only), a paginated, filterable approval-queue listing over `withdrawal_request`, reusing the batch-associate-resolution pattern the income-ledger domain already established.

**Architecture:** Add a `search(associateId, status, Pageable)` query method to the existing (currently empty) `WithdrawalRequestRepository`, a new `adminList(...)` method on the existing `WithdrawalService`, and a new `GET` handler on the existing `WithdrawalController` — no new classes for the query/service/controller layer, only two new small response-shape files (`AdminWithdrawalPageResponse`) plus a small edit to the existing `AdminWithdrawalResponse` row-mapping helper to tolerate a batch-lookup miss. Shape is copied directly from `income`'s `LedgerEntryRepository.search` / `LedgerService.adminList` / `LedgerController.list`, which this repo's spec-slicer plan explicitly names as precedent.

**Tech Stack:** Spring Boot (Spring Data JPA `@Query` with named parameters), Spring MVC `@RestController`, JUnit 5 + Mockito (`@ExtendWith(MockitoExtension.class)`) for service tests, `@DataJpaTest` for repository tests, `@SpringBootTest` + `MockMvc` + real JWT (`JwtService`) for controller tests — all matching the patterns already used in this package (`WithdrawalServiceTest`, `WithdrawalRequestRepositoryTest`, `WithdrawalControllerTest`) and in `income` (`LedgerServiceTest`, `LedgerEntryRepositoryTest`, `LedgerControllerTest`).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (§ "Approval queue — `GET /api/admin/withdrawals`, ADMIN-only", Decision 14). Unit definition: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`, unit 6.

## Global Constraints

- ADMIN-only: non-ADMIN token → 403; unauthenticated → 401 (spec Testing section; matches every other `/api/admin/*` GET in this codebase).
- `page`/`size` clamped 0–100, default 0/20 — **exact same clamp shape as `GET /api/admin/ledger`**: `page = Math.max(page, 0); size = Math.min(size, 100);` in the controller, no lower-bound clamp on `size` (an explicit `size=0` is passed through unclamped, matching existing `LedgerController` behavior — not a bug to fix in this unit).
- `associateId` and `status` filter independently and in combination, both optional, using the repo's established null-safe `(:param IS NULL OR ...)` JPQL shape (`LedgerEntryRepository.search`, `AssociateRepository.searchDirectory`).
- Response rows batch-resolve `associateUserId`/`associateName` via `associateRepository.findAllById` over the distinct associate ids in the page — never a per-row lookup.
- **Forward compatibility for unit 7 (decision endpoint)**: this unit only adds a `GET` method to `WithdrawalController`/`WithdrawalService` — it must not introduce any assumption (e.g. a single combined DTO, a single "all withdrawal operations" exception type) that would make adding a third method (`POST /api/admin/withdrawals/{id}/decision`) awkward. Concretely: no changes to `WithdrawalExceptionHandler`, no changes to `CreateWithdrawalRequest`, no changes to `submitRequest`'s behavior.
- **Forward compatibility for unit 9 (associate history)**: `WithdrawalRequestRepository.search(...)` must accept a nullable `associateId` the same way `LedgerEntryRepository.search` does, so unit 9's future `WithdrawalService.myWithdrawals(...)` can call this exact method passing the caller's own id where this unit passes the admin-supplied filter — **no new repository method for unit 9's history endpoint**, mirroring `LedgerEntryRepository.search`'s reuse by both `LedgerService.adminList` and `LedgerService.myList`.

---

## File Structure

- **Modify** `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java` — add `search(UUID associateId, WithdrawalRequestStatus status, Pageable): Page<WithdrawalRequest>`.
- **Create** `backend/src/main/java/com/plotchain/withdrawal/AdminWithdrawalPageResponse.java` — the page wrapper record.
- **Modify** `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java` — add `adminList(...)`, a private `associatesById(...)` batch-lookup helper, and make the existing `toResponse(WithdrawalRequest, Associate)` null-tolerant on the `Associate` parameter (mirrors `LedgerService.toAdminResponse`'s "leave field null on a lookup miss" behavior; harmless for the existing `submitRequest` caller, which always passes a non-null, just-fetched `Associate`).
- **Modify** `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java` — add the `GET` handler.
- **Modify** `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add an explicit `GET /api/admin/withdrawals` → `.hasAuthority("ADMIN")` matcher (a bare GET never collides with the blanket POST/PUT/PATCH/DELETE rules, so there's no first-match-wins placement constraint — grouped next to the existing `GET /api/admin/ledger` matcher for readability, same as that matcher's own comment describes for its neighbors).
- **Modify** `backend/src/test/java/com/plotchain/withdrawal/WithdrawalRequestRepositoryTest.java` — add `search(...)` tests.
- **Modify** `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java` — add `adminList(...)` tests.
- **Modify** `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java` — add `list` endpoint tests (200/filters/empty/clamping/403/401).

No migration, no new exception type, no change to `CreateWithdrawalRequest`/`AdminWithdrawalResponse`'s field shape (only its null-tolerance internally), no change to `WithdrawalExceptionHandler`.

---

## Task 1: `WithdrawalRequestRepository.search(...)`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalRequestRepositoryTest.java`

**Interfaces:**
- Produces: `Page<WithdrawalRequest> search(UUID associateId, WithdrawalRequestStatus status, Pageable pageable)` — consumed by Task 2's `WithdrawalService.adminList`, and (in a future unit 9) by an associate-history method that always passes its own id as `associateId`.

- [ ] **Step 1: Write the failing repository tests**

Add to `backend/src/test/java/com/plotchain/withdrawal/WithdrawalRequestRepositoryTest.java`, after the existing three tests (add `org.springframework.data.domain.Page`, `org.springframework.data.domain.PageRequest`, `java.util.List` to the imports):

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.util.List;
```

```java
// Wallet/withdrawal unit 6 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Approval queue -- GET /api/admin/withdrawals"): same null-safe "(:param IS NULL OR ...)"
// pattern as LedgerEntryRepository.search's own test -- proves associateId and status filter
// independently and in combination.
@Test
void searchFiltersByAssociateIdAndStatusIndependentlyAndInCombination() {
    Associate associateA = seedAssociate();
    Associate associateB = seedAssociate();
    WithdrawalRequest requested = withdrawalRequestRepository.saveAndFlush(
        requestFor(associateA.getId(), new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED));
    WithdrawalRequest approved = withdrawalRequestRepository.saveAndFlush(
        requestFor(associateA.getId(), new BigDecimal("500.00"), WithdrawalRequestStatus.APPROVED));
    WithdrawalRequest otherAssociate = withdrawalRequestRepository.saveAndFlush(
        requestFor(associateB.getId(), new BigDecimal("200.00"), WithdrawalRequestStatus.REQUESTED));

    Page<WithdrawalRequest> byAssociate = withdrawalRequestRepository.search(
        associateA.getId(), null, PageRequest.of(0, 20));
    assertThat(byAssociate.getContent()).extracting(WithdrawalRequest::getId)
        .containsExactlyInAnyOrder(requested.getId(), approved.getId());

    Page<WithdrawalRequest> byStatus = withdrawalRequestRepository.search(
        null, WithdrawalRequestStatus.REQUESTED, PageRequest.of(0, 20));
    assertThat(byStatus.getContent()).extracting(WithdrawalRequest::getId)
        .containsExactlyInAnyOrder(requested.getId(), otherAssociate.getId());

    Page<WithdrawalRequest> byBoth = withdrawalRequestRepository.search(
        associateA.getId(), WithdrawalRequestStatus.APPROVED, PageRequest.of(0, 20));
    assertThat(byBoth.getContent()).extracting(WithdrawalRequest::getId)
        .containsExactly(approved.getId());

    Page<WithdrawalRequest> unfiltered = withdrawalRequestRepository.search(
        null, null, PageRequest.of(0, 20));
    assertThat(unfiltered.getContent()).hasSize(3);
}

// Same ordering/pagination proof as LedgerEntryRepository.search's own test, using
// requestedAt (WithdrawalRequest's equivalent of LedgerEntry's createdAt) as the sort key.
@Test
void searchOrdersByRequestedAtDescendingAndPaginatesCorrectly() {
    Associate associate = seedAssociate();
    WithdrawalRequest earlier = requestFor(associate.getId(), new BigDecimal("100.00"), WithdrawalRequestStatus.REQUESTED);
    earlier.setRequestedAt(Instant.parse("2026-01-10T00:00:00Z"));
    withdrawalRequestRepository.saveAndFlush(earlier);
    WithdrawalRequest later = requestFor(associate.getId(), new BigDecimal("200.00"), WithdrawalRequestStatus.REQUESTED);
    later.setRequestedAt(Instant.parse("2026-01-20T00:00:00Z"));
    withdrawalRequestRepository.saveAndFlush(later);
    WithdrawalRequest latest = requestFor(associate.getId(), new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
    latest.setRequestedAt(Instant.parse("2026-01-30T00:00:00Z"));
    withdrawalRequestRepository.saveAndFlush(latest);

    Page<WithdrawalRequest> firstPage = withdrawalRequestRepository.search(null, null, PageRequest.of(0, 2));
    assertThat(firstPage.getContent()).extracting(WithdrawalRequest::getId)
        .containsExactly(latest.getId(), later.getId());
    assertThat(firstPage.getTotalElements()).isEqualTo(3);

    Page<WithdrawalRequest> secondPage = withdrawalRequestRepository.search(null, null, PageRequest.of(1, 2));
    assertThat(secondPage.getContent()).extracting(WithdrawalRequest::getId)
        .containsExactly(earlier.getId());
}

@Test
void searchReturnsAnEmptyPageWhenNoRequestMatchesTheGivenFilters() {
    seedAssociate();

    Page<WithdrawalRequest> result = withdrawalRequestRepository.search(
        UUID.randomUUID(), null, PageRequest.of(0, 20));

    assertThat(result.getContent()).isEmpty();
    assertThat(result.getTotalElements()).isZero();
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=WithdrawalRequestRepositoryTest test`
Expected: FAIL — `cannot find symbol: method search(UUID,WithdrawalRequestStatus,Pageable)` (compile error, since the method doesn't exist yet).

- [ ] **Step 3: Implement `search(...)`**

Replace the full contents of `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java`:

```java
package com.plotchain.withdrawal;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

// Wallet/withdrawal unit 5: this unit only needed save()/findById(), both inherited from
// JpaRepository.
//
// Wallet/withdrawal unit 6 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Approval queue -- GET /api/admin/withdrawals", Decision 14): search(...) below is the
// approval-queue query, deliberately built generically enough (a nullable associateId, exactly
// like LedgerEntryRepository.search) that unit 9's associate-self history endpoint can reuse it
// unmodified, passing the caller's own id where this unit passes the admin-supplied filter. Same
// null-safe "(:param IS NULL OR ...)" JPQL shape as LedgerEntryRepository.search /
// AssociateRepository.searchDirectory.
public interface WithdrawalRequestRepository extends JpaRepository<WithdrawalRequest, UUID> {

    @Query("""
        SELECT w FROM WithdrawalRequest w
        WHERE (:associateId IS NULL OR w.associateId = :associateId)
        AND (:status IS NULL OR w.status = :status)
        ORDER BY w.requestedAt DESC
        """)
    Page<WithdrawalRequest> search(
        @Param("associateId") UUID associateId,
        @Param("status") WithdrawalRequestStatus status,
        Pageable pageable);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=WithdrawalRequestRepositoryTest test`
Expected: PASS (all 6 tests — the 3 pre-existing plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java \
        src/test/java/com/plotchain/withdrawal/WithdrawalRequestRepositoryTest.java
git commit -m "feat(withdrawal): add WithdrawalRequestRepository.search for the approval queue"
```

---

## Task 2: `AdminWithdrawalPageResponse` + `WithdrawalService.adminList(...)`

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/AdminWithdrawalPageResponse.java`
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`

**Interfaces:**
- Consumes: `WithdrawalRequestRepository.search(UUID, WithdrawalRequestStatus, Pageable): Page<WithdrawalRequest>` (Task 1); existing `AssociateRepository.findAllById(Iterable<UUID>): List<Associate>` (already a `WithdrawalService` field); existing `AdminWithdrawalResponse` record (unit 5).
- Produces: `AdminWithdrawalPageResponse(List<AdminWithdrawalResponse> requests, int page, int size, long totalElements)`; `WithdrawalService.adminList(UUID associateId, WithdrawalRequestStatus status, int page, int size): AdminWithdrawalPageResponse` — consumed by Task 3's controller. Method name deliberately mirrors `LedgerService.adminList`'s name/shape so a future `WithdrawalService.myWithdrawals(...)` (unit 9) reads as its obvious sibling, the same way `LedgerService.myList` sits next to `adminList`.

- [ ] **Step 1: Write the failing service tests**

Add to `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`. First add these imports alongside the existing ones:

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.mockito.ArgumentMatchers.isNull;
```

Then append these test methods to the class body:

```java
private WithdrawalRequest requestFor(UUID id, UUID associateId, BigDecimal amount, WithdrawalRequestStatus status) {
    WithdrawalRequest request = new WithdrawalRequest();
    request.setId(id);
    request.setAssociateId(associateId);
    request.setAmount(amount);
    request.setStatus(status);
    request.setRequestedAt(Instant.now());
    return request;
}

// Wallet/withdrawal unit 6 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Approval queue", Decision 14): same batch-resolved-associate-fields proof as
// LedgerServiceTest.adminListReturnsAPageMappedToResponsesWithResolvedAssociateAndCycleFields.
@Test
void adminListReturnsAPageMappedToResponsesWithBatchResolvedAssociateFields() {
    UUID requestId = UUID.randomUUID();
    WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
    Associate associate = verifiedActiveAssociate();

    when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
        .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 20), 1));
    when(associateRepository.findAllById(List.of(ASSOCIATE_ID))).thenReturn(List.of(associate));

    AdminWithdrawalPageResponse response = withdrawalService.adminList(null, null, 0, 20);

    assertThat(response.totalElements()).isEqualTo(1);
    assertThat(response.page()).isEqualTo(0);
    assertThat(response.size()).isEqualTo(20);
    assertThat(response.requests()).hasSize(1);
    AdminWithdrawalResponse row = response.requests().get(0);
    assertThat(row.id()).isEqualTo(requestId);
    assertThat(row.associateId()).isEqualTo(ASSOCIATE_ID);
    assertThat(row.associateUserId()).isEqualTo("VP00001");
    assertThat(row.associateName()).isEqualTo("Jane Doe");
    assertThat(row.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
    assertThat(row.amount()).isEqualByComparingTo("1000.00");
}

@Test
void adminListPassesAssociateIdAndStatusFiltersThroughToSearchUnchanged() {
    UUID associateId = UUID.randomUUID();
    when(withdrawalRequestRepository.search(
        eq(associateId), eq(WithdrawalRequestStatus.APPROVED), eq(PageRequest.of(0, 20))))
        .thenReturn(new PageImpl<>(List.of()));

    withdrawalService.adminList(associateId, WithdrawalRequestStatus.APPROVED, 0, 20);

    verify(withdrawalRequestRepository).search(
        eq(associateId), eq(WithdrawalRequestStatus.APPROVED), eq(PageRequest.of(0, 20)));
}

// Flow "Approval queue" (Decision 14): a batch-lookup miss leaves associateUserId/associateName
// null instead of failing the whole page -- shouldn't happen under FK integrity, same
// tolerant-read behavior LedgerService.adminList already has for this exact scenario.
@Test
void adminListLeavesAssociateFieldsNullWhenTheBatchLookupMisses() {
    UUID requestId = UUID.randomUUID();
    WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("100.00"), WithdrawalRequestStatus.REQUESTED);

    when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
        .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 20), 1));
    when(associateRepository.findAllById(List.of(ASSOCIATE_ID))).thenReturn(List.of());

    AdminWithdrawalResponse row = withdrawalService.adminList(null, null, 0, 20).requests().get(0);

    assertThat(row.associateUserId()).isNull();
    assertThat(row.associateName()).isNull();
    assertThat(row.id()).isEqualTo(requestId);
}

@Test
void adminListReturnsAnEmptyPageWhenSearchFindsNothing() {
    when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
        .thenReturn(new PageImpl<>(List.of()));

    AdminWithdrawalPageResponse response = withdrawalService.adminList(null, null, 0, 20);

    assertThat(response.requests()).isEmpty();
    assertThat(response.totalElements()).isZero();
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=WithdrawalServiceTest test`
Expected: FAIL — compile error (`adminList` and `AdminWithdrawalPageResponse` don't exist yet).

- [ ] **Step 3: Create `AdminWithdrawalPageResponse`**

```java
package com.plotchain.withdrawal;

import java.util.List;

// Wallet/withdrawal unit 6 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Approval queue -- GET /api/admin/withdrawals"): same page-wrapper shape as
// income.AdminLedgerPageResponse. Field named "requests" (not "entries") to match this domain's
// own vocabulary -- a future unit 9 AssociateWithdrawalPageResponse would follow the same
// naming, mirroring how income.AssociateLedgerPageResponse follows AdminLedgerPageResponse.
public record AdminWithdrawalPageResponse(
    List<AdminWithdrawalResponse> requests, int page, int size, long totalElements) {}
```

- [ ] **Step 4: Implement `adminList(...)` on `WithdrawalService`**

In `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`:

1. Add imports:

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
```

(`java.util.Map` already exists in the current import list — don't duplicate it.)

2. Add the new public method, placed after `submitRequest`:

```java
// Flow "Approval queue" (Decision 14): full cross-associate visibility, batch-resolving
// associate identity once per page -- same pattern as LedgerService.adminList. Method name
// mirrors LedgerService.adminList deliberately, so a future WithdrawalService.myWithdrawals(...)
// (unit 9) reads as its obvious sibling and can reuse this same search() call, passing the
// caller's own id as associateId instead of the admin-supplied filter.
public AdminWithdrawalPageResponse adminList(UUID associateId, WithdrawalRequestStatus status, int page, int size) {
    Page<WithdrawalRequest> result = withdrawalRequestRepository.search(
        associateId, status, PageRequest.of(page, size));

    List<WithdrawalRequest> content = result.getContent();
    Map<UUID, Associate> associatesById = associatesById(content);

    List<AdminWithdrawalResponse> rows = content.stream()
        .map(r -> toResponse(r, associatesById.get(r.getAssociateId())))
        .toList();
    return new AdminWithdrawalPageResponse(rows, page, size, result.getTotalElements());
}

private Map<UUID, Associate> associatesById(List<WithdrawalRequest> requests) {
    List<UUID> distinctAssociateIds = requests.stream().map(WithdrawalRequest::getAssociateId).distinct().toList();
    return associateRepository.findAllById(distinctAssociateIds).stream()
        .collect(Collectors.toMap(Associate::getId, a -> a));
}
```

3. Make `toResponse` null-tolerant on its `Associate` parameter (currently assumes non-null since `submitRequest` always passes a just-fetched `Associate`; `adminList`'s batch lookup can miss under a hypothetical FK-integrity gap, same as `LedgerService.toAdminResponse`). Replace the existing `toResponse` method body:

```java
private AdminWithdrawalResponse toResponse(WithdrawalRequest withdrawalRequest, Associate associate) {
    return new AdminWithdrawalResponse(
        withdrawalRequest.getId(),
        withdrawalRequest.getAssociateId(),
        associate == null ? null : associate.getUserId(),
        associate == null ? null : associate.getName(),
        withdrawalRequest.getAmount(),
        withdrawalRequest.getStatus(),
        withdrawalRequest.getReason(),
        withdrawalRequest.getBankReference(),
        withdrawalRequest.getRequestedAt(),
        withdrawalRequest.getDecidedAt(),
        withdrawalRequest.getDisbursedAt());
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=WithdrawalServiceTest test`
Expected: PASS (all pre-existing tests plus the 4 new ones — 13 total).

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/main/java/com/plotchain/withdrawal/AdminWithdrawalPageResponse.java \
        src/main/java/com/plotchain/withdrawal/WithdrawalService.java \
        src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java
git commit -m "feat(withdrawal): add WithdrawalService.adminList for the approval queue"
```

---

## Task 3: `GET /api/admin/withdrawals` controller endpoint + security matcher

**Files:**
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java`

**Interfaces:**
- Consumes: `WithdrawalService.adminList(UUID, WithdrawalRequestStatus, int, int): AdminWithdrawalPageResponse` (Task 2).
- Produces: `GET /api/admin/withdrawals?associateId=&status=&page=&size=` → 200 `AdminWithdrawalPageResponse` JSON body.

- [ ] **Step 1: Write the failing controller tests**

Add to `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java`. Add these imports alongside the existing ones:

```java
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
```

(`when`/`any` are already imported; `mockito.Mockito.when` stays as-is. `List`/`UUID` are already imported.)

Then append these test methods to the class body:

```java
@Test
void listReturns200WithFilters() throws Exception {
    UUID requestId = UUID.randomUUID();
    WithdrawalRequest request = new WithdrawalRequest();
    request.setId(requestId);
    request.setAssociateId(TARGET_ASSOCIATE_ID);
    request.setAmount(new BigDecimal("1000.00"));
    request.setStatus(WithdrawalRequestStatus.REQUESTED);
    request.setRequestedAt(java.time.Instant.now());
    Associate associate = verifiedActiveAssociate();

    when(withdrawalRequestRepository.search(
        eq(TARGET_ASSOCIATE_ID), eq(WithdrawalRequestStatus.REQUESTED), eq(PageRequest.of(0, 20))))
        .thenReturn(new PageImpl<>(List.of(request), PageRequest.of(0, 20), 1));
    when(associateRepository.findAllById(List.of(TARGET_ASSOCIATE_ID))).thenReturn(List.of(associate));

    mockMvc.perform(get("/api/admin/withdrawals")
            .param("associateId", TARGET_ASSOCIATE_ID.toString())
            .param("status", "REQUESTED")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.requests[0].id").value(requestId.toString()))
        .andExpect(jsonPath("$.requests[0].associateUserId").value("VP00001"))
        .andExpect(jsonPath("$.requests[0].associateName").value("Jane Doe"))
        .andExpect(jsonPath("$.totalElements").value(1));
}

@Test
void listReturns200WithAnEmptyPageWhenUnfiltered() throws Exception {
    when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
        .thenReturn(new PageImpl<>(List.of()));

    mockMvc.perform(get("/api/admin/withdrawals")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.requests").isEmpty())
        .andExpect(jsonPath("$.totalElements").value(0));
}

@Test
void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
    when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 100))))
        .thenReturn(new PageImpl<>(List.of()));

    mockMvc.perform(get("/api/admin/withdrawals").param("size", "999999")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.size").value(100));
}

@Test
void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
    when(withdrawalRequestRepository.search(isNull(), isNull(), eq(PageRequest.of(0, 20))))
        .thenReturn(new PageImpl<>(List.of()));

    mockMvc.perform(get("/api/admin/withdrawals").param("page", "-5")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.page").value(0));
}

@Test
void listIsForbiddenForAnAssociateToken() throws Exception {
    mockMvc.perform(get("/api/admin/withdrawals")
            .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
        .andExpect(status().isForbidden());
}

@Test
void listIsUnauthorizedWithoutAToken() throws Exception {
    mockMvc.perform(get("/api/admin/withdrawals"))
        .andExpect(status().isUnauthorized());
}
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd backend && mvn -q -Dtest=WithdrawalControllerTest test`
Expected: FAIL — `listIsForbiddenForAnAssociateToken`/`listIsUnauthorizedWithoutAToken` fail with 404 or 405 (no route yet, no security matcher yet); the 200-path tests fail similarly with no `GET` handler registered.

- [ ] **Step 3: Add the `GET` handler to `WithdrawalController`**

In `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java`, add imports:

```java
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
```

Update the class-level comment (currently says "Only this one endpoint exists in this unit; units 6-8 add GET (list)...") to:

```java
// Wallet/withdrawal unit 5 added POST (submit). Unit 6
// (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Approval queue -- GET /api/admin/withdrawals, ADMIN-only") adds this GET (list) method to
// this same @RequestMapping("/api/admin/withdrawals") class. Units 7-8 add the
// /{id}/decision, /{id}/disburse POSTs. ADMIN-only enforcement for GET is via SecurityConfig's
// explicit matcher (same as GET /api/admin/ledger) -- no @PreAuthorize needed on the method
// itself.
```

Add the new handler after `submit`:

```java
@GetMapping
public AdminWithdrawalPageResponse list(
        @RequestParam(required = false) UUID associateId,
        @RequestParam(required = false) WithdrawalRequestStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
    page = Math.max(page, 0);
    size = Math.min(size, 100);
    return withdrawalService.adminList(associateId, status, page, size);
}
```

- [ ] **Step 4: Add the `SecurityConfig` matcher**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, immediately after the existing `GET /api/admin/ledger` matcher block (around line 264, right before the "Phase 5's genuinely public endpoints" comment), insert:

```java
                // Admin withdrawal approval queue: ADMIN-only, Wallet/withdrawal unit 6
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "Approval queue -- GET /api/admin/withdrawals, ADMIN-only"), same
                // target-role-model pattern as GET /api/admin/ledger directly above. A GET never
                // collides with the POST/PUT/PATCH/DELETE blanket rules above, so there's no
                // first-match-wins ordering requirement forcing this matcher to live in any one
                // spot -- grouped here with the other admin-list GETs for readability.
                .requestMatchers(HttpMethod.GET, "/api/admin/withdrawals")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && mvn -q -Dtest=WithdrawalControllerTest test`
Expected: PASS (all pre-existing tests plus the 6 new ones — 11 total).

- [ ] **Step 6: Run the full backend test suite**

Run: `cd backend && mvn -q test`
Expected: PASS. (If you see ~55 unrelated Mockito failures, that's the known JDK21/25 mismatch noted in project memory, not a regression from this change — cross-check by running `mvn -q -Dtest=WithdrawalControllerTest,WithdrawalServiceTest,WithdrawalRequestRepositoryTest,SecurityConfigTest test` in isolation to confirm this unit's own tests are clean.)

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/main/java/com/plotchain/withdrawal/WithdrawalController.java \
        src/main/java/com/plotchain/auth/SecurityConfig.java \
        src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java
git commit -m "feat(withdrawal): add GET /api/admin/withdrawals approval queue endpoint"
```

---

## Task 4: Update `SecurityConfigTest` role matrix (if applicable)

**Files:**
- Read first: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` (or wherever the project's `SecurityConfigTest` lives — confirm path before starting; it's referenced by the units file for a sibling unit 9 as owning "the full ADMIN-vs-every-other-role matrix").

**Interfaces:**
- Consumes: nothing new — this task only asserts against the route added in Task 3.

- [ ] **Step 1: Check whether `SecurityConfigTest` enumerates routes exhaustively**

Run: `grep -n "api/admin/ledger\|api/admin/withdrawals" backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

If the file maintains an exhaustive list of admin-only GET routes (mirroring the `GET /api/admin/ledger` entry), add a parallel entry for `GET /api/admin/withdrawals` following that file's existing structure exactly (same row/data-provider shape used for the ledger route). If the file does NOT enumerate individual routes (e.g. it only tests via `WithdrawalControllerTest`-style per-controller assertions), skip this task — `WithdrawalControllerTest`'s `listIsForbiddenForAnAssociateToken`/`listIsUnauthorizedWithoutAToken` (Task 3) already cover the 403/401 cases for this specific route.

- [ ] **Step 2: If a change was made, run the test and commit**

Run: `cd backend && mvn -q -Dtest=SecurityConfigTest test`
Expected: PASS.

```bash
cd backend
git add src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(auth): add GET /api/admin/withdrawals to the admin-route security matrix"
```

(Skip the commit entirely if Step 1 found nothing to add.)

---

## Self-Review Notes

**Spec coverage:**
- `WithdrawalRequestRepository.search(...)`, null-safe shape — Task 1. ✓
- `associateId`/`status` independent + combined filtering, page/size clamp 0–100 default 0/20 — Task 1 (repo tests) + Task 3 (controller clamp + tests). ✓
- `AdminWithdrawalPageResponse` of `AdminWithdrawalResponse` rows, batch-resolved via `findAllById` — Task 2. ✓
- Non-ADMIN → 403, unauthenticated → 401 — Task 3 (`WithdrawalControllerTest`) + Task 4 (`SecurityConfigTest`, conditionally). ✓
- Unit 7 non-collision: no touches to `WithdrawalExceptionHandler`, `CreateWithdrawalRequest`, or `submitRequest`'s logic — confirmed in File Structure and every task's file list. ✓
- Unit 9 forward-reuse: `search(...)`'s nullable-`associateId` signature documented explicitly in Task 1's Javadoc-style comment and this plan's Global Constraints. ✓

**Placeholder scan:** none found — every step has literal code.

**Type consistency:** `AdminWithdrawalPageResponse(List<AdminWithdrawalResponse> requests, int page, int size, long totalElements)` used identically in Task 2 (creation) and Task 3 (controller return type, test JSON paths `$.requests[...]`). `WithdrawalService.adminList(UUID, WithdrawalRequestStatus, int, int): AdminWithdrawalPageResponse` signature matches between Task 2 (definition) and Task 3 (controller call site + test verify calls).
