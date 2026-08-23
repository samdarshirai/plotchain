import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Sale } from '../../../admin/models/sale.model';

// Unlike the associate side's RecentSalesTableComponent, this widget takes its data as an
// @Input rather than firing its own HTTP request: 2026-08-23-admin-dashboard-mockup-design.md §4
// rides recentSales on the single GET /api/admin/stats response, so a load failure here is a
// whole-dashboard load failure, not an isolated one -- there's no separate loading/error state to
// manage.
@Component({
  selector: 'app-admin-recent-sales-table',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="admin-recent-sales-table">
      <div class="admin-recent-sales-table__header">
        <span class="admin-recent-sales-table__rule"></span>
        <span class="admin-recent-sales-table__label">{{ 'adminDashboard.recentSalesEyebrow' | translate }}</span>
        <span class="admin-recent-sales-table__rule"></span>
      </div>
      <p *ngIf="!sales.length" class="admin-recent-sales-table__empty">{{ 'adminDashboard.recentSalesEmpty' | translate }}</p>
      <table class="admin-recent-sales-table__table" *ngIf="sales.length">
        <thead>
          <tr>
            <th>{{ 'adminDashboard.recentSalesColumnPlot' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnProject' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnAssociate' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnValue' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnDate' | translate }}</th>
            <th>{{ 'adminDashboard.recentSalesColumnStatus' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let sale of sales">
            <td class="admin-recent-sales-table__plot-no">{{ sale.plotNo }}</td>
            <td>{{ sale.projectName }}</td>
            <td>{{ sale.associateName }}</td>
            <td>{{ sale.amount | currency:'INR' }}</td>
            <td>{{ sale.recordedAt | date:'d MMM' }}</td>
            <td>
              <span
                class="admin-recent-sales-table__status-pill"
                [class.admin-recent-sales-table__status-pill--voided]="sale.status === 'VOIDED'"
              >{{ (sale.status === 'VOIDED' ? 'adminDashboard.saleStatusVoided' : 'adminDashboard.saleStatusRecorded') | translate }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `
})
export class AdminRecentSalesTableComponent {
  @Input({ required: true }) sales: Sale[] = [];
}
