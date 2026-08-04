# Role Model Collapse & Associate Self-Service Gap-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the six-role model (`ADMIN`, `ASSOCIATE`, `SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`) down to the two roles the product actually needs (`ADMIN`, `ASSOCIATE`), fold the separately-seeded Root Associate into the Admin account itself, fix the two real data-visibility scope bugs the reconciliation audit found, and add the small associate-facing reads (own subtree, own profile) for domains whose backend already exists.

**Architecture:** No new services or packages. This is subtraction (delete `AdminController`/`AdminProvisioningService`/`AdminRolePermissions` and `RootAssociateController`/`RootAssociateProvisioningService` and everything that depends on them) plus small additions inside two already-existing packages (`tree`, `associate`) for the two new self-service reads. One new Flyway migration seeds the founding admin account directly, replacing the environment-variable `ApplicationRunner` that does it today.

**Tech Stack:** Spring Boot (Java), Spring Security method + URL authorization, Flyway/PostgreSQL (H2 in tests), Angular (frontend deletions only in this plan).

## Global Constraints

- Spec of record: `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md`. Every task below traces to a specific line in that spec's Reconciliation & gap-fill or Out-of-scope/removed sections — don't invent scope beyond it.
- **Not in this plan**: Sales, Income/Ledger, Wallet/Withdrawal, Cycle Management, e-PIN, Announcements, Support Tickets — none of these has a controller today, and none has been through its own brainstorming/spec pass yet. Each is a separate future spec + plan.
- **Not in this plan**: new frontend UI for the two new associate-facing endpoints this plan adds (My Tree, own-profile edit). Both land backend-only here; consuming them in the Associate app is a small follow-up once a UI pattern is agreed, not fabricated here without a design pass.
- Confirmed: no deployed database carries `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT`-role rows or a seeded Root Associate row (local/dev only) — migrations below edit existing files in place rather than adding a backfill step.
- Run backend tests with `cd backend && ./mvnw test`. Run frontend tests with `cd frontend && npm test -- --watch=false`.
- **After Task 1's migration edit**, any existing local Postgres dev database must be dropped and recreated (or `flyway clean`'d) before the app boots again — editing an already-applied migration file changes its checksum, and Flyway refuses to start against a database that already recorded the old checksum. Fresh H2 test runs are unaffected (each test run applies migrations from scratch).

---

### Task 1: Seed the founding Admin via Flyway; delete `AdminBootstrapRunner`

**Files:**
- Modify: `backend/src/main/resources/db/migration/V4__user_id_login_and_admin_roles.sql:24-26`
- Create: `backend/src/main/resources/db/migration/V16__narrow_role_and_seed_admin.sql`
- Delete: `backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java`
- Delete: `backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java`
- Modify: `backend/src/main/resources/application.yml:23-29`

**Interfaces:**
- Produces: a guaranteed single `associate` row with `role = 'ADMIN'`, `user_id = 'admin'`, `parent_id = NULL`, `must_change_password = true`, present in every environment (including every test run) without any environment variable. Later tasks and the test suite can rely on this row existing.

- [ ] **Step 1: Narrow the role CHECK constraint back to two values**

`V4__user_id_login_and_admin_roles.sql` is edited in place (confirmed safe: local/dev only, no row anywhere uses the four sub-roles). Change lines 24-26 from:

```sql
ALTER TABLE associate DROP CONSTRAINT chk_associate_role;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role
    CHECK (role IN ('ADMIN','ASSOCIATE','SUPER_ADMIN','FINANCE','KYC_REVIEWER','SUPPORT'));
```

to:

```sql
ALTER TABLE associate DROP CONSTRAINT chk_associate_role;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role
    CHECK (role IN ('ADMIN','ASSOCIATE'));
```

- [ ] **Step 2: Write the new migration that seeds the admin row**

Create `backend/src/main/resources/db/migration/V16__narrow_role_and_seed_admin.sql`:

```sql
-- Replaces AdminBootstrapRunner (an ApplicationRunner that seeded this row from environment
-- variables on first boot). Seeding via migration means the founding admin always exists,
-- in every environment including tests, with no configuration required.
--
-- Default password: ChangeMe123! (bcrypt below). must_change_password forces rotation on
-- first login, which is what makes shipping a fixed default acceptable.
INSERT INTO associate (
    id, user_id, name, email, password_hash, role, rank_id, kyc_status, status,
    joined_at, cumulative_matched_volume, must_change_password, parent_id, sponsor_id, position
) VALUES (
    '00000000-0000-0000-0000-000000000001', 'admin', 'Administrator', NULL,
    '$2y$10$ORH947YA1eB0KylD0vmjVehXirKw.GBb0DtvswJcOqkiDHNt0IspO',
    'ADMIN', NULL, 'VERIFIED', 'ACTIVE', now(), 0, true, NULL, NULL, NULL
);
```

- [ ] **Step 3: Delete `AdminBootstrapRunner` and its test**

Delete `backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java` and `backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java` entirely.

- [ ] **Step 4: Remove the now-unused bootstrap config**

In `backend/src/main/resources/application.yml`, remove lines 26-29:

```yaml
  bootstrap:
    admin-user-id: ${PLOTCHAIN_ADMIN_USER_ID:admin}
    admin-email: ${PLOTCHAIN_ADMIN_EMAIL:}
    admin-password: ${PLOTCHAIN_ADMIN_PASSWORD:}
```

