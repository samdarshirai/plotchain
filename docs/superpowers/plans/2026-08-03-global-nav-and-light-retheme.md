# Global Nav + Light Retheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every authenticated route a real global nav (Dashboard / Provision Associate / Settings, role-gated) by first retiring the app's dark default theme in favor of the light palette already used by `/login` and `/admin/associates/new`, which removes the header/body theme clash that made those routes chromeless in the first place.

**Architecture:** Flip the color tokens in `_tokens.scss` from dark to the light palette, delete the three now-redundant scoped light-theme overrides (`_setup-theme.scss`, `_admin.scss`'s color block, `_app-shell.scss`'s login block), narrow `AppComponent.isChromelessRoute` so only `/setup` stays chromeless, then add role-gated `routerLink`s to the header using the existing `ADMIN_FAMILY_ROLES` set.

**Tech Stack:** Angular 17 standalone components, SCSS with CSS custom properties, `@ngx-translate/core`, Karma/Jasmine (`ng test`).

## Global Constraints

- Canonical light palette (from spec): `--surface-page:#f8f9ff; --surface-card:#ffffff; --surface-raised:#eff4ff; --border-subtle:#c2c6d9; --text-primary:#0b1c30; --text-muted:#424656`. `--brand-*` and `--status-*` tokens are untouched.
- `/setup` stays chromeless (its own step-nav only) — never gets the global header.
- Nav role gating reuses `ADMIN_FAMILY_ROLES` from `frontend/src/app/admin/admin.guard.ts` — no new role logic.
- Every user-facing string goes through `@ngx-translate/core` — add matching keys to both `frontend/src/assets/i18n/en.json` and `hi.json`.
- Frontend test command: `npm test -- --watch=false --browsers=ChromeHeadless` (run from `frontend/`). Build verify command: `npm run build` (from `frontend/`).

---

### Task 1: Flip global color tokens to the light palette

**Files:**
- Modify: `frontend/src/styles/_tokens.scss`

**Interfaces:**
- Produces: `:root`'s `--surface-page`, `--surface-card`, `--surface-raised`, `--border-subtle`, `--text-primary`, `--text-muted` now resolve to light values everywhere in the app. Every later task and every existing component that reads these tokens picks up the new values automatically — no component code changes needed for the color flip itself.

This is a pure design-token change with no assertable logic, so verification is a successful build rather than a unit test (the visual result is checked in Task 5).

- [ ] **Step 1: Replace the dark token values with the light palette**

Current `frontend/src/styles/_tokens.scss`:

```scss
:root {
  --brand-primary: #7C3AED;
  --brand-secondary: #22D3EE;

  --brand-gradient: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  --brand-primary-soft: color-mix(in srgb, var(--brand-primary) 14%, transparent);
  --brand-primary-hover: color-mix(in srgb, var(--brand-primary) 85%, white);
  --brand-secondary-soft: color-mix(in srgb, var(--brand-secondary) 14%, transparent);
  --brand-primary-contrast: #FFFFFF; /* recomputed by ThemeService per chosen color */

  --surface-page: #0F1420;
  --surface-card: #151B2B;
  --surface-raised: #1C2436;
  --border-subtle: #263148;
  --text-primary: #E8ECF6;
  --text-muted: #8C98B4;
  --status-success: #34D399;
  --status-warning: #F59E0B;
  --status-danger: #F87171;

  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

Replace the `--surface-*` / `--text-*` block with:

```scss
:root {
  --brand-primary: #7C3AED;
  --brand-secondary: #22D3EE;

  --brand-gradient: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  --brand-primary-soft: color-mix(in srgb, var(--brand-primary) 14%, transparent);
  --brand-primary-hover: color-mix(in srgb, var(--brand-primary) 85%, white);
  --brand-secondary-soft: color-mix(in srgb, var(--brand-secondary) 14%, transparent);
  --brand-primary-contrast: #FFFFFF; /* recomputed by ThemeService per chosen color */

  // Light theme is the app's single default (previously dark; /login, /setup, and
  // /admin/associates/new each carried their own scoped light override to avoid clashing with
  // this file's old dark default -- now that this IS the default, those overrides are deleted
  // in a later task rather than left as redundant duplicates).
  --surface-page: #f8f9ff;
  --surface-card: #ffffff;
  --surface-raised: #eff4ff;
  --border-subtle: #c2c6d9;
  --text-primary: #0b1c30;
  --text-muted: #424656;
  --status-success: #34D399;
  --status-warning: #F59E0B;
  --status-danger: #F87171;

  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}
