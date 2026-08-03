# Support Tickets Domain Design

**Depends on / narrowed by:**
- `docs/superpowers/specs/2026-08-03-role-capability-data-visibility-design.md` — two-role model (ADMIN back-office+tree-root, ASSOCIATE individual placed L/R). Data visibility matrix row "Support tickets": Admin's queue logs and responds to tickets on any associate's behalf; Associate sees own ticket history, view-only. Resolved decision in that spec: an Associate has no self-serve write action anywhere except editing their own profile — raising a support ticket is explicitly called out as one of the actions Admin performs *on the associate's behalf*, not something an Associate submits themselves. That decision is treated as settled here, not revisited.
- `land-mlm-platform-prd.md` §5.1 item 11 ("Support tickets — raise/track a support request") and §5.2 item 12 ("Support ticket queue — new").
- `mlm-land-platform-spec.md` §6's original entity sketch: `SupportTicket (id, associate_id, subject, status, assigned_to, thread)`.
- Reconciliation audit in the role-capability spec: "Support tickets — **Not built**. No package/entity/controller exists for this domain at all — full stop, nothing built." This spec starts from zero.

## Context

The PRD's original vision had an Associate raising their own ticket and a support-role admin staffer picking it up from a shared queue (hence `assigned_to`). Two things about that vision no longer hold in this codebase's current direction:

1. The two-role collapse (`docs/superpowers/plans/2026-08-03-role-model-collapse.md`) deletes `SUPER_ADMIN`/`FINANCE`/`KYC_REVIEWER`/`SUPPORT` — there is exactly one `ADMIN` account. A field meant to route a ticket to one of several support staff has nothing left to route to.
2. The role-capability spec's resolved decision on associate write scope means an Associate never files their own ticket through the app. Admin logs it on their behalf (e.g., after a phone call or WhatsApp message) and tracks the resolution.

This spec designs the Admin-does-it-on-behalf workflow and the Associate's read-only history view, following the same shape already established by `KycReviewController`/`KycReviewService` (queue + decision, paginated, `SettingsAuditService`-logged) and `AssociateProfileController` (self-scoped associate read/write via `@AuthenticationPrincipal`).

## Scope

**In scope:**
- `POST /api/admin/support-tickets` — Admin logs a new ticket on an associate's behalf (associate ID, subject, initial description). ADMIN-only.
- `POST /api/admin/support-tickets/{id}/respond` — Admin adds/updates the response text and changes ticket status in one call. ADMIN-only.
- `GET /api/admin/support-tickets` — paginated queue, filterable by `status` and `associateId`. ADMIN-only.
- `GET /api/associates/me/support-tickets` — the calling associate's own ticket history, paginated, view-only. Self-scoped via `@AuthenticationPrincipal`, reachable by an authenticated ASSOCIATE (or ADMIN) token.

**Out of scope (per the brief, and reasoned about below where a decision was needed):**
- Any notification/email/SMS on ticket create or update.
- File attachments on tickets.
- Multi-staff assignment routing (`assigned_to`) — only one Admin account exists in the current model.
- A multi-message conversation thread (see Decisions — v1 ships one response field, not a thread table).
- A ticket detail (`GET /{id}`) endpoint for either role — see Decisions.
- Any ticket-category/priority taxonomy — not asked for by the PRD line item, not added speculatively.

## Decisions

1. **Drop `assigned_to` entirely, don't keep it nullable-for-later.** With exactly one `ADMIN` account, every ticket that exists is implicitly "assigned" to the one Admin — a field that always holds the same value (or is always null) carries no information and adds a column with no read or write path. If a future spec reintroduces delegated back-office staff (the role-capability spec explicitly flags this as a possible future direction, not ruled out forever), that spec should add `assigned_to` then, informed by whatever the actual staffing model turns out to be — guessing its shape now (nullable UUID? a role enum? a team?) is more likely to be wrong than useful. This mirrors how the role-collapse plan already deleted rather than parked the four sub-roles.

