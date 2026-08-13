# Role Capability Unit 1: Only ADMIN Role Carries Back-Office Authority — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the six-value `AssociateRole` enum (`ADMIN`, `ASSOCIATE`, `SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`) down to the two roles the product actually has (`ADMIN`, `ASSOCIATE`), and collapse every authorization rule that currently treats the four deleted sub-roles as admin-equivalent (`SecurityConfig`'s blanket `hasAnyAuthority(...)` rules, `AdminAssociateController`'s suspend/reactivate/reset-password narrowing, `KycReviewController.decide()`'s narrowing) down to a plain `hasAuthority("ADMIN")` check.

**Architecture:** Pure subtraction inside existing files — no new classes, no new endpoints, no database migration. `AssociateRole.java` shrinks to two constants and loses `isAdminFamily()`. `SecurityConfig.java`, `AdminAssociateController.java`, `KycReviewController.java`, and `AuthService.java` each lose their multi-role branching in favor of a single `ADMIN` check. Every test file that constructs an `AssociateRole.SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` value as literal Java code must be touched too, purely because that literal no longer compiles once the enum shrinks — this includes files well outside the four production files above (see "Known constraint" below).

**Tech Stack:** Spring Boot (Java), Spring Security method (`@PreAuthorize`) + URL (`SecurityConfig`) authorization, JUnit 5 (`@Test`, `@ParameterizedTest`/`@EnumSource`), Mockito, MockMvc.

## Global Constraints

- Spec of record: `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md`. This plan implements exactly the "Role model" section (~line 19-24) and the "Mechanical role-collapse" bullets (~line 100-109) that concern the enum and authorization narrowing — not the Admin-seeding migration (unit 2), not Root Associate removal (unit 3), not Admin Team removal (unit 4). Those are separate units with their own plans, sequenced after this one merges.
- This unit does **not** touch any Flyway migration. `V4__user_id_login_and_admin_roles.sql`'s `chk_associate_role` CHECK constraint still permits the four sub-role strings at the database layer after this unit lands — that's fine and expected; narrowing the DB constraint is unit 2's job (per the spec's "Migration approach" section), not this one's. The Java type system is what changes here.
- Run backend tests with `cd backend && ./mvnw test`. This repo also has a known JDK21/25 + Mockito environment quirk that produces ~55 spurious Mockito errors unrelated to any code change — if you see a wall of Mockito-related errors unrelated to `AssociateRole`/`SecurityConfig`/anything this plan touches, that's the pre-existing environment issue, not a regression from this plan.
- **Critical, discovered during planning, not anticipated by the spec or the pre-existing reference plan**: shrinking the `AssociateRole` enum breaks *compilation* (not just test assertions) of eight test files across the backend, because several of them construct `AssociateRole.SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` as literal Java code (method arguments, field assignments), which is a compile error once those constants don't exist — as opposed to `@EnumSource(names = "SUPER_ADMIN")`-style string references, which stay source-compatible and only fail at test *run* time. Maven compiles the entire `src/test/java` tree as one unit, so even one file with a literal bad reference blocks every test in the module from running, not just that file's own tests. This plan's tasks are ordered so each one's edits are independently reviewable, but **no test can actually run until Task 6 lands** — Tasks 1-5 verify progress with `mvn test-compile` (a compile-only check), not `mvn test`. This is expected, not a sign anything is broken.
- The spec's "Mechanical role-collapse" section states `SecurityConfig.java` has "14 occurrences" of the blanket `hasAnyAuthority(...)` call. **Verified against the current file: it's actually 18** — cycle-management and sales work merged after the spec was written added four more admin-only `GET`/`POST` matchers that don't use this pattern at all (they're already `hasAuthority("ADMIN")`-only, built directly to the target model), but also didn't touch the still-unconverted matchers, so the "14" count is stale. Don't trust either number — Task 2 greps the file directly and confirms the count is zero after editing, rather than counting occurrences up front.

---

### Task 1: Collapse `AssociateRole` to `ADMIN`/`ASSOCIATE`; fix `AuthService`; delete `AssociateRoleTest`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRole.java`
- Modify: `backend/src/main/java/com/plotchain/auth/AuthService.java:51`
- Delete: `backend/src/test/java/com/plotchain/associate/AssociateRoleTest.java`

**Interfaces:**
- Produces: `AssociateRole` has exactly two constants (`ADMIN`, `ASSOCIATE`), no `isAdminFamily()` method. Every later task's edits assume this is already done — attempting to compile any file that still references a deleted constant or `isAdminFamily()` will fail until that file's own task lands.

- [ ] **Step 1: Shrink the enum**

Current content of `backend/src/main/java/com/plotchain/associate/AssociateRole.java`:

