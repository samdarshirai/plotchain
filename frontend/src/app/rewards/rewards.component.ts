import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { RewardsService } from './rewards.service';
import { AssociateRankProgress } from './models/associate-rank-progress.model';
import { EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { StatTileComponent } from '../shared/components/stat-tile/stat-tile.component';

@Component({
  selector: 'app-rewards',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent, StatTileComponent],
  template: `
    <div class="rewards card" *ngIf="progress as p">
      <h1 class="card-title">{{ 'rewards.title' | translate }}</h1>
      <p class="rewards__subtitle">{{ 'rewards.subtitle' | translate }}</p>

      <div class="rank-progress">
        <div class="current-rank">{{ p.currentRank }}</div>
        <div class="progress-bar"><div class="progress-fill" [style.width.%]="p.progressPercent"></div></div>
        <div class="next-rank" *ngIf="p.nextRank">
          {{ 'rewards.nextRank' | translate }}: {{ p.nextRank }} ({{ p.progressPercent }}%)
        </div>
        <div class="next-rank" *ngIf="!p.nextRank">{{ 'rewards.maxRankReached' | translate }}</div>
      </div>

      <div class="rewards__stats">
        <app-stat-tile [label]="'rewards.cumulativeVolumeLabel' | translate" [value]="p.cumulativeMatchedVolume + ''"></app-stat-tile>
        <app-stat-tile [label]="'rewards.volumeToNextRankLabel' | translate" [value]="p.volumeToNextRank + ''"></app-stat-tile>
      </div>

      <h2 class="rewards__tiers-title">{{ 'rewards.tiersTitle' | translate }}</h2>
      <app-editable-table
        [readOnly]="true"
        [columns]="tierColumns"
        [rows]="tierRows"
        [emptyStateLabel]="'rewards.tiersEmptyState' | translate"
      ></app-editable-table>
    </div>
    <div class="rewards__load-error" *ngIf="error">{{ 'rewards.loadError' | translate }}</div>
  `
})
export class RewardsComponent implements OnInit {
  private rewardsService = inject(RewardsService);
  private translate = inject(TranslateService);

  progress: AssociateRankProgress | null = null;
  error = false;
  tierColumns: EditableTableColumn[] = [];
  tierRows: Record<string, string | number>[] = [];

  ngOnInit(): void {
    this.tierColumns = [
      { key: 'tierLevel', label: this.translate.instant('rewards.columnTierLevel'), type: 'text' },
      { key: 'volumeThreshold', label: this.translate.instant('rewards.columnVolumeThreshold'), type: 'text' },
      { key: 'cashReward', label: this.translate.instant('rewards.columnCashReward'), type: 'text' },
      { key: 'perkDescription', label: this.translate.instant('rewards.columnPerkDescription'), type: 'text' },
      { key: 'achieved', label: this.translate.instant('rewards.columnAchieved'), type: 'text' }
    ];
    this.rewardsService.getMyRankProgress().subscribe({
      next: p => {
        this.progress = p;
        this.updateTierRows();
      },
      error: () => (this.error = true)
    });
  }

  private updateTierRows(): void {
    this.tierRows = (this.progress?.rewardTiers ?? []).map(t => ({
      tierLevel: t.tierLevel,
      volumeThreshold: t.volumeThreshold,
      cashReward: t.cashReward,
      perkDescription: t.perkDescription,
      achieved: this.translate.instant(t.achieved ? 'rewards.achievedYes' : 'rewards.achievedNo')
    }));
  }
}
