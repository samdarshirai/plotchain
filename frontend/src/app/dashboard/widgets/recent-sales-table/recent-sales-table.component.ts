import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SalesHistoryService } from '../../../sales-history/sales-history.service';
import { Sale } from '../../../admin/models/sale.model';

const RECENT_SALES_COUNT = 5;

@Component({
  selector: 'app-recent-sales-table',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  providers: [DatePipe],
  template: `
    <div class="recent-sales-table">
      <div class="recent-sales-table__header">
        <span class="recent-sales-table__rule"></span>
        <span class="recent-sales-table__label">{{ 'dashboard.recentSalesEyebrow' | translate }}</span>
        <span class="recent-sales-table__rule"></span>
      </div>
      <p *ngIf="loadError" class="recent-sales-table__error">{{ 'dashboard.recentSalesLoadError' | translate }}</p>
      <p *ngIf="!loadError && loaded && sales.length === 0" class="recent-sales-table__empty">{{ 'dashboard.recentSalesEmpty' | translate }}</p>
      <table class="recent-sales-table__table" *ngIf="sales.length">
        <thead>
          <tr>
            <th>{{ 'dashboard.recentSalesColumnPlot' | translate }}</th>
            <th>{{ 'dashboard.recentSalesColumnProject' | translate }}</th>
            <th>{{ 'dashboard.recentSalesColumnValue' | translate }}</th>
            <th>{{ 'dashboard.recentSalesColumnDate' | translate }}</th>
            <th>{{ 'dashboard.recentSalesColumnStatus' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let sale of sales">
            <td class="recent-sales-table__plot-no">{{ sale.plotNo }}</td>
            <td>{{ sale.projectName }}</td>
            <td>{{ sale.amount | currency:'INR' }}</td>
            <td>{{ sale.recordedAt | date:'d MMM' }}</td>
            <td>
              <span
                class="recent-sales-table__status-pill"
                [class.recent-sales-table__status-pill--voided]="sale.status === 'VOIDED'"
              >{{ (sale.status === 'VOIDED' ? 'dashboard.saleStatusVoided' : 'dashboard.saleStatusRecorded') | translate }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `
})
export class RecentSalesTableComponent implements OnInit {
  private salesHistoryService = inject(SalesHistoryService);

  sales: Sale[] = [];
  loadError = false;
  loaded = false;

  ngOnInit(): void {
    this.salesHistoryService.getMySales(0, RECENT_SALES_COUNT).subscribe({
      next: res => {
        this.sales = res.sales;
        this.loaded = true;
      },
      error: () => {
        this.loadError = true;
        this.loaded = true;
      }
    });
  }
}
