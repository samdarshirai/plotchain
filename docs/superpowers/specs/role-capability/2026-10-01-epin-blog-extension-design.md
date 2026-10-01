# e-PIN Extension (Expiry, Allocation, Block, Associate Self-Redeem and Transfer, PENDING Activation)

## Context

This is a delta spec on top of `2026-08-03-epin-domain-design.md`. That spec's units 1-4 are merged: Admin generates a batch (`POST /api/admin/epins`), views the register (`GET /api/admin/epins`), and redeems a pin on an associate's behalf (`POST /api/admin/epins/{id}/redeem`). Its units 5-7 (associate view, admin screen, associate screen) are still pending and are replaced by the units in this spec.

Source for the extension: https://infinitemlmsoftware.com/blog/use-of-e-pin-mlm-software. The blog describes e-pins as secure single-use vouchers used for registration, upgrades and renewals, with: expiry dates, admin add/delete/search, active and inactive lists, requests and allocations, generation/usage/blocking logs, suspend or cancel of unused pins, and member-side use with full lifecycle reporting.

Decided with the product owner in brainstorming (2026-10-01):
- All four of: expiry date, block/cancel unused pins, allocate pins to an associate, associate self-redeem and transfer.
- Associate self-redeem activates a downline associate. `TOPUP` stays admin-only until a booking domain exists.
- Activation is real: new `PENDING` associate status, flipped to `ACTIVE` by an `ACTIVATION` redeem.
- Transfer recipient is any `ACTIVE` associate (no downline/upline restriction).
- Frontend in scope: admin screen and associate screen.

## Supersedes (Aug 3 spec)

| Aug 3 item | Now |
|---|---|
| Decision 5: allocation and redemption are one atomic action | Allocation is a separate step. A pin can sit `ALLOCATED` in an associate's inventory until redeemed or transferred. Direct admin redeem of an `UNUSED` pin remains allowed. |
| Decision 8: `ACTIVATION` has no side effect on `Associate` | `ACTIVATION` redeem requires the target to be `PENDING` and flips it to `ACTIVE`. |
| Resolved decision 3: no expiry/TTL | Optional per-batch `expires_at`. Null means never expires. |
| Context: "an Associate never self-generates or self-redeems an e-PIN" | Associates may redeem (`ACTIVATION` only, for a `PENDING` downline member) and transfer pins allocated to them. Associates still never generate, allocate, block or unblock. |
| Decision 14: associate view scoped to `redeemedTo = self` | Scoped to pins allocated to, redeemed to, or redeemed by self. |

Everything not listed above (Decisions 1-4, 6, 7, 9-13, `EPinCodeGenerator`, batch ceiling 2000, full code visibility, `/api/admin/epins` and `/api/associates/me/epins` naming) is unchanged.

## Scope

**In scope:** expiry, block/unblock, admin allocation, associate self-redeem and transfer, `PENDING` associate status and activation, audit event log, associate own view (revised), admin and associate screens.

**Out of scope:**
- Email/SMS notification of allocations (the blog mentions it).
- Income gating for `PENDING` associates beyond withdrawal.
- A pin-request workflow (associate asks admin for pins).
- `TOPUP` mechanics (still a label; `linkedEntityId` stays unpopulated).
- CSV export of the register.
- Restricting transfers to the sponsor chain. The audit trail covers abuse; a restriction can be added later without a schema change.

## Data model

### `epin` table changes (new migration)

| Column | Type | Notes |
|---|---|---|
| `status` CHECK | widened | `UNUSED`, `ALLOCATED`, `USED`, `BLOCKED` |
| `expires_at` | TIMESTAMP NULL | set per batch at generation |
| `allocated_to` | UUID NULL, FK `associate(id)` | current holder; stays set after the pin is `USED` |
| `allocated_by` | UUID NULL, FK `associate(id)` | the Admin who allocated |
| `allocated_at` | TIMESTAMP NULL | |
| `blocked_by` | UUID NULL, FK `associate(id)` | |
| `blocked_at` | TIMESTAMP NULL | |
| `block_reason` | VARCHAR(255) NULL | |

