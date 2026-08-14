# Role-Capability Unit 3: Root Associate Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the Root Associate provisioning feature (backend service/controller/DTOs/exceptions, the `/api/company/root-associates` route, its `SecurityConfig`/`SecurityConfigTest` matcher, its `SetupStateService` wizard step, and the entire frontend step/route/model/i18n surface) now that role-capability unit 2 already made the Admin account the tree root by construction (`parent_id = NULL` in `V18__seed_founding_admin.sql`). This unit is pure cleanup of the now-redundant separate seeding mechanism — it does not change how the tree root is established.

**Architecture:** Backend deletion in `com.plotchain.company` (controller, service, 6 DTOs/exceptions, 2 test files), one `SecurityConfig` matcher removed and two dangling comments fixed in `SecurityConfigTest`, one `AssociateRepository` method removed (used only by the deleted service), `SetupStateService.STEP_DEFINITIONS` renumbered from the current post-unit-4 7-step list down to 6 steps. Frontend deletion of the entire `setup/steps/root-associates/` directory and its model, two route entries removed from `app.routes.ts`, `STEP_PATHS`/`SECTION_PATHS`/`AUDIT_LOG_SECTION_BACKEND_VALUES` entries removed, i18n keys removed from both `en.json` and `hi.json`, and every spec file that hardcodes a `rootAssociates` reference or a section/step count updated to match.

