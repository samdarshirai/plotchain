import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

export interface CycleLike { id: string; periodStart: string; periodEnd: string | null; }

const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const startOf = (c: CycleLike) => c.periodStart.slice(0, 10);
// open cycle runs to today, but never before its own start (a cycle starting tomorrow would invert the range)
const endOf = (c: CycleLike) => (c.periodEnd ? c.periodEnd.slice(0, 10) : [startOf(c), isoDate(new Date())].sort()[1]);

// Bookings/payments carry no cycle, so a cycle is a shortcut for its date range. The selection is
// derived from from/to, so hand-editing the dates automatically falls back to "All cycles".
@Component({
  selector: 'app-cycle-select',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <label [class]="fieldClass">{{ 'admin.viewPlotEmi.cycle' | translate }}
      <select name="cycle" (change)="pick($any($event.target).value)">
        <option value="" [selected]="!selectedId">{{ 'admin.viewPlotEmi.allCycles' | translate }}</option>
        <option *ngFor="let c of cycles" [value]="c.id" [selected]="c.id === selectedId">
          {{ c.periodStart | date: 'mediumDate' }} – {{ c.periodEnd ? (c.periodEnd | date: 'mediumDate') : ('admin.cycleManagement.ongoing' | translate) }}
        </option>
      </select>
    </label>
  `,
  styles: [`:host { display: contents; }`]
})
export class CycleSelectComponent {
  @Input() cycles: CycleLike[] = [];
  @Input() from = '';
  @Input() to = '';
  @Input() fieldClass = 'add-plot-emi__field';
  @Output() rangeChange = new EventEmitter<{ from: string; to: string }>();

  get selectedId(): string {
    return this.cycles.find(c => startOf(c) === this.from && endOf(c) === this.to)?.id ?? '';
  }

  pick(id: string): void {
    const c = this.cycles.find(x => x.id === id);
    if (c) { this.rangeChange.emit({ from: startOf(c), to: endOf(c) }); }
  }
}
