# Leg Volume Gauge — Carried Forward Left/Right Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the `carriedForwardLeft`/`carriedForwardRight` figures the backend already sends in `LegVolumeSummary` but the leg-volume gauge widget currently drops on the floor.

**Architecture:** Frontend-only change, one component. `DashboardService.getDashboard` (backend) already populates `LegVolumeSummary.carriedForwardLeft`/`.carriedForwardRight` (`backend/src/main/java/com/plotchain/dashboard/DashboardService.java:131-134`) and the Angular model already types them (`frontend/src/app/dashboard/models/dashboard-response.model.ts:12-18`). `leg-volume-gauge.component.ts` just never reads those two fields in its template. This plan adds two more lines to that template, plus the i18n keys they need.

**Tech Stack:** Angular 18 standalone component, `@ngx-translate/core`, Jasmine/Karma.

**Spec:** `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md` (Unit 1 of its build plan) — §1 "Investigation" bullet 1, §3.2.

## Global Constraints

- All associate-facing UI strings go through `@ngx-translate/core` translation keys with English (`en.json`) and Hindi (`hi.json`) entries — no hardcoded UI copy (base dashboard plan's Global Constraints, still binding).
- No backend change in this unit — `DashboardResponse`/`DashboardService` are untouched (spec §1, §3.1 scopes this data to already-shipped fields).

---

### Task 1: Render Carried Forward Left/Right in the leg volume gauge

**Files:**
- Modify: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`
- Modify: `frontend/src/assets/i18n/en.json` (`dashboard` section)
- Modify: `frontend/src/assets/i18n/hi.json` (`dashboard` section)
- Test: `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts`

**Interfaces:**
- Consumes: `LegVolumeSummary` (`frontend/src/app/dashboard/models/dashboard-response.model.ts:12-18`) — `carriedForwardLeft: number`, `carriedForwardRight: number`, both already present on the interface, unchanged by this task.
- Produces: nothing new consumed by later units — this is a leaf render change. Units 4/5 (lifetime Total, New Booked Area) add their own lines to this same template later; this task's two new lines must stay easy to find/extend, so keep them visually grouped as their own block rather than interleaved with the existing New Left/New Right/Projected Match lines.

- [ ] **Step 1: Write the failing test**

Replace the existing single test in `leg-volume-gauge.component.spec.ts` with two tests — keep the current assertion (renamed for clarity) and add a new one for the carried-forward figures:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { LegVolumeGaugeComponent } from './leg-volume-gauge.component';

describe('LegVolumeGaugeComponent', () => {
  let fixture: ComponentFixture<LegVolumeGaugeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LegVolumeGaugeComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(LegVolumeGaugeComponent);
    fixture.componentInstance.data = {
      leftVolume: 3000, rightVolume: 2000,
      carriedForwardLeft: 500, carriedForwardRight: 1000,
      projectedMatchAmount: 140
    };
    fixture.detectChanges();
  });

  it('renders left and right leg volumes and the projected match amount', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('3,000');
    expect(text).toContain('2,000');
    expect(text).toContain('140');
  });

  it('renders carried forward left and right business', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('500');
    expect(text).toContain('1,000');
  });
});
```

- [ ] **Step 2: Run test to verify the new test fails**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts'`
Expected: `renders left and right leg volumes and the projected match amount` PASSes (no change to that behavior yet); `renders carried forward left and right business` FAILs — `500` isn't found in the rendered text because `carriedForwardLeft`/`carriedForwardRight` aren't in the template yet.

- [ ] **Step 3: Add the i18n key both locales need**

In `frontend/src/assets/i18n/en.json`, inside the `"dashboard"` object, add one new key alongside the existing `leftLeg`/`rightLeg` keys (`en.json:12-13`):

```json
    "carriedForward": "Carried Forward",
```

In `frontend/src/assets/i18n/hi.json`, inside the `"dashboard"` object, add the matching key alongside its `leftLeg`/`rightLeg` keys (`hi.json:12-13`):

```json
    "carriedForward": "अग्रेषित",
```

No new key needed for "left"/"right" — the template reuses the existing `dashboard.leftLeg`/`dashboard.rightLeg` keys the New Left/New Right lines already use.

- [ ] **Step 4: Add the two template lines**

In `frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts`, add two more lines inside the `leg-volume-gauge` div, after the existing `leg right` line and before `projected-match`:

```typescript
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LegVolumeSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-leg-volume-gauge',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="leg-volume-gauge">
      <div class="leg left" [style.flex]="data.leftVolume || 1">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftVolume | currency:'INR' }}</div>
      <div class="leg right" [style.flex]="data.rightVolume || 1">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightVolume | currency:'INR' }}</div>
      <div class="leg-carried-forward left">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.carriedForwardLeft | currency:'INR' }}</div>
      <div class="leg-carried-forward right">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.carriedForwardRight | currency:'INR' }}</div>
      <div class="projected-match">{{ 'dashboard.projectedMatch' | translate }}: {{ data.projectedMatchAmount | currency:'INR' }}</div>
    </div>
  `
})
export class LegVolumeGaugeComponent {
  @Input({ required: true }) data!: LegVolumeSummary;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx ng test --watch=false --include='**/leg-volume-gauge.component.spec.ts'`
Expected: both tests PASS.

- [ ] **Step 6: Full frontend test suite, no regressions**

Run: `cd frontend && npx ng test --watch=false`
Expected: same pass count as before this change plus the one new test (no other spec references `leg-volume-gauge` markup, so nothing else should move).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.ts \
        frontend/src/app/dashboard/widgets/leg-volume-gauge/leg-volume-gauge.component.spec.ts \
        frontend/src/assets/i18n/en.json \
        frontend/src/assets/i18n/hi.json
git commit -m "feat(dashboard): render carried-forward left/right business in leg volume gauge"
```