leaving:

```yaml
plotchain:
  associate-id-prefix: ${PLOTCHAIN_ASSOCIATE_ID_PREFIX:VP}
  secrets-key: ${PLOTCHAIN_SECRETS_KEY:dev-only-change-me-this-encryption-key-needs-32-bytes-too}
```

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && ./mvnw test`
Expected: compile fails right now (many files still reference the four deleted sub-roles) — that's expected until Task 2. If it compiles this far without those references, expect green except for anything already broken before this task started.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/resources/db/migration/V4__user_id_login_and_admin_roles.sql \
        backend/src/main/resources/db/migration/V16__narrow_role_and_seed_admin.sql \
        backend/src/main/resources/application.yml
git rm backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java \
       backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java
git commit -m "feat(auth): seed founding admin via Flyway migration, drop AdminBootstrapRunner"
```

---

### Task 2: Collapse `AssociateRole` to `ADMIN`/`ASSOCIATE`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRole.java`
- Modify: `backend/src/main/java/com/plotchain/auth/AuthService.java:51`
- Delete: `backend/src/test/java/com/plotchain/associate/AssociateRoleTest.java`

**Interfaces:**
- Consumes: nothing new.
- Produces: `AssociateRole` now has exactly two constants, no `isAdminFamily()` method. Every later task's `@PreAuthorize`/`hasAnyAuthority` edits assume this is already done.

- [ ] **Step 1: Shrink the enum**

Replace `backend/src/main/java/com/plotchain/associate/AssociateRole.java` entirely:

```java
package com.plotchain.associate;

public enum AssociateRole {
    ADMIN, ASSOCIATE
}
```

- [ ] **Step 2: Fix the one caller of the removed `isAdminFamily()`**

In `backend/src/main/java/com/plotchain/auth/AuthService.java`, line 51 currently reads:

```java
if (!associate.getRole().isAdminFamily() && !setupStateService.isLaunched()) {
```

Change to:

```java
if (associate.getRole() == AssociateRole.ASSOCIATE && !setupStateService.isLaunched()) {
```

(Behaviorally identical now that `isAdminFamily()` was always `role != ASSOCIATE` — this is a mechanical inline of that same condition.)

- [ ] **Step 3: Delete the now-obsolete enum test**

Delete `backend/src/test/java/com/plotchain/associate/AssociateRoleTest.java` — it existed solely to assert `isAdminFamily()`'s behavior across the four sub-roles, all of which are gone.

- [ ] **Step 4: Compile and run the auth package's tests**

