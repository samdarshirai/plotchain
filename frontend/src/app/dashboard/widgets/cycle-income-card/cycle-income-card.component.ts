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
    <a class="cycle-income-card" [routerLink]="['/income-statement']" [queryParams]="{ cycleId: data.cycleId }">
      <div class="direct">{{ 'dashboard.direct' | translate }}: {{ data.directIncome | currency:'INR' }}</div>
      <div class="matching">{{ 'dashboard.matching' | translate }}: {{ data.matchingIncome | currency:'INR' }}</div>
      <div class="sponsor-matching">{{ 'dashboard.sponsorMatching' | translate }}: {{ data.sponsorMatchingIncome | currency:'INR' }}</div>
      <div class="self-performance">{{ 'dashboard.selfPerformance' | translate }}: {{ data.selfPerformanceBonus | currency:'INR' }}</div>
      <div class="total">{{ 'dashboard.total' | translate }}: {{ data.totalIncome | currency:'INR' }}</div>
    </a>
  `
})
export class CycleIncomeCardComponent {
  @Input({ required: true }) data!: CycleIncome;
}
