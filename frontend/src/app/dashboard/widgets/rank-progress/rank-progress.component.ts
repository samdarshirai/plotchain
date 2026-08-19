import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RankProgress } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-rank-progress',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="rank-progress card">
      <div class="current-rank">{{ data.currentRank }}</div>
      <div class="progress-bar"><div class="progress-fill" [style.width.%]="data.progressPercent"></div></div>
      <div class="next-rank" *ngIf="data.nextRank">
        {{ 'dashboard.nextRank' | translate }}: {{ data.nextRank }} ({{ data.progressPercent }}%)
      </div>
    </div>
  `
})
export class RankProgressComponent {
  @Input({ required: true }) data!: RankProgress;
}
