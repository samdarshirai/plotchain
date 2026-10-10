import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';
import { formatInr } from '../shared/utils/plot-grid.util';
import { REPORT_STYLES } from './report-styles';
import { BusinessReport, BusinessReportRow, ReportsService } from './reports.service';

// Left and Right business tables for a booked-date range.
@Component({
  selector: 'app-my-business-report',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="report" [attr.aria-busy]="loading">
      <h1>{{ 'reports.myBusiness.title' | translate }}</h1>
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
      <p role="status" *ngIf="!report && !error">{{ 'plotBookings.loading' | translate }}</p>
      <ng-container *ngIf="report">
        <ng-container *ngFor="let leg of legs()">
          <h2>{{ 'reports.myBusiness.' + leg.key | translate }}</h2>
          <p *ngIf="!leg.rows.length">{{ 'reports.empty' | translate }}</p>
          <div class="report__scroll" *ngIf="leg.rows.length">
            <table class="report__table">
              <thead>
                <tr>
                  <th>{{ 'reports.column.number' | translate }}</th>
                  <th>{{ 'reports.column.paymentDate' | translate }}</th>
                  <th>{{ 'reports.column.confirmDate' | translate }}</th>
                  <th>{{ 'reports.column.associateId' | translate }}</th>
                  <th>{{ 'reports.column.name' | translate }}</th>
                  <th>{{ 'reports.column.project' | translate }}</th>
                  <th>{{ 'reports.column.plotNumber' | translate }}</th>
                  <th>{{ 'reports.column.business' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let r of leg.rows; let i = index">
                  <td>{{ i + 1 }}</td>
                  <td>{{ r.paymentDate | date: 'mediumDate' }}</td>
                  <td>{{ r.confirmDate ? (r.confirmDate | date: 'mediumDate') : '—' }}</td>
                  <td>{{ r.associateId }}</td>
                  <td>{{ r.name }}</td>
                  <td>{{ r.project }}</td>
                  <td>{{ r.plotNumber }}</td>
                  <td>{{ money(r.business) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ng-container>
      </ng-container>
    </div>
  `,
  styles: [REPORT_STYLES]
})
export class MyBusinessReportComponent {
  private service = inject(ReportsService);

  from = '';
  to = '';
  report: BusinessReport | null = null;
  loading = false;
  error = false;
  money = formatInr;
  private seq = 0;

  constructor() { this.load(); }

  legs(): { key: 'left' | 'right'; rows: BusinessReportRow[] }[] {
    return [{ key: 'left', rows: this.report!.left }, { key: 'right', rows: this.report!.right }];
  }

  load(): void {
    const seq = ++this.seq;   // drop stale responses when the filter changes quickly
    this.loading = true;
    this.error = false;
    this.service.getMyBusiness(this.from, this.to).subscribe({
      next: res => { if (seq === this.seq) { this.loading = false; this.report = res; } },
      error: () => { if (seq === this.seq) { this.loading = false; this.error = true; } }
    });
  }
}
