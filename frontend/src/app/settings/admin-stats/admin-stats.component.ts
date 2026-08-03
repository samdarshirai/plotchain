import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsResponse } from './admin-stats.model';

@Component({
  selector: 'app-admin-stats',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="admin-stats card">
      <h1 class="card-title">{{ 'settings.sections.adminStats' | translate }}</h1>

      <ng-container *ngIf="stats as s">
        <dl class="admin-stats__tiles">
          <div class="admin-stats__tile">
            <dt>{{ 'settings.adminStats.totalAssociatesLabel' | translate }}</dt>
            <dd>{{ s.totalAssociates }}</dd>
          </div>
          <div class="admin-stats__tile">
            <dt>{{ 'settings.adminStats.walletBalanceLabel' | translate }}</dt>
            <dd>{{ s.totalWalletBalance }}</dd>
          </div>
        </dl>

        <section class="admin-stats__kyc">
          <h2>{{ 'settings.adminStats.kycBreakdownTitle' | translate }}</h2>
          <dl class="admin-stats__tiles">
            <div class="admin-stats__tile">
              <dt>{{ 'settings.adminStats.kycPendingLabel' | translate }}</dt>
              <dd>{{ s.kycBreakdown.pending }}</dd>
            </div>
            <div class="admin-stats__tile">
              <dt>{{ 'settings.adminStats.kycVerifiedLabel' | translate }}</dt>
              <dd>{{ s.kycBreakdown.verified }}</dd>
            </div>
            <div class="admin-stats__tile">
              <dt>{{ 'settings.adminStats.kycRejectedLabel' | translate }}</dt>
              <dd>{{ s.kycBreakdown.rejected }}</dd>
            </div>
          </dl>
        </section>

        <section class="admin-stats__cycle">
          <h2>{{ 'settings.adminStats.currentCycleTitle' | translate }}</h2>
          <ng-container *ngIf="s.currentCycle as cycle; else noCycle">
            <dl class="admin-stats__tiles">
              <div class="admin-stats__tile">
                <dt>{{ 'settings.adminStats.periodLabel' | translate }}</dt>
                <dd>{{ cycle.periodStart }} &ndash; {{ cycle.periodEnd }}</dd>
              </div>
              <div class="admin-stats__tile">
                <dt>{{ 'settings.adminStats.daysRemainingLabel' | translate }}</dt>
                <dd>{{ cycle.daysRemaining }}</dd>
              </div>
              <div class="admin-stats__tile">
                <dt>{{ 'settings.adminStats.directIncomeLabel' | translate }}</dt>
                <dd>{{ cycle.directIncome }}</dd>
              </div>
              <div class="admin-stats__tile">
                <dt>{{ 'settings.adminStats.matchingIncomeLabel' | translate }}</dt>
                <dd>{{ cycle.matchingIncome }}</dd>
              </div>
              <div class="admin-stats__tile">
                <dt>{{ 'settings.adminStats.totalIncomeLabel' | translate }}</dt>
                <dd>{{ cycle.totalIncome }}</dd>
              </div>
              <div class="admin-stats__tile">
                <dt>{{ 'settings.adminStats.newAssociatesLabel' | translate }}</dt>
                <dd>{{ cycle.newAssociatesThisCycle }}</dd>
              </div>
            </dl>
          </ng-container>
          <ng-template #noCycle>
            <p class="admin-stats__empty">{{ 'settings.adminStats.noCycleEmptyState' | translate }}</p>
          </ng-template>
        </section>
      </ng-container>
    </div>
  `
})
export class AdminStatsComponent implements OnInit {
  private adminStatsService = inject(AdminStatsService);

  stats: AdminStatsResponse | null = null;

  ngOnInit(): void {
    this.adminStatsService.getStats().subscribe(res => (this.stats = res));
  }
}
