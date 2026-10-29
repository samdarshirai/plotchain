import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SalesHistoryService } from '../../../sales-history/sales-history.service';
import { Sale } from '../../../admin/models/sale.model';
import { EditableTableColumn, EditableTableComponent } from '../../../shared/components/editable-table/editable-table.component';

const RECENT_SALES_COUNT = 5;

@Component({
  selector: 'app-recent-sales-table',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent],
  providers: [CurrencyPipe, DatePipe],
  template: `
    <div class="recent-sales-table">
      <div class="recent-sales-table__header">
        <span class="recent-sales-table__rule"></span>
        <span class="recent-sales-table__label">{{ 'dashboard.recentSalesEyebrow' | translate }}</span>
        <span class="recent-sales-table__rule"></span>
      </div>
      <p *ngIf="!loaded" class="recent-sales-table__loading">{{ 'dashboard.recentSalesLoading' | translate }}</p>
      <p *ngIf="loadError" class="recent-sales-table__error">{{ 'dashboard.recentSalesLoadError' | translate }}</p>
      <p *ngIf="!loadError && loaded && sales.length === 0" class="recent-sales-table__empty">{{ 'dashboard.recentSalesEmpty' | translate }}</p>
      <app-editable-table *ngIf="sales.length" [readOnly]="true" [columns]="columns" [rows]="rows"></app-editable-table>
    </div>
  `
})
export class RecentSalesTableComponent implements OnInit {
  private salesHistoryService = inject(SalesHistoryService);
  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  private datePipe = inject(DatePipe);

  sales: Sale[] = [];
  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];
  loadError = false;
  loaded = false;

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant('dashboard.' + k);
    const recorded = t('saleStatusRecorded');
    this.columns = [
      { key: 'plotNo', label: t('recentSalesColumnPlot'), type: 'text' },
      { key: 'projectName', label: t('recentSalesColumnProject'), type: 'text' },
      { key: 'amount', label: t('recentSalesColumnValue'), type: 'text' },
      { key: 'date', label: t('recentSalesColumnDate'), type: 'text' },
      { key: 'status', label: t('recentSalesColumnStatus'), type: 'badge', badgeTone: v => (v === recorded ? 'success' : 'danger') }
    ];
    this.salesHistoryService.getMySales(0, RECENT_SALES_COUNT).subscribe({
      next: res => {
        this.sales = res.sales;
        this.rows = res.sales.map(sale => ({
          plotNo: sale.plotNo ?? '',
          projectName: sale.projectName ?? '',
          amount: this.currencyPipe.transform(sale.amount, 'INR') ?? '',
          date: this.datePipe.transform(sale.recordedAt, 'd MMM') ?? '',
          status: t(sale.status === 'VOIDED' ? 'saleStatusVoided' : 'saleStatusRecorded')
        }));
        this.loaded = true;
      },
      error: () => {
        this.loadError = true;
        this.loaded = true;
      }
    });
  }
}
