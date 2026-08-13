# Role Capability Unit 5: Associate Can View Their Own Subtree — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an authenticated Associate a self-scoped `GET /api/associates/me/tree` endpoint that returns their own subtree (own direct downline + full L/R descendants, depth-limited), with no way to view another associate's subtree through this route.

**Architecture:** Add one new thin `@RestController` (`AssociateTreeController`, mirroring the existing `DashboardController` self-scoped pattern) in the `com.plotchain.tree` package. It delegates to the *existing, unmodified* `TreeExplorerService.subtree(UUID, int)` — the same method the admin-only `TreeExplorerController` already calls — passing the associate ID pulled from `@AuthenticationPrincipal`, never from a path or query parameter. No service or repository code changes. No `SecurityConfig` changes: the new route has no dedicated matcher and falls through to the existing blanket `anyRequest().authenticated()` rule at the bottom of the chain, which is sufficient because self-scoping here comes from the code path (ID always sourced from the token), not from a role check.

**Tech Stack:** Spring Boot (Java), Spring Security (JWT bearer auth via `JwtAuthenticationFilter` + `@AuthenticationPrincipal`), Spring MVC, JUnit 5 + Mockito + MockMvc, Maven.

## Global Constraints

- The associate ID for this route MUST come only from `@AuthenticationPrincipal UUID associateId` (the JWT principal) — never a path variable or `@RequestParam`. This is what makes the route self-scoped by construction (spec: "Subtree rooted at self only... own direct downline + full L/R descendants").
- The existing admin-only `GET /api/admin/tree/{associateId}` and `GET /api/admin/tree/search` routes (`TreeExplorerController`) must be left completely untouched — same request mappings, same `@RequestMapping("/api/admin/tree")`, same behavior.
- Depth is limited (spec: "depth-limited"). Mirror the admin route's existing convention exactly: `@RequestParam(defaultValue = "3") int depth`, then clamp with `depth = Math.max(0, Math.min(depth, 5))` before calling the service.
- No new `SecurityConfig` matcher for `/api/associates/me/tree` — verified against the current file (see Drift Notes below); it must fall through to `anyRequest().authenticated()`.
- Do not modify `TreeExplorerService.subtree()`'s `findByIdAndRole(associateId, AssociateRole.ASSOCIATE)` call, and do not modify or delete `AssociateRepository.findByIdAndRole` — both are out of scope for this unit (see Drift Notes below).

---

## Drift Notes — reference plan (`2026-08-03-role-model-collapse.md` Task 7) vs. current repo state

The reference plan's Task 7 (lines 486–605) was written assuming role-capability units 2/3 (Admin seeded as the single root account; Root Associate removed as a separate account) had already landed, and on that assumption it changes `TreeExplorerService.subtree()` from `findByIdAndRole(id, AssociateRole.ASSOCIATE)` to a plain `findById(id)`. Verified against the current repo (`backend/src/main/java/com/plotchain/tree/TreeExplorerService.java:48-50`) and the unit queue (`docs/superpowers/plans/2026-08-03-role-capability-units.md`):

- Units 2 and 3 (Admin-as-root migration, Root Associate removal) are still `status: planned`, **not merged**. The tree root today is still a separate seeded `Associate` row with `role = ASSOCIATE` (`RootAssociateProvisioningService`/`RootAssociateController` still exist in `backend/src/main/java/com/plotchain/company/`). The Admin account is not yet part of the binary tree.
- Given that, `findByIdAndRole(associateId, AssociateRole.ASSOCIATE)` in `subtree()` is still **correct** for the current data model: any Associate calling `/me/tree` about themselves has `role = ASSOCIATE` by definition, so the existing filter finds them fine. Changing it to `findById` now would be presupposing a migration this unit does not depend on and is not scoped to touch (task description: unit 5 has "No dependencies," and its own row in the unit queue points at Task 7 in isolation, not the interlocked Task 1–5 sequence the reference plan treats as one block).
- **Decision for this plan: leave `TreeExplorerService.subtree()` completely unchanged.** The new controller reuses it as-is. If unit 2/3 later change the tree's root model, `subtree()` can be revisited then, in that unit's own scope — not here.
- `AssociateRepository.findByIdAndRole` is used by two other call sites besides `TreeExplorerService` — `AdminAssociateService.java` and `KycReviewService.java` (confirmed via grep) — so it must not be deleted regardless of what happens to `TreeExplorerService`. Moot for this plan since `TreeExplorerService` isn't touched either.
- `SecurityConfig.java` (`backend/src/main/java/com/plotchain/auth/SecurityConfig.java`) currently has 20+ matchers (it has grown well past the reference plan's era), including `.requestMatchers(HttpMethod.GET, "/api/admin/tree/*").hasAuthority("ADMIN")` (line 203) and `.requestMatchers(HttpMethod.POST, "/api/associates/me/password").authenticated()` (line 46). Neither pattern matches `GET /api/associates/me/tree` — the admin matcher is `/api/admin/tree/*`, a different path prefix, and the `/me/password` matcher is POST-only and a different path. Re-derived directly from the current file (not the reference plan's quoted reasoning): **no new matcher needed**, the route falls through to `.anyRequest().authenticated()` (line 239).
- The `@AuthenticationPrincipal UUID associateId` pattern is confirmed current and correct by checking the already-existing self-scoped `DashboardController.getDashboard(@AuthenticationPrincipal UUID associateId)` (`backend/src/main/java/com/plotchain/dashboard/DashboardController.java:19`) — same pattern used here.
- `TreeExplorerControllerTest.java`'s current token-minting pattern was read in full (`backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java:47-54`): a `tokenFor(AssociateRole role)` helper that builds an `Associate` with a random ID, stubs `associateRepository.findById(id)` (needed because `JwtAuthenticationFilter` looks the associate up on every request), and calls `jwtService.generateToken(associate)`. This plan's new test file adapts that pattern (see Task 1) rather than the reference plan's unverified snippet.

