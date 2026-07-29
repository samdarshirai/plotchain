# Remove tenant_id (single-tenant simplification)

**Supersedes:** the multi-tenancy requirements in `land-mlm-platform-prd.md` (§2 goals, §4 persona, §5.3, §8 NFR, etc.) and the `tenant_id` field carried by entities in `docs/superpowers/specs/2026-07-29-mlm-land-platform-gaps-dashboard-design.md` (§4). Both documents predate the single-tenant product decision below.

## Context

The dashboard endpoint `GET /api/associates/{associateId}/dashboard` returns HTTP 400 because the frontend's default route (`/dashboard/me`) sends the literal string `"me"` where the backend expects a UUID `associateId`. Fixing that requires building real auth (login, roles, resolving the caller's identity server-side) — see the companion auth design (separate spec, built after this one).

Before building auth, the product direction was clarified: this is a **single-tenant** application (one deployment, one organization) with two roles — admin and associate — not a multi-tenant SaaS product. However, the schema and every repository/service already carry a `tenant_id` column and filter by it (added in a prior "tenant scoping" fix, commit `5dca67f`). Building auth on top of that would require inventing a tenant-resolution story (where does the JWT's tenant claim come from? is there ever more than one tenant row?) for a concept the product doesn't need.

This spec removes `tenant_id` entirely so the auth work (next spec) doesn't have to account for it.

## Scope

Only one migration exists (`V1__create_dashboard_tables.sql`) and nothing has been deployed with real data, so `tenant_id` is edited out of `V1` directly rather than added as a new `ALTER TABLE` migration. No new tables, no data backfill.

## Changes

**Migration** — `backend/src/main/resources/db/migration/V1__create_dashboard_tables.sql`:
- Remove the `tenant_id UUID NOT NULL` column from every table that has it: `rank_tier`, `associate`, `cycle`, `ledger_entry`, `leg_volume`, `wallet`, `announcement`.
- Drop `idx_associate_tenant_id`.
- `UNIQUE (tenant_id, rank_order)` on `rank_tier` → `UNIQUE (rank_order)`.
- `idx_announcement_tenant_published` (`tenant_id, published_at DESC`) → index on `published_at DESC` alone.

**Entities** — remove the `tenantId` field, getter, setter, and any constructor/factory parameter that carries it:
- `Associate`, `Cycle`, `LedgerEntry`, `Wallet` (incl. `Wallet.zero(associateId, tenantId)` → `Wallet.zero(associateId)`), `LegVolume` (incl. `LegVolume.empty(associateId, cycleId, tenantId)` → `LegVolume.empty(associateId, cycleId)`), `RankTier` (constructor drops the `tenantId` parameter), `Announcement`.

**Repositories**:
- `AssociateRepository` — the three native `@Query` methods (`countDownline`, `countActiveToday`, `countJoinedBetween`) drop the `tenant_id = :tenantId` clause and the `tenantId` method parameter.
- `CycleRepository.findFirstByTenantIdAndStatusOrderByPeriodStartDesc(UUID, CycleStatus)` → `findFirstByStatusOrderByPeriodStartDesc(CycleStatus)`.
- `RankTierRepository.findByTenantIdOrderByRankOrder(UUID)` → `findAllByOrderByRankOrder()`.
- `AnnouncementRepository.findTop5ByTenantIdOrderByPublishedAtDesc(UUID)` → `findTop5ByOrderByPublishedAtDesc()`.

**`NoOpenCycleException`** — constructor currently takes `tenantId` to build the message (`"No open cycle for tenant: " + tenantId`). Change to a no-arg constructor with a fixed message (`"No open cycle"`).

**`DashboardService`** — drop every `tenantId` lookup and pass-through between the calls above; update call sites for the changed method signatures.

**Tests** — strip `tenantId` setup and parameters from `DashboardServiceTest`, `DashboardControllerTest`, `AssociateRepositoryTest`. `AssociateRepositoryTest` has a cross-tenant isolation test case (asserting an associate in a different tenant isn't counted in downline) — delete that test case, since cross-tenant isolation is no longer a concept the system has.

## Out of scope

- Auth, login, roles, JWT — separate spec, built after this one.
- Any new migration mechanics — this is a direct edit of the one existing migration.
