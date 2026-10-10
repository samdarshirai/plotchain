import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { CycleIncome, LegVolumeSummary, NetworkSummary } from '../../models/dashboard-response.model';

// Business-at-a-glance hero card. Selector/class names kept from when it was income-only; this
// cycle's earnings is now one strip inside it.
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
            <span class="seal-card__header-label">{{ 'dashboard.businessSummaryEyebrow' | translate }}</span>
          </div>
          <h2 class="total seal-card__figure">{{ totalBusiness | currency:'INR':'symbol':'1.0-0' }}</h2>
          <p class="seal-card__caption">{{ 'dashboard.totalBusinessLabel' | translate }}</p>
          <div class="seal-card__chips">
            <span class="business-rank seal-card__chip">
              <span class="seal-card__chip-label">{{ 'dashboard.rankLabel' | translate }}</span>
              <strong>{{ rank }}</strong>
            </span>
            <a class="business-team seal-card__chip" [routerLink]="['/my-team']">
              <span class="seal-card__chip-label">{{ 'dashboard.teamSizeLabel' | translate }}</span>
              <strong>{{ network.totalDownline }}</strong>
              <span class="seal-card__chip-note">{{ 'dashboard.teamSplit' | translate: { left: network.leftAssociateCount, right: network.rightAssociateCount } }}</span>
            </a>
          </div>
        </div>
        <div class="seal-card__breakdown">
          <div class="seal-card__breakdown-header">
            <span class="seal-card__header-label">{{ 'dashboard.businessBreakdownEyebrow' | translate }}</span>
            <span class="seal-card__breakdown-hint">{{ 'dashboard.lifetimeVolume' | translate }}</span>
          </div>
          <div class="seal-card__breakdown-row">
            <div class="left-business seal-card__breakdown-line">
              <span>{{ 'dashboard.totalLeftBusinessLabel' | translate }}</span>
              <span>{{ legVolume.totalLeftBusiness | currency:'INR':'symbol':'1.0-0' }}</span>
            </div>
            <div class="seal-card__breakdown-bar"><span [style.width.%]="barPct(legVolume.totalLeftBusiness)"></span></div>
          </div>
          <div class="seal-card__breakdown-row">
            <div class="right-business seal-card__breakdown-line">
              <span>{{ 'dashboard.totalRightBusinessLabel' | translate }}</span>
              <span>{{ legVolume.totalRightBusiness | currency:'INR':'symbol':'1.0-0' }}</span>
            </div>
            <div class="seal-card__breakdown-bar"><span [style.width.%]="barPct(legVolume.totalRightBusiness)"></span></div>
          </div>
          <div class="seal-card__breakdown-row">
            <div class="self-business seal-card__breakdown-line">
              <span>{{ 'dashboard.totalSelfBusinessLabel' | translate }}</span>
              <span>{{ legVolume.totalSelfBusiness | currency:'INR':'symbol':'1.0-0' }}</span>
            </div>
            <div class="seal-card__breakdown-bar"><span [style.width.%]="barPct(legVolume.totalSelfBusiness)"></span></div>
          </div>
        </div>
      </div>
      <div class="business-earnings seal-card__earnings">
        <span class="seal-card__header-label">{{ 'dashboard.cycleIncomeEyebrow' | translate }}</span>
        <strong class="seal-card__earnings-figure">{{ data.totalIncome | currency:'INR' }}</strong>
        <span class="seal-card__delta" [class.seal-card__delta--down]="delta < 0">
          {{ (delta >= 0 ? 'dashboard.deltaUp' : 'dashboard.deltaDown') | translate: { amount: (deltaAbs | currency:'INR':'symbol':'1.0-0') } }}
        </span>
        <a class="seal-card__link" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">{{ 'dashboard.viewIncomeStatement' | translate }}</a>
      </div>
      <div class="seal-card__hairline seal-card__hairline--bottom"></div>
    </div>
  `
})
export class CycleIncomeCardComponent {
  @Input({ required: true }) data!: CycleIncome;
  @Input({ required: true }) legVolume!: LegVolumeSummary;
  @Input({ required: true }) network!: NetworkSummary;
  @Input({ required: true }) rank!: string;

  get delta(): number {
    return this.data.totalIncome - this.data.previousCycleTotalIncome;
  }

  get deltaAbs(): number {
    return Math.abs(this.delta);
  }

  private get volumes(): number[] {
    return [this.legVolume.totalLeftBusiness, this.legVolume.totalRightBusiness, this.legVolume.totalSelfBusiness];
  }

  get totalBusiness(): number {
    return this.volumes.reduce((sum, v) => sum + v, 0);
  }

  barPct(value: number): number {
    const max = Math.max(...this.volumes);
    return max === 0 ? 0 : Math.round((value / max) * 100);
  }
}