---

## Files

- Create: `backend/src/main/java/com/plotchain/tree/AssociateTreeController.java`
- Create: `backend/src/test/java/com/plotchain/tree/AssociateTreeControllerTest.java`
- No other files are modified. `TreeExplorerService.java`, `TreeExplorerController.java`, `SecurityConfig.java`, `AssociateRepository.java`, and their existing tests are left exactly as they are today.

---

## Task 1: Self-scoped `GET /api/associates/me/tree` endpoint

**Files:**
- Create: `backend/src/main/java/com/plotchain/tree/AssociateTreeController.java`
- Test: `backend/src/test/java/com/plotchain/tree/AssociateTreeControllerTest.java`

**Interfaces:**
- Consumes: `TreeExplorerService.subtree(UUID associateId, int depth) -> TreeNodeResponse` (already exists, unmodified, `backend/src/main/java/com/plotchain/tree/TreeExplorerService.java:48`). `TreeNodeResponse` is an existing record with (among other fields) `userId` and `children` — used for assertions below.
- Produces: `GET /api/associates/me/tree?depth={int}` → `TreeNodeResponse` JSON body. No other task depends on this.

- [ ] **Step 1: Write the failing test — caller receives their own subtree, scoped by the JWT principal, not any request parameter**

Create `backend/src/test/java/com/plotchain/tree/AssociateTreeControllerTest.java`:

```java
package com.plotchain.tree;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.auth.JwtService;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateTreeControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LegVolumeRepository legVolumeRepository;

    // Stubs the JwtAuthenticationFilter's per-request associate lookup (same reason
    // TreeExplorerControllerTest's tokenFor() does this) so the minted token authenticates.
    private String tokenForAssociate(Associate associate) {
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private Associate newSelf(UUID id, String userId) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Self");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.PENDING);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void myTreeReturnsTheCallersOwnSubtreeScopedByTheJwtPrincipal() throws Exception {
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00042");

        // There is no path or query parameter carrying an associate ID on this route at all --
        // the only way the service is ever asked about `selfId` is because that's who the
        // token belongs to. If this route accidentally let a caller specify a different ID, no
        // stub in this test would satisfy it and the response would come back empty/error.
        when(associateRepository.findByIdAndRole(selfId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(self));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());
        when(associateRepository.countByParentId(selfId)).thenReturn(0L);

        mockMvc.perform(get("/api/associates/me/tree")
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00042"));
    }

    @Test
    void myTreeReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/tree"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void myTreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum() throws Exception {
        // Mirrors TreeExplorerControllerTest.subtreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum,
        // adapted to the self-scoped route: same JDK/Mockito constraint prevents spying the
        // concrete TreeExplorerService, so the clamp is verified behaviorally through the
        // mocked AssociateRepository -- build a chain 6 deep, prove depth=999 only recurses 5
        // levels, not all the way down.
        UUID selfId = UUID.randomUUID();
        Associate self = newSelf(selfId, "VP00001");

        List<Associate> chain = new java.util.ArrayList<>();
        Associate previous = self;
        for (int i = 1; i <= 6; i++) {
            Associate a = newSelf(UUID.randomUUID(), "VP0000" + i);
            chain.add(a);
            when(associateRepository.findByParentId(previous.getId())).thenReturn(List.of(a));
            when(associateRepository.countByParentId(previous.getId())).thenReturn(1L);
            previous = a;
        }

        when(associateRepository.findByIdAndRole(selfId, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(self));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of());
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/tree").param("depth", "999")
                .header("Authorization", "Bearer " + tokenForAssociate(self)))
            .andExpect(status().isOk());

        verify(associateRepository, never()).findByParentId(chain.get(4).getId());
    }
}
```