`EXPIRED` is not a stored status. A pin is expired when `expires_at IS NOT NULL AND expires_at <= now` and its status is `UNUSED` or `ALLOCATED`. Expiry is evaluated at read and write time; no scheduler. Expiry checks use an injected `Clock`.

### `epin_event` table (new)

| Column | Type |
|---|---|
| `id` | UUID PK |
| `epin_id` | UUID NOT NULL, FK `epin(id)`, indexed |
| `event_type` | VARCHAR NOT NULL: `GENERATED`, `ALLOCATED`, `TRANSFERRED`, `REDEEMED`, `BLOCKED`, `UNBLOCKED` |
| `actor_id` | UUID NOT NULL, FK `associate(id)` |
| `from_associate_id` | UUID NULL |
| `to_associate_id` | UUID NULL |
| `at` | TIMESTAMP NOT NULL |
| `note` | VARCHAR(255) NULL (block reason) |

The register reads `epin`. History reads `epin_event`.

### `associate` table

`AssociateStatus` gains `PENDING` (`ACTIVE`, `SUSPENDED`, `PENDING`). Migration widens the status CHECK (V15) and leaves all existing rows `ACTIVE`. New associates with role `ASSOCIATE` are created `PENDING`; `ADMIN` accounts (including the bootstrap admin) stay `ACTIVE`.

### Lifecycle

- `UNUSED` to `ALLOCATED`: admin allocate.
- `ALLOCATED` to `ALLOCATED`: holder transfers (changes `allocated_to`).
- `UNUSED` or `ALLOCATED` to `USED`: redeem (admin or holder).
- `UNUSED` or `ALLOCATED` to `BLOCKED`: admin block. `BLOCKED` back: unblock restores `ALLOCATED` if `allocated_to` is set, else `UNUSED`.
- `USED` is terminal and cannot be blocked.

## Associate `PENDING` behavior

- `AuthService` already blocks only `SUSPENDED`, so `PENDING` associates can log in.
- `WithdrawalService` (line ~62) extends its `SUSPENDED` guard to `PENDING`.
- Tree active-member counts already count `ACTIVE` only.
- Dashboard shows a "pending activation" banner (requires `status` on the profile response; verify at planning time).
- `AssociateStatusCache` treats only `ACTIVE` as active, consistent with this.

## Endpoints and authorization

### Admin (`hasAuthority("ADMIN")`, explicit `SecurityConfig` matchers)

| Endpoint | Behavior |
|---|---|
| `POST /api/admin/epins` | Body gains optional `expiresAt` (must be in the future, else 400). `count` unchanged. Writes `GENERATED` events. |
| `GET /api/admin/epins` | Adds filters `allocatedTo` and `expired` (boolean). `status` accepts `ALLOCATED`, `BLOCKED`. |
| `POST /api/admin/epins/allocate` | Body `{associateId, count, batchId?}`. Takes the oldest `UNUSED`, non-expired pins (by `generated_at`, then `id`), optionally within a batch, under a row lock. Sets `ALLOCATED`, `allocated_*`. 409 `EPinInsufficientPoolException` if fewer than `count` available. Returns ids and codes. `associateId` must exist and be `ACTIVE` (404 / 409). |
| `POST /api/admin/epins/{id}/block`, `/unblock` | Block body `{reason}`. 409 if `USED`. Writes `BLOCKED` / `UNBLOCKED` events. |
| `POST /api/admin/epins/{id}/redeem` | Now accepts `UNUSED` or `ALLOCATED`. 409 if `BLOCKED` or expired. For `ACTIVATION`, target must be `PENDING` (else 409 `AssociateAlreadyActiveException`) and is flipped to `ACTIVE`. `TOPUP` has no target-status requirement. Writes a `REDEEMED` event. |
| `GET /api/admin/epins/{id}/events` | Event list, oldest first. |

