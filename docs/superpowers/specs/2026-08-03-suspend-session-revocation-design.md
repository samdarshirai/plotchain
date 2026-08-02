# Design: Revoke live sessions on associate suspend

**Date:** 2026-08-03
**Source follow-up:** `docs/follow-ups/2026-08-02-admin-usage-suspend-session-revocation.md`
**Status:** Approved, pending implementation plan

## Problem

`AuthService.login()` rejects a `SUSPENDED` associate at login time, but there is no
corresponding check on already-issued JWTs. An associate who is suspended while holding a
still-valid token keeps full API access until that token naturally expires (up to
`jwt.expiration-minutes`, default 60). To an admin clicking "Suspend" in the Associate
Directory, the action looks immediate — the row updates to `SUSPENDED` right away — but the
associate's actual access is not cut off until their session times out.

## Approach

Add a per-request associate-status check to `JwtAuthenticationFilter`, backed by an in-process
Caffeine cache with explicit invalidation on suspend/reactivate. This bounds the exposure window
to effectively the associate's next request, without adding a cache/session-store dependency or
a DB read on every authenticated request in the steady state.

Two cheaper alternatives were considered and rejected as insufficient on their own:

- **Shorten JWT TTL** — reduces the exposure window but doesn't close it; still relies on the
  token expiring naturally.
- **TTL-only cache (no explicit eviction)** — simpler, but reintroduces a bounded delay (up to
  the cache TTL) after suspend, the same class of gap this fix is meant to close, just smaller.

A full token-blocklist/revocation-table was also considered and rejected as more infrastructure
than this gap warrants; the per-request status check achieves the same practical outcome
(next-request revocation) without a new table or cleanup job.

## Components

### 1. Dependency

Add `com.github.ben-manes.caffeine:caffeine` to `backend/pom.xml`. Used directly (not Spring's
`@Cacheable` annotation abstraction) so eviction can be triggered explicitly from
`AdminAssociateService`, and so a cache miss / not-found associate has clear, testable
fail-closed behavior.

### 2. `AssociateStatusCache`

New component: `backend/src/main/java/com/plotchain/associate/AssociateStatusCache.java`.

- Wraps a `Cache<UUID, AssociateStatus>` (Caffeine), `expireAfterWrite(30s)` as a safety net for
  any eviction path that's missed, `maximumSize(10_000)`.
- `boolean isActive(UUID associateId)` — loads via
  `associateRepository.findById(id).map(Associate::getStatus)` on cache miss. A missing
  associate (deleted, or id doesn't exist) is treated as not-active — fail closed.
- `void evict(UUID associateId)` — invalidates a single entry.

### 3. `JwtAuthenticationFilter`

Gains an `AssociateStatusCache` constructor parameter. After `jwtService.authenticate(token)`
returns a present `AuthenticatedAssociate`, and before populating `SecurityContextHolder`, the
filter checks `associateStatusCache.isActive(authenticated.associateId())`. If false, it skips
setting the authentication — the same fall-through-to-unauthenticated pattern already used for
malformed tokens in this filter. The request then hits `anyRequest().authenticated()` in
`SecurityConfig` and gets a 401 via the existing `authenticationEntryPoint`, with no new error
path to build.

### 4. `AdminAssociateService`

`suspend(UUID id, UUID actorId)` and `reactivate(UUID id, UUID actorId)` both call
`associateStatusCache.evict(id)` immediately after `associateRepository.save(associate)`. This
covers both directions: a suspended associate is blocked on their very next request, and a
reactivated associate isn't left locked out for up to 30 seconds by a stale cached `SUSPENDED`
value.

## Data flow

1. Admin clicks Suspend → `AdminAssociateService.suspend()` → DB write (`status = SUSPENDED`) →
   `associateStatusCache.evict(id)`.
2. Associate's next API call arrives with their still-valid, unexpired JWT.
3. `JwtAuthenticationFilter` calls `associateStatusCache.isActive(id)` → cache miss (just
   evicted) → reloads from DB → sees `SUSPENDED` → returns `false`.
4. Filter leaves `SecurityContextHolder` unauthenticated → request falls through to
   `anyRequest().authenticated()` → 401.

## Testing

- `AssociateStatusCache`: unit tests for active / suspended / associate-not-found / eviction
  (post-eviction lookup re-reads from the repository).
- `JwtAuthenticationFilterTest`: extend with a suspended-associate case (mock
  `AssociateStatusCache.isActive()` returning `false`) asserting an empty security context,
  alongside the existing valid-token and no-header cases.
- `AdminAssociateService` suspend/reactivate tests: verify `associateStatusCache.evict(id)` is
  invoked (mock verification).

## Explicitly out of scope

- Frontend confirm-dialog copy about revocation timing. The Suspend button currently fires
  directly with no confirm step; the gap this fix closes shrinks to effectively the next request
  (bounded by the 30s cache TTL only on the eviction-miss edge case), so the caveat the follow-up
  doc suggested surfacing mostly evaporates. No frontend change in this design.
- Token blocklist/revocation-table infrastructure.
- Changes to `jwt.expiration-minutes`.
- Per-role or per-endpoint session policy — this affects all associate roles uniformly, matching
  `AuthService.login()`'s existing status check.
