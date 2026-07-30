# Plotchain

## Deployment configuration

The backend (`backend/`, Spring Boot) reads all deployment-specific configuration from
environment variables. Defaults are defined in
[`backend/src/main/resources/application.yml`](backend/src/main/resources/application.yml).

### `JWT_SECRET` — required outside `dev`/`test`

```
jwt:
  secret: ${JWT_SECRET:dev-only-change-me-this-needs-to-be-at-least-32-bytes-long}
```

The committed default (`dev-only-change-me-this-needs-to-be-at-least-32-bytes-long`) is public
source — anyone who has read this repository knows it. If the application booted with that
value still in effect, anyone could mint their own JWT, set the `role` claim to `ADMIN`, and
sign it with the well-known secret to get an admin token for any associate UUID.

To prevent that, [`JwtService`](backend/src/main/java/com/plotchain/auth/JwtService.java)
checks the resolved secret against that literal default at startup. If it matches **and** the
active Spring profile is not `dev` or `test`, startup fails immediately with an
`IllegalStateException`. No active profile at all (the default when running "for real") is
treated as *not* dev — the guard fails closed.

Set a real secret before starting outside `dev`/`test`:

```bash
export JWT_SECRET=$(openssl rand -base64 48)
```

Also configurable, with defaults:

```
jwt:
  expiration-minutes: ${JWT_EXPIRATION_MINUTES:60}
```

### Logging in: User ID, not email

Login (`POST /api/auth/login`) takes a **User ID**, not an email address. Every associate has a
unique `user_id` — associates get one auto-generated at provisioning (see
`PLOTCHAIN_ASSOCIATE_ID_PREFIX` below); admins and staff choose their own. Email is still
captured as a contact field, but it is no longer a credential and is not required for staff
accounts created from Company Settings.

### `PLOTCHAIN_ASSOCIATE_ID_PREFIX` — associate ID generation

```
plotchain:
  associate-id-prefix: ${PLOTCHAIN_ASSOCIATE_ID_PREFIX:VP}
```

[`AssociateProvisioningService`](backend/src/main/java/com/plotchain/associate/AssociateProvisioningService.java)
generates each new associate's login ID as this prefix plus a zero-padded, incrementing number
(`VP00001`, `VP00002`, ...). The default `VP` can be overridden per deployment; a running
instance should not change its prefix after associates already exist, since existing IDs are
not renumbered.

### `PLOTCHAIN_ADMIN_USER_ID` / `PLOTCHAIN_ADMIN_EMAIL` / `PLOTCHAIN_ADMIN_PASSWORD` — first-boot admin bootstrap

```
plotchain:
  bootstrap:
    admin-user-id: ${PLOTCHAIN_ADMIN_USER_ID:admin}
    admin-email: ${PLOTCHAIN_ADMIN_EMAIL:}
    admin-password: ${PLOTCHAIN_ADMIN_PASSWORD:}
```

[`AdminBootstrapRunner`](backend/src/main/java/com/plotchain/auth/AdminBootstrapRunner.java)
runs on every application startup and creates a single `ADMIN` associate from these values, so
that the very first admin account can exist without any credentials being committed to the
repository. It is a no-op — it does nothing and creates nothing — if **either**:

- `PLOTCHAIN_ADMIN_EMAIL` or `PLOTCHAIN_ADMIN_PASSWORD` is unset or blank, **or**
- the `associate` table already has at least one row (`associateRepository.count() > 0`),
  regardless of whether that row is an admin.

In other words, this only ever fires on the very first boot against a genuinely empty database.
The account it creates logs in with the `PLOTCHAIN_ADMIN_USER_ID` value (default `admin`) and has
`must_change_password = true`, so it is forced to change its password via
`POST /api/associates/me/password` on first login — see below.

