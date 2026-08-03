import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsResponse } from './admin-stats.model';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';

@Component({
  selector: 'app-admin-stats',
  standalone: true,
  imports: [CommonModule, TranslateModule, StatTileComponent],
  template: `
    <div class="admin-stats card">
      <h1 class="card-title">{{ 'settings.sections.adminStats' | translate }}</h1>

      <p *ngIf="loadError" class="admin-stats__load-error">{{ 'settings.adminStats.loadError' | translate }}</p>

      <ng-container *ngIf="stats as s">
        <div class="admin-stats__tiles">
          <app-stat-tile
            [label]="'settings.adminStats.totalAssociatesLabel' | translate"
            [value]="s.totalAssociates.toString()"
          ></app-stat-tile>
          <app-stat-tile
            [label]="'settings.adminStats.walletBalanceLabel' | translate"
            [value]="s.totalWalletBalance.toString()"
          ></app-stat-tile>
        </div>

        <section class="admin-stats__kyc">
          <h2>{{ 'settings.adminStats.kycBreakdownTitle' | translate }}</h2>
          <div class="admin-stats__tiles">
            <app-stat-tile
              [label]="'settings.adminStats.kycPendingLabel' | translate"
              [value]="s.kycBreakdown.pending.toString()"
            ></app-stat-tile>
            <app-stat-tile
              [label]="'settings.adminStats.kycVerifiedLabel' | translate"
              [value]="s.kycBreakdown.verified.toString()"
            ></app-stat-tile>
            <app-stat-tile
              [label]="'settings.adminStats.kycRejectedLabel' | translate"
              [value]="s.kycBreakdown.rejected.toString()"
            ></app-stat-tile>
          </div>
        </section>

        <section class="admin-stats__cycle">
          <h2>{{ 'settings.adminStats.currentCycleTitle' | translate }}</h2>
          <ng-container *ngIf="s.currentCycle as cycle; else noCycle">
            <div class="admin-stats__tiles">
              <app-stat-tile
                [label]="'settings.adminStats.periodLabel' | translate"
                [value]="cycle.periodStart + ' – ' + cycle.periodEnd"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'settings.adminStats.daysRemainingLabel' | translate"
                [value]="cycle.daysRemaining.toString()"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'settings.adminStats.directIncomeLabel' | translate"
                [value]="cycle.directIncome.toString()"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'settings.adminStats.matchingIncomeLabel' | translate"
                [value]="cycle.matchingIncome.toString()"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'settings.adminStats.totalIncomeLabel' | translate"
                [value]="cycle.totalIncome.toString()"
              ></app-stat-tile>
              <app-stat-tile
                [label]="'settings.adminStats.newAssociatesLabel' | translate"
                [value]="cycle.newAssociatesThisCycle.toString()"
              ></app-stat-tile>
            </div>
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
  loadError = false;

  ngOnInit(): void {
    this.loadStats();
  }

  private loadStats(): void {
    this.loadError = false;
    this.adminStatsService.getStats().subscribe({
      next: res => (this.stats = res),
      error: () => (this.loadError = true)
    });
  }
}
