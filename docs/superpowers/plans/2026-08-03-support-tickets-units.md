# Support Tickets — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-support-tickets-domain-design.md` by spec-slicer, 2026-10-06. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

No ADRs or glossary file exist for this spec; sliced from the spec doc alone (role/capability context from `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md`). The support-tickets spec has no Screens section of its own; the screens were taken from the role-capability spec's "Screens" section: Admin "Support Ticket Queue + log a ticket (on an associate's behalf)" and Associate "Support Ticket history (view-only)". One `screen` unit per named screen (5, 6), grouped by screen not endpoint. Units 1-4 are pure backend.

**Migration placement:** the single `support_ticket` migration (next free `V__`, currently V42; check at implementation time) lands in unit 1 with the entity, enum, repository base, DTOs, `SupportTicketExceptionHandler` shell and the `SecurityConfig`/`SecurityConfigTest` rows for the POST routes. Unit 1 is still a demoable outcome (admin logs a ticket and gets it back).

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| Unit # | Title | Type | Depends on | Status | Plan file path | Merged commit range |
|---|---|---|---|---|---|---|
| 1 | Admin logs an `OPEN` ticket on an associate's behalf — migration + `POST /api/admin/support-tickets` | backend | none | merged | `docs/superpowers/plans/2026-08-03-support-tickets-unit-1-log-ticket.md` | `63e8af8..b8743bb` (merge `75369df`) |
| 2 | Admin views a paged, filterable ticket queue — `GET /api/admin/support-tickets` | backend | 1 | merged | `docs/superpowers/plans/2026-08-03-support-tickets-unit-2-admin-queue.md` | `3360b7d..91f12be` (merge `afcb8a3`) |
| 3 | Admin responds to / changes status of a ticket — `POST /api/admin/support-tickets/{id}/respond` | backend | 1 | merged | `docs/superpowers/plans/2026-08-03-support-tickets-unit-3-respond.md` | `54e9b7a..d26f3aa` (merge `98679c4`) |
| 4 | Associate reads own ticket history, view-only — `GET /api/associates/me/support-tickets` | backend | 1 | merged | `docs/superpowers/plans/2026-08-03-support-tickets-unit-4-associate-history.md` | `ad48356..95d3bf7` (merge `52ec5df`); deviation: reuses unit 2 `searchQueue` instead of two derived repository methods, spec line 107 allows it |
| 5 | Admin "Support Ticket Queue" screen — queue with status/associate filters, log-a-ticket form, respond/status form | screen | 1, 2, 3 | planned | `docs/superpowers/plans/2026-08-03-support-tickets-unit-5-admin-queue-screen.md` | — |
| 6 | Associate "Support Ticket history" screen — view-only | screen | 4 | planned | `docs/superpowers/plans/2026-08-03-support-tickets-unit-6-associate-history-screen.md` | — |

**Dependency order:**

```
1 (schema + create) ─┬─→ 2 (admin queue) ──┐
                     ├─→ 3 (respond) ──────┼─→ 5 (Admin Support Ticket Queue screen)
                     └─→ 4 (associate own history) ─→ 6 (Associate Support Ticket history screen)
```

Units 2, 3, 4 are mutually independent once 1 is built. Units 5 and 6 are independent. Unit 5 needs 2 to show the queue; 1 and 3 for its forms.

## Unit detail

### 1. Admin logs an `OPEN` ticket on an associate's behalf

**Depends on:** none
**Refs:** Scope; Decisions 1, 3, 6, 7, 8, 9; Data model (table, entity, enum, repository, `CreateSupportTicketRequest`, `SupportTicketResponse`); Flows "Admin logs a ticket"; Error handling; Testing (`AdminSupportTicketServiceTest` create cases, controller, `SecurityConfigTest`)

Acceptance criteria:
- One new migration creates `support_ticket` exactly per Data model (status `VARCHAR(20)` + CHECK `OPEN/IN_PROGRESS/RESOLVED/CLOSED`, default `OPEN`, indexes on `associate_id` and `status`, no `assigned_to`, no thread, no attachments — Decisions 1, 2). DB rejects an invalid status (DB-enum-CHECK lesson).
- ADMIN `POST /api/admin/support-tickets` with `CreateSupportTicketRequest(associateId, subject, description)` persists a ticket with `status = OPEN`, `response = null`, `createdAt = updatedAt = now()` and returns `SupportTicketResponse` including `associateUserId` and `associateName` (Flows; Data model).
- Unknown `associateId` returns 404 via reused `AssociateNotFoundException`, checked before anything else (Flows; Error handling).
- Blank `subject`/`description` or missing `associateId` returns 400 (Error handling).
- Write is logged via `SettingsAuditService.record("support-ticket", "Logged ticket for <userId>: <subject>", {ticketId, associateId}, actorId)` (Decision 9; Flows).
- `@PreAuthorize("hasAuthority('ADMIN')")` on the method; ASSOCIATE token 403, unauthenticated 401; `SecurityConfigTest` rows added for the POST route (Decision 8; Testing).
- Package `com.plotchain.supportticket`; `SupportTicketExceptionHandler` (`@RestControllerAdvice`) created here; no `createdBy` column (Decisions 6, 7).

