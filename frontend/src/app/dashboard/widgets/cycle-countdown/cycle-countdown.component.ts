import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { CycleCountdown } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-cycle-countdown',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `<div class="cycle-countdown">{{ 'dashboard.cycleCloses' | translate: { days: data.daysRemaining } }}</div>`
})
export class CycleCountdownComponent {
  @Input({ required: true }) data!: CycleCountdown;
}