2. **No message thread in v1 — one ticket, one current response.** The original spec sketch's `thread` field implies a full back-and-forth conversation (a small chat), which is a materially bigger feature: a child entity, its own pagination, "unread" semantics, etc. Nothing in the PRD line items ("raise/track a support request", "support ticket queue") asks for multi-turn conversation — both read like a back-office admin logging a request and later marking it handled with a note, which is what `KycReviewController`'s decision-with-reason shape already does well for an analogous "queue + terse resolution" workflow in this codebase. `respond()` therefore **sets/overwrites** `response` and `status` together as a single call, not appends to a list. Cost of being wrong: if real usage shows Admin needs to leave several notes over a ticket's life, the fix is additive — a new `support_ticket_message` child table — and doesn't require reshaping the `support_ticket` table's existing columns. That's a cheap enough escape hatch to justify not building the general case now (YAGNI).

3. **Status enum: `OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`.** Matches the four values named in the task brief. New tickets start `OPEN`. No enforced state machine (e.g., no rule blocking `OPEN → CLOSED` directly, no rule preventing reopening a `CLOSED` ticket) — Admin is a single trusted actor logging tickets on someone else's behalf; adding transition-guard rules is speculative process design the PRD doesn't ask for. The one validation rule that *is* enforced (see #4) mirrors an existing precedent in this codebase (`KycDecisionRequest`'s "reason required when rejecting").

4. **`response` text is required when the new status is `RESOLVED` or `CLOSED`, optional otherwise.** Rationale: an Associate reading their own ticket history should always see *why* a ticket was closed, matching `KycReviewService.decide()`'s existing rule that a rejection reason is mandatory. Moving a ticket to `IN_PROGRESS` with no note yet (e.g., "I've picked this up, no update to share yet") is a legitimate intermediate state and shouldn't be blocked on having something to say.

5. **No `GET /{id}` detail endpoint, for either role.** Both list endpoints (`GET /api/admin/support-tickets`, `GET /api/associates/me/support-tickets`) return the ticket's full content — `subject`, `description`, `status`, `response`, `respondedAt` — per row, not a slimmed-down summary. A support ticket is a handful of short text fields with no attachments (explicitly out of scope) and no thread (Decision 2), so there's no payload-size reason to split summary vs. detail the way `AdminAssociateController` splits `list()`'s summary rows from `get(id)`'s richer detail (that split exists there because a full associate profile pulls in rank, sponsor, parent, and leg-volume lookups — none of which applies here). If ticket volume or field count grows later, splitting summary/detail is a backward-compatible addition, not a breaking change.

6. **No `createdBy` / admin-actor column on the ticket row itself.** Every write to a ticket already goes through `SettingsAuditService.record(...)` (see Flows), which captures `actorId` independently, the same way `AdminAssociateService.suspend/reactivate/resetPassword` don't store "who suspended this" on the `Associate` row — that provenance lives in the audit log, not duplicated on the domain entity. With one Admin account, "who did this" is a foregone conclusion anyway; the audit log's real value here is the *timeline*, not the *actor*.

7. **Package name: `supportticket`**, one word, no separator — matches this codebase's existing single-word package names (`associate`, `dashboard`, `wallet`, `legvolume`, `announcement`), not `support_ticket` or `support-tickets`.

8. **Authorization matches the already-collapsed two-role model directly** (this is new code, not a migration): `@PreAuthorize("hasAuthority('ADMIN')")` on the two admin write endpoints (defense-in-depth alongside the blanket `POST /api/**` → `hasAuthority("ADMIN")` rule in `SecurityConfig`, same redundant-but-intentional pattern `AdminAssociateController`/`KycReviewController` already use), plus new `SecurityConfig` URL matchers for the two admin `GET` routes (`/api/admin/support-tickets`, `/api/admin/support-tickets/*`) → `hasAuthority("ADMIN")`, alongside the existing `/api/admin/kyc`, `/api/admin/stats`, `/api/admin/associates` entries. `GET /api/associates/me/support-tickets` needs no new matcher — it falls through to the generic `anyRequest().authenticated()` rule already at the bottom of the chain, same as `/api/associates/me/tree` and `/api/associates/me/profile`, self-scoped by construction because the associate ID comes from the verified JWT (`@AuthenticationPrincipal`), never a path or query parameter.

9. **Every write is logged via `SettingsAuditService`** under section `"support-ticket"`, consistent with `KycReviewService` and `AdminAssociateService`. This is what makes the role-capability matrix's "Audit log — Admin: full log, every actor and action" claim true for this domain instead of merely aspirational.

## Data model

New Flyway migration (exact version number `V<next>` at implementation time — check `backend/src/main/resources/db/migration/` for the current highest version, since other in-flight specs may claim numbers first):

```sql
CREATE TABLE support_ticket (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    subject VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    response TEXT,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_support_ticket_associate_id ON support_ticket(associate_id);
CREATE INDEX idx_support_ticket_status ON support_ticket(status);
```

Notes:
- `status` is `VARCHAR` with a `CHECK` constraint, not a native Postgres enum — same precedent as `associate.role` (`V4__user_id_login_and_admin_roles.sql`), cheap to widen later if a fifth status is ever needed.
- No `assigned_to` column (Decision 1). No `thread`/child message table (Decision 2). No `attachment`/file columns (out of scope).
- `created_at`/`updated_at` are plain audit-ish timestamps on the row itself (standard JPA `@PrePersist`/`@PreUpdate` or equivalent), separate from and in addition to the `SettingsAuditLog` trail — the former is "when did this record last change" for sorting/display, the latter is "who did what and why," matching how `Associate` doesn't store `lastModifiedBy` either.

**Entity** — `backend/src/main/java/com/plotchain/supportticket/SupportTicket.java`:

```java
@Entity
@Table(name = "support_ticket")
public class SupportTicket {
    @Id private UUID id;
    @Column(name = "associate_id", nullable = false) private UUID associateId;
    @Column(nullable = false) private String subject;
    @Column(nullable = false) private String description;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private SupportTicketStatus status = SupportTicketStatus.OPEN;
    private String response;
    @Column(name = "responded_at") private Instant respondedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    // getters/setters, matching Associate.java's plain-getter/setter style (no Lombok used elsewhere in this codebase)
}
```

```java
public enum SupportTicketStatus { OPEN, IN_PROGRESS, RESOLVED, CLOSED }
```

**Repository** — `SupportTicketRepository extends JpaRepository<SupportTicket, UUID>`:
- `Page<SupportTicket> findByAssociateIdOrderByCreatedAtDesc(UUID associateId, Pageable pageable)` — associate's own history.
- `Page<SupportTicket> findByAssociateIdAndStatusOrderByCreatedAtDesc(UUID associateId, SupportTicketStatus status, Pageable pageable)`.
- A `searchQueue(status, associateId, pageable)`-style query (Spring Data `@Query` or derived-method combination, mirroring `AssociateRepository.searchDirectory`) for the admin queue's two optional filters — both `status` and `associateId` are independently optional per the SCOPE bullet, so this needs the same "build the query from whichever filters are non-null" shape `searchDirectory` already uses, not four separate derived methods for every filter combination.

**DTOs** (`backend/src/main/java/com/plotchain/supportticket/`):
- `CreateSupportTicketRequest(@NotNull UUID associateId, @NotBlank String subject, @NotBlank String description)`
- `RespondToSupportTicketRequest(@NotNull SupportTicketStatus status, String response)`
- `SupportTicketResponse(UUID id, UUID associateId, String associateUserId, String associateName, String subject, String description, SupportTicketStatus status, String response, Instant respondedAt, Instant createdAt, Instant updatedAt)` — one shape, reused for both the admin queue rows and the associate's own history rows (Decision 5 — no separate summary/detail split).
- `SupportTicketPageResponse(List<SupportTicketResponse> entries, int page, int size, long totalElements)` — same shape as `KycPageResponse`/`AdminAssociatePageResponse`.

**Exceptions** (`backend/src/main/java/com/plotchain/supportticket/`):
- `SupportTicketNotFoundException(UUID id)` → 404, thrown by `respond()` when `id` doesn't resolve.
- `InvalidSupportTicketResponseException(String message)` → 400, thrown when `respond()` is called with status `RESOLVED`/`CLOSED` and a blank/missing `response` (Decision 4).
- Reuses the existing `com.plotchain.associate.AssociateNotFoundException` (404) when `create()`'s `associateId` doesn't resolve to a real associate — same reuse pattern `DashboardExceptionHandler` already establishes for a cross-package exception.

**Controllers:**

`AdminSupportTicketController` (`@RequestMapping("/api/admin/support-tickets")`):
```java
@GetMapping
public SupportTicketPageResponse list(
    @RequestParam(required = false) SupportTicketStatus status,
    @RequestParam(required = false) UUID associateId,
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size
) { ... }  // page = max(page,0); size = min(size,100) -- same guard AdminAssociateController.list() and KycReviewController.list() already apply

@PostMapping
@PreAuthorize("hasAuthority('ADMIN')")
public SupportTicketResponse create(@Valid @RequestBody CreateSupportTicketRequest request,
                                     @AuthenticationPrincipal UUID actorId) { ... }

@PostMapping("/{id}/respond")
@PreAuthorize("hasAuthority('ADMIN')")
public SupportTicketResponse respond(@PathVariable UUID id, @Valid @RequestBody RespondToSupportTicketRequest request,
                                      @AuthenticationPrincipal UUID actorId) { ... }
```

`AssociateSupportTicketController` (no class-level `@RequestMapping`, single route — same pattern `AssociateTreeController`/`AssociateProfileController` use rather than being folded into the admin controller):
```java
@GetMapping("/api/associates/me/support-tickets")
public SupportTicketPageResponse myTickets(
    @AuthenticationPrincipal UUID associateId,
    @RequestParam(required = false) SupportTicketStatus status,
    @RequestParam(defaultValue = "0") int page,
    @RequestParam(defaultValue = "20") int size
) { ... }
```

## Flows

**Admin logs a ticket on an associate's behalf:**
1. Admin (already authenticated) picks the associate (e.g., from the Associate Directory drill-down, or a support-ticket-specific associate picker) and fills subject + description.
2. `POST /api/admin/support-tickets` → `AdminSupportTicketService.create(request, actorId)`:
   - Look up the associate by `request.associateId()` via `AssociateRepository.findById(...)`, throwing `AssociateNotFoundException` if absent (same findOrThrow-first ordering `KycReviewService.decide()` uses — validate the target exists before anything else).
   - Persist a new `SupportTicket` with `status = OPEN`, `response = null`, `createdAt = updatedAt = now()`.
   - `settingsAuditService.record("support-ticket", "Logged ticket for " + associate.getUserId() + ": " + subject, Map.of("ticketId", ..., "associateId", ...), actorId)`.
   - Return the created `SupportTicketResponse`.

**Admin responds to / updates a ticket:**
1. Admin opens the queue (`GET /api/admin/support-tickets`, optionally filtered by `status=OPEN` to triage), picks a ticket, writes a response and/or changes status.
2. `POST /api/admin/support-tickets/{id}/respond` → `AdminSupportTicketService.respond(id, request, actorId)`:
   - `findById(id)` or throw `SupportTicketNotFoundException`.
   - If `request.status()` is `RESOLVED` or `CLOSED` and `request.response()` is blank, throw `InvalidSupportTicketResponseException` (Decision 4).
   - Set `status`, `response` (if provided — a status-only change, e.g. `OPEN → IN_PROGRESS` with no note yet, is allowed to leave `response` unchanged rather than nulling it out), `respondedAt = now()` (only when a non-blank response is provided), `updatedAt = now()`.
   - Audit-log under `"support-ticket"` with the new status and (truncated, if long) response text.
   - Return the updated `SupportTicketResponse`.

**Admin browses the queue:**
`GET /api/admin/support-tickets?status=OPEN&page=0&size=20` — same triage pattern as `KycReviewController.list()`'s default `status=PENDING`, except this endpoint's `status` param is optional/unfiltered by default (an Admin landing on the queue wants to see everything first, not just one status) rather than KYC's mandatory-with-default — matches SCOPE's "filterable by status/associateId," which reads as an optional narrowing, not a required one.

**Associate views their own ticket history:**
`GET /api/associates/me/support-tickets?page=0&size=20` — `associateId` comes from the JWT (`@AuthenticationPrincipal`), never a request parameter, so there is no code path by which Associate A can see Associate B's tickets (same construction that makes `/api/associates/me/profile` and `/api/associates/me/tree` self-scoped-by-default rather than self-scoped-by-check).

## Error handling

| Condition | Status | Thrown by |
|---|---|---|
| `associateId` in create request doesn't exist | 404 | `AssociateNotFoundException` (reused) |
| `id` in respond request doesn't exist | 404 | `SupportTicketNotFoundException` |
| `subject`/`description` blank on create | 400 | Bean Validation (`@NotBlank`) |
| `status` missing on respond | 400 | Bean Validation (`@NotNull`) |
| `status` is `RESOLVED`/`CLOSED` and `response` is blank | 400 | `InvalidSupportTicketResponseException` |
| Non-ADMIN token on any admin route | 403 | Spring Security (`SecurityConfig` matcher + `@PreAuthorize`) |
| Unauthenticated request to any route | 401 | Spring Security |

A new `SupportTicketExceptionHandler` (`@RestControllerAdvice`, package `supportticket`) maps `SupportTicketNotFoundException` → 404 and `InvalidSupportTicketResponseException` → 400, mirroring `DashboardExceptionHandler`/`AssociateProvisioningExceptionHandler`'s per-package `@RestControllerAdvice` convention (each package registers handlers for the exceptions its own controllers can throw, including reused cross-package ones like `AssociateNotFoundException`).

## Testing

Following this codebase's existing test shape for the closest analog (`KycReviewControllerTest`/`AdminAssociateControllerTest` + `SecurityConfigTest`):

- **`AdminSupportTicketServiceTest`** (unit, mocked repositories):
  - `create()` persists with `status = OPEN` and calls `settingsAuditService.record(...)`.
  - `create()` throws `AssociateNotFoundException` for an unknown `associateId`.
  - `respond()` updates status and response, sets `respondedAt`.
  - `respond()` throws `InvalidSupportTicketResponseException` when moving to `RESOLVED`/`CLOSED` with a blank response.
  - `respond()` allows a status-only change (e.g. `OPEN → IN_PROGRESS`) with no response text.
  - `respond()` throws `SupportTicketNotFoundException` for an unknown ticket id.
  - `list()` honors both `status` and `associateId` filters independently and combined, and pagination (`page`/`size` reflected in the response).
- **`AssociateSupportTicketServiceTest`** (or folded into the controller test if the service is thin enough to not warrant its own): `myTickets()` scoped to the calling associate only, optional `status` filter.
- **`AdminSupportTicketControllerTest`** (`@SpringBootTest` + `MockMvc`, mirroring `KycReviewControllerTest`):
  - ADMIN token: `POST` create succeeds (201/200 per this codebase's existing convention — check `KycReviewController`/`AdminAssociateController`'s actual returned status before matching it exactly), `POST /{id}/respond` succeeds, `GET` list succeeds.
  - ASSOCIATE token: all three admin routes return 403.
  - Validation: blank `subject` → 400; `respond()` with `status=RESOLVED` and blank `response` → 400.
- **`AssociateSupportTicketControllerTest`**: ASSOCIATE token sees only their own tickets (seed two associates' worth of tickets, assert the response contains only the caller's); ADMIN token can also reach the route (per the role-capability spec, Admin has no separate "own tickets" concept, but the route isn't associate-only-gated — same as `/api/associates/me/tree`, confirm this is still the desired behavior or gate it ADMIN-out at implementation time if it turns out to be confusing in practice — flagged here, not resolved, since it's genuinely a minor UX call rather than a correctness one).
- **`SecurityConfigTest`** additions: `GET /api/admin/support-tickets` reachable for ADMIN / 403 for ASSOCIATE; `GET /api/associates/me/support-tickets` reachable for ASSOCIATE (not 403); `POST /api/admin/support-tickets` and `POST /api/admin/support-tickets/{id}/respond` reachable for ADMIN / 403 for ASSOCIATE — same four-case shape `SecurityConfigTest` already uses per route.

## Open questions

1. **Should `GET /api/associates/me/support-tickets` be reachable by an ADMIN token at all?** It falls through to the generic `authenticated()` rule by construction (same as `/api/associates/me/tree`), so an ADMIN token technically gets a response — but since the Admin row has no meaningful "own tickets" (it never raises tickets against itself), that response would always be an empty list. This is harmless but slightly odd; whether to explicitly gate it `ASSOCIATE`-only is a minor product call, not a correctness question, and is left open rather than guessed at.
2. **Should the admin queue's `GET` list support a text search over `subject`/`description`** (the way `AdminAssociateController.list()` supports a `search` param over associate directory fields)? Not requested by the SCOPE bullet ("filterable by status/associateId" only) and not clearly needed at expected ticket volumes for a single-admin back office, but could become useful once ticket count grows. Left out of v1; flagging since it's a plausible near-future ask rather than a hard no.
3. **Retention / archival of `CLOSED` tickets** — no stated requirement either way in the PRD or the role-capability spec. Left unaddressed; if the queue grows large enough that showing closed tickets by default becomes noisy, the existing `status` filter (default to open ones) already handles the UI-level concern without needing a data-retention decision now.