```

- [ ] **Step 2: Verify the app still builds**

Run (from `frontend/`): `npm run build`
Expected: build succeeds with no SCSS or compilation errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/_tokens.scss
git commit -m "style: flip global theme tokens from dark to light"
```

---

### Task 2: Delete the now-redundant scoped light-theme overrides

**Files:**
- Delete: `frontend/src/styles/_setup-theme.scss`
- Modify: `frontend/src/styles.scss`
- Modify: `frontend/src/styles/_admin.scss`
- Modify: `frontend/src/styles/_app-shell.scss`

**Interfaces:**
- Consumes: the light `:root` tokens from Task 1.
- Produces: `/login`, `/setup`, and `/admin/associates/new` now render their colors purely from `:root` — no scoped override left. `body.admin-associate-active`'s hidden-scrollbar rule in `_admin.scss` is untouched (it's cosmetic, unrelated to color).

- [ ] **Step 1: Delete `_setup-theme.scss` and its import**

Delete the file `frontend/src/styles/_setup-theme.scss` entirely — it contains only the now-redundant color override (its 6 custom-property values are superseded by Task 1's `:root` values).

In `frontend/src/styles.scss`, remove the line:

```scss
@use 'styles/setup-theme';
```

- [ ] **Step 2: Remove the redundant color block from `_admin.scss`, keep the scrollbar rule**

Current top of `frontend/src/styles/_admin.scss`:

```scss
// Provision-a-new-associate is themed after its Stitch mockup (docs/design/
// stitch_premium_admin_setup_wizard/new_associate) rather than the app's default dark
// tokens -- scoped the same way _setup-theme.scss scopes the wizard's light theme. Brand
// primary/secondary/gradients are deliberately NOT overridden here, for the same reason
// _setup-theme.scss leaves them alone: ThemeService writes them per-tenant, and freezing them
// to the mockup's literal blue would undo that personalization.
body.admin-associate-active,
.create-associate {
  --surface-page: #f8f9ff;
  --surface-card: #ffffff;
  --surface-raised: #eff4ff;
  --border-subtle: #c2c6d9;
  --text-primary: #0b1c30;
  --text-muted: #424656;
}

// Matches the mockup's own hidden-scrollbar chrome (code.html's ::-webkit-scrollbar{display:
// none}). Scoped to this route's body class, not global -- only this chromeless page opts out
// of the browser scrollbar; scrolling itself still works.
body.admin-associate-active {
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}
```

Replace with (delete the color block, keep the scrollbar block, update the comment since the color rationale no longer applies):

```scss
// Matches the mockup's own hidden-scrollbar chrome (code.html's ::-webkit-scrollbar{display:
// none}). Scoped to this route's body class, not global -- only this page opts out of the
// browser scrollbar; scrolling itself still works. (Colors used to be scoped here too, back
// when the app's default theme was dark -- now that light is the global default, this page's
// colors come from :root like everywhere else.)
body.admin-associate-active {
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}
```

- [ ] **Step 3: Remove the redundant color overrides from `_app-shell.scss`**

Current relevant section of `frontend/src/styles/_app-shell.scss`:

```scss
// /login is themed after the same Stitch mockup as create-associate (docs/design/
// stitch_premium_admin_setup_wizard/new_associate) -- light surfaces, soft shadow instead of a
// border, Inter/JetBrains Mono type. Brand primary/gradient stay dynamic (per-tenant, written by
// ThemeService), same reasoning as _setup-theme.scss and _admin.scss. body.login-active flips
// the page background too, since the ancestor <body> is outside .login-form's own scope.
body.login-active {
  --surface-page: #f8f9ff;
}

.login-form {
  --surface-card: #ffffff;
  --surface-raised: #eff4ff;
  --border-subtle: #c2c6d9;
  --text-primary: #0b1c30;
  --text-muted: #424656;

  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 360px;
  margin: 4rem auto;
  padding: 2.5rem;
  background: var(--surface-card);
  border: none;
  border-radius: 20px;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08);
  font-family: 'Inter', var(--font-sans);
}
```

Replace with (drop the `body.login-active` rule and `.login-form`'s five redundant custom-property redeclarations, keep the structural rules):

```scss
// /login is themed after the same Stitch mockup as create-associate (docs/design/
// stitch_premium_admin_setup_wizard/new_associate) -- soft shadow instead of a border,
// Inter/JetBrains Mono type. Brand primary/gradient stay dynamic (per-tenant, written by
// ThemeService). Colors come from :root -- light is the global default now, so no scoped
// override is needed here.
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 360px;
  margin: 4rem auto;
  padding: 2.5rem;
  background: var(--surface-card);
  border: none;
  border-radius: 20px;
  box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.08);
  font-family: 'Inter', var(--font-sans);
}
```

- [ ] **Step 4: Verify the app still builds**

Run (from `frontend/`): `npm run build`
Expected: build succeeds with no SCSS or compilation errors (in particular, no "file not found" error from the removed `@use 'styles/setup-theme';`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/styles.scss frontend/src/styles/_admin.scss frontend/src/styles/_app-shell.scss
git rm frontend/src/styles/_setup-theme.scss
git commit -m "style: delete scoped light-theme overrides now redundant with the global default"
```

---

### Task 3: Narrow chromeless routing to `/setup` only

**Files:**
- Modify: `frontend/src/app/app.component.ts`
- Modify: `frontend/src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: `AppComponent.isChromelessRoute` (existing public property, read by `app.component.html`'s `*ngIf`).
- Produces: `isChromelessRoute` is now `true` only when `isSetupRoute` is true. `/admin/associates/new` no longer sets it. The `login-active` body-class toggle is removed (no stylesheet consumer left after Task 2). The `admin-associate-active` toggle stays (still drives the scrollbar-hiding rule from Task 2).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/app.component.spec.ts` (after the existing last `it(...)` block, before the closing `});`):

```typescript
  it('shows the header on /admin/associates/new now that it is no longer chromeless', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    fixture.detectChanges();

    (app as unknown as { updateSetupRouteState(url: string): void }).updateSetupRouteState('/admin/associates/new');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-header')).toBeTruthy();
  });

  it('keeps the header hidden on /setup routes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    fixture.detectChanges();

    (app as unknown as { updateSetupRouteState(url: string): void }).updateSetupRouteState('/setup/company-profile');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-header')).toBeFalsy();
  });
