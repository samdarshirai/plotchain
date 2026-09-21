import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';
import { KycBannerComponent } from './widgets/kyc-banner/kyc-banner.component';
import { CycleIncomeCardComponent } from './widgets/cycle-income-card/cycle-income-card.component';
import { ProfileCardComponent } from './widgets/profile-card/profile-card.component';
import { QuickActionsComponent } from './widgets/quick-actions/quick-actions.component';
import { RecentSalesTableComponent } from './widgets/recent-sales-table/recent-sales-table.component';
import { LegBalanceComponent } from './widgets/leg-balance/leg-balance.component';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';

interface DashboardTile {
  icon: string;
  labelKey: string;
  value: string;
  noteKey?: string;
  noteParams?: Record<string, string | number>;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, TranslateModule, KycBannerComponent, CycleIncomeCardComponent, ProfileCardComponent,
    QuickActionsComponent, RecentSalesTableComponent, LegBalanceComponent, StatTileComponent
  ],
  providers: [CurrencyPipe],
  template: `
    <div class="dashboard" *ngIf="dashboard as d">
      <div class="dashboard__header">
        <div class="dashboard__header-left">
          <h1 class="dashboard__title">{{ 'dashboard.title' | translate }}</h1>
          <div class="dashboard__header-meta">
            <span class="dashboard__cycle-pill">{{ cycleClosesKey(d.cycleCountdown.daysRemaining) | translate: { days: d.cycleCountdown.daysRemaining } }}</span>
            <span class="dashboard__cycle-range">{{ 'dashboard.cycleRange' | translate: { number: d.cycleCountdown.cycleNumber, start: (d.cycleCountdown.periodStart | date:'d MMM'), end: (d.cycleCountdown.periodEnd | date:'d MMM') } }}</span>
          </div>
        </div>
        <div class="dashboard__header-right">
          <span class="dashboard__rank-badge">{{ d.associate.rank }}</span>
          <span class="dashboard__id-caption">{{ d.associate.associateId }}</span>
        </div>
      </div>

      <app-kyc-banner [visible]="d.kycPendingBannerVisible"></app-kyc-banner>

      <div class="dashboard__hero">
        <app-profile-card [associate]="d.associate"></app-profile-card>
        <app-cycle-income-card [data]="d.cycleIncome"></app-cycle-income-card>
      </div>

      <div class="dashboard__section">
        <div class="dashboard__section-header">
          <span class="dashboard__section-rule"></span>
          <span class="dashboard__section-label">{{ 'dashboard.businessVolumeEyebrow' | translate }}</span>
          <span class="dashboard__section-rule dashboard__section-rule--fill"></span>
        </div>
        <div class="dashboard__tiles">
          <app-stat-tile *ngFor="let tile of businessVolumeTiles(d)"
            [icon]="tile.icon"
            [label]="tile.labelKey | translate"
            [value]="tile.value"
            [hint]="tile.noteKey ? (tile.noteKey | translate: tile.noteParams) : undefined"
          ></app-stat-tile>
        </div>
      </div>

      <div class="dashboard__section">
        <div class="dashboard__section-header">
          <span class="dashboard__section-rule"></span>
          <span class="dashboard__section-label">{{ 'dashboard.networkIncomeEyebrow' | translate }}</span>
          <span class="dashboard__section-rule dashboard__section-rule--fill"></span>
        </div>
        <div class="dashboard__tiles">
          <app-stat-tile *ngFor="let tile of networkIncomeTiles(d)"
            [icon]="tile.icon"
            [label]="tile.labelKey | translate"
            [value]="tile.value"
            [hint]="tile.noteKey ? (tile.noteKey | translate: tile.noteParams) : undefined"
          ></app-stat-tile>
        </div>
      </div>

      <div class="dashboard__panels">
        <app-leg-balance [data]="d.legVolumeSummary" [leftAssociateCount]="d.networkSummary.leftAssociateCount" [rightAssociateCount]="d.networkSummary.rightAssociateCount"></app-leg-balance>
        <div class="dashboard__panels-right">
          <app-recent-sales-table></app-recent-sales-table>
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

  cycleClosesKey(days: number): string {
    return days === 1 ? 'dashboard.cycleClosesSingular' : 'dashboard.cycleCloses';
  }

  // "New Left/Right Business" and "New Matching Business" are live, pre-close subtree volume for
  // the still-open cycle -- no backend computation exists for that yet (leg_volume rows are only
  // written at cycle close), so they render as a fixed 0 with a "settles at cycle close" note
  // rather than a real figure.
  businessVolumeTiles(d: DashboardResponse): DashboardTile[] {
    return [
      { icon: 'trending_up', labelKey: 'dashboard.newLeftBusinessLabel', value: '0', noteKey: 'dashboard.settlesAtCycleClose' },
      { icon: 'trending_up', labelKey: 'dashboard.newRightBusinessLabel', value: '0', noteKey: 'dashboard.settlesAtCycleClose' },
      { icon: 'arrow_back', labelKey: 'dashboard.totalLeftBusinessLabel', value: this.formatCurrency(d.legVolumeSummary.totalLeftBusiness), noteKey: 'dashboard.lifetimeVolume' },
      { icon: 'arrow_forward', labelKey: 'dashboard.totalRightBusinessLabel', value: this.formatCurrency(d.legVolumeSummary.totalRightBusiness), noteKey: 'dashboard.lifetimeVolume' },
      { icon: 'person_check', labelKey: 'dashboard.totalSelfBusinessLabel', value: this.formatCurrency(d.legVolumeSummary.totalSelfBusiness), noteKey: 'dashboard.ownBookings' },
      { icon: 'sync_alt', labelKey: 'dashboard.newMatchingBusinessLabel', value: '0', noteKey: 'dashboard.settlesAtCycleClose' }
    ];
  }

  networkIncomeTiles(d: DashboardResponse): DashboardTile[] {
    return [
      { icon: 'group', labelKey: 'dashboard.leftAssociatesLabel', value: d.networkSummary.leftAssociateCount.toString(), noteKey: 'dashboard.inLeftLeg' },
      { icon: 'group', labelKey: 'dashboard.rightAssociatesLabel', value: d.networkSummary.rightAssociateCount.toString(), noteKey: 'dashboard.inRightLeg' },
      {
        icon: 'hub', labelKey: 'dashboard.networkLabel', value: d.networkSummary.totalDownline.toString(),
        noteKey: 'dashboard.networkHint',
        noteParams: { direct: d.networkSummary.directCount, downline: d.networkSummary.totalDownline - d.networkSummary.directCount }
      },
      { icon: 'sell', labelKey: 'dashboard.salesThisCycleLabel', value: d.salesSummary.salesThisCycle.toString() },
      { icon: 'square_foot', labelKey: 'dashboard.newBookedAreaLabel', value: `${d.legVolumeSummary.newBookedAreaSqft.toLocaleString('en-IN')} Sq. Ft.`, noteKey: 'dashboard.thisCycle' },
      { icon: 'payments', labelKey: 'dashboard.directIncomeLabel', value: this.formatCurrency(d.cycleIncome.directIncome), noteKey: 'dashboard.thisCycle' },
      { icon: 'sync_alt', labelKey: 'dashboard.matchingIncomeLabel', value: this.formatCurrency(d.cycleIncome.matchingIncomeLifetime), noteKey: 'dashboard.lifetime' },
      { icon: 'supervisor_account', labelKey: 'dashboard.sponsorMatchingLabel', value: this.formatCurrency(d.cycleIncome.sponsorMatchingIncomeLifetime), noteKey: 'dashboard.lifetime' },
      {
        icon: 'workspace_premium', labelKey: 'dashboard.currentRoyaltyBonusLabel',
        value: `${this.formatCurrency(d.cycleIncome.royaltyBonus)} (${d.cycleIncome.royaltyBonusPct}%)`,
        noteKey: 'dashboard.rankBasedPoolShare'
      },
      { icon: 'account_balance_wallet', labelKey: 'dashboard.walletBalanceLabel', value: this.formatCurrency(d.wallet.balance), noteKey: 'dashboard.withdrawContactAdmin' }
    ];
  }
}
