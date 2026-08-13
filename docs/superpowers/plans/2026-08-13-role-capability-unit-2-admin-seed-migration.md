# Role Capability Unit 2: Admin Seeded via Flyway Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the environment-variable-driven `AdminBootstrapRunner` with a Flyway migration that seeds the single founding `ADMIN` account (`parent_id = NULL`, `must_change_password = true`) in every environment, including every test run, with no configuration required.

**Architecture:** One new Flyway migration (`V18__seed_founding_admin.sql`) inserts the admin row directly. `AdminBootstrapRunner` and its test are deleted outright, along with the now-unused `plotchain.bootstrap.*` block in `application.yml`. The new permanent row collides with two pre-existing test fixtures that also use `user_id = 'admin'` — one in the real backend test suite (`AssociateRepositoryTest`), one in the dev-only fixture migration (`V900__seed_dev_accounts.sql`) — both are fixed as part of this same change, since the new migration is what creates the collision. Documentation (`README.md`) is updated to match.

**Tech Stack:** Spring Boot (Java), Flyway/PostgreSQL (H2 in PostgreSQL-compat mode for tests), BCrypt password hashing.

## Global Constraints

- Spec of record: `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md`, "Resolved decisions" #1 — admin seeding always via Flyway migration, never `AdminBootstrapRunner`. Migration inserts the one `ADMIN` row with `parent_id = NULL` (root of tree by construction, no separate flag) and `must_change_password = true` (forces rotation on first login — the control that makes a fixed default password acceptable).
- Unit scope, per `docs/superpowers/plans/2026-08-03-role-capability-units.md` row 2 and the acceptance criteria this plan was commissioned against: seed-via-migration + delete `AdminBootstrapRunner` + remove its config block + keep the full backend suite green. **Narrowing `chk_associate_role`'s CHECK constraint (dropping `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` from the allowed values in `V4__user_id_login_and_admin_roles.sql`) is explicitly NOT part of this unit** — that constraint still allows all six role strings today (confirmed by reading the file; unit 1 only touched the Java `AssociateRole` enum and authorization code, not this SQL). Narrowing it is deferred to whichever of units 3/4 (Root Associate removal / Admin Team removal) actually deletes the code paths that create rows with those role strings — narrowing the constraint before that code is gone would be premature. This plan's migration inserts `role = 'ADMIN'`, which is valid under the *current*, unnarrowed constraint, so there is no ordering dependency either way.
- Run backend tests with `cd backend && ./mvnw test`.
- The seeded default password is `ChangeMe123!`. Its bcrypt hash below was generated and verified with the project's actual `BCryptPasswordEncoder` (Spring Security 6.3.3, matching this project's Spring Boot 3.3.4 / `pom.xml`) — `encoder.matches("ChangeMe123!", hash)` returns `true`. Do not substitute a hand-typed or differently-sourced hash without re-verifying the same way; a wrong hash silently locks out the founding admin.
- Editing `V900__seed_dev_accounts.sql` (Task 2) changes that file's Flyway checksum. Its own header comment already states it is LOCAL DEVELOPMENT ONLY against a disposable database, so — same precedent already established for editing applied migrations in place elsewhere in this codebase (`docs/superpowers/specs/2026-07-29-remove-tenant-id-design.md`) — this is safe, but anyone with an existing local `dev`-profile Postgres database must drop/recreate it (or `flyway repair`) before that database will boot again after this change lands. This plan does **not** touch `V4__user_id_login_and_admin_roles.sql`, so no such reset is needed for the *main* migration path or for any test run (H2 test databases are always created fresh).

---

### Task 1: Seed the founding admin via a new Flyway migration

**Files:**
- Create: `backend/src/main/resources/db/migration/V18__seed_founding_admin.sql`
- Modify: `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java:163` and `:229`

**Interfaces:**
- Produces: a guaranteed single `associate` row with `role = 'ADMIN'`, `user_id = 'admin'`, `id = '00000000-0000-0000-0000-000000000001'`, `parent_id = NULL`, `must_change_password = true`, present in every environment (including every test run) from the very first Flyway run, without any environment variable. Later tasks in this plan, and any future unit, can rely on this row existing.

- [ ] **Step 1: Create the migration**

