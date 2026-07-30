# Phases 0 & 1 — Error-handling foundation, then the auth migration

Part of the 13-phase setup/onboarding build. Full roadmap: `docs/superpowers/plans/2026-07-30-setup-onboarding.md`.
Spec: `setup-onboarding-spec.md` · Design: `ChatGPT Image Jul 29, 2026, 11_07_58 PM.png`

## Context

Two pieces of groundwork have to land before any wizard screen is built. Neither ships a user-visible feature; both exist because the wizard cannot be built correctly on top of the current code.

**Phase 0 — error handling.** The wizard's forms are large: Company Profile has 7 fields, Compensation has 11. When one field fails validation the admin has to be told *which*. Today they can't be. `auth/AuthExceptionHandler.java:19-22` is the application's **only** `MethodArgumentNotValidException` handler, it isn't scoped to a package, and it returns a hardcoded string:

```java
return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", "email and password are required"));
```

Every controller's validation failure in the entire application returns that message. A bad GST number on the Company Profile screen would tell the admin their email and password are required. Four other common exception types — malformed JSON, a bad path-variable type, a constraint violation, an oversized upload — have no handler at all and fall through to Spring's default error body, which doesn't carry the `{"error": …}` key the frontend interceptor and every component expect.

**Phase 1 — auth migration.** The design mockup's login screen shows an **"Associate ID"** field (`VP00001`), not an email, and spec Step 6 creates staff accounts from a **User ID** + full name + temporary password with no email at all. `AuthService.login` looks users up by `email`, which is `NOT NULL UNIQUE`. Separately, Step 6 needs Finance / KYC Reviewer / Support / Super-Admin roles, but `AssociateRole` has only `ADMIN, ASSOCIATE` and `SecurityConfig` gates every write behind `hasAuthority("ADMIN")` — so any staff account created later would be locked out of every write in the application, failing as 403s that look like a client bug.

Outcome after both phases: validation errors identify their field; users log in with a User ID; the role enum and authorization matrix accommodate staff roles; the whole existing suite still passes. No wizard UI yet — Phase 2 starts that.

### Decisions (confirmed with the user)

1. **`user_id` is the login identifier.** Real unique column. Admins choose theirs; associates get an auto-generated `VP00001`-style ID.
2. **`email` becomes nullable**, keeping its unique index. Staff accounts created in Phase 10 carry no email. Decided now so a later phase doesn't need a second migration on the same column.
3. **Associate ID prefix is a config property** — `plotchain.associate-id-prefix`, default `VP`, via `@Value`, matching the existing `jwt.*` / `plotchain.bootstrap.*` pattern. Phase 4 can later default it from the company name without touching the generator.
4. **All admin-family roles can write** for now. Per-role narrowing arrives with Phase 10's permission matrix; the spec says the founding admin acts as all roles until then.

### Corrections to the roadmap

- **The setup-mode login gate moves to Phase 3.** The roadmap put it in Phase 1, but rejecting `ASSOCIATE` logins while `launched_at IS NULL` reads `setup_state`, which doesn't exist until Phase 3's `V5`. Nothing else in Phase 1 depends on it.
- **`commons-csv` moves to Phase 9** and **multipart config to Phase 5**, where each is first used. The roadmap front-loaded them into Phase 0 as "foundation deps"; adding an unused dependency and unused config six phases early is noise that reviewers can't evaluate. The `MaxUploadSizeExceededException` handler still ships in Phase 0 — it is inert until multipart exists, and it belongs with its siblings.

### Constraints that shape the work

