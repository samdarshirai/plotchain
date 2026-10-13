import { Component, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { ExportColumn, exportCsv } from '../../shared/utils/table-export.util';
import { LastEmiRow } from './bookings-emi.model';
import { BookingsEmiService } from './bookings-emi.service';
import { formatMoney } from './bookings-emi.util';
import { ReportFilterValue, ReportFiltersComponent } from './report-filters.component';

const K = 'admin.bookingsEmi.col.';
// [col key, csv value]
const COLS: [string, (r: LastEmiRow) => string | number | null][] = [
  ['bookedOn', r => r.bookedAt.slice(0, 10)], ['associateId', r => r.associateCode], ['associate', r => r.associateName],
  ['buyer', r => r.buyerName], ['mobile', r => r.buyerPhone], ['plot', r => r.plotNo], ['project', r => r.projectName],
  ['lastDueDate', r => r.lastDueDate], ['discount', r => r.discount], ['total', r => r.total], ['paid', r => r.paid], ['rest', r => r.rest]
];

@Component({
  selector: 'app-last-emi',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['./last-emi.component.scss'],
  imports: [CommonModule, TranslateModule, InlineBannerComponent, ReportFiltersComponent],
  template: `
    <div class="last-emi" [attr.aria-busy]="loading">
      <app-report-filters (filtersChange)="onFilters($event)"></app-report-filters>
      <div class="last-emi__bar">
        <button type="button" class="brand-button brand-button--secondary last-emi__export" [disabled]="loading || loadError" (click)="export()">{{ 'admin.bookingsEmi.action.exportCsv' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">
        {{ 'admin.bookingsEmi.err.loadList' | translate }}
        <button type="button" class="booking-register__retry last-emi__retry" (click)="load()">{{ 'admin.bookingsEmi.err.retry' | translate }}</button>
      </app-inline-banner>

      <div class="booking-register__skeleton" role="status" *ngIf="!rows && !loadError">
        <span class="booking-register__sr">{{ 'admin.bookingsEmi.loading' | translate }}</span>
        <span class="booking-register__skeleton-row" *ngFor="let i of [1,2,3]"></span>
      </div>

      <table class="booking-register__table" *ngIf="rows" [attr.aria-label]="'admin.bookingsEmi.tab.lastEmi' | translate">
        <thead>
          <tr><th scope="col" *ngFor="let c of cols">{{ K + c[0] | translate }}</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let r of rows">
            <td [attr.data-label]="K + 'bookedOn' | translate">{{ r.bookedAt | date: 'mediumDate' }}</td>
            <td class="booking-register__num" [attr.data-label]="K + 'associateId' | translate">{{ r.associateCode || '—' }}</td>
            <td [attr.data-label]="K + 'associate' | translate">{{ r.associateName || '—' }}</td>
            <td [attr.data-label]="K + 'buyer' | translate">{{ r.buyerName }}</td>
            <td class="booking-register__num" [attr.data-label]="K + 'mobile' | translate">{{ r.buyerPhone || '—' }}</td>
            <td [attr.data-label]="K + 'plot' | translate">{{ r.plotNo || '—' }}</td>
            <td [attr.data-label]="K + 'project' | translate">{{ r.projectName || '—' }}</td>
            <td [attr.data-label]="K + 'lastDueDate' | translate">{{ r.lastDueDate | date: 'mediumDate' }}</td>
            <td class="booking-register__num" [attr.data-label]="K + 'discount' | translate">{{ r.discount != null ? money(r.discount) : '—' }}</td>
            <td class="booking-register__num" [attr.data-label]="K + 'total' | translate">{{ money(r.total) }}</td>
            <td class="booking-register__num" [attr.data-label]="K + 'paid' | translate">{{ money(r.paid) }}</td>
            <td class="booking-register__num" [attr.data-label]="K + 'rest' | translate">{{ money(r.rest) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="last-emi__total">
            <td colspan="9">{{ 'admin.bookingsEmi.totalRow' | translate }}</td>
            <td class="booking-register__num">{{ money(sum('total')) }}</td>
            <td class="booking-register__num">{{ money(sum('paid')) }}</td>
            <td class="booking-register__num">{{ money(sum('rest')) }}</td>
          </tr>
        </tfoot>
      </table>
      <div class="booking-register__empty" *ngIf="rows && !rows.length">
        <span class="material-symbols-outlined" aria-hidden="true">event_busy</span>
        <h2>{{ 'admin.bookingsEmi.empty.lastEmiTitle' | translate }}</h2>
      </div>

    </div>
  `
})
export class LastEmiComponent {
  private service = inject(BookingsEmiService);
  private i18n = inject(TranslateService);

  K = K;
  cols = COLS;
  money = formatMoney;
  rows: LastEmiRow[] | null = null;
  loadError = false;
  loading = false;
  private filters: ReportFilterValue = { from: '', to: '', projectId: '' };
  private seq = 0;

  constructor() { this.load(); }

  onFilters(f: ReportFilterValue): void { this.filters = f; this.load(); }

  sum(k: 'total' | 'paid' | 'rest'): number { return (this.rows ?? []).reduce((a, r) => a + r[k], 0); }

  // Latest-request-wins; a failed load keeps the previous rows on screen.
  load(): void {
    const mine = ++this.seq;
    this.loading = true;
    this.loadError = false;
    this.service.lastEmi(this.filters).subscribe({
      next: res => { if (mine === this.seq) { this.loading = false; this.rows = res; } },
      error: () => { if (mine === this.seq) { this.loading = false; this.loadError = true; } }
    });
  }

  export(): void {
    const columns: ExportColumn<LastEmiRow>[] = COLS.map(([k, value]) => ({ header: this.i18n.instant(K + k), value }));
    exportCsv(this.rows ?? [], columns, 'emi-last-date.csv');
  }
}
