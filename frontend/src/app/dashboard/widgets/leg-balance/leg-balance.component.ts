import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LegVolumeSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-leg-balance',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="leg-balance">
      <div class="leg-balance__header">
        <span class="leg-balance__label">{{ 'dashboard.legBalanceEyebrow' | translate }}</span>
        <span class="leg-balance__rule"></span>
        <span class="leg-balance__caption">{{ 'dashboard.legBalanceCaption' | translate }}</span>
      </div>
      <div class="leg-balance__figures">
        <div class="leg-balance__figure">
          <span class="leg-balance__figure-label">{{ 'dashboard.leftLegLabel' | translate }}</span>
          <span class="leg-balance__figure-value">{{ data.leftLegVolume | currency:'INR':'symbol':'1.0-0' }}</span>
        </div>
        <div class="leg-balance__divider"></div>
        <div class="leg-balance__figure">
          <span class="leg-balance__figure-label">{{ 'dashboard.rightLegLabel' | translate }}</span>
          <span class="leg-balance__figure-value">{{ data.rightLegVolume | currency:'INR':'symbol':'1.0-0' }}</span>
        </div>
      </div>
      <div class="leg-balance__bar">
        <span class="leg-balance__bar-fill leg-balance__bar-fill--left" [style.width.%]="leftPct"></span>
        <span class="leg-balance__bar-fill leg-balance__bar-fill--right" [style.width.%]="rightPct"></span>
      </div>
      <p class="leg-balance__empty" *ngIf="isEmpty">{{ 'dashboard.legBalanceEmpty' | translate }}</p>
    </div>
  `
})
export class LegBalanceComponent {
  @Input({ required: true }) data!: LegVolumeSummary;

  private get total(): number {
    return this.data.leftLegVolume + this.data.rightLegVolume;
  }

  get isEmpty(): boolean {
    return this.total === 0;
  }

  get leftPct(): number {
    return this.total === 0 ? 0 : Math.round((this.data.leftLegVolume / this.total) * 100);
  }

  get rightPct(): number {
    return this.total === 0 ? 0 : Math.round((this.data.rightLegVolume / this.total) * 100);
  }
}
