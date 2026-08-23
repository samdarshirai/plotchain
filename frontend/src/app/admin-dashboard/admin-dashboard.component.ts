import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStatsResponse, CurrentCycleStats } from './admin-dashboard.model';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';
import { SealCardComponent } from '../shared/components/seal-card/seal-card.component';
import { AdminRecentSalesTableComponent } from './widgets/recent-sales-table/recent-sales-table.component';
import { AdminNetworkGrowthChartComponent } from './widgets/network-growth-chart/network-growth-chart.component';
import { KycNetworkSummaryComponent } from '../dashboard/widgets/kyc-network-summary/kyc-network-summary.component';

// Post-login landing page for admin-family roles. Rebuilt per docs/superpowers/specs/2026-08-23-
// admin-dashboard-mockup-design.md to the same two-column mockup layout the associate dashboard
// already got -- this supersedes 2026-08-22-settings-design-parity.md's D6, which had deliberately
// kept the old section-by-section structure (D6's actual substance -- exactly one Seal Card for
// current-cycle income -- still holds; only the surrounding layout changed).
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, TranslateModule, StatTileComponent, SealCardComponent,
    AdminRecentSalesTableComponent, AdminNetworkGrowthChartComponent, KycNetworkSummaryComponent
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="admin-dashboard">
      <h1 class="admin-dashboard__title">{{ 'adminDashboard.heading' | translate }}</h1>
      <p class="admin-dashboard__subtitle">{{ 'adminDashboard.subtitle' | translate }}</p>

      <p *ngIf="loadError" class="admin-dashboard__load-error">{{ 'adminDashboard.loadError' | translate }}</p>

      <ng-container *ngIf="stats as s">
        <ng-container *ngIf="s.currentCycle as cycle; else noCycle">
          <app-seal-card
            [label]="'adminDashboard.currentCycleLabel' | translate"
            [value]="formatCurrency(cycle.totalIncome)"
            [caption]="cycleClosesKey(cycle.daysRemaining) | translate: { days: cycle.daysRemaining }"
            [deltaCaption]="cycleDeltaKey(cycle) | translate: { amount: formatCurrency(cycleDeltaAbs(cycle)) }"
            [deltaDown]="cycleDelta(cycle) < 0"
            [trendPoints]="cycleTrendPoints(cycle)"
          ></app-seal-card>
        </ng-container>
        <ng-template #noCycle>
          <p class="admin-dashboard__empty">{{ 'adminDashboard.noCycleEmptyState' | translate }}</p>
        </ng-template>

        <div class="admin-dashboard__tiles">
          <app-stat-tile
            icon="group"
            [label]="'adminDashboard.totalAssociatesLabel' | translate"
            [value]="s.totalAssociates.toString()"
            [hint]="'adminDashboard.cyclesCompletedHint' | translate: { count: s.cyclesCompleted }"
          ></app-stat-tile>
          <app-stat-tile
            icon="payments"
            [label]="'adminDashboard.walletBalanceLabel' | translate"
            [value]="formatCurrency(s.totalWalletBalance)"
          ></app-stat-tile>
          <app-stat-tile
            icon="point_of_sale"
            [label]="'adminDashboard.salesThisCycleLabel' | translate"
            [value]="(s.currentCycle?.salesThisCycle ?? 0).toString()"
            [hint]="'adminDashboard.totalSalesRecordedHint' | translate: { count: s.totalSalesRecorded }"
          ></app-stat-tile>
          <app-stat-tile
            icon="trending_up"
            [label]="'adminDashboard.revenueThisCycleLabel' | translate"
            [value]="formatCurrency(s.currentCycle?.revenueThisCycle ?? 0)"
            [hint]="'adminDashboard.activePlotsHint' | translate: { count: s.activePlots }"
          ></app-stat-tile>
        </div>

        <div class="admin-dashboard__panels">
          <app-admin-recent-sales-table [sales]="s.recentSales"></app-admin-recent-sales-table>
          <div class="admin-dashboard__panels-right">
            <app-admin-network-growth-chart [data]="s.networkGrowth"></app-admin-network-growth-chart>
            <app-kyc-network-summary [data]="s.kycBreakdown"></app-kyc-network-summary>
            <div class="admin-dashboard__quick-actions">
              <a [routerLink]="['/settings', 'payout-approval']" class="admin-dashboard__tile-link">
                <app-stat-tile
                  icon="account_balance_wallet"
                  [label]="'adminDashboard.pendingWithdrawalsLabel' | translate"
                  [value]="s.pendingWithdrawals.toString()"
                  tone="accent"
                ></app-stat-tile>
              </a>
              <a [routerLink]="['/admin', 'sales', 'new']" class="admin-dashboard__quick-action admin-dashboard__quick-action--primary">
                {{ 'adminDashboard.recordSaleAction' | translate }}
              </a>
              <a [routerLink]="['/admin', 'associates', 'new']" class="admin-dashboard__quick-action admin-dashboard__quick-action--secondary">
                {{ 'adminDashboard.provisionAssociateAction' | translate }}
              </a>
            </div>
          </div>
        </div>
      </ng-container>
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  private adminDashboardService = inject(AdminDashboardService);
  private currencyPipe = inject(CurrencyPipe);

  stats: AdminStatsResponse | null = null;
  loadError = false;

  ngOnInit(): void {
    this.loadStats();
  }

  formatCurrency(value: number): string {
    return this.currencyPipe.transform(value, 'INR', 'symbol', '1.0-2') ?? String(value);
  }

  cycleClosesKey(days: number): string {
    return days === 1 ? 'adminDashboard.cycleClosesSingular' : 'adminDashboard.cycleCloses';
  }

  cycleDelta(cycle: CurrentCycleStats): number {
    return cycle.totalIncome - cycle.previousCycleTotalIncome;
  }

  cycleDeltaAbs(cycle: CurrentCycleStats): number {
    return Math.abs(this.cycleDelta(cycle));
  }

  cycleDeltaKey(cycle: CurrentCycleStats): string {
    return this.cycleDelta(cycle) >= 0 ? 'adminDashboard.deltaUp' : 'adminDashboard.deltaDown';
  }

  cycleTrendPoints(cycle: CurrentCycleStats): string | undefined {
    const trend = cycle.incomeTrend;
    if (!trend || trend.length < 2) {
      return undefined;
    }
    const max = Math.max(...trend);
    const min = Math.min(...trend, 0);
    const range = max - min || 1;
    const stepX = 100 / (trend.length - 1);
    return trend
      .map((value, i) => `${(i * stepX).toFixed(1)},${(28 - ((value - min) / range) * 28).toFixed(1)}`)
      .join(' ');
  }

  private loadStats(): void {
    this.loadError = false;
    this.adminDashboardService.getStats().subscribe({
      next: res => (this.stats = res),
      error: () => (this.loadError = true)
    });
  }
}
