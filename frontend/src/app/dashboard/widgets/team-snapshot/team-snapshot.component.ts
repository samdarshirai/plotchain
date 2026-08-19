import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { TeamSnapshot } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-team-snapshot',
  standalone: true,
  imports: [CommonModule, TranslateModule, StatTileComponent],
  template: `
    <div class="team-snapshot card">
      <app-stat-tile class="total-downline" [label]="'dashboard.totalDownlineLabel' | translate" [value]="data.totalDownline.toString()"></app-stat-tile>
      <app-stat-tile class="active-today" [label]="'dashboard.activeTodayLabel' | translate" [value]="data.activeToday.toString()"></app-stat-tile>
      <app-stat-tile class="new-joins" [label]="'dashboard.newJoinsLabel' | translate" [value]="data.newJoinsThisCycle.toString()"></app-stat-tile>
      <app-stat-tile class="left-associates" [label]="'dashboard.leftLegAssociates' | translate" [value]="data.leftAssociates.toString()"></app-stat-tile>
      <app-stat-tile class="right-associates" [label]="'dashboard.rightLegAssociates' | translate" [value]="data.rightAssociates.toString()"></app-stat-tile>
    </div>
  `
})
export class TeamSnapshotComponent {
  @Input({ required: true }) data!: TeamSnapshot;
}