```java
package com.plotchain.associate;

public enum AssociateRole {
    ADMIN, ASSOCIATE, SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT;

    // The single definition of "may write" until Phase 10's per-role permission matrix
    // narrows it. SecurityConfig's blanket write rule is built from this, not from an
    // independently maintained list of roles.
    public boolean isAdminFamily() {
        return this != ASSOCIATE;
    }
}
```

Replace the entire file with:

```java
package com.plotchain.associate;

public enum AssociateRole {
    ADMIN, ASSOCIATE
}
```

- [ ] **Step 2: Fix the one production caller of the removed `isAdminFamily()`**

In `backend/src/main/java/com/plotchain/auth/AuthService.java`, line 51 currently reads:

```java
        if (!associate.getRole().isAdminFamily() && !setupStateService.isLaunched()) {
```

Change to:

```java
        if (associate.getRole() == AssociateRole.ASSOCIATE && !setupStateService.isLaunched()) {
```

This needs the import `com.plotchain.associate.AssociateRole` — check it isn't already imported (it currently isn't; `AuthService.java` imports `Associate`, `AssociateNotFoundException`, `AssociateRepository`, `AssociateStatus` from the same package but not `AssociateRole`) and add it if missing:

```java
import com.plotchain.associate.AssociateRole;
```

Behaviorally this is an identical condition to before (`isAdminFamily()` was defined as `this != ASSOCIATE`, so `!isAdminFamily()` was always `role == ASSOCIATE`) — a mechanical inline, not a logic change.

- [ ] **Step 3: Delete the now-obsolete enum test**

Delete `backend/src/test/java/com/plotchain/associate/AssociateRoleTest.java` entirely — its two tests (`everyRoleExceptAssociateIsAdminFamily`, `associateIsNotAdminFamily`) exist solely to assert `isAdminFamily()`'s behavior across the four sub-roles, all of which are gone, and the method itself is gone.

```bash
git rm backend/src/test/java/com/plotchain/associate/AssociateRoleTest.java
```

- [ ] **Step 4: Compile-check (not run) — confirm the expected remaining breakage**

