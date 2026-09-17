# e-PIN — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-09-17. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

No ADRs or glossary file exist for this spec; sliced from the spec doc alone. The spec has no dedicated "Screens" section — the two screen units below are derived from the Context section's PRD references (`land-mlm-platform-prd.md` §5.1 item 4, associate-facing "e-PIN management — activation/top-up codes"; §5.2 item 9, admin "e-PIN generation/allocation"), the same way `docs/superpowers/plans/2026-08-03-income-ledger-units.md` derived its screens from Context-quoted PRD prose rather than a formal screens list. Per the spec-cycle-orchestrator convention, "Admin register" and "Redeem" (and "Generate a batch") are one Admin-facing page — the PRD names them as a single capability ("e-PIN generation/allocation," §5.2 item 9) and an Admin cannot redeem a PIN without first seeing it in the register — so they get one screen unit, not three, mirroring how `2026-08-03-sales-units.md` unit 8 combined list/record/void into one "Sales Register" screen.

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| Unit # | Title | Type | Depends on | Status | Plan file path | Merged commit range |
|---|---|---|---|---|---|---|
| 1 | Admin generates a batch of e-PIN codes — `POST /api/admin/epins` | backend | none | merged | `2026-08-03-epin-unit-1-generate-batch.md` | `8b9563f..7e16add` |
| 2 | Admin views a paginated, filterable e-PIN issuance/redemption register — `GET /api/admin/epins` | backend | 1 | merged | `2026-08-03-epin-unit-2-admin-register.md` | `3c9f4d3..e19e2c9` |
| 3 | Redeeming a nonexistent/already-redeemed e-PIN, or for an unknown associate, is rejected with no side effects | backend | 1 | merged | `2026-08-03-epin-unit-3-redeem-guards.md` | `7e59309..fb3d784` |
| 4 | Redeeming a valid, unused e-PIN on an associate's behalf marks it used and records redemption details | backend | 1, 3 | planned | `2026-08-03-epin-unit-4-redeem-happy-path.md` | |
| 5 | Associate views their own e-PIN/redemption history, read-only — `GET /api/associates/me/epins` | backend | 1, 4 | pending | | |
| 6 | Admin "e-PIN Generation & Allocation" screen — generate batch (1), register list/filter (2), redeem on an associate's behalf (3, 4) | screen | 1, 2, 3, 4 | pending | | |
| 7 | Associate "My e-PINs" screen — own PIN/redemption history, view-only | screen | 5 | pending | | |

**Dependency order:**

```
1 (generate batch) ─┬─→ 2 (admin register)
                     └─→ 3 (redeem: guards) ─→ 4 (redeem: happy path) ─→ 5 (associate own view)

2, 3, 4 ─────────────────────────────────────────────────────────────→ 6 (admin screen)
5 ────────────────────────────────────────────────────────────────────→ 7 (associate screen)
```

Units 2 and 3 are mutually independent once 1 is built — order between them doesn't matter.

## Unit detail

### 1. Admin generates a batch of e-PIN codes — `POST /api/admin/epins`

**Depends on:** none
**Refs:** Scope; Decisions 1, 2, 3, 4, 9, 11, 12; Data model; Flows "Generate a batch"; Error handling; Testing

