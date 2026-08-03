# e-PIN Domain (Batch Generation, Redemption, Reconciliation Register)

## Context

No `epin` package exists anywhere in the codebase today — the reconciliation audit in `docs/superpowers/specs/2026-08-03-role-capability-data-visibility-design.md` found "No entity, no package, nothing — full stop" for e-PIN. This spec designs it.

Grounding docs: `land-mlm-platform-prd.md` §5.1 item 4 (associate-facing "e-PIN management — activation/top-up codes"), §5.2 item 9 (admin "e-PIN generation/allocation"), §6 (`EPin` entity sketch: `id, code, status [unused/used], issued_to, issued_by, issued_at, used_at`), §7.2 ("e-PIN flow": (1) Admin or upline generates a batch of e-PINs; (2) PIN used at associate activation or plot top-up time, on redemption marked used, linked to the transaction it unlocked; (3) reporting: issuance vs redemption reconciliation for revenue tracing).

Role model: per `2026-08-03-role-capability-data-visibility-design.md`'s matrix and its "Associate write scope, generally" resolved decision, an Associate never self-generates or self-redeems an e-PIN — every associate-initiated action beyond editing their own profile is something Admin does on the associate's behalf, e-PIN redemption included. This is already decided; this spec only designs *how* Admin generates/redeems and what an Associate can view. It also directly answers the PRD's own §9 open question #2 ("Can associates self-generate e-PINs...?") — no, always admin-issued/redeemed on the associate's behalf, per the resolution above. Not reopened here.

Sibling precedent: `docs/superpowers/specs/2026-08-03-sales-domain-design.md` is the closest already-brainstormed domain (same "Admin acts on an associate's behalf, associate gets a read-only view" shape, same `/api/admin/*` + `/api/associates/me/*` endpoint split). This spec follows its structure and conventions throughout.

Investigated and confirmed before writing this spec: `backend/src/main/java/com/plotchain/associate/Associate.java` has no `activation_fee_paid` field — `mlm-land-platform-spec.md` §2.1's Associate sketch listed one, but it was never implemented (same "sketch vs. shipped" gap the Sales spec found for `pan_number`). A repo-wide grep for "activation" across `backend/src/main/java` turns up nothing besides this gap — no other code currently gates any behavior on activation status. `docs/superpowers/plans/2026-08-03-role-model-collapse.md` (which deletes `AdminController`, collapses `AssociateRole` to `ADMIN`/`ASSOCIATE`, and moves `SecurityConfig` to plain `hasAuthority("ADMIN")`) has not been executed yet — `AdminController` and the four sub-roles still exist in the tree today — but per this task's brief and matching how the Sales spec was already written, this spec designs against the *collapsed* two-role model (`hasAuthority("ADMIN")`), not the current admin-family state. Implementation of this spec should either land after that plan executes, or include the equivalent narrowing itself.

## Scope