Run: `cd backend && ./mvnw test-compile`
Expected: **FAILS to compile.** At this point in the plan, seven more files still reference the deleted constants as literal Java code (`SecurityConfig.java` doesn't reference the enum constants directly so it's unaffected by *this* step, but `AdminAssociateControllerTest.java`, `KycReviewControllerTest.java`, `SecurityConfigTest.java`, `TreeExplorerControllerTest.java`, `CycleServiceTest.java`, `AdminControllerTest.java`, `AdminProvisioningServiceTest.java` all do). Confirm the compiler errors are all `cannot find symbol` errors pointing at `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` in exactly those seven files — if you see an error anywhere else, stop and investigate before continuing (it means this plan's file inventory missed something).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRole.java \
        backend/src/main/java/com/plotchain/auth/AuthService.java
git commit -m "refactor(associate): collapse AssociateRole to ADMIN/ASSOCIATE"
```

---

### Task 2: Collapse `SecurityConfig.java`'s blanket admin-family rule to plain `ADMIN`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`

**Interfaces:**
- Consumes: nothing new from Task 1 (this file references role names as strings inside `hasAnyAuthority(...)`/`hasAuthority(...)` calls, not as `AssociateRole` enum literals, so it was never a compile blocker — but its *string* arguments must still be narrowed to match the enum's new shape, or every one of the four deleted roles would authenticate successfully against a JWT that can no longer be minted for them, which is dead code, not a bug, but leaves stale/misleading authorization rules).
- Produces: every occurrence of the exact literal `.hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")` becomes `.hasAuthority("ADMIN")`.

- [ ] **Step 1: Confirm the exact occurrence count before editing**

Run: `grep -c 'hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")' backend/src/main/java/com/plotchain/auth/SecurityConfig.java`

Expected: `18` (not the spec's stale "14" — see Global Constraints). If you get a different number, the file has drifted further since this plan was written; proceed anyway, just make sure Step 3's post-edit grep returns `0`.

- [ ] **Step 2: Replace every occurrence**

The string `hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")` is byte-for-byte identical at all 18 call sites (four blanket write-method rules — `POST`/`PUT`/`PATCH`/`DELETE /api/**` — plus fourteen admin-family-only `GET` matchers covering setup-state, profile, branding, compensation+history, the payments/kyc/withdrawal/booking-emi group, the projects/plots group, the admin-team group, root-associates, audit-log, `/api/associates`, the admin/associates group, `/api/admin/tree/*`, `/api/admin/kyc`, and `/api/admin/stats`). Use a project-wide find/replace across just this file — every occurrence takes the identical replacement, so there's no risk of mismatching call sites:

```
hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
```
→
```
hasAuthority("ADMIN")
```

- [ ] **Step 3: Rewrite the one comment block whose reasoning is now wrong**

The block comment above the first blanket write rule (currently around lines 54-70) explains *why* `hasAnyAuthority` (plural) is used instead of `hasAuthority("ADMIN")` — that reasoning (four sub-roles need admin-equivalent write access, keyed off `AssociateRole.isAdminFamily()`) no longer applies now that `isAdminFamily()` is gone and there's only one admin-family role. Currently:

```java
                // Deny-by-default for writes: product policy is "admin (or staff) can write;
                // associates are read-only except their own profile". Without this, any future
                // POST/PUT/PATCH/DELETE endpoint would be reachable by every authenticated
                // associate unless its author remembered to add @PreAuthorize. When an
                // associate's own-profile write is built, it needs its own explicit matcher
                // placed above these blanket admin-family rules (same ordering trap as login
                // above).
                //
                // hasAnyAuthority, not hasAuthority("ADMIN"): the setup wizard's Admin Team
                // step creates SUPER_ADMIN/FINANCE/KYC_REVIEWER/SUPPORT accounts too
                // (AssociateRole.isAdminFamily() is the canonical list). A plain ADMIN-only
                // rule would lock every one of those roles out of every write in the
                // application -- silently, as 403s that look like a client bug. Per-role
                // narrowing (e.g. only FINANCE can approve withdrawals) is a named follow-up
                // (the setup wizard's Admin Team permission matrix), not assumed here: until
                // then, any admin-family role can write, matching the spec's statement that
                // the founding admin can act as all roles until more accounts are created.
```

Replace with:

```java
                // Deny-by-default for writes: product policy is "ADMIN can write; associates
                // are read-only except their own profile". Without this, any future
                // POST/PUT/PATCH/DELETE endpoint would be reachable by every authenticated
                // associate unless its author remembered to add @PreAuthorize. When an
                // associate's own-profile write is built, it needs its own explicit matcher
                // placed above these blanket rules (same ordering trap as login above).
                //
                // Only one role has back-office authority (role-capability unit 1,
                // docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                // "Role model" section) -- so the write rule is simply hasAuthority("ADMIN"),
                // not a multi-role hasAnyAuthority(...) list.
```

Leave the shorter repeated comments elsewhere in the file (the ones that say things like "stays admin-family-only" on each individual `GET` matcher block) as-is — they're still directionally true (each of those routes still requires the one admin role and nothing else); only the top block explicitly explained *why a multi-role check* was needed, which is the part that's now wrong.

- [ ] **Step 4: Confirm zero occurrences remain**

Run: `grep -c 'hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")' backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
Expected: `0`

- [ ] **Step 5: Compile-check**

Run: `cd backend && ./mvnw test-compile`
Expected: still fails — `SecurityConfig.java` itself now compiles fine (it only ever used string literals, no enum references), but the six remaining test files from Task 1 Step 4 are untouched. Confirm the failure list shrank by zero (this task didn't touch any of those seven files) but that no *new* compile error appeared in `SecurityConfig.java` or elsewhere.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java
git commit -m "refactor(auth): collapse SecurityConfig's admin-family rules to hasAuthority(ADMIN)"
```

---

### Task 3: Collapse `AdminAssociateController`'s narrowing; fix `AdminAssociateControllerTest`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AdminAssociateController.java`
- Modify: `backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java`

**Interfaces:**
- Consumes: `AssociateRole.ADMIN`/`AssociateRole.ASSOCIATE` from Task 1.
- Produces: suspend/reactivate/reset-password all require exactly `hasAuthority("ADMIN")`. No functional change versus today (`SUPER_ADMIN` was always admin-equivalent) — this is mechanical, unlike Task 4's KYC change.

- [ ] **Step 1: Collapse the three `@PreAuthorize` annotations**

In `backend/src/main/java/com/plotchain/associate/AdminAssociateController.java`, all three occurrences of:

```java
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")
```

(on `suspend`, `reactivate`, `resetPassword`) become:

```java
    @PreAuthorize("hasAuthority('ADMIN')")
```

- [ ] **Step 2: Fix the three `AssociateRole.SUPPORT` tokens used as "any admin-family token"**

`AdminAssociateControllerTest.java` uses `tokenFor(AssociateRole.SUPPORT)` at lines 84, 103, 117, purely as an arbitrary stand-in for "some admin-family role" in tests that don't care *which* admin role, just that admin-family tokens can reach the endpoint (`listReturnsAPageForAnyAdminFamilyToken`, `listClampsAnOversizedPageSizeToTheServerSideMaximum`, `listClampsANegativePageToZeroInsteadOfThrowing` — all against `GET /api/admin/associates`, a route this unit doesn't otherwise touch). Since `ADMIN` is now the only admin-family role, this swap is meaning-preserving, not a scope change:

```java
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
```
→ (all three occurrences)
```java
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
```

- [ ] **Step 3: Replace the two now-meaningless sub-role-forbidden tests**

`suspendIsForbiddenForAFinanceToken` (currently asserting `FINANCE` gets 403 on suspend because it passes the blanket write rule but fails the narrower `@PreAuthorize`) has no equivalent scenario anymore — there is no second admin-family role to be "narrower than." Currently:

```java
    @Test
    void suspendIsForbiddenForAFinanceToken() throws Exception {
        // 403 here proves the @PreAuthorize narrowing beyond the blanket admin-family POST rule:
        // FINANCE passes SecurityConfig's web-layer check but must be rejected by method security.
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE)))
            .andExpect(status().isForbidden());
    }
```

Replace with:

```java
    @Test
    void suspendIsForbiddenForAnAssociateToken() throws Exception {
        // 403 proves @PreAuthorize narrowing is still in force: ASSOCIATE is blocked twice over
        // (the blanket POST rule and this method's own @PreAuthorize), same reasoning the old
        // FINANCE-token test used to prove before FINANCE existed as a role.
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
```

Similarly, `resetPasswordIsForbiddenForAKycReviewerToken` currently:

```java
    @Test
    void resetPasswordIsForbiddenForAKycReviewerToken() throws Exception {
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/reset-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.KYC_REVIEWER)))
            .andExpect(status().isForbidden());
    }
```

Replace with:

```java
    @Test
    void resetPasswordIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/reset-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
```

- [ ] **Step 4: Compile-check**

Run: `cd backend && ./mvnw test-compile`
Expected: still fails — six files remain (`KycReviewControllerTest.java`, `SecurityConfigTest.java`, `TreeExplorerControllerTest.java`, `CycleServiceTest.java`, `AdminControllerTest.java`, `AdminProvisioningServiceTest.java`). Confirm `AdminAssociateControllerTest.java` no longer appears in the error list.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AdminAssociateController.java \
        backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java
git commit -m "refactor(associate): collapse AdminAssociateController authorization to hasAuthority(ADMIN)"
```

---

### Task 4: Collapse `KycReviewController.decide()`'s narrowing (real behavior change); fix `KycReviewControllerTest`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/KycReviewController.java`
- Modify: `backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java`

**Interfaces:**
- Consumes: `AssociateRole.ADMIN`/`AssociateRole.ASSOCIATE` from Task 1.
- Produces: **real behavior change** — `POST /api/admin/kyc/{associateId}/decision` no longer accepts a `KYC_REVIEWER` token (that role no longer exists at all, not just "no longer distinguished from ADMIN" — every KYC decision must now come from an `ADMIN` token).

- [ ] **Step 1: Collapse the `@PreAuthorize` annotation**

In `backend/src/main/java/com/plotchain/associate/KycReviewController.java`, `decide()`'s annotation currently reads:

```java
    @PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN','KYC_REVIEWER')")
```

Change to:

```java
    @PreAuthorize("hasAuthority('ADMIN')")
```

- [ ] **Step 2: Swap the five "any admin-family token" `FINANCE`/`KYC_REVIEWER` tokens to `ADMIN`**

In `backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java`, these four call sites use `tokenFor(AssociateRole.FINANCE)` purely as an arbitrary admin-family stand-in against routes this task doesn't otherwise touch (`GET /api/admin/kyc`, `GET /api/admin/kyc/counts`) — lines 72 (`listDefaultsToPendingAndAllowsAnyAdminFamilyToken`), 83 (`listClampsAnOversizedPageSizeToTheServerSideMaximum`), 98 (`listClampsANegativePageToZeroInsteadOfThrowing`), 138 (`countsReturnsCountsForAnyAdminFamilyToken`). Swap all four to `tokenFor(AssociateRole.ADMIN)`.

Line 113, inside `decideSucceedsForAKycReviewerToken`, uses `tokenFor(AssociateRole.KYC_REVIEWER)` — swap to `tokenFor(AssociateRole.ADMIN)` and rename the test to `decideSucceedsForAnAdminToken` (its body needs no other change).

(Do not touch line 125's `tokenFor(AssociateRole.FINANCE)` individually — it's inside the test replaced wholesale in Step 3 below.)

- [ ] **Step 3: Replace the now-wrong `decideIsForbiddenForAFinanceToken` test**

Currently:

```java
    @Test
    void decideIsForbiddenForAFinanceToken() throws Exception {
        // 403 proves @PreAuthorize narrowing: FINANCE passes the blanket admin-family POST
        // rule at the web layer but is not in KycReviewController's allowed-authority list.
        mockMvc.perform(post("/api/admin/kyc/" + ASSOCIATE_ID + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.FINANCE))
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new KycDecisionRequest(KycStatus.VERIFIED, null))))
            .andExpect(status().isForbidden());
    }
```

Replace with:

```java
    @Test
    void decideIsForbiddenForAnAssociateToken() throws Exception {
        // 403 proves @PreAuthorize narrowing: ASSOCIATE passes no admin-family rule at all
        // (blocked twice over -- the blanket POST rule and this method's own @PreAuthorize).
        mockMvc.perform(post("/api/admin/kyc/" + ASSOCIATE_ID + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(new KycDecisionRequest(KycStatus.VERIFIED, null))))
            .andExpect(status().isForbidden());
    }
```

- [ ] **Step 4: Compile-check**

Run: `cd backend && ./mvnw test-compile`
Expected: still fails — `SecurityConfigTest.java`, `TreeExplorerControllerTest.java`, `CycleServiceTest.java`, `AdminControllerTest.java`, `AdminProvisioningServiceTest.java` remain. Confirm `KycReviewControllerTest.java` no longer appears in the error list.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/KycReviewController.java \
        backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java
git commit -m "refactor(associate): collapse KYC decision authorization to hasAuthority(ADMIN) (KYC_REVIEWER role removed)"
```

---

### Task 5: Fix `SecurityConfigTest.java`'s compile-breaking and now-wrong assertions

**Files:**
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `AssociateRole.ADMIN`/`AssociateRole.ASSOCIATE` from Task 1, `SecurityConfig`'s collapsed matchers from Task 2.
- Produces: every compile-breaking or `isAdminFamily()`-dependent assertion in this file is fixed. Two pre-existing test methods (unrelated to this file's compile-breaking issue) are explicitly left untouched and documented as expected residual red — see Task 7's classification.

- [ ] **Step 1: Fix the one literal enum reference (compile-breaking)**

Line 582, inside `kycDecisionIsForbiddenForASupportToken`, currently:

```java
    @Test
    void kycDecisionIsForbiddenForASupportToken() throws Exception {
        mockMvc.perform(post("/api/admin/kyc/" + UUID.randomUUID() + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT))
                .contentType("application/json")
                .content("{\"decision\":\"VERIFIED\"}"))
            .andExpect(status().isForbidden());
    }
```

Replace with:

```java
    @Test
    void kycDecisionIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/kyc/" + UUID.randomUUID() + "/decision")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"decision\":\"VERIFIED\"}"))
            .andExpect(status().isForbidden());
    }