### 2. Admin views a paged, filterable ticket queue

**Depends on:** 1
**Refs:** Scope; Decisions 5, 8; Data model (repository `searchQueue`, `SupportTicketPageResponse`); Flows "Admin browses the queue"; Testing (`list()` cases, controller, `SecurityConfigTest`)

Acceptance criteria:
- ADMIN `GET /api/admin/support-tickets` returns `SupportTicketPageResponse(entries, page, size, totalElements)`, `page = max(page,0)`, `size = min(size,100)`, default 20 (Data model; controller comment).
- Optional `status` and `associateId` filters work independently and combined via one `searchQueue`-style query shape like `AssociateRepository.searchDirectory`, not four derived methods; no status filter by default (Flows).
- Each row carries full ticket content (`subject`, `description`, `status`, `response`, `respondedAt`) — no separate summary/detail, no `GET /{id}` (Decision 5); sorted `createdAt` desc.
- New `SecurityConfig` matcher `GET /api/admin/support-tickets` and `/api/admin/support-tickets/*` -> `hasAuthority("ADMIN")`, placed with `/api/admin/kyc` etc. (no blanket admin GET rule exists); ASSOCIATE 403, unauthenticated 401; `SecurityConfigTest` row (Decision 8; Testing).
- Null-UUID/enum parameter binding verified (same as other `search` queries; H2 and Postgres behaviour may differ).

### 3. Admin responds to / changes status of a ticket

**Depends on:** 1
**Refs:** Decisions 2, 3, 4, 8, 9; Flows "Admin responds"; Error handling; Testing (`respond()` cases, controller validation)

Acceptance criteria:
- ADMIN `POST /api/admin/support-tickets/{id}/respond` with `RespondToSupportTicketRequest(status, response?)` sets `status` and, if provided, overwrites `response` (single response, not a thread — Decision 2); `updatedAt = now()`.
- `respondedAt = now()` only when a non-blank response is provided; a status-only change (e.g. `OPEN -> IN_PROGRESS`) leaves `response` unchanged rather than nulling it (Flows).
- `RESOLVED`/`CLOSED` with blank/missing `response` returns 400 `InvalidSupportTicketResponseException` (Decision 4); no state-machine guard on transitions, reopening allowed (Decision 3).
- Unknown ticket id 404 `SupportTicketNotFoundException`; missing `status` 400 (Error handling); both mapped in `SupportTicketExceptionHandler`.
- Audit-logged under `"support-ticket"` with new status and truncated response text (Decision 9).
- `@PreAuthorize` ADMIN; ASSOCIATE 403, unauthenticated 401; `SecurityConfigTest` row (covered by the blanket POST rule plus `@PreAuthorize`).

### 4. Associate reads own ticket history, view-only

**Depends on:** 1
**Refs:** Scope; Decisions 5, 8; Flows "Associate views their own ticket history"; Resolved decisions 1; Testing (`AssociateSupportTicketControllerTest`, `SecurityConfigTest`)

Acceptance criteria:
- `GET /api/associates/me/support-tickets` (`AssociateSupportTicketController`, no class-level mapping) returns `SupportTicketPageResponse` for the caller only; `associateId` comes from `@AuthenticationPrincipal`, never a parameter (Decision 8).
- Optional `status`, `page`, `size` (default 20, clamped to 100); sorted `createdAt` desc via `findByAssociateIdOrderByCreatedAtDesc` / `...AndStatus...`.
- Test seeds two associates' tickets and asserts only the caller's are returned (Testing).
- No new `SecurityConfig` matcher (falls to `anyRequest().authenticated()`); ASSOCIATE token not 403, unauthenticated 401, ADMIN token also reachable and left ungated (Resolved decisions 1); `SecurityConfigTest` row.
- No write route for associates exists (role-capability spec, associate write scope).

### 5. Admin "Support Ticket Queue" screen

**Depends on:** 1, 2, 3
**Refs:** role-capability spec "Screens" (Admin: Support Ticket Queue + log a ticket); this spec Flows (all three admin flows), Error handling; File overlap check

