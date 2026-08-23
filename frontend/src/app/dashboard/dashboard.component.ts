import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';
import { AssociateIdentityHeaderComponent } from './widgets/associate-identity-header/associate-identity-header.component';
import { KycBannerComponent } from './widgets/kyc-banner/kyc-banner.component';
import { CycleIncomeCardComponent } from './widgets/cycle-income-card/cycle-income-card.component';
import { WalletCardComponent } from './widgets/wallet-card/wallet-card.component';
import { QuickActionsComponent } from './widgets/quick-actions/quick-actions.component';
import { CycleCountdownComponent } from './widgets/cycle-countdown/cycle-countdown.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, TranslateModule, AssociateIdentityHeaderComponent, KycBannerComponent, CycleIncomeCardComponent, WalletCardComponent,
    QuickActionsComponent, CycleCountdownComponent
  ],
  template: `
    <div class="dashboard" *ngIf="dashboard as d">
      <app-associate-identity-header [data]="d.associate"></app-associate-identity-header>
      <app-kyc-banner [visible]="d.kycPendingBannerVisible"></app-kyc-banner>
      <app-cycle-income-card [data]="d.cycleIncome"></app-cycle-income-card>
      <app-wallet-card [balance]="d.wallet.balance"></app-wallet-card>
      <app-quick-actions></app-quick-actions>
      <app-cycle-countdown [data]="d.cycleCountdown"></app-cycle-countdown>
    </div>
    <div class="dashboard-error" *ngIf="error">{{ 'dashboard.loadError' | translate }}</div>
  `
})
export class DashboardComponent implements OnInit {
  dashboard: DashboardResponse | null = null;
  error: boolean = false;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.dashboardService.getDashboard().subscribe({
      next: d => this.dashboard = d,
      error: () => this.error = true
    });
  }
}