```

- [ ] **Step 2: Fix the two `isAdminFamily()` calls (compile-breaking — the method no longer exists)**

Line 383, inside `auditLogIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate`:

```java
            .andExpect(status().is(role.isAdminFamily() ? 200 : 403));
```
→
```java
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
```

Line 395, inside `adminStatsIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate` — identical change:

```java
            .andExpect(status().is(role.isAdminFamily() ? 200 : 403));
```
→
```java
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
```

Both tests use `@ParameterizedTest @EnumSource(AssociateRole.class)` (every role, not a hardcoded name list), so with the enum now at two values these simply run for `ADMIN` and `ASSOCIATE` — no other change needed. Both routes (`/api/company/audit-log`, `/api/admin/stats`) are general routes, not Admin-Team/Root-Associate-specific, so this fix belongs squarely to this unit.

- [ ] **Step 3: Do NOT touch two specific tests — verify they're the only ones left referencing deleted role names**

Run: `grep -n 'names = {"ADMIN", "SUPER_ADMIN"}\|names = {"FINANCE", "KYC_REVIEWER", "SUPPORT", "ASSOCIATE"}' backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

Expected: two hits — `createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens` (line ~258, `@EnumSource(value = AssociateRole.class, names = {"ADMIN", "SUPER_ADMIN"})`) and `createAdminIsForbiddenForNonAdminTokens` (line ~270, `@EnumSource(value = AssociateRole.class, names = {"FINANCE", "KYC_REVIEWER", "SUPPORT", "ASSOCIATE"})`). Leave both exactly as they are.

