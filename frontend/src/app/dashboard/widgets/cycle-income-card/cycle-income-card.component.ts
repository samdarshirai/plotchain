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
    <div class="cycle-income-card seal-card">
      <div class="seal-card__hairline seal-card__hairline--top"></div>
      <div class="seal-card__body seal-card__split">
        <div class="seal-card__left">
          <div class="seal-card__header">
            <span class="seal-card__header-rule"></span>
            <span class="seal-card__header-label">{{ 'dashboard.cycleIncomeEyebrow' | translate }}</span>
          </div>
          <h2 class="total seal-card__figure">{{ data.totalIncome | currency:'INR' }}</h2>
          <p class="seal-card__delta" [class.seal-card__delta--down]="delta < 0">
            {{ (delta >= 0 ? 'dashboard.deltaUp' : 'dashboard.deltaDown') | translate: { amount: (deltaAbs | currency:'INR':'symbol':'1.0-0') } }}
          </p>
          <a class="seal-card__link" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">{{ 'dashboard.viewIncomeStatement' | translate }}</a>
        </div>
        <div class="seal-card__breakdown">
          <div class="seal-card__breakdown-header">
            <span class="seal-card__header-label">{{ 'dashboard.breakdownEyebrow' | translate }}</span>
            <span class="seal-card__breakdown-hint">{{ 'dashboard.componentsAtZero' | translate: { count: zeroCount, total: 5 } }}</span>
          </div>
          <div class="seal-card__breakdown-row">
            <div class="direct seal-card__breakdown-line">
              <span>{{ 'dashboard.direct' | translate }}</span>
              <span>{{ data.directIncome | currency:'INR' }}</span>
            </div>
            <div class="seal-card__breakdown-bar"><span [style.width.%]="barPct(data.directIncome)"></span></div>
          </div>
          <div class="seal-card__breakdown-row">
            <div class="matching seal-card__breakdown-line">
              <span>{{ 'dashboard.matching' | translate }}</span>
              <span>{{ data.matchingIncome | currency:'INR' }}</span>
            </div>
            <div class="seal-card__breakdown-bar"><span [style.width.%]="barPct(data.matchingIncome)"></span></div>
          </div>
          <div class="seal-card__breakdown-row">
            <div class="sponsor-matching seal-card__breakdown-line">
              <span>{{ 'dashboard.sponsorMatching' | translate }}</span>
              <span>{{ data.sponsorMatchingIncome | currency:'INR' }}</span>
            </div>
            <div class="seal-card__breakdown-bar"><span [style.width.%]="barPct(data.sponsorMatchingIncome)"></span></div>
          </div>
          <div class="seal-card__breakdown-row">
            <div class="self-performance seal-card__breakdown-line">
              <span>{{ 'dashboard.selfPerformance' | translate }}</span>
              <span>{{ data.selfPerformanceBonus | currency:'INR' }}</span>
            </div>
            <div class="seal-card__breakdown-bar"><span [style.width.%]="barPct(data.selfPerformanceBonus)"></span></div>
          </div>
          <div class="seal-card__breakdown-row">
            <div class="royalty seal-card__breakdown-line">
              <span>{{ 'dashboard.royalty' | translate }} ({{ data.royaltyBonusPct }}%)</span>
              <span>{{ data.royaltyBonus | currency:'INR' }}</span>
            </div>
            <div class="seal-card__breakdown-bar"><span [style.width.%]="barPct(data.royaltyBonus)"></span></div>
          </div>
        </div>
      </div>
      <div class="seal-card__hairline seal-card__hairline--bottom"></div>
    </div>
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

  private get components(): number[] {
    return [
      this.data.directIncome, this.data.matchingIncome, this.data.sponsorMatchingIncome,
      this.data.selfPerformanceBonus, this.data.royaltyBonus
    ];
  }

  get zeroCount(): number {
    return this.components.filter(value => value === 0).length;
  }

  barPct(value: number): number {
    const max = Math.max(...this.components);
    return max === 0 ? 0 : Math.round((value / max) * 100);
  }
}
