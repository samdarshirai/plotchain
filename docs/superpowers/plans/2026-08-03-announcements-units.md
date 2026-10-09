# Announcements — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-announcements-domain-design.md` by spec-slicer, 2026-10-08. This file is the persisted record of that slice; a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed.

No ADRs or glossary exist for this spec. The announcements spec has no Screens section; screens come from the role-capability spec "Screens" section: Admin "Announcement Composer", Associate "Announcements feed (view-only)". One `screen` unit per named screen (3, 4). Units 1-2 are pure backend.

**Spec drift found at slice time (2026-10-08):** the spec's Context says `Announcement` entity + `AnnouncementRepository` exist and `DashboardService` uses `findTop5ByOrderByPublishedAtDesc()`. That is stale: the `com.plotchain.announcement` package no longer exists (deleted in commit `a018129`, "delete orphaned announcement/metric code" during the associate-dashboard mockup work). Only the `announcement` table remains (`V1__create_dashboard_tables.sql`: id, title VARCHAR(300), body TEXT, published_at, audience DEFAULT 'ALL', index on published_at DESC). Unit 1 therefore recreates the entity (with the all-args constructor the spec wants) and the repository. No migration needed: table and columns already match.

**Dashboard check:** neither dashboard renders or stubs an announcements widget. Admin dashboard plan line 17: "No widgets for e-PIN, Support Tickets, or Announcements". Associate dashboard mockup plan deletes `announcements-strip` and the `announcements` sub-object of `DashboardResponse`; no matches for "announcement" remain in `frontend/src/app`, and backend only mentions it in a `WalletController` comment. Nothing to integrate or remove; a dashboard teaser is NOT sliced (see Open questions).

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| Unit # | Title | Type | Depends on | Status | Plan file path | Merged commit range |
|---|---|---|---|---|---|---|
| 1 | Admin composes and publishes an announcement, live immediately — recreate entity/repo + `POST /api/admin/announcements` | backend | none | planned | `docs/superpowers/plans/2026-08-03-announcements-unit-1-compose.md` | — |
| 2 | Any authenticated user reads the paged announcement feed, newest first — `GET /api/announcements` | backend | 1 | pending | — | — |
| 3 | Admin "Announcement Composer" screen — compose form plus published-announcements list | screen | 1, 2 | pending | — | — |
| 4 | Associate "Announcements feed" screen — view-only | screen | 2 | pending | — | — |

**Dependency order:**

```
1 (entity + compose) ─→ 2 (feed read) ─┬─→ 3 (Admin Announcement Composer screen; also needs 1)
                                        └─→ 4 (Associate Announcements feed screen)
```

Units 3 and 4 are independent of each other.

## Unit detail

### 1. Admin composes and publishes an announcement

**Depends on:** none
**Refs:** Scope; Decisions 2, 3, 4, 5; Data model (entity constructor, `CreateAnnouncementRequest`, `AnnouncementResponse`); Flows "Compose & publish"; Error handling; Testing (`AnnouncementServiceTest` compose, controller, `SecurityConfigTest`); Resolved decisions 1

Acceptance criteria:
- `com.plotchain.announcement.Announcement` entity and `AnnouncementRepository` recreated against the existing `announcement` table; protected no-arg + public all-args constructor `(UUID id, String title, String body, Instant publishedAt, String audience)` like `RankTier`. No new migration; Hibernate schema validation passes against V1's table.
- ADMIN `POST /api/admin/announcements` with `CreateAnnouncementRequest(title, body)` persists a row with `publishedAt = now()`, `audience = "ALL"` regardless of request content, and returns 201 `AnnouncementResponse(id, title, body, publishedAt)` (Flows; Decision 2).
- Blank `title`, `title` > 300 chars, or blank `body` returns 400 via the existing `ApiExceptionHandler` (Error handling); no new exception type.
- ASSOCIATE token 403, unauthenticated 401; covered by the existing blanket write rule, NO `SecurityConfig` change (Decision 4); `SecurityConfigTest` rows added (associate 403, admin 201).
- No edit/unpublish/delete route and no status field exist (Decision 3; Resolved decisions 1).
- Not audit-logged: the spec does not call for `SettingsAuditService` (see Open questions 4).

### 2. Any authenticated user reads the paged announcement feed

**Depends on:** 1
**Refs:** Scope; Decisions 1, 4, 5; Data model (`findAllByOrderByPublishedAtDesc`, `AnnouncementPageResponse`); Flows "Read feed"; Testing

