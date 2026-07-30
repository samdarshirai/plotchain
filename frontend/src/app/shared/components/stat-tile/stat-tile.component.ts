import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-tile',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="stat-tile" [class.stat-tile--accent]="tone === 'accent'">
      <span class="stat-tile__label">{{ label }}</span>
      <span class="stat-tile__value">{{ value }}</span>
      <span class="stat-tile__hint" *ngIf="hint">{{ hint }}</span>
      <div class="stat-tile__editor"><ng-content select="[tile-editor]"></ng-content></div>
    </div>
  `
})
export class StatTileComponent {
  @Input({ required: true }) label!: string;
  @Input({ required: true }) value!: string;
  @Input() hint?: string;
  @Input() tone: 'default' | 'accent' = 'default';
}
