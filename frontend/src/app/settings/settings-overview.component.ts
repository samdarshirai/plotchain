import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { SidePanelComponent } from '../shared/components/side-panel/side-panel.component';
import { BrandButtonComponent } from '../shared/components/brand-button/brand-button.component';
import { CompensationPlanService } from '../setup/steps/compensation/compensation-plan.service';
import { CompensationPlanResponse, CompensationPlanSummary } from '../setup/models/compensation-plan.model';
import { CompanyProfileService } from '../setup/steps/company-profile/company-profile.service';
import { CompanyProfileResponse } from '../setup/models/company-profile.model';
import { BrandingService } from '../setup/steps/branding/branding.service';
import { CompanyBrandingResponse } from '../setup/models/branding.model';
import { SECTION_PATHS } from './models/settings-section.model';

interface SettingsOverviewCard {
  key: string;
  actionLabelKey: string;
  path: string;
}

@Component({
  selector: 'app-settings-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, SidePanelComponent, BrandButtonComponent],
  template: `
    <h1 class="card-title">{{ 'settings.overviewLabel' | translate }}</h1>

    <div class="settings-overview">
      <div class="settings-overview__card card" *ngFor="let card of cards">
        <h2 class="settings-overview__card-title">{{ 'settings.sections.' + card.key | translate }}</h2>

        <p
          class="settings-overview__card-summary"
          *ngIf="card.key === 'compensation' && compensationCurrent as current"
        >
          {{
            'settings.compensationCard.currentVersionLabel'
              | translate: { versionLabel: current.versionLabel, effectiveFrom: current.effectiveFrom }
          }}
        </p>
        <p
          class="settings-overview__card-summary"
          *ngIf="card.key === 'companyProfile' && companyProfileCurrent as profile"
        >
          {{ 'settings.companyProfileCard.currentDisplayNameLabel' | translate: { displayName: profile.displayName } }}
        </p>
        <p
          class="settings-overview__card-summary"
          *ngIf="card.key === 'branding' && brandingCurrent as branding"
        >
          {{ 'settings.brandingCard.currentTaglineLabel' | translate: { tagline: branding.tagline } }}
        </p>

        <div class="settings-overview__card-actions">
          <a
            class="settings-overview__card-action brand-button brand-button--secondary"
            [routerLink]="['/settings', card.path]"
          >
            {{ card.actionLabelKey | translate }}
          </a>
          <app-brand-button *ngIf="card.key === 'compensation'" variant="ghost" type="button" (clicked)="openHistory()">
            {{ 'settings.compensationCard.viewHistoryLabel' | translate }}
          </app-brand-button>
        </div>
      </div>
    </div>

    <app-side-panel
      [open]="historyPanelOpen"
      [title]="'settings.compensationCard.historyPanelTitle' | translate"
      (closed)="closeHistory()"
    >
      <ul class="settings-overview__history-list">
        <li class="settings-overview__history-row" *ngFor="let entry of compensationHistory">
          <span class="settings-overview__history-version">{{ entry.versionLabel }}</span>
          <span class="settings-overview__history-effective">{{ entry.effectiveFrom }}</span>
        </li>
      </ul>
    </app-side-panel>
  `
})
export class SettingsOverviewComponent implements OnInit {
  private compensationPlanService = inject(CompensationPlanService);
  private companyProfileService = inject(CompanyProfileService);
  private brandingService = inject(BrandingService);

  // Built from SECTION_PATHS's keys, per the plan's key-naming convention
  // ('settings.cards.<key>.actionLabel'), so a new section only needs an entry there.
  readonly cards: SettingsOverviewCard[] = Object.keys(SECTION_PATHS).map(key => ({
    key,
    actionLabelKey: 'settings.cards.' + key + '.actionLabel',
    path: SECTION_PATHS[key]
  }));

  compensationCurrent: CompensationPlanResponse | null = null;
  compensationHistory: CompensationPlanSummary[] = [];
  companyProfileCurrent: CompanyProfileResponse | null = null;
  brandingCurrent: CompanyBrandingResponse | null = null;
  historyPanelOpen = false;

  ngOnInit(): void {
    this.compensationPlanService.getCurrent().subscribe(current => {
      this.compensationCurrent = current;
    });
    this.companyProfileService.getProfile().subscribe(profile => {
      this.companyProfileCurrent = profile;
    });
    this.brandingService.getBranding().subscribe(branding => {
      this.brandingCurrent = branding;
    });
  }

  openHistory(): void {
    this.compensationPlanService.getHistory().subscribe(history => {
      this.compensationHistory = history;
      this.historyPanelOpen = true;
    });
  }

  closeHistory(): void {
    this.historyPanelOpen = false;
  }
}