- [ ] **Step 2: Run the tests to verify the first one fails**

Run: `cd backend && mvn test -Dtest=AssociateTreeControllerTest`
Expected: FAIL — `GET /api/associates/me/tree` has no handler yet. With a valid bearer token, Spring Security's `anyRequest().authenticated()` rule already lets the request through (no new matcher required, per Drift Notes), so it reaches `DispatcherServlet` and 404s there (no mapping) instead of `200`. `myTreeReturnsTheCallersOwnSubtreeScopedByTheJwtPrincipal` fails on `status().isOk()`. (`myTreeReturns401WithoutAToken` will already pass at this point — the security chain rejects the request before routing is even attempted — that's expected and fine, it isn't meant to be a red test.)

- [ ] **Step 3: Implement the controller**

Create `backend/src/main/java/com/plotchain/tree/AssociateTreeController.java`:

```java
package com.plotchain.tree;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class AssociateTreeController {

    private final TreeExplorerService treeExplorerService;

    public AssociateTreeController(TreeExplorerService treeExplorerService) {
        this.treeExplorerService = treeExplorerService;
    }

    // Self-scoped by construction: associateId comes only from the authenticated JWT
    // principal, never a path or query parameter, so there is no way to reach another
    // associate's subtree through this route (role-capability data-visibility spec:
    // "Subtree rooted at self only -- own direct downline + full L/R descendants").
    // Depth default/clamp mirrors the admin-only TreeExplorerController.subtree() route
    // exactly, for the same reason documented there: an unclamped depth could trigger a
    // 2^(depth+1)-1 node recursive fetch and exhaust server memory/time.
    @GetMapping("/api/associates/me/tree")
    public TreeNodeResponse myTree(@AuthenticationPrincipal UUID associateId,
                                    @RequestParam(defaultValue = "3") int depth) {
        depth = Math.max(0, Math.min(depth, 5));
        return treeExplorerService.subtree(associateId, depth);
    }
}
```

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `cd backend && mvn test -Dtest=AssociateTreeControllerTest`
Expected: PASS — all three tests (`myTreeReturnsTheCallersOwnSubtreeScopedByTheJwtPrincipal`, `myTreeReturns401WithoutAToken`, `myTreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum`) green.

- [ ] **Step 5: Run the full tree-package suite to confirm the untouched admin routes are unaffected**

Run: `cd backend && mvn test -Dtest=com.plotchain.tree.*`
Expected: PASS for `AssociateTreeControllerTest`, `TreeExplorerControllerTest`, `TreeExplorerServiceTest` — no regressions, since `TreeExplorerService`/`TreeExplorerController` were never modified. (If you see a large batch of unrelated `Mockito`/`ByteBuddy` errors elsewhere in a full `mvn test` run, that's the pre-existing JDK21/25 mismatch noted separately in project memory — unrelated to this change; scope verification to the `com.plotchain.tree` package as shown above to avoid noise.)

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/main/java/com/plotchain/tree/AssociateTreeController.java src/test/java/com/plotchain/tree/AssociateTreeControllerTest.java
git commit -m "feat(tree): add self-scoped GET /api/associates/me/tree for associates"
```

---

## Self-Review

**Spec coverage:**
- "Associate can view their own subtree" (unit 5 acceptance criteria) → Task 1's `AssociateTreeController.myTree`, backed by the existing `TreeExplorerService.subtree()`.
- "own direct downline + full L/R descendants, depth-limited" → `subtree()`'s existing recursive `buildNode` (unmodified) walks `findByParentId` down to `depth`, exactly as the admin route already does; depth clamp (0–5) mirrored from the admin controller.
- "ID from the authenticated principal (JWT), never path/query param" → `@AuthenticationPrincipal UUID associateId`, no `@PathVariable`/other `@RequestParam` for an ID anywhere in the new controller. Verified in Step 1's test comment and the "no path/query param" structural fact itself.
- "Existing admin-only routes untouched" → `TreeExplorerController.java`, `TreeExplorerService.java` are not in the Files list and are not modified anywhere in this plan.
- "No new `SecurityConfig` matcher needed... verify against current file" → done in Drift Notes, re-derived from the live file's matcher list, confirmed via a passing/expected `myTreeReturns401WithoutAToken` (proves the catch-all still gates it) and the implicit fact that the happy-path test's `200` requires no matcher change either.

**Placeholder scan:** No TBD/TODO, no "add error handling" hand-waves, no "similar to Task N" — full code given for both the controller and its test.

**Type consistency:** `TreeExplorerService.subtree(UUID, int) -> TreeNodeResponse` is used identically to how `TreeExplorerController` already calls it — no signature invented. `@AuthenticationPrincipal UUID associateId` matches `DashboardController`'s exact pattern.

No gaps found against the unit's acceptance criteria — this is a single, complete task.
