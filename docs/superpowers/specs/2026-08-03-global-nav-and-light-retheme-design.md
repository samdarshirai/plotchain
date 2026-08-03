# Global nav + light retheme

**Date:** 2026-08-03
**Source follow-up:** [docs/follow-ups/2026-08-03-no-global-nav-into-settings.md](../../follow-ups/2026-08-03-no-global-nav-into-settings.md)
**Status:** Approved, ready for implementation plan

## Problem

`AppComponent`'s header renders only a Log Out button. No area of the app links to any other area: `/dashboard`, `/admin/associates/new` (chromeless), `/setup/*`, and `/settings/*` are each islands. An admin who lands on `/dashboard` (the default post-login redirect) has no in-app way to reach Settings, Associate Directory, KYC Queue, or Provision Associate — Settings itself is a closed loop, with no way back out to Dashboard.

Separately: while scoping the fix, it came out that the app's default theme is dark (`_tokens.scss` `:root`), and three routes (`/login`, `/setup`, `/admin/associates/new`) carry near-duplicate scoped light-theme overrides as deliberate exceptions (per existing code comments) to avoid a header/body theme clash. That clash is exactly what would block putting a real header on `/admin/associates/new`, so this spec folds in retiring the dark theme app-wide rather than adding a fourth special case.

## Decisions

1. **Nav items:** Dashboard, Provision Associate, Settings — added to the existing global `app-header`.
2. **Role gating:** mirrors `admin.guard.ts`'s `ADMIN_FAMILY_ROLES` set (`ADMIN`, `SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`). Plain `ASSOCIATE` role sees only Dashboard (Provision Associate and Settings are admin-family-only routes). Dashboard is shown for every authenticated role, including `ASSOCIATE` — its widgets (earnings, downline/team snapshot) are the content that role cares about, so the link is useful even though it's usually already the page they're on.
3. **Theme scope: everywhere.** The dark theme retires app-wide, not just in the header. Leaving Dashboard/Settings dark under a light header would split the app visually down the middle.
4. **Canonical palette:** unify on the palette currently used by `/login` and `/admin/associates/new` (`#f8f9ff` / `#ffffff` / `#eff4ff` / `#c2c6d9` / `#0b1c30` / `#424656`) — it's the mockup-driven palette and two of the three existing light routes already use it. `/setup`'s slightly different palette (`#F7F7FB` / `#1B1B1F` etc.) is retired in favor of this one.
5. **Chromeless routes:** `/admin/associates/new` gains the real global header/nav — it was the one page identified as a dead end with zero way out, and there's no longer a theme clash to justify hiding the header there. `/setup` stays chromeless (its own step-nav only, no global header) — it's a guided, pre-launch-only wizard (`setupModeGuard`) where Dashboard/Settings links wouldn't fully apply yet, and cross-navigation would undercut the focused wizard UX.

## Design

### Token flip

`frontend/src/styles/_tokens.scss` `:root` surface/text tokens change from the dark set to:

```
--surface-page: #f8f9ff;
--surface-card: #ffffff;
--surface-raised: #eff4ff;
--border-subtle: #c2c6d9;
--text-primary: #0b1c30;
--text-muted: #424656;
```

`--brand-*` and `--status-*` tokens are untouched.

### Dead override cleanup

Since the three scoped overrides become byte-identical (or near enough, by design decision) to the new global default, they're deleted rather than left redundant:

- `frontend/src/styles/_setup-theme.scss` — deleted entirely (pure color override, no non-color rules in the file).
- `frontend/src/styles/_admin.scss` — delete the `body.admin-associate-active, .create-associate { --surface-page: ...; }` color block. Keep the separate hidden-scrollbar rule block (`body.admin-associate-active { scrollbar-width: none; ... }`) — unrelated to color, still wanted.
- `frontend/src/styles/_app-shell.scss` — delete the `body.login-active { --surface-page: #f8f9ff; }` rule, and delete `.login-form`'s five custom-property redeclarations (`--surface-card`, `--surface-raised`, `--border-subtle`, `--text-primary`, `--text-muted`) since they now match `:root` exactly. Keep `.login-form`'s structural rules (layout, shadow, font-family).

### AppComponent changes

`frontend/src/app/app.component.ts`:
- Remove the `login-active` body-class toggle (no stylesheet consumer left after the cleanup above).
- `isChromelessRoute` narrows from `isSetupRoute || isAdminAssociateRoute` to `isSetupRoute` only.
- Keep the `admin-associate-active` class toggle — still needed for the scrollbar-hiding rule.
- Update the class-level comment: the old rationale (dark header can't reach a light sibling/ancestor) no longer applies to `/admin/associates/new` since there's one global theme now; it still applies conceptually to why `/setup` stays chromeless (wizard focus, not a theme clash).

`frontend/src/app/app.component.html`:
- Replace the bare `<header>` with: Dashboard link (all authenticated roles) + Provision Associate / Settings links (admin-family only, gated via `ADMIN_FAMILY_ROLES` imported from `admin.guard.ts`) + existing Logout button.
- Active route gets a visual active-state (e.g. `routerLinkActive`), consistent with existing nav patterns (`settings-nav-rail`, `setup-step-nav`).

### i18n

New keys in `frontend/src/assets/i18n/en.json` and `hi.json` under a `nav` object: `dashboard`, `provisionAssociate`, `settings`.

### Data flow / role gating

No new state. Nav visibility reads `authService.getRole()` against the same `ADMIN_FAMILY_ROLES` set the route guards already use — a link is never shown for a route the current role can't reach. `/setup` is deliberately excluded from the global nav. Clicking "Settings" pre-launch still redirects to `/setup/<first incomplete step>` via the existing `launchedModeGuard` — no special-casing needed in the nav markup itself.

## Explicitly out of scope

- `/setup` gaining the global nav (it keeps its own step-nav only).
- Any further visual polish beyond the token flip — e.g. re-checking `--status-success` / `--status-warning` / `--status-danger` contrast on the new light backgrounds, or hardcoded-dark styles in individual components (Dashboard widgets, Settings section pages) that don't use the shared tokens. If the visual check during implementation turns up any, file them as quick follow-up fixes rather than expanding this spec.

## Testing

- Update `app.component.spec.ts` for the narrowed `isChromelessRoute` logic and for nav-link role visibility (associate vs. admin-family).
- Manual visual pass in the browser: confirm Dashboard and Settings (and its section pages) read correctly on the new light tokens, and that `/admin/associates/new` looks right with the header now present above its mockup-driven layout.