The `associate` table's current NOT NULL columns (per `Associate.java` and the migration history: `V1`, `V2`, `V3`, `V4`, `V15`) are `id`, `name`, `kyc_status`, `status`, `joined_at`, `cumulative_matched_volume`, `user_id`, `password_hash`, `role`, `must_change_password` — `rank_id`, `email`, `phone`, `position`, `sponsor_id`, `parent_id`, `last_active_at` are all nullable, and `chk_associate_rank_required` (`V4`) only requires `rank_id` for `role = 'ASSOCIATE'`, so an `ADMIN` row can safely omit `rank_id`. Create `backend/src/main/resources/db/migration/V18__seed_founding_admin.sql`:

```sql
-- Replaces AdminBootstrapRunner (an ApplicationRunner that seeded this row from
-- PLOTCHAIN_ADMIN_* environment variables, and only on a first boot against an empty
-- associate table). Seeding via migration means the founding admin always exists, in every
-- environment including every test run, with no configuration or manual bootstrap step
-- required -- see docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
-- "Resolved decisions" #1.
--
-- parent_id = NULL makes this row the root of the binary tree by construction -- no separate
-- "is root" flag needed. must_change_password = true forces a password rotation via
-- POST /api/associates/me/password on first login; that forced rotation is what makes shipping
-- a fixed default password acceptable here.
--
-- Default password: ChangeMe123! -- bcrypt hash below, generated and verified against this
-- project's own BCryptPasswordEncoder (cost factor 10, the $2a$ variant, same encoder
-- SecurityConfig wires up for every other password in this system).
INSERT INTO associate (
    id, user_id, name, password_hash, role, kyc_status, status,
    joined_at, cumulative_matched_volume, must_change_password
) VALUES (
    '00000000-0000-0000-0000-000000000001', 'admin', 'Administrator',
    '$2a$10$0Egz0wWudJb27UCZ1H4aZ.QYpaU0ge2AJWcouK2TBU7/5OeQize0u',
    'ADMIN', 'VERIFIED', 'ACTIVE', CURRENT_TIMESTAMP, 0, TRUE
);
```

- [ ] **Step 2: Fix the two `AssociateRepositoryTest` fixtures that now collide with the seeded row**

`AssociateRepositoryTest` is a `@DataJpaTest` — it runs the real Flyway migrations (including the one just created) against a real embedded H2 datasource before any test method runs, and that seeded row persists for the lifetime of the test class's Spring context (only each test method's *own* writes are rolled back). Two test methods currently persist their own row with the literal `user_id = "admin"`, which will now collide with the migration-seeded row on the `idx_associate_user_id` unique index the moment either method calls `entityManager.flush()`.

In `backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java`, change both occurrences (there are exactly two, lines 163 and 229) from:

```java
        Associate admin = persistAssociate("admin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
```

(line 163, inside `findByIdAndRoleOnlyMatchesAssociateRoleRows`) and:

```java
        persistAssociate("admin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
```

(line 229, inside `searchDirectoryFiltersBySearchRankKycStatusAndStatus`) to use `"testadmin"` instead of `"admin"` as the `userId` argument in both places — the literal string value is incidental to what these tests assert (role-based filtering behavior), only its *uniqueness* matters:

```java
        Associate admin = persistAssociate("testadmin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
```

```java
        persistAssociate("testadmin", "Admin", AssociateRole.ADMIN, null,
            KycStatus.VERIFIED, AssociateStatus.ACTIVE, Instant.now());
```

No other line in either test method needs to change — `findByIdAndRoleOnlyMatchesAssociateRoleRows` asserts on the returned `Associate`'s id, not its `userId`, and `searchDirectoryFiltersBySearchRankKycStatusAndStatus`'s `noFilters` assertion (`containsExactlyInAnyOrder("VP00001", "VP00002")`, a few lines below) already excludes the `ADMIN`-role row from its expected result regardless of that row's `userId` value.

- [ ] **Step 3: Run the affected tests**

Run: `cd backend && ./mvnw test -Dtest=AssociateRepositoryTest`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/db/migration/V18__seed_founding_admin.sql \
        backend/src/test/java/com/plotchain/associate/AssociateRepositoryTest.java
