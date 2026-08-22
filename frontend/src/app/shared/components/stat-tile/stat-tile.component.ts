import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-tile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="stat-tile"
      [class.stat-tile--with-icon]="!!icon && layout !== 'vertical'"
      [class.stat-tile--vertical]="layout === 'vertical'"
      [class.stat-tile--accent]="tone === 'accent'"
      [class.stat-tile--success]="tone === 'success'"
      [class.stat-tile--warning]="tone === 'warning'"
      [class.stat-tile--danger]="tone === 'danger'"
      [class.stat-tile--brand]="tone === 'brand'"
    >
      <span class="material-symbols-outlined stat-tile__icon" *ngIf="icon">{{ icon }}</span>
      <div class="stat-tile__body">
        <span class="stat-tile__label">{{ label }}</span>
        <span class="stat-tile__value">{{ value }}</span>
        <span class="stat-tile__hint" *ngIf="hint">{{ hint }}</span>
        <div class="stat-tile__editor"><ng-content select="[tile-editor]"></ng-content></div>
      </div>
    </div>
  `
})
export class StatTileComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() hint?: string;
  @Input() tone: 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'brand' = 'default';
  // Material Symbols name, e.g. "hourglass_top" -- optional, colored per tone. Switches the tile
  // to a horizontal icon-left layout (KYC Review Queue's status cards) unless `layout` is
  // 'vertical'; omitted, the tile renders exactly as before.
  @Input() icon?: string;
  // 'vertical': icon-top-then-label-then-value stack with a larger Fraunces value (Admin Stats'
  // metric cards). Takes precedence over the [icon]-triggered horizontal layout above -- an icon
  // plus layout="vertical" stacks rather than going row-wise. 'horizontal' (default) preserves
  // every existing consumer's behavior unchanged.
  @Input() layout: 'horizontal' | 'vertical' = 'horizontal';
}