- `ddl-auto: validate` in both `application.yml` and `application-test.yml` — entity and schema must move together or the context won't start.
- **`@DataJpaTest` runs the real Flyway migrations against H2 in PostgreSQL mode.** `V4` must use SQL both engines accept. `split_part()` is Postgres-only — avoid it. `AssociateRepositoryTest` proves this on every `mvn test`.
- **Never edit `V1`–`V3`.** The README documents a Flyway checksum incident from an in-place edit that left dev databases unbootable. `V900` (dev-only seed) is the sole editable migration.
- Mock **interfaces only** — this JDK's Mockito/ByteBuddy can't instrument concrete classes (`AuthControllerTest.java:25-28`).
- `SecurityConfig`'s matcher order is first-match-wins and heavily commented; the comments must stay accurate.
- Error responses keep the existing `{"error": "..."}` shape. Phase 0 *adds* a `fields` key; it never removes `error`, because every frontend component and `auth.interceptor.ts` depend on it.
- Zero hardcoded user-facing strings; `en.json` and `hi.json` stay at exact key parity.
- Every task ends with the full suite green and one Conventional Commit.

---

# Phase 0 — Error-handling foundation

## Task 0.1 — Application-wide exception handler

**Create** `backend/src/main/java/com/plotchain/api/ApiExceptionHandler.java` — a new `com.plotchain.api` package for cross-cutting concerns, since the existing three advices are all domain-specific and this one is deliberately not.

```java
@RestControllerAdvice
public class ApiExceptionHandler {
    // 400 — bean validation. Adds a `fields` map on top of the `error` key that every
    // existing client already reads, so no consumer breaks.
    // { "error": "validation failed", "fields": { "contactEmail": "must be a well-formed email address" } }
    @ExceptionHandler(MethodArgumentNotValidException.class) ...
    @ExceptionHandler(HttpMessageNotReadableException.class)     // 400 — malformed JSON body
    @ExceptionHandler(MethodArgumentTypeMismatchException.class) // 400 — e.g. a non-UUID path variable
    @ExceptionHandler(DataIntegrityViolationException.class)     // 409 — unique/FK/check violation
    @ExceptionHandler(MaxUploadSizeExceededException.class)      // 413 — inert until Phase 5
}
```

Field-name resolution takes `FieldError.getField()`, falling back to the object name for class-level violations. When two errors target one field the first wins — deterministic, and matched to a UI that shows one message per input.

`DataIntegrityViolationException` returns a generic message and **never** echoes the driver's text, which leaks table and constraint names. Log the cause at `warn` with the stack trace instead.

**No catch-all `Exception` handler.** The repo currently lets unexpected exceptions surface as Spring's default 500 with a stack trace in the logs, and that is the more debuggable posture while the app is pre-production. Adding one would be a behaviour change unrelated to the wizard — deliberately out of scope, and noted here so the omission reads as a decision rather than an oversight.

**Modify** `auth/AuthExceptionHandler.java` — delete the `MethodArgumentNotValidException` handler (lines 19-22) and its imports. Keep `handleInvalidCredentials`. Add a comment saying validation now lives in `ApiExceptionHandler` and must not be re-added here, since a second advice handling the same type makes resolution order-dependent.

**Modify** `auth/AuthControllerTest.java:41-43` — this is the trap. The class uses `MockMvcBuilders.standaloneSetup(...)`, which registers advices **explicitly**:

```java
mockMvc = MockMvcBuilders.standaloneSetup(new AuthController(authService))
    .setControllerAdvice(new AuthExceptionHandler())
    .build();
```

Removing the handler from `AuthExceptionHandler` without adding `new ApiExceptionHandler()` here makes `returns400ForMissingPassword` (line 77, which asserts `$.error` is non-empty) fail — the request would fall to Spring's default body, which has no `error` key. Register both advices.

**Tests** (write first, confirm red, then implement):

- New `api/ApiExceptionHandlerTest.java` — standalone MockMvc against a tiny test controller, following the pattern `AuthControllerTest` establishes. Assert: a field violation returns 400 with `fields.<name>` populated and `error` still present; malformed JSON returns 400; a bad path-variable type returns 400; a `DataIntegrityViolationException` returns 409 and its body contains none of the underlying constraint text.
- `auth/AuthControllerTest.java` — `returns400ForMissingPassword` additionally asserts `$.fields.password` is populated, proving the real per-field path and not just a generic 400.

Commit: `fix: report validation errors per field instead of a login-specific message`

## Task 0.2 — Frontend field-error primitive