git commit -m "feat(auth): seed the founding admin account via Flyway migration"
```

---

### Task 2: Fix the dev-only fixture migration's collision with the seeded admin row

**Files:**
- Modify: `backend/src/main/resources/db/migration-dev/V900__seed_dev_accounts.sql`
- Create: `backend/src/test/java/com/plotchain/auth/DevProfileMigrationCombinationTest.java`

**Interfaces:**
- Consumes: nothing new.
- Produces: proof (via an isolated, non-shared-context test) that the combined migration set Flyway applies for a real `dev`-profile boot (`classpath:db/migration` + `classpath:db/migration-dev`) applies cleanly end to end, with exactly one `admin` row and one `associate01` row.

`V900__seed_dev_accounts.sql` (loaded only when the `dev` Spring profile is active, via `application-dev.yml`'s extra `spring.flyway.locations` entry) currently seeds its *own* `ADMIN` row with `user_id = 'admin'`. Both migration locations are merged into one Flyway version sequence sorted by version number (`V18` before `V900`), so on a fresh `dev`-profile bootstrap, `V18` would insert `user_id = 'admin'` first, and `V900` would then fail on the same unique index trying to insert a second row with the same `user_id`. This isn't caught by `./mvnw test` today, because the `test` Spring profile's `application-test.yml` only loads `classpath:db/migration` (not `-dev`) — so this task adds a small standalone test that exercises the real combined location set to catch it, in addition to fixing it.

- [ ] **Step 1: Write the (currently red) regression test**

Create `backend/src/test/java/com/plotchain/auth/DevProfileMigrationCombinationTest.java`. This deliberately does **not** use `@SpringBootTest`/`@DataJpaTest` — those share Spring's cached application context and a named in-memory H2 database (`jdbc:h2:mem:plotchain`, kept alive across contexts by `DB_CLOSE_DELAY=-1`) with the rest of the suite, so mutating that shared instance's migration set here would risk polluting or being polluted by other test classes. Instead it drives Flyway directly against its own disposable, uniquely-named H2 database:

```java
package com.plotchain.auth;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Regression test for a real collision the admin-seeding migration (V18) would otherwise cause:
// V900__seed_dev_accounts.sql (loaded only under the `dev` Spring profile, local development)
// used to insert its own ADMIN row with user_id = 'admin' -- the same user_id V18 now seeds in
// every environment. Both migration locations merge into one Flyway version sequence
// (V18 < V900), so a fresh `dev`-profile bootstrap would fail applying V900 on the unique index
// idx_associate_user_id. This runs the exact combined migration set (main + dev) Flyway applies
// for a real `dev`-profile boot, against a disposable, uniquely-named H2 instance isolated from
// the shared test-suite database, so it can neither pollute nor be polluted by any other test.
class DevProfileMigrationCombinationTest {

