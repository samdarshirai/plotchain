import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TeamSnapshot } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-team-snapshot',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="team-snapshot">
      <div class="total-downline">{{ data.totalDownline }}</div>
      <div class="active-today">{{ data.activeToday }}</div>
      <div class="new-joins">{{ data.newJoinsThisCycle }}</div>
      <div class="left-associates">{{ 'dashboard.leftLegAssociates' | translate }}: {{ data.leftAssociates }}</div>
      <div class="right-associates">{{ 'dashboard.rightLegAssociates' | translate }}: {{ data.rightAssociates }}</div>
    </div>
  `
})
export class TeamSnapshotComponent {
  @Input({ required: true }) data!: TeamSnapshot;
}