Run: `cd backend && ./mvnw test -Dtest=AuthServiceTest,AuthControllerTest`
Expected: still red — `SecurityConfigTest`, `KycReviewControllerTest`, and others still reference the deleted enum constants (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`). That's expected; those are fixed in Tasks 3-5.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateRole.java \
        backend/src/main/java/com/plotchain/auth/AuthService.java
git rm backend/src/test/java/com/plotchain/associate/AssociateRoleTest.java
git commit -m "refactor(associate): collapse AssociateRole to ADMIN/ASSOCIATE"
```

---

### Task 3: Collapse authorization to plain `ADMIN`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AdminAssociateController.java`
- Modify: `backend/src/main/java/com/plotchain/associate/KycReviewController.java`
- Modify: `backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java`

**Interfaces:**
- Consumes: `AssociateRole.ADMIN`/`AssociateRole.ASSOCIATE` from Task 2.
- Produces: every previously admin-family-gated route now requires exactly `hasAuthority("ADMIN")`. This is the one task with a **real behavior change**: `KycReviewController.decide()` no longer accepts a `KYC_REVIEWER` token (that role no longer exists).

- [ ] **Step 1: Collapse every blanket rule in `SecurityConfig.java`**

Every occurrence of `.hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")` becomes `.hasAuthority("ADMIN")`. This appears on the following matchers (grep `hasAnyAuthority` in the file to confirm you've caught all of them before moving on): the four write-method blanket rules (`POST`/`PUT`/`PATCH`/`DELETE /api/**`), and the admin-family-only `GET` matchers for `setup-state`, `profile`, `branding`, `compensation`+`history`, `payments`/`payout-account`/`kyc`/`withdrawal`/`booking-emi`, `projects`+children, `admins`+children, `root-associates`, `audit-log`, `/api/associates`, `/api/admin/associates`+`/*`, `/api/admin/tree/*`, `/api/admin/kyc`, `/api/admin/stats`.

Also update the two comments above the blanket write rule (lines ~54-70) that explain the admin-family reasoning — they currently say things like "hasAnyAuthority, not hasAuthority('ADMIN')... AssociateRole.isAdminFamily() is the canonical list" — replace with a short comment noting there are now only two roles, so a blanket write rule is simply `hasAuthority("ADMIN")`.

- [ ] **Step 2: Collapse the two `@PreAuthorize` narrowings**

In `AdminAssociateController.java`, all three occurrences of `@PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN')")` (suspend, reactivate, reset-password) become `@PreAuthorize("hasAuthority('ADMIN')")`.

In `KycReviewController.java`, the `decide()` method's `@PreAuthorize("hasAnyAuthority('ADMIN','SUPER_ADMIN','KYC_REVIEWER')")` becomes `@PreAuthorize("hasAuthority('ADMIN')")`.

- [ ] **Step 3: Fix `KycReviewControllerTest.java`**

Change every `tokenFor(AssociateRole.FINANCE)` (lines 72, 83, 98, 138) and `tokenFor(AssociateRole.KYC_REVIEWER)` (line 113) to `tokenFor(AssociateRole.ADMIN)`.

Replace `decideIsForbiddenForAFinanceToken` (currently asserts `FINANCE` gets 403 on decide) with a test asserting `ASSOCIATE` gets 403 — that's the only remaining role that should be rejected:

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

Rename `decideSucceedsForAKycReviewerToken` to `decideSucceedsForAnAdminToken` (its body needs no other change beyond the `tokenFor` swap already made above).

- [ ] **Step 4: Fix `SecurityConfigTest.java`'s two `isAdminFamily()` uses**

Lines 373 and 385 currently read `role.isAdminFamily() ? 200 : 403`. Since `isAdminFamily()` no longer exists, change both to `role == AssociateRole.ADMIN ? 200 : 403`.

Replace `kycDecisionIsForbiddenForASupportToken` (line 428, uses the deleted `AssociateRole.SUPPORT`) with:

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

(The `createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens`, `createAdminIsForbiddenForNonAdminTokens`, `adminsListIs*`, `userIdAvailabilityIs*`, `rolePermissionsIs*`, and `rootAssociatesListIs*` tests in this same file also reference deleted roles/routes — leave them for now, they're deleted wholesale in Tasks 4 and 5.)

- [ ] **Step 5: Run the affected tests**

Run: `cd backend && ./mvnw test -Dtest=KycReviewControllerTest,AdminAssociateControllerTest`
Expected: PASS (the `SecurityConfigTest` run stays red until Tasks 4-5 remove the routes it still references — that's expected).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/main/java/com/plotchain/associate/AdminAssociateController.java \
        backend/src/main/java/com/plotchain/associate/KycReviewController.java \
        backend/src/test/java/com/plotchain/associate/KycReviewControllerTest.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "refactor(auth): collapse admin-family authorization to plain ADMIN"
```

---

### Task 4: Delete the Admin Team feature

**Files:**
- Delete: `backend/src/main/java/com/plotchain/company/AdminController.java`
- Delete: `backend/src/main/java/com/plotchain/company/AdminProvisioningService.java`
- Delete: `backend/src/main/java/com/plotchain/company/AdminRolePermissions.java`
- Delete: `backend/src/main/java/com/plotchain/company/CreateAdminRequest.java`
- Delete: `backend/src/main/java/com/plotchain/company/CreateAdminResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/AdminSummaryResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/UserIdAvailabilityResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/InvalidAdminRoleException.java`
- Delete: `backend/src/main/java/com/plotchain/company/UserIdAlreadyRegisteredException.java`
- Modify: `backend/src/main/java/com/plotchain/company/CompanyExceptionHandler.java`
- Modify: `backend/src/main/java/com/plotchain/company/SetupStateService.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`
- Delete any `AdminControllerTest.java` / `AdminProvisioningServiceTest.java` / `AdminRolePermissionsTest.java` found in `backend/src/test/java/com/plotchain/company/`

**Interfaces:**
- Produces: `POST/GET /api/company/admins*` no longer exist. `SetupStateService` drops step 6.

- [ ] **Step 1: Confirm the two exception classes aren't reused elsewhere before deleting**

Run: `grep -rn "InvalidAdminRoleException\|UserIdAlreadyRegisteredException" backend/src/main/java backend/src/test/java`
Expected: only hits inside the files listed for deletion above and their handler in `CompanyExceptionHandler`. (`AssociateProvisioningService`'s own duplicate-email path throws `EmailAlreadyRegisteredException`, a different class — confirm that stays separate, not deleted.)

- [ ] **Step 2: Delete the Admin Team backend files**

```bash
git rm backend/src/main/java/com/plotchain/company/AdminController.java \
       backend/src/main/java/com/plotchain/company/AdminProvisioningService.java \
       backend/src/main/java/com/plotchain/company/AdminRolePermissions.java \
       backend/src/main/java/com/plotchain/company/CreateAdminRequest.java \
       backend/src/main/java/com/plotchain/company/CreateAdminResponse.java \
       backend/src/main/java/com/plotchain/company/AdminSummaryResponse.java \
       backend/src/main/java/com/plotchain/company/UserIdAvailabilityResponse.java \
       backend/src/main/java/com/plotchain/company/InvalidAdminRoleException.java \
       backend/src/main/java/com/plotchain/company/UserIdAlreadyRegisteredException.java
```

Also delete their test counterparts — run `find backend/src/test/java/com/plotchain/company -iname "Admin*Test.java"` and `git rm` every match.

- [ ] **Step 3: Remove their exception handlers**

In `CompanyExceptionHandler.java`, remove the `handleInvalidAdminRole` and `handleUserIdAlreadyRegistered` methods (lines 24-32 in the current file), keeping `handleLaunchBlocked` and `handleInvalidLogoUpload`.

- [ ] **Step 4: Drop admin-team-only repository methods**

In `AssociateRepository.java`, delete `findByRoleNotOrderByUserIdAsc` (line 67) and `countByRoleNot` (line 73) — both existed only to serve `AdminProvisioningService.list()`/`isComplete()`, just deleted.

- [ ] **Step 5: Remove the Admin Team step from `SetupStateService`**

Remove the `adminProvisioningService` field, constructor parameter, and constructor assignment. Remove `new StepDefinition(6, "adminTeam", false),` from `STEP_DEFINITIONS` and renumber the remaining two entries (`rootAssociates` becomes 6, `reviewLaunch` becomes 7) — though Task 5 removes `rootAssociates` too, so after both tasks `reviewLaunch` ends up as step 6. Remove the `case "adminTeam" -> adminProvisioningService.isComplete();` branch from `isStepComplete`.

- [ ] **Step 6: Remove the `/api/company/admins*` matcher from `SecurityConfig.java`**

Delete the three-line comment block and matcher (currently around lines 47-53):

```java
                .requestMatchers(HttpMethod.POST, "/api/company/admins")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN")
```

and the `GET` matcher for `/api/company/admins`, `/api/company/admins/user-id-available`, `/api/company/admins/role-permissions` (already collapsed to `hasAuthority("ADMIN")` in Task 3 — just delete the whole `requestMatchers` block now that the routes it names don't exist).

- [ ] **Step 7: Delete the now-dead `SecurityConfigTest` cases**

Delete `createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens`, `createAdminIsForbiddenForNonAdminTokens`, `adminsListIsForbiddenForAnAssociateToken`, `adminsListIsReachableForAnyAdminFamilyToken`, `userIdAvailabilityIsForbiddenForAnAssociateToken`, `userIdAvailabilityIsReachableForAnyAdminFamilyToken`, `rolePermissionsIsForbiddenForAnAssociateToken`, `rolePermissionsIsReachableForAnyAdminFamilyToken` — all test routes that no longer exist.

- [ ] **Step 8: Run the tests**

Run: `cd backend && ./mvnw test -Dtest=SetupStateServiceTest,SecurityConfigTest`
Expected: `SetupStateServiceTest` needs its `adminProvisioningService` mock/stub removed wherever it constructs `SetupStateService` — update that test's constructor call to match the new (shorter) constructor signature. `SecurityConfigTest` still red until Task 5.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(company): delete Admin Team feature (staff sub-roles removed)"
```

---

### Task 5: Delete the Root Associate feature

**Files:**
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateController.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateProvisioningService.java`
- Delete: `backend/src/main/java/com/plotchain/company/CreateRootAssociateRequest.java`
- Delete: `backend/src/main/java/com/plotchain/company/CreateRootAssociateResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateCreationResult.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateSummaryResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateSlotsResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateAlreadyExistsException.java`
- Delete: `backend/src/main/java/com/plotchain/company/RightRootDetailsRequiredException.java`
- Modify: `backend/src/main/java/com/plotchain/company/CompanyExceptionHandler.java`
- Modify: `backend/src/main/java/com/plotchain/company/SetupStateService.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`
- Delete any `RootAssociate*Test.java` found in `backend/src/test/java/com/plotchain/company/`

**Interfaces:**
- Produces: `GET/POST /api/company/root-associates*` no longer exist. `SetupStateService.STEP_DEFINITIONS` ends at step 6 (`reviewLaunch`), matching the two-role model where the Admin account is the tree root by construction (Task 1's seed row already has `parent_id = NULL`).

- [ ] **Step 1: Delete the Root Associate backend files**

```bash
git rm backend/src/main/java/com/plotchain/company/RootAssociateController.java \
       backend/src/main/java/com/plotchain/company/RootAssociateProvisioningService.java \
       backend/src/main/java/com/plotchain/company/CreateRootAssociateRequest.java \
       backend/src/main/java/com/plotchain/company/CreateRootAssociateResponse.java \
       backend/src/main/java/com/plotchain/company/RootAssociateCreationResult.java \
       backend/src/main/java/com/plotchain/company/RootAssociateSummaryResponse.java \
       backend/src/main/java/com/plotchain/company/RootAssociateSlotsResponse.java \
       backend/src/main/java/com/plotchain/company/RootAssociateAlreadyExistsException.java \
       backend/src/main/java/com/plotchain/company/RightRootDetailsRequiredException.java
```

Also delete their test counterparts — `find backend/src/test/java/com/plotchain/company -iname "RootAssociate*Test.java"`, `git rm` every match.

- [ ] **Step 2: Remove their exception handlers**

In `CompanyExceptionHandler.java`, remove `handleRootAssociateAlreadyExists` and `handleRightRootDetailsRequired` (the last two handlers in the file), leaving only `handleLaunchBlocked` and `handleInvalidLogoUpload`.

- [ ] **Step 3: Drop the root-associate-only repository method**

In `AssociateRepository.java`, delete `findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc` (existed only to list root-associate rows for `RootAssociateProvisioningService`).

- [ ] **Step 4: Remove the Root Associate step from `SetupStateService`**

Remove the `rootAssociateProvisioningService` field, constructor parameter, and assignment. Remove `new StepDefinition(7, "rootAssociates", false),` and the `case "rootAssociates" -> ...` branch. Renumber `reviewLaunch` from `8` to `6`.

- [ ] **Step 5: Remove the `/api/company/root-associates` matcher from `SecurityConfig.java`**

Delete the `requestMatchers(HttpMethod.GET, "/api/company/root-associates")` block and its comment.

- [ ] **Step 6: Delete the now-dead `SecurityConfigTest` cases**

Delete `rootAssociatesListIsForbiddenForAnAssociateToken` and `rootAssociatesListIsReachableForAnyAdminFamilyToken`.

- [ ] **Step 7: Run the full backend test suite**

Run: `cd backend && ./mvnw test`
Expected: PASS. This is the first point since Task 1 where the whole suite should be green — every deleted-role and deleted-route reference has now been cleaned up. Fix anything still red before continuing (most likely candidates: `SetupStateServiceTest`'s constructor call for the now-shorter `SetupStateService` constructor, and any `SetupStateResponse` step-count assertion hardcoding 8 steps — update to 6).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(company): fold Root Associate into the Admin account (delete separate seeding)"
```

---

### Task 6: Fix Associate read-access to the plot/project catalog

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Produces: `GET /api/company/projects`, `GET /api/company/projects/{id}`, `GET /api/company/projects/{id}/plots`, `GET /api/company/projects/{id}/plots/{plotId}` are now reachable by any authenticated user (`ADMIN` or `ASSOCIATE`), matching the spec's "Associate views available plots." Every other `GET`/write on projects/plots stays `ADMIN`-only (create/update/delete, thumbnail upload, CSV template).

- [ ] **Step 1: Narrow the matcher instead of widening it to authenticated()**

The current admin-family-only `GET` matcher (from `SecurityConfig.java`, originally lines 116-120) covers seven paths in one `requestMatchers(...)` call:

```java
                .requestMatchers(HttpMethod.GET,
                        "/api/company/projects", "/api/company/projects/*",
                        "/api/company/projects/*/plots", "/api/company/projects/*/plots/*",
                        "/api/company/projects/*/thumbnail", "/api/company/projects/plots/csv-template")
                    .hasAuthority("ADMIN")
```

Split it: the project/plot listing and detail reads become associate-reachable, but the thumbnail and CSV-template reads stay admin-only (they're setup/back-office affordances, not something the spec's matrix grants an Associate). Replace with:

```java
                // Associate-reachable: the plot catalog is what the matrix calls "View available
                // plots" for an Associate. Thumbnail and the CSV import template stay admin-only
                // -- they're back-office affordances, not part of what an Associate browses.
                .requestMatchers(HttpMethod.GET,
                        "/api/company/projects", "/api/company/projects/*",
                        "/api/company/projects/*/plots", "/api/company/projects/*/plots/*")
                    .authenticated()
                .requestMatchers(HttpMethod.GET,
                        "/api/company/projects/*/thumbnail", "/api/company/projects/plots/csv-template")
                    .hasAuthority("ADMIN")
```

(Place this above the generic `anyRequest().authenticated()` at the bottom of the chain, in the same position the original single matcher occupied — ordering relative to the write rules doesn't matter since those are different HTTP methods, but it must stay above `anyRequest()`.)

- [ ] **Step 2: Add tests proving the split**

In `SecurityConfigTest.java`, replace `projectsIsForbiddenForAnAssociateToken` (which currently asserts 403 — that assertion is now wrong) with:

```java
    @Test
    void projectsIsReachableForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isOk());
    }

    @Test
    void projectThumbnailIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/projects/" + UUID.randomUUID() + "/thumbnail")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
```

Leave `projectsIsReachableForAnyAdminFamilyToken` (now effectively "for ADMIN") as-is — still true.

- [ ] **Step 3: Run the tests**

Run: `cd backend && ./mvnw test -Dtest=SecurityConfigTest`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "fix(auth): let Associates read the plot/project catalog"
```

---

### Task 7: Associate self-service tree view

**Files:**
- Modify: `backend/src/main/java/com/plotchain/tree/TreeExplorerService.java`
- Modify: `backend/src/main/java/com/plotchain/tree/TreeExplorerController.java`
- Modify: `backend/src/test/java/com/plotchain/tree/TreeExplorerServiceTest.java` (if it stubs `findByIdAndRole`, update to `findById`)
- Create: `backend/src/test/java/com/plotchain/tree/TreeExplorerControllerTest.java` additions for the new route (extend the existing file, don't create a new one — it already exists per the earlier `find`)

**Interfaces:**
- Consumes: `TreeExplorerService.subtree(UUID associateId, int depth): TreeNodeResponse` (unchanged signature).
- Produces: `GET /api/associates/me/tree?depth=` — self-scoped, any authenticated `ASSOCIATE` (or `ADMIN`, for whom it renders the whole company since the admin row is the tree root).

- [ ] **Step 1: Remove the `ASSOCIATE`-only filter from `subtree()`**

`TreeExplorerService.subtree()` currently does:

```java
    public TreeNodeResponse subtree(UUID associateId, int depth) {
        Associate root = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
```

Change to:

```java
    public TreeNodeResponse subtree(UUID associateId, int depth) {
        Associate root = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
```

This is required so the tree root — the Admin account itself, per Task 1/5's folding of Root Associate into Admin — can be the starting node of a subtree call. It's also what the new self-service endpoint below needs: an Associate's own ID must resolve here regardless of role.

- [ ] **Step 2: Add the self-service endpoint**

In `TreeExplorerController.java`, add (the existing `/{associateId}` admin route is untouched):

```java
    @GetMapping("/api/associates/me/tree")
    public TreeNodeResponse myTree(@AuthenticationPrincipal UUID associateId,
                                    @RequestParam(defaultValue = "3") int depth) {
        depth = Math.max(0, Math.min(depth, 5));
        return treeExplorerService.subtree(associateId, depth);
    }
```

This needs its own `@RequestMapping`-free top-level path since the class is annotated `@RequestMapping("/api/admin/tree")` — either move this method to a new small controller, or (simpler, matching how `DashboardController`/`PasswordController` each own one `/api/associates/me/*` route) create `backend/src/main/java/com/plotchain/tree/AssociateTreeController.java`:

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

    @GetMapping("/api/associates/me/tree")
    public TreeNodeResponse myTree(@AuthenticationPrincipal UUID associateId,
                                    @RequestParam(defaultValue = "3") int depth) {
        depth = Math.max(0, Math.min(depth, 5));
        return treeExplorerService.subtree(associateId, depth);
    }
}
```

Do not add anything to `TreeExplorerController.java` itself — leave it exactly as-is except for the (already-done) `SecurityConfig` collapse from earlier tasks.

- [ ] **Step 3: No new `SecurityConfig` matcher needed**

`/api/associates/me/tree` isn't in any admin-family-only matcher, so it already falls through to the generic `anyRequest().authenticated()` at the bottom of the chain — reachable by both roles, self-scoped by construction (the ID comes from the JWT, never a path/query param).

- [ ] **Step 4: Write the failing test**

Add to `TreeExplorerControllerTest.java` (or create `AssociateTreeControllerTest.java` alongside it, mirroring its `@SpringBootTest`/`@AutoConfigureMockMvc`/`@MockBean AssociateRepository` setup):

```java
    @Test
    void myTreeReturnsTheCallersOwnSubtree() throws Exception {
        Associate self = new Associate();
        self.setId(CALLER_ID);
        self.setUserId("VP00001");
        self.setName("Jane Doe");
        self.setRole(AssociateRole.ASSOCIATE);
        self.setKycStatus(KycStatus.VERIFIED);
        self.setJoinedAt(Instant.now());
        when(associateRepository.findById(CALLER_ID)).thenReturn(Optional.of(self));
        when(associateRepository.findByParentId(CALLER_ID)).thenReturn(List.of());
        when(associateRepository.countByParentId(CALLER_ID)).thenReturn(0L);

        mockMvc.perform(get("/api/associates/me/tree")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE, CALLER_ID)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00001"));
    }
```

(Adapt `tokenFor`/`CALLER_ID` to match whatever helper pattern `TreeExplorerControllerTest.java` already uses for minting a token for a specific associate ID — read that file's existing helper before writing this, since the exact signature isn't pinned down here.)

- [ ] **Step 5: Run it to verify it fails, then verify it passes**

Run: `cd backend && ./mvnw test -Dtest=TreeExplorerControllerTest` (or `AssociateTreeControllerTest`, whichever name Step 4 used)
Expected: FAIL first (404, route doesn't exist) before Step 2's controller lands; PASS after.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/tree/ backend/src/test/java/com/plotchain/tree/
git commit -m "feat(tree): add Associate self-service subtree endpoint"
```

---

### Task 8: Associate self-service profile view/edit

**Files:**
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProfileController.java`
- Create: `backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java`
- Create: `backend/src/main/java/com/plotchain/associate/UpdateAssociateProfileRequest.java`
- Create: `backend/src/test/java/com/plotchain/associate/AssociateProfileControllerTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findById(UUID): Optional<Associate>` (existing, from `JpaRepository`).
- Produces: `GET /api/associates/me/profile` → `AssociateProfileResponse(UUID id, String userId, String name, String phone, String rankId, KycStatus kycStatus, Instant joinedAt)`. `PUT /api/associates/me/profile` (body `UpdateAssociateProfileRequest(String name, String phone)`) → same response shape, updated.

Scope note: `Associate` has no bank-detail fields today (payout bank accounts are a company-level `PayoutBankAccount` config entity, not a per-associate field) and no self-service KYC document upload exists — both stay out of this task, matching the spec's "own profile" row, which lists them as part of the broader Profile screen but this task only builds what the entity actually has: name and phone.

- [ ] **Step 1: Write the failing controller test**

Create `backend/src/test/java/com/plotchain/associate/AssociateProfileControllerTest.java`:

```java
package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateProfileControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;

    private Associate seeded(UUID id) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setPhone("9990001111");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        return a;
    }

    private String tokenFor(Associate associate) {
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void getReturnsTheCallersOwnProfile() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);

        mockMvc.perform(get("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00001"))
            .andExpect(jsonPath("$.name").value("Jane Doe"));
    }

    @Test
    void putUpdatesNameAndPhone() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);
        when(associateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(new ObjectMapper().writeValueAsString(
                    new UpdateAssociateProfileRequest("Jane A. Doe", "9990002222"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Jane A. Doe"))
            .andExpect(jsonPath("$.phone").value("9990002222"));
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=AssociateProfileControllerTest`
Expected: FAIL to compile (`AssociateProfileController`/response/request types don't exist yet).

- [ ] **Step 3: Create the response and request records**

`backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java`:

```java
package com.plotchain.associate;

import java.time.Instant;
import java.util.UUID;

public record AssociateProfileResponse(
    UUID id, String userId, String name, String phone, UUID rankId,
    KycStatus kycStatus, Instant joinedAt
) {
    public static AssociateProfileResponse from(Associate a) {
        return new AssociateProfileResponse(
            a.getId(), a.getUserId(), a.getName(), a.getPhone(), a.getRankId(),
            a.getKycStatus(), a.getJoinedAt());
    }
}
```

`backend/src/main/java/com/plotchain/associate/UpdateAssociateProfileRequest.java`:

```java
package com.plotchain.associate;

import jakarta.validation.constraints.NotBlank;

public record UpdateAssociateProfileRequest(@NotBlank String name, @NotBlank String phone) {}
```

- [ ] **Step 4: Create the controller**

`backend/src/main/java/com/plotchain/associate/AssociateProfileController.java`:

```java
package com.plotchain.associate;

import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Self-scoped by construction, same pattern as PasswordController: the target associate comes
// from the verified JWT, never from the request, so no caller can read or edit another
// associate's profile.
@RestController
public class AssociateProfileController {

    private final AssociateRepository associateRepository;

    public AssociateProfileController(AssociateRepository associateRepository) {
        this.associateRepository = associateRepository;
    }

    @GetMapping("/api/associates/me/profile")
    public AssociateProfileResponse get(@AuthenticationPrincipal UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        return AssociateProfileResponse.from(associate);
    }

    @PutMapping("/api/associates/me/profile")
    public AssociateProfileResponse update(@AuthenticationPrincipal UUID associateId,
                                            @Valid @RequestBody UpdateAssociateProfileRequest request) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        associate.setName(request.name());
        associate.setPhone(request.phone());
        associateRepository.save(associate);
        return AssociateProfileResponse.from(associate);
    }
}
```

- [ ] **Step 5: Add the write matcher above the blanket `PUT` rule**

`PUT /api/associates/me/profile` is a write, so it would otherwise hit the blanket `PUT /api/**` → `hasAuthority("ADMIN")` rule and lock every Associate out of editing their own profile — the exact ordering trap `SecurityConfig.java`'s existing comment on `POST /api/associates/me/password` already documents. In `SecurityConfig.java`, add immediately after the existing `POST /api/associates/me/password` matcher (same self-service reasoning, same "must precede the blanket rules" ordering):

```java
                .requestMatchers(HttpMethod.PUT, "/api/associates/me/profile").authenticated()
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=AssociateProfileControllerTest`
Expected: PASS.

- [ ] **Step 7: Add a `SecurityConfigTest` case proving the ordering**

```java
    @Test
    void profileUpdateIsReachableByAnAssociateToken() throws Exception {
        mockMvc.perform(put("/api/associates/me/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content("{\"name\":\"x\",\"phone\":\"9990000000\"}"))
            .andExpect(status().is(not(403)));
    }
```

(Add the `put` static import alongside the existing `get`/`post` ones at the top of the file.)

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && ./mvnw test`
Expected: PASS, everything green.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/plotchain/associate/AssociateProfileController.java \
        backend/src/main/java/com/plotchain/associate/AssociateProfileResponse.java \
        backend/src/main/java/com/plotchain/associate/UpdateAssociateProfileRequest.java \
        backend/src/test/java/com/plotchain/associate/AssociateProfileControllerTest.java \
        backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(associate): add self-service profile view/edit endpoint"
```

---

### Task 9: Frontend — delete Admin Team & Root Associate steps, collapse `ADMIN_FAMILY_ROLES`

**Files:**
- Delete: `frontend/src/app/setup/steps/admin-team/` (entire directory: `admin-team-step.component.ts`, its spec, `admin-team.service.ts`, its spec)
- Delete: `frontend/src/app/setup/steps/root-associates/` (entire directory)
- Delete: `frontend/src/app/setup/models/admin-team.model.ts`
- Delete: `frontend/src/app/setup/models/root-associates.model.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/admin/admin.guard.ts`
- Modify: `frontend/src/app/admin/admin.guard.spec.ts`
- Modify: `frontend/src/app/auth/login.component.spec.ts`
- Modify: `frontend/src/app/auth/change-password.component.spec.ts`
- Modify: `frontend/src/app/auth/post-auth-redirect.spec.ts`
- Modify: `frontend/src/app/auth/root-redirect.guard.spec.ts`
- Modify: `frontend/src/app/auth/associate-only.guard.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`, `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Produces: the frontend no longer has any route, component, or i18n key referencing `adminTeam`, `rootAssociates`, or the four deleted role strings. `ADMIN_FAMILY_ROLES` becomes a literal one-element set, so every call site that checks it keeps working unchanged (still correct behavior, since `ADMIN` is genuinely the only admin-family role left).

- [ ] **Step 1: Delete the two step directories and their models**

```bash
git rm -r frontend/src/app/setup/steps/admin-team \
          frontend/src/app/setup/steps/root-associates
git rm frontend/src/app/setup/models/admin-team.model.ts \
       frontend/src/app/setup/models/root-associates.model.ts
```

- [ ] **Step 2: Remove their routes from `app.routes.ts`**

Remove the two import lines:

```ts
import { AdminTeamStepComponent } from './setup/steps/admin-team/admin-team-step.component';
import { RootAssociatesStepComponent } from './setup/steps/root-associates/root-associates-step.component';
```

Remove all four route entries (two in the `/setup/*` children, two in the `/settings/*` children):

```ts
      { path: 'admin-team', component: AdminTeamStepComponent, data: { stepKey: 'adminTeam' } },
      { path: 'root-associates', component: RootAssociatesStepComponent, data: { stepKey: 'rootAssociates' } },
```

and

```ts
      { path: 'admin-team', component: AdminTeamStepComponent, data: { sectionKey: 'adminTeam', mode: 'settings' } },
      { path: 'root-associates', component: RootAssociatesStepComponent, data: { sectionKey: 'rootAssociates', mode: 'settings' } },
```

- [ ] **Step 3: Shrink `ADMIN_FAMILY_ROLES`**

In `admin.guard.ts`:

```ts
// Only one admin-family role exists now (ADMIN). Kept as a Set (not a direct string ===
// comparison) so login.component.ts/post-auth-redirect.ts/associate-only.guard.ts, which all
// import and check against this same set, don't each need their own follow-up edit if a second
// admin-family role is ever reintroduced.
export const ADMIN_FAMILY_ROLES = new Set(['ADMIN']);
```

No other file needs a logic change — every consumer (`login.component.ts`, `app.component.ts`, `change-password.component.ts`, `post-auth-redirect.ts`, `root-redirect.guard.ts`, `associate-only.guard.ts`) already just calls `.has(role)`, which now correctly returns `true` only for `'ADMIN'`.

- [ ] **Step 4: Update specs that hardcode the deleted role strings**

Run: `grep -rn "SUPER_ADMIN\|FINANCE\|KYC_REVIEWER\|SUPPORT" frontend/src/app/auth/*.spec.ts frontend/src/app/admin/admin.guard.spec.ts`

For each hit, the spec is almost certainly parameterizing "every admin-family role" with a hardcoded array like `['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT']` or testing one of the four deleted roles individually (e.g. a `postAuthLandingPath('FINANCE', ...)` case asserting `/settings`). Read each hit in context and:
- If it's an array literal driving a parameterized/`it.each`-style test, shrink it to `['ADMIN']`.
- If it's a dedicated test case for one specific deleted role (e.g. `it('routes FINANCE to /settings', ...)`), delete that test case — there's no such role to route anymore.
- Leave the `ASSOCIATE` and `ADMIN` cases in every one of these files untouched — those two roles are unaffected.

- [ ] **Step 5: Remove the two steps' i18n keys**

In `frontend/src/assets/i18n/en.json` and `hi.json`, remove the `setup.adminTeam.*` block and the `setup.rootAssociates.*` block (or whatever key namespace `root-associates-step.component.ts` uses — check its template for the exact prefix before deleting, since it wasn't confirmed to be named identically to the backend step key). Leave `setup.steps.adminTeam`/`setup.steps.rootAssociates` (the progress-rail labels) removed too if nothing else references them — confirm with `grep -rn "steps.adminTeam\|steps.rootAssociates" frontend/src/app` before deleting, since the rail component may enumerate step keys from a shared list that also needs its `adminTeam`/`rootAssociates` entries removed (check `frontend/src/app/setup/` for a step-list/progress-rail component and remove those two entries there too if found).

- [ ] **Step 6: Run the frontend test suite**

Run: `cd frontend && npm test -- --watch=false`
Expected: PASS. Fix any remaining compile error from a stray reference to a deleted component/model (search `grep -rln "AdminTeamStepComponent\|RootAssociatesStepComponent\|admin-team.model\|root-associates.model" frontend/src/app` and clean up any hit not already covered above — most likely candidate is a review-launch step component that renders a summary line per wizard step and enumerates step keys).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(setup): delete Admin Team and Root Associate wizard steps"
```

---

## Self-Review

**Spec coverage** — every "Out of scope / removed" and "Reconciliation & gap-fill" line in the spec maps to a task: sub-roles (Task 2-3), Root Associate (Task 5), admin seeding (Task 1), KYC scope bug (Task 3), plot visibility bug (Task 6), associate tree view (Task 7), associate profile (Task 8), Admin Team deletion (Task 4), frontend cleanup (Task 9). The "Likely aligned, verify" audit note on the audit log is not a task — nothing to build, just confirm `SettingsAuditController` isn't touched by any of the above (it isn't; no task modifies it).

**Placeholder scan** — no TBD/TODO. Two spots intentionally ask the implementer to look at existing code before writing an exact line (Task 7 Step 4's `tokenFor` helper signature, Task 9 Step 5's i18n key prefix) rather than guessing wrong — both say exactly what to grep for and why, not "handle appropriately."

**Type consistency** — `AssociateProfileResponse`/`UpdateAssociateProfileRequest` field names match between Task 8's controller and test. `TreeExplorerService.subtree(UUID, int): TreeNodeResponse` signature is unchanged from Task 7 through to `AssociateTreeController`'s call site.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-03-role-model-collapse.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
