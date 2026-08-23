import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// The mockup's Dashboard card (Viraj_Acres_Settings.dc.html lines 52-58): an Ink panel with a
// double gold hairline top and bottom, a centered label flanked by literal box-drawing rules
// ("── LABEL ──" -- U+2500, not CSS-drawn borders), a large Fraunces figure, and a muted caption.
// Distinct from the animated `.seal-card` skeleton in _setup.scss (company-profile-step's Company
// Card Preview / cycle-income-card) -- that one has its own header-rule/legal/details/footer
// structure and settles in on first paint; this component is the simpler three-part card the
// mockup actually draws for the Dashboard, so it gets its own class names to avoid colliding with
// that unrelated pattern.
//
// deltaCaption/deltaDown/trendPoints (2026-08-23-admin-dashboard-mockup-design.md §3.2): optional
// delta-vs-last-cycle text and an SVG sparkline, both pre-computed and pre-formatted by the
// caller (mirroring how CycleIncomeCardComponent computes its own delta/trendPoints from raw
// data) -- this component stays presentational and string-based, same as its existing
// label/value/caption inputs.
@Component({
  selector: 'app-seal-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="seal-card-panel">
      <div class="seal-card-panel__hairline seal-card-panel__hairline--top"></div>
      <div class="seal-card-panel__label">── {{ label }} ──</div>
      <div class="seal-card-panel__figure">{{ value }}</div>
      <p class="seal-card-panel__delta" *ngIf="deltaCaption" [class.seal-card-panel__delta--down]="deltaDown">{{ deltaCaption }}</p>
      <svg class="seal-card-panel__trend" *ngIf="trendPoints" viewBox="0 0 100 28" preserveAspectRatio="none">
        <polyline [attr.points]="trendPoints"></polyline>
      </svg>
      <div class="seal-card-panel__caption" *ngIf="caption">{{ caption }}</div>
      <div class="seal-card-panel__hairline seal-card-panel__hairline--bottom"></div>
    </div>
  `
})
export class SealCardComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() caption?: string;
  @Input() deltaCaption?: string;
  @Input() deltaDown = false;
  @Input() trendPoints?: string;
}