```

- [ ] **Step 2: Run the tests to verify the first one fails**

Run (from `frontend/`): `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: `shows the header on /admin/associates/new now that it is no longer chromeless` FAILS (header still hidden, since `isChromelessRoute` is currently `isSetupRoute || isAdminAssociateRoute`). The `/setup` test passes already (no behavior change there yet).

- [ ] **Step 3: Narrow `isChromelessRoute` in `app.component.ts`**

Current `frontend/src/app/app.component.ts`:

```typescript
// /setup and /admin/associates/new are fully light-themed (see _setup-theme.scss and
// _admin.scss), but those overrides are scoped to their own root class -- neither can reach
// this component's own dark app-header (a sibling, not an ancestor) or <body>'s default dark
// background (an ancestor, so inheritance doesn't flow to it). Both are handled here instead:
// the header is removed from the DOM entirely on these chromeless routes, and a body class
// carries the same light tokens so there's no dark edge/gap around the page.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TranslateModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private navigationSubscription?: Subscription;

  isSetupRoute = false;
  isChromelessRoute = false;

  ngOnInit(): void {
    this.updateSetupRouteState(this.router.url);
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.updateSetupRouteState(event.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private updateSetupRouteState(url: string): void {
    this.isSetupRoute = url.startsWith('/setup');
    this.document.body.classList.toggle('setup-active', this.isSetupRoute);
    const isAdminAssociateRoute = url.startsWith('/admin/associates/new');
    this.document.body.classList.toggle('admin-associate-active', isAdminAssociateRoute);
    this.isChromelessRoute = this.isSetupRoute || isAdminAssociateRoute;
    // /login never shows the app-header (it only renders once authenticated), so it just needs
    // the body background flipped light -- no header/DOM removal to handle here.
    this.document.body.classList.toggle('login-active', url.startsWith('/login'));
  }
}
```