The app has **no per-field validation display anywhere** — every component owns one `error = false` boolean and renders a single generic message. The wizard needs the opposite.

**Create:**

- `frontend/src/app/core/api/field-errors.model.ts` — `ApiError { error: string; fields?: Record<string, string>; }` plus `toFieldErrors(err: HttpErrorResponse): Record<string, string>`, returning `{}` for any response that isn't shaped this way (a 500, an HTML error page, a network failure) so callers never have to null-check.
- `frontend/src/app/shared/components/field-error/field-error.component.ts` — standalone, `@Input() message?: string`, renders nothing when absent. Class names only; styling arrives with Phase 2's design system, consistent with how the dashboard widgets already ship.
- Co-located `.spec.ts` for both, per the repo's every-file-has-a-spec convention.

This is the first `core/` and `shared/` directory in the app; both are named in the roadmap's frontend structure and are created here rather than invented later.

**No component consumes it yet** — the first consumer is Phase 4's Company Profile form. It ships now because it is the client half of the contract Task 0.1 defines, and shipping the two halves together is what makes the contract testable.

Commit: `feat: add a field-level validation error primitive`

---

# Phase 1 — `user_id` login + role expansion

## Task 1.1 — Schema and persistence: `user_id` column

The largest task, and necessarily atomic: `user_id` lands `NOT NULL`, so **every** code path that saves an `Associate` must populate it in the same commit or the suite goes red.

**Create** `backend/src/main/resources/db/migration/V4__user_id_login_and_admin_roles.sql`:

```sql
-- Login moves from email to a user-chosen / auto-generated User ID (see setup-onboarding-spec.md
-- Step 6 and the associate login mockup, which shows an "Associate ID" field).
ALTER TABLE associate ADD COLUMN user_id VARCHAR(64);

-- Backfill pre-existing rows before the NOT NULL below, for the same reason V2 backfills:
-- SET NOT NULL throws on a non-empty table, Flyway marks V4 failed, and the DB is left
-- half-migrated. split_part() is deliberately NOT used here — it is Postgres-only, and this
-- migration also runs against H2 (PostgreSQL mode) in @DataJpaTest.
UPDATE associate SET user_id = REGEXP_REPLACE(email, '@.*$', '') WHERE user_id IS NULL;

-- Two accounts can share an email local-part (a@x.com, a@y.com). Left alone that collides on
-- the unique index below and fails the migration mid-flight. Disambiguate deterministically
-- instead, so V4 always completes; an operator can rename afterwards.
UPDATE associate a SET user_id = a.user_id || '-' || SUBSTRING(REPLACE(CAST(a.id AS VARCHAR), '-', '') FROM 1 FOR 6)
WHERE EXISTS (SELECT 1 FROM associate b WHERE b.user_id = a.user_id AND b.id <> a.id);

ALTER TABLE associate ALTER COLUMN user_id SET NOT NULL;
CREATE UNIQUE INDEX idx_associate_user_id ON associate (user_id);

-- Email is now a contact field, not a credential. Step 6 creates staff accounts with no email
-- at all. The unique index stays (both engines permit multiple NULLs under a unique index).
ALTER TABLE associate ALTER COLUMN email DROP NOT NULL;

ALTER TABLE associate DROP CONSTRAINT chk_associate_role;
ALTER TABLE associate ADD CONSTRAINT chk_associate_role
    CHECK (role IN ('ADMIN','ASSOCIATE','SUPER_ADMIN','FINANCE','KYC_REVIEWER','SUPPORT'));

-- chk_associate_rank_required read `role = 'ADMIN' OR rank_id IS NOT NULL`, which would force
-- the four new staff roles to carry a meaningless rank tier. Invert it to state the real rule:
-- only associates have a rank.
ALTER TABLE associate DROP CONSTRAINT chk_associate_rank_required;
ALTER TABLE associate ADD CONSTRAINT chk_associate_rank_required
    CHECK (role <> 'ASSOCIATE' OR rank_id IS NOT NULL);
```

**Modify:**

