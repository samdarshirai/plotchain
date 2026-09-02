import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';
import { KycBannerComponent } from './widgets/kyc-banner/kyc-banner.component';
import { CycleIncomeCardComponent } from './widgets/cycle-income-card/cycle-income-card.component';
import { QuickActionsComponent } from './widgets/quick-actions/quick-actions.component';
import { RecentSalesTableComponent } from './widgets/recent-sales-table/recent-sales-table.component';
import { NetworkGrowthChartComponent } from './widgets/network-growth-chart/network-growth-chart.component';
import { KycNetworkSummaryComponent } from './widgets/kyc-network-summary/kyc-network-summary.component';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, TranslateModule, KycBannerComponent, CycleIncomeCardComponent,
    QuickActionsComponent, RecentSalesTableComponent, NetworkGrowthChartComponent,
    KycNetworkSummaryComponent, StatTileComponent
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="dashboard" *ngIf="dashboard as d">
      <div class="dashboard__header">
        <div class="dashboard__header-left">
          <h1 class="dashboard__title">{{ 'dashboard.title' | translate }}</h1>
          <p class="dashboard__subtitle">{{ cycleClosesKey(d.cycleCountdown.daysRemaining) | translate: { days: d.cycleCountdown.daysRemaining } }}</p>
        </div>
        <div class="dashboard__header-right">
          <span class="dashboard__name">{{ d.associate.name }}</span>
          <span class="dashboard__rank-badge">{{ d.associate.rank }}</span>
          <span class="dashboard__id-caption">{{ 'dashboard.associateIdLabel' | translate }} {{ d.associate.associateId }}</span>
        </div>
      </div>

      <app-kyc-banner [visible]="d.kycPendingBannerVisible"></app-kyc-banner>

      <app-cycle-income-card [data]="d.cycleIncome"></app-cycle-income-card>

      <div class="dashboard__tiles">
        <app-stat-tile
          icon="account_balance_wallet"
          [label]="'dashboard.walletBalanceLabel' | translate"
          [value]="formatCurrency(d.wallet.balance)"
          [hint]="'dashboard.withdrawContactAdmin' | translate"
        ></app-stat-tile>
        <app-stat-tile
          icon="group"
          [label]="'dashboard.networkLabel' | translate"
          [value]="d.networkSummary.totalDownline.toString()"
          [hint]="'dashboard.networkHint' | translate: { direct: d.networkSummary.directCount, downline: d.networkSummary.totalDownline - d.networkSummary.directCount }"
        ></app-stat-tile>
        <app-stat-tile
          icon="sell"
          [label]="'dashboard.salesThisCycleLabel' | translate"
          [value]="d.salesSummary.salesThisCycle.toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="trending_up"
          [label]="'dashboard.revenueBookedLabel' | translate"
          [value]="formatCurrency(d.salesSummary.revenueBookedThisCycle)"
          [hint]="revenueHintKey(d.salesSummary.revenueBookedChangePct) | translate: { pct: revenueDeltaAbs(d.salesSummary.revenueBookedChangePct) }"
        ></app-stat-tile>
        <app-stat-tile
          icon="arrow_back"
          [label]="'dashboard.leftLegVolumeLabel' | translate"
          [value]="formatCurrency(d.legVolumeSummary.leftLegVolume)"
        ></app-stat-tile>
        <app-stat-tile
          icon="arrow_forward"
          [label]="'dashboard.rightLegVolumeLabel' | translate"
          [value]="formatCurrency(d.legVolumeSummary.rightLegVolume)"
        ></app-stat-tile>
      </div>

      <div class="dashboard__panels">
        <app-recent-sales-table></app-recent-sales-table>
        <div class="dashboard__panels-right">
          <app-network-growth-chart [data]="d.networkGrowth"></app-network-growth-chart>
          <app-kyc-network-summary [data]="d.kycBreakdown"></app-kyc-network-summary>
          <app-quick-actions></app-quick-actions>
        </div>
      </div>
    </div>
    <div class="dashboard-error" *ngIf="error">{{ 'dashboard.loadError' | translate }}</div>
  `
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);
  private currencyPipe = inject(CurrencyPipe);

  dashboard: DashboardResponse | null = null;
  error = false;

  ngOnInit(): void {
    this.dashboardService.getDashboard().subscribe({
      next: d => (this.dashboard = d),
      error: () => (this.error = true)
    });
  }

  formatCurrency(value: number): string {
    return this.currencyPipe.transform(value, 'INR', 'symbol', '1.0-0') ?? String(value);
  }

  revenueHintKey(changePct: number): string {
    return changePct >= 0 ? 'dashboard.revenueUp' : 'dashboard.revenueDown';
  }

  revenueDeltaAbs(changePct: number): number {
    return Math.abs(changePct);
  }

  cycleClosesKey(days: number): string {
    return days === 1 ? 'dashboard.cycleClosesSingular' : 'dashboard.cycleCloses';
  }
}