### Associate (write endpoints need explicit `.authenticated()` matchers like `SecurityConfig` lines 77-128; the blanket write rule is ADMIN-only)

| Endpoint | Behavior |
|---|---|
| `GET /api/associates/me/epins` | Pins where `allocatedTo`, `redeemedTo` or `redeemedBy` equals the caller (from `@AuthenticationPrincipal`). Optional `status` filter. `page`/`size` clamped 0-100. |
| `POST /api/associates/me/epins/{id}/redeem` | Body `{userId}` (the human Associate ID). `ACTIVATION` only (no type field). Pin must be `ALLOCATED` to the caller, unexpired, unblocked. Target must exist (404), be in the caller's downline (`AssociateRepository.isInDownline`, recursive CTE modeled on `countDownline`) and be `PENDING` (409). A pin not held by the caller returns 404 (`EPinNotOwnedException`), not 403. |
| `POST /api/associates/me/epins/{id}/transfer` | Body `{toUserId}`. Pin must be `ALLOCATED` to the caller, unexpired, unblocked. Recipient must exist (404), be `ACTIVE`, and not be the caller. Sets `allocated_to`, writes `TRANSFERRED`. |

Associates never see UUIDs, so associate-facing bodies use `Associate.userId` (resolved via `AssociateRepository.findByUserId`). Admin endpoints keep UUID `associateId`; the admin UI resolves a `userId` through the existing `GET /api/admin/associates?search=`.

### Concurrency

Redeem, transfer, allocate and block load the pin with `@Lock(PESSIMISTIC_WRITE)`. Two simultaneous redeems or transfers of the same pin produce one success and one 409/404.

### New exceptions

`EPinExpiredException` (409), `EPinBlockedException` (409), `EPinNotOwnedException` (404), `EPinInsufficientPoolException` (409), `AssociateAlreadyActiveException` (409). Mapped in `EPinExceptionHandler`.

## Frontend

### Admin: `/settings/e-pin-register`

- Route under `settings` children with `sectionKey: 'epinRegister'`; entry in `admin-nav-categories.model.ts` beside `ledgerRegister`.
- Files under `frontend/src/app/admin/epin-register/`: `epin-register.component.ts`, `epin-register.service.ts`, specs. Mirrors `admin/ledger-register/`.
- Filter bar: status, batch ID, holder / redeemed-to, expired-only toggle.
- Table: code, status chip (derived "Expired"), batch, expires, holder, redeemed-to, row actions.
- Row actions: Block (inline reason) / Unblock, Redeem (associate lookup + type), Events (side panel).
- Header actions: Generate batch (count, optional expiry; result panel shows codes once with copy-all) and Allocate (associate lookup, count, optional batch).
- Associate lookup control: type a `userId` or name, pick from directory search results. Reused by Allocate and Redeem.

### Associate: `/e-pins`

- Route guarded by `authGuard, associateOnlyGuard`. New `ASSOCIATE_NAV_ITEMS` entry after `plotBookings` (`key: 'epins'`, icon `confirmation_number`).
- Files under `frontend/src/app/epins/`, mirroring `payout-history/`.
- Views: **Available** (`ALLOCATED` to me, unexpired) with Activate member and Transfer actions, each a small form with a `userId` field; **History** (used, transferred-out, expired, blocked), read-only.
- Summary strip: counts of available, used, expiring within 7 days. Expiry badge "Expires in N days"; expired rows grey out actions.
- 404 / 409 / 403 map to inline messages. Strings under `epins.*` in `en.json`.
- Dashboard banner for `PENDING` associates.
- No new visual design; reuse ledger-register and payout-history styles.

## Error handling