These two are **not** compile-breaking (the `names` attribute is a plain `String[]`, resolved by JUnit at test-run time, not by javac) — but they **will** fail at test-run time with a `JUnitException`/`PreconditionViolationException` (no enum constant named `SUPER_ADMIN` etc.) once the enum has shrunk. Both exercise `POST /api/company/admins`, the Admin Team creation route — a route and a role-narrowing rule (`ADMIN`/`SUPER_ADMIN`-only creation) that belongs entirely to unit 4's scope (Admin Team removal), not this unit's. Do not delete, rewrite, or "fix" them here; unit 4 deletes them wholesale alongside `AdminController` itself. Task 7's verification step names both explicitly as expected residual red.

Do **not** touch the following look-alike tests even though their names mention "AdminFamily" or target Admin-Team/Root-Associate routes — verified by re-reading each one that none of them hardcode a deleted role's *name*, only use `@EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)` (i.e., "every role except ASSOCIATE") or a single hardcoded `ASSOCIATE` token, both of which remain perfectly valid once the enum has two values — these compile fine and stay green with no edits: `writeRequestsPassTheSecurityLayerForAnyAdminFamilyToken`, `setupStateIsReachableForAnyAdminFamilyToken`, `compensationIsReachableForAnyAdminFamilyToken`, `paymentsIsReachableForAnyAdminFamilyToken`, `projectsIsReachableForAnyAdminFamilyToken`, `adminsListIsForbiddenForAnAssociateToken`, `adminsListIsReachableForAnyAdminFamilyToken`, `userIdAvailabilityIsForbiddenForAnAssociateToken`, `userIdAvailabilityIsReachableForAnyAdminFamilyToken`, `rolePermissionsIsForbiddenForAnAssociateToken`, `rolePermissionsIsReachableForAnyAdminFamilyToken`, `rootAssociatesListIsForbiddenForAnAssociateToken`, `rootAssociatesListIsReachableForAnyAdminFamilyToken`, `associatesListIsForbiddenForAnAssociateToken`, `associatesListIsReachableForAnyAdminFamilyToken`. (This is a narrower "leave alone" list than the pre-existing `2026-08-03-role-model-collapse.md` reference plan assumed — that plan's Task 3 Step 4 comment lumped all of these in with the two genuinely-broken ones without tracing the exact parameterization mechanism; only the two named above actually break.)

