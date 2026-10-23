import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { FieldErrorComponent } from '../field-error/field-error.component';

const isoDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export interface DateRange { from: string; to: string; }

export const last30Days = (): DateRange =>
  ({ from: isoDate(new Date(Date.now() - 30 * 864e5)), to: isoDate(new Date()) });

// From/to pair of native date inputs. Emits only valid (from <= to) ranges; an inverted range
// shows an error and the parent keeps its last valid list.
@Component({
  selector: 'app-date-range',
  standalone: true,
  imports: [TranslateModule, FieldErrorComponent],
  template: `
    <div class="date-range">
      <label class="date-range__field">{{ 'reports.from' | translate }}
        <input type="date" name="from" [value]="from" [attr.max]="to || null" (change)="onDate('from', $any($event.target).value)" />
      </label>
      <label class="date-range__field">{{ 'reports.to' | translate }}
        <input type="date" name="to" [value]="to" [attr.min]="from || null" (change)="onDate('to', $any($event.target).value)" />
      </label>
    </div>
    <app-field-error [message]="rangeError ? ('plotBookings.dateRangeError' | translate) : ''"></app-field-error>
  `,
  styles: [`
    .date-range { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; padding: 20px 24px; background: var(--surface-raised); border-radius: var(--radius-sm); }
    .date-range__field { display: flex; flex-direction: column; gap: 6px; min-width: 170px; flex: 1 1 170px; margin: 0;
      font: 500 11px var(--font-sans); letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); }
    .date-range__field input { min-height: 44px; width: 100%; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--border-subtle); border-radius: 3px; background: var(--surface-card); font: 14px var(--font-sans); text-transform: none; letter-spacing: 0; color: inherit; }
    @media (max-width: 767px) { .date-range { padding: 16px; gap: 12px; } .date-range__field { flex-basis: 100%; } }
  `]
})
export class DateRangeComponent {
  @Input() from = '';
  @Input() to = '';
  @Output() rangeChange = new EventEmitter<DateRange>();

  rangeError = false;

  onDate(which: 'from' | 'to', v: string): void {
    this[which] = v;
    this.rangeError = !!this.from && !!this.to && this.from > this.to;
    if (!this.rangeError) { this.rangeChange.emit({ from: this.from, to: this.to }); }
  }
}
