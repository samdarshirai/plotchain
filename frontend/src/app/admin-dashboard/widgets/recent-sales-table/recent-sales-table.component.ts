import { Component, Input, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../../shared/components/editable-table/editable-table.component';
import { Sale } from '../../../admin/models/sale.model';

// Unlike the associate side's RecentSalesTableComponent, this widget takes its data as an
// @Input rather than firing its own HTTP request: 2026-08-23-admin-dashboard-mockup-design.md §4
// rides recentSales on the single GET /api/admin/stats response, so a load failure here is a
// whole-dashboard load failure, not an isolated one -- there's no separate loading/error state to
// manage.
@Component({
  selector: 'app-admin-recent-sales-table',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent],
  providers: [CurrencyPipe, DatePipe],
  template: `
    <div class="admin-recent-sales-table">
      <div class="admin-recent-sales-table__header">
        <span class="admin-recent-sales-table__rule"></span>
        <span class="admin-recent-sales-table__label">{{ 'adminDashboard.recentSalesEyebrow' | translate }}</span>
        <span class="admin-recent-sales-table__rule"></span>
      </div>
      <p *ngIf="!sales.length" class="admin-recent-sales-table__empty">{{ 'adminDashboard.recentSalesEmpty' | translate }}</p>
      <app-editable-table
        *ngIf="sales.length"
        [readOnly]="true"
        [columns]="columns"
        [rows]="rows"
      ></app-editable-table>
    </div>
  `
})
export class AdminRecentSalesTableComponent {
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  private datePipe = inject(DatePipe);

  rows: Record<string, string>[] = [];
  readonly columns: EditableTableColumn[] = [
    { key: 'plotNo', label: this.translate.instant('adminDashboard.recentSalesColumnPlot'), type: 'text', icon: 'landscape' },
    { key: 'projectName', label: this.translate.instant('adminDashboard.recentSalesColumnProject'), type: 'text', icon: 'apartment' },
    { key: 'associateName', label: this.translate.instant('adminDashboard.recentSalesColumnAssociate'), type: 'text', icon: 'groups' },
    { key: 'amount', label: this.translate.instant('adminDashboard.recentSalesColumnValue'), type: 'text', icon: 'payments' },
    { key: 'recordedAt', label: this.translate.instant('adminDashboard.recentSalesColumnDate'), type: 'text', icon: 'calendar_today' },
    { key: 'status', label: this.translate.instant('adminDashboard.recentSalesColumnStatus'), type: 'badge', badgeTone: v => this.statusTone(v) }
  ];

  private _sales: Sale[] = [];

  @Input({ required: true })
  set sales(value: Sale[]) {
    this._sales = value;
    this.rows = value.map(sale => ({
      plotNo: sale.plotNo ?? '—',
      projectName: sale.projectName ?? '—',
      associateName: sale.associateName ?? '—',
      amount: this.currencyPipe.transform(sale.amount, 'INR', 'symbol', '1.0-2') ?? String(sale.amount),
      recordedAt: this.datePipe.transform(sale.recordedAt, 'd MMM y') ?? sale.recordedAt,
      status: this.translate.instant(sale.status === 'VOIDED' ? 'adminDashboard.saleStatusVoided' : 'adminDashboard.saleStatusRecorded')
    }));
  }
  get sales(): Sale[] {
    return this._sales;
  }

  private statusTone(value: string | number): BadgeTone {
    return value === this.translate.instant('adminDashboard.saleStatusVoided') ? 'danger' : 'success';
  }
}