Replace with:

```typescript
// /setup is a guided, pre-launch-only wizard (setupModeGuard) with its own dedicated
// step-nav -- it stays chromeless (no global header) so cross-navigation doesn't undercut the
// focused wizard UX. /admin/associates/new used to be chromeless too, back when the app's
// default theme was dark and this route's light theme would have clashed with a dark header;
// now that light is the app's single global theme (see _tokens.scss), that clash no longer
// exists, so this route renders the real global header like every other authenticated route.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, TranslateModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private navigationSubscription?: Subscription;

  isSetupRoute = false;
  isChromelessRoute = false;

  ngOnInit(): void {
    this.updateSetupRouteState(this.router.url);
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(event => this.updateSetupRouteState(event.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.navigationSubscription?.unsubscribe();
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private updateSetupRouteState(url: string): void {
    this.isSetupRoute = url.startsWith('/setup');
    this.document.body.classList.toggle('setup-active', this.isSetupRoute);
    // Still toggled for _admin.scss's hidden-scrollbar rule, even though this route is no
    // longer chromeless.
    this.document.body.classList.toggle('admin-associate-active', url.startsWith('/admin/associates/new'));
    this.isChromelessRoute = this.isSetupRoute;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `frontend/`): `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: all tests PASS, including the two added in Step 1.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/app.component.ts frontend/src/app/app.component.spec.ts
git commit -m "fix: stop treating /admin/associates/new as a chromeless route"
```

---

### Task 4: Add role-gated global nav to the header

**Files:**
- Modify: `frontend/src/app/app.component.ts`
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts`
- Modify: `frontend/src/styles/_app-shell.scss`
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: `ADMIN_FAMILY_ROLES` (`Set<string>`, exported from `frontend/src/app/admin/admin.guard.ts`), `authService.getRole(): string | null`.
- Produces: `AppComponent.isAdminFamily` (public getter, `boolean`) — later work reads this the same way the template does.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/app/app.component.spec.ts` (after the tests added in Task 3):

```typescript
  it('shows only the Dashboard nav link for a plain associate role', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav__link')).map(el => el.textContent?.trim());
    expect(links).toEqual(['Dashboard']);
  });

  it('shows Dashboard, Provision Associate, and Settings nav links for an admin-family role', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav__link')).map(el => el.textContent?.trim());
    expect(links).toEqual(['Dashboard', 'Provision Associate', 'Settings']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `frontend/`): `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: both new tests FAIL with 0 elements matching `.app-nav__link` (the markup doesn't exist yet).

- [ ] **Step 3: Add the `isAdminFamily` getter to `app.component.ts`**

In `frontend/src/app/app.component.ts`, add the import and getter:

```typescript
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { filter, Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { ADMIN_FAMILY_ROLES } from './admin/admin.guard';
```

Update the `@Component` decorator's `imports` array:

```typescript
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TranslateModule],
```

Add this getter inside the `AppComponent` class, after the `isChromelessRoute` field:

```typescript
  get isAdminFamily(): boolean {
    const role = this.authService.getRole();
    return role !== null && ADMIN_FAMILY_ROLES.has(role);
  }
```

- [ ] **Step 4: Add the nav markup to `app.component.html`**

Current `frontend/src/app/app.component.html`:

```html
<header class="app-header" *ngIf="authService.isAuthenticated() && !isChromelessRoute">
  <button type="button" class="logout" (click)="onLogout()">{{ 'auth.logout' | translate }}</button>
</header>
<router-outlet></router-outlet>
```

Replace with:

```html
<header class="app-header" *ngIf="authService.isAuthenticated() && !isChromelessRoute">
  <nav class="app-nav">
    <a class="app-nav__link" routerLink="/dashboard" routerLinkActive="app-nav__link--active">{{ 'nav.dashboard' | translate }}</a>
    <ng-container *ngIf="isAdminFamily">
      <a class="app-nav__link" routerLink="/admin/associates/new" routerLinkActive="app-nav__link--active">{{ 'nav.provisionAssociate' | translate }}</a>
      <a class="app-nav__link" routerLink="/settings" routerLinkActive="app-nav__link--active">{{ 'nav.settings' | translate }}</a>
    </ng-container>
  </nav>
  <button type="button" class="logout" (click)="onLogout()">{{ 'auth.logout' | translate }}</button>
</header>
<router-outlet></router-outlet>
```

- [ ] **Step 5: Style the nav in `_app-shell.scss`**

In `frontend/src/styles/_app-shell.scss`, change `.app-header`'s `justify-content` so the nav sits left and the logout button stays right:

Current:

```scss
.app-header {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 1rem 1.5rem;
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-subtle);
}
```

Replace with:

```scss
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-subtle);
}
```

Add new rules directly after `.app-header .logout:hover { ... }`:

```scss
.app-nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.app-nav__link {
  padding: 0.5rem 0.875rem;
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--text-muted);
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
}

