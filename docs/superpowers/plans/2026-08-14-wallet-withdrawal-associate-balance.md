# Associate Own Wallet Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /api/associates/me/wallet` so any authenticated associate can view their own wallet balance, returning zero (not 404) for an associate who has never been credited.

**Architecture:** A new bare `@RestController` (`WalletController`, `wallet` package) with one route, injecting `WalletRepository` directly — no new service class, per the spec's own reasoning that this is "plain reuse of a trivial single-row lookup," not logic worth centralizing. It calls `walletRepository.findById(associateId).orElseGet(() -> Wallet.zero(associateId))`, the exact lazy-default pattern `DashboardService.getDashboard()` already uses for its own `WalletSummary` read — that existing read path is untouched by this plan. A new `WalletBalanceResponse(BigDecimal balance)` record is the sole response shape. No `SecurityConfig` matcher is needed: a bare `GET` never collides with the blanket write rules, so it falls through to `anyRequest().authenticated()` — any authenticated associate reaches it, same as `GET /api/associates/me/dashboard` and `GET /api/associates/me/ledger`.

**Tech Stack:** Spring Boot (Java), Spring Data JPA, Spring Security (JWT via `@AuthenticationPrincipal`), MockMvc + JUnit 5 + Mockito for tests, H2 for `@SpringBootTest` test slices.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (Decision 13; Flow "`GET /api/associates/me/wallet`"; Testing section, `WalletControllerTest`). Unit detail: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`, section "### 2."

## Global Constraints

- `associateId` for this endpoint comes **only** from `@AuthenticationPrincipal UUID associateId` — the endpoint has no request parameter of any kind, so there is no way to view another associate's balance.
- Reuse `WalletRepository.findById(UUID)` (existing, unmodified) with `.orElseGet(() -> Wallet.zero(associateId))` — the identical lazy-default pattern `DashboardService.getDashboard()` already uses. A never-credited associate gets a balance of `0`, not a 404.
- **No changes to `WalletRepository.java` or `Wallet.java`.** This unit reads via the repository's existing `findById` method only. (A sibling unit, planned in parallel, adds a new `creditBalance` method to `WalletRepository.java` — since this plan doesn't touch that file, there is no real conflict, but do not assume `creditBalance` exists yet and do not add it here.)
- `DashboardService.getDashboard()`'s existing `WalletSummary` read path must stay byte-for-byte untouched — do not modify `DashboardService.java` or `DashboardController.java`.
- No new `SecurityConfig` matcher, no `@PreAuthorize`, no ADMIN restriction — reachable by any authenticated associate token; unauthenticated → 401 via the existing filter chain.
- Response is exactly `WalletBalanceResponse(BigDecimal balance)` — no associate-identity fields, no other data.
- No migration — the `wallet` table already exists (`V1__create_dashboard_tables.sql`).

---

## File Structure

- Create: `backend/src/main/java/com/plotchain/wallet/WalletBalanceResponse.java` — new response record, one field.
- Create: `backend/src/main/java/com/plotchain/wallet/WalletController.java` — new bare `@RestController`, single `GET /api/associates/me/wallet` route.
- Create: `backend/src/test/java/com/plotchain/wallet/WalletControllerTest.java` — MockMvc + real JWT tests for the new controller.
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add one reachability test proving any associate token reaches 200 with no matcher needed.

No changes to `Wallet.java`, `WalletRepository.java`, `DashboardService.java`, `DashboardController.java`, `SecurityConfig.java`, or any migration file.

---

## Task 1: `WalletController` — `GET /api/associates/me/wallet`

**Files:**
- Create: `backend/src/main/java/com/plotchain/wallet/WalletBalanceResponse.java`
- Create: `backend/src/main/java/com/plotchain/wallet/WalletController.java`
- Test: `backend/src/test/java/com/plotchain/wallet/WalletControllerTest.java`

**Interfaces:**
- Consumes: `WalletRepository.findById(UUID): Optional<Wallet>` (existing, unmodified); `Wallet.zero(UUID associateId): Wallet` (existing, unmodified); `Wallet.getBalance(): BigDecimal` (existing, unmodified).
- Produces: `WalletBalanceResponse(BigDecimal balance)`; `GET /api/associates/me/wallet` HTTP route, consumed by a future unit's associate "Payout History" screen (unit 11 of the wallet-withdrawal unit queue).

- [ ] **Step 1: Write the failing tests in a new `WalletControllerTest.java`**

Create `backend/src/test/java/com/plotchain/wallet/WalletControllerTest.java`:

```java
package com.plotchain.wallet;

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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// MockMvc + real JWT via JwtService, mirroring AssociateLedgerControllerTest's/
// DashboardControllerTest's shape -- the real Spring Security filter chain runs, so this also
// proves the 401 case end to end. SecurityConfigTest additionally covers reachability by an
// ordinary associate token across the full route matrix; this file focuses on this controller's
// own request/response shape.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WalletControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean WalletRepository walletRepository;

    // Unlike a role-only tokenFor(role) (which mints a random associateId per call), this test
    // needs to know the associateId ahead of time -- it's how we prove WalletController resolves
    // the caller's OWN id from the JWT, not from a request parameter (this endpoint accepts
    // none). associateRepository.findById is stubbed here too because
    // JwtAuthenticationFilter -> AssociateStatusCache calls it on every request to confirm the
    // associate isn't suspended -- same wiring as DashboardControllerTest/
    // AssociateLedgerControllerTest.
    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    // Wallet has no setter/constructor for balance by design (Decision 5 -- balance mutation is
    // atomic-UPDATE-only, never entity dirty-checking), so a non-zero fixture is built via
    // ReflectionTestUtils, the same pattern DashboardServiceTest already uses elsewhere in this
    // codebase for private fields with no setter (see its LegVolume field-setting calls).
    private Wallet walletWithBalance(UUID associateId, String balance) {
        Wallet wallet = Wallet.zero(associateId);
        ReflectionTestUtils.setField(wallet, "balance", new BigDecimal(balance));
        return wallet;
    }

    @Test
    void getMyWalletReturnsTheCallersBalanceWhenAWalletRowExists() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(walletRepository.findById(associateId))
            .thenReturn(Optional.of(walletWithBalance(associateId, "1250.50")));

        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(1250.50));
    }

    // The lazy-default case: an associate with no prior Wallet row (never credited) gets a
    // balance of zero, not a 404 -- Decision 13 / Flow step 2.
    @Test
    void getMyWalletReturnsZeroWhenNoWalletRowExistsYet() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(walletRepository.findById(associateId)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(0));
    }

    // Proves the balance shown is always the caller's own: two different associate tokens against
    // two different stubbed wallets each see only their own row.
    @Test
    void getMyWalletReturnsADifferentBalanceForADifferentCaller() throws Exception {
        UUID firstAssociateId = UUID.randomUUID();
        UUID secondAssociateId = UUID.randomUUID();
        when(walletRepository.findById(firstAssociateId))
            .thenReturn(Optional.of(walletWithBalance(firstAssociateId, "100.00")));
        when(walletRepository.findById(secondAssociateId))
            .thenReturn(Optional.of(walletWithBalance(secondAssociateId, "999.99")));

        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(firstAssociateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(100.00));

        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(secondAssociateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(999.99));
    }

    @Test
    void getMyWalletReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/wallet"))
            .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `mvn test -Dtest=WalletControllerTest`

