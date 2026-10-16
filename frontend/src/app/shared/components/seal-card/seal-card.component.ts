import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

// Presentational summary seal. Both surfaces use the shared double frame from styles/_seal.scss.
// Operational screens default to Parchment; dashboards explicitly select Ink.
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
    <div class="seal-card-panel" [class.seal-card-panel--ink]="surface === 'ink'">
      <div class="seal-card-panel__hairline seal-card-panel__hairline--top"></div>
      <div class="seal-card-panel__label">── {{ label }} ──</div>
      <div class="seal-card-panel__figure">{{ value }}</div>
      <p class="seal-card-panel__delta" *ngIf="deltaCaption" [class.seal-card-panel__delta--down]="deltaDown">{{ deltaCaption }}</p>
      <svg class="seal-card-panel__trend" *ngIf="trendPoints" viewBox="0 0 100 28" preserveAspectRatio="none">
        <polyline [attr.points]="trendPoints"></polyline>
      </svg>
      <div class="seal-card-panel__caption" *ngIf="caption">{{ caption }}</div>
      <!-- Redesign 1a: optional hairline metrics strip inside the Ink panel (Admin Dashboard's
           Revenue booked / Sales / Active associates). Kept as a projected slot so this component
           stays presentational and every other Seal Card usage is unaffected. -->
      <div class="seal-card-panel__strip"><ng-content select="[seal-card-strip]"></ng-content></div>
      <div class="seal-card-panel__hairline seal-card-panel__hairline--bottom"></div>
    </div>
  `
})
export class SealCardComponent {
  @Input() surface: 'parchment' | 'ink' = 'parchment';
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() caption?: string;
  @Input() deltaCaption?: string;
  @Input() deltaDown = false;
  @Input() trendPoints?: string;
}
