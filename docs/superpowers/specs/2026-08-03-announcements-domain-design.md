# Announcements Domain (Compose, Publish, Feed)

## Context

`announcement` package (`backend/src/main/java/com/plotchain/announcement/`) has `Announcement` entity + `AnnouncementRepository` only — no controller, per the reconciliation audit in `docs/superpowers/specs/2026-08-03-role-capability-data-visibility-design.md`. `AnnouncementRepository.findTop5ByOrderByPublishedAtDesc()` already exists and is used today by `DashboardService` to populate the associate dashboard's 5-most-recent widget (`frontend/src/app/dashboard/widgets/announcements-strip/`). That read path is untouched by this spec.

Role model, per the same design: "Admin composes/publishes" / "Associate: read-only feed" — and, more specifically, the Screens section calls out Announcements as the one example where a screen shows "the same data both can read," as opposed to every other domain being Admin-only or Associate-only content.

Grounding docs: `land-mlm-platform-prd.md` §5.1 (item 12, "Announcements feed — company-pushed updates"), §5.2 (item 13, "Announcement composer"), §6 (`Announcement (id, title, body, published_at, audience)`).

This is the simplest remaining not-built domain: one entity, no state machine, no cross-domain dependents (nothing downstream consumes an announcement the way Sales feeds the compensation engine). The spec is sized accordingly.

## Scope

**In scope**: `POST /api/admin/announcements` (compose + publish, ADMIN-only), a single paginated read endpoint reachable by any authenticated user (Admin or Associate) covering both "admin sees what it published" and "associate reads the feed."

**Out of scope**: audience targeting beyond "everyone" (see Decision 2), edit/unpublish/delete (see Decision 3), scheduled/future-dated publishing (every announcement publishes immediately on create — no PRD ask for scheduling), push/SMS/email delivery (in-app feed only, per task framing).

## Decisions

1. **One read endpoint, not two.** The task framing offered a choice between an admin-scoped management view (`GET /api/admin/announcements`) plus a separate associate feed, or a single shared endpoint. Going with a single shared endpoint: `GET /api/announcements`, reachable by any authenticated user. Rationale: there's no draft/unpublished state (Decision 3) and no audience targeting (Decision 2), so an admin-scoped query would return byte-identical rows to the associate feed — a second endpoint would be pure duplication with no product benefit. This also directly matches the role-capability spec's own framing of Announcements as the one domain where Admin and Associate read the same data. Path is `/api/announcements`, not `/api/associates/me/announcements` — the `associates/me/*` prefix elsewhere in this codebase (`/api/associates/me/dashboard`, `/api/associates/me/password`) means "scoped to the calling associate's own data" (own dashboard, own password); an announcement isn't the caller's data, it's a company-wide broadcast everyone sees identically, so that prefix would misdescribe it.
2. **`audience` column is kept but not exposed.** The entity/schema already has `audience VARCHAR(50) NOT NULL DEFAULT 'ALL'` (from the original multi-audience sketch in `land-mlm-platform-prd.md` §6, likely anticipating the four-admin-sub-role model that `docs/superpowers/specs/2026-08-03-role-capability-data-visibility-design.md` removed). With only two roles, and Admin never needing to read announcements as a distinct audience from Associate (Decision 1), there is no receiver to target beyond "everyone." `AnnouncementService` always writes `audience = "ALL"` on create and no endpoint reads or filters by it. Not dropping the column — out of scope to touch schema that already exists and isn't broken, and the reconciliation audit's instruction was "don't redesign this entity's schema unless the feature actually needs something missing," not "remove what's unused."
3. **No edit, unpublish, or delete in v1.** `Announcement` has no status field (nothing distinguishes draft from published), and the PRD only ever describes a "composer," never a correction flow. Every created announcement is immediately live (`publishedAt = now()` at creation) and permanent — same append-only posture as most of this codebase's write-once records. A typo fix today means composing a new announcement; there's no way to retract a bad one. Flagged in Open Questions since it's a real operational gap, not asserted as a non-issue.
4. **No new `SecurityConfig` matcher needed.** `POST /api/admin/announcements` is a plain `POST /api/**`, already covered by the existing blanket write rule (`hasAuthority("ADMIN")` per the role-model collapse — `docs/superpowers/plans/2026-08-03-role-model-collapse.md`). `GET /api/announcements` doesn't match any existing admin-only `GET` matcher, so it falls through to `anyRequest().authenticated()`, reachable by both roles' tokens. Zero `SecurityConfig.java` changes.
5. **Endpoint placement**: compose lives under `/api/admin/announcements`, matching the existing `/api/admin/associates`, `/api/admin/tree`, `/api/admin/kyc`, `/api/admin/sales` (per the sales domain spec) convention for admin back-office writes. The read feed is a standalone `/api/announcements`, not nested under either `/api/admin/` or `/api/associates/`, since — per Decision 1 — it isn't scoped to either role.