    @Test
    void mainAndDevMigrationsApplyTogetherWithoutCollision() throws Exception {
        String dbName = "devmigrationcheck" + UUID.randomUUID().toString().replace("-", "");
        String url = "jdbc:h2:mem:" + dbName + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1";

        Flyway flyway = Flyway.configure()
            .dataSource(url, "sa", "")
            .locations("classpath:db/migration", "classpath:db/migration-dev")
            .load();

        flyway.migrate();

        List<String> userIds = new ArrayList<>();
        try (Connection conn = flyway.getConfiguration().getDataSource().getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT user_id FROM associate ORDER BY user_id")) {
            while (rs.next()) {
                userIds.add(rs.getString("user_id"));
            }
        }

        assertThat(userIds).containsExactly("admin", "associate01");
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && ./mvnw test -Dtest=DevProfileMigrationCombinationTest`
Expected: FAIL — `V900` errors applying its `INSERT` (unique constraint violation on `idx_associate_user_id`), and Flyway surfaces this as a migration failure exception out of `flyway.migrate()`.

- [ ] **Step 3: Trim `V900__seed_dev_accounts.sql`'s own admin insert**

The `ADMIN` account no longer needs to be seeded here — `V18__seed_founding_admin.sql` (Task 1) already seeds it in every environment, `dev` included. Replace the full contents of `backend/src/main/resources/db/migration-dev/V900__seed_dev_accounts.sql` with:

```sql
-- LOCAL DEVELOPMENT ONLY. Loaded only when the `dev` profile is active (see
-- application-dev.yml). This is a publicly-known credential and must never be applied to a
-- real deployment.
--   associate01 / Password123!  (role ASSOCIATE)
--
-- The ADMIN account used to be seeded here too (admin / Password123!, no forced password
-- change). V18__seed_founding_admin.sql now seeds the one ADMIN row in every environment, dev
-- included -- keeping a second ADMIN insert here would collide with it on
-- idx_associate_user_id (both used user_id = 'admin'). Log in locally as admin / ChangeMe123!
-- instead (forced to change password on first login).
--
-- Versioned V900 to stay clear of the main migration sequence, which is free to grow to V899
-- before colliding.
INSERT INTO rank_tier (id, name, rank_order, volume_threshold) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Sales Associate', 1, 5000);

INSERT INTO associate (id, sponsor_id, parent_id, position, name, rank_id, kyc_status, joined_at, cumulative_matched_volume, last_active_at, user_id, email, password_hash, role, must_change_password) VALUES
    ('22222222-2222-2222-2222-222222222222', NULL, NULL, NULL, 'Test Associate', '11111111-1111-1111-1111-111111111111', 'VERIFIED', NOW(), 0, NULL, 'associate01', 'associate@plotchain.test', '$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C', 'ASSOCIATE', FALSE);
```

- [ ] **Step 4: Run the test again to verify it passes**

Run: `cd backend && ./mvnw test -Dtest=DevProfileMigrationCombinationTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db/migration-dev/V900__seed_dev_accounts.sql \
        backend/src/test/java/com/plotchain/auth/DevProfileMigrationCombinationTest.java
git commit -m "fix(dev-seed): stop seeding a second ADMIN row now that V18 seeds it everywhere"
```

---

### Task 3: Delete `AdminBootstrapRunner` and its config

**Files:**
- Delete: `backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java`
- Delete: `backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java`
- Modify: `backend/src/main/resources/application.yml:23-29`

**Interfaces:**
- Consumes: nothing (the migration from Task 1 already guarantees the admin row exists independently of this class).
- Produces: no `AdminBootstrapRunner` bean, no `plotchain.bootstrap.*` properties read anywhere in the codebase.

Confirmed before writing this task: `grep -rn "plotchain.bootstrap\|bootstrap.admin" backend/src/` matches only `AdminBootstrapRunner.java` itself — no `@ConfigurationProperties` class or other reader of this prefix exists, and neither `application-dev.yml` nor `application-test.yml` reference it. Safe to delete both files and the config block outright with no other code changes required.

- [ ] **Step 1: Delete the runner and its test**

```bash
git rm backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java \
       backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java
```

- [ ] **Step 2: Remove the now-unused bootstrap config block**

In `backend/src/main/resources/application.yml`, remove the `bootstrap:` block (currently lines 26-29):

```yaml
  bootstrap:
    admin-user-id: ${PLOTCHAIN_ADMIN_USER_ID:admin}
    admin-email: ${PLOTCHAIN_ADMIN_EMAIL:}
    admin-password: ${PLOTCHAIN_ADMIN_PASSWORD:}
```

so the `plotchain:` section reads:

```yaml
plotchain:
  associate-id-prefix: ${PLOTCHAIN_ASSOCIATE_ID_PREFIX:VP}
  secrets-key: ${PLOTCHAIN_SECRETS_KEY:dev-only-change-me-this-encryption-key-needs-32-bytes-too}
```

- [ ] **Step 3: Run the full backend test suite**

Run: `cd backend && ./mvnw test`
Expected: PASS, in full — this is the first point in this plan where the whole suite should be green with the new migration, the dev-fixture fix, and the runner deletion all in place together.

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/resources/application.yml
git rm backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java \
       backend/src/test/java/com/plotchain/auth/AdminBootstrapRunnerTest.java
git commit -m "refactor(auth): delete AdminBootstrapRunner, superseded by the seed migration"
```

(The `git rm` in this step is redundant with Step 1 if Step 1's deletion is already staged from a prior `git add -A`-style flow — running it again here is harmless and just makes the commit's staged file set explicit.)

---

### Task 4: Update README documentation

**Files:**
- Modify: `README.md:84-110`
- Modify: `README.md:132-146`

**Interfaces:** none — documentation only.

`README.md` currently documents both `AdminBootstrapRunner` (a class deleted in Task 3) and a dev-profile credentials table that, after Task 2, no longer seeds a second `ADMIN` row. Both sections need to describe the new state so a reader doesn't follow instructions for a deleted mechanism.

- [ ] **Step 1: Replace the "first-boot admin bootstrap" section**

In `README.md`, replace the section currently at lines 84-110 (`### `PLOTCHAIN_ADMIN_USER_ID` / `PLOTCHAIN_ADMIN_EMAIL` / `PLOTCHAIN_ADMIN_PASSWORD` — first-boot admin bootstrap`, through the paragraph ending "...unset; they will not be read again in any way that matters (the runner still executes on every boot, but the row-count check short-circuits it).") with:

```markdown
### Founding admin account (seeded by migration)

[`V18__seed_founding_admin.sql`](backend/src/main/resources/db/migration/V18__seed_founding_admin.sql)
inserts a single `ADMIN` associate row (`user_id` `admin`, password `ChangeMe123!`) into every
fresh database, in every environment — including every test run — with no environment variable
or manual bootstrap step required. `parent_id = NULL` makes this row the root of the binary tree
by construction, and `must_change_password = true` forces a password change via
`POST /api/associates/me/password` on first login, which is what makes shipping a fixed default
password acceptable.

This replaces the old `PLOTCHAIN_ADMIN_USER_ID` / `PLOTCHAIN_ADMIN_EMAIL` /
`PLOTCHAIN_ADMIN_PASSWORD` environment-variable bootstrap (`AdminBootstrapRunner`, deleted) —
there is nothing left to configure for the founding admin to exist.
```

- [ ] **Step 2: Update the dev-profile seeded-accounts table**

In `README.md`, replace the section currently at lines 132-146 (`### Running locally with seeded test accounts`, through the "These credentials are public." paragraph) with:

```markdown
### Running locally with seeded test accounts

Activating the `dev` Spring profile (`application-dev.yml`) adds an extra Flyway migration
location, `classpath:db/migration-dev`, which seeds one extra test account via
[`V900__seed_dev_accounts.sql`](backend/src/main/resources/db/migration-dev/V900__seed_dev_accounts.sql):

| User ID | Password | Role |
|---|---|---|
| `associate01` | `Password123!` | `ASSOCIATE` |

The `ADMIN` account isn't seeded here — it already exists in every environment, `dev` included,
via `V18__seed_founding_admin.sql` (see above): log in as `admin` / `ChangeMe123!` and expect to
be forced through a password change on first login.

**`associate01`'s credentials are public.** They are committed in plaintext-adjacent form (a
fixed bcrypt hash) in this repository, so anyone with read access to the repo — or its git
history — can log in as that account. It must never be applied to, or left reachable from, a
real deployment. The `dev` profile is intended for local development against a disposable
database only.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe the migration-seeded admin account, not AdminBootstrapRunner"
```

---

## Self-Review

**Spec coverage** — every line of this unit's acceptance criteria maps to a task: migration seeding the one `ADMIN` row with `parent_id = NULL`/`must_change_password = true` in every environment including tests (Task 1), `AdminBootstrapRunner` + its test deleted (Task 3), `application.yml` bootstrap block removed (Task 3), full backend suite green (Tasks 1, 2, 3 each run a test step; Task 3 Step 3 runs the whole suite). The spec's "Migration approach" CHECK-constraint narrowing is explicitly called out as out of scope for this unit in Global Constraints, with the reasoning for why and a pointer to where it belongs (units 3/4).

**Drift found versus the reference plan** (`docs/superpowers/plans/2026-08-03-role-model-collapse.md` Task 1), beyond the already-known migration-filename drift (confirmed `V18` is next-free, not `V16` — `ls backend/src/main/resources/db/migration/` shows through `V17__ledger_entry_idempotency.sql`):
- The reference plan bundles CHECK-constraint narrowing (editing `V4` in place) into the same task as admin seeding. This plan deliberately does not — see Global Constraints for why, and confirmed by reading `V4__user_id_login_and_admin_roles.sql` directly (its `chk_associate_role` still lists all six role strings; unit 1 never touched it).
- **Not caught by the reference plan or the spec at all**: seeding a permanent `user_id = 'admin'` row collides with two pre-existing test fixtures that used the same literal — one in `AssociateRepositoryTest` (real backend suite, fixed in Task 1) and one in the dev-only `V900__seed_dev_accounts.sql` fixture (fixed, with a dedicated regression test, in Task 2). Neither collision is hypothetical: both were confirmed by reading the actual current file contents, not assumed.
- Verified `AssociateRole` is already collapsed to `ADMIN`/`ASSOCIATE` (unit 1 already did this, ahead of what the stale unit-tracking table implied) — no enum work needed here.
- Verified no other production code depends on the `associate` table starting empty (`grep` for `associateRepository.count()` in `src/main/java` only matches the deleted `AdminBootstrapRunner` itself) and that `AdminProvisioningService.isComplete()` (`countByRoleNot(ASSOCIATE) > 1`) was already written anticipating exactly one pre-existing admin-family row, so it is unaffected by this migration seeding one.
- The bcrypt hash used is not the reference plan's — it was regenerated and empirically verified (`matches()` returns `true`) against this project's actual `spring-security-crypto` 6.3.3 jar, rather than trusted from the reference plan's quoted snippet per the task brief's explicit instruction.

**Placeholder scan** — no TBD/TODO; every step shows exact file content or an exact command.

**Type consistency** — n/a (no new Java types introduced by this unit; the one new test class, `DevProfileMigrationCombinationTest`, is self-contained and consumed by nothing else).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-13-role-capability-unit-2-admin-seed-migration.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
