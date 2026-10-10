import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { formatInr } from '../shared/utils/plot-grid.util';
import { REPORT_STYLES } from './report-styles';
import { EmiReportRow, ReportsService } from './reports.service';

// EMI payments received on my own bookings, filtered by payment date.
@Component({
  selector: 'app-emi-report',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="report" [attr.aria-busy]="loading">
      <h1>{{ 'reports.emi.title' | translate }}</h1>
      <div class="report__filters">
        <label>{{ 'reports.from' | translate }}
          <input type="date" [value]="from" (change)="from = $any($event.target).value; load()">
        </label>
        <label>{{ 'reports.to' | translate }}
          <input type="date" [value]="to" (change)="to = $any($event.target).value; load()">
        </label>
      </div>
      <app-inline-banner *ngIf="error" tone="danger">
        {{ 'reports.loadError' | translate }}
        <button type="button" (click)="load()">{{ 'plotBookings.retryAction' | translate }}</button>
      </app-inline-banner>
      <p role="status" *ngIf="!rows && !error">{{ 'plotBookings.loading' | translate }}</p>
      <p *ngIf="rows && !rows.length">{{ 'reports.empty' | translate }}</p>
      <div class="report__scroll" *ngIf="rows?.length">
        <table class="report__table">
          <thead>
            <tr>
              <th>{{ 'reports.column.number' | translate }}</th>
              <th>{{ 'reports.column.associateId' | translate }}</th>
              <th>{{ 'reports.column.name' | translate }}</th>
              <th>{{ 'reports.column.paymentDate' | translate }}</th>
              <th>{{ 'reports.column.amount' | translate }}</th>
              <th>{{ 'reports.column.mode' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of rows; let i = index">
              <td>{{ i + 1 }}</td>
              <td>{{ r.associateId }}</td>
              <td>{{ r.name }}</td>
              <td>{{ r.paymentDate | date: 'mediumDate' }}</td>
              <td>{{ money(r.amount) }}</td>
              <td>{{ r.mode || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  styles: [REPORT_STYLES]
})
export class EmiReportComponent {
  private service = inject(ReportsService);

  from = '';
  to = '';
  rows: EmiReportRow[] | null = null;
  loading = false;
  error = false;
  money = formatInr;
  private seq = 0;

  constructor() { this.load(); }

  load(): void {
    const seq = ++this.seq;
    this.loading = true;
    this.error = false;
    this.service.getEmi(this.from, this.to).subscribe({
      next: res => { if (seq === this.seq) { this.loading = false; this.rows = res; } },
      error: () => { if (seq === this.seq) { this.loading = false; this.error = true; } }
    });
  }
}