## Data model

No migration. `Announcement`/`AnnouncementRepository` already have every column and query this spec needs (`id`, `title` `VARCHAR(300)`, `body`, `published_at` indexed `DESC`, `audience`). One addition to `AnnouncementRepository`:

```java
Page<Announcement> findAllByOrderByPublishedAtDesc(Pageable pageable);
```

(Mirrors the shape of the existing `findTop5ByOrderByPublishedAtDesc()` — same ordering, paginated instead of capped at 5. `DashboardService`'s call site is untouched.)

**`Announcement.java` needs an explicit constructor.** The entity today has only field declarations and getters — no setters, no constructor beyond the implicit no-arg one JPA uses via reflection. Application code has no way to build a populated instance to hand to `save()`. Add an all-args constructor, matching `RankTier`'s pattern (`backend/src/main/java/com/plotchain/rank/RankTier.java`: a protected no-arg constructor for JPA plus a public all-args one for application code): `public Announcement(UUID id, String title, String body, Instant publishedAt, String audience)`. This is a one-time gap in the existing entity, not a new column or migration — every field this constructor sets already exists.

**New Java types**: `AnnouncementController`, `AnnouncementService`, `CreateAnnouncementRequest` (`title`, `body`, both `@NotBlank`, `title` also `@Size(max = 300)` to match the column constraint), `AnnouncementResponse` (`id`, `title`, `body`, `publishedAt`), `AnnouncementPageResponse` (`announcements`, `page`, `size`, `totalElements` — same shape as `AdminAssociatePageResponse`). No new exception types: the only failure mode is request validation, already handled application-wide by `ApiExceptionHandler.handleValidationFailure` (400 with per-field messages).

## Flows

### Compose & publish — `POST /api/admin/announcements`, ADMIN-only

1. `@Valid` request: `title` non-blank ≤300 chars, `body` non-blank → 400 via `ApiExceptionHandler` on failure.
2. Build `Announcement(id = UUID.randomUUID(), title, body, publishedAt = Instant.now(), audience = "ALL")`.
3. Save via `AnnouncementRepository`.
4. Return `AnnouncementResponse` (201).

### Read feed — `GET /api/announcements`, any authenticated user

1. `page` clamped `≥ 0`, `size` clamped `≤ 100` (same convention as `AdminAssociateController.list()`).
2. `announcementRepository.findAllByOrderByPublishedAtDesc(PageRequest.of(page, size))`.
3. Map each `Announcement` to `AnnouncementResponse`.
4. Return `AnnouncementPageResponse` (200).

## Error handling

| Case | HTTP | Trigger |
|---|---|---|
| Blank/oversized `title`, blank `body` | 400 | `MethodArgumentNotValidException`, handled by the existing `ApiExceptionHandler` — no new exception type |
| Non-ADMIN token on `POST` | 403 | Spring Security blanket write rule (existing) |
| No/invalid JWT on either endpoint | 401 | Existing `JwtAuthenticationFilter` / entry point |

## Testing

- `AnnouncementServiceTest`: compose sets `publishedAt` to (approximately) now and `audience` to `"ALL"` regardless of what (if anything) the request carries; read feed returns pages in `publishedAt DESC` order; page/size clamping matches the existing associate-list convention.
- `AnnouncementControllerTest` (MockMvc + real JWT, mirroring `AdminAssociateControllerTest`'s shape): 201 on valid compose, 400 on blank title/body, 200 + correct page shape on the feed.
- `SecurityConfigTest` additions: `POST /api/admin/announcements` — associate token → 403, admin token → 201; `GET /api/announcements` — both admin and associate tokens → 200.
- No dedicated `AnnouncementRepositoryTest`: `findAllByOrderByPublishedAtDesc` is a single derived Spring Data query with no custom SQL (unlike, e.g., Sales' recursive native query), and its ordering is already exercised indirectly by `AnnouncementControllerTest`'s feed-order assertion.

## Resolved decisions (post-review)

1. **No correction path, confirmed as permanent policy, not a placeholder.** Decision 3's "compose a new announcement to correct a mistake" stays the only mechanism. No `PUBLISHED`/`RETRACTED` status field is added.
