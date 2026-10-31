import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../../shared/components/editable-table/editable-table.component';
import { SalesHistoryService } from '../../../sales-history/sales-history.service';
import { Sale } from '../../../admin/models/sale.model';

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
      <app-editable-table
        *ngIf="rows.length"
        [readOnly]="true"
        [columns]="columns"
        [rows]="rows"
      ></app-editable-table>
    </div>
  `
})
export class RecentSalesTableComponent implements OnInit {
  private salesHistoryService = inject(SalesHistoryService);

  private translate = inject(TranslateService);
  private currencyPipe = inject(CurrencyPipe);
  private datePipe = inject(DatePipe);

  sales: Sale[] = [];
  rows: Record<string, string>[] = [];
  columns: EditableTableColumn[] = [];
  loadError = false;
  loaded = false;

  ngOnInit(): void {
    this.columns = [
      { key: 'plotNo', label: this.translate.instant('dashboard.recentSalesColumnPlot'), type: 'text', icon: 'landscape' },
      { key: 'projectName', label: this.translate.instant('dashboard.recentSalesColumnProject'), type: 'text', icon: 'apartment' },
      { key: 'amount', label: this.translate.instant('dashboard.recentSalesColumnValue'), type: 'text', icon: 'payments' },
      { key: 'recordedAt', label: this.translate.instant('dashboard.recentSalesColumnDate'), type: 'text', icon: 'calendar_today' },
      { key: 'status', label: this.translate.instant('dashboard.recentSalesColumnStatus'), type: 'badge', badgeTone: v => this.statusTone(v) }
    ];
    this.salesHistoryService.getMySales(0, RECENT_SALES_COUNT).subscribe({
      next: res => {
        this.sales = res.sales;
        this.rows = res.sales.map(sale => ({
          plotNo: sale.plotNo ?? '—',
          projectName: sale.projectName ?? '—',
          amount: this.currencyPipe.transform(sale.amount, 'INR', 'symbol', '1.0-2') ?? String(sale.amount),
          recordedAt: this.datePipe.transform(sale.recordedAt, 'd MMM y') ?? sale.recordedAt,
          status: this.translate.instant(sale.status === 'VOIDED' ? 'dashboard.saleStatusVoided' : 'dashboard.saleStatusRecorded')
        }));
        this.loaded = true;
      },
      error: () => {
        this.loadError = true;
        this.loaded = true;
      }
    });
  }

  private statusTone(value: string | number): BadgeTone {
    return value === this.translate.instant('dashboard.saleStatusVoided') ? 'danger' : 'success';
  }
}