Acceptance criteria:
- Queue list with `status` and associate filters and pagination (unit 2); rows show subject, associate name/userId, status, created date, response; default is unfiltered (Flows).
- "Log a ticket" form: associate picker (existing associate lookup, as in Projects & Plots Book form), subject, description; calls unit 1; 400/404 surfaced (Flows step 1).
- Respond/status form on a ticket calling unit 3; Resolved/Closed requires a response (client-side hint plus the 400 surfaced); status-only change allowed (Decision 4).
- Admin sidebar entry added to the admin nav categories (see File overlap check).
- Uses live tokens and the shared components (pager, tab bar, inline banner); design folder `docs/design/admin_operational_screens/support_tickets/` is needed first (see Open questions).
- Component/service specs; no e2e (e2e deferred, see memory).

### 6. Associate "Support Ticket history" screen

**Depends on:** 4
**Refs:** role-capability spec "Screens" (Associate: Support Ticket history, view-only); this spec Flows "Associate views"; Decision 5

Acceptance criteria:
- View-only paged list of the associate's own tickets (subject, description, status, response, responded date) from unit 4, with optional status filter.
- Empty state when no tickets; no create/respond/edit affordance anywhere (role-capability spec, associate write scope).
- Route and nav entry in the associate app navigation; admin token on this route is not specially handled (Resolved decisions 1).
- Responsive web per role-capability spec decision 4; component/service specs; no e2e.
- Design folder `docs/design/associate_operational_screens/support_ticket_history/` needed first (see Open questions).

## Open questions

1. **Design mockups.** No `DESIGN.md` exists for either screen under `docs/design/`; every other screen unit had one signed off first. Confirm whether to produce designs before planning units 5 and 6.
2. **Associate picker for the Admin log-ticket form.** The spec says "from the Associate Directory drill-down, or a support-ticket-specific associate picker" without choosing. Slice assumes a picker reusing the existing associate lookup (like the Book form). Drill-down entry from the directory is not sliced.
3. **Associate-side navigation location** is unspecified (own screen vs. section of an existing page); slice assumes its own entry.
4. **Spec test note:** the create status code (200 vs 201) is left to "match `KycReviewController`/`AdminAssociateController`"; check at plan time.

## Excluded — not a unit

- **Notifications/email/SMS, attachments, `assigned_to` routing, message thread, `GET /{id}` detail, categories/priority** — Scope Out-of-scope and Decisions 1, 2, 5.
- **Text search over subject/description, retention/archival of `CLOSED`** — Resolved decisions 2 and 3.
- **Standalone "schema", "audit logging", "exception handler" units** — layer-shaped/cross-cutting; folded into unit 1 and the units that use them.
- **Distinct "blank response on resolve" failure unit** — one guard clause, folded into unit 3.
- **Associate/Admin "own tickets" gating of the associate route for ADMIN** — Resolved decisions 1.

## File overlap check against other approved/in-flight units (done at slice time, 2026-10-06)

Grepped all `docs/superpowers/plans/*-units.md` for `SecurityConfig`, `SettingsAuditService`, sidebar/nav, `DESIGN.md`. Every unit in cycle-management, sales, income-ledger, role-capability, wallet-withdrawal, epin and plot-booking is `merged`; no `pending`/`planned` units exist elsewhere. Only announcements is unsliced and unchecked. No in-flight collision; shared files to sequence against announcements when it is sliced:

- `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`: unit 2 adds a `GET /api/admin/support-tickets`, `/*` matcher beside `/api/admin/kyc` (~line 378). Units 1, 3 are covered by the blanket POST rule; unit 4 needs no edit. `SecurityConfigTest` gains rows in units 1-4. Announcements will edit both too.
- `backend/src/main/resources/db/migration/`: highest is `V41__plot_booking_lifecycle.sql`; unit 1 takes the next free number. Claim it at dispatch time, announcements may also add a migration.
- `SettingsAuditService`: reused read-only by unit 1/3 (section `"support-ticket"`); no edit.
- `AssociateNotFoundException` (associate package): reused, not edited. `AssociateRepository`: not edited.
- Frontend `frontend/src/app/admin-nav-categories.model.ts` (+ spec), `frontend/src/app/app.routes.ts` (+ spec): unit 5 adds an admin nav item and a lazy route; unit 6 adds an associate route. Announcements will touch the same files; serialise or rebase. Lazy-load both screens (initial bundle was at the 1MB budget in the plot-booking units).
- `DESIGN.md`: no existing support-ticket design; units 5/6 need new folders (see Open questions). `docs/design/` shared tokens not edited.
