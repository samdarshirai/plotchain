# Follow-up: Suspending an associate doesn't revoke their live session

**Filed:** 2026-08-02
**Source:** Final whole-branch review of `docs/superpowers/plans/2026-08-02-admin-usage-core-ops.md` (Task 1), after all 7 tasks landed on `master`.
**Status:** Open — documented known limitation, not a regression

## What's missing

`AuthService.login()` (`backend/src/main/java/com/plotchain/auth/AuthService.java`) rejects a `SUSPENDED` associate at login time. There is no corresponding check on already-issued JWTs and no token blocklist/revocation mechanism. An associate who is suspended while holding a still-valid token keeps full API access until that token naturally expires.

To an admin clicking "Suspend" in the Associate Directory, the action reads as immediate — the associate's row updates to `SUSPENDED` right away — but the associate's actual access is not cut off until their session times out.

## Why this happened

This is a scope boundary, not a bug: `docs/superpowers/plans/2026-08-02-admin-usage-core-ops.md` Task 1 was explicitly scoped to "the login gate" (see Task 1's title and Interfaces section) and never claimed to cover live-session revocation. The final whole-branch review flagged it as a gap worth documenting explicitly rather than leaving implicit, since the admin-facing UI doesn't currently communicate this limitation anywhere.

## Suggested scope for the fix

Pick one, roughly in order of cost:

1. **Cheapest — shorten JWT TTL.** Bounds the exposure window without touching the auth architecture. Doesn't eliminate the gap, just shrinks it.
2. **Per-request status check.** Add a status lookup to the JWT filter's user-resolution path (`JwtAuthenticationFilter` / wherever the principal gets resolved per-request) so a `SUSPENDED` associate is rejected on their next request, not just their next login. Adds a DB read (or cache read) per authenticated request — needs a caching strategy to avoid a query-per-request cost regression.
3. **Token blocklist/revocation list.** Most complete fix; requires infrastructure (e.g. a revoked-token-ids table or cache, checked per request) beyond what this plan scoped.

Also worth doing regardless of which mechanism is chosen: surface this limitation in the Associate Directory's suspend confirmation UI (e.g. "Access is revoked at their next login or within N minutes" — non-technical, worded transparently) so admins aren't misled by the immediate-looking status change.
