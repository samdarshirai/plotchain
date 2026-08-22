import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AdminDashboardService } from '../../admin-dashboard/admin-dashboard.service';
import { AdminStatsResponse } from '../../admin-dashboard/admin-dashboard.model';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';

// Settings > System > Admin Stats (mockup's `isAdminStats` block, `Viraj Acres Settings.dc.html`):
// a narrower, always-reachable-from-the-nav companion to admin-dashboard/'s post-login landing
// page. Same GET /api/admin/stats endpoint and AdminStatsResponse shape -- the fields this screen
// needs (activePlots, totalSalesRecorded, cyclesCompleted) are all-time/global, unlike
// admin-dashboard's cycle-scoped tiles, so they don't overlap with what the dashboard shows.
@Component({
  selector: 'app-admin-stats',
  standalone: true,
  imports: [CommonModule, TranslateModule, StatTileComponent],
  template: `
    <div class="admin-stats">
      <h1 class="card-title">{{ 'settings.sections.adminStats' | translate }}</h1>

      <p *ngIf="loadError" class="admin-stats__load-error">{{ 'settings.adminStats.loadError' | translate }}</p>

      <div class="admin-stats__tiles" *ngIf="stats as s">
        <app-stat-tile
          icon="group"
          layout="vertical"
          [label]="'settings.adminStats.totalAssociatesLabel' | translate"
          [value]="s.totalAssociates.toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="apartment"
          layout="vertical"
          [label]="'settings.adminStats.activePlotsLabel' | translate"
          [value]="s.activePlots.toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="point_of_sale"
          layout="vertical"
          [label]="'settings.adminStats.salesRecordedLabel' | translate"
          [value]="s.totalSalesRecorded.toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="shield"
          layout="vertical"
          [label]="'settings.adminStats.pendingKycLabel' | translate"
          [value]="s.kycBreakdown.pending.toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="payments"
          layout="vertical"
          [label]="'settings.adminStats.pendingPayoutsLabel' | translate"
          [value]="s.pendingWithdrawals.toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="sync"
          layout="vertical"
          [label]="'settings.adminStats.cyclesCompletedLabel' | translate"
          [value]="s.cyclesCompleted.toString()"
        ></app-stat-tile>
      </div>
    </div>
  `
})
export class AdminStatsComponent implements OnInit {
  private adminDashboardService = inject(AdminDashboardService);

  stats: AdminStatsResponse | null = null;
  loadError = false;

  ngOnInit(): void {
    this.loadStats();
  }

  private loadStats(): void {
    this.loadError = false;
    this.adminDashboardService.getStats().subscribe({
      next: res => (this.stats = res),
      error: () => (this.loadError = true)
    });
  }
}
