import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { NetworkGrowthPoint } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-network-growth-chart',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="network-growth-chart">
      <div class="network-growth-chart__header">
        <span class="network-growth-chart__rule"></span>
        <span class="network-growth-chart__label">{{ 'dashboard.networkGrowthEyebrow' | translate }}</span>
        <span class="network-growth-chart__rule"></span>
      </div>
      <svg class="network-growth-chart__bars" *ngIf="data.length" viewBox="0 0 100 40" preserveAspectRatio="none">
        <rect
          *ngFor="let point of data; let i = index"
          [attr.x]="barX(i)"
          [attr.y]="barY(point.downlineCount)"
          [attr.width]="barWidth"
          [attr.height]="barHeight(point.downlineCount)"
        ></rect>
      </svg>
      <div class="network-growth-chart__axis" *ngIf="data.length">
        <span *ngFor="let point of data">{{ point.cycleLabel }}</span>
      </div>
    </div>
  `
})
export class NetworkGrowthChartComponent {
  @Input({ required: true }) data: NetworkGrowthPoint[] = [];

  private get maxCount(): number {
    return Math.max(...this.data.map(p => p.downlineCount), 1);
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
