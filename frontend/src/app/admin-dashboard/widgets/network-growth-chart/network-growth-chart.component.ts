import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { NetworkGrowthPoint } from '../../admin-dashboard.model';

// Org-wide sibling of the associate dashboard's own NetworkGrowthChartComponent (same
// inline-SVG bar-chart technique) -- keyed on associateCount instead of downlineCount, so it
// takes admin-dashboard.model.ts's own NetworkGrowthPoint rather than the associate side's.
@Component({
  selector: 'app-admin-network-growth-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="admin-network-growth-chart">
      <div class="admin-network-growth-chart__header">
        <span class="admin-network-growth-chart__rule"></span>
        <span class="admin-network-growth-chart__label">{{ 'adminDashboard.networkGrowthEyebrow' | translate }}</span>
        <span class="admin-network-growth-chart__rule"></span>
      </div>
      <svg class="admin-network-growth-chart__bars" *ngIf="data.length" viewBox="0 0 100 40" preserveAspectRatio="none">
        <rect
          *ngFor="let point of data; let i = index"
          [attr.x]="barX(i)"
          [attr.y]="barY(point.associateCount)"
          [attr.width]="barWidth"
          [attr.height]="barHeight(point.associateCount)"
        ></rect>
      </svg>
      <div class="admin-network-growth-chart__axis" *ngIf="data.length">
        <span *ngFor="let point of data">{{ point.cycleLabel }}</span>
      </div>
    </div>
  `
})
export class AdminNetworkGrowthChartComponent {
  @Input({ required: true }) data: NetworkGrowthPoint[] = [];

  private get maxCount(): number {
    return Math.max(...this.data.map(p => p.associateCount), 1);
  }

  get barWidth(): number {
    return this.data.length ? 100 / this.data.length - 2 : 0;
  }

  barX(index: number): number {
    return index * (100 / this.data.length);
  }

  barHeight(count: number): number {
    return Math.round((count / this.maxCount) * 40);
  }

  barY(count: number): number {
    return 40 - this.barHeight(count);
  }
}