**In scope**: Admin generates a batch of N e-PIN codes; Admin views a paginated, filterable issuance/redemption register (the reconciliation reporting the PRD's flow step 3 describes); Admin redeems a PIN on an associate's behalf, recording what it unlocked; an Associate views their own PIN/redemption history, read-only.

**Out of scope** (deferred, not designed here):
- **Plot top-up redemption mechanics** — what a "top-up" actually does to a plot/booking/EMI schedule. That's tangled up with the booking/EMI domain, which doesn't exist yet (per the Sales spec, `PlotBooking`/`EMISchedule` are "not built"). This spec designs the e-PIN side generically — a redemption records *that* it unlocked something and optionally a pointer to it — without inventing top-up mechanics that belong to a future booking spec.
- **Revenue/financial reporting beyond the basic issuance-vs-redemption register** — a dedicated finance export (e.g. CSV, TDS-style summary) is a future addition once Reports & Exports (PRD §5.2 item 14, not built) gets its own spec.

## Decisions

1. **New package `com.plotchain.epin`**, sibling to `income`/`wallet`/`announcement`/(the not-yet-created) `sale` — each domain owns its own package in this codebase; e-PIN gets one too rather than living inside `associate`.

2. **Code generation reuses the established pattern, not the class.** `TemporaryPasswordGenerator` (`backend/src/main/java/com/plotchain/associate/TemporaryPasswordGenerator.java`) is scoped to associate login passwords and lives in the `associate` package — reusing it directly for e-PIN codes would be a cross-domain reach for a coincidence of implementation, not a real shared concept. Instead, `EPinCodeGenerator` (new, in `com.plotchain.epin`) copies its exact pattern: `SecureRandom`, 12 random bytes, `Base64.getUrlEncoder().withoutPadding()`. No special "PIN-like" numeric format: because redemption is always Admin-driven (Decision in Context above), no human ever types this code by hand, so URL-safe-Base64 readability is not a real requirement — the same reasoning that already justifies `TemporaryPasswordGenerator`'s format for temporary passwords.

3. **Uniqueness**: `code` has a DB unique constraint, and `EPinService`'s generation loop defensively retries on collision via `EPinRepository.existsByCode(String)` — mirrors `AssociateIdGenerator`'s defensive re-check even though a 12-byte random value's collision odds are astronomically low.

4. **No separate `EPinBatch` entity.** `batchId` (a `UUID` stamped onto every `EPin` row generated together) is enough to group and filter a generation batch. The PRD's entity sketch has no batch-level metadata (no batch name, no batch status) — inventing a table for a concept the source material doesn't ask for would be scope creep. `POST /api/admin/epins`'s request body is just `{ count }`.

5. **Allocation and redemption are a single atomic action** — there is no "issued to an associate but not yet used" intermediate state. The PRD's own flow (§7.2 step 2: "PIN used at associate activation or plot top-up time; on redemption, marked used, linked to the transaction it unlocked") describes generation and redemption as the only two events, with nothing in between. Splitting a separate "allocate to X" step out from "redeem for X" would invent a state the source material never asks for, and nothing in scope needs to distinguish "reserved for Bob but not yet applied" from "applied for Bob." Because of this, the PRD sketch's `issued_to`/`issued_by`/`issued_at` fields are renamed on the real entity to reflect what actually happens at each point in time: `generatedBy`/`generatedAt` (set at batch generation — who created this code and when) and `redeemedTo`/`redeemedBy`/`redeemedAt` (set at redemption — which associate it was applied for, which Admin applied it, and when).

6. **`redemptionType` is a closed enum (`ACTIVATION`, `TOPUP`), not free text.** This codebase consistently models small, known-in-advance classification fields as enums (`IncomeType`, `LedgerEntryStatus`, `AssociateStatus`, the Sales spec's `SaleStatus`), never as an unconstrained string. The PRD names exactly these two redemption occasions ("used at associate activation or plot top-up time") — nothing suggests a third is coming, and a closed set is easy to widen later with a migration if one does.

7. **`linkedEntityId` is a nullable `UUID` with no FK constraint** — same shape as the Sales spec's `LedgerEntry.source_ref` column, which exists precisely because a single generic reference column needs to point at different tables depending on context (there, different income types; here, different redemption types). For `TOPUP`, it will eventually reference a booking/EMI-schedule row once that domain is built (out of scope here, see above) — until then it's simply unpopulated. For `ACTIVATION`, it stays `null`: `redeemedTo` already identifies which associate was activated, so there's no second entity to point at.

8. **`activation_fee_paid` is added to `Associate`** via a small additive migration (`ALTER TABLE associate ADD COLUMN activation_fee_paid BOOLEAN NOT NULL DEFAULT false`) plus the matching entity field/getter/setter. Confirmed missing from the real entity (see Context). Without this field, `ACTIVATION`-type redemption would have nothing to flip on the associate it targets, making the PRD's "activation" framing vacuous — the PRD explicitly frames the ₹1,100 activation fee as a real gate (`mlm-land-platform-spec.md` §2.1), so an e-PIN that "activates" an associate should leave a mark. `EPinService`'s redeem flow sets `associate.activationFeePaid = true` as a side effect when `redemptionType == ACTIVATION`. **This flag is advisory only for now** — confirmed via repo-wide grep that nothing else currently reads or gates on activation status (no `AssociateStatus.PENDING_ACTIVATION`, no compensation/payout check). It becomes load-bearing once a future spec (KYC, dashboard, or a sales/withdrawal eligibility gate) decides to consult it — flagged again in Open Questions.

9. **Batch count is validated, not silently clamped.** `CreateEPinBatchRequest.count` is `@Min(1) @Max(500)`, rejected with 400 on violation via the same `@Valid`-driven bean-validation path `CreateAssociateRequest` already uses — unlike the `page`/`size` pagination params elsewhere in this codebase, which are silently clamped (`Math.min`/`Math.max`) because clamping them only affects how much of a list renders. Silently generating fewer activation codes than an Admin explicitly asked for is a different kind of surprise — a real under-provisioning bug with downstream consequences (a sales team short PINs) — so an out-of-range count is rejected outright instead. 500 is a placeholder ceiling with no PRD-stated basis; flagged in Open Questions.

10. **Redemption's path parameter is the e-PIN's `id` (UUID), not its `code`.** `POST /api/admin/epins/{id}/redeem` matches the `{id}/suspend`, `{id}/reactivate`, `{id}/reset-password` (`AdminAssociateController`) and `{associateId}/decision` (`KycReviewController`) convention every other admin action-on-a-resource endpoint in this codebase already uses. It also keeps a still-live, unredeemed code out of URLs and access logs — the Admin register (`GET /api/admin/epins`) already returns each row's `id`, so the redeeming Admin never needs to type the raw code into a path segment.

11. **Endpoint naming**: `/api/admin/epins` (plural, matching `/api/admin/associates`, `/api/admin/sales`, `/api/admin/kyc` — back-office operational screens, as opposed to `/api/company/*` setup-wizard configuration) and `/api/associates/me/epins` (matching `/api/associates/me/sales`, `/api/associates/me/tree`, `/api/associates/me/profile`).

12. **Authorization assumes the collapsed two-role model** (per Context): `POST/GET /api/admin/epins*` require `hasAuthority("ADMIN")`, both via the blanket write rule (for the `POST`s) and an explicit `SecurityConfig` `GET` matcher (for the register list), matching `/api/admin/kyc`'s existing matcher shape. `GET /api/associates/me/epins` needs no new matcher — it falls through to the generic `anyRequest().authenticated()`, self-scoped by construction (associate ID from the JWT, never a path/query param), same as `/api/associates/me/sales`, `/api/associates/me/tree`, `/api/associates/me/profile`.

13. **Pagination**: `GET /api/admin/epins` and `GET /api/associates/me/epins` both clamp `page`/`size` (`page = Math.max(page, 0)`, `size = Math.min(size, 100)`), matching `AdminAssociateController`/`KycReviewController`.

14. **Associate's own view is scoped to `redeemedTo = self` only — no descendant subtree.** This differs from the Sales spec's associate view (self + full downline, for team-volume reporting). The matrix's e-PIN row says "Own PIN/activation status" with no team framing anywhere in the PRD, so team-scoping would be invented, not derived.

## Data model

**Migration** (new): `epin` table.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `code` | VARCHAR(24) NOT NULL, UNIQUE | Base64-URL, no padding, 12 random bytes |
| `batch_id` | UUID NOT NULL, indexed | groups codes generated together; no separate batch table (Decision 4) |
| `status` | VARCHAR NOT NULL | `UNUSED` / `USED` |
| `generated_by` | UUID NOT NULL, FK → `associate(id)` | the Admin who generated the batch |
| `generated_at` | TIMESTAMP NOT NULL | |
| `redeemed_to` | UUID NULL, FK → `associate(id)` | set at redemption only (Decision 5) |
| `redeemed_by` | UUID NULL, FK → `associate(id)` | the Admin who performed the redemption |
| `redeemed_at` | TIMESTAMP NULL | |
| `redemption_type` | VARCHAR NULL | `ACTIVATION` / `TOPUP`, set at redemption |
| `linked_entity_id` | UUID NULL, no FK | generic pointer, see Decision 7 |

**Migration** (same file): `ALTER TABLE associate ADD COLUMN activation_fee_paid BOOLEAN NOT NULL DEFAULT false;` (Decision 8).

**New Java types**: `EPin` (entity), `EPinStatus` (`UNUSED`, `USED`), `RedemptionType` (`ACTIVATION`, `TOPUP`), `EPinRepository`, `EPinCodeGenerator`, `EPinService`, `EPinController` (`/api/admin/epins`), `AssociateEPinController` (`/api/associates/me/epins`, mirroring `AssociateTreeController`'s and `AssociateProfileController`'s "one small controller per `/api/associates/me/*` route" shape), `CreateEPinBatchRequest`/`EPinBatchResponse`/`EPinResponse`/`EPinPageResponse`/`RedeemEPinRequest` records, `EPinNotFoundException`, `EPinAlreadyRedeemedException`.

## Flows

### Generate a batch — `POST /api/admin/epins`, ADMIN-only

Body: `CreateEPinBatchRequest(int count)`, `count` validated `@Min(1) @Max(500)` (Decision 9).

1. `batchId = UUID.randomUUID()`.
2. Loop `count` times: generate a code via `EPinCodeGenerator.generate()`, retry on `EPinRepository.existsByCode` collision (Decision 3), create and save an `EPin` (`id = UUID.randomUUID()`, `code`, `batchId`, `status = UNUSED`, `generatedBy = actorId`, `generatedAt = now()`).
3. Return `EPinBatchResponse(batchId, count, codes: List<String>, generatedAt)` — 201.

### Admin register — `GET /api/admin/epins`, ADMIN-only

Paginated, same shape as `AdminAssociateController.list()`: optional filters `status` (`UNUSED`/`USED`), `redeemedTo` (associate ID), `batchId`, `page`/`size` (clamped 0–100). Combinable filters via the same derived-query pattern `AdminAssociateService` already uses. This is the issuance-vs-redemption reconciliation the PRD's flow step 3 describes — filtering by `status = UNUSED` shows outstanding issued-but-unredeemed inventory; filtering by `redeemedTo` shows one associate's redemption history from the admin side.

Returns `EPinPageResponse(List<EPinResponse> epins, int page, int size, long totalElements)` (matching `AdminAssociatePageResponse`'s exact field shape).

### Redeem — `POST /api/admin/epins/{id}/redeem`, ADMIN-only

Body: `RedeemEPinRequest(@NotNull UUID associateId, @NotNull RedemptionType redemptionType, UUID linkedEntityId)` (`linkedEntityId` optional/nullable — see Decision 7).

1. Look up `EPin` by `id` → 404 `EPinNotFoundException` if missing.
2. `status == USED` → 409 `EPinAlreadyRedeemedException`.
3. Look up `Associate` by `associateId` → 404 `AssociateNotFoundException` (existing, reused) if missing.
4. Set `status = USED`, `redeemedTo = associateId`, `redeemedBy = actorId`, `redeemedAt = now()`, `redemptionType`, `linkedEntityId`; save.
5. If `redemptionType == ACTIVATION`: set `associate.activationFeePaid = true`, save the associate (Decision 8).
6. Return `EPinResponse` — 200.

### Associate own view — `GET /api/associates/me/epins`, any authenticated associate

Filters `EPinRepository` by `redeemedTo = associateId` (from `@AuthenticationPrincipal`, never a path param — same self-scoping pattern as `DashboardController`/`AssociateProfileController`/`AssociateTreeController`). Paginated (`page`/`size` clamped 0–100), view-only. Returns `EPinPageResponse`.

## Error handling

| Exception | HTTP | Trigger |
|---|---|---|
| `EPinNotFoundException` (new) | 404 | `id` doesn't resolve on redeem |
| `EPinAlreadyRedeemedException` (new) | 409 | redeeming an e-PIN whose `status` is already `USED` |
| `AssociateNotFoundException` (existing) | 404 | `associateId` in the redeem request doesn't resolve |
| Bean validation (`@Min(1)`/`@Max(500)` on `count`, `@NotNull` on `associateId`/`redemptionType`) | 400 | batch count out of range, or a required redeem field missing |

## Testing

- `EPinCodeGeneratorTest` (mirrors `TemporaryPasswordGeneratorTest`'s two cases): generates a non-blank code; two successive calls never produce the same code.
- `EPinServiceTest`: generating a batch of N produces N rows all sharing one `batchId`, each `status = UNUSED`; a forced `existsByCode` collision on the first attempt still produces a valid, unique code on retry; redeeming an `UNUSED` PIN flips it to `USED` with `redeemedTo`/`redeemedBy`/`redeemedAt`/`redemptionType` all set; redeeming with `redemptionType = ACTIVATION` also flips `associate.activationFeePaid` to `true`; redeeming with `redemptionType = TOPUP` leaves `activationFeePaid` untouched; redeeming an already-`USED` PIN throws `EPinAlreadyRedeemedException`; redeeming with a non-existent `associateId` throws `AssociateNotFoundException`.
- `EPinControllerTest` (MockMvc + real JWT, mirroring `KycReviewControllerTest`'s/the Sales spec's `SaleControllerTest`'s shape): 201 on batch generation with the requested `count` of codes returned; 400 when `count` is 0 or over 500; 200 + register filtering by `status`/`redeemedTo`/`batchId` on list; 200 + correct redemption fields on redeem; 409 on double-redeem; 404 on redeeming a nonexistent `id`.
- `AssociateEPinControllerTest`: an associate token only ever sees rows where `redeemedTo` equals their own ID, never another associate's.
- `SecurityConfigTest` additions: `POST`/`GET /api/admin/epins*` are ADMIN-only (associate token → 403); `GET /api/associates/me/epins` is reachable by an associate token.
- `EPinRepositoryTest`: the DB-level unique constraint on `code` rejects a duplicate insert.

## Open questions

1. **500-code batch ceiling (Decision 9) is a placeholder, not a business number.** Nothing in the PRD or the existing spec set states a real maximum batch size — needs a business decision before this ships, not just before it's exercised at scale.
2. **`activation_fee_paid` (Decision 8) is written but not yet read anywhere.** Once a future spec touches KYC status gating, dashboard "activation status," or a sales/withdrawal eligibility check, it should decide whether and how that flag participates — this spec only guarantees the field exists and gets set correctly at `ACTIVATION` redemption.
3. **No code expiry/TTL concept.** The PRD's entity sketch and flow never mention an e-PIN expiring unused — this spec doesn't add one. If the business wants issued-but-unredeemed codes to go stale after N days, that's a new field (`expiresAt`) and a new failure mode (redeeming an expired code) for a future revision, not assumed here.
4. **Code visibility/masking is unresolved.** This spec returns the full `code` in both the admin register and the associate's own view indefinitely (no masking after redemption). The PRD doesn't state whether an unredeemed e-PIN's code should be treated as sensitive (it has real monetary value pre-redemption, like a voucher) — this spec's default is full visibility to the roles that already have visibility into that row (Admin: everything; Associate: rows where `redeemedTo = self`, which are already-used, no-longer-valuable codes by definition). Flagged in case a future audit wants stricter handling of *unredeemed* codes in the admin register.