Once the initial admin exists, `PLOTCHAIN_ADMIN_EMAIL`/`PLOTCHAIN_ADMIN_PASSWORD` are safe to
unset; they will not be read again in any way that matters (the runner still executes on every
boot, but the row-count check short-circuits it).

### Database connection

From `application.yml`, with these exact defaults:

| Variable | Default |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5434` |
| `DB_NAME` | `plotchain` |
| `DB_USER` | `plotchain` |
| `DB_PASSWORD` | `plotchain` |

```
spring:
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5434}/${DB_NAME:plotchain}
    username: ${DB_USER:plotchain}
    password: ${DB_PASSWORD:plotchain}
```

### Running locally with seeded test accounts

Activating the `dev` Spring profile (`application-dev.yml`) adds an extra Flyway migration
location, `classpath:db/migration-dev`, which seeds two accounts via
[`V900__seed_dev_accounts.sql`](backend/src/main/resources/db/migration-dev/V900__seed_dev_accounts.sql):

| User ID | Password | Role |
|---|---|---|
| `associate01` | `Password123!` | `ASSOCIATE` |
| `admin` | `Password123!` | `ADMIN` |

**These credentials are public.** They are committed in plaintext-adjacent form (a fixed bcrypt
hash) in this repository, so anyone with read access to the repo — or its git history — can log
in as either account. They must never be applied to, or left reachable from, a real deployment.
The `dev` profile is intended for local development against a disposable database only.

### Account creation

There is no self-service signup and no password-reset flow. The only way to create an associate
account is `POST /api/associates`
([`AssociateController`](backend/src/main/java/com/plotchain/associate/AssociateController.java)),
which requires a valid JWT for an `ADMIN` associate — every `POST /api/**` route is denied by
default to non-admins in
[`SecurityConfig`](backend/src/main/java/com/plotchain/auth/SecurityConfig.java) unless
explicitly exempted. The only such exemptions are `POST /api/auth/login` (unauthenticated,
obviously) and `POST /api/associates/me/password` (any authenticated associate, scoped to their
own account via the JWT subject — see
[`PasswordController`](backend/src/main/java/com/plotchain/auth/PasswordController.java)).

So, in practice: an `ADMIN` account provisions every other account (associate or admin) through
`POST /api/associates`, and each associate changes their own password afterwards through
`POST /api/associates/me/password`. There is no path for an associate to create their own
account or reset a forgotten password without administrator help.

The response includes the generated `userId` (e.g. `VP00001`) alongside the one-time temporary
password — the admin needs both to hand the new associate their login credentials, since the ID
is not guessable or recoverable afterwards through the API.

### Note: pulling this branch invalidates existing local dev databases

Task 2 of this feature edited migration
[`V2__add_associate_auth.sql`](backend/src/main/resources/db/migration/V2__add_associate_auth.sql)
*after* it had already been applied to local development databases, to remove the credentials
that were originally seeded there. Editing an already-applied migration file changes its Flyway
checksum.

If you already have a local dev database from before this change, Flyway will refuse to run
on your next boot with a checksum mismatch error for `V2`. This project does not wire up the
`flyway-maven-plugin` (only `flyway-core` is on the classpath, applied by Spring Boot at
startup), so fix it with one of:

```bash
# Option A: drop and recreate the local dev database, then let Flyway re-run every
# migration (including the dev-only seed data) from scratch. Simplest option.
dropdb -h localhost -p 5434 -U plotchain plotchain
createdb -h localhost -p 5434 -U plotchain plotchain

# Option B: use the standalone Flyway CLI (https://flywaydb.org/documentation/usage/cli/)
# against the same DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD to repair in place instead
# of losing local data:
flyway -url=jdbc:postgresql://localhost:5434/plotchain -user=plotchain -password=plotchain \
  -locations=filesystem:backend/src/main/resources/db/migration,filesystem:backend/src/main/resources/db/migration-dev \
  repair
```

This only affects pre-existing local databases created before this change; fresh databases are
unaffected.