Acceptance criteria:
- ADMIN-authenticated `POST /api/admin/epins` with body `CreateEPinBatchRequest(count)` generates `count` new `EPin` rows sharing one `batchId` (`UUID.randomUUID()`), each `status = UNUSED`, `generatedBy = actorId`, `generatedAt = now()` (Flows "Generate a batch").
- Each code is produced by a new `EPinCodeGenerator` (`SecureRandom`, 12 random bytes, `Base64.getUrlEncoder().withoutPadding()`, copying `TemporaryPasswordGenerator`'s pattern rather than reusing its class — Decision 2), retried on an `EPinRepository.existsByCode` collision (Decision 3).
- Response is `EPinBatchResponse(batchId, count, codes, generatedAt)`, 201 (Flows).
- `count` is validated `@Min(1) @Max(2000)`; an out-of-range value returns 400 via bean validation with no rows created — not silently clamped (Decision 9; Error handling table).
- New `epin` table (migration) matches the Data model column set exactly: `id`, `code` (unique), `batch_id` (indexed), `status`, `generated_by`/`generated_at`, `redeemed_to`/`redeemed_by`/`redeemed_at` (nullable), `redemption_type` (nullable), `linked_entity_id` (nullable, no FK) — Data model.
- The DB-level unique constraint on `code` rejects a duplicate insert (Testing, `EPinRepositoryTest`).
- Associate-role token calling this endpoint gets 403; unauthenticated gets 401 (Decision 12; Testing, `SecurityConfigTest`).
- No `activation_fee_paid` field or any other change lands on the `associate` table (Decision 8, Resolved decisions #2).

### 2. Admin views a paginated, filterable e-PIN issuance/redemption register — `GET /api/admin/epins`

**Depends on:** 1 — needs the `EPin` entity/repository and generated rows to list.
**Refs:** Decisions 4, 11, 12, 13; Flows "Admin register"; Error handling; Testing

Acceptance criteria:
- ADMIN-authenticated `GET /api/admin/epins` returns `EPinPageResponse(epins, page, size, totalElements)`, matching `AdminAssociatePageResponse`'s shape (Flows "Admin register").
- Optional filters `status` (`UNUSED`/`USED`), `redeemedTo` (associate id), `batchId` are combinable, via the same derived-query pattern `AdminAssociateService` already uses (Decision 4/Flows).
- `page`/`size` clamped 0–100 (Decision 13).
- Filtering by `status = UNUSED` shows outstanding issued-but-unredeemed inventory; filtering by `redeemedTo` shows one associate's redemption history from the admin side — this is the issuance-vs-redemption reconciliation the PRD's §7.2 flow step 3 describes (Flows).
- Associate-role token gets 403; unauthenticated gets 401 (Decision 12; Testing).

### 3. Redeeming a nonexistent/already-redeemed e-PIN, or for an unknown associate, is rejected with no side effects

**Depends on:** 1 — needs `EPin` rows (and the existing `Associate`/`AssociateNotFoundException`) to redeem against.
**Refs:** Flows "Redeem" steps 1–3; Data model (`CreateEPinBatchRequest`/`RedeemEPinRequest`, `EPinNotFoundException`, `EPinAlreadyRedeemedException`); Error handling table; Testing

Acceptance criteria:
- `POST /api/admin/epins/{id}/redeem` with an `id` that doesn't resolve to an `EPin` returns 404 `EPinNotFoundException`, with no `EPin` or `Associate` row changed (Flows step 1; Error handling).
- Redeeming an `EPin` whose `status` is already `USED` returns 409 `EPinAlreadyRedeemedException`, with no row changed (Flows step 2; Error handling).
- Redeeming with an `associateId` that doesn't resolve to an `Associate` returns 404 `AssociateNotFoundException` (existing, reused — not a new exception type), with no row changed (Flows step 3; Error handling).
- `@NotNull` violations on `associateId`/`redemptionType` in `RedeemEPinRequest` return 400 (Error handling table).
- Associate-role token gets 403; unauthenticated gets 401 (Decision 12).

### 4. Redeeming a valid, unused e-PIN on an associate's behalf marks it used and records redemption details

**Depends on:** 1, 3 — extends the same redeem path whose guard/rejection branches unit 3 already covers.
**Refs:** Decisions 5, 6, 7, 8; Flows "Redeem" steps 4–5; Testing

Acceptance criteria:
- For an `UNUSED` `EPin` with a resolvable `associateId`, redeeming sets `status = USED`, `redeemedTo = associateId`, `redeemedBy = actorId`, `redeemedAt = now()`, `redemptionType`, `linkedEntityId`; saves; returns `EPinResponse`, 200 (Flows steps 4–5).
- `redemptionType` accepts exactly `ACTIVATION` or `TOPUP` — a closed enum, not free text (Decision 6).
- `linkedEntityId` is accepted as optional/nullable with no FK constraint enforced (Decision 7); for `ACTIVATION` it is expected to stay `null` since `redeemedTo` already identifies the associate.
- No side effect on the `Associate` row regardless of `redemptionType` — `activation_fee_paid` is not touched because it does not exist on the entity (Decision 8, Resolved decisions #2).
- Generation and redemption remain the only two lifecycle events — no "allocated but not yet redeemed" intermediate state exists (Decision 5).

### 5. Associate views their own e-PIN/redemption history, read-only — `GET /api/associates/me/epins`

**Depends on:** 1, 4 — the entity/field exist from unit 1, but a meaningful own-history view needs real `redeemedTo` data, which only unit 4's redeem happy path produces (mirrors how `2026-08-03-sales-units.md` unit 7, associate own view, depends on the record-sale happy path rather than only the guards).
**Refs:** Decision 14; Flows "Associate own view"; Error handling (401); Testing (`AssociateEPinControllerTest`)

Acceptance criteria:
- Authenticated `GET /api/associates/me/epins` returns only rows where `redeemedTo` equals the caller's own associate id, taken from `@AuthenticationPrincipal`, never a path/query param (Flows).
- Response never includes another associate's rows, even a downline associate's — self only, no descendant subtree, unlike the Sales spec's associate view (Decision 14).
- Paginated (`page`/`size` clamped 0–100), returns `EPinPageResponse` (Flows).
- Any authenticated associate token can reach it — no ADMIN restriction, falls through to `anyRequest().authenticated()` (Decision 12).
- Unauthenticated request gets 401.

### 6. Admin "e-PIN Generation & Allocation" screen

**Depends on:** 1, 2, 3, 4
**Refs:** Context (`land-mlm-platform-prd.md` §5.2 item 9, admin "e-PIN generation/allocation"); Flows "Generate a batch", "Admin register", "Redeem"

Acceptance criteria:
- Screen lets an Admin generate a new batch of N codes (unit 1) and see the returned `batchId`/codes.
- Screen lists and filters the issuance/redemption register by `status`/`redeemedTo`/`batchId`, paginated (unit 2).
- Screen lets an Admin redeem a listed, `UNUSED` e-PIN on an associate's behalf — choosing `associateId` + `redemptionType` (`ACTIVATION`/`TOPUP`) + optional `linkedEntityId` — and surfaces both the 404/409 guard outcomes (unit 3) and the happy-path result (unit 4).
- One screen, not three or four — the PRD names generation and allocation as a single admin capability (§5.2 item 9), and an Admin cannot pick a PIN to redeem without first seeing it in the register, so list/generate/redeem belong together (same shape as Sales' single Admin "Sales Register" screen).
- No export/reporting affordance beyond the register itself — a dedicated finance export is explicitly out of scope (Scope's Out-of-scope section).

### 7. Associate "My e-PINs" screen

**Depends on:** 5
**Refs:** Context (`land-mlm-platform-prd.md` §5.1 item 4, associate-facing "e-PIN management — activation/top-up codes"); Flows "Associate own view"

Acceptance criteria:
- Screen lists the caller's own e-PIN/redemption history (unit 5), paginated.
- View-only — no generate/redeem affordance on this screen; those remain Admin-only actions per Decision 12 and the Context's "Associate write scope, generally" resolution (an Associate never self-generates or self-redeems).

## Excluded — not a unit

- **Plot top-up redemption mechanics** (what a `TOPUP` redemption actually does to a plot/booking/EMI schedule) — explicitly out of scope; belongs to a future booking/EMI spec (Scope's Out-of-scope section).
- **Revenue/financial reporting beyond the basic issuance-vs-redemption register** (e.g. a CSV/TDS-style export) — explicitly deferred to a future Reports & Exports spec (Scope's Out-of-scope section).
- **`activation_fee_paid` on `Associate`** — confirmed deliberately not built, not even write-only (Decision 8; Resolved decisions #2). Not a unit, not an acceptance criterion.
- **A standalone "code generator" or "repository query" unit** — `EPinCodeGenerator` and `EPinRepository.existsByCode`/filter queries are layer-shaped, not independent observable outcomes; they're built as part of unit 1 and reused unmodified by later units.
- **A separate "batch" entity/screen** — Decision 4 explicitly declines an `EPinBatch` table; `batchId` is just a grouping column on `EPin`, already covered by units 1/2.

## File overlap check against other approved/in-flight units (done at slice time)

No `epin` package exists yet anywhere in the tree (confirmed in the spec's own Context section) — every file this spec touches is net-new (`com.plotchain.epin.*`, one new migration for the `epin` table). The only cross-package reads are `AssociateRepository`/`Associate` lookups (existing, read-only, reusing `AssociateNotFoundException`) for `generatedBy`/`redeemedBy`/`redeemedTo` FK resolution — no edit collision with the `associate`, `income`, `wallet`, `cycle`, or `sales` packages, and no changes to the `associate` table (Decision 8).
