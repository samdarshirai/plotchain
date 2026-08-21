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
import { ProjectsService } from '../setup/steps/projects/projects.service';
import { PaymentsKycService } from '../setup/steps/payments-kyc/payments-kyc.service';
import { SetupService } from '../setup/setup.service';
import { SECTION_PATHS } from './models/settings-section.model';

interface SettingsOverviewCard {
  key: string;
  icon: string;
  actionLabelKey: string;
  path: string;
}

interface ProjectsSummary {
  projectCount: number;
  plotCount: number;
}

interface PaymentsKycSummary {
  gatewayLabel: string;
  strictnessLabel: string;
}

// Material Symbols name per section, per the mockup's settingsCards data (Viraj_Acres_Settings.dc.html
// lines 647-651). Purely decorative -- carries no domain meaning, so it isn't translated.
const CARD_ICONS: Record<string, string> = {
  companyProfile: 'domain',
  branding: 'palette',
  compensation: 'payments',
  projects: 'apartment',
  paymentsKyc: 'account_balance'
};

@Component({
  selector: 'app-settings-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule, SidePanelComponent, BrandButtonComponent],
  template: `
    <div class="settings-overview__header">
      <div>
        <h1 class="settings-overview__title">{{ 'settings.overviewLabel' | translate }}</h1>
        <p class="settings-overview__subtitle">{{ 'settings.overviewSubtitle' | translate }}</p>
      </div>
      <div class="settings-overview__progress-label">
        {{ 'settings.overviewProgressLabel' | translate: { done: doneCount, total: cards.length } }}
      </div>
    </div>

    <div class="settings-overview__progress-track">
      <div class="settings-overview__progress-fill" [style.width.%]="progressPercent"></div>
    </div>

    <div class="settings-overview__grid">
      <div class="settings-overview__card card" *ngFor="let card of cards; let i = index">
        <div>
          <div class="settings-overview__card-header">
            <div class="settings-overview__card-header-left">
              <span class="settings-overview__card-step">{{ i + 1 }}</span>
              <span class="material-symbols-outlined settings-overview__card-icon">{{ card.icon }}</span>
            </div>
            <span
              *ngIf="isCardDone(card.key)"
              class="material-symbols-outlined settings-overview__card-check"
              aria-hidden="true"
            >check_circle</span>
          </div>

          <h2 class="settings-overview__card-title">{{ 'settings.sections.' + card.key | translate }}</h2>

          <p class="settings-overview__card-subtitle" [ngSwitch]="card.key">
            <ng-container *ngSwitchCase="'companyProfile'">
              <ng-container *ngIf="companyProfileCurrent as profile">
                {{ 'settings.companyProfileCard.currentDisplayNameLabel' | translate: { displayName: profile.displayName } }}
              </ng-container>
            </ng-container>
            <ng-container *ngSwitchCase="'branding'">
              <ng-container *ngIf="brandingCurrent as branding">
                {{ 'settings.brandingCard.currentTaglineLabel' | translate: { tagline: branding.tagline } }}
              </ng-container>
            </ng-container>
            <ng-container *ngSwitchCase="'compensation'">
              <ng-container *ngIf="compensationCurrent as current">
                {{
                  'settings.compensationCard.currentVersionLabel'
                    | translate: { versionLabel: current.versionLabel, effectiveFrom: current.effectiveFrom }
                }}
              </ng-container>
            </ng-container>
            <ng-container *ngSwitchCase="'projects'">
              <ng-container *ngIf="projectsSummary as summary">
                {{
                  'settings.projectsCard.summaryLabel'
                    | translate: { projectCount: summary.projectCount, plotCount: summary.plotCount }
                }}
              </ng-container>
            </ng-container>
            <ng-container *ngSwitchCase="'paymentsKyc'">
              <ng-container *ngIf="paymentsKycSummary as summary">
                {{
                  'settings.paymentsKycCard.summaryLabel'
                    | translate: { gateway: summary.gatewayLabel, strictness: summary.strictnessLabel }
                }}
              </ng-container>
            </ng-container>
          </p>
        </div>

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

    <div class="settings-overview__banner" *ngIf="allDone">
      <div>
        <div class="settings-overview__banner-title">{{ 'settings.completionBanner.title' | translate }}</div>
        <div class="settings-overview__banner-description">{{ 'settings.completionBanner.description' | translate }}</div>
      </div>
      <a class="settings-overview__banner-cta" [routerLink]="['/settings', 'associate-directory']">
        {{ 'settings.completionBanner.cta' | translate }}
      </a>
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
  private projectsService = inject(ProjectsService);
  private paymentsKycService = inject(PaymentsKycService);
  private setupService = inject(SetupService);

  // Built from SECTION_PATHS's keys, per the plan's key-naming convention
  // ('settings.cards.<key>.actionLabel'), so a new section only needs an entry there.
  readonly cards: SettingsOverviewCard[] = Object.keys(SECTION_PATHS).map(key => ({
    key,
    icon: CARD_ICONS[key],
    actionLabelKey: 'settings.cards.' + key + '.actionLabel',
    path: SECTION_PATHS[key]
  }));

  compensationCurrent: CompensationPlanResponse | null = null;
  compensationHistory: CompensationPlanSummary[] = [];
  companyProfileCurrent: CompanyProfileResponse | null = null;
  brandingCurrent: CompanyBrandingResponse | null = null;
  projectsSummary: ProjectsSummary | null = null;
  paymentsKycSummary: PaymentsKycSummary | null = null;
  historyPanelOpen = false;

  // Keyed by SECTION_PATHS's step key, sourced from the same /api/company/setup-state completion
  // flags that already gate the onboarding wizard (SetupStateService.isStepComplete on the
  // backend) -- not a locally-invented "has data" heuristic, so it stays correct even for a step
  // whose backing record can legitimately be empty (e.g. Projects with 0 projects is NOT
  // "complete" per ProjectService.isComplete(), matching this map).
  private stepComplete: Record<string, boolean> = {};

  private paymentsGateway: string | null = null;
  private kycStrictness: string | null = null;

  get doneCount(): number {
    return this.cards.filter(card => this.stepComplete[card.key]).length;
  }

  get progressPercent(): number {
    return (this.doneCount / this.cards.length) * 100;
  }

  get allDone(): boolean {
    return this.doneCount === this.cards.length;
  }

  isCardDone(key: string): boolean {
    return this.stepComplete[key] === true;
  }

  ngOnInit(): void {
    this.setupService.getState().subscribe(state => {
      this.stepComplete = Object.fromEntries(state.steps.map(step => [step.key, step.complete]));
    });
    this.compensationPlanService.getCurrent().subscribe(current => {
      this.compensationCurrent = current;
    });
    this.companyProfileService.getProfile().subscribe(profile => {
      this.companyProfileCurrent = profile;
    });
    this.brandingService.getBranding().subscribe(branding => {
      this.brandingCurrent = branding;
    });
    this.projectsService.listProjects().subscribe(projects => {
      this.projectsSummary = {
        projectCount: projects.length,
        plotCount: projects.reduce((sum, project) => sum + project.totalPlots, 0)
      };
    });
    this.paymentsKycService.getPaymentConfig().subscribe(config => {
      this.paymentsGateway = config.gateway;
      this.tryBuildPaymentsKycSummary();
    });
    this.paymentsKycService.getKycConfig().subscribe(config => {
      this.kycStrictness = config.strictness;
      this.tryBuildPaymentsKycSummary();
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

  // Both halves of the Payments & KYC card summary come from separate endpoints (payment gateway,
  // KYC strictness) -- only render the combined subtitle once both have resolved.
  private tryBuildPaymentsKycSummary(): void {
    if (!this.paymentsGateway || !this.kycStrictness) {
      return;
    }
    this.paymentsKycSummary = {
      gatewayLabel: capitalize(this.paymentsGateway),
      strictnessLabel: capitalize(this.kycStrictness)
    };
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0) + value.slice(1).toLowerCase();
}
