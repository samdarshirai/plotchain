# Admin Impersonation ("Login as Associate") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin clicks **Login** on a row in `/settings/associate-directory`, sees the app exactly as that associate (reads and writes), and each login is recorded in the audit table.

**Architecture:** New admin-only endpoint `POST /api/admin/associates/{id}/impersonate` returns a normal `LoginResponse` whose JWT is the associate's (role `ASSOCIATE`, 30-minute expiry, extra claim `impersonatedBy`=admin id) and writes one `settings_audit_log` row (section `IMPERSONATION`). Frontend stashes the admin's token, installs the associate's, and shows a sticky "Viewing as … — Exit" banner; Exit restores the admin token.

**Tech Stack:** Spring Boot + jjwt + Flyway (backend); Angular standalone components + ngx-translate (frontend).

**Spec:** Approved in chat 2026-10-17 (no spec file). Decisions: all admin roles may use it (only role today is `ADMIN`); every write while impersonating is attributed to the associate; only the login is audited.

## Global Constraints

- Impersonation token expiry: 30 minutes. Claim name: `impersonatedBy` (string UUID of the admin).
- Audit: `settingsAuditService.record("IMPERSONATION", "Logged in as <userId>", Map.of("associateId", <id>), adminId)`.
- Target must have `role == ASSOCIATE`; suspended target → `AssociateSuspendedException`; `!setupStateService.isLaunched()` → `PlatformNotLiveException` (same as normal login).
- Impersonation `LoginResponse.mustChangePassword` is always `false` (otherwise the admin would be forced into the change-password screen and could overwrite the associate's password). `lastActiveAt` is NOT touched.
- Every new UI string goes in both `frontend/src/assets/i18n/en.json` and `hi.json`. New UI must pass the phone-width (≤400px) check (see memory: mobile-friendly rule).
- Migration number: next is `V63`. Follow V53's pattern (drop + re-add `chk_settings_audit_log_section` with the full existing list plus the new value).

## Review Focus

1. Admin targets another admin id → rejected (409), no audit row.
2. Suspended associate → 403, no audit row, no token.
3. Associate (non-admin) token calls the endpoint → 403.
4. Exit banner after the impersonation token expires: interceptor 401 → `logout()` must also clear the stashed admin token (no stale "Exit" restoring a dead state).
5. `logout()` while impersonating must clear impersonation keys so the next login on the same browser doesn't show the banner.

---

### Task 1: Migration + JWT impersonation token

**Files:**
- Create: `backend/src/main/resources/db/migration/V63__settings_audit_log_impersonation_section.sql`
- Modify: `backend/src/main/java/com/plotchain/auth/JwtService.java`
- Test: `backend/src/test/java/com/plotchain/auth/JwtServiceTest.java`

**Interfaces:**
- Produces: `String JwtService.generateImpersonationToken(Associate target, UUID adminId)` — subject = target id, claim `role` = target role, claim `impersonatedBy` = `adminId.toString()`, expiry = now + 30 min (constant `IMPERSONATION_MINUTES = 30`, independent of `jwt.expiration-minutes`). Existing `authenticate(token)` keeps working unchanged (returns the associate id + role).

- [ ] **Step 1: Write failing test** `generateImpersonationToken_carriesImpersonatedByClaimAndThirtyMinuteExpiry` in `JwtServiceTest`: build token, assert `extractAssociateId` = target id, `extractRole` = `ASSOCIATE`, `authenticate(token)` present; decode payload and assert `impersonatedBy` = admin id and `exp - iat == 1800`.
- [ ] **Step 2:** Run `cd backend && mvn -q test -Dtest=JwtServiceTest` — expect FAIL (method missing).
- [ ] **Step 3:** Implement `generateImpersonationToken` in `JwtService` (mirror `generateToken`, add claim, fixed expiry). Write V63 extending the CHECK allow-list with `'IMPERSONATION'` (copy V53's list + new value, with a header comment like V53's explaining why).
- [ ] **Step 4:** Re-run the test — expect PASS.
- [ ] **Step 5:** Commit `feat(auth): impersonation JWT + IMPERSONATION audit section`.

### Task 2: AuthService.impersonate

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/AuthService.java` (add `SettingsAuditService` constructor dependency)
- Create: `backend/src/main/java/com/plotchain/auth/ImpersonationNotAllowedException.java`
- Modify: `backend/src/main/java/com/plotchain/auth/AuthExceptionHandler.java` (map new exception → 409 `{"error": ex.getMessage()}`)
- Test: `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java`

**Interfaces:**
- Consumes: `JwtService.generateImpersonationToken(Associate, UUID)` (Task 1); `SettingsAuditService.record(String, String, Object, UUID)`.
- Produces: `LoginResponse AuthService.impersonate(UUID targetId, UUID adminId)` — annotated `@Transactional`; throws `AssociateNotFoundException(targetId)` if missing, `ImpersonationNotAllowedException` if target role ≠ `ASSOCIATE`, `AssociateSuspendedException`, `PlatformNotLiveException` (check order: not found, role, suspended, launched). Returns `new LoginResponse(token, target.getId(), "ASSOCIATE", false)`.

- [ ] **Step 1: Write failing tests** in `AuthServiceTest` (update its constructor wiring for the new mock):
  - `impersonate_validAssociate_returnsTokenAndRecordsAudit` — verify `record("IMPERSONATION", "Logged in as <userId>", Map.of("associateId", id.toString()), adminId)` called once; response `mustChangePassword` false; `lastActiveAt` not changed / `associateRepository.save` never called.
  - `impersonate_adminTarget_throwsAndNoAudit`, `impersonate_suspended_throwsAndNoAudit`, `impersonate_platformNotLive_throwsAndNoAudit`, `impersonate_unknownId_throwsNotFound`.
- [ ] **Step 2:** Run `mvn -q test -Dtest=AuthServiceTest` — expect FAIL.
- [ ] **Step 3:** Implement per the Interfaces block; exception message: "Only associate accounts can be impersonated".
- [ ] **Step 4:** Re-run — expect PASS.
- [ ] **Step 5:** Commit `feat(auth): AuthService.impersonate with audit`.

### Task 3: Endpoint

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AdminAssociateController.java`
- Test: `backend/src/test/java/com/plotchain/associate/AdminAssociateControllerTest.java`, `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `AuthService.impersonate(UUID, UUID)` (Task 2).
- Produces: `POST /api/admin/associates/{id}/impersonate` → 200 `LoginResponse`. `@PreAuthorize("hasAuthority('ADMIN')")`, `@AuthenticationPrincipal UUID actorId` — same style as `suspend`. The blanket `POST /api/**` → `ADMIN` rule in `SecurityConfig` already covers the baseline; no new matcher needed.

- [ ] **Step 1: Write failing tests:** controller test — admin gets 200 with body from a mocked `AuthService`; a 409 from `ImpersonationNotAllowedException`; SecurityConfigTest — `ASSOCIATE` token → 403, unauthenticated → 401 for this path.
- [ ] **Step 2:** Run those tests — expect FAIL (404).
- [ ] **Step 3:** Inject `AuthService` into `AdminAssociateController`; add the method delegating to `authService.impersonate(id, actorId)`.
- [ ] **Step 4:** Re-run — expect PASS.
- [ ] **Step 5:** Commit `feat(admin): POST /api/admin/associates/{id}/impersonate`.

### Task 4: Expose `role` on directory rows

The Login button must be hidden for admin rows, and the summary has no role.

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/AdminAssociateSummaryResponse.java` (append `AssociateRole role` as the last component), `AdminAssociateService.toSummary` (pass `a.getRole()`), and every other `new AdminAssociateSummaryResponse(` call site (grep).
- Modify: `frontend/src/app/admin/models/admin-associate-summary.model.ts` (add `role: 'ADMIN' | 'ASSOCIATE'`); fix frontend spec fixtures that build this type.
- Test: `AdminAssociateServiceTest` (assert `role` present in list result).

- [ ] **Step 1:** Add assertion that a listed ADMIN row has `role()==ADMIN` and an associate row `ASSOCIATE`; run `mvn -q test -Dtest=AdminAssociateServiceTest` — expect FAIL (compile).
- [ ] **Step 2:** Implement; run backend tests for the `associate` package and `cd frontend && npx tsc --noEmit -p tsconfig.app.json` — expect PASS.
- [ ] **Step 3:** Commit `feat(admin): include role in associate directory summary`.

### Task 5: Frontend AuthService + interceptor

**Files:**
- Modify: `frontend/src/app/auth/auth.service.ts`
- Test: `frontend/src/app/auth/auth.service.spec.ts`

**Interfaces:**
- Produces on `AuthService`:
  - `impersonate(associateId: string, displayName: string): Observable<LoginResponse>` — POST `/api/admin/associates/${associateId}/impersonate`; on success, if not already impersonating stash current `TOKEN_KEY`/`ROLE_KEY`/`MUST_CHANGE_KEY` into `plotchain.auth.admin.token|role|mustChange`, then write the response token/role/mustChange as in `login`, and set `plotchain.auth.impersonating` = `displayName`.
  - `isImpersonating(): boolean`, `getImpersonatedName(): string | null`.
  - `exitImpersonation(): void` — restore the three stashed values, remove the stash and `impersonating` keys.
  - `logout()` additionally removes the four impersonation keys (Review Focus 4 and 5; the interceptor already calls `logout()` on 401, so no interceptor change is needed).
- Consumes: Task 3 endpoint.

- [ ] **Step 1: Write failing specs:** `impersonate` swaps token and stashes admin's; `isImpersonating` true + name; `exitImpersonation` restores admin token/role and clears flags; `logout` while impersonating clears everything; second `impersonate` call while already impersonating does not overwrite the stash.
- [ ] **Step 2:** Run `cd frontend && npx ng test --include='**/auth.service.spec.ts' --watch=false` — expect FAIL.
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** Re-run — expect PASS.
- [ ] **Step 5:** Commit `feat(auth): frontend impersonation state + exit`.

### Task 6: Login column in the directory

**Files:**
- Modify: `frontend/src/app/admin/associate-directory/associate-directory.component.ts`, `.spec.ts`; `frontend/src/styles/_admin.scss` (button style, prefix `associate-directory__login`)
- Modify: `frontend/src/assets/i18n/en.json`, `hi.json` (`admin.associateDirectory.columnLogin`, `loginAction`, `loginError`)

**Interfaces:**
- Consumes: `AuthService.impersonate(id, name)` (Task 5); `AdminAssociateSummary.role/status` (Task 4); `EditableTableComponent` already supports a column `{ type: 'action' }` plus its `actionTemplate` input — use it rather than a new table feature (read how `actionTemplate` is declared on the table, and pass an `ng-template` from this component).
- Behavior: new last column `{ key: 'login', label: columnLogin, type: 'action' }`. The template renders a `<button type="button" class="associate-directory__login">` only when the row's associate has `role === 'ASSOCIATE'` and `status !== 'SUSPENDED'`; the click handler calls `$event.stopPropagation()` (row click opens the side panel) then `impersonate(...)`, and on success navigates to `/dashboard`; on error sets a `loginError` flag shown like the existing `actionError` paragraph. Map the template row back to `page.associates[index]` via the template's `index` context var.

- [ ] **Step 1: Write failing specs:** button rendered for ACTIVE associate, absent for ADMIN row and SUSPENDED row; click calls `authService.impersonate` with that row's id and name and navigates to `/dashboard`, and does NOT open the side panel; error shows the error paragraph.
- [ ] **Step 2:** Run `npx ng test --include='**/associate-directory.component.spec.ts' --watch=false` — expect FAIL.
- [ ] **Step 3:** Implement; add i18n keys in both languages; style button as a compact secondary button, tap target ≥ 40px at phone width (table cells use `data-label` stacking already).
- [ ] **Step 4:** Re-run — expect PASS.
- [ ] **Step 5:** Commit `feat(admin): Login-as-associate column in associate directory`.

### Task 7: Impersonation banner

**Files:**
- Modify: `frontend/src/app/app.component.ts`, `app.component.html`, `app.component.scss` (or `_app-shell.scss`), `app.component.spec.ts` if present
- Modify: `en.json`, `hi.json` (`impersonation.viewingAs` with `{{name}}` param, `impersonation.exit`)

**Interfaces:**
- Consumes: `AuthService.isImpersonating()`, `getImpersonatedName()`, `exitImpersonation()` (Task 5).
- Behavior: when `isImpersonating()`, render a sticky banner at the top of `app.component.html` (above `.mobile-topbar`; respect safe-area inset) with text "Viewing as <name>" and an **Exit** button. Exit calls `exitImpersonation()` then `router.navigate(['/settings/associate-directory'])`. Banner wraps/stacks at ≤400px without horizontal scroll.

- [ ] **Step 1: Write failing spec:** banner absent normally; present with the name when impersonating; Exit restores admin role and navigates to `/settings/associate-directory`.
- [ ] **Step 2:** Run the app component spec — expect FAIL.
- [ ] **Step 3:** Implement banner + styles.
- [ ] **Step 4:** Re-run — expect PASS.
- [ ] **Step 5:** Commit `feat(shell): impersonation banner with Exit`.

### Task 8: End-to-end check

- [ ] **Step 1:** Run full backend tests (`cd backend && mvn -q test`; ~55 known spurious Mockito errors from the JDK mismatch are unrelated — compare against `master`) and frontend (`npx ng test --watch=false`), plus `npx ng build`.
- [ ] **Step 2:** Use the `run` skill to start the app; as admin open `/settings/associate-directory`, click Login on an associate, confirm associate dashboard + banner, make one write (e.g. edit profile), click Exit, confirm admin session restored and a row "Logged in as <userId>" appears in `/settings/audit-log` under "All". Check at 400px width.
- [ ] **Step 3:** Report results; do not merge without the user's go-ahead.

## Notes (deliberate gaps)

- The audit-log screen's section filter dropdown is not extended (the entry shows under "All"); add a filter option if wanted.
- Per-action auditing while impersonating is out of scope; `impersonatedBy` is in the token if it's wanted later.
- localStorage is shared across tabs, so the banner/impersonation state applies to all open tabs of the browser.