Expected: the three tests asserting `status().isOk()` fail with a 404 — the route `/api/associates/me/wallet` doesn't exist yet, since `WalletController` hasn't been created (this test file has no direct compile-time reference to `WalletController` itself, only the route path, so this is a runtime 404, not a compile error). The fourth test, `getMyWalletReturns401WithoutAToken`, passes even before the controller exists: with no token, Spring Security's `anyRequest().authenticated()` rejects the request at the filter-chain level before route resolution ever happens, so it's already 401 regardless of whether the route exists. Confirm the three OK-asserting tests fail with 404.

- [ ] **Step 3: Create `WalletBalanceResponse.java`**

```java
package com.plotchain.wallet;

import java.math.BigDecimal;

// Wallet/Withdrawal unit 2 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 13, Flow "GET /api/associates/me/wallet"): the sole response shape for the associate's
// own wallet balance. Deliberately just a balance -- no associateId echoed back, since this route
// is always scoped to the caller by construction.
public record WalletBalanceResponse(BigDecimal balance) {}
```

- [ ] **Step 4: Create `WalletController.java`**

```java
package com.plotchain.wallet;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Wallet/Withdrawal unit 2 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 13, Flow "GET /api/associates/me/wallet"): a small dedicated endpoint, deliberately NOT
// folded into DashboardController/DashboardService -- the dashboard is a large aggregate query
// (rank progress, team snapshot, announcements, cycle income, leg volume) that a wallet/
// withdrawal-history screen shouldn't have to pull in full just to show a balance next to a
// withdrawal list. DashboardService.getDashboard()'s own WalletSummary read path is untouched by
// this controller -- both simply read WalletRepository independently via the same trivial
// single-row lookup (Decision 13's "plain reuse ... not duplication of logic worth centralizing
// further").
//
// No SecurityConfig matcher needed: this is a bare GET, which never collides with the blanket
// POST/PUT/PATCH/DELETE write rules there, so it falls through to anyRequest().authenticated() --
// the same way GET /api/associates/me/dashboard and GET /api/associates/me/ledger already do with
// no matcher of their own.
@RestController
public class WalletController {

    private final WalletRepository walletRepository;

    public WalletController(WalletRepository walletRepository) {
        this.walletRepository = walletRepository;
    }

    // Self-scoped by construction: associateId comes from the verified JWT, never from the
    // request -- there is no way to query another associate's balance through this route. Uses
    // the exact same lazy-default pattern DashboardService.getDashboard() already uses: a wallet
    // that has never been credited returns a balance of zero, not a 404.
    @GetMapping("/api/associates/me/wallet")
    public WalletBalanceResponse getMyWallet(@AuthenticationPrincipal UUID associateId) {
        Wallet wallet = walletRepository.findById(associateId)
            .orElseGet(() -> Wallet.zero(associateId));
        return new WalletBalanceResponse(wallet.getBalance());
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `backend/`): `mvn test -Dtest=WalletControllerTest`

Expected: PASS (all 4 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/wallet/WalletBalanceResponse.java \
        backend/src/main/java/com/plotchain/wallet/WalletController.java \
        backend/src/test/java/com/plotchain/wallet/WalletControllerTest.java
git commit -m "feat(wallet): add GET /api/associates/me/wallet"
```

