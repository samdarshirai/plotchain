import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminStatsResponse } from './admin-dashboard.model';
import { SealCardComponent } from '../shared/components/seal-card/seal-card.component';

// Post-login landing page for admin-family roles (mockup's `isDashboard` block,
// Viraj_Acres_Settings.dc.html lines 49-59): a heading, a subtitle, and one Seal Card showing this
// cycle's total income. Everything else the console used to show (associate/wallet/sales/revenue
// tiles, the full Current-Cycle breakdown, KYC breakdown, pending withdrawals, Quick Actions) has
// moved to cycle-management.component.ts, payout-approval.component.ts, and kyc-queue.component.ts
// respectively -- see this task's plan for why each landed where it did.
@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, TranslateModule, SealCardComponent],
  providers: [CurrencyPipe],
  template: `
    <div class="admin-dashboard">
      <h1 class="admin-dashboard__title">{{ 'adminDashboard.heading' | translate }}</h1>
      <p class="admin-dashboard__subtitle">{{ 'adminDashboard.subtitle' | translate }}</p>

      <p *ngIf="loadError" class="admin-dashboard__load-error">{{ 'adminDashboard.loadError' | translate }}</p>

      <ng-container *ngIf="stats as s">
        <app-seal-card
          *ngIf="s.currentCycle as cycle; else noCycle"
          [label]="'adminDashboard.currentCycleLabel' | translate"
          [value]="formatCurrency(cycle.totalIncome)"
          [caption]="'adminDashboard.currentCycleCaption' | translate: { count: s.totalAssociates }"
        ></app-seal-card>
        <ng-template #noCycle>
          <p class="admin-dashboard__empty">{{ 'adminDashboard.noCycleEmptyState' | translate }}</p>
        </ng-template>
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