- [ ] **Step 4: Compile-check**

Run: `cd backend && ./mvnw test-compile`
Expected: still fails — `TreeExplorerControllerTest.java`, `CycleServiceTest.java`, `AdminControllerTest.java`, `AdminProvisioningServiceTest.java` remain (four files). Confirm `SecurityConfigTest.java` no longer appears in the error list.

- [ ] **Step 5: Commit**

```bash
git add backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "test(auth): fix SecurityConfigTest's isAdminFamily() and SUPPORT-token references"
```

---

### Task 6: Fix the remaining collateral compile breaks outside this unit's own files

**Files:**
- Modify: `backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/company/AdminControllerTest.java`
- Modify: `backend/src/test/java/com/plotchain/company/AdminProvisioningServiceTest.java`

**Interfaces:**
- Consumes: the shrunk `AssociateRole` enum from Task 1.
- Produces: the whole backend module compiles again. `TreeExplorerControllerTest.java` and `CycleServiceTest.java` fixes are fully meaning-preserving (their tests stay green). `AdminControllerTest.java` and `AdminProvisioningServiceTest.java` get the *minimal* edit required to compile — nothing else — because both test files belong entirely to the Admin Team feature (`AdminController`/`AdminProvisioningService`), which is unit 4's scope to delete, not this unit's to rewrite or gut. Several of their tests go newly red as a direct, unavoidable consequence of the enum shrink; Task 7 names them explicitly as expected residual red.

- [ ] **Step 1: `TreeExplorerControllerTest.java` — three meaning-preserving swaps**

This file tests `TreeExplorerController` (`/api/admin/tree/*`), a route untouched by this unit. All three uses of `AssociateRole.SUPPORT` (lines 75, 109, 134) are, like Task 3's swaps, arbitrary admin-family stand-ins in tests titled `subtreeReturnsTheRootNodeForAnyAdminFamilyToken`, `subtreeClampsAnExcessivelyLargeDepthRequestToTheServerSideMaximum`, and `searchReturnsTheAncestorPath`. Swap all three:

```java
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.SUPPORT)))
```
→
```java
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
```

- [ ] **Step 2: `CycleServiceTest.java` — two meaning-preserving swaps**

This file tests `CycleService` (already-merged cycle-management domain), unrelated to role-capability entirely — the compile break is pure collateral damage from a shared enum. Both tests assert that a non-`ASSOCIATE` staff role is skipped from rank/royalty processing; the specific staff role used (`FINANCE`) was always interchangeable with any other non-`ASSOCIATE` role for this assertion, so swapping to `ADMIN` preserves the test's meaning exactly.

Line 889, inside `closeSkipsRankAdvancementForNonAssociateStaffRoles`:

```java
        // FINANCE is one of the four staff roles chk_associate_rank_required also exempts from
        // needing a rank (V4__user_id_login_and_admin_roles.sql) -- not just ADMIN.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.FINANCE);
```

Replace with:

```java
        // ADMIN is exempt from needing a rank (chk_associate_rank_required,
        // V4__user_id_login_and_admin_roles.sql) same as any non-ASSOCIATE role always was.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.ADMIN);
```

