# Role Capability Unit 4: Admin Team Setup Step Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Admin Team setup-wizard feature (staff sub-role creation UI + backend) wholesale, backend and frontend, because role-capability unit 1 already collapsed `AssociateRole` to just `ADMIN`/`ASSOCIATE`, making the sub-roles this feature managed (`SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT`) meaningless. This is a pure removal unit — no new capability, no new endpoint.

**Architecture:** Delete the `AdminController`/`AdminProvisioningService` stack and its three test classes outright; trim the two repository methods and two exception handlers that existed only to serve them; drop the Admin Team step from `SetupStateService`'s step list and renumber the two steps after it; delete the `/api/company/admins*` matchers from `SecurityConfig` and the now-dead `SecurityConfigTest` cases. On the frontend, delete the `setup/steps/admin-team/` directory and its model, remove its two routes, shrink `ADMIN_FAMILY_ROLES` to a one-element set, delete the setup-wizard step-order/section-key map entries that referenced it (`STEP_PATHS`, `SECTION_PATHS`, `AUDIT_LOG_SECTION_BACKEND_VALUES` — none of these were in the reference plan; discovered by direct verification), and remove its i18n keys.

**Tech Stack:** Spring Boot 3.3.4 / Java 21 / JUnit 5 / Mockito / MockMvc (backend); Angular (standalone components) / Jasmine/Karma / ngx-translate (frontend).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` — "Out of scope / removed" section (Admin Team step, `AdminRolePermissions`, `frontend/src/app/setup/steps/admin-team/**`, `admin-team.model.ts`) and "Mechanical role-collapse" section (exact deletion list, `AssociateRepository.findByRoleNot*`/`countByRoleNot` deletion note).

## Global Constraints

- This is unit 4 of the role-capability unit queue (`docs/superpowers/plans/2026-08-03-role-capability-units.md`, row 4). Depends on unit 1 only (merged `857a27d..5befd78`) — satisfied.
- Executed strictly in isolation, in its own worktree. Unit 3 (Root Associate removal) is **not** in scope here — every `rootAssociates`/`RootAssociate*` reference in the files this plan touches must be left alone.
- No new migration, no new endpoint, no behavior change beyond removing dead routes/UI. Every numeric step-renumbering decision below is derived from the CURRENT on-disk `SetupStateService.STEP_DEFINITIONS` (verified directly, see Task 2), not from any reference plan's stated numbers.
- Follow this repo's established test-file conventions exactly as seen in the files being edited (Mockito `@Mock`-the-interface-only pattern, `MockBean`-the-repository-interface pattern for `@SpringBootTest`, etc.) — do not introduce a new pattern.

---

## Verified ground truth (read directly from the repo before writing this plan — supersedes the reference plan `docs/superpowers/plans/2026-08-03-role-model-collapse.md` Task 4 / part of Task 9 wherever they disagree)

- `AssociateRole` enum today is exactly `ADMIN, ASSOCIATE` (unit 1 already merged this). `isAdminFamily()` is already gone.
- `AdminController.java`, `AdminProvisioningService.java`, `AdminRolePermissions.java`, `CreateAdminRequest.java`, `CreateAdminResponse.java`, `AdminSummaryResponse.java`, `UserIdAvailabilityResponse.java`, `InvalidAdminRoleException.java`, `UserIdAlreadyRegisteredException.java` all still exist in `backend/src/main/java/com/plotchain/company/`, unchanged in shape from what the reference plan describes. Confirmed no other package added a new reference to any of them since unit 1 (checked `company` package for drift from units 8/11's new controllers — none touch these files).
- `InvalidAdminRoleException`/`UserIdAlreadyRegisteredException` are used ONLY inside `AdminProvisioningService`, `CompanyExceptionHandler`, and the doomed test files — confirmed via `grep -rn` across `src/main/java` and `src/test/java`. `AssociateProvisioningService`'s own duplicate-userId path throws a different class (`EmailAlreadyRegisteredException` — it's actually keyed on email, not userId) — confirmed separate, not touched.
- `AssociateRepository.findByRoleNotOrderByUserIdAsc`/`countByRoleNot` are used ONLY by `AdminProvisioningService` and `SetupStateService`'s `adminTeam` step-completeness check (both deleted/edited by this plan) plus their tests — confirmed via `grep -rn`, no other caller.
- **`SecurityConfig.java` has real drift from the spec's "already collapsed" description**: the `POST /api/company/admins` matcher (lines 71-77) still reads `.hasAnyAuthority("ADMIN", "SUPER_ADMIN")` with a comment block talking about `FINANCE`/`KYC_REVIEWER`/`SUPPORT` — stale, since those roles don't exist in the enum anymore (unit 1 removed them but didn't touch this specific matcher, since unit 1 was executed as its own from-scratch plan, not via the reference plan's Task 2-3). The three `GET /api/company/admins*` routes (lines 187-196) are already on `.hasAuthority("ADMIN")` — that part of the "mechanical role-collapse" did land. This plan deletes both blocks outright (the routes cease to exist), so the stale-comment problem disappears along with the code.
- **`SetupStateService.STEP_DEFINITIONS` today is 8 entries**: `companyProfile`(1), `branding`(2), `compensation`(3), `projects`(4), `paymentsKyc`(5), `adminTeam`(6), `rootAssociates`(7), `reviewLaunch`(8). This matches the reference plan's stated numbers — confirmed directly, not assumed. Since unit 3 (which would also remove `rootAssociates`) is NOT in scope here, this plan's renumbering is: delete `adminTeam`(6), renumber `rootAssociates` 7→6 and `reviewLaunch` 8→7. (The reference plan's Task 4 Step 5 assumed both Task 4 AND Task 5 land together, ending with `reviewLaunch` at step 6 — that does NOT apply here since this unit runs alone.)
- **Ran the 5 directly-relevant backend test classes against current `master` to get the true current-red baseline** (`mvn test -Dtest=SecurityConfigTest,AdminControllerTest,AdminProvisioningServiceTest,AdminRolePermissionsTest,SetupStateServiceTest`): exactly **10 failures/errors**, all inside `AdminControllerTest` (3), `AdminProvisioningServiceTest` (5), `SecurityConfigTest` (2 — `createAdminIsForbiddenForNonAdminTokens` and `createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens`, both `@EnumSource` `PreconditionViolation`s referencing the deleted `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` enum constants). `AdminRolePermissionsTest` and `SetupStateServiceTest` passed clean in this run (their currently-red status, if any, comes only from being part of the 10 above via shared fixtures — verified not the case: 10 = 3+5+2 exactly). This exactly matches the "10 residual-red tests leftover from unit 1's incomplete enum collapse" this unit is documented to eliminate.
- **Ran `JwtServiceTest`/`SecretsEncryptionServiceTest` directly**: exactly **4 failures**, confirmed unrelated (dev-default-secret fail-closed checks, not touched by this unit).
- **Current backend expected-red baseline: 14** (10 admin-team-related + 4 unrelated). **After this unit merges, expected-red baseline: 4** (only the unrelated `JwtServiceTest`/`SecretsEncryptionServiceTest` failures) — Task 3's final step verifies this exactly, not by assumption.
- **Frontend drift not covered by the reference plan at all** (new files added since `role-model-collapse.md` was written 2026-08-03):
  - `frontend/src/app/setup/models/setup-state.model.ts` — `STEP_PATHS` map has an `adminTeam: 'admin-team'` entry that must be deleted. `SetupService.nextStepPath`/`previousStepPath` derive purely from `Object.keys(STEP_PATHS)` order — confirmed no separate hardcoded step-order array exists anywhere else, so deleting this one entry is sufficient to fix step adjacency (paymentsKyc's "next" and rootAssociates's "previous" automatically become each other once `adminTeam` is removed from the map — no component code change needed).
  - `frontend/src/app/settings/models/settings-section.model.ts` — `SECTION_PATHS` map has the same `adminTeam: 'admin-team'` entry, feeding both the Settings section routing and (transitively, via `Object.keys(SECTION_PATHS)`) the audit-log filter dropdown's option list.
  - `frontend/src/app/settings/audit-log/audit-log.model.ts` — `AUDIT_LOG_SECTION_BACKEND_VALUES` has an `adminTeam: 'ADMIN_TEAM'` entry that must be deleted to stay in sync with `SECTION_PATHS`.
  - `frontend/src/app/settings/audit-log/audit-log.service.spec.ts` — a test asserting all 7 section-key mappings; needs updating to 6 keys.
  - `frontend/src/app/app.routes.spec.ts` — a test asserting "8 wizard-step children"; needs updating to 7, with `'admin-team'` dropped from the expected path array.
  - `frontend/src/app/setup/steps/review-launch/review-launch-step.component.spec.ts` — its `stateWith()` test fixture hardcodes all 8 steps (including `adminTeam` at number 6); needs the same renumbering as the backend `SetupStateService`, and the checklist-row-count assertion drops from 7 to 6.
  - Backend's `SettingsAuditServiceTest.java:113` also has a stray `"ADMIN_TEAM"` string literal, but it's just an arbitrary fixture value for a general-purpose test (not asserting anything Admin-Team-specific) — verified, no change needed there.
- `ADMIN_FAMILY_ROLES` in `frontend/src/app/admin/admin.guard.ts` is still `new Set(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT'])` — needs shrinking to `new Set(['ADMIN'])`, confirmed independent of unit 3 (Admin Team was what created the extra 3 roles here; Root Associate was never a role, just a placement pattern).
- Six frontend spec files hardcode one of the four deleted role strings, confirmed by exact grep + read of each: `admin.guard.spec.ts` (array literal driving a loop — shrink), `post-auth-redirect.spec.ts` (one assertion to shrink, one loop-based test to delete since it becomes vacuous over an empty non-ADMIN-admin-family set), `login.component.spec.ts`, `change-password.component.spec.ts`, `root-redirect.guard.spec.ts`, `associate-only.guard.spec.ts` (each has exactly one dedicated `it(...)` block for "a non-ADMIN admin-family role" using `'FINANCE'` as the stand-in — delete each whole block, there's no such role to route anymore).
- i18n: `setup.steps.adminTeam` (`en.json`/`hi.json` line 270/270), `setup.adminTeam.*` block (lines 437-481, ends right before `rootAssociates` at 482), `settings.sections.adminTeam` (line 627), `settings.cards.adminTeam` (lines 653-655) — all confirmed present in both files at identical line numbers (hi.json mirrors en.json exactly). `setup.steps.rootAssociates`/`settings.sections.rootAssociates`/`settings.cards.rootAssociates` stay untouched (unit 3's territory).

---

## Task 1: Backend — delete the Admin Team feature files and their direct dependents

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
- Delete: `backend/src/test/java/com/plotchain/company/AdminControllerTest.java`
- Delete: `backend/src/test/java/com/plotchain/company/AdminProvisioningServiceTest.java`
- Delete: `backend/src/test/java/com/plotchain/company/AdminRolePermissionsTest.java`
- Modify: `backend/src/main/java/com/plotchain/company/CompanyExceptionHandler.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `POST/GET /api/company/admins*` return 404 from this point on (their `SecurityConfig` matchers get deleted in Task 3, but the routes are unreachable in practice as soon as the controller is gone — `SecurityConfig`'s deny-by-default write rule and `anyRequest().authenticated()` catch-all still apply to whatever URL pattern remains, this is just cleanup). `AssociateRepository` no longer exposes `findByRoleNotOrderByUserIdAsc`/`countByRoleNot` — Task 2 depends on this (it removes `SetupStateService`'s only other caller of `countByRoleNot`).

- [ ] **Step 1: Confirm no other caller of the two exceptions or the two repository methods exists**

Run:
```bash
cd backend
grep -rn "InvalidAdminRoleException\|UserIdAlreadyRegisteredException" src/main/java src/test/java
grep -rn "findByRoleNotOrderByUserIdAsc\|countByRoleNot\b" src/main/java src/test/java
```
Expected: every hit is inside one of the 12 files listed for deletion/modification above (plus `SetupStateService.java`/`SetupStateServiceTest.java`, which Task 2 handles). If a hit shows up anywhere else, stop and investigate before proceeding — do not delete.

- [ ] **Step 2: Delete the nine Admin Team production files**

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

- [ ] **Step 3: Delete their three test classes**

```bash
git rm backend/src/test/java/com/plotchain/company/AdminControllerTest.java \
       backend/src/test/java/com/plotchain/company/AdminProvisioningServiceTest.java \
       backend/src/test/java/com/plotchain/company/AdminRolePermissionsTest.java
```

- [ ] **Step 4: Remove the two dead exception handlers from `CompanyExceptionHandler.java`**

Current file (`backend/src/main/java/com/plotchain/company/CompanyExceptionHandler.java`):
```java
package com.plotchain.company;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class CompanyExceptionHandler {

    @ExceptionHandler(LaunchBlockedException.class)
    public ResponseEntity<Map<String, Object>> handleLaunchBlocked(LaunchBlockedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(Map.of("error", ex.getMessage(), "incompleteSteps", ex.getIncompleteSteps()));
    }

    @ExceptionHandler(InvalidLogoUploadException.class)
    public ResponseEntity<Map<String, String>> handleInvalidLogoUpload(InvalidLogoUploadException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidAdminRoleException.class)
    public ResponseEntity<Map<String, String>> handleInvalidAdminRole(InvalidAdminRoleException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(UserIdAlreadyRegisteredException.class)
    public ResponseEntity<Map<String, String>> handleUserIdAlreadyRegistered(UserIdAlreadyRegisteredException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(RootAssociateAlreadyExistsException.class)
    public ResponseEntity<Map<String, String>> handleRootAssociateAlreadyExists(RootAssociateAlreadyExistsException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(RightRootDetailsRequiredException.class)
    public ResponseEntity<Map<String, String>> handleRightRootDetailsRequired(RightRootDetailsRequiredException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
}
```

Remove the `handleInvalidAdminRole` and `handleUserIdAlreadyRegistered` methods (keep `handleLaunchBlocked`, `handleInvalidLogoUpload`, `handleRootAssociateAlreadyExists`, `handleRightRootDetailsRequired` — the latter two are unit 3's territory, do not touch). Resulting file:
```java
package com.plotchain.company;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class CompanyExceptionHandler {

    @ExceptionHandler(LaunchBlockedException.class)
    public ResponseEntity<Map<String, Object>> handleLaunchBlocked(LaunchBlockedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
            .body(Map.of("error", ex.getMessage(), "incompleteSteps", ex.getIncompleteSteps()));
    }

    @ExceptionHandler(InvalidLogoUploadException.class)
    public ResponseEntity<Map<String, String>> handleInvalidLogoUpload(InvalidLogoUploadException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(RootAssociateAlreadyExistsException.class)
    public ResponseEntity<Map<String, String>> handleRootAssociateAlreadyExists(RootAssociateAlreadyExistsException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(RightRootDetailsRequiredException.class)
    public ResponseEntity<Map<String, String>> handleRightRootDetailsRequired(RightRootDetailsRequiredException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 5: Drop the two Admin-Team-only methods from `AssociateRepository.java`**

Delete these two lines (and their surrounding comments where the comment is exclusively about the deleted method):
```java
    List<Associate> findByRoleNotOrderByUserIdAsc(AssociateRole role);
```
(no comment directly above this one — it sits right after `findTopByUserIdStartingWithOrderByUserIdDesc`'s comment block, which stays since that comment is about the OTHER method).

```java
    long countByRoleNot(AssociateRole role);
```
(no comment directly above this one either — it sits between `findAllByOrderByUserIdAsc`'s comment, which stays, and `countByRoleAndKycStatus`, unaffected).

Leave every other method in this interface untouched, including `findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc` (unit 3's territory — its comment mentions "admin-family rows" in passing but the method itself is about root associates, not Admin Team, and stays).

- [ ] **Step 6: Compile to confirm no dangling reference**

Run: `cd backend && mvn compile -q`
Expected: `BUILD SUCCESS`. If it fails, the error will name the file with a leftover reference — fix it before moving on (this task's own Step 1 should have caught everything, so a failure here means Step 1's grep missed something and needs re-running).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(company): delete Admin Team feature (staff sub-roles removed)"
```

---

## Task 2: Backend — remove the Admin Team step from `SetupStateService`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/company/SetupStateService.java`
- Modify: `backend/src/test/java/com/plotchain/company/SetupStateServiceTest.java`

**Interfaces:**
- Consumes: Task 1's deletion of `AdminProvisioningService` (this task removes `SetupStateService`'s only reference to it).
- Produces: `GET /api/company/setup-state` returns 7 steps instead of 8: `companyProfile`(1), `branding`(2), `compensation`(3), `projects`(4), `paymentsKyc`(5), `rootAssociates`(6), `reviewLaunch`(7).

- [ ] **Step 1: Edit `SetupStateService.java`**

Current file is 115 lines (already read in full during planning). Apply these changes:

1. Update the class-level comment (was "8-step wizard ... Step 8"):
```java
    // Order and required-ness match the master roadmap's 7-step wizard and its Step 7 "canGoLive"
    // gate (Company Profile + Compensation + Payments & KYC).
```

2. Remove the `adminTeam` entry from `STEP_DEFINITIONS` and renumber the two entries after it:
```java
    private static final List<StepDefinition> STEP_DEFINITIONS = List.of(
        new StepDefinition(1, "companyProfile", true),
        new StepDefinition(2, "branding", false),
        new StepDefinition(3, "compensation", true),
        new StepDefinition(4, "projects", false),
        new StepDefinition(5, "paymentsKyc", true),
        new StepDefinition(6, "rootAssociates", false),
        new StepDefinition(7, "reviewLaunch", false)
    );
```

3. Remove the `adminProvisioningService` field, constructor parameter, and constructor assignment:
```java
    private final SetupStateRepository setupStateRepository;
    private final CompanyProfileService companyProfileService;
    private final CompanyBrandingService companyBrandingService;
    private final CompensationPlanService compensationPlanService;
    private final PaymentConfigService paymentConfigService;
    private final PayoutBankAccountService payoutBankAccountService;
    private final ProjectService projectService;
    private final RootAssociateProvisioningService rootAssociateProvisioningService;

    public SetupStateService(SetupStateRepository setupStateRepository,
                              CompanyProfileService companyProfileService,
                              CompanyBrandingService companyBrandingService,
                              CompensationPlanService compensationPlanService,
                              PaymentConfigService paymentConfigService,
                              PayoutBankAccountService payoutBankAccountService,
                              ProjectService projectService,
                              RootAssociateProvisioningService rootAssociateProvisioningService) {
        this.setupStateRepository = setupStateRepository;
        this.companyProfileService = companyProfileService;
        this.companyBrandingService = companyBrandingService;
        this.compensationPlanService = compensationPlanService;
        this.paymentConfigService = paymentConfigService;
        this.payoutBankAccountService = payoutBankAccountService;
        this.projectService = projectService;
        this.rootAssociateProvisioningService = rootAssociateProvisioningService;
    }
```

4. Remove the `"adminTeam"` case from `isStepComplete`:
```java
    private boolean isStepComplete(String key) {
        return switch (key) {
            case "companyProfile" -> companyProfileService.isComplete();
            case "branding" -> companyBrandingService.isComplete();
            case "compensation" -> compensationPlanService.isComplete();
            case "paymentsKyc" -> paymentConfigService.isComplete() && payoutBankAccountService.isComplete();
            case "projects" -> projectService.isComplete();
            case "rootAssociates" -> rootAssociateProvisioningService.isComplete();
            case "reviewLaunch" -> isLaunched();
            default -> false;
        };
    }
```

Leave every other method (`getSetupState`, `isLaunched`, `launch`, `currentState`, the `StepDefinition` record) untouched.

- [ ] **Step 2: Edit `SetupStateServiceTest.java`**

1. Remove the `AdminProvisioningService` construction from `setUp()`. Current:
```java
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            new CompensationPlanService(
                compensationPlanVersionRepository, royaltyBonusRateRepository, rewardTierRepository, rankTierRepository,
                settingsAuditService, associateRepository),
            new PaymentConfigService(paymentConfigRepository,
                new SecretsEncryptionService("test-secrets-key-at-least-32-bytes-long-for-aes"), settingsAuditService),
            new PayoutBankAccountService(payoutBankAccountRepository, settingsAuditService),
            new ProjectService(projectRepository, plotRepository, settingsAuditService),
            new AdminProvisioningService(associateRepository, passwordEncoder, settingsAuditService),
            new RootAssociateProvisioningService(associateRepository, rankTierRepository, passwordEncoder,
                new AssociateIdGenerator(associateRepository, "VP"), settingsAuditService));
```
Becomes:
```java
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            new CompensationPlanService(
                compensationPlanVersionRepository, royaltyBonusRateRepository, rewardTierRepository, rankTierRepository,
                settingsAuditService, associateRepository),
            new PaymentConfigService(paymentConfigRepository,
                new SecretsEncryptionService("test-secrets-key-at-least-32-bytes-long-for-aes"), settingsAuditService),
            new PayoutBankAccountService(payoutBankAccountRepository, settingsAuditService),
            new ProjectService(projectRepository, plotRepository, settingsAuditService),
            new RootAssociateProvisioningService(associateRepository, rankTierRepository, passwordEncoder,
                new AssociateIdGenerator(associateRepository, "VP"), settingsAuditService));
```
(Note: `passwordEncoder` mock is still used by `RootAssociateProvisioningService`'s constructor — keep the `@Mock PasswordEncoder passwordEncoder;` field.)

2. Remove the now-stale comment block right above the `@Mock AssociateRepository associateRepository;` field (it referenced `AdminProvisioningService`):
```java
    // AdminProvisioningService is a concrete class, same as CompanyProfileService/
    // CompanyBrandingService/CompensationPlanService above -- a real instance is built over
    // mocked (interface) repositories per the same repo convention.
    @Mock AssociateRepository associateRepository;
```
Becomes:
```java
    @Mock AssociateRepository associateRepository;
```

3. Remove the `countByRoleNot` lenient stub (and its comment) from `setUp()`:
```java
        // "adminTeam" is non-required and defaults to no admin-family rows beyond none at all,
        // matching the other non-required steps' default-incomplete stubbing above.
        lenient().when(associateRepository.countByRoleNot(AssociateRole.ASSOCIATE)).thenReturn(0L);
```
Delete this block entirely (keep the `findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc` stub right after it — unit 3's territory, untouched).

4. Update `everyStepIsIncompleteUntilItsOwnPhaseLands`'s size assertion:
```java
        assertThat(response.steps()).hasSize(8);
```
becomes
```java
        assertThat(response.steps()).hasSize(7);
```

5. Delete the two `adminTeam`-specific test methods entirely:
```java
    @Test
    void adminTeamStepIsIncompleteWithOnlyOneAdminFamilyRow() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();
        when(associateRepository.countByRoleNot(AssociateRole.ASSOCIATE)).thenReturn(1L);

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("adminTeam")).findFirst().orElseThrow().complete())
            .isFalse();
        // adminTeam is optional -- canGoLive is unaffected either way.
        assertThat(response.canGoLive()).isFalse();
    }

    @Test
    void adminTeamStepIsCompleteWithTwoOrMoreAdminFamilyRows() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();
        when(associateRepository.countByRoleNot(AssociateRole.ASSOCIATE)).thenReturn(2L);

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("adminTeam")).findFirst().orElseThrow().complete())
            .isTrue();
        // adminTeam is optional -- completing it must not affect the Go Live gate.
        assertThat(response.canGoLive()).isFalse();
        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("adminTeam")).findFirst().orElseThrow().required())
            .isFalse();
    }
```

Leave `rootAssociatesStepIsIncompleteWithNoRoots`/`rootAssociatesStepIsCompleteWithOneRoot`/`reviewLaunchStepBecomesCompleteOnceLaunched` and every other test method untouched.

- [ ] **Step 2b: Check for now-unused imports**

After the above edits, `SetupStateServiceTest.java` no longer references `AdminProvisioningService` — since it was never imported by class name in the first place (same package, `com.plotchain.company`), there is no import line to remove. Confirm this by checking the file has no `import com.plotchain.company.AdminProvisioningService;` line (there shouldn't be one — same-package classes aren't imported).

- [ ] **Step 3: Run the two affected test classes**

Run: `cd backend && mvn test -q -Dtest=SetupStateServiceTest`
Expected: `BUILD SUCCESS`, all tests pass (17 tests, down from 19 after the two deletions).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(company): drop Admin Team step from SetupStateService, renumber remaining steps"
```

---

## Task 3: Backend — remove `/api/company/admins*` from `SecurityConfig`, delete dead `SecurityConfigTest` cases, verify final backend baseline

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: Task 1's controller deletion (these routes now 404 at the controller layer; this task removes the now-meaningless authorization rules for them).
- Produces: no `SecurityConfig` matcher references `/api/company/admins` in any form. `SecurityConfigTest` has 8 fewer test methods.

- [ ] **Step 1: Remove the `POST /api/company/admins` matcher block**

In `SecurityConfig.java`, delete this block (currently sits between the `PUT /api/associates/me/profile` matcher and the "Deny-by-default for writes" comment):
```java
                // Admin Team creation is narrower than the blanket POST rule below: only
                // ADMIN/SUPER_ADMIN may provision new admin-family accounts (FINANCE,
                // KYC_REVIEWER, and SUPPORT can read the roster/permissions via the GET block
                // further down, but must not be able to create new admin accounts themselves).
                // Must precede the blanket rule (first-match-wins) or it would never be reached.
                .requestMatchers(HttpMethod.POST, "/api/company/admins")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN")
```
So that `.requestMatchers(HttpMethod.PUT, "/api/associates/me/profile").authenticated()` is immediately followed by the "Deny-by-default for writes" comment block.

- [ ] **Step 2: Remove the three `GET /api/company/admins*` matchers**

Delete this block (currently sits between the projects-CSV-template GET matcher and the Root Associates GET matcher):
```java
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects
                // above: Phase 10's Admin Team GETs (roster, userId availability check, and the
                // read-only role-permissions preview) stay admin-family-only. The narrower
                // ADMIN/SUPER_ADMIN-only POST that creates admin accounts is declared separately
                // above, next to the other blanket write rules -- deliberately no separate
                // matcher needed here for it.
                .requestMatchers(HttpMethod.GET,
                        "/api/company/admins", "/api/company/admins/user-id-available",
                        "/api/company/admins/role-permissions")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 3: Fix the two now-dangling comment chains that referenced "admin-team above"**

The Root Associates GET matcher's comment currently reads:
```java
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects/
                // admin-team above: Phase 11's Root Associates GET stays admin-family-only. The
                // POST that creates a root is a write and is already covered by the blanket POST
                // rule above -- deliberately no separate matcher for it (unlike Admin Team's
                // narrower POST, there is no stated reason to restrict root-associate creation
                // beyond the standard admin-family write rule).
                .requestMatchers(HttpMethod.GET, "/api/company/root-associates")
                    .hasAuthority("ADMIN")
```
Update to drop the now-nonexistent "admin-team" anchor (keep everything else — Root Associates itself is unit 3's territory, not touched otherwise):
```java
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects
                // above: Phase 11's Root Associates GET stays admin-family-only. The POST that
                // creates a root is a write and is already covered by the blanket POST rule
                // above -- deliberately no separate matcher for it.
                .requestMatchers(HttpMethod.GET, "/api/company/root-associates")
                    .hasAuthority("ADMIN")
```

The audit-log GET matcher's comment currently reads:
```java
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects/
                // admin-team/root-associates above: the audit-log GET stays admin-family-only.
                // There is no mutating endpoint for this resource at all (append-only, written
                // internally by SettingsAuditService) -- deliberately no write matcher.
                .requestMatchers(HttpMethod.GET, "/api/company/audit-log")
                    .hasAuthority("ADMIN")
```
Update to:
```java
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects/
                // root-associates above: the audit-log GET stays admin-family-only. There is no
                // mutating endpoint for this resource at all (append-only, written internally by
                // SettingsAuditService) -- deliberately no write matcher.
                .requestMatchers(HttpMethod.GET, "/api/company/audit-log")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Delete the 8 dead `SecurityConfigTest` methods**

Delete these methods in full, in place (they are contiguous in the file, between `brandingFaviconIsReachableWithoutAToken` and `rootAssociatesListIsForbiddenForAnAssociateToken`):

```java
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = {"ADMIN", "SUPER_ADMIN"})
    void createAdminPassesTheSecurityLayerForAdminOrSuperAdminTokens(AssociateRole role) throws Exception {
        // 400, not 403: an empty body fails bean validation, but that only happens after the
        // security layer let the request through -- which is the distinction being asserted.
        mockMvc.perform(post("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isBadRequest());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = {"FINANCE", "KYC_REVIEWER", "SUPPORT", "ASSOCIATE"})
    void createAdminIsForbiddenForNonAdminTokens(AssociateRole role) throws Exception {
        // Narrower than the blanket ADMIN-family write rule: only ADMIN/SUPER_ADMIN may
        // provision new admin accounts, so the other admin-family roles (which CAN reach the
        // GET endpoints below) must still be rejected here.
        mockMvc.perform(post("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content("{}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void adminsListIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // associateRepository is @MockBean'd at the class level above (unstubbed here), and
    // Mockito's default answer returns an empty List rather than null for a List-returning
    // method, so findByRoleNotOrderByUserIdAsc(...) resolves to an empty roster and this is
    // a plain 200.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void adminsListIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/admins")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void userIdAvailabilityIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/admins/user-id-available").param("userId", "someone")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void userIdAvailabilityIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/admins/user-id-available").param("userId", "someone")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }

    @Test
    void rolePermissionsIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/admins/role-permissions")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void rolePermissionsIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/admins/role-permissions")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }
```

Leave `rootAssociatesListIsForbiddenForAnAssociateToken`/`rootAssociatesListIsReachableForAnyAdminFamilyToken` and everything else in the file untouched (unit 3's territory).

- [ ] **Step 5: Run `SecurityConfigTest`**

Run: `cd backend && mvn test -q -Dtest=SecurityConfigTest`
Expected: `BUILD SUCCESS`, all remaining tests pass.

- [ ] **Step 6: Run the full backend suite and confirm the new expected-red baseline**

Run: `cd backend && mvn test 2>&1 | tail -80`

Expected: the only failures present are the 4 pre-existing, unrelated ones documented above and in `docs/plotchain_jdk_mockito_env_issue.md`'s sibling note (this repo's memory: `JDK/Mockito env issue` — but that memory describes ~55 *spurious* Mockito-environment errors on a JDK21/25 mismatch, which is a *different, separate* issue from these 4 real assertion failures; if the full-suite run shows a large spurious-error count on top of these 4, that matches the known JDK/Mockito environment issue and is unrelated to this unit — don't chase it):
- `JwtServiceTest.refusesToStartWithTheDevDefaultSecretUnderAnUnrelatedProfile`
- `JwtServiceTest.refusesToStartWithTheDevDefaultSecretWhenNoProfileIsActive`
- `SecretsEncryptionServiceTest.refusesToStartWithTheDevDefaultKeyUnderAnUnrelatedProfile`
- `SecretsEncryptionServiceTest.refusesToStartWithTheDevDefaultKeyWhenNoProfileIsActive`

Confirm none of the 10 previously-red Admin-Team-related failures appear anymore (they can't — their test classes/methods no longer exist). If any NEW failure appears beyond these 4 (and beyond the known spurious JDK/Mockito noise), stop and diagnose before continuing — don't classify it as "unrelated" without comparing against a clean-`master` baseline run first (per this unit queue's own documented lesson from unit 2's near-miss).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(auth): remove /api/company/admins* routes and dead SecurityConfigTest cases"
```

---

## Task 4: Frontend — delete the Admin Team wizard step, its route, and shrink `ADMIN_FAMILY_ROLES`

**Files:**
- Delete: `frontend/src/app/setup/steps/admin-team/` (entire directory: `admin-team-step.component.ts`, `admin-team-step.component.spec.ts`, `admin-team.service.ts`, `admin-team.service.spec.ts`)
- Delete: `frontend/src/app/setup/models/admin-team.model.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/admin/admin.guard.ts`
- Modify: `frontend/src/app/admin/admin.guard.spec.ts`
- Modify: `frontend/src/app/auth/login.component.spec.ts`
- Modify: `frontend/src/app/auth/change-password.component.spec.ts`
- Modify: `frontend/src/app/auth/post-auth-redirect.spec.ts`
- Modify: `frontend/src/app/auth/root-redirect.guard.spec.ts`
- Modify: `frontend/src/app/auth/associate-only.guard.spec.ts`

**Interfaces:**
- Consumes: nothing from other tasks (frontend is independent of the backend tasks; both talk to the same eventual API shape but neither compiles against the other).
- Produces: no route, component, or guard set references Admin Team or a non-`ADMIN` admin-family role. Task 5 depends on this (it edits `setup-state.model.ts`/`settings-section.model.ts`, which reference the same routing concept).

- [ ] **Step 1: Delete the Admin Team step directory and its model**

```bash
cd frontend
git rm -r src/app/setup/steps/admin-team
git rm src/app/setup/models/admin-team.model.ts
```

- [ ] **Step 2: Remove the Admin Team route from `app.routes.ts`**

Remove the import:
```ts
import { AdminTeamStepComponent } from './setup/steps/admin-team/admin-team-step.component';
```

Remove the two route entries (one in `/setup/*` children, one in `/settings/*` children):
```ts
      { path: 'admin-team', component: AdminTeamStepComponent, data: { stepKey: 'adminTeam' } },
```
```ts
      { path: 'admin-team', component: AdminTeamStepComponent, data: { sectionKey: 'adminTeam', mode: 'settings' } },
```

Leave the `RootAssociatesStepComponent` import and both of its route entries untouched (unit 3's territory).

- [ ] **Step 3: Update `app.routes.spec.ts`'s wizard-step-count test**

Current:
```ts
    it('has all 8 wizard-step children plus the default redirect', () => {
      const childPaths = setupRoute!.children!.map(c => c.path);
      expect(childPaths).toEqual([
        'company-profile',
        'branding',
        'compensation',
        'projects',
        'payments-kyc',
        'admin-team',
        'root-associates',
        'review-launch',
        ''
      ]);
    });
```
Becomes:
```ts
    it('has all 7 wizard-step children plus the default redirect', () => {
      const childPaths = setupRoute!.children!.map(c => c.path);
      expect(childPaths).toEqual([
        'company-profile',
        'branding',
        'compensation',
        'projects',
        'payments-kyc',
        'root-associates',
        'review-launch',
        ''
      ]);
    });
```

- [ ] **Step 4: Shrink `ADMIN_FAMILY_ROLES` in `admin.guard.ts`**

Current:
```ts
// Mirrors AssociateRole.isAdminFamily() on the backend: every role except ASSOCIATE may
// reach admin routes. Kept as a literal set (not imported) since the frontend has no shared
// enum with the backend; SecurityConfigTest is the source of truth this must stay in sync with.
// Exported so login.component.ts can reuse it for post-login routing instead of duplicating it.
export const ADMIN_FAMILY_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT']);
```
Becomes:
```ts
// Only one admin-family role exists now (ADMIN). Kept as a Set (not a direct string ===
// comparison) so login.component.ts/post-auth-redirect.ts/associate-only.guard.ts, which all
// import and check against this same set, don't each need their own follow-up edit if a second
// admin-family role is ever reintroduced.
export const ADMIN_FAMILY_ROLES = new Set(['ADMIN']);
```
No other line in this file changes — `adminGuard` itself just calls `.has(role)`, unaffected by the set's size.

- [ ] **Step 5: Update `admin.guard.spec.ts`**

Current:
```ts
  for (const role of ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT']) {
    it(`allows navigation when the stored role is ${role}`, () => {
```
Becomes:
```ts
  for (const role of ['ADMIN']) {
    it(`allows navigation when the stored role is ${role}`, () => {
```

- [ ] **Step 6: Delete the dedicated "non-ADMIN admin-family role" test case from `login.component.spec.ts`**

Delete this whole `it(...)` block:
```ts
  it('navigates to /settings on a non-ADMIN admin-family login once launched', () => {
    fixture.componentInstance.form.setValue({ userId: 'finance01', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/auth/login')
      .flush({ token: 'abc.def.ghi', associateId: 'finance-1', role: 'FINANCE', mustChangePassword: false });

    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/settings']);
  });
```
There is no such role left to route to `/settings` this way — `/settings` is still reachable, just no longer via a second admin-family role (only `ADMIN` exists, and `ADMIN` already has its own dedicated test, `navigates to the admin route on an ADMIN login once launched`, immediately above this one). Leave every other test in the file untouched.

- [ ] **Step 7: Delete the dedicated "non-ADMIN admin-family role" test case from `change-password.component.spec.ts`**

Delete this whole `it(...)` block:
```ts
  it('navigates to /settings when a non-ADMIN admin-family role completes a forced password change once launched', () => {
    localStorage.setItem('plotchain.auth.role', 'FINANCE');

    fixture.componentInstance.form.setValue({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/password').flush(null);
    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/settings']);
  });
```
Leave every other test in the file untouched (including `navigates to the admin route when an ADMIN completes a forced password change once launched`, immediately above).

- [ ] **Step 8: Update `post-auth-redirect.spec.ts`**

Update the "covers exactly the admin-family set" assertion:
```ts
  it('covers exactly the admin-family set', () => {
    expect([...ADMIN_FAMILY_ROLES].sort()).toEqual(['ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPER_ADMIN', 'SUPPORT']);
  });
```
becomes
```ts
  it('covers exactly the admin-family set', () => {
    expect([...ADMIN_FAMILY_ROLES].sort()).toEqual(['ADMIN']);
  });
```

Delete the now-vacuous "every OTHER admin-family role" test entirely (with `ADMIN_FAMILY_ROLES` now a one-element set, `[...ADMIN_FAMILY_ROLES].filter(r => r !== 'ADMIN')` is always empty — the test's loop body would never execute, silently testing nothing rather than actually asserting anything):
```ts
  it('sends every other admin-family role to /settings once launched', () => {
    for (const role of [...ADMIN_FAMILY_ROLES].filter(r => r !== 'ADMIN')) {
      expect(postAuthLandingPath(role, launchedState, () => 'company-profile')).toBe('/settings');
    }
  });
```
Leave `sends ASSOCIATE to /dashboard regardless of setup state`, `sends every admin-family role to the first incomplete setup step while unlaunched`, `sends ADMIN to /admin/associates/new once launched`, and `never invokes incompleteStepPath when launched` untouched.

- [ ] **Step 9: Delete the dedicated "non-ADMIN admin-family role" test case from `root-redirect.guard.spec.ts`**

Delete this whole `it(...)` block:
```ts
  it('redirects a non-ADMIN admin-family role to /settings once launched', done => {
    authService.getRole.and.returnValue('FINANCE');
    setupService.getState.and.returnValue(of(launchedState));

    const result$ = TestBed.runInInjectionContext(() => rootRedirectGuard({} as any, {} as any)) as any;
    result$.subscribe((result: UrlTree) => {
      expect(result.toString()).toBe(router.parseUrl('/settings').toString());
      done();
    });
  });
```

- [ ] **Step 10: Delete the dedicated "non-ADMIN admin-family role" test case from `associate-only.guard.spec.ts`**

Delete this whole `it(...)` block:
```ts
  it('redirects a non-ADMIN admin-family role to /settings once launched', done => {
    authService.getRole.and.returnValue('FINANCE');
    setupService.getState.and.returnValue(of(launchedState));

    const result$ = TestBed.runInInjectionContext(() => associateOnlyGuard({} as any, {} as any)) as any;
    result$.subscribe((result: UrlTree) => {
      expect(result.toString()).toBe(router.parseUrl('/settings').toString());
      done();
    });
  });
```

- [ ] **Step 11: Search for any remaining stray reference**

Run:
```bash
cd frontend
grep -rln "AdminTeamStepComponent\|admin-team.model\|adminTeamStepComponent" src/app
```
Expected: no output. (`grep -rln "admin-team"` will still find references in `setup-state.model.ts`, `settings-section.model.ts`, and the i18n files — those are handled in Task 5, not this task.)

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(setup): delete Admin Team wizard step, shrink ADMIN_FAMILY_ROLES to one role"
```

---

## Task 5: Frontend — trim step/section maps, renumber the review-launch spec fixture, remove i18n keys, verify green

**Files:**
- Modify: `frontend/src/app/setup/models/setup-state.model.ts`
- Modify: `frontend/src/app/settings/models/settings-section.model.ts`
- Modify: `frontend/src/app/settings/audit-log/audit-log.model.ts`
- Modify: `frontend/src/app/settings/audit-log/audit-log.service.spec.ts`
- Modify: `frontend/src/app/setup/steps/review-launch/review-launch-step.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: Task 4's route/component deletion (this task removes the data-model entries that fed those routes).
- Produces: `STEP_PATHS`/`SECTION_PATHS`/`AUDIT_LOG_SECTION_BACKEND_VALUES` have 6 entries where they had 7 (the `adminTeam` one). `SetupService.nextStepPath('paymentsKyc')` now returns `'root-associates'` and `SetupService.previousStepPath('rootAssociates')` now returns `'payments-kyc'`, both automatically (no code change to `setup.service.ts` itself — confirmed it derives purely from `Object.keys(STEP_PATHS)` order).

- [ ] **Step 1: Remove the `adminTeam` entry from `STEP_PATHS`**

In `setup-state.model.ts`, current:
```ts
export const STEP_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc',
  adminTeam: 'admin-team',
  rootAssociates: 'root-associates',
  reviewLaunch: 'review-launch'
};
```
Becomes:
```ts
export const STEP_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc',
  rootAssociates: 'root-associates',
  reviewLaunch: 'review-launch'
};
```

- [ ] **Step 2: Remove the `adminTeam` entry from `SECTION_PATHS`**

In `settings-section.model.ts`, current:
```ts
export const SECTION_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc',
  adminTeam: 'admin-team',
  rootAssociates: 'root-associates'
  // auditLog deliberately absent: it isn't a wrapped step component and has its own route,
  // added directly in SettingsNavRailComponent's template rather than via this shared map.
};
```
Becomes:
```ts
export const SECTION_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc',
  rootAssociates: 'root-associates'
  // auditLog deliberately absent: it isn't a wrapped step component and has its own route,
  // added directly in SettingsNavRailComponent's template rather than via this shared map.
};
```

- [ ] **Step 3: Remove the `adminTeam` entry from `AUDIT_LOG_SECTION_BACKEND_VALUES` and update its comment**

In `audit-log.model.ts`, current:
```ts
// One-time lookup from the camelCase section keys used across the frontend (SECTION_PATHS) to
// the SCREAMING_SNAKE_CASE values the backend's `section` query param expects. Covers exactly
// the 7 real sections -- there's no backend value for "auditLog"/"all", those never get sent.
export const AUDIT_LOG_SECTION_BACKEND_VALUES: Record<string, string> = {
  companyProfile: 'COMPANY_PROFILE',
  branding: 'BRANDING',
  compensation: 'COMPENSATION',
  projects: 'PROJECTS',
  paymentsKyc: 'PAYMENTS_KYC',
  adminTeam: 'ADMIN_TEAM',
  rootAssociates: 'ROOT_ASSOCIATES'
};
```
Becomes:
```ts
// One-time lookup from the camelCase section keys used across the frontend (SECTION_PATHS) to
// the SCREAMING_SNAKE_CASE values the backend's `section` query param expects. Covers exactly
// the 6 real sections -- there's no backend value for "auditLog"/"all", those never get sent.
export const AUDIT_LOG_SECTION_BACKEND_VALUES: Record<string, string> = {
  companyProfile: 'COMPANY_PROFILE',
  branding: 'BRANDING',
  compensation: 'COMPENSATION',
  projects: 'PROJECTS',
  paymentsKyc: 'PAYMENTS_KYC',
  rootAssociates: 'ROOT_ASSOCIATES'
};
```

- [ ] **Step 4: Update `audit-log.service.spec.ts`'s section-mapping test**

Current:
```ts
  it('maps every one of the 7 section keys to its expected backend value', () => {
    const expected: Record<string, string> = {
      companyProfile: 'COMPANY_PROFILE',
      branding: 'BRANDING',
      compensation: 'COMPENSATION',
      projects: 'PROJECTS',
      paymentsKyc: 'PAYMENTS_KYC',
      adminTeam: 'ADMIN_TEAM',
      rootAssociates: 'ROOT_ASSOCIATES'
    };
```
Becomes:
```ts
  it('maps every one of the 6 section keys to its expected backend value', () => {
    const expected: Record<string, string> = {
      companyProfile: 'COMPANY_PROFILE',
      branding: 'BRANDING',
      compensation: 'COMPENSATION',
      projects: 'PROJECTS',
      paymentsKyc: 'PAYMENTS_KYC',
      rootAssociates: 'ROOT_ASSOCIATES'
    };
```
Leave the rest of the test body (the `Object.keys(expected).forEach(...)` loop) untouched — it's already data-driven off this object.

- [ ] **Step 5: Renumber `review-launch-step.component.spec.ts`'s `stateWith()` fixture**

Current:
```ts
  function stateWith(canGoLive: boolean): SetupStateResponse {
    return {
      steps: [
        step({ number: 1, key: 'companyProfile', required: true, complete: canGoLive }),
        step({ number: 2, key: 'branding', required: false, complete: false }),
        step({ number: 3, key: 'compensation', required: true, complete: canGoLive }),
        step({ number: 4, key: 'projects', required: false, complete: false }),
        step({ number: 5, key: 'paymentsKyc', required: true, complete: canGoLive }),
        step({ number: 6, key: 'adminTeam', required: false, complete: false }),
        step({ number: 7, key: 'rootAssociates', required: false, complete: false }),
        step({ number: 8, key: 'reviewLaunch', required: false, complete: false })
      ],
      canGoLive,
      launchedAt: null
    };
  }
```
Becomes:
```ts
  function stateWith(canGoLive: boolean): SetupStateResponse {
    return {
      steps: [
        step({ number: 1, key: 'companyProfile', required: true, complete: canGoLive }),
        step({ number: 2, key: 'branding', required: false, complete: false }),
        step({ number: 3, key: 'compensation', required: true, complete: canGoLive }),
        step({ number: 4, key: 'projects', required: false, complete: false }),
        step({ number: 5, key: 'paymentsKyc', required: true, complete: canGoLive }),
        step({ number: 6, key: 'rootAssociates', required: false, complete: false }),
        step({ number: 7, key: 'reviewLaunch', required: false, complete: false })
      ],
      canGoLive,
      launchedAt: null
    };
  }
```

- [ ] **Step 6: Update the checklist-row-count assertion in the same file**

Current:
```ts
  it('renders one checklist row per step, excluding review-launch itself', async () => {
    await createAndFlush(stateWith(false));

    const rows = fixture.debugElement.queryAll(By.directive(ChecklistRowComponent));
    expect(rows.length).toBe(7);
    expect(rows.map(r => r.componentInstance.label)).not.toContain('reviewLaunch');
  });
```
Becomes:
```ts
  it('renders one checklist row per step, excluding review-launch itself', async () => {
    await createAndFlush(stateWith(false));

    const rows = fixture.debugElement.queryAll(By.directive(ChecklistRowComponent));
    expect(rows.length).toBe(6);
    expect(rows.map(r => r.componentInstance.label)).not.toContain('reviewLaunch');
  });
```
Leave `resolves previousPath to the step before review-launch` (asserts `'root-associates'`) untouched — that assertion is unaffected by the renumbering, since `rootAssociates` is still the step immediately before `reviewLaunch` in `STEP_PATHS`'s key order either way. Leave every other test in the file untouched.

- [ ] **Step 7: Remove the `adminTeam` i18n keys from `en.json`**

Remove the `"adminTeam": "Admin Team & Roles",` line from `setup.steps` (leave `rootAssociates`/`reviewLaunch` untouched):
```json
      "adminTeam": "Admin Team & Roles",
```

Remove the entire `setup.adminTeam` block (from `"adminTeam": {` through its matching closing `},` right before `"rootAssociates": {` begins) — this is the large block containing `title`, `stepEyebrowLabel`, `subtitle`, `totalAdminsLabel`, ... through `validation`. Confirm the block's end by checking the next top-level key at the same indentation is `"rootAssociates"` — do not remove anything from `rootAssociates` onward.

Remove the `"adminTeam": "Admin Team & Roles",` line from `settings.sections` (leave `rootAssociates` and every other section untouched):
```json
      "adminTeam": "Admin Team & Roles",
```

Remove the `"adminTeam": { "actionLabel": "Manage" },` block from `settings.cards` (leave `rootAssociates`'s card untouched):
```json
      "adminTeam": {
        "actionLabel": "Manage"
      },
```

- [ ] **Step 8: Apply the identical four removals to `hi.json`**

`hi.json` mirrors `en.json`'s structure exactly (verified: same keys at the same nesting, same relative ordering). Apply the same four removals — `setup.steps.adminTeam`, the `setup.adminTeam` block, `settings.sections.adminTeam`, `settings.cards.adminTeam` — using `hi.json`'s own (Hindi) string values, not `en.json`'s.

- [ ] **Step 9: Validate both JSON files still parse**

Run:
```bash
cd frontend
python3 -c "import json; json.load(open('src/assets/i18n/en.json')); json.load(open('src/assets/i18n/hi.json')); print('OK')"
```
Expected: `OK`. A syntax error here (e.g. a dangling comma from an incomplete block removal) will throw — fix before proceeding.

- [ ] **Step 10: Search for any remaining stray reference**

Run:
```bash
cd frontend
grep -rn "adminTeam\|admin-team\|ADMIN_TEAM" src/app src/assets 2>/dev/null
```
Expected: no output at all.

- [ ] **Step 11: Run the full frontend test suite**

Run: `cd frontend && npm test -- --watch=false`
Expected: all tests pass, 0 failures. If a test fails referencing a step count, section list, or route list not covered by this plan's edits, that's a gap in this plan's verification — find and fix it (search `grep -rn "hasSize\|toEqual.*adminTeam\|\.length).toBe" ` isn't needed if the failure message names the exact assertion; fix the specific file the failure points to, following the same pattern as this task's edits).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(setup): remove Admin Team entries from step/section maps and i18n"
```

---

## Task 6: Final full-repo verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend suite one more time from a clean state**

Run: `cd backend && mvn clean test 2>&1 | tail -100`

Expected: exactly the 4 pre-existing unrelated failures (`JwtServiceTest` x2, `SecretsEncryptionServiceTest` x2), nothing else — confirming the backend expected-red baseline dropped from 14 to 4, as this unit's acceptance criteria requires. If the JDK/Mockito environment issue (documented separately in this repo's memory as ~55 spurious errors on a JDK21/25 mismatch) also surfaces, that's unrelated pre-existing noise, not a regression — don't let it obscure whether the 4-failure baseline is otherwise exact.

- [ ] **Step 2: Run the full frontend suite one more time**

Run: `cd frontend && npm test -- --watch=false`

Expected: 0 failures.

- [ ] **Step 3: Confirm no stray reference to the deleted feature remains anywhere in the repo**

Run:
```bash
grep -rn "AdminController\b\|AdminProvisioningService\|AdminRolePermissions\|CreateAdminRequest\|CreateAdminResponse\|AdminSummaryResponse\|UserIdAvailabilityResponse\|InvalidAdminRoleException\|UserIdAlreadyRegisteredException" backend/src
grep -rn "AdminTeamStepComponent\|admin-team\|adminTeam\|ADMIN_TEAM" frontend/src
```
Expected: no output from either command. (`AdminAssociateController`/`AdminAssociateService`/`AdminStatsController` etc. are a different, unrelated feature — Admin Usage's suspend/reactivate/stats screens — and must NOT show up in or be affected by this search; if the first grep's pattern accidentally matches one of those, that's a false positive from an overly broad pattern, not a real finding — the patterns above are anchored to the exact deleted class names and shouldn't do this, but double-check if anything unexpected appears.)

- [ ] **Step 4: State the final result**

Record in the unit-queue doc (`docs/superpowers/plans/2026-08-03-role-capability-units.md`, row 4) once this plan is executed and merged: mark unit 4 `merged`, note the commit range, and note the new backend expected-red baseline (4, down from 14) for the next unit in the queue to pick up — the same pattern every prior unit in this run has followed.

---

## Self-review notes (from the writing-plans process, kept for the executor's context)

- **Spec coverage**: every bullet in the spec's "Out of scope / removed" section for Admin Team (`AssociateRole` sub-roles — already done by unit 1; `AdminRolePermissions` — Task 1; the setup step and its frontend — Tasks 1, 2, 4, 5) is covered by a task above. The Root Associate half of that same spec section is deliberately NOT covered — unit 3's territory.
- **Placeholder scan**: every step above shows exact before/after code, not a description of what to do — no "add appropriate handling"-style placeholders.
- **Type/name consistency**: `SetupStateService`'s constructor parameter order in Task 2 Step 1.3 matches the order `SetupStateServiceTest` passes them in Task 2 Step 2.1. `ADMIN_FAMILY_ROLES`'s new value (`new Set(['ADMIN'])`) is referenced identically by every consuming spec file's remaining assertions in Task 4.