- `associate/Associate.java` — add `@Column(name = "user_id", nullable = false) private String userId;` + accessors. Change `email` from `@Column(nullable = false)` to `@Column`.
- `associate/AssociateRepository.java` — add `Optional<Associate> findByUserId(String)`, `boolean existsByUserId(String)`, and `Optional<Associate> findTopByUserIdStartingWithOrderByUserIdDesc(String prefix)` for ID generation. All three are derived queries — **no native SQL**, so no H2/Postgres dialect risk. Zero-padded fixed-width IDs make string-descending order equal numeric order.
- `associate/AssociateProvisioningService.java` — add `@Value("${plotchain.associate-id-prefix:VP}")` and a `generateAssociateId()` that reads the highest existing suffix via the new repository method, increments, formats as `prefix + "%05d"`, and re-checks `existsByUserId` in a bounded loop before use. Leave the existing `SecureRandom` temp-password helper untouched.
- `auth/AdminBootstrapRunner.java` — set `userId` from a new `@Value("${plotchain.bootstrap.admin-user-id:admin}")`. Keep `admin-email` as the contact field.
- `db/migration-dev/V900__seed_dev_accounts.sql` — add `user_id` to the column list and values (`associate01`, `admin`). Dev-only, safe to edit. Update the header comment's credential list.
- `application.yml` — add `plotchain.associate-id-prefix` and `plotchain.bootstrap.admin-user-id` with `${VAR:default}` env overrides, matching the file's existing style.

**Tests:**

- `associate/AssociateRepositoryTest.java` — the `newAssociate(...)` helper at line 114 must call `setUserId(...)`; without it every test in the class fails on the NOT NULL. Add: `findByUserId` returns the match; returns empty for an unknown ID; an associate persists with a null email. **This class is the H2-compatibility canary for `V4`** — an unportable migration fails here first.
- `associate/AssociateProvisioningServiceTest.java` — first associate gets `VP00001`; the next gets `VP00002` given an existing max; a configured prefix is honoured.
- `auth/AdminBootstrapRunnerTest.java` — the bootstrapped admin carries the configured user ID.

Commit: `feat: add user_id login identifier to associate`

## Task 1.2 — Role expansion and the authorization gate

**Modify:**

- `associate/AssociateRole.java` — add `SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT`. Add `public boolean isAdminFamily()` returning `this != ASSOCIATE`, commented as the single definition of "may write" until Phase 10 narrows it.
- `auth/SecurityConfig.java:53-56` — replace the four `hasAuthority("ADMIN")` rules with `hasAnyAuthority("ADMIN","SUPER_ADMIN","FINANCE","KYC_REVIEWER","SUPPORT")`. Extend the existing block comment to explain why: without it every staff role created in Phase 10 is locked out of all writes, and it fails as 403s that look like a client bug. **Do not touch matcher order** — the two first-match-wins comments above stay exactly as they are.

**Tests:**

- `auth/SecurityConfigTest.java` — parameterize `writeRequestsPassTheSecurityLayerForAnAdminToken` over all five admin-family roles, keeping the deliberate 404-not-403 discriminator the class documents. Leave `writeRequestsAreRejectedForAnAssociateToken` unchanged: `ASSOCIATE` must still be refused, which is what proves the widened rule didn't become "any authenticated user".
- New `associate/AssociateRoleTest.java` — `isAdminFamily()` is true for all five, false for `ASSOCIATE`.

Ordering note: Task 1.1's `V4` already widened the DB `CHECK`, so the new enum values are storable the moment they exist. Nothing creates an account with one until Phase 10.

Commit: `feat: add staff roles and widen the write-authorization rule`

## Task 1.3 — Login switches to `user_id`

**Modify:**

- `auth/LoginRequest.java` — `@NotBlank String email` → `@NotBlank String userId`.
- `auth/AuthService.java:25` — `findByEmail(request.email())` → `findByUserId(request.userId())`. Still `InvalidCredentialsException` on a miss, so a wrong ID and a wrong password stay indistinguishable to the caller.

