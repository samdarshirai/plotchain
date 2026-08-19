import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { StatTileComponent } from '../../../shared/components/stat-tile/stat-tile.component';
import { LegVolumeSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-leg-volume-gauge',
  standalone: true,
  imports: [CommonModule, TranslateModule, StatTileComponent],
  template: `
    <div class="leg-volume-gauge-card">
      <div class="leg-volume-gauge">
        <div class="leg left" [style.flex]="data.leftVolume || 1">{{ 'dashboard.leftLeg' | translate }}: {{ data.leftVolume | currency:'INR' }}</div>
        <div class="leg right" [style.flex]="data.rightVolume || 1">{{ 'dashboard.rightLeg' | translate }}: {{ data.rightVolume | currency:'INR' }}</div>
        <div class="projected-match">{{ 'dashboard.projectedMatch' | translate }}: {{ data.projectedMatchAmount | currency:'INR' }}</div>
      </div>
      <div class="leg-volume-gauge__tiles">
        <app-stat-tile class="leg-carried-forward left" [label]="('dashboard.carriedForward' | translate) + ' (' + ('dashboard.leftLeg' | translate) + ')'" [value]="(data.carriedForwardLeft | currency:'INR') ?? ''"></app-stat-tile>
        <app-stat-tile class="leg-carried-forward right" [label]="('dashboard.carriedForward' | translate) + ' (' + ('dashboard.rightLeg' | translate) + ')'" [value]="(data.carriedForwardRight | currency:'INR') ?? ''"></app-stat-tile>
        <app-stat-tile class="leg-total-business left" [label]="('dashboard.totalBusiness' | translate) + ' (' + ('dashboard.leftLeg' | translate) + ')'" [value]="(data.totalLeftBusiness | currency:'INR') ?? ''"></app-stat-tile>
        <app-stat-tile class="leg-total-business right" [label]="('dashboard.totalBusiness' | translate) + ' (' + ('dashboard.rightLeg' | translate) + ')'" [value]="(data.totalRightBusiness | currency:'INR') ?? ''"></app-stat-tile>
        <app-stat-tile class="new-booked-area" [label]="'dashboard.newBookedArea' | translate" [value]="(data.newBookedAreaSqft | number) + ' sqft'"></app-stat-tile>
      </div>
    </div>
  `
})
export class LegVolumeGaugeComponent {
  @Input({ required: true }) data!: LegVolumeSummary;
}