---

## Task 2: `SecurityConfigTest` reachability addition

**Files:**
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `GET /api/associates/me/wallet` (Task 1) — no production code is touched in this task; it only adds a characterization test proving the route needs no `SecurityConfig` matcher.

- [ ] **Step 1: Write the test**

Add this test to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, near the existing `associateMeLedgerIsReachableByAnAssociateToken` test:

```java
    // Wallet/Withdrawal unit 2 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "GET /api/associates/me/wallet, any authenticated associate"): needs no explicit
    // SecurityConfig matcher -- a bare GET never collides with the blanket POST/PUT/PATCH/DELETE
    // write rules above, so it falls through to anyRequest().authenticated() below, the same way
    // GET /api/associates/me/dashboard and GET /api/associates/me/ledger already do with no
    // matcher of their own. This test proves the route is reachable by an ordinary associate
    // token, not accidentally blocked by 403.
    //
    // walletRepository is not @MockBean'd in this class, so findById runs for real against the
    // empty H2 test DB, finds nothing, and WalletController's lazy-default (Wallet.zero) kicks
    // in -- the request reaches a clean 200 with no further stubbing needed, same reasoning as
    // associateMeLedgerIsReachableByAnAssociateToken above.
    @Test
    void associateMeWalletIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }
```

- [ ] **Step 2: Run the test**

Run (from `backend/`): `mvn test -Dtest=SecurityConfigTest`

Expected: PASS. This test is expected to pass immediately with no production-code change, since `GET /api/associates/me/wallet` (added in Task 1) is a bare GET that already falls through to `anyRequest().authenticated()` — this step exists to record that guarantee as a regression test, not to drive new code.

- [ ] **Step 3: Run the full backend test suite**

Run (from `backend/`): `mvn test`

Expected: PASS, all tests including `WalletControllerTest`, `DashboardControllerTest`, `DashboardServiceTest`, `AssociateLedgerControllerTest`, `SecurityConfigTest`. (Per the project's known JDK/Mockito environment note, some spurious Mockito errors unrelated to this change may appear if running under a mismatched JDK — see the memory note `plotchain_jdk_mockito_env_issue.md` if that happens; it is not this unit's concern.)

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(wallet): confirm GET /api/associates/me/wallet needs no SecurityConfig matcher"
```

---

## Self-Review Notes (for the plan author, already applied above)

- **Spec coverage:** every acceptance criterion in unit 2's detail is covered — new dedicated `WalletController` in the `wallet` package, not folded into the dashboard (`DashboardService`/`DashboardController` untouched); `associateId` from `@AuthenticationPrincipal`; `WalletBalanceResponse(balance)` via the same lazy-default `findById(...).orElseGet(() -> Wallet.zero(...))` pattern `DashboardService` already uses; reachable by any authenticated associate token with no admin restriction (Task 2); unauthenticated → 401 (Task 1's last test). `WalletRepository.java` is confirmed untouched — no repository test additions were needed since no repository method changed.
- **No placeholders:** every step has literal code, not prose describing code.
- **Type consistency:** `WalletBalanceResponse(BigDecimal balance)`'s field name/order is identical between Task 1's record definition, `WalletController.getMyWallet`'s construction of it, and the test's `jsonPath("$.balance")` assertions. `WalletController`'s constructor parameter (`WalletRepository walletRepository`) matches the `@MockBean WalletRepository walletRepository` field name used in `WalletControllerTest`.
