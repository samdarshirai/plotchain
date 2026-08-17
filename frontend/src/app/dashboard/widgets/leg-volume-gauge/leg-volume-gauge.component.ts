import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LegVolumeSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-leg-volume-gauge',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="leg-volume-gauge">
      <div class="leg left" [style.flex]="data.leftVolume || 1">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftVolume | currency:'INR' }}</div>
      <div class="leg right" [style.flex]="data.rightVolume || 1">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightVolume | currency:'INR' }}</div>
      <div class="leg-carried-forward left">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.leftLeg' | translate }}): {{ data.carriedForwardLeft | currency:'INR' }}</div>
      <div class="leg-carried-forward right">{{ 'dashboard.carriedForward' | translate }} ({{ 'dashboard.rightLeg' | translate }}): {{ data.carriedForwardRight | currency:'INR' }}</div>
      <div class="projected-match">{{ 'dashboard.projectedMatch' | translate }}: {{ data.projectedMatchAmount | currency:'INR' }}</div>
    </div>
  `
})
export class LegVolumeGaugeComponent {
  @Input({ required: true }) data!: LegVolumeSummary;
}
