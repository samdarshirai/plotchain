import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FinalReportService } from './final-report.service';
import { FinalReport, FinalReportCycleOption, FinalReportTable } from '../models/final-report.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { formatInr } from '../../shared/utils/plot-grid.util';

@Component({
  selector: 'app-final-report',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="final-report">
      <div class="final-report__intro">
        <span class="final-report__eyebrow">{{ 'admin.finalReport.eyebrow' | translate }}</span>
        <h1 class="final-report__title">{{ 'admin.finalReport.title' | translate }}</h1>
        <p class="final-report__subtitle">{{ 'admin.finalReport.subtitle' | translate }}</p>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger" class="final-report__load-error">
        {{ 'admin.finalReport.loadError' | translate }}
      </app-inline-banner>

      <div class="final-report__filter" *ngIf="options.length">
        <label>
          {{ 'admin.finalReport.filterLabel' | translate }}
          <select (change)="onCycleChange($any($event.target).value)">
            <option value="" [selected]="!cycleId">{{ 'admin.finalReport.allCycles' | translate }}</option>
            <option *ngFor="let o of options" [value]="o.cycleId" [selected]="o.cycleId === cycleId">{{ period(o) }}</option>
          </select>
        </label>
      </div>
      <section class="card final-report__table-card" *ngIf="data as d">
        <table class="final-report__table">
          <thead><tr>
            <th>{{ 'admin.finalReport.columnCycle' | translate }}</th>
            <th class="table-number">{{ 'admin.finalReport.totalBusiness' | translate }}</th>
            <th class="table-number">{{ 'admin.finalReport.netCommission' | translate }}</th>
            <th class="table-number" *ngFor="let n of d.expenseTypes">{{ n }}</th>
            <th class="table-number">{{ 'admin.finalReport.totalPayout' | translate }}</th>
            <th class="table-number">{{ 'admin.finalReport.payoutPercent' | translate }}</th>
            <th class="table-number" *ngFor="let n of d.refundTypes">{{ n }}</th>
          </tr></thead>
          <tbody>
            <tr *ngFor="let r of d.rows">
              <ng-container *ngTemplateOutlet="cells; context: { $implicit: r, label: period(r) }"></ng-container>
            </tr>
            <tr class="editable-table__total final-report__total-row">
              <ng-container *ngTemplateOutlet="cells; context: { $implicit: d.total, label: ('admin.finalReport.totalRow' | translate) }"></ng-container>
            </tr>
          </tbody>
        </table>

        <ng-template #cells let-r let-label="label">
          <td class="final-report__cycle" [attr.data-label]="'admin.finalReport.columnCycle' | translate">{{ label }}</td>
          <td class="table-number" [attr.data-label]="'admin.finalReport.totalBusiness' | translate">{{ inr(r.totalBusiness) }}</td>
          <td class="table-number" [attr.data-label]="'admin.finalReport.netCommission' | translate">{{ inr(r.netCommission) }}</td>
          <td class="table-number" *ngFor="let e of r.expenses" [attr.data-label]="e.name">{{ inr(e.amount) }}</td>
          <td class="table-number" [attr.data-label]="'admin.finalReport.totalPayout' | translate">{{ inr(r.totalPayout) }}</td>
          <td class="table-number final-report__payout-percent" [attr.data-label]="'admin.finalReport.payoutPercent' | translate">{{ r.payoutPercent | number:'1.2-2' }}%</td>
          <td class="table-number" *ngFor="let e of r.refunds" [attr.data-label]="e.name">{{ inr(e.amount) }}</td>
        </ng-template>
      </section>
    </div>
  `
})
export class FinalReportComponent implements OnInit {
  private reportService = inject(FinalReportService);
  private datePipe = inject(DatePipe);
  private translate = inject(TranslateService);

  data: FinalReportTable | null = null;
  options: FinalReportCycleOption[] = [];
  cycleId = ''; // '' = all cycles
  loadError = false;
  inr = formatInr;

  ngOnInit(): void {
    this.reportService.getAll().subscribe({
      next: d => {
        this.data = d;
        this.options = d.allCycles ?? [];
      },
      error: () => (this.loadError = true)
    });
  }

  onCycleChange(id: string): void {
    this.cycleId = id;
    this.loadError = false;
    // "All cycles" omits the param (= all); a cycle sends just its id
    this.reportService.getAll(id ? [id] : undefined).subscribe({
      next: d => (this.data = d),
      error: () => (this.loadError = true)
    });
  }

  period(r: { periodStart: string; periodEnd: string | null }): string {
    const start = this.datePipe.transform(r.periodStart, 'mediumDate');
    const end = r.periodEnd
      ? this.datePipe.transform(r.periodEnd, 'mediumDate')
      : this.translate.instant('admin.cycleManagement.ongoing');
    return `${start} – ${end}`;
  }
}
