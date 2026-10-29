import { Component, Input, OnChanges, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Sale } from '../../../admin/models/sale.model';
import { EditableTableColumn, EditableTableComponent } from '../../../shared/components/editable-table/editable-table.component';

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
      <app-editable-table *ngIf="sales.length" [readOnly]="true" [columns]="columns" [rows]="rows"></app-editable-table>
    </div>
  `
})
export class AdminRecentSalesTableComponent implements OnChanges {
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  private datePipe = inject(DatePipe);

  @Input({ required: true }) sales: Sale[] = [];
  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];

  ngOnChanges(): void {
    const t = (k: string) => this.translate.instant('adminDashboard.' + k);
    const recorded = t('saleStatusRecorded');
    this.columns = [
      { key: 'plotNo', label: t('recentSalesColumnPlot'), type: 'text' },
      { key: 'projectName', label: t('recentSalesColumnProject'), type: 'text' },
      { key: 'associateName', label: t('recentSalesColumnAssociate'), type: 'text' },
      { key: 'amount', label: t('recentSalesColumnValue'), type: 'text' },
      { key: 'date', label: t('recentSalesColumnDate'), type: 'text' },
      { key: 'status', label: t('recentSalesColumnStatus'), type: 'badge', badgeTone: v => (v === recorded ? 'success' : 'danger') }
    ];
    this.rows = this.sales.map(sale => ({
      plotNo: sale.plotNo ?? '',
      projectName: sale.projectName ?? '',
      associateName: sale.associateName ?? '',
      amount: this.currencyPipe.transform(sale.amount, 'INR') ?? '',
      date: this.datePipe.transform(sale.recordedAt, 'd MMM') ?? '',
      status: t(sale.status === 'VOIDED' ? 'saleStatusVoided' : 'saleStatusRecorded')
    }));
  }
}
