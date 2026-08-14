# Role-Capability Unit 16: Associate "Digital ID Card" Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give any authenticated Associate a read-only screen that renders their own digital ID card (ID number, name, rank, a photo area, and the QR verification code), consuming the already-merged `GET /api/associates/me/id-card` endpoint (role-capability unit 10). This is role-capability unit 16 — the last screen unit in `docs/superpowers/plans/2026-08-03-role-capability-units.md`.

**Architecture:** A new top-level Angular feature folder `frontend/src/app/digital-id-card/` (sibling to `dashboard/`/`sales-history/`, not nested under `admin/` or `settings/` — those are admin-only conventions), following the same "zero screen-specific complexity" shape those two already established: a bare `.card`, a single unpaginated GET-on-init fetch (closer to `DashboardComponent`'s single-response pattern than `SalesHistoryComponent`'s paginated one, since the backend returns one record, not a page), and plain unstyled markup — no toolbar, no filters, no edit controls. A new `DigitalIdCardService` calls the single existing endpoint with no query params (self-scoping happens server-side from the JWT, same as `SalesHistoryService`/`DashboardService`). The route is guarded exactly like `/dashboard` and `/sales-history` (`authGuard` + `associateOnlyGuard`, no `adminGuard` — the spec is explicit that Admin has "No dedicated screen (not the persona this serves)" for this domain), and a new nav link is added to the global header for non-admin-family users.

**Tech Stack:** Angular 18.2 (standalone components), `@ngx-translate/core` for i18n, Karma/Jasmine (`ng test`) with `HttpClientTestingModule`/`HttpTestingController`, global SCSS partials under `frontend/src/styles/` (no new partial needed — see Design Decision below).

**Spec:** `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md` — "Data visibility matrix" → "Digital ID card" row (Associate: "Own ID card only (photo, ID number, rank, QR)"; Admin: "No dedicated screen (not the persona this serves)") and "Screens (derived from the matrix)" → Associate screen list ("Digital ID Card (view-only)"). Backend contract: `docs/superpowers/plans/2026-08-13-role-capability-unit-10-associate-digital-id-card.md` (merged `a2fb675..568d59b`).

## API contract consumed (verified directly against the merged backend code, not assumed)

`GET /api/associates/me/id-card` (`backend/src/main/java/com/plotchain/associate/AssociateIdCardController.java`) — self-scoped via `@AuthenticationPrincipal`, no path/query params.

