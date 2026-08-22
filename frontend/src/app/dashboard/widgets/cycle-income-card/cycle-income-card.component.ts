import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { CycleIncome } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-cycle-income-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <a class="cycle-income-card seal-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="seal-card__hairline seal-card__hairline--top"></div>
      <div class="seal-card__body">
        <div class="seal-card__header">
          <span class="seal-card__header-rule"></span>
          <span class="seal-card__header-label">{{ 'dashboard.cycleIncomeEyebrow' | translate }}</span>
          <span class="seal-card__header-rule"></span>
        </div>
        <h2 class="total seal-card__figure">{{ data.totalIncome | currency:'INR' }}</h2>
        <p class="seal-card__legal">{{ 'dashboard.total' | translate }}</p>
        <p class="seal-card__delta" [class.seal-card__delta--down]="delta < 0">
          {{ (delta >= 0 ? 'dashboard.deltaUp' : 'dashboard.deltaDown') | translate: { amount: (deltaAbs | currency:'INR':'symbol':'1.0-0') } }}
        </p>
        <svg class="seal-card__trend" *ngIf="trendPoints" viewBox="0 0 100 28" preserveAspectRatio="none">
          <polyline [attr.points]="trendPoints"></polyline>
        </svg>
        <div class="seal-card__details">
          <p class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</p>
          <p class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</p>
          <p class="sponsor-matching">{{ 'dashboard.sponsorMatching' | translate }}: {{ data.sponsorMatchingIncome | currency:'INR' }}</p>
          <p class="self-performance">{{ 'dashboard.selfPerformance' | translate }}: {{ data.selfPerformanceBonus | currency:'INR' }}</p>
          <p class="royalty">{{ 'dashboard.royalty' | translate }} ({{ data.royaltyBonusPct }}%): {{ data.royaltyBonus | currency:'INR' }}</p>
        </div>
      </div>
      <div class="seal-card__hairline seal-card__hairline--bottom"></div>
    </a>
  `
})
export class CycleIncomeCardComponent {
  @Input({ required: true }) data!: CycleIncome;

  get delta(): number {
    return this.data.totalIncome - this.data.previousCycleTotalIncome;
  }

  get deltaAbs(): number {
    return Math.abs(this.delta);
  }

  get trendPoints(): string | null {
    const trend = this.data.incomeTrend;
    if (!trend || trend.length < 2) {
      return null;
    }
    const max = Math.max(...trend);
    const min = Math.min(...trend, 0);
    const range = max - min || 1;
    const stepX = 100 / (trend.length - 1);
    return trend
      .map((value, i) => `${(i * stepX).toFixed(1)},${(28 - ((value - min) / range) * 28).toFixed(1)}`)
      .join(' ');
  }
}
