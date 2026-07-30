# Phase 10 — Step 6: Admin Team & Roles

Continuation of the setup/onboarding build. Phases 0–9 are confirmed implemented on `master` — `com.plotchain.company` (setup-state, company-profile, branding), `com.plotchain.compensation`, `com.plotchain.payments`, `com.plotchain.projects` all exist with real entities/controllers/services and passing tests, and the frontend has six real step components (`company-profile`, `branding`, `compensation`, `projects`, `payments-kyc`, `review-launch`) plus two placeholders (`admin-team`, `root-associates`) still wired to `SetupStepPlaceholderComponent` in `app.routes.ts:38-39`. Full roadmap: `docs/superpowers/plans/2026-07-30-setup-onboarding.md` (its "Phase 10" section). Spec: `setup-onboarding-spec.md` (Step 6, lines 104-118). Design: `ChatGPT Image Jul 29, 2026, 11_07_58 PM.png`.

## Context

`SetupStateService.STEP_DEFINITIONS` already lists step 6 as `("adminTeam", required: false)` (`backend/.../company/SetupStateService.java:25`), and `isStepComplete` falls through to `default -> false` for it (line 99) — so the progress rail and Review & Launch already know this step exists and is optional, they just can't tell if it's done. The role enum (`AssociateRole`: `ADMIN, ASSOCIATE, SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT`, with `isAdminFamily()`) landed in Phase 1 specifically for this step, but **no endpoint can create an account with any of the four new roles today** — `AssociateProvisioningService.create()` (`associate/AssociateProvisioningService.java:64`) hardcodes `AssociateRole.ASSOCIATE`, and that service's request/response shape (sponsor/parent/position, rank assignment) is associate-tree-specific and wrong for staff accounts anyway.

Outcome: from `/setup/admin-team` (or `/settings/admin-team` post-launch) the founding admin can see existing staff accounts, create a new one (User ID with live uniqueness check, full name, role, temporary password with a Generate button), and see a read-only Permissions Preview. `GET /api/company/setup-state` reports step 6 complete once at least one non-founding admin-family account exists, matching the spec's own framing ("optional... but strongly prompted").

## Decisions (made now — do not re-litigate)

1. **New classes live in `com.plotchain.company`**, not a new top-level package. Unlike compensation/payments/projects, this step introduces no new table — it's a different creation path over the existing `Associate` entity — so it stays alongside `SetupStateService`, `CompanyProfileService`, etc. per that package's existing role as "core company/setup config, no dedicated schema of its own."
2. **No new migration.** `Associate` already has every column Phase 10 needs (`userId`, `role`, `rankId` nullable, `kycStatus`, `mustChangePassword`, `lastActiveAt` nullable) — confirmed by reading `associate/Associate.java` in full. Reuse the entity as-is.
3. **Reuse the temporary-password generator, don't duplicate it.** `AssociateProvisioningService.generateTemporaryPassword()` (`associate/AssociateProvisioningService.java:102-106`) is `private static` and the plan (master doc, Phase 10 bullet) explicitly says reuse it. Extract it to a new small class `associate/TemporaryPasswordGenerator.java` (public, static `generate()` method, same `SecureRandom` + 12-byte + Base64-URL-no-padding implementation moved verbatim) and have `AssociateProvisioningService` call it too. This is the one pre-existing-file touch outside `company`/frontend.
4. **New service class**: `company/AdminProvisioningService.java` — `create(CreateAdminRequest)`, `list()`, `isUserIdAvailable(String)`, `isComplete()`. Deliberately separate from `AssociateProvisioningService` (different role set, different defaults, no sponsor/parent/rank logic, no email requirement) rather than overloading one service with two unrelated creation flows.
   - `create()`: rejects `ASSOCIATE` and `ADMIN` as target roles (`InvalidAdminRoleException` → 400) — the spec's own Role select only lists **Finance, KYC Reviewer, Support, Super-Admin** (spec line 113); plain `ADMIN` is reserved for `AdminBootstrapRunner`'s founding account and is never created through this UI. Rejects a duplicate `userId` (`UserIdAlreadyRegisteredException` → 409, mirrors `EmailAlreadyRegisteredException`). Sets `rankId = null`, `kycStatus = VERIFIED`, `mustChangePassword = true` — identical to `AdminBootstrapRunner`'s own field-setting, confirming these are the established defaults for a non-associate account, not an invention. If `temporaryPassword` is blank, generates one via `TemporaryPasswordGenerator` and returns it **once** in the response (never persisted in plaintext, never re-returned by any `GET` — same one-time-secret convention as `CreateAssociateResponse`).
   - `isComplete()`: `associateRepository.findAll()` count of rows where `role.isAdminFamily()` is `> 1` (i.e., more than just the founding admin). Low-row-count `findAll()` + stream filter matches the precedent already used by `CompanyProfileService`/`SetupStateService` rather than adding a native count query.
   - `list()` / availability check use the existing `AssociateRepository.findByUserId`/`existsByUserId` — no new repository query needed for those two. `list()` needs a way to select only admin-family rows for the table; add `AssociateRepository.findByRoleNot(AssociateRole role)` (one new derived-query method) and call it with `ASSOCIATE`.
