import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStatsResponse } from './admin-dashboard.model';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, StatTileComponent],
  providers: [CurrencyPipe],
  template: `
    <div class="admin-dashboard">
      <h1 class="card-title">{{ 'adminDashboard.heading' | translate }}</h1>

      <p *ngIf="loadError" class="admin-dashboard__load-error">{{ 'adminDashboard.loadError' | translate }}</p>

      <ng-container *ngIf="stats as s">
        <div class="admin-dashboard__tiles">
          <app-stat-tile
            icon="group"
            [label]="'adminDashboard.totalAssociatesLabel' | translate"
            [value]="s.totalAssociates.toString()"
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
          ></app-stat-tile>
          <app-stat-tile
            icon="trending_up"
            [label]="'adminDashboard.revenueThisCycleLabel' | translate"
            [value]="formatCurrency(s.currentCycle?.revenueThisCycle ?? 0)"
          ></app-stat-tile>
        </div>

        <section class="admin-dashboard__cycle">
          <h2 class="admin-dashboard__section-title">{{ 'adminDashboard.currentCycleTitle' | translate }}</h2>
          <ng-container *ngIf="s.currentCycle as cycle; else noCycle">
            <div class="admin-dashboard__tiles">
              <app-stat-tile
                [label]="'adminDashboard.periodLabel' | translate"
                [value]="cycle.periodStart + ' – ' + cycle.periodEnd"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.daysRemainingLabel' | translate"
                [value]="cycle.daysRemaining.toString()"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.directIncomeLabel' | translate"
                [value]="formatCurrency(cycle.directIncome)"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.matchingIncomeLabel' | translate"
                [value]="formatCurrency(cycle.matchingIncome)"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.totalIncomeLabel' | translate"
                [value]="formatCurrency(cycle.totalIncome)"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'adminDashboard.newAssociatesLabel' | translate"
                [value]="cycle.newAssociatesThisCycle.toString()"
              ></app-stat-tile>
            </div>
          </ng-container>
          <ng-template #noCycle>
            <p class="admin-dashboard__empty">{{ 'adminDashboard.noCycleEmptyState' | translate }}</p>
          </ng-template>
        </section>

        <section class="admin-dashboard__kyc">
          <h2 class="admin-dashboard__section-title">{{ 'adminDashboard.kycBreakdownTitle' | translate }}</h2>
          <div class="admin-dashboard__tiles">
            <a [routerLink]="['/settings', 'kyc-queue']" class="admin-dashboard__tile-link">
              <app-stat-tile
                icon="hourglass_top"
                tone="warning"
                [label]="'adminDashboard.kycPendingLabel' | translate"
                [value]="s.kycBreakdown.pending.toString()"
              ></app-stat-tile>
            </a>
            <app-stat-tile
              icon="check_circle"
              tone="success"
              [label]="'adminDashboard.kycVerifiedLabel' | translate"
              [value]="s.kycBreakdown.verified.toString()"
            ></app-stat-tile>
            <app-stat-tile
              icon="cancel"
              tone="danger"
              [label]="'adminDashboard.kycRejectedLabel' | translate"
              [value]="s.kycBreakdown.rejected.toString()"
            ></app-stat-tile>
          </div>
        </section>

        <section class="admin-dashboard__withdrawals">
          <a [routerLink]="['/settings', 'payout-approval']" class="admin-dashboard__tile-link">
            <app-stat-tile
              icon="account_balance_wallet"
              [label]="'adminDashboard.pendingWithdrawalsLabel' | translate"
              [value]="s.pendingWithdrawals.toString()"
              tone="accent"
            ></app-stat-tile>
          </a>
        </section>

        <section class="admin-dashboard__quick-actions">
          <h2 class="admin-dashboard__section-title">{{ 'adminDashboard.quickActionsTitle' | translate }}</h2>
          <div class="admin-dashboard__quick-actions-row">
            <a [routerLink]="['/admin', 'sales', 'new']" class="brand-button brand-button--secondary">
              {{ 'adminDashboard.recordSaleAction' | translate }}
            </a>
            <a [routerLink]="['/admin', 'associates', 'new']" class="brand-button brand-button--secondary">
              {{ 'adminDashboard.provisionAssociateAction' | translate }}
            </a>
          </div>
        </section>
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

  private loadStats(): void {
    this.loadError = false;
    this.adminDashboardService.getStats().subscribe({
      next: res => (this.stats = res),
      error: () => (this.loadError = true)
    });
  }
}
