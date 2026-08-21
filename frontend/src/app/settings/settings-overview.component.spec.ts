import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsOverviewComponent } from './settings-overview.component';
import { SECTION_PATHS } from './models/settings-section.model';
import { CompensationPlanResponse, CompensationPlanSummary } from '../setup/models/compensation-plan.model';
import { CompanyProfileResponse } from '../setup/models/company-profile.model';
import { CompanyBrandingResponse } from '../setup/models/branding.model';
import { Project } from '../setup/models/project.model';
import { SetupStateResponse } from '../setup/models/setup-state.model';

describe('SettingsOverviewComponent', () => {
  let fixture: ComponentFixture<SettingsOverviewComponent>;
  let httpMock: HttpTestingController;

  const samplePlan: CompensationPlanResponse = {
    versionLabel: 'v3',
    effectiveFrom: '2026-04-01',
    directIncomePct: 10,
    matchingIncomePct: 5,
    sponsorMatchingPct: 2,
    tdsPct: 2,
    adminChargeWithPanPct: 5,
    adminChargeWithoutPanPct: 15,
    activationFee: 1100,
    minWithdrawal: 100,
    settlementCycle: 'SEMI_MONTHLY',
    royaltyBonusRates: [],
    rewardTiers: [],
    availableRanks: [],
    createdAt: '2026-04-01T00:00:00Z'
  };

  const sampleHistory: CompensationPlanSummary[] = [
    { versionLabel: 'v3', effectiveFrom: '2026-04-01', createdAt: '2026-04-01T00:00:00Z' },
    { versionLabel: 'v2', effectiveFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00Z' }
  ];

  const sampleProfile: CompanyProfileResponse = {
    displayName: 'Viraj Acres',
    legalName: 'Viraj Acres Pvt Ltd',
    registrationNumber: 'REG123',
    contactName: 'Jane Doe',
    contactPhone: '9999999999',
    contactEmail: 'jane@virajacres.test',
    registeredAddress: 'Pune, MH',
    updatedAt: '2026-04-01T00:00:00Z'
  };

  const sampleBranding: CompanyBrandingResponse = {
    primaryColor: '#C6A227',
    secondaryColor: '#0C0A0B',
    tagline: 'Land you can trust',
    hasSquareLogo: true,
    hasWideLogo: true,
    updatedAt: '2026-04-01T00:00:00Z'
  };

  const sampleProjects: Project[] = [
    { id: 'p1', name: 'Viraj Acres Phase 1', location: 'Pune', hasThumbnail: false, totalPlots: 30, availablePlots: 20, soldPlots: 10, createdAt: '2026-04-01T00:00:00Z' },
    { id: 'p2', name: 'Viraj Acres Phase 2', location: 'Pune', hasThumbnail: false, totalPlots: 18, availablePlots: 18, soldPlots: 0, createdAt: '2026-04-02T00:00:00Z' }
  ];

  const allCompleteSetupState: SetupStateResponse = {
    steps: [
      { number: 1, key: 'companyProfile', complete: true, required: true, percentComplete: 100 },
      { number: 2, key: 'branding', complete: true, required: false, percentComplete: 100 },
      { number: 3, key: 'compensation', complete: true, required: true, percentComplete: 100 },
      { number: 4, key: 'projects', complete: true, required: false, percentComplete: 100 },
      { number: 5, key: 'paymentsKyc', complete: true, required: true, percentComplete: 100 },
      { number: 6, key: 'reviewLaunch', complete: false, required: false, percentComplete: 0 }
    ],
    canGoLive: true,
    launchedAt: null
  };

  const partialSetupState: SetupStateResponse = {
    steps: [
      { number: 1, key: 'companyProfile', complete: true, required: true, percentComplete: 100 },
      { number: 2, key: 'branding', complete: false, required: false, percentComplete: 0 },
      { number: 3, key: 'compensation', complete: true, required: true, percentComplete: 100 },
      { number: 4, key: 'projects', complete: false, required: false, percentComplete: 0 },
      { number: 5, key: 'paymentsKyc', complete: false, required: true, percentComplete: 0 },
      { number: 6, key: 'reviewLaunch', complete: false, required: false, percentComplete: 0 }
    ],
    canGoLive: false,
    launchedAt: null
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsOverviewComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsOverviewComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Flushes every ngOnInit HTTP call except setup-state, which each test flushes itself with
  // whichever completion fixture (allCompleteSetupState/partialSetupState) it needs.
  function flushDataRequests(): void {
    httpMock.expectOne('/api/company/compensation').flush(samplePlan);
    httpMock.expectOne('/api/company/profile').flush(sampleProfile);
    httpMock.expectOne('/api/company/branding').flush(sampleBranding);
    httpMock.expectOne('/api/company/projects').flush(sampleProjects);
    httpMock.expectOne('/api/company/payments').flush({ gateway: 'RAZORPAY', credentialsConfigured: true, modesEnabled: ['UPI'], updatedAt: null });
    httpMock.expectOne('/api/company/kyc').flush({ strictness: 'RELAXED', requiredDocuments: ['AADHAAR'], updatedAt: null });
  }

  function flushSetupState(state: SetupStateResponse): void {
    httpMock.expectOne('/api/company/setup-state').flush(state);
  }

  it('rendersFiveCardsWithTheirTranslatedLabelsAndLinks', () => {
    fixture.detectChanges();
    flushSetupState(allCompleteSetupState);
    flushDataRequests();
    fixture.detectChanges();

    const sectionKeys = Object.keys(SECTION_PATHS);
    const cards = fixture.nativeElement.querySelectorAll('.settings-overview__card');
    expect(cards.length).toBe(sectionKeys.length);
    expect(cards.length).toBe(5);

    const titles: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-title');
    const links: NodeListOf<HTMLAnchorElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-action');
    expect(titles.length).toBe(5);
    expect(links.length).toBe(5);

    sectionKeys.forEach((key, index) => {
      // No translations are loaded in this suite, so ngx-translate falls back to the key path --
      // this both confirms the right key is requested and that each card wires up to the right link.
      expect(titles[index].textContent?.trim()).toBe('settings.sections.' + key);
      expect(links[index].textContent?.trim()).toBe('settings.cards.' + key + '.actionLabel');
      expect(links[index].getAttribute('href')).toBe('/settings/' + SECTION_PATHS[key]);
    });
  });

  it('rendersTheStepNumberAndIconOnEachCardHeader', () => {
    fixture.detectChanges();
    flushSetupState(allCompleteSetupState);
    flushDataRequests();
    fixture.detectChanges();

    const steps: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-step');
    const icons: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-icon');
    expect(Array.from(steps).map(el => el.textContent?.trim())).toEqual(['1', '2', '3', '4', '5']);
    expect(Array.from(icons).map(el => el.textContent?.trim())).toEqual([
      'domain',
      'palette',
      'payments',
      'apartment',
      'account_balance'
    ]);
  });

  it('showsACheckmarkOnlyOnCardsTheSetupStateMarksComplete', () => {
    fixture.detectChanges();
    flushSetupState(partialSetupState);
    flushDataRequests();
    fixture.detectChanges();

    const cards: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card');
    // partialSetupState: companyProfile and compensation complete, branding/projects/paymentsKyc not.
    const hasCheck = Array.from(cards).map(card => !!card.querySelector('.settings-overview__card-check'));
    expect(hasCheck).toEqual([true, false, true, false, false]);
  });

  it('computesTheDoneCountAndProgressBarWidthFromSetupState', () => {
    fixture.detectChanges();
    flushSetupState(partialSetupState);
    flushDataRequests();
    fixture.detectChanges();

    expect(fixture.componentInstance.doneCount).toBe(2);
    expect(fixture.componentInstance.progressPercent).toBe(40);

    const progressLabel: HTMLElement = fixture.nativeElement.querySelector('.settings-overview__progress-label');
    expect(progressLabel.textContent).toContain('settings.overviewProgressLabel');

    const fill: HTMLElement = fixture.nativeElement.querySelector('.settings-overview__progress-fill');
    expect(fill.style.width).toBe('40%');
  });

  it('hidesTheCompletionBannerUntilAllFiveCardsAreDone', () => {
    fixture.detectChanges();
    flushSetupState(partialSetupState);
    flushDataRequests();
    fixture.detectChanges();

    expect(fixture.componentInstance.allDone).toBe(false);
    expect(fixture.nativeElement.querySelector('.settings-overview__banner')).toBeNull();
  });

  it('showsTheCompletionBannerWithAGoToDirectoryLinkWhenAllFiveAreDone', () => {
    fixture.detectChanges();
    flushSetupState(allCompleteSetupState);
    flushDataRequests();
    fixture.detectChanges();

    expect(fixture.componentInstance.doneCount).toBe(5);
    expect(fixture.componentInstance.allDone).toBe(true);

    const banner: HTMLElement = fixture.nativeElement.querySelector('.settings-overview__banner');
    expect(banner).toBeTruthy();
    expect(banner.querySelector('.settings-overview__banner-title')?.textContent).toContain('settings.completionBanner.title');
    expect(banner.querySelector('.settings-overview__banner-description')?.textContent).toContain(
      'settings.completionBanner.description'
    );

    const cta: HTMLAnchorElement = banner.querySelector('.settings-overview__banner-cta')!;
    expect(cta.textContent).toContain('settings.completionBanner.cta');
    expect(cta.getAttribute('href')).toBe('/settings/associate-directory');
  });

  it('compensationCardFetchesAndDisplaysTheCurrentVersionLabel', () => {
    fixture.detectChanges();
    flushSetupState(allCompleteSetupState);
    flushDataRequests();
    fixture.detectChanges();

    expect(fixture.componentInstance.compensationCurrent?.versionLabel).toBe('v3');
    expect(fixture.componentInstance.compensationCurrent?.effectiveFrom).toBe('2026-04-01');

    const subtitles: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-subtitle');
    const currentEl = Array.from(subtitles).find(el => el.textContent?.includes('compensationCard'));
    expect(currentEl).toBeTruthy();
    // Falls back to the translation key (no i18n files loaded in this suite), but the interpolation
    // params must have been supplied for the pipe to have rendered anything at all here.
    expect(currentEl!.textContent).toContain('settings.compensationCard.currentVersionLabel');
  });

  it('companyProfileAndBrandingCardsFetchAndDisplayASubtitle', () => {
    fixture.detectChanges();
    flushSetupState(allCompleteSetupState);
    flushDataRequests();
    fixture.detectChanges();

    expect(fixture.componentInstance.companyProfileCurrent?.displayName).toBe('Viraj Acres');
    expect(fixture.componentInstance.brandingCurrent?.tagline).toBe('Land you can trust');

    const subtitles: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-subtitle');
    // One per card -- all 5 render a subtitle once their backing data has resolved.
    expect(subtitles.length).toBe(5);
    expect(Array.from(subtitles).some(el => el.textContent?.includes('companyProfileCard'))).toBe(true);
    expect(Array.from(subtitles).some(el => el.textContent?.includes('brandingCard'))).toBe(true);
  });

  it('projectsCardSummarizesTheProjectAndPlotCountFromProjectsService', () => {
    fixture.detectChanges();
    flushSetupState(allCompleteSetupState);
    flushDataRequests();
    fixture.detectChanges();

    expect(fixture.componentInstance.projectsSummary).toEqual({ projectCount: 2, plotCount: 48 });

    const subtitles: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-subtitle');
    const projectsSubtitle = Array.from(subtitles).find(el => el.textContent?.includes('projectsCard'));
    expect(projectsSubtitle).toBeTruthy();
  });

  it('paymentsKycCardOnlySummarizesOnceBothGatewayAndKycStrictnessHaveResolved', () => {
    fixture.detectChanges();
    flushSetupState(allCompleteSetupState);

    httpMock.expectOne('/api/company/compensation').flush(samplePlan);
    httpMock.expectOne('/api/company/profile').flush(sampleProfile);
    httpMock.expectOne('/api/company/branding').flush(sampleBranding);
    httpMock.expectOne('/api/company/projects').flush(sampleProjects);
    const paymentReq = httpMock.expectOne('/api/company/payments');
    const kycReq = httpMock.expectOne('/api/company/kyc');

    paymentReq.flush({ gateway: 'RAZORPAY', credentialsConfigured: true, modesEnabled: ['UPI'], updatedAt: null });
    fixture.detectChanges();
    expect(fixture.componentInstance.paymentsKycSummary).toBeNull();

    kycReq.flush({ strictness: 'RELAXED', requiredDocuments: ['AADHAAR'], updatedAt: null });
    fixture.detectChanges();

    expect(fixture.componentInstance.paymentsKycSummary).toEqual({ gatewayLabel: 'Razorpay', strictnessLabel: 'Relaxed' });
    const subtitles: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-subtitle');
    expect(Array.from(subtitles).some(el => el.textContent?.includes('paymentsKycCard'))).toBe(true);
  });

  it('viewHistoryOpensTheSidePanelPopulatedFromGetHistory', () => {
    fixture.detectChanges();
    flushSetupState(allCompleteSetupState);
    flushDataRequests();
    fixture.detectChanges();

    expect(fixture.componentInstance.historyPanelOpen).toBe(false);

    const viewHistoryButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.settings-overview__card-actions app-brand-button button'
    );
    expect(viewHistoryButton).toBeTruthy();
    viewHistoryButton.click();

    const historyReq = httpMock.expectOne('/api/company/compensation/history');
    historyReq.flush(sampleHistory);
    fixture.detectChanges();

    expect(fixture.componentInstance.historyPanelOpen).toBe(true);
    expect(fixture.componentInstance.compensationHistory).toEqual(sampleHistory);

    const sidePanel: HTMLElement = fixture.nativeElement.querySelector('.side-panel');
    expect(sidePanel.classList).toContain('side-panel--open');

    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__history-row');
    expect(rows.length).toBe(sampleHistory.length);
    expect(rows[0].textContent).toContain(sampleHistory[0].versionLabel);
    expect(rows[0].textContent).toContain(sampleHistory[0].effectiveFrom);
    expect(rows[1].textContent).toContain(sampleHistory[1].versionLabel);
  });
});