5. **Wire `lastActiveAt` on login**, in `AuthService.login` (`auth/AuthService.java:32-48`) — grep confirms this column is declared and read (two native queries in `AssociateRepository`) but **never written anywhere**, so the admin table's "Last Login" column would otherwise show blank for every account forever. One-line addition after the password check succeeds: `associate.setLastActiveAt(Instant.now()); associateRepository.save(associate);`. In scope here (not a separate follow-up) because Phase 10 is the first feature that surfaces this field to a user, and leaving it permanently null would make a real, mockup-specified column silently useless.
6. **No `status`/active column exists anywhere on `Associate`**, and there is no deactivation feature anywhere in the codebase (confirmed by search). Rather than inventing a column and a deactivate/reactivate flow the spec never asks for (spec line 116: *"an account is either created (active) or doesn't exist yet"* — no pending/disabled state is described), the list response omits a status field entirely and the frontend renders a static translated "Active" label for every row. Flagged explicitly as a spec-interpretation, following the master roadmap's own "flag gaps, don't silently invent" convention — a deactivate/suspend flow is a named follow-up, not assumed here.
7. **Permission matrix is a static, hardcoded map**, `company/AdminRolePermissions.java` — a `Map<AssociateRole, List<String>>`-shaped constant (or a small record list) covering the four assignable roles, each with a fixed list of permission-label strings (e.g. Finance: "View payouts", "Approve withdrawals", "Export reports"; KYC Reviewer: "Review KYC submissions", "Approve/reject documents"; Support: "View associate profiles", "View tickets"; Super-Admin: "Full access to all settings and data"). Exposed read-only via `GET /api/company/admins/role-permissions`. The class-level comment states explicitly that this is documentation only — no `@PreAuthorize`/`SecurityConfig` narrowing reads from it yet — matching the master roadmap's "seam for a later follow-up" framing (`SecurityConfig.java:55-63`'s own comment already names this exact matrix as the future enforcement point).
8. **Endpoints and `SecurityConfig` placement**:
   - `POST /api/company/admins` — restricted to **`ADMIN`, `SUPER_ADMIN` only** (not the full admin-family set), because letting a Support or KYC Reviewer account create new staff accounts (including other Super-Admins) is a materially different risk than the read-only GETs every other phase has added. This needs its **own matcher placed above the blanket `POST /api/**` rule** (`SecurityConfig.java:64-65`) — the first specific-narrower-than-blanket write matcher in this codebase; every prior phase's new endpoints were GETs or already covered by the blanket rule.
   - `GET /api/company/admins`, `GET /api/company/admins/user-id-available`, `GET /api/company/admins/role-permissions` — same admin-family-only pattern as every other Phase 3-9 `GET /api/company/*` matcher, placed in the existing GET block (`SecurityConfig.java:78-113`).
   - `SecurityConfigTest` gains: one case asserting `ASSOCIATE`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` tokens all get 403 on the `POST`, one asserting `ADMIN`/`SUPER_ADMIN` tokens succeed, and the standard admin-family-reachable/associate-403 pair for each new GET.
9. **Frontend naming avoids the existing `admin.*` collision.** `frontend/src/app/admin/` already has an `AdminService` and `admin.*` i18n keys for the unrelated "provision a new associate" screen (`create-associate.component.ts`). The new step's service is `AdminTeamService` (file `admin-team.service.ts`) under `setup/steps/admin-team/`, and its i18n keys live under `setup.adminTeam.*` (the `setup.steps.adminTeam` label already exists at `en.json`/`hi.json` — that's just the rail label, not this namespace).
10. **UI components reused, none new needed**: `SidePanelComponent` for "Add New Admin" (projected-content body, parent owns `open` state), plain `<select>` for Role (spec calls it "select", not a toggle — `ToggleGroupComponent` stays reserved for binary/few-option toggles as used elsewhere), `ChecklistRowComponent` for the Permissions Preview rows, `FieldErrorComponent` for server validation errors. The admin table itself is a plain read-only `<table>` in the step component's own template — `EditableTableComponent` is inline-cell-editable and add/remove-row shaped (built for royalty/reward-tier config), not a fit for a read-only list whose only "add" action is the side panel.

## Constraints carried forward (still true, unchanged)

- `ddl-auto: validate` — not touched this phase (no migration).
- No `@ManyToOne`; raw `UUID` fields only (not applicable — no new entity).
- Mock **interfaces only** in service tests; real Spring context + `@MockBean` repository in controller tests (`CompanyProfileControllerTest`/`AssociateProvisioningServiceTest` are the templates).
- `SecurityConfig` is first-match-wins; every new matcher goes above whatever blanket rule would otherwise swallow it, with an explanatory comment, and `SecurityConfigTest` gains a case per endpoint.
- Zero hardcoded strings; `setup.adminTeam.*` keys land in `en.json` and `hi.json` in the same commit as the component that uses them.
- Conventional Commits, footer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Task 10.1 — Shared password generator + `lastActiveAt` wiring + repository query

**Create** `backend/src/main/java/com/plotchain/associate/TemporaryPasswordGenerator.java` — `public final class` with a `private static final SecureRandom RANDOM` and `public static String generate()`, body moved verbatim from `AssociateProvisioningService.generateTemporaryPassword()`.

**Modify** `associate/AssociateProvisioningService.java` — delete the private `generateTemporaryPassword()` method and its `SecureRandom RANDOM` field/import; replace its one call site with `TemporaryPasswordGenerator.generate()`.

**Modify** `associate/AssociateRepository.java` — add `List<Associate> findByRoleNot(AssociateRole role);`.

**Modify** `auth/AuthService.java` — in `login()`, after the password check succeeds and before the setup-mode gate, add `associate.setLastActiveAt(Instant.now()); associateRepository.save(associate);` (new `java.time.Instant` import).

**Tests**:
- `AssociateProvisioningServiceTest` — no behavior change expected; re-run to confirm the extraction didn't alter output shape.
- New `TemporaryPasswordGeneratorTest` — asserts non-null, non-empty, and two calls differ.
- `AuthServiceTest` — extend the successful-login case to assert `associateRepository.save` is called with `lastActiveAt` set (capture via `ArgumentCaptor<Associate>`).

Commit: `refactor(associate): extract shared temporary-password generator, wire lastActiveAt on login`

---

## Task 10.2 — DTOs, `AdminRolePermissions`, `AdminProvisioningService`

**Create**, package `com.plotchain.company`:
- `CreateAdminRequest(@NotBlank String userId, @NotBlank String fullName, @NotBlank String role, String temporaryPassword)`.
- `CreateAdminResponse(UUID id, String userId, String role, String temporaryPassword)` — doc comment stating the "returned once" contract, mirroring `CreateAssociateResponse`.
- `AdminSummaryResponse(UUID id, String userId, String fullName, String role, Instant lastActiveAt)` — one per row in the list; no status field (decision 6).
- `UserIdAvailabilityResponse(boolean available)`.
- `AdminRolePermissions.java` — a `public final class` holding a static `Map<String, List<String>>` (keyed by role name) and a `public static Map<String, List<String>> all()` accessor, plus the class-comment noting this is documentation only (decision 7).
- `InvalidAdminRoleException.java` (unchecked — target role is `ASSOCIATE` or `ADMIN`).
- `UserIdAlreadyRegisteredException.java` (unchecked).
- `AdminProvisioningService.java` — constructor `(AssociateRepository, PasswordEncoder)`; methods `create(CreateAdminRequest): CreateAdminResponse`, `list(): List<AdminSummaryResponse>`, `isUserIdAvailable(String): boolean`, `isComplete(): boolean` (decision 4). Uses `TemporaryPasswordGenerator` from Task 10.1.

**Modify** `company/CompanyExceptionHandler.java` — add `@ExceptionHandler` cases for `InvalidAdminRoleException` → 400 and `UserIdAlreadyRegisteredException` → 409, same `Map.of("error", ex.getMessage())` shape as the existing two handlers.

**Tests**: `AdminProvisioningServiceTest` (`@ExtendWith(MockitoExtension.class)`, `@Mock AssociateRepository`, `@Mock PasswordEncoder` — mirrors `AssociateProvisioningServiceTest`) — covers: create with explicit temp password persists correctly (`ArgumentCaptor<Associate>` asserting `role`, `rankId == null`, `kycStatus == VERIFIED`, `mustChangePassword == true`); create with blank temp password generates and returns one; rejects `ASSOCIATE`/`ADMIN` role; rejects duplicate `userId`; `isComplete()` true/false at 1 vs 2+ admin-family rows; `list()` excludes `ASSOCIATE` rows; `isUserIdAvailable` true/false. `AdminRolePermissionsTest` — asserts all four assignable roles have a non-empty entry and `ASSOCIATE`/`ADMIN` are absent.

Commit: `feat(company): add AdminProvisioningService and role permission matrix`

---

## Task 10.3 — `AdminController`, `SecurityConfig`, `SetupStateService` wiring

**Create** `company/AdminController.java`, `@RequestMapping("/api/company/admins")`:
- `POST ""` → `create()`.
- `GET ""` → `list()`.
- `GET "/user-id-available"` (`@RequestParam String userId`) → `UserIdAvailabilityResponse`.
- `GET "/role-permissions"` → `AdminRolePermissions.all()`.

**Modify** `auth/SecurityConfig.java`:
- Add, **above** the blanket `POST /api/**` rule (before line 64), a new matcher (with a comment explaining why it's narrower than the blanket rule — decision 8):
  ```java
  .requestMatchers(HttpMethod.POST, "/api/company/admins")
      .hasAnyAuthority("ADMIN", "SUPER_ADMIN")
  ```
- Add, in the existing `GET /api/company/*` admin-family block, one more matcher:
  ```java
  .requestMatchers(HttpMethod.GET,
          "/api/company/admins", "/api/company/admins/user-id-available",
          "/api/company/admins/role-permissions")
      .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
  ```

**Modify** `company/SetupStateService.java` — inject `AdminProvisioningService`, replace the `"adminTeam"` fallthrough (currently hitting `default -> false`, line 99) with `case "adminTeam" -> adminProvisioningService.isComplete();`.

**Tests**:
- `AdminControllerTest` (`@SpringBootTest` + `@AutoConfigureMockMvc` + `@ActiveProfiles("test")` + `@MockBean AssociateRepository`, real `JwtService`-minted tokens — mirrors `CompanyProfileControllerTest`): 201 + one-time password on create; 400 on blank fields; 400 on `role: "ASSOCIATE"`; 409 on duplicate `userId`; 200 list; 200 availability check both branches; 200 role-permissions.
- `SecurityConfigTest` — new cases per decision 8's bullet list: `ADMIN`/`SUPER_ADMIN` tokens succeed on the POST, `FINANCE`/`KYC_REVIEWER`/`SUPPORT`/`ASSOCIATE` tokens 403 on the POST, admin-family-reachable/associate-403 pair for the three GETs.
- `SetupStateServiceTest` — extend: 1 admin-family row → `adminTeam` incomplete; 2+ → complete; confirm it stays outside `canGoLive` (still optional, per `STEP_DEFINITIONS`'s `required: false`).

Commit: `feat(company): add AdminController, wire into SecurityConfig and SetupStateService`

---

## Task 10.4 — Frontend models and `AdminTeamService`

**Create** `frontend/src/app/setup/models/admin-team.model.ts` — `CreateAdminRequest`/`CreateAdminResponse`/`AdminSummary`/`UserIdAvailability` interfaces, camelCase, field-for-field with the backend records; a `ROLE_OPTIONS` const array (`{value:'SUPER_ADMIN'|...,labelKey:string}`) for the Role `<select>`, matching the four spec-listed roles only.

**Create** `frontend/src/app/setup/steps/admin-team/admin-team.service.ts` (`providedIn: 'root'`, class `AdminTeamService`) — `createAdmin(request)`, `listAdmins()`, `checkUserIdAvailable(userId)`, `getRolePermissions()`. Mirrors `PaymentsKycService`'s thin-wrapper shape.

**Tests**: `admin-team.service.spec.ts` — `HttpClientTestingModule`, one `expectOne(...).flush(...)` per method.

Commit: `feat(frontend): add AdminTeamService and models`

---

## Task 10.5 — `AdminTeamStepComponent`

**Create** `frontend/src/app/setup/steps/admin-team/admin-team-step.component.ts` (+ `.spec.ts`), standalone, `imports: [CommonModule, ReactiveFormsModule, TranslateModule, FieldErrorComponent, SidePanelComponent, ChecklistRowComponent]`.

- On init: `listAdmins()` populates a plain read-only `<table>` (User ID, Full Name, Role, Last Login — `| date` pipe, blank-safe for a never-logged-in account per decision 5's timing, "Active" hardcoded label per decision 6) plus an "Add New Admin" button opening `<app-side-panel>`.
- Side panel body: reactive form — User ID (`(input)` debounced 400ms call to `checkUserIdAvailable`, inline available/taken indicator, same debounce pattern as other steps' autosave but gating submit instead of saving), Full Name, Role `<select>` bound to `ROLE_OPTIONS`, Temporary Password (masked text input) with a "Generate" button that fills it client-side-random-preview only (the real one-time value returned by the server on submit is what's actually persisted — the button is a convenience prefill, not itself a save), and a `ChecklistRowComponent` list rendering `getRolePermissions()` for the currently-selected role.
- On submit: `createAdmin()`; on success, show the returned `temporaryPassword` once in a copy-friendly banner (same "shown once, copy it now" pattern as `admin.temporaryPasswordNotice` in the existing provisioning screen, reused as a UX pattern not a shared component), close the panel, refresh the list, and re-fetch `setup-state` so the rail/step-6 badge updates.
- Server field errors (duplicate `userId`, invalid role) surface via `FieldErrorComponent`/`toFieldErrors()`, same convention as every other step.

**Modify** `frontend/src/app/app.routes.ts` — swap the `admin-team` child route's `component:` from `SetupStepPlaceholderComponent` to `AdminTeamStepComponent` (import added), keep `data: { stepKey: 'adminTeam' }` unchanged.

**Tests**: `admin-team-step.component.spec.ts` — `HttpClientTestingModule` + `TranslateModule.forRoot()`, flushes the initial `listAdmins`/`getRolePermissions` GETs, asserts: availability check fires debounced on User ID input, create POST fires on submit with the right body, one-time password banner renders and the panel closes on success, duplicate-`userId` 409 surfaces as a field error, role-select excludes `ASSOCIATE`/`ADMIN`, and the step-nav wiring (`previousPath: 'payments-kyc'`, `nextPath: 'root-associates'`).

Commit: `feat(setup): add AdminTeamStepComponent`

---

## Task 10.6 — i18n

**Modify** `frontend/src/assets/i18n/en.json` and `hi.json` — add a `setup.adminTeam` block in the same commit (distinct from the pre-existing top-level `admin.*` namespace — decision 9): `addAdminButtonLabel`, `tableUserIdHeader`/`tableFullNameHeader`/`tableRoleHeader`/`tableLastLoginHeader`/`tableStatusHeader`, `activeStatusLabel`, `panelTitle`, `userIdLabel`, `userIdAvailableHint`/`userIdTakenHint`, `fullNameLabel`, `roleLabel` + one label per role option, `temporaryPasswordLabel`, `generatePasswordButtonLabel`, `permissionsPreviewTitle`, `createAdminButtonLabel`, `temporaryPasswordShownOnceNotice`, and a `validation` sub-object (`required`, `userIdTaken`, `invalidRole`, `genericSaveError`) matching every other step's shape.

**Tests**: none automated (no i18n key-parity spec exists in this repo — confirmed by every prior phase); hand-verify identical key sets between the two files.

Commit: `feat(i18n): add setup.adminTeam translations`

---

## Verification

**Automated** (same commands as every phase):
```bash
mvn -f backend/pom.xml test
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

**Manual walkthrough** (Phase-10-specific slice of the master roadmap's end-to-end script):
1. Log in as the founding admin, navigate to `/setup/admin-team` (progress rail step 6, marked optional).
2. Click "Add New Admin". Type a `userId` that already exists (e.g. `admin`) — confirm the inline "taken" indicator. Change it to something new — confirm "available".
3. Fill Full Name, select Role = Finance — confirm the Permissions Preview updates to Finance's permission list.
4. Click Generate on Temporary Password — confirm a value fills in. Click Create Admin — confirm the one-time password banner appears, the panel closes, and the new row appears in the table with role "Finance" and a blank Last Login.
5. Log out, log in as the new account's `userId` with the shown temporary password — confirm the forced password-change screen (mustChangePassword), then confirm after changing it and re-logging-in the admin table's Last Login column is now populated for that row.
6. Back as the founding admin, confirm the progress rail now shows step 6 complete (2 admin-family accounts exist), and that Review & Launch's checklist reflects it without affecting `canGoLive` (still optional).
7. Attempt (via a second browser/token, or directly against the API) a `POST /api/company/admins` as a `FINANCE` or `SUPPORT` token — confirm 403. Confirm the same token can still reach `GET /api/company/admins` (200).
8. Attempt to create a role of `ASSOCIATE` or `ADMIN` via the API directly — confirm 400.
9. Reload the page — the admin list and permission matrix repopulate from their GETs.