- **200** — `AssociateIdCardResponse` (`backend/src/main/java/com/plotchain/associate/AssociateIdCardResponse.java`):
  ```json
  { "idNumber": "VP00042", "name": "Priya Nair", "rank": "Gold Associate", "photoUrl": null, "qrPayload": "VP00042" }
  ```
  - `photoUrl` is **always `null` today** — no photo-upload/storage mechanism exists anywhere in the codebase (unit 10's own investigation, re-confirmed here: still true, no `photo`/`avatar` field added to `Associate` by units 11 or any later merged unit). This screen must render around that constraint, not invent a fake image.
  - `qrPayload` is a **raw string** (the associate's own `userId`, e.g. `VP00042` — same value as `idNumber`), not image bytes. `backend/pom.xml` has no QR-image-generation dependency (re-verified: grepped for `zxing`/`qr` — no hits), and `frontend/package.json` has none either (see below) — this screen must not silently assume one can be added.
- **401** — no/invalid token (handled globally by the existing HTTP layer, same as every other authenticated screen; no special handling needed here).
- **409** — `NoRankAssignedException`, only reachable by an admin-family token calling this associate-only route. In practice unreachable through this screen: `associateOnlyGuard` already redirects admin-family roles away before the request is ever made (same reasoning `associateOnlyGuard`'s own header comment gives for `/dashboard`, which 400s for the identical reason). Treated as a generic load error by the component, exactly like `DashboardComponent` treats its own 400 case — no dedicated 409 branch.

**Frontend dependency check (performed before writing this plan):** `frontend/package.json` dependencies/devDependencies are `@angular/*`, `@ngx-translate/core`, `@ngx-translate/http-loader`, `rxjs`, `tslib`, `zone.js`, `material-symbols`, plus build/test tooling (`karma`, `jasmine`, `typescript`, etc.) — **no QR-code or barcode-rendering library of any kind.** This plan does not add one.

## Design Decisions (read before implementing)

**No fresh `frontend-design` skill dispatch.** Same reasoning `2026-08-11-sales-associate-history-screen.md` documented for its own screen: the spec describes this screen in one line ("Digital ID Card (view-only)") with no layout brief, and the codebase already has a proven "zero screen-specific CSS" pattern (`.card` + `.card-title` from `frontend/src/styles/_cards.scss`, applied unconditionally regardless of route) that every other Associate screen (`DashboardComponent`'s widgets, `SalesHistoryComponent`) already uses without a bespoke design pass. This screen is simpler than either precedent (one record, four fields, no pagination, no filters).

**Photo field: an initials placeholder, not a broken `<img>` or a fake photo.** `photoUrl` is always `null` today (see API contract above) — rendering a bare `<img [src]="null">` would show a broken-image icon, and fabricating a stock photo URL would misrepresent unset data as real. This codebase already has a precedent for exactly this situation: `AuditLogComponent.initials(entry)` (`frontend/src/app/settings/audit-log/audit-log.component.ts`, lines ~111-124) derives a two-letter avatar glyph from an actor's display name when no photo exists. This plan reuses that same algorithm (trim → split on whitespace → take first 2 words → first letter of each, uppercased) against `idCard.name`, rendered inside `.digital-id-card__avatar`. The template checks `*ngIf="card.photoUrl as photoUrl"` / `*ngIf="!card.photoUrl"` — a plain falsy check, not an explicit `=== null` — so the exact same code path also covers `undefined` if a future Jackson serialization change ever omits the key entirely instead of nulling it (unit 10's own controller test asserts `jsonPath("$.photoUrl").doesNotExist()`, which does not guarantee the key is always literally absent vs. present-and-null across all Spring Boot Jackson configurations — the frontend deliberately doesn't bet on which one recurs). If `photoUrl` is ever non-null (a future unit adds real photo upload), the `<img>` branch already renders it — no changes needed here, the fallback and the real-photo path already coexist in the same conditional.

**QR field: the raw payload rendered as a labeled verification code, not a scannable barcode image.** No QR-image-rendering library exists in `frontend/package.json` (verified above), and adding one is a new-dependency decision this screen-only unit should not make silently — same "no new dependency, no invented infrastructure" call unit 10's backend plan already made for the identical reason. The screen renders `qrPayload` as visible monospace text inside a labeled `.digital-id-card__qr` section ("Verification Code"), the same pattern a physical ID card or boarding pass uses as a fallback for the printed/scannable code (many real ID cards show both a barcode *and* a human-readable code beneath it — this screen ships the text half only, since the barcode half needs a dependency decision outside this unit's scope). This satisfies the spec's "QR" field literally (the data is visible and usable for verification) without fabricating a graphic that doesn't scan to anything real, or silently vendoring a new npm package. **Flagged explicitly, not silently accepted:** a future unit could add a QR-image library (e.g. `qrcode`) to render `qrPayload` as an actual scannable graphic — that is a real, visible gap versus the spec's literal "QR" wording, deliberately left open rather than guessed at here.

**Route: `/digital-id-card`, guarded exactly like `/dashboard`/`/sales-history`.** `authGuard` (must be logged in) + `associateOnlyGuard` (redirects admin-family roles away, same as the 409 case above never being user-reachable) — no `adminGuard`, since every authenticated Associate may see their own card and no admin-family principal has one to see.

**No new shared component.** This is a single small card, not a table or a form — `EditableTableComponent` doesn't apply here (unlike `SalesHistoryComponent`). Plain template markup only.

## Global Constraints

- Do not modify any backend file — `GET /api/associates/me/id-card` (role-capability unit 10) is fully built and merged; this unit is frontend-only.
- No new npm dependency — confirmed none is needed (QR payload renders as text, photo renders as an initials fallback using an existing in-codebase pattern).
- Route path and guard must mirror `/dashboard`/`/sales-history`'s existing convention exactly: bare top-level route, `canActivate: [authGuard, associateOnlyGuard]`.
- Every new user-facing string goes through `@ngx-translate/core` — no hard-coded copy in templates. Add matching keys to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/hi.json`. Precedent (`salesHistory.*`/`admin.salesRegister.*` in `hi.json`): leaving a newly-added feature bundle's values as the literal English string in `hi.json` is accepted practice for a new feature in this codebase — only the top-level `nav.*` entry needs a real Hindi translation (every existing `nav.*` key is genuinely translated).
- Test runner: `cd frontend && npx ng test --watch=false --include='<glob>'` for scoped runs.

---

## File Structure

- Create: `frontend/src/app/digital-id-card/models/associate-id-card.model.ts` — `AssociateIdCard` interface (mirrors `AssociateIdCardResponse` on the backend).
- Create: `frontend/src/app/digital-id-card/digital-id-card.service.ts` — `DigitalIdCardService.getMyIdCard()`.
- Create: `frontend/src/app/digital-id-card/digital-id-card.service.spec.ts`
- Create: `frontend/src/app/digital-id-card/digital-id-card.component.ts` — `DigitalIdCardComponent`.
- Create: `frontend/src/app/digital-id-card/digital-id-card.component.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` — add the `digital-id-card` route.
- Modify: `frontend/src/app/app.routes.spec.ts` — add a guard-coverage test for the new route.
- Modify: `frontend/src/app/app.component.html` — add the "Digital ID Card" nav link for non-admin-family users.
- Modify: `frontend/src/app/app.component.spec.ts` — update the nav-link assertion that currently expects `['Dashboard', 'Sales History']` for a plain associate role.
- Modify: `frontend/src/assets/i18n/en.json` — add `nav.digitalIdCard` and a new `digitalIdCard` bundle.
- Modify: `frontend/src/assets/i18n/hi.json` — same keys, real Hindi nav string, English placeholder for the feature bundle (matching `salesHistory` precedent).
- Modify: `docs/superpowers/plans/2026-08-03-role-capability-units.md` — mark unit 16 merged once implemented.

---

### Task 1: `AssociateIdCard` model

**Files:**
- Create: `frontend/src/app/digital-id-card/models/associate-id-card.model.ts`

**Interfaces:**
- Consumes: nothing (type-only file).
- Produces: `AssociateIdCard` interface — `{ idNumber: string; name: string; rank: string; photoUrl: string | null; qrPayload: string }`, consumed by Task 2 (service) and Task 3 (component).

This is a type-only file (no runtime behavior), so there is no red/green unit test cycle — TypeScript's compiler is the check. It compiles as part of Task 2/3's build.

- [ ] **Step 1: Create the model file**

```typescript
// Mirrors AssociateIdCardResponse (backend/src/main/java/com/plotchain/associate/AssociateIdCardResponse.java,
// role-capability unit 10, merged a2fb675..568d59b). photoUrl is typed nullable because the
// backend always returns null today (no photo-upload mechanism exists anywhere in the codebase) --
// see DigitalIdCardComponent's photo-placeholder handling. qrPayload is a raw string (the
// associate's own userId), not image bytes -- no QR-image-generation dependency exists in this
// codebase and none is added by this unit.
export interface AssociateIdCard {
  idNumber: string;
  name: string;
  rank: string;
  photoUrl: string | null;
  qrPayload: string;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/digital-id-card/models/associate-id-card.model.ts
git commit -m "feat(digital-id-card): add AssociateIdCard model"
```

---

### Task 2: `DigitalIdCardService`

**Files:**
- Create: `frontend/src/app/digital-id-card/digital-id-card.service.ts`
- Test: `frontend/src/app/digital-id-card/digital-id-card.service.spec.ts`

**Interfaces:**
- Consumes: `AssociateIdCard` from Task 1.
- Produces: `DigitalIdCardService.getMyIdCard(): Observable<AssociateIdCard>`, consumed by Task 3 (component).

- [ ] **Step 1: Write the failing test**

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DigitalIdCardService } from './digital-id-card.service';
import { AssociateIdCard } from './models/associate-id-card.model';

describe('DigitalIdCardService', () => {
  let service: DigitalIdCardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DigitalIdCardService]
    });
    service = TestBed.inject(DigitalIdCardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own digital ID card with no query params', () => {
    const mockResponse: AssociateIdCard = {
      idNumber: 'VP00042', name: 'Priya Nair', rank: 'Gold Associate', photoUrl: null, qrPayload: 'VP00042'
    };

    service.getMyIdCard().subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/associates/me/id-card');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/digital-id-card.service.spec.ts'`
Expected: FAIL — `Cannot find module './digital-id-card.service'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateIdCard } from './models/associate-id-card.model';

@Injectable({ providedIn: 'root' })
export class DigitalIdCardService {
  private http = inject(HttpClient);

  getMyIdCard(): Observable<AssociateIdCard> {
    return this.http.get<AssociateIdCard>('/api/associates/me/id-card');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/digital-id-card.service.spec.ts'`
Expected: PASS (1 spec)

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/digital-id-card/digital-id-card.service.ts frontend/src/app/digital-id-card/digital-id-card.service.spec.ts
git commit -m "feat(digital-id-card): add DigitalIdCardService.getMyIdCard"
```

---

### Task 3: `DigitalIdCardComponent`

**Files:**
- Create: `frontend/src/app/digital-id-card/digital-id-card.component.ts`
- Test: `frontend/src/app/digital-id-card/digital-id-card.component.spec.ts`

**Interfaces:**
- Consumes: `DigitalIdCardService.getMyIdCard()` from Task 2. `AssociateIdCard` from Task 1.
- Produces: `DigitalIdCardComponent` with public `idCard: AssociateIdCard | null`, `loadError: boolean`, `initials: string` (getter) — consumed by Task 4's route wiring (as the routed component) and by this task's own spec.

**UI behavior covered by this task:**
- **Loading state:** no dedicated spinner/skeleton — the card (`*ngIf="idCard as card"`) simply doesn't render until the first response arrives, same as `DashboardComponent`'s identical `*ngIf="dashboard as d"` gate. This is a deliberate consistency choice with the codebase's existing single-fetch screens, not an oversight — `SalesHistoryComponent`/`DashboardComponent` neither one shows an explicit "Loading…" state either.
- **Empty state:** doesn't apply the way it does to a list screen (there's no page of zero results) — the closest analogue is a missing photo, which is handled below as its own explicit fallback, not a whole-card empty state.
- **Error state:** a `loadError` flag flipped on any HTTP error (matches `DashboardComponent`'s `error` flag and `SalesHistoryComponent`'s `loadError` flag naming/shape), rendered as a plain `<p>` with a translated message.
- **Photo-stub handling:** `*ngIf="card.photoUrl as photoUrl"` renders `<img>`; the sibling `*ngIf="!card.photoUrl"` renders a two-letter initials glyph derived from `card.name` (same algorithm as `AuditLogComponent.initials()`), with an `aria-label` explaining it's a placeholder — never a bare `<img>` pointed at `null`.
- **QR payload handling:** rendered as visible monospace text inside a labeled section, not an image — see Design Decisions above.

- [ ] **Step 1: Write the failing test**

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DigitalIdCardComponent } from './digital-id-card.component';
import { AssociateIdCard } from './models/associate-id-card.model';

describe('DigitalIdCardComponent', () => {
  let fixture: ComponentFixture<DigitalIdCardComponent>;
  let httpMock: HttpTestingController;

  const baseCard: AssociateIdCard = {
    idNumber: 'VP00042', name: 'Priya Nair', rank: 'Gold Associate', photoUrl: null, qrPayload: 'VP00042'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DigitalIdCardComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(DigitalIdCardComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads and displays the associate\'s id number, name, and rank on init', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush(baseCard);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.digital-id-card__id-number')?.textContent?.trim()).toBe('VP00042');
    expect(compiled.querySelector('.digital-id-card__name')?.textContent?.trim()).toBe('Priya Nair');
    expect(compiled.querySelector('.digital-id-card__rank')?.textContent?.trim()).toBe('Gold Associate');
  });

  it('shows a load error when the fetch fails, without silently doing nothing', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.digital-id-card__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('renders an initials placeholder instead of a broken image when photoUrl is null', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush(baseCard);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.digital-id-card__avatar')?.textContent?.trim()).toBe('PN');
    expect(compiled.querySelector('.digital-id-card__photo-img')).toBeFalsy();
  });

  it('renders an actual photo image when photoUrl is present, not just the placeholder path', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush({ ...baseCard, photoUrl: 'https://cdn.example.com/p.jpg' });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const img = compiled.querySelector('.digital-id-card__photo-img') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example.com/p.jpg');
    expect(compiled.querySelector('.digital-id-card__avatar')).toBeFalsy();
  });

  it('renders the QR payload as visible text, not an image or canvas (no QR-rendering library exists)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush(baseCard);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.digital-id-card__qr-payload')?.textContent?.trim()).toBe('VP00042');
    expect(compiled.querySelector('.digital-id-card__qr canvas')).toBeFalsy();
    expect(compiled.querySelector('.digital-id-card__qr img')).toBeFalsy();
  });

  it('renders no edit controls (view-only screen)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush(baseCard);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('input')).toBeFalsy();
    expect(compiled.querySelector('button')).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/digital-id-card.component.spec.ts'`
Expected: FAIL — `Cannot find module './digital-id-card.component'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DigitalIdCardService } from './digital-id-card.service';
import { AssociateIdCard } from './models/associate-id-card.model';

@Component({
  selector: 'app-digital-id-card',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="digital-id-card card" *ngIf="idCard as card">
      <h1 class="card-title">{{ 'digitalIdCard.title' | translate }}</h1>

      <div class="digital-id-card__photo">
        <img
          *ngIf="card.photoUrl as photoUrl"
          [src]="photoUrl"
          [alt]="card.name"
          class="digital-id-card__photo-img"
        />
        <span
          *ngIf="!card.photoUrl"
          class="digital-id-card__avatar"
          [attr.aria-label]="'digitalIdCard.photoPlaceholderLabel' | translate"
        >{{ initials }}</span>
      </div>

      <dl class="digital-id-card__details">
        <dt>{{ 'digitalIdCard.idNumberLabel' | translate }}</dt>
        <dd class="digital-id-card__id-number">{{ card.idNumber }}</dd>
        <dt>{{ 'digitalIdCard.nameLabel' | translate }}</dt>
        <dd class="digital-id-card__name">{{ card.name }}</dd>
        <dt>{{ 'digitalIdCard.rankLabel' | translate }}</dt>
        <dd class="digital-id-card__rank">{{ card.rank }}</dd>
      </dl>

      <div class="digital-id-card__qr">
        <span class="digital-id-card__qr-label">{{ 'digitalIdCard.qrPayloadLabel' | translate }}</span>
        <code class="digital-id-card__qr-payload">{{ card.qrPayload }}</code>
        <p class="digital-id-card__qr-hint">{{ 'digitalIdCard.qrPayloadHint' | translate }}</p>
      </div>
    </div>
    <p *ngIf="loadError" class="digital-id-card__load-error">{{ 'digitalIdCard.loadError' | translate }}</p>
  `
})
export class DigitalIdCardComponent implements OnInit {
  private digitalIdCardService = inject(DigitalIdCardService);

  idCard: AssociateIdCard | null = null;
  loadError = false;

  // Same algorithm as AuditLogComponent.initials() (frontend/src/app/settings/audit-log/audit-log.component.ts):
  // trim -> split on whitespace -> first 2 words -> first letter of each, uppercased. Reused here
  // rather than extracted into a shared util, matching that component's own precedent of keeping
  // this inline (it's a 6-line pure function, not worth a new shared module for two call sites yet).
  get initials(): string {
    const name = this.idCard?.name ?? '';
    if (!name.trim()) {
      return '';
    }
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  }

  ngOnInit(): void {
    this.digitalIdCardService.getMyIdCard().subscribe({
      next: card => (this.idCard = card),
      error: () => (this.loadError = true)
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/digital-id-card.component.spec.ts'`
Expected: PASS (6 specs)

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/digital-id-card/digital-id-card.component.ts frontend/src/app/digital-id-card/digital-id-card.component.spec.ts
git commit -m "feat(digital-id-card): add DigitalIdCardComponent"
```

---

### Task 4: Route wiring + guard test

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.routes.spec.ts`

**Interfaces:**
- Consumes: `DigitalIdCardComponent` from Task 3. Existing `authGuard` (`frontend/src/app/auth/auth.guard.ts`) and `associateOnlyGuard` (`frontend/src/app/auth/associate-only.guard.ts`) — both already used verbatim by the `dashboard`/`sales-history` routes.
- Produces: route `path: 'digital-id-card'`, consumed by Task 5's nav link (`routerLink="/digital-id-card"`).

- [ ] **Step 1: Write the failing test (append to `app.routes.spec.ts`)**

Add this directly after the existing `'guards the sales-history route with authGuard and associateOnlyGuard'` test (same top-level `describe('routes', ...)` block):

```typescript
  it('guards the digital-id-card route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'digital-id-card');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: FAIL — `route` is `undefined`, `Cannot read properties of undefined (reading 'canActivate')`.

- [ ] **Step 3: Add the route**

In `frontend/src/app/app.routes.ts`, add the import near the other top-level component imports:

```typescript
import { DigitalIdCardComponent } from './digital-id-card/digital-id-card.component';
```

Add the route entry as a new top-level bare route, directly after the existing `sales-history` route entry:

```typescript
  { path: 'sales-history', component: SalesHistoryComponent, canActivate: [authGuard, associateOnlyGuard] },
  { path: 'digital-id-card', component: DigitalIdCardComponent, canActivate: [authGuard, associateOnlyGuard] },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.routes.spec.ts'`
Expected: PASS (all routes specs, including the new one)

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts
git commit -m "feat(digital-id-card): route /digital-id-card behind authGuard + associateOnlyGuard"
```

---

### Task 5: Global nav link

**Files:**
- Modify: `frontend/src/app/app.component.html`
- Modify: `frontend/src/app/app.component.spec.ts`

**Interfaces:**
- Consumes: the `digital-id-card` route from Task 4. Existing `isAdminFamily` getter and `app-nav__link`/`app-nav__link--active` classes already used by the `dashboard`/`sales-history`/`admin/associates/new`/`settings` links in `app.component.html`.
- Produces: nothing new consumed elsewhere — this is the final, user-visible wiring step.

- [ ] **Step 1: Write/update the failing test**

In `frontend/src/app/app.component.spec.ts`, update the existing test `'shows the Dashboard and Sales History nav links for a plain associate role'` (it currently asserts `['Dashboard', 'Sales History']`, which will become stale once the new link renders):

```typescript
  it('shows the Dashboard, Sales History, and Digital ID Card nav links for a plain associate role', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'nav.dashboard': 'Dashboard',
        'nav.salesHistory': 'Sales History',
        'nav.digitalIdCard': 'Digital ID Card',
        'nav.provisionAssociate': 'Provision Associate',
        'nav.settings': 'Settings',
        'auth.logout': 'Log Out'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav__link')).map(el => el.textContent?.trim());
    expect(links).toEqual(['Dashboard', 'Sales History', 'Digital ID Card']);
  });
```

(Replace the old test with this one — same `describe` block, same position.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: FAIL — `links` is still `['Dashboard', 'Sales History']` (new link not in the template yet), so `toEqual([...])` fails.

- [ ] **Step 3: Add the nav link**

In `frontend/src/app/app.component.html`, add the new link directly after the existing Sales History link, still gated on `!isAdminFamily`:

```html
<header class="app-header" *ngIf="authService.isAuthenticated() && !isChromelessRoute">
  <nav class="app-nav">
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/dashboard" routerLinkActive="app-nav__link--active">{{ 'nav.dashboard' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/sales-history" routerLinkActive="app-nav__link--active">{{ 'nav.salesHistory' | translate }}</a>
    <a *ngIf="!isAdminFamily" class="app-nav__link" routerLink="/digital-id-card" routerLinkActive="app-nav__link--active">{{ 'nav.digitalIdCard' | translate }}</a>
    <ng-container *ngIf="isAdminFamily">
      <a class="app-nav__link" routerLink="/admin/associates/new" routerLinkActive="app-nav__link--active">{{ 'nav.provisionAssociate' | translate }}</a>
      <a class="app-nav__link" routerLink="/settings" routerLinkActive="app-nav__link--active">{{ 'nav.settings' | translate }}</a>
    </ng-container>
  </nav>
  <button type="button" class="logout" (click)="onLogout()">{{ 'auth.logout' | translate }}</button>
</header>
<router-outlet></router-outlet>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/app.component.spec.ts'`
Expected: PASS (all app.component specs, including the updated one). Verify the two other nav-link tests — `'shows Provision Associate and Settings but hides Dashboard for an admin-family role'` and `'hides the Dashboard nav link for every admin-family role'` — still pass unmodified, since the new link is also gated on `!isAdminFamily`.

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/app/app.component.html frontend/src/app/app.component.spec.ts
git commit -m "feat(digital-id-card): add Digital ID Card nav link for associates"
```

---

### Task 6: i18n keys (English + Hindi)

**Files:**
- Modify: `frontend/src/assets/i18n/en.json`
- Modify: `frontend/src/assets/i18n/hi.json`

**Interfaces:**
- Consumes: nothing (data-only).
- Produces: every translation key referenced by Task 3's template (`digitalIdCard.title`, `.idNumberLabel`, `.nameLabel`, `.rankLabel`, `.photoPlaceholderLabel`, `.qrPayloadLabel`, `.qrPayloadHint`, `.loadError`) and Task 5's template (`nav.digitalIdCard`). No JS/TS interface — resolved at runtime by `@ngx-translate/core`; verified via Karma's `TranslateModule.forRoot()` fallback (untranslated keys render as the key itself, which is why Tasks 3/5's tests pass even before this task runs — this task removes that fallback and supplies the real copy).

This is a JSON-only data task, so there is no red/green unit test cycle — the check is `ng test` (Tasks 3/5's specs use `TranslateModule.forRoot()`, which doesn't load these JSON files, so they don't fail without this task) plus a manual verification that JSON parses.

- [ ] **Step 1: Add the `digitalIdCard` bundle to `en.json`**

Insert this as a new top-level key immediately after the closing `}` of the existing `"salesHistory": { ... }` block (before `"nav": {`):

```json
  "digitalIdCard": {
    "title": "Digital ID Card",
    "idNumberLabel": "ID Number",
    "nameLabel": "Name",
    "rankLabel": "Rank",
    "photoPlaceholderLabel": "Profile photo not set",
    "qrPayloadLabel": "Verification Code",
    "qrPayloadHint": "Present this code to verify your identity as an Associate.",
    "loadError": "Something went wrong loading your digital ID card. Please try again."
  },
```

- [ ] **Step 2: Add `nav.digitalIdCard` to `en.json`**

Inside the existing `"nav": { ... }` block, add a new entry directly after `"salesHistory": "Sales History",`:

```json
    "digitalIdCard": "Digital ID Card",
```

- [ ] **Step 3: Mirror both additions into `hi.json`**

Insert the same `digitalIdCard` bundle (top-level key, same position, after `"salesHistory": { ... }`) — English placeholder values, matching the `salesHistory` precedent already in this file:

```json
  "digitalIdCard": {
    "title": "Digital ID Card",
    "idNumberLabel": "ID Number",
    "nameLabel": "Name",
    "rankLabel": "Rank",
    "photoPlaceholderLabel": "Profile photo not set",
    "qrPayloadLabel": "Verification Code",
    "qrPayloadHint": "Present this code to verify your identity as an Associate.",
    "loadError": "Something went wrong loading your digital ID card. Please try again."
  },
```

Add the real Hindi nav entry inside `hi.json`'s existing `"nav": { ... }` block, directly after `"salesHistory": "बिक्री इतिहास",`:

```json
    "digitalIdCard": "डिजिटल आईडी कार्ड",
```

- [ ] **Step 4: Verify both files are valid JSON**

Run:
```bash
cd /Users/ronalisenapati/Ronali/plotchain
python3 -c "import json; json.load(open('frontend/src/assets/i18n/en.json')); print('en.json OK')"
python3 -c "import json; json.load(open('frontend/src/assets/i18n/hi.json')); print('hi.json OK')"
```
Expected: both print `OK` — no `JSONDecodeError`.

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx ng test --watch=false`
Expected: PASS — every existing spec plus this unit's new specs (Tasks 2-5) green, no regressions in `dashboard`/`sales-history`/`app.component`/`app.routes` suites.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add frontend/src/assets/i18n/en.json frontend/src/assets/i18n/hi.json
git commit -m "feat(digital-id-card): add i18n copy for the Digital ID Card screen"
```

---

### Task 7: Update the role-capability units tracker

**Files:**
- Modify: `docs/superpowers/plans/2026-08-03-role-capability-units.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Mark unit 16 merged**

In the units table, change unit 16's row from:

```
| 16 | **screen** | Associate "Digital ID Card" screen | 10 | pending | — | — |
```

to:

```
| 16 | **screen** | Associate "Digital ID Card" screen | 10 | **merged** | `docs/superpowers/plans/2026-08-14-role-capability-unit-16-digital-id-card-screen.md` | `<first-commit-sha>`..`<last-commit-sha>` on `master` |
```

filling in the real commit SHAs from Tasks 1-6 once this plan has actually been executed and merged (this step should be done as the last step of implementation, not during planning). Also append a merge note in the same prose style as the other "Unit N merged ..." paragraphs already in this file (e.g. the "Unit 10 merged" paragraph), summarizing anything notable found during implementation (or "clean, 0 drift from plan" if there was none).

- [ ] **Step 2: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add docs/superpowers/plans/2026-08-03-role-capability-units.md
git commit -m "docs: mark role-capability unit 16 merged, persist its plan file"
```

---

## Self-Review Notes (completed during planning)

- **Spec coverage:** The spec's data-visibility matrix row ("Own ID card only (photo, ID number, rank, QR)") and Screens section ("Digital ID Card (view-only)") map entirely to Task 3's card: `idCard.idNumber`/`.name`/`.rank` render literally; `photoUrl` and `qrPayload` render around their real backend constraints (initials fallback, text-not-image) with the gap versus a literal photo/scannable-QR explicitly flagged in Design Decisions rather than silently accepted. Admin gets no route/nav-link, matching "No dedicated screen (not the persona this serves)".
- **API contract verified against real merged code**, not the plan file's prose alone — `AssociateIdCardController.java`/`AssociateIdCardResponse.java` read directly, field names (`idNumber`, `name`, `rank`, `photoUrl`, `qrPayload`) copied verbatim into the frontend model.
- **Dependency check performed, not assumed:** `frontend/package.json` read in full — no QR/barcode library present; this plan does not add one and documents why in Design Decisions.
- **No placeholders:** every step has real code, no "TBD"/"add appropriate handling" text.
- **Type consistency:** `AssociateIdCard` (Task 1) is used identically in `DigitalIdCardService.getMyIdCard` (Task 2, return type `Observable<AssociateIdCard>`) and `DigitalIdCardComponent.idCard` (Task 3, type `AssociateIdCard | null`) — same shape throughout, matching `photoUrl: string | null` exactly against the backend record's nullable field.
- **Testing section:** the spec has no dedicated frontend-testing bullet for this screen (same as unit 9/sales-history's precedent) — Tasks 2/3's Karma specs are this plan's own addition, sized to mirror `sales-history.component.spec.ts`'s depth (load, error, view-only) plus two screen-specific cases (photo-stub fallback vs. real-photo path, QR-as-text-not-image) that have no analogue in the sales-history precedent since that screen has no comparable stubbed field.
- **Cross-unit file overlap:** `app.routes.ts`, `app.routes.spec.ts`, `app.component.html`, `app.component.spec.ts`, and both `i18n/*.json` files are shared with every other screen unit (12-15) that may be in flight concurrently — same overlap `sales-history`'s plan already had with `dashboard`'s files, resolved there by strict append-after-the-most-recent-entry ordering. This plan follows the same convention (new route/nav-link/i18n entries always appended directly after the most recently added sibling entry, never inserted mid-list) to minimize merge-conflict surface against sibling screen units landing around the same time.
- **Drift/gaps found versus the spec, surfaced explicitly (not silently patched over):**
  1. The spec's "QR" field is rendered as text, not a scannable image — no QR-rendering library exists in this codebase (backend or frontend) and adding one is a dependency decision out of scope for a screen-only unit.
  2. The spec's "photo" field is rendered as an initials placeholder — no photo ever exists yet (`photoUrl` is always `null`), an already-known and already-documented gap from unit 10's own merged plan, not something this unit could have closed (no upload endpoint exists to point a form at).
  3. `app.component.html`'s admin/associate split still uses the `isAdminFamily` getter/`ADMIN_FAMILY_ROLES` set name, pre-dating role-capability unit 1's `ADMIN`-only collapse — cosmetic naming drift already present before this unit, out of scope to rename here (touching it would widen this unit's diff into files three other in-flight screen units also touch, for a pure rename with no behavior change).