| Exception | HTTP | Trigger |
|---|---|---|
| `EPinNotFoundException` | 404 | id does not resolve (admin) |
| `EPinNotOwnedException` | 404 | associate acts on a pin not allocated to them |
| `AssociateNotFoundException` | 404 | `associateId` / `userId` / `toUserId` does not resolve |
| `EPinAlreadyRedeemedException` | 409 | pin already `USED` |
| `EPinExpiredException` | 409 | redeem/transfer of an expired pin |
| `EPinBlockedException` | 409 | redeem/transfer/allocate of a `BLOCKED` pin |
| `EPinInsufficientPoolException` | 409 | allocate `count` exceeds available pool |
| `AssociateAlreadyActiveException` | 409 | `ACTIVATION` redeem for a non-`PENDING` target |
| Bean validation | 400 | `count` range, `expiresAt` in the past, missing required fields |

## Testing

- **Service:** every transition, and every rejected path leaves the row unchanged. Expiry boundary (`expires_at == now` is expired) via injected `Clock`. Unblock restores the correct prior status. Non-holder redeem/transfer yields not-owned.
- **Concurrency:** two simultaneous redeems of one pin yield exactly one success; same for transfers; two allocations competing for the last pins never double-allocate.
- **Controller (MockMvc + real JWT):** status codes per the tables above. Associate token gets 403 on `/api/admin/epins*`. Associate A cannot redeem or transfer associate B's pin (404). Redeem target outside the caller's downline is rejected.
- **`SecurityConfigTest`:** new admin matchers, explicit `.authenticated()` for associate writes.
- **Migration:** backfill leaves existing associates `ACTIVE`; CHECK constraints accept new values.
- **Existing tests:** `EPinServiceTest` / `EPinControllerTest` cases that redeem `ACTIVATION` for an `ACTIVE` associate are updated (now a 409 by design).
- **Frontend:** component and service specs per screen. Playwright e2e stays deferred until all setup-onboarding phases land.

## Unit slicing

Continues the numbering of `docs/superpowers/plans/2026-08-03-epin-units.md`; this list replaces its pending units 5-7.

| # | Unit | Type | Depends on |
|---|---|---|---|
| 5 | Schema and entity: widen `epin` status CHECK, add `expires_at` / `allocated_*` / `blocked_*`, create `epin_event`, add `AssociateStatus.PENDING` (backfill `ACTIVE`). Generation and redeem write `GENERATED` / `REDEEMED` events. | backend | 1-4 |
| 6 | Expiry: `expiresAt` on batch create, redeem rejects expired, register `expired` filter | backend | 5 |
| 7 | Block / unblock and `GET /api/admin/epins/{id}/events` | backend | 5 |
| 8 | Admin allocate with row locking, `allocatedTo` register filter | backend | 5 |
| 9 | `PENDING` lifecycle: creation defaults `PENDING`, `ACTIVATION` redeem requires `PENDING` and flips to `ACTIVE`, withdrawal guard extended. Updates conflicting tests from units 3-4. | backend | 5 |
| 10 | Associate view `GET /api/associates/me/epins` | backend | 8 |
| 11 | Associate self-redeem (`isInDownline`, `userId` lookup, 404 on foreign pins) | backend | 8, 9 |
| 12 | Associate transfer | backend | 8 |
| 13 | Admin "e-Pin Register" screen | screen | 6, 7, 8, 9 |
| 14 | Associate "My e-Pins" screen and `PENDING` dashboard banner (exposes `status` on profile response) | screen | 9, 10, 11, 12 |

Units 6, 7, 8 and 9 are mutually independent once 5 lands. Unit 5 goes first because the `epin` and `associate` status CHECK constraints change in one migration.

## Open items to confirm at planning time

- Whether the profile response already exposes associate `status` (needed for the `PENDING` banner), else unit 14 adds it.
- Exact current location of the associate-creation default status (`Associate.java:29` sets `ACTIVE`; creation path in `AdminAssociateService` or `CreateAssociateRequest` handling) when unit 9 flips it to `PENDING`.
