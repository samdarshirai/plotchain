import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { PlotStatus, PlotType } from '../../../setup/models/project.model';
import { formatArea, formatInr, formatLakh } from '../../utils/plot-grid.util';

const ICONS: Record<PlotStatus, string> = { AVAILABLE: 'check_circle', BOOKED: 'schedule', SOLD: 'lock' };

// Shared by the admin Projects & Plots grid (unit 11) and the associate availability grid
// (unit 13). Book/Edit controls deliberately live outside it. Status is conveyed by icon shape,
// visible word and border/hatch style as well as colour (DESIGN.md Accessibility).
// Callers attach `data-plot-id` to the <app-plot-tile> host (container convention, reused by unit 13),
// and the tile exposes no aria-haspopup/aria-expanded: it is a toggle (aria-pressed), not a disclosure.
@Component({
  selector: 'app-plot-tile',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <button type="button" class="plot-tile"
      [class.plot-tile--corner]="type === 'CORNER'"
      [class.plot-tile--available]="status === 'AVAILABLE'"
      [class.plot-tile--booked]="status === 'BOOKED'"
      [class.plot-tile--sold]="status === 'SOLD'"
      [class.plot-tile--selected]="selected"
      [disabled]="!selectable"
      [attr.aria-pressed]="selectable ? selected : null"
      [attr.aria-label]="'plotTile.aria' | translate: {
        no: plotNo, type: ('plotTile.type.' + type | translate), area: areaText, price: fullPrice,
        status: ('plotTile.status.' + status | translate) }"
      (click)="tileSelect.emit()">
      <span class="plot-tile__no">{{ plotNo }}</span>
      <span class="plot-tile__meta">{{ areaText }}<ng-container *ngIf="type === 'CORNER'"> · {{ 'plotTile.corner' | translate }}</ng-container></span>
      <span class="plot-tile__price">{{ shortPrice }}</span>
      <span class="plot-tile__status">
        <span class="material-symbols-outlined plot-tile__icon" aria-hidden="true">{{ icon }}</span>
        {{ 'plotTile.status.' + status | translate }}
      </span>
    </button>
  `
})
export class PlotTileComponent {
  @Input({ required: true }) plotNo!: string;
  @Input({ required: true }) type!: PlotType;
  @Input({ required: true }) area!: number;
  @Input({ required: true }) price!: number;
  @Input({ required: true }) status!: PlotStatus;
  @Input() selectable = true;
  @Input() selected = false;
  @Output() tileSelect = new EventEmitter<void>();

  get areaText(): string { return formatArea(this.area); }
  get shortPrice(): string { return formatLakh(this.price); }
  get fullPrice(): string { return formatInr(this.price); }
  get icon(): string { return ICONS[this.status]; }
}
