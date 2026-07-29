import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TeamSnapshot } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-team-snapshot',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="team-snapshot">
      <div class="total-downline">{{ data.totalDownline }}</div>
      <div class="active-today">{{ data.activeToday }}</div>
      <div class="new-joins">{{ data.newJoinsThisCycle }}</div>
    </div>
  `
})
export class TeamSnapshotComponent {
  @Input({ required: true }) data!: TeamSnapshot;
}