**Tech Stack:** Spring Boot / JUnit 5 / Mockito (backend), Angular / Jasmine-Karma (frontend).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md`

## Global Constraints

- Do not touch `V12__settings_audit_log.sql` or any other applied Flyway migration — migrations are immutable. The `ROOT_ASSOCIATES` (and `ADMIN_TEAM`) values stay in that migration's check constraint even though nothing writes them anymore; historical audit rows keep referencing it.
- Do not re-touch any Admin Team (`adminTeam`) code, comments, or tests — that removal was already implemented and merged in unit 4. This unit's scope is Root Associate only.
- Renumber `SetupStateService.STEP_DEFINITIONS` from the CURRENT (post-unit-4) 7-step list, not from any older reference document's numbers.
- `NoRankTiersConfiguredException` is shared with `AssociateProvisioningService` — do NOT delete it; only its usage inside the deleted `RootAssociateProvisioningService` goes away.
- The helper method `seedRootAssociate()` inside `CycleCloseRollbackTest.java` is an unrelated, locally-named test fixture (seeds a tree-root `Associate` row for cycle-close testing) — do not touch it, it has nothing to do with the classes this unit deletes.

---

## Verified current state (read directly from the repo before writing this plan)

**Backend files to delete (confirmed present, confirmed shape):**
- `backend/src/main/java/com/plotchain/company/RootAssociateController.java` — `@RequestMapping("/api/company/root-associates")`, `POST` (create) and `GET` (list).
- `backend/src/main/java/com/plotchain/company/RootAssociateProvisioningService.java`
- `backend/src/main/java/com/plotchain/company/CreateRootAssociateRequest.java`
- `backend/src/main/java/com/plotchain/company/CreateRootAssociateResponse.java`
- `backend/src/main/java/com/plotchain/company/RootAssociateSlotsResponse.java`
- `backend/src/main/java/com/plotchain/company/RootAssociateSummaryResponse.java`
- `backend/src/main/java/com/plotchain/company/RootAssociateCreationResult.java`
- `backend/src/main/java/com/plotchain/company/RootAssociateAlreadyExistsException.java`
- `backend/src/main/java/com/plotchain/company/RightRootDetailsRequiredException.java`
- `backend/src/test/java/com/plotchain/company/RootAssociateControllerTest.java`
- `backend/src/test/java/com/plotchain/company/RootAssociateProvisioningServiceTest.java`

**`AssociateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc`** (line 89 of `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`) is used in exactly 4 places: the two files being deleted above, plus stubs in `SecurityConfigTest.java` (unstubbed, relies on Mockito's empty-list default) and `SetupStateServiceTest.java` (both stubbed explicitly and used in assertions) — both of which this plan also edits. Confirmed no other caller exists anywhere in `backend/src`.

**`SetupStateService.STEP_DEFINITIONS`** (current, post-unit-4 state, verified by reading the file):
```java
new StepDefinition(1, "companyProfile", true),
new StepDefinition(2, "branding", false),
new StepDefinition(3, "compensation", true),
new StepDefinition(4, "projects", false),
new StepDefinition(5, "paymentsKyc", true),
new StepDefinition(6, "rootAssociates", false),
new StepDefinition(7, "reviewLaunch", false)
```
After removing `rootAssociates`, `reviewLaunch` renumbers from 7 to 6. No other step numbers change.

**`SecurityConfig.java`**: exactly one matcher for this route exists — `GET /api/company/root-associates` → `hasAuthority("ADMIN")` (lines 190–194, with a leading comment block). The `POST` is already covered by the blanket `POST /api/**` rule with no dedicated matcher, so nothing else to remove there. The very next matcher (`GET /api/company/audit-log`, lines 195–200) has a comment that explicitly chains off "...root-associates above" — this dangles once the root-associates matcher/comment is deleted and must be edited.

**`SecurityConfigTest.java`**: two tests target this route — `rootAssociatesListIsForbiddenForAnAssociateToken` (line 330) and `rootAssociatesListIsReachableForAnyAdminFamilyToken` (line 341, parameterized). Two OTHER tests (not being deleted) have comments that reference `rootAssociatesListIsReachableForAnyAdminFamilyToken above` by name — `associatesListIsReachableForAnyAdminFamilyToken`'s comment (lines 356–358) and `auditLogIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate`'s comment (lines 373–375). Both dangle after deletion and must be reworded to point at a still-existing anchor.

**Frontend files to delete (confirmed present):**
- `frontend/src/app/setup/steps/root-associates/root-associates-step.component.ts`
- `frontend/src/app/setup/steps/root-associates/root-associates-step.component.spec.ts`
- `frontend/src/app/setup/steps/root-associates/root-associates.service.ts`
- `frontend/src/app/setup/steps/root-associates/root-associates.service.spec.ts`
- `frontend/src/app/setup/models/root-associates.model.ts`

**`app.routes.ts`**: one import (line 16) plus two route entries — the setup-wizard child (line 52, `path: 'root-associates'`, `data: { stepKey: 'rootAssociates' }`) AND a settings child (line 68, `path: 'root-associates'`, `data: { sectionKey: 'rootAssociates', mode: 'settings' }`). Root Associate DOES have a settings-section equivalent, unlike what might be assumed — both route entries must be removed.

**Models needing a `rootAssociates` entry removed:**
- `frontend/src/app/setup/models/setup-state.model.ts` — `STEP_PATHS['rootAssociates'] = 'root-associates'` (line 27).
- `frontend/src/app/settings/models/settings-section.model.ts` — `SECTION_PATHS['rootAssociates'] = 'root-associates'` (line 7, currently the last of 6 keys).
- `frontend/src/app/settings/audit-log/audit-log.model.ts` — `AUDIT_LOG_SECTION_BACKEND_VALUES['rootAssociates'] = 'ROOT_ASSOCIATES'` (line 37, last of 6). File also has a comment "the same 6 sections used elsewhere" (line 25) that must become "5 sections".

**Specs with hardcoded `rootAssociates` references (verified directly, not from the older reference plan):**
- `frontend/src/app/app.routes.spec.ts` — `'root-associates'` in the 7-item `childPaths` array (line 63); the enclosing test name says "has all 7 wizard-step children" (line 55) and must become 6.
- `frontend/src/app/settings/audit-log/audit-log.service.spec.ts` — `rootAssociates: 'ROOT_ASSOCIATES'` entry (line 76) inside a test literally named `'maps every one of the 6 section keys...'` (line 69) — rename to 5.
- `frontend/src/app/setup/steps/review-launch/review-launch-step.component.spec.ts` — a `step({ number: 6, key: 'rootAssociates', ... })` entry (line 29) inside the 7-step `stateWith()` fixture, AND a separate assertion `previousPath` resolves to `'root-associates'` (line 139) which must become `'payments-kyc'` (the new step immediately before `reviewLaunch`). The "renders one checklist row per step, excluding review-launch itself" test (line 54–60) asserts `rows.length).toBe(6)` — after removing one step from the fixture this must become `5`.

**Settings-section drift found beyond the task prompt's own hints (real drift, verified directly — NOT present in the older reference plan, which predates these files):**
- `frontend/src/app/settings/settings-shell.component.spec.ts` — test name `'rendersTheNavRailWithSixSectionsPlus...'` (line 28) and a hardcoded `expect(items.length).toBe(13)` (line 32, computed as `Object.keys(SECTION_PATHS).length + 7` = 6+7 today). Both must drop by one: rename to `Five`, and `13` → `12`.
- `frontend/src/app/settings/settings-overview.component.spec.ts` — test name `'rendersSixCardsWithTheirTranslatedLabelsAndLinks'` (line 49) and three hardcoded counts: `expect(cards.length).toBe(6)` (line 57), `expect(titles.length).toBe(6)` (line 61), `expect(links.length).toBe(6)` (line 62). All must become `Five` / `5`.
- `frontend/src/app/settings/settings-nav-rail.component.spec.ts` — confirmed NO hardcoded count (uses `Object.keys(SECTION_PATHS).length + 7` with no literal duplicate anywhere in this file) — no change needed here.

**i18n keys to remove** (confirmed identical key paths and line positions in both files):
- `en.json` / `hi.json`, `setup.steps.rootAssociates` (both at line 270).
- `en.json` / `hi.json`, the entire `setup.rootAssociates` block (lines 436–473 in both — `stepEyebrowLabel` through the nested `validation` object).
- `en.json` / `hi.json`, `settings.sections.rootAssociates` (both at line 581).
- `en.json` / `hi.json`, the entire `settings.cards.rootAssociates` block (lines 606–608 in both).

**`CompanyExceptionHandler.java`**: has two `@ExceptionHandler` methods that must be removed along with the exceptions they handle — `handleRootAssociateAlreadyExists` (`RootAssociateAlreadyExistsException` → 409) and `handleRightRootDetailsRequired` (`RightRootDetailsRequiredException` → 400). No test file (`CompanyExceptionHandlerTest.java`) exists for this class, so no test-side change needed there.

---

## Task 1: Delete backend Root Associate production code, its exception handlers, and the now-unused repository method

**Files:**
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateController.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateProvisioningService.java`
- Delete: `backend/src/main/java/com/plotchain/company/CreateRootAssociateRequest.java`
- Delete: `backend/src/main/java/com/plotchain/company/CreateRootAssociateResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateSlotsResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateSummaryResponse.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateCreationResult.java`
- Delete: `backend/src/main/java/com/plotchain/company/RootAssociateAlreadyExistsException.java`
- Delete: `backend/src/main/java/com/plotchain/company/RightRootDetailsRequiredException.java`
- Modify: `backend/src/main/java/com/plotchain/company/CompanyExceptionHandler.java`
- Modify: `backend/src/main/java/com/plotchain/associate/AssociateRepository.java:89`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new. This task only removes code; later tasks (2 and 3) fix every remaining caller.

- [ ] **Step 1: Delete the 9 backend production files**

```bash
git rm backend/src/main/java/com/plotchain/company/RootAssociateController.java
git rm backend/src/main/java/com/plotchain/company/RootAssociateProvisioningService.java
git rm backend/src/main/java/com/plotchain/company/CreateRootAssociateRequest.java
git rm backend/src/main/java/com/plotchain/company/CreateRootAssociateResponse.java
git rm backend/src/main/java/com/plotchain/company/RootAssociateSlotsResponse.java
git rm backend/src/main/java/com/plotchain/company/RootAssociateSummaryResponse.java
git rm backend/src/main/java/com/plotchain/company/RootAssociateCreationResult.java
git rm backend/src/main/java/com/plotchain/company/RootAssociateAlreadyExistsException.java
git rm backend/src/main/java/com/plotchain/company/RightRootDetailsRequiredException.java
```

- [ ] **Step 2: Remove the two Root Associate exception handlers from `CompanyExceptionHandler.java`**

Remove these two methods (and their now-dangling imports become unnecessary automatically — the class has no explicit imports of the deleted exception types beyond same-package references, so nothing else to touch):

```java
    @ExceptionHandler(RootAssociateAlreadyExistsException.class)
    public ResponseEntity<Map<String, String>> handleRootAssociateAlreadyExists(RootAssociateAlreadyExistsException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(RightRootDetailsRequiredException.class)
    public ResponseEntity<Map<String, String>> handleRightRootDetailsRequired(RightRootDetailsRequiredException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
```

Leaving `CompanyExceptionHandler.java` as:

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
}
```

- [ ] **Step 3: Remove the now-unused `AssociateRepository` method**

In `backend/src/main/java/com/plotchain/associate/AssociateRepository.java`, delete line 89:

```java
    List<Associate> findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(AssociateRole role);
```

This method has no remaining caller after Step 1 — its only production caller was `RootAssociateProvisioningService`, just deleted. (Its two test-file references are handled in Tasks 2 and 3.)

- [ ] **Step 4: Confirm the deleted-code compile boundary**

The project will NOT compile yet — `SetupStateService.java` still references `RootAssociateProvisioningService`, and `SecurityConfigTest.java`/`SetupStateServiceTest.java`/`RootAssociateControllerTest.java`/`RootAssociateProvisioningServiceTest.java` still reference deleted types. This is expected; Tasks 2 and 3 fix every remaining reference. Do not attempt to build/test after this task alone.

- [ ] **Step 5: Commit**

```bash
git add -A backend/src/main/java/com/plotchain/company backend/src/main/java/com/plotchain/associate/AssociateRepository.java
git commit -m "chore(company): delete Root Associate provisioning production code"
```

---

## Task 2: Remove the Root Associate wizard step from `SetupStateService`, update `SecurityConfig`, and delete the two Root Associate backend test files

**Files:**
- Modify: `backend/src/main/java/com/plotchain/company/SetupStateService.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`
- Modify: `backend/src/test/java/com/plotchain/company/SetupStateServiceTest.java`
- Delete: `backend/src/test/java/com/plotchain/company/RootAssociateControllerTest.java`
- Delete: `backend/src/test/java/com/plotchain/company/RootAssociateProvisioningServiceTest.java`

**Interfaces:**
- Consumes: Task 1's deletions (this task removes every remaining backend reference to the deleted types).
- Produces: `SetupStateService.STEP_DEFINITIONS` with 6 entries, `reviewLaunch` at step number 6. `SecurityConfig` with no `/api/company/root-associates` matcher. All backend tests compiling and green.

- [ ] **Step 1: Update `SetupStateService.java`'s constructor and `STEP_DEFINITIONS`**

Remove the `rootAssociates` step definition and renumber `reviewLaunch` from 7 to 6:

```java
    private static final List<StepDefinition> STEP_DEFINITIONS = List.of(
        new StepDefinition(1, "companyProfile", true),
        new StepDefinition(2, "branding", false),
        new StepDefinition(3, "compensation", true),
        new StepDefinition(4, "projects", false),
        new StepDefinition(5, "paymentsKyc", true),
        new StepDefinition(6, "reviewLaunch", false)
    );
```

Remove the `RootAssociateProvisioningService rootAssociateProvisioningService` field, its constructor parameter, and its constructor assignment:

```java
    private final SetupStateRepository setupStateRepository;
    private final CompanyProfileService companyProfileService;
    private final CompanyBrandingService companyBrandingService;
    private final CompensationPlanService compensationPlanService;
    private final PaymentConfigService paymentConfigService;
    private final PayoutBankAccountService payoutBankAccountService;
    private final ProjectService projectService;

    public SetupStateService(SetupStateRepository setupStateRepository,
                              CompanyProfileService companyProfileService,
                              CompanyBrandingService companyBrandingService,
                              CompensationPlanService compensationPlanService,
                              PaymentConfigService paymentConfigService,
                              PayoutBankAccountService payoutBankAccountService,
                              ProjectService projectService) {
        this.setupStateRepository = setupStateRepository;
        this.companyProfileService = companyProfileService;
        this.companyBrandingService = companyBrandingService;
        this.compensationPlanService = compensationPlanService;
        this.paymentConfigService = paymentConfigService;
        this.payoutBankAccountService = payoutBankAccountService;
        this.projectService = projectService;
    }
```

Remove the `"rootAssociates"` case from `isStepComplete`:

```java
    private boolean isStepComplete(String key) {
        return switch (key) {
            case "companyProfile" -> companyProfileService.isComplete();
            case "branding" -> companyBrandingService.isComplete();
            case "compensation" -> compensationPlanService.isComplete();
            case "paymentsKyc" -> paymentConfigService.isComplete() && payoutBankAccountService.isComplete();
            case "projects" -> projectService.isComplete();
            case "reviewLaunch" -> isLaunched();
            default -> false;
        };
    }
```

Also update the class-level comment on lines 15–16, which currently says "the master roadmap's 7-step wizard and its Step 7 canGoLive gate" — change to "6-step wizard and its Step 6 canGoLive gate":

```java
    // Order and required-ness match the master roadmap's 6-step wizard and its Step 6 "canGoLive"
    // gate (Company Profile + Compensation + Payments & KYC).
```

- [ ] **Step 2: Remove the `/api/company/root-associates` matcher from `SecurityConfig.java`**

Delete this block (lines 189–194):

```java
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects
                // above: Phase 11's Root Associates GET stays admin-family-only. The POST that
                // creates a root is a write and is already covered by the blanket POST rule
                // above -- deliberately no separate matcher for it.
                .requestMatchers(HttpMethod.GET, "/api/company/root-associates")
                    .hasAuthority("ADMIN")
```

Fix the now-dangling reference in the very next matcher's comment (currently reads "Same reasoning as setup-state/profile/branding/compensation/payments/projects/ root-associates above"). Change it to drop the trailing `root-associates` reference:

```java
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects
                // above: the audit-log GET stays admin-family-only. There is no
                // mutating endpoint for this resource at all (append-only, written internally by
                // SettingsAuditService) -- deliberately no write matcher.
                .requestMatchers(HttpMethod.GET, "/api/company/audit-log")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 3: Remove the two Root Associate tests from `SecurityConfigTest.java` and fix the two dangling comments that reference them**

Delete these two tests (lines 330–347):

```java
    @Test
    void rootAssociatesListIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    // associateRepository is @MockBean'd at the class level above (unstubbed here), and
    // Mockito's default answer returns an empty List rather than null for a List-returning
    // method, so findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc(...) resolves
    // to an empty list and this is a plain 200.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void rootAssociatesListIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
        mockMvc.perform(get("/api/company/root-associates")
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().isOk());
    }
```

Fix the comment on `associatesListIsReachableForAnyAdminFamilyToken` (currently references the just-deleted test by name):

```java
    // Same unstubbed-default-empty-list reasoning as brandingLogoIsReachableWithoutAToken and
    // brandingFaviconIsReachableWithoutAToken above: associateRepository is @MockBean'd
    // unstubbed, so findAllByOrderByUserIdAsc() resolves to an empty list and this is a plain
    // 200.
    @ParameterizedTest
    @EnumSource(value = AssociateRole.class, names = "ASSOCIATE", mode = EnumSource.Mode.EXCLUDE)
    void associatesListIsReachableForAnyAdminFamilyToken(AssociateRole role) throws Exception {
```

(Reason for the new anchor: `brandingLogoIsReachableWithoutAToken`/`brandingFaviconIsReachableWithoutAToken` are the nearest still-existing tests in the file that share the same "unstubbed default" reasoning pattern — both return 404 rather than erroring specifically because their backing mocks/repos are unstubbed defaults, the same shape of reasoning this comment is making. Any accurate, non-dangling wording is acceptable; this is the reasoning to preserve.)

Fix the comment on `auditLogIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate` (currently references the just-deleted test by name):

```java
    // settingsAuditLogRepository is not @MockBean'd in this class, so it runs for real against
    // the H2 test DB, which has no seeded rows -- an unstubbed-default-empty-result, hence
    // isOk() rather than a populated body for the admin-family case.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void auditLogIsReachableForEveryAdminFamilyTokenAndForbiddenForAssociate(AssociateRole role) throws Exception {
```

- [ ] **Step 4: Delete the two Root Associate backend test files**

```bash
git rm backend/src/test/java/com/plotchain/company/RootAssociateControllerTest.java
git rm backend/src/test/java/com/plotchain/company/RootAssociateProvisioningServiceTest.java
```

- [ ] **Step 5: Update `SetupStateServiceTest.java`**

Remove the `RootAssociateProvisioningService` construction argument and its `AssociateIdGenerator`/`AssociateRepository` wiring that exists solely to build it. Change:

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

to:

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
            new ProjectService(projectRepository, plotRepository, settingsAuditService));
```

`associateRepository` and `passwordEncoder` `@Mock` fields stay declared (still used elsewhere: `associateRepository` by `CompensationPlanService` and `SettingsAuditService`; leave `passwordEncoder` in place too even though it becomes otherwise-unused by this specific wiring — check whether removing it triggers an "unused field" style lint failure in this repo's build; if not, leave it declared since Mockito's `@ExtendWith(MockitoExtension.class)` does not fail on unused `@Mock` fields by default). Remove the now-unused `AssociateIdGenerator` import if it has no other use in the file (verify via a fresh grep in this file before deleting the import — it is used only in the deleted constructor call per the current read).

Remove the `associateRepository.findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc` stub from `setUp()`:

```java
        // "projects" is non-required and defaults to no projects existing, matching the other
        // non-required steps' default-incomplete stubbing above.
        lenient().when(projectRepository.findAll()).thenReturn(List.of());
    }
```

(i.e. delete the `"rootAssociates" is non-required...` comment and its `lenient().when(...)` block that followed it.)

Update `everyStepIsIncompleteUntilItsOwnPhaseLands` — `hasSize(7)` becomes `hasSize(6)`:

```java
        assertThat(response.steps()).hasSize(6);
```

Delete the two dedicated Root Associate step tests entirely — `rootAssociatesStepIsIncompleteWithNoRoots` and `rootAssociatesStepIsCompleteWithOneRoot` (the full test bodies, lines 400–436 in the current file, both of which assert on `s.key().equals("rootAssociates")` and the second of which stubs `findByRoleAndParentIdIsNullAndSponsorIdIsNullOrderByJoinedAtAsc`).

- [ ] **Step 6: Run the backend test suite for the touched classes**

```bash
cd backend && mvn test -Dtest=SetupStateServiceTest,SecurityConfigTest,CompanyExceptionHandlerTest -pl . 2>&1 | tail -60
```

Expected: all tests pass (or, per the known JDK21/25 Mockito environment issue documented in this user's memory, only the pre-existing unrelated spurious Mockito errors appear — verify any failure is one of those known spurious ones before treating it as a real regression).

- [ ] **Step 7: Full backend build**

```bash
cd backend && mvn test 2>&1 | tail -80
```

Expected: no compile errors anywhere in the module (confirms no other file still references a deleted type), and no new test failures beyond the known JDK/Mockito noise.

- [ ] **Step 8: Commit**

```bash
git add -A backend/src/main/java/com/plotchain/company/SetupStateService.java backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java backend/src/test/java/com/plotchain/company/SetupStateServiceTest.java
git commit -m "chore(company): drop the Root Associate wizard step and its security matcher"
```

---

## Task 3: Delete the frontend Root Associate step/service/model and every route, map, spec, and i18n reference

**Files:**
- Delete: `frontend/src/app/setup/steps/root-associates/root-associates-step.component.ts`
- Delete: `frontend/src/app/setup/steps/root-associates/root-associates-step.component.spec.ts`
- Delete: `frontend/src/app/setup/steps/root-associates/root-associates.service.ts`
- Delete: `frontend/src/app/setup/steps/root-associates/root-associates.service.spec.ts`
- Delete: `frontend/src/app/setup/models/root-associates.model.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`
- Modify: `frontend/src/app/setup/models/setup-state.model.ts`
- Modify: `frontend/src/app/settings/models/settings-section.model.ts`
- Modify: `frontend/src/app/settings/audit-log/audit-log.model.ts`
- Modify: `frontend/src/app/settings/audit-log/audit-log.service.spec.ts`
- Modify: `frontend/src/app/setup/steps/review-launch/review-launch-step.component.spec.ts`
- Modify: `frontend/src/app/settings/settings-shell.component.spec.ts`
- Modify: `frontend/src/app/settings/settings-overview.component.spec.ts`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: nothing from Tasks 1/2 (frontend and backend are decoupled at compile time; the frontend build does not depend on the backend module).
- Produces: a frontend build/test suite with zero references to Root Associate, `STEP_PATHS`/`SECTION_PATHS`/`AUDIT_LOG_SECTION_BACKEND_VALUES` each with 5 remaining entries where they previously had 6.

- [ ] **Step 1: Delete the Root Associate step directory and its model**

```bash
git rm -r frontend/src/app/setup/steps/root-associates
git rm frontend/src/app/setup/models/root-associates.model.ts
```

- [ ] **Step 2: Remove the Root Associate import and both route entries from `app.routes.ts`**

Delete the import (line 16):

```ts
import { RootAssociatesStepComponent } from './setup/steps/root-associates/root-associates-step.component';
```

Delete the setup-wizard child route (line 52):

```ts
      { path: 'root-associates', component: RootAssociatesStepComponent, data: { stepKey: 'rootAssociates' } },
```

Delete the settings child route (line 68):

```ts
      { path: 'root-associates', component: RootAssociatesStepComponent, data: { sectionKey: 'rootAssociates', mode: 'settings' } },
```

- [ ] **Step 3: Update `app.routes.spec.ts`**

Rename the test (currently "has all 7 wizard-step children plus the default redirect") and drop `'root-associates'` from the expected array:

```ts
    it('has all 6 wizard-step children plus the default redirect', () => {
      const childPaths = setupRoute!.children!.map(c => c.path);
      expect(childPaths).toEqual([
        'company-profile',
        'branding',
        'compensation',
        'projects',
        'payments-kyc',
        'review-launch',
        ''
      ]);
    });
```

- [ ] **Step 4: Remove the `rootAssociates` entry from `STEP_PATHS`**

In `frontend/src/app/setup/models/setup-state.model.ts`:

```ts
export const STEP_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc',
  reviewLaunch: 'review-launch'
};
```

- [ ] **Step 5: Remove the `rootAssociates` entry from `SECTION_PATHS`**

In `frontend/src/app/settings/models/settings-section.model.ts`:

```ts
export const SECTION_PATHS: Record<string, string> = {
  companyProfile: 'company-profile',
  branding: 'branding',
  compensation: 'compensation',
  projects: 'projects',
  paymentsKyc: 'payments-kyc'
  // auditLog deliberately absent: it isn't a wrapped step component and has its own route,
  // added directly in SettingsNavRailComponent's template rather than via this shared map.
};
```

- [ ] **Step 6: Remove the `rootAssociates` entry from `AUDIT_LOG_SECTION_BACKEND_VALUES` and fix its "6 sections" comment**

In `frontend/src/app/settings/audit-log/audit-log.model.ts`:

```ts
// The filter dropdown's option list: SECTION_PATHS's camelCase keys (the same 5 sections used
// elsewhere in Settings) plus an "all" option meaning "no section filter".
export const SECTION_FILTER_OPTIONS: string[] = ['all', ...Object.keys(SECTION_PATHS)];

// One-time lookup from the camelCase section keys used across the frontend (SECTION_PATHS) to
// the SCREAMING_SNAKE_CASE values the backend's `section` query param expects. Covers exactly
// the 5 real sections -- there's no backend value for "auditLog"/"all", those never get sent.
export const AUDIT_LOG_SECTION_BACKEND_VALUES: Record<string, string> = {
  companyProfile: 'COMPANY_PROFILE',
  branding: 'BRANDING',
  compensation: 'COMPENSATION',
  projects: 'PROJECTS',
  paymentsKyc: 'PAYMENTS_KYC'
};
```

- [ ] **Step 7: Update `audit-log.service.spec.ts`**

Rename the test (currently "maps every one of the 6 section keys to its expected backend value") and drop the `rootAssociates` entry:

```ts
  it('maps every one of the 5 section keys to its expected backend value', () => {
    const expected: Record<string, string> = {
      companyProfile: 'COMPANY_PROFILE',
      branding: 'BRANDING',
      compensation: 'COMPENSATION',
      projects: 'PROJECTS',
      paymentsKyc: 'PAYMENTS_KYC'
    };
```

- [ ] **Step 8: Update `review-launch-step.component.spec.ts`**

Remove the `rootAssociates` step from the `stateWith()` fixture and renumber `reviewLaunch` from 7 to 6:

```ts
  function stateWith(canGoLive: boolean): SetupStateResponse {
    return {
      steps: [
        step({ number: 1, key: 'companyProfile', required: true, complete: canGoLive }),
        step({ number: 2, key: 'branding', required: false, complete: false }),
        step({ number: 3, key: 'compensation', required: true, complete: canGoLive }),
        step({ number: 4, key: 'projects', required: false, complete: false }),
        step({ number: 5, key: 'paymentsKyc', required: true, complete: canGoLive }),
        step({ number: 6, key: 'reviewLaunch', required: false, complete: false })
      ],
      canGoLive,
      launchedAt: null
    };
  }
```

Update the row-count assertion (`rows.length).toBe(6)` → `toBe(5)`, since the fixture now has 6 steps total minus the excluded `reviewLaunch` row):

```ts
  it('renders one checklist row per step, excluding review-launch itself', async () => {
    await createAndFlush(stateWith(false));

    const rows = fixture.debugElement.queryAll(By.directive(ChecklistRowComponent));
    expect(rows.length).toBe(5);
    expect(rows.map(r => r.componentInstance.label)).not.toContain('reviewLaunch');
  });
```

Update the `previousPath` assertion — the step immediately before `reviewLaunch` is now `paymentsKyc`, whose route segment is `payments-kyc`:

```ts
  it('resolves previousPath to the step before review-launch', async () => {
    await createAndFlush(stateWith(false));
    expect(fixture.componentInstance.previousPath).toBe('payments-kyc');
  });
```

- [ ] **Step 9: Update `settings-shell.component.spec.ts`**

Rename the test and fix its hardcoded count (`SECTION_PATHS` now has 5 keys, so `5 + 7 = 12`):

```ts
  it('rendersTheNavRailWithFiveSectionsPlusAssociateDirectoryPlusTreeExplorerPlusKycQueuePlusAuditLogPlusAdminStatsPlusSalesRegisterPlusCycleManagement', () => {
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items.length).toBe(Object.keys(SECTION_PATHS).length + 7);
    expect(items.length).toBe(12);
  });
```

- [ ] **Step 10: Update `settings-overview.component.spec.ts`**

Rename the test and fix its three hardcoded counts (`SECTION_PATHS` now has 5 keys):

```ts
  it('rendersFiveCardsWithTheirTranslatedLabelsAndLinks', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/company/compensation').flush(samplePlan);
    fixture.detectChanges();

    const sectionKeys = Object.keys(SECTION_PATHS);
    const cards = fixture.nativeElement.querySelectorAll('.settings-overview__card');
    expect(cards.length).toBe(sectionKeys.length);
    expect(cards.length).toBe(5);

    const titles: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-title');
    const links: NodeListOf<HTMLAnchorElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-action');
    expect(titles.length).toBe(5);
    expect(links.length).toBe(5);
```

(The remainder of that test body — the `sectionKeys.forEach(...)` block — is unchanged; it already derives everything from `SECTION_PATHS` dynamically.)

- [ ] **Step 11: Remove the i18n keys from `en.json`**

Remove `setup.steps.rootAssociates`:

```json
      "paymentsKyc": "Payments & KYC",
      "reviewLaunch": "Review & Launch"
```

Remove the entire `setup.rootAssociates` block (currently sits between the `projects` block's closing `},` and the `paymentsKyc` block):

```json
    },
    "paymentsKyc": {
```

(i.e. delete everything from `"rootAssociates": {` through its matching closing `},` — the full block quoted in the "Verified current state" section above, `stepEyebrowLabel` through the nested `validation` object.)

Remove `settings.sections.rootAssociates`:

```json
      "paymentsKyc": "Payments & KYC",
      "associateDirectory": "Associate Directory",
```

Remove the entire `settings.cards.rootAssociates` block:

```json
      "paymentsKyc": {
        "actionLabel": "Edit"
      }
    },
    "compensationCard": {
```

- [ ] **Step 12: Remove the equivalent i18n keys from `hi.json`**

Apply the same four removals as Step 11, using `hi.json`'s Hindi values at the identical key paths (`setup.steps.rootAssociates`, the full `setup.rootAssociates` block, `settings.sections.rootAssociates`, the full `settings.cards.rootAssociates` block). Do not translate or otherwise alter any Hindi text while doing this — only remove the `rootAssociates`-keyed entries, exactly mirroring the English structure.

- [ ] **Step 13: Search for any remaining reference**

```bash
grep -rln -i "rootassociate\|root-associate\|ROOT_ASSOCIATES" frontend/src --include="*.ts" --include="*.html" --include="*.json"
```

Expected: no output (empty). If anything remains, it must be resolved before proceeding — do not leave a dangling reference.

- [ ] **Step 14: Run the frontend test suite**

```bash
cd frontend && npx ng test --watch=false 2>&1 | tail -100
```

Expected: all tests pass, including `app.routes.spec.ts`, `audit-log.service.spec.ts`, `review-launch-step.component.spec.ts`, `settings-shell.component.spec.ts`, `settings-overview.component.spec.ts`, `settings-nav-rail.component.spec.ts`.

- [ ] **Step 15: Run the frontend build**

```bash
cd frontend && npx ng build 2>&1 | tail -60
```

Expected: clean build, no missing-module errors from the deleted `root-associates` directory or model.

- [ ] **Step 16: Commit**

```bash
git add -A frontend/src
git commit -m "chore(setup): delete the Root Associate wizard step, route, and i18n copy"
```

---

## Self-review checklist (completed while writing this plan)

- **Spec coverage**: every bullet in the unit's "Acceptance criteria" is covered — Task 1 deletes all 9 listed backend classes (the actual list, verified against the repo, differs slightly from the spec prompt's guess: confirmed `RootAssociateSummaryResponse` and `RootAssociateCreationResult` both exist as described). Task 2 removes the route/matchers/tests and renumbers `SetupStateService`. Task 3 covers every listed frontend deletion, route removal, spec update, and i18n removal, plus the `STEP_PATHS`/`SECTION_PATHS`/`AUDIT_LOG_SECTION_BACKEND_VALUES` maps explicitly called out in the unit brief.
- **Placeholder scan**: no "TBD"/"handle appropriately"/unshown code — every step quotes exact before/after code or exact bash commands.
- **Type/name consistency**: `SetupStateService`'s constructor signature in Task 2 Step 1 matches the constructor call fixed in Task 2 Step 5; `STEP_PATHS`/`SECTION_PATHS`/`AUDIT_LOG_SECTION_BACKEND_VALUES` end states in Task 3 are internally consistent (5 keys each, no `rootAssociates`) and match what the updated specs assert.
- **Drift beyond the reference plan found and captured**: the `docs/superpowers/plans/2026-08-03-role-model-collapse.md` reference plan predates `settings-shell.component.spec.ts`'s and `settings-overview.component.spec.ts`'s hardcoded counts (`toBe(13)`, `toBe(6)` ×3) and their "Six"-named tests — these are real, verified drift this plan's Task 3 Steps 9–10 fix, matching the precedent unit 4 set for the analogous `adminTeam` case. Also found and fixed: two dangling comments in `SecurityConfigTest.java` that reference-by-name the two tests being deleted (Task 2 Step 3) — the same class of issue unit 4's code review caught for a different test in this same file.