(Leave the local variable named `financeStaff` — renaming it is optional polish, not required for correctness, and this task's job is the minimal compile/meaning-preserving fix, not a rename sweep.)

Line 1446, inside `closeSkipsRoyaltyForNonAssociateStaffRoles` — identical pattern:

```java
        // FINANCE is one of the four staff roles chk_associate_rank_required also exempts from
        // needing a rank (V4__user_id_login_and_admin_roles.sql) -- not just ADMIN, same fact
        // unit 6's advanceRanks guard already established.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.FINANCE);
```

Replace with:

```java
        // ADMIN is exempt from needing a rank (chk_associate_rank_required,
        // V4__user_id_login_and_admin_roles.sql) same as any non-ASSOCIATE role always was,
        // same fact unit 6's advanceRanks guard already established.
        Associate financeStaff = associateFixture(null, null);
        financeStaff.setRole(AssociateRole.ADMIN);
```

- [ ] **Step 3: `AdminControllerTest.java` — one compile-only fix, nothing else**

Line 106, inside `listReturnsAdminFamilySummaries`:

```java
        finance.setRole(AssociateRole.FINANCE);
```

Change only this line to:

```java
        finance.setRole(AssociateRole.ADMIN);
```

Do not touch the rest of the test (the `jsonPath("$[0].role").value("FINANCE")` assertion on line 114, or anything else in this file). That assertion will now fail (actual value is `"ADMIN"`) — this is expected, not something to chase down further; `AdminController` itself is deleted wholesale by unit 4, at which point this whole test file goes with it.

- [ ] **Step 4: `AdminProvisioningServiceTest.java` — two compile-only fixes, nothing else**

Line 69, inside `createWithExplicitTemporaryPasswordPersistsCorrectly`:

```java
        assertThat(created.getRole()).isEqualTo(AssociateRole.FINANCE);
```
→
```java
        assertThat(created.getRole()).isEqualTo(AssociateRole.ADMIN);
```

Line 163, inside `listExcludesAssociateRows`:

```java
        Associate finance = adminFamilyRow(AssociateRole.FINANCE);
```
→
```java
        Associate finance = adminFamilyRow(AssociateRole.ADMIN);
```

Do not touch anything else in this file — not the `"FINANCE"`/`"SUPPORT"` string literals passed into `CreateAdminRequest` elsewhere in the file (those are request payload strings the production `AdminProvisioningService.parseAssignableRole()` parses via `AssociateRole.valueOf(...)`, and will now throw `InvalidAdminRoleException` for those particular strings — expected, not a regression to chase down), and not any assertion text. `AdminProvisioningService` is deleted wholesale by unit 4.

- [ ] **Step 5: Full compile check — this is the first point the whole module compiles**

Run: `cd backend && ./mvnw test-compile`
Expected: `BUILD SUCCESS`. If it still fails, re-run the file-inventory grep from the Global Constraints section (`grep -rn "AssociateRole\.\(SUPER_ADMIN\|FINANCE\|KYC_REVIEWER\|SUPPORT\)\b" backend/src/main/java backend/src/test/java`) to confirm nothing was missed — it should return zero results.

- [ ] **Step 6: Commit**

```bash
git add backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java \
        backend/src/test/java/com/plotchain/cycle/CycleServiceTest.java \
        backend/src/test/java/com/plotchain/company/AdminControllerTest.java \
        backend/src/test/java/com/plotchain/company/AdminProvisioningServiceTest.java
git commit -m "test: fix collateral AssociateRole enum-literal compile breaks outside this unit's scope"
```

---

### Task 7: Full test run and expected-red/green classification

**Files:** none modified — verification only.

**Interfaces:** none.

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && ./mvnw test`

Expected: `BUILD SUCCESS` overall is *not* guaranteed (Maven's Surefire plugin fails the build if any test fails, by default) — expect the run to report a handful of failing tests, all of which should match the list below. If any test fails that is **not** on this list, stop and investigate before treating this unit as done — that would be a real regression, not expected residual red.

- [ ] **Step 2: Confirm the failing tests are exactly this list (expected residual red — not this unit's job to fix, resolved when unit 4 lands)**

| Test class | Test method | Why it's red | Resolved by |
|---|---|---|---|
| `SecurityConfigTest` | `createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens` | `@EnumSource(names = {"ADMIN","SUPER_ADMIN"})` — `SUPER_ADMIN` no longer exists, JUnit throws resolving the parameter source | unit 4 (deletes `AdminController` + this test) |
| `SecurityConfigTest` | `createAdminIsForbiddenForNonAdminTokens` | `@EnumSource(names = {"FINANCE","KYC_REVIEWER","SUPPORT","ASSOCIATE"})` — three of the four names no longer exist | unit 4 |
| `AdminControllerTest` | `listReturnsAdminFamilySummaries` | Seeded role forced to `ADMIN` (Task 6) so the file compiles; test still asserts the JSON response's `role` equals `"FINANCE"` | unit 4 |
| `AdminControllerTest` | `createReturnsConflictForADuplicateUserId` | Request body's `"role":"SUPPORT"` no longer parses (`AssociateRole.valueOf("SUPPORT")` throws); the resulting error response is no longer the expected 409 conflict | unit 4 |
| `AdminProvisioningServiceTest` | `createWithExplicitTemporaryPasswordPersistsCorrectly` | Requests role `"FINANCE"`; `parseAssignableRole` now throws `InvalidAdminRoleException` before any assertion runs | unit 4 |
| `AdminProvisioningServiceTest` | `createWithBlankTemporaryPasswordGeneratesAndReturnsOne` | Requests role `"SUPPORT"`; same cause | unit 4 |
| `AdminProvisioningServiceTest` | `rejectsADuplicateUserId` | Requests role `"SUPPORT"`; role parsing now fails *before* the duplicate-userId check this test means to exercise, so the thrown exception type no longer matches the test's `isInstanceOf(UserIdAlreadyRegisteredException.class)` assertion | unit 4 |
| `AdminProvisioningServiceTest` | `createRecordsAnAuditEntryWithoutLeakingTheTemporaryPassword` | Requests role `"FINANCE"`; same cause as the two above | unit 4 |

Any other test method in `AdminControllerTest.java` or `AdminProvisioningServiceTest.java` not listed above (e.g. `rejectsAssociateAsATargetRole`, `rejectsAdminAsATargetRole`, `isCompleteIsFalseWithOnlyTheFoundingAdmin`, `isCompleteIsTrueWithTwoOrMoreAdminFamilyRows`, `listExcludesAssociateRows`, `userIdAvailabilityIsTrueWhenNotTaken`) should be green — they either don't touch role-parsing at all, or only use `ASSOCIATE`/`ADMIN`, both of which are unaffected. If any of those turn up red too, that's new information worth a closer look before proceeding, but is not, on its own, a reason to alter this unit's scope.

Also expect **green** (not listed above, despite testing Admin-Team/Root-Associate routes) all of: `adminsListIsForbiddenForAnAssociateToken`, `adminsListIsReachableForAnyAdminFamilyToken`, `userIdAvailabilityIsForbiddenForAnAssociateToken`, `userIdAvailabilityIsReachableForAnyAdminFamilyToken`, `rolePermissionsIsForbiddenForAnAssociateToken`, `rolePermissionsIsReachableForAnyAdminFamilyToken`, `rootAssociatesListIsForbiddenForAnAssociateToken`, `rootAssociatesListIsReachableForAnyAdminFamilyToken` (all in `SecurityConfigTest`) — their routes still exist, still correctly require `ADMIN`, and their `@EnumSource`/token usage never hardcoded a deleted role name, so the enum shrink doesn't touch their outcome.

- [ ] **Step 3: Confirm everything else is green**

Every test not named in Step 2's table, across every package, should pass. This includes (non-exhaustively, as a sanity check): `AssociateRoleTest` (deleted, N/A), `AuthServiceTest`, `AuthControllerTest`, `KycReviewControllerTest`, `AdminAssociateControllerTest`, `TreeExplorerControllerTest`, `CycleServiceTest`, and every test in `SecurityConfigTest` other than the two named above.

- [ ] **Step 4: No commit for this task** — it's verification-only. If Step 1 surfaced any unexpected failure, go back to the relevant task, fix it there, and re-run from Task 6 Step 5 forward.

---

## Self-Review

**Spec coverage** — every line of the spec's "Mechanical role-collapse" bullets that concerns this unit (not units 2-4) maps to a task: `AssociateRole` enum + `isAdminFamily()` removal (Task 1), `SecurityConfig.java`'s 18 (not 14) `hasAnyAuthority(...)` occurrences (Task 2), `AdminAssociateController` narrowing (Task 3), `KycReviewController.decide()` narrowing — flagged as the one real behavior change (Task 4). The "Role model" section's "exactly two roles, ADMIN and ASSOCIATE, no others" is what Task 1 produces. Test-file fixes explicitly named in the unit's acceptance criteria (`KycReviewControllerTest`, `SecurityConfigTest`, `AssociateRoleTest`) are covered in Tasks 1, 4, 5. The task brief's "known constraint" — distinguishing genuinely-caused-by-this-unit fixable red from Admin-Team/Root-Associate-route expected residual red — is the entire content of Task 7's classification table, built from tracing each test's actual mechanics (not assumed from the stale reference plan's blanket "leave them for now" comment).

**Placeholder scan** — no TBD/TODO. Every step gives literal before/after code, not a description of what to do. The one spot that says "optional polish, not required" (Task 6 Step 2's `financeStaff` variable name) is an explicit scope call, not a deferred decision.

**Type consistency** — `AssociateRole.ADMIN`/`AssociateRole.ASSOCIATE` are the only two symbols referenced anywhere after Task 1, and every later task's code snippets use exactly those two names, nothing else. `AuthService`'s new `AssociateRole` import is called out explicitly (Task 1 Step 2) since the class didn't previously import that type.

**New finding beyond the spec and the pre-existing reference plan**: the compile-breaking footprint (8 files, not the 3-4 the spec and reference plan anticipated) and the exact 18-vs-14 `SecurityConfig` occurrence count. Both are called out in Global Constraints and handled task-by-task rather than silently patched.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-05-role-capability-unit-1-admin-only-authority.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