`LoginResponse` is unchanged — `associateId`, `role` and `mustChangePassword` are none of them email-derived.

**Tests** — all currently build `new LoginRequest("jane@plotchain.test", …)` and stub `findByEmail`:

- `auth/AuthServiceTest.java` — three login tests switch to `findByUserId`; rename `rejectsAnUnknownEmail` → `rejectsAnUnknownUserId`.
- `auth/AuthControllerTest.java` — two tests, same switch; `returns400ForMissingPassword`'s JSON body key becomes `userId`.
- `auth/SecurityConfigTest.java:65-70` — `loginIsReachableWithoutAToken` stubs `findByUserId`.

Commit: `feat: authenticate by user ID instead of email`

## Task 1.4 — Surface the generated ID, and document deployment

**Modify:**

- `associate/CreateAssociateResponse.java` — add `String userId` alongside `associateId` and the one-time `temporaryPassword`. An admin provisioning an associate must be told the ID that associate will log in with; without it the account is unusable. Extend the record's Javadoc, which already documents the show-once contract.
- `associate/AssociateProvisioningService.java:69` — return the generated `userId`.
- `README.md` — document `PLOTCHAIN_ADMIN_USER_ID` (default `admin`) and `PLOTCHAIN_ASSOCIATE_ID_PREFIX` (default `VP`) beside the existing `JWT_SECRET` / `PLOTCHAIN_ADMIN_*` entries; state that login now takes a User ID; update the dev-profile seed credentials to `associate01` / `admin`.

`CreateAssociateRequest` keeps `@NotBlank @Email String email` — associates still supply one. Making it optional is Phase 11 (root associates take name + phone), not this phase.

**Tests:** `associate/AssociateProvisioningServiceTest.java` asserts the response carries the generated ID; `admin.service.spec.ts` and `create-associate.component.spec.ts` assert the new field renders.

Commit: `feat: return the generated associate ID when provisioning`

## Task 1.5 — Frontend login

**Modify:**

- `auth/models/login-request.model.ts` — `email: string` → `userId: string`.
- `auth/auth.service.ts:15-16` — `login(userId: string, password: string)`, body `{ userId, password }`.
- `auth/login.component.ts` — control `email` → `userId`; `[Validators.required, Validators.email]` → `Validators.required` (a user ID is not an email); `<input type="email">` → `<input type="text" autocomplete="username">`; label key `auth.emailLabel` → `auth.userIdLabel`. Post-login routing at line 49 is unchanged here — Phase 3 adds the `/setup` redirect.
- `assets/i18n/en.json` — `auth.emailLabel: "Email"` → `auth.userIdLabel: "Associate ID"`, and `auth.loginError` reworded off "email". `assets/i18n/hi.json` — same key change, **same commit**, so parity never breaks.

**Tests:** `login.component.spec.ts` (four `form.setValue({ email: … })` calls), `auth.service.spec.ts:41` (asserts the exact request body), `auth.interceptor.spec.ts:61` (posts a login body).

Commit: `feat: log in with an associate ID on the login screen`

## Task 1.6 — Frontend admin guard

**Modify** `admin/admin.guard.ts:12` — `getRole() === 'ADMIN'` → membership in an exported `ADMIN_ROLES` set covering all five admin-family roles. Without this a Finance user is bounced to `/dashboard` even though the backend would admit them. Keep the existing comment block: this is UX only, `SecurityConfig` is the real boundary.

**Tests:** `admin.guard.spec.ts` — allows each admin-family role, redirects `ASSOCIATE` to `/dashboard`, asserting `UrlTree.toString()` per the file's existing pattern.

Commit: `feat: admit all staff roles through the admin route guard`

---

## Risks