.app-nav__link:hover {
  background: var(--surface-raised);
  color: var(--text-primary);
}

.app-nav__link--active {
  background: var(--brand-primary-soft);
  color: var(--text-primary);
  font-weight: 600;
}
```

- [ ] **Step 6: Add the translation keys**

In `frontend/src/assets/i18n/en.json`, add a new top-level `"nav"` object right after the closing `}` of `"dashboard"` (i.e. before `"auth": {`):

```json
  "nav": {
    "dashboard": "Dashboard",
    "provisionAssociate": "Provision Associate",
    "settings": "Settings"
  },
```

In `frontend/src/assets/i18n/hi.json`, add the matching object in the same position:

```json
  "nav": {
    "dashboard": "डैशबोर्ड",
    "provisionAssociate": "एसोसिएट पंजीकृत करें",
    "settings": "सेटिंग्स"
  },
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (from `frontend/`): `npm test -- --watch=false --browsers=ChromeHeadless`
Expected: all tests PASS, including the two added in Step 1.

- [ ] **Step 8: Verify the app builds**

Run (from `frontend/`): `npm run build`
Expected: build succeeds with no errors (in particular, no missing-translation-key or invalid-JSON errors).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/app/app.component.ts frontend/src/app/app.component.html frontend/src/app/app.component.spec.ts frontend/src/styles/_app-shell.scss frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat: add role-gated global nav (Dashboard/Provision Associate/Settings) to the header"
```

---

### Task 5: Manual visual verification pass

**Files:** none (no code changes expected; if this turns up a visual bug, fix it here and note it as a small follow-up commit rather than expanding the scope of Tasks 1-4).

- [ ] **Step 1: Serve the app**

Run (from `frontend/`): `npm start`
Open `http://localhost:4200`.

- [ ] **Step 2: Verify the admin-family view**

Log in with an admin-family role (e.g. `admin` / `Password123!`, per the follow-up doc's repro steps).
Confirm:
- Dashboard, Provision Associate, and Settings links all appear in the header, and the active one is visually highlighted as you navigate between them.
- Dashboard renders correctly on the new light background (no leftover dark-assuming styles on any widget: wallet card, team snapshot, rank progress, cycle income card, leg volume gauge, cycle countdown, announcements strip, quick actions, KYC banner).
- Settings shell and each of its section pages (Company Profile, Branding, Compensation, Projects, Payments & KYC, Admin Team, Root Associates, Associate Directory, Tree Explorer, KYC Queue, Audit Log) render correctly on light.
- `/admin/associates/new` now shows the header with working nav links, and its own light-themed content still looks correct (no double borders or layout shift from the header now being present).

- [ ] **Step 3: Verify the plain-associate view**

Log in with a plain `ASSOCIATE` role.
Confirm only the Dashboard link appears (no Provision Associate or Settings link), and the Dashboard content itself renders correctly on light.

- [ ] **Step 4: Verify `/setup` is untouched**

As an admin-family user on an instance that hasn't launched yet (or by navigating directly to `/setup/company-profile` if setup mode is active), confirm:
- No global header/nav appears — only the wizard's own step-nav.
- The wizard still renders on light (previously its own scoped light theme; now the same light values via the global default) with no visual regression.

- [ ] **Step 5: Note any visual issues found**

If anything looks wrong (e.g. a component with a hardcoded dark-assuming color that doesn't use the shared tokens), fix it directly if it's a one-line token/color swap, or file it as a quick follow-up doc under `docs/follow-ups/` if it needs more investigation — per the spec, this is explicitly out of scope to expand into a bigger effort here.
