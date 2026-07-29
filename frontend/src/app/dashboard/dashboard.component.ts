import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { DashboardService } from './dashboard.service';
import { DashboardResponse } from './models/dashboard-response.model';
import { KycBannerComponent } from './widgets/kyc-banner/kyc-banner.component';
import { CycleIncomeCardComponent } from './widgets/cycle-income-card/cycle-income-card.component';
import { WalletCardComponent } from './widgets/wallet-card/wallet-card.component';
import { LegVolumeGaugeComponent } from './widgets/leg-volume-gauge/leg-volume-gauge.component';
import { RankProgressComponent } from './widgets/rank-progress/rank-progress.component';
import { TeamSnapshotComponent } from './widgets/team-snapshot/team-snapshot.component';
import { QuickActionsComponent } from './widgets/quick-actions/quick-actions.component';
import { CycleCountdownComponent } from './widgets/cycle-countdown/cycle-countdown.component';
import { AnnouncementsStripComponent } from './widgets/announcements-strip/announcements-strip.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, TranslateModule, KycBannerComponent, CycleIncomeCardComponent, WalletCardComponent,
    LegVolumeGaugeComponent, RankProgressComponent, TeamSnapshotComponent,
    QuickActionsComponent, CycleCountdownComponent, AnnouncementsStripComponent
  ],
  template: `
    <div class="dashboard" *ngIf="dashboard as d">
      <app-kyc-banner [visible]="d.kycPendingBannerVisible"></app-kyc-banner>
      <app-cycle-income-card [data]="d.cycleIncome"></app-cycle-income-card>
      <app-wallet-card [balance]="d.wallet.balance"></app-wallet-card>
      <app-leg-volume-gauge [data]="d.legVolume"></app-leg-volume-gauge>
      <app-rank-progress [data]="d.rankProgress"></app-rank-progress>
      <app-team-snapshot [data]="d.teamSnapshot"></app-team-snapshot>
      <app-quick-actions></app-quick-actions>
      <app-cycle-countdown [data]="d.cycleCountdown"></app-cycle-countdown>
      <app-announcements-strip [announcements]="d.announcements"></app-announcements-strip>
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
