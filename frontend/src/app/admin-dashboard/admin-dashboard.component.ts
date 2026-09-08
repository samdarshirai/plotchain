import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStatsResponse, CurrentCycleStats } from './admin-dashboard.model';
import { SealCardComponent } from '../shared/components/seal-card/seal-card.component';
import { AdminRecentSalesTableComponent } from './widgets/recent-sales-table/recent-sales-table.component';

// Post-login landing page for admin-family roles. Rebuilt per docs/superpowers/specs/2026-09-08-
// admin-dashboard-redesign-1a-design.md to direction 1a ("The Ledger") of the Admin Dashboard
// Redesign canvas: the payout-liability Seal Card with an inline metrics strip (folding in the
// four loose stat tiles), a consolidated "NEEDS A DECISION" queue, and Network Health / Inventory
// cards replacing the growth-chart + KYC-summary + quick-actions column. This supersedes the
// 2026-08-23 mockup layout. Content region only -- the global app shell is untouched.
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, TranslateModule, SealCardComponent, AdminRecentSalesTableComponent
  ],
  providers: [CurrencyPipe, DatePipe],
  template: `
    <div class="admin-dashboard">
      <p *ngIf="loadError" class="admin-dashboard__load-error">{{ 'adminDashboard.loadError' | translate }}</p>

      <ng-container *ngIf="stats as s">
        <header class="admin-dashboard__header">
          <div>
            <h1 class="admin-dashboard__title">{{ 'adminDashboard.operationsTitle' | translate }}</h1>
            <p class="admin-dashboard__cycle-caption">
              <ng-container *ngIf="s.currentCycle as cycle; else noCycleCaption">
                {{ 'adminDashboard.cyclePeriod' | translate: {
                  start: (cycle.periodStart | date: 'd'),
                  end: (cycle.periodEnd | date: 'd MMM')
                } }}
                &middot;
                <span class="admin-dashboard__cycle-closes">{{ cycleClosesKey(cycle.daysRemaining) | translate: { days: cycle.daysRemaining } }}</span>
              </ng-container>
              <ng-template #noCycleCaption>{{ 'adminDashboard.noCycleEmptyState' | translate }}</ng-template>
            </p>
          </div>
          <div class="admin-dashboard__actions">
            <a
              [routerLink]="['/settings', 'associate-directory']"
              [queryParams]="{ provision: 1 }"
              class="admin-dashboard__action admin-dashboard__action--secondary"
            >{{ 'adminDashboard.provisionAssociateAction' | translate }}</a>
            <a [routerLink]="['/admin', 'sales', 'new']" class="admin-dashboard__action admin-dashboard__action--primary">
              {{ 'adminDashboard.recordSaleAction' | translate }}
            </a>
          </div>
        </header>

        <div class="admin-dashboard__row admin-dashboard__row--top">
          <ng-container *ngIf="s.currentCycle as cycle; else noCycle">
            <app-seal-card
              class="admin-dashboard__seal"
              [label]="'adminDashboard.payoutLiabilityLabel' | translate"
              [value]="formatCurrency(cycle.totalIncome)"
              [deltaCaption]="cycleDeltaKey(cycle) | translate: { amount: formatCurrency(cycleDeltaAbs(cycle)) }"
              [deltaDown]="cycleDelta(cycle) < 0"
              [trendPoints]="cycleTrendPoints(cycle)"
            >
              <div seal-card-strip class="admin-dashboard__seal-strip">
                <div>
                  <span class="admin-dashboard__seal-strip-label">{{ 'adminDashboard.stripRevenueLabel' | translate }}</span>
                  <span class="admin-dashboard__seal-strip-value">{{ formatCurrency(cycle.revenueThisCycle) }}</span>
                </div>
                <div>
                  <span class="admin-dashboard__seal-strip-label">{{ 'adminDashboard.stripSalesLabel' | translate }}</span>
                  <span class="admin-dashboard__seal-strip-value">{{ cycle.salesThisCycle }}</span>
                </div>
                <div>
                  <span class="admin-dashboard__seal-strip-label">{{ 'adminDashboard.stripActiveLabel' | translate }}</span>
                  <span class="admin-dashboard__seal-strip-value">
                    {{ s.networkHealth.activeThisCycle }}<span class="admin-dashboard__seal-strip-sub"> / {{ s.totalAssociates }}</span>
                  </span>
                </div>
              </div>
            </app-seal-card>
          </ng-container>
          <ng-template #noCycle>
            <p class="admin-dashboard__empty">{{ 'adminDashboard.noCycleEmptyState' | translate }}</p>
          </ng-template>

          <section class="admin-dashboard__decision">
            <div class="admin-dashboard__decision-head">
              <span class="admin-dashboard__decision-eyebrow">{{ 'adminDashboard.decisionQueueHeading' | translate }}</span>
              <span class="admin-dashboard__decision-total" *ngIf="decisionTotal(s) > 0">{{ decisionTotal(s) }}</span>
            </div>
            <div class="admin-dashboard__decision-rows">
              <a [routerLink]="['/settings', 'payout-approval']" class="admin-dashboard__decision-row" [class.admin-dashboard__decision-row--empty]="!s.pendingWithdrawals">
                <span class="material-symbols-outlined" aria-hidden="true">payments</span>
                <span class="admin-dashboard__decision-body">
                  <span class="admin-dashboard__decision-title">{{ 'adminDashboard.decisionWithdrawalsTitle' | translate }}</span>
                  <span class="admin-dashboard__decision-sub" *ngIf="s.pendingWithdrawals; else noWithdrawals">
                    {{ formatCurrency(s.pendingWithdrawalsValue) }}
                    <ng-container *ngIf="s.oldestPendingWithdrawalAgeDays != null">
                      &middot; {{ 'adminDashboard.decisionOldest' | translate: { days: s.oldestPendingWithdrawalAgeDays } }}
                    </ng-container>
                  </span>
                  <ng-template #noWithdrawals>
                    <span class="admin-dashboard__decision-sub">{{ 'adminDashboard.decisionNothingWaiting' | translate }}</span>
                  </ng-template>
                </span>
                <span class="admin-dashboard__decision-count">{{ s.pendingWithdrawals }}</span>
              </a>
              <a [routerLink]="['/settings', 'kyc-queue']" class="admin-dashboard__decision-row" [class.admin-dashboard__decision-row--empty]="!s.kycBreakdown.pending">
                <span class="material-symbols-outlined" aria-hidden="true">verified_user</span>
                <span class="admin-dashboard__decision-body">
                  <span class="admin-dashboard__decision-title">{{ 'adminDashboard.decisionKycTitle' | translate }}</span>
                  <span class="admin-dashboard__decision-sub" *ngIf="s.kycBreakdown.pending; else noKyc">
                    {{ 'adminDashboard.decisionKycRejected' | translate: { count: s.kycBreakdown.rejected } }}
                  </span>
                  <ng-template #noKyc>
                    <span class="admin-dashboard__decision-sub">{{ 'adminDashboard.decisionNothingWaiting' | translate }}</span>
                  </ng-template>
                </span>
                <span class="admin-dashboard__decision-count">{{ s.kycBreakdown.pending }}</span>
              </a>
            </div>
            <div class="admin-dashboard__decision-foot">
              <span>{{ 'adminDashboard.decisionFooter' | translate }}</span>
              <a [routerLink]="['/settings', 'payout-approval']">{{ 'adminDashboard.decisionReviewAll' | translate }}</a>
            </div>
          </section>
        </div>

        <div class="admin-dashboard__row admin-dashboard__row--bottom">
          <app-admin-recent-sales-table [sales]="s.recentSales"></app-admin-recent-sales-table>

          <div class="admin-dashboard__bottom-right">
            <section class="admin-dashboard__panel admin-dashboard__network">
              <div class="admin-dashboard__panel-head">
                <span class="admin-dashboard__panel-rule"></span>
                <span class="admin-dashboard__panel-eyebrow">{{ 'adminDashboard.networkHealthEyebrow' | translate }}</span>
                <span class="admin-dashboard__panel-rule"></span>
              </div>
              <dl class="admin-dashboard__leaders">
                <div><dt>{{ 'adminDashboard.networkActive' | translate }}</dt><dd>{{ s.networkHealth.activeThisCycle }}</dd></div>
                <div><dt>{{ 'adminDashboard.networkInactive' | translate }}</dt><dd class="admin-dashboard__leader--warn">{{ inactiveThisCycle(s) }}</dd></div>
                <div><dt>{{ 'adminDashboard.networkJoined' | translate }}</dt><dd class="admin-dashboard__leader--good">+{{ s.networkHealth.joinedThisCycle }}</dd></div>
                <div><dt>{{ 'adminDashboard.networkDeepestLeg' | translate }}</dt><dd>{{ 'adminDashboard.networkLevels' | translate: { count: s.networkHealth.deepestLeg } }}</dd></div>
              </dl>
              <div class="admin-dashboard__split-bar">
                <span class="admin-dashboard__split-bar-active" [style.width.%]="activeSharePercent(s)"></span>
                <span class="admin-dashboard__split-bar-idle" [style.width.%]="100 - activeSharePercent(s)"></span>
              </div>
              <div class="admin-dashboard__split-legend">
                <span><i class="admin-dashboard__swatch admin-dashboard__swatch--active"></i>{{ 'adminDashboard.networkLegendActive' | translate }}</span>
                <span><i class="admin-dashboard__swatch admin-dashboard__swatch--idle"></i>{{ 'adminDashboard.networkLegendIdle' | translate }}</span>
              </div>
            </section>

            <section class="admin-dashboard__panel admin-dashboard__inventory">
              <div class="admin-dashboard__panel-head">
                <span class="admin-dashboard__panel-rule"></span>
                <span class="admin-dashboard__panel-eyebrow">{{ 'adminDashboard.inventoryEyebrow' | translate }}</span>
                <span class="admin-dashboard__panel-rule"></span>
              </div>
              <div class="admin-dashboard__inventory-top">
                <div>
                  <div class="admin-dashboard__inventory-figure">{{ s.activePlots }}</div>
                  <div class="admin-dashboard__inventory-caption">{{ 'adminDashboard.inventoryUnsold' | translate }}</div>
                </div>
                <a [routerLink]="['/settings', 'projects']" class="admin-dashboard__panel-link">{{ 'adminDashboard.inventoryBookingGrid' | translate }}</a>
              </div>
              <div class="admin-dashboard__inventory-grid">
                <span *ngFor="let sold of inventoryCells(s)" [class.admin-dashboard__cell--sold]="sold"></span>
              </div>
              <div class="admin-dashboard__inventory-foot">
                <span>{{ 'adminDashboard.inventorySold' | translate: { count: s.plotsSold } }}</span>
                <span>{{ 'adminDashboard.inventoryTotal' | translate: { count: s.plotsTotal } }}</span>
              </div>
            </section>
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
    return days === 1 ? 'adminDashboard.cycleClosesShortSingular' : 'adminDashboard.cycleClosesShort';
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

  decisionTotal(s: AdminStatsResponse): number {
    return s.pendingWithdrawals + s.kycBreakdown.pending;
  }

  inactiveThisCycle(s: AdminStatsResponse): number {
    return Math.max(0, s.totalAssociates - s.networkHealth.activeThisCycle);
  }

  activeSharePercent(s: AdminStatsResponse): number {
    return s.totalAssociates > 0
      ? Math.round((s.networkHealth.activeThisCycle / s.totalAssociates) * 100)
      : 0;
  }

  // 24-cell inventory grid, filled proportionally to plots sold (mirrors 1a's fixed 24-column row).
  inventoryCells(s: AdminStatsResponse): boolean[] {
    const filled = s.plotsTotal > 0 ? Math.round((s.plotsSold / s.plotsTotal) * 24) : 0;
    return Array.from({ length: 24 }, (_, i) => i < filled);
  }

  private loadStats(): void {
    this.loadError = false;
    this.adminDashboardService.getStats().subscribe({
      next: res => (this.stats = res),
      error: () => (this.loadError = true)
    });
  }
}