Acceptance criteria:
- `GET /api/announcements` returns 200 `AnnouncementPageResponse(announcements, page, size, totalElements)` ordered `publishedAt` DESC, shape as `AdminAssociatePageResponse`.
- `page` clamped `>= 0`, `size` clamped `<= 100`, same convention as `AdminAssociateController.list()` (Flows step 1).
- `audience` is neither returned nor filtered on (Decision 2).
- Admin and associate tokens both get 200; unauthenticated 401; falls to `anyRequest().authenticated()`, no `SecurityConfig` matcher (Decision 4); `SecurityConfigTest` rows.
- Test asserts feed order and page shape through the controller (no separate repository test per Testing).

### 3. Admin "Announcement Composer" screen

**Depends on:** 1, 2
**Refs:** role-capability spec "Screens" (Admin: Announcement Composer); this spec Flows, Decision 1 (admin sees what it published via the shared feed), Decision 3, Error handling

Acceptance criteria:
- Compose form (title with 300-char limit, body) calling unit 1; 400 field messages surfaced; success clears the form and the new item appears in the list.
- Paged list of published announcements from unit 2 (title, body, published date), newest first, shared pager; empty state.
- Form warns that publishing is immediate and permanent (Decision 3, Resolved decisions 1); no edit/delete affordance.
- Admin sidebar entry added and lazy route (see overlap check); live tokens and shared components; component/service specs; no e2e (deferred, see memory).
- Design folder `docs/design/admin_operational_screens/announcement_composer/` needed first (Open questions 1).

### 4. Associate "Announcements feed" screen

**Depends on:** 2
**Refs:** role-capability spec "Screens" (Associate: Announcements feed, view-only; Decision 4 responsive web); this spec Decision 1

Acceptance criteria:
- View-only paged feed of unit 2 (title, body, published date), newest first; empty state; error banner with retry.
- No compose/edit/delete affordance anywhere.
- Associate nav item and lazy route (see overlap check); responsive web; component/service specs; no e2e.
- Design folder `docs/design/associate_operational_screens/announcements_feed/` needed first (Open questions 1).

## Open questions

1. **Design mockups.** No design folder exists for either screen under `docs/design/`. Confirm whether to produce mockups before planning units 3 and 4.
2. **Dashboard teaser.** The associate dashboard mockup deliberately dropped the announcements strip. Spec says "that read path is untouched" but the path no longer exists. Slice does NOT re-add a "latest announcements" widget to either dashboard; say so if wanted (would be a new screen-type unit).
3. **Associate Notifications screen** (role-capability spec lists it separately) is out of scope here; announcements are in-app feed only.
4. **Audit logging.** The spec does not mention `SettingsAuditService`, so no new audit section and no CHECK widening is sliced. If the user wants composes audited, add to unit 1: a migration V44 widening `chk_settings_audit_log_section` (copy V43's list plus `'ANNOUNCEMENT'`) and a real-DB integration test that records that section (support-tickets shipped this exact bug, fixed in V43).
5. **Spec Context correction.** Confirm updating the spec's stale Context paragraph (entity/repo/`DashboardService` claims).

## Excluded — not a unit

- Audience targeting, edit/unpublish/delete, scheduled publishing, push/SMS/email delivery, pinning/expiry: Scope out-of-scope and Decisions 2, 3; Resolved decisions 1.
- Standalone "entity/schema", "DTOs" units: layer-shaped; folded into unit 1.
- Dedicated `AnnouncementRepositoryTest`: spec Testing says none.
- Dashboard widget on either dashboard (Open questions 2).

## File overlap check (done at slice time, 2026-10-08)

All other units in the status file are merged; no in-flight collision. Shared files:

- `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`: NO edit (Decision 4). `SecurityConfigTest` gains rows in units 1, 2 only.
- Migrations: highest is `V43`; next free is `V44`. Announcements needs none by default; V44 is claimed only if audit logging is added (Open questions 4), including the real-DB test for `chk_settings_audit_log_section`.
- `SettingsAuditService`: not used by default.
- `frontend/src/app/admin-nav-categories.model.ts` (+ spec): unit 3 adds a nav item.
- `frontend/src/app/associate-nav-items.model.ts` (+ spec; associate sidebar test currently asserts 9 items, becomes 10): unit 4 adds an item.
- `frontend/src/app/app.routes.ts` (+ spec): units 3 and 4 add lazy routes; units 3 and 4 touch the same file, so serialise or rebase.
- `frontend/src/styles/_admin.scss`: prefixes `.support-tickets*` and `.ticket-history*` are taken. Use `.announcement-composer*` (unit 3) and `.announcement-feed*` (unit 4).
- i18n `frontend/src/assets/i18n/en.json` and `hi.json`: units 3 and 4 add keys under a new `announcements` namespace; both files edited by both units, so rebase.
- Dashboard components: untouched (no widget, see Dashboard check).
- `docs/design/`: new folders needed for both screens; shared tokens not edited.