| Risk | Mitigation |
|---|---|
| Removing the validation handler from `AuthExceptionHandler` silently breaks `AuthControllerTest` | That class uses `standaloneSetup`, which registers advices explicitly — Task 0.1 registers `ApiExceptionHandler` there too |
| Two advices handling `MethodArgumentNotValidException` makes resolution order-dependent | The old handler is deleted, not left alongside; a comment says why it must not come back |
| A `fields` key breaks existing clients | `error` is preserved on every response; `fields` is purely additive |
| `DataIntegrityViolationException` leaks table/constraint names | Generic client message; driver text logged at `warn`, never returned |
| `V4` SQL isn't H2-compatible and breaks `@DataJpaTest` | `REGEXP_REPLACE`/`SUBSTRING`/`CAST` instead of Postgres-only `split_part`; all three new repository methods are derived queries. `AssociateRepositoryTest` catches dialect problems on the first `mvn test` |
| `user_id NOT NULL` breaks every `Associate` save | Task 1.1 updates all four writers — provisioning service, bootstrap runner, `V900` seed, `newAssociate` test helper — in one atomic commit |
| Backfill collides on the unique index, leaving a half-applied `V4` (the hazard `V2`'s comment describes) | Deterministic de-duplication pass before `SET NOT NULL`, so `V4` always completes |
| Widening the write rule accidentally admits `ASSOCIATE` | `SecurityConfigTest.writeRequestsAreRejectedForAnAssociateToken` stays unchanged and must keep passing |
| A stale dev database refuses to boot on checksum mismatch | `V4` is a new forward migration; `V1`–`V3` untouched. README's drop/recreate instructions still apply |
| `hi.json` drifts from `en.json` | Both files change in the same commit in Task 1.5 |

---

## Verification

**Automated** — after every task:

```bash
mvn -f backend/pom.xml test
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

Baselines: ~30 backend tests, ~30 frontend. Both counts should rise, and none should be deleted — every test changed here is a rename or a substitution, never a removal. Targeted runs while iterating: `mvn -f backend/pom.xml test -Dtest=AssociateRepositoryTest`, `npx ng test --watch=false --include='**/login.component.spec.ts'`.

**Migration check against real Postgres** — H2 passing is necessary but not sufficient, since the migration ultimately runs on Postgres:

```bash
docker compose up -d
dropdb -h localhost -p 5434 -U plotchain plotchain && createdb -h localhost -p 5434 -U plotchain plotchain
export JWT_SECRET=$(openssl rand -base64 48)
mvn -f backend/pom.xml spring-boot:run -Dspring-boot.run.profiles=dev
```

Confirm Flyway applies `V1`–`V4` then `V900` cleanly, and that `\d associate` shows `user_id NOT NULL`, `idx_associate_user_id`, a nullable `email`, and both rewritten CHECK constraints.

**Manual end-to-end:**

1. `curl` a login with a missing password and confirm the response carries both `error` and `fields.password` — the Phase 0 contract, verified against the running app rather than only MockMvc.
2. `curl` a login with a malformed JSON body and confirm a 400 with an `error` key, not Spring's default body.
3. With the `dev` profile running, log in at `/login` as `admin` / `Password123!` — the field is labelled **Associate ID** and accepts a non-email value. Confirm a token is issued and routing is unchanged from before these phases.
4. Log in as `associate01` / `Password123!` — succeeds, lands on `/dashboard`.
5. Enter a valid ID with a wrong password, then a nonexistent ID — both return the same generic error, with no hint about which half failed.
6. As `admin`, provision an associate at `/admin/associates/new`. Confirm the response shows a generated ID (`VP00001`) and that the one-time temporary password still appears exactly once.
7. Log in as that new `VP00001` — the forced password change still fires, and logging in again afterwards succeeds without it.
8. Provision a second associate; confirm the ID increments to `VP00002`.
9. Restart with `PLOTCHAIN_ASSOCIATE_ID_PREFIX=RS` and confirm the next ID uses the new prefix.

**Bootstrap path** — proves the founding-admin flow the wizard depends on. Drop and recreate the database, run **without** the `dev` profile and with `PLOTCHAIN_ADMIN_USER_ID=founder`, `PLOTCHAIN_ADMIN_PASSWORD` and `PLOTCHAIN_ADMIN_EMAIL` set. Confirm `AdminBootstrapRunner` creates the account, that logging in as `founder` works, and that it is forced to change its password.
