import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsOverviewComponent } from './settings-overview.component';
import { SECTION_PATHS } from './models/settings-section.model';
import { CompensationPlanResponse, CompensationPlanSummary } from '../setup/models/compensation-plan.model';

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

  it('rendersSevenCardsWithTheirTranslatedLabelsAndLinks', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/company/compensation').flush(samplePlan);
    fixture.detectChanges();

    const sectionKeys = Object.keys(SECTION_PATHS);
    const cards = fixture.nativeElement.querySelectorAll('.settings-overview__card');
    expect(cards.length).toBe(sectionKeys.length);
    expect(cards.length).toBe(7);

    const titles: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-title');
    const links: NodeListOf<HTMLAnchorElement> = fixture.nativeElement.querySelectorAll('.settings-overview__card-action');
    expect(titles.length).toBe(7);
    expect(links.length).toBe(7);

    sectionKeys.forEach((key, index) => {
      // No translations are loaded in this suite, so ngx-translate falls back to the key path --
      // this both confirms the right key is requested and that each card wires up to the right link.
      expect(titles[index].textContent?.trim()).toBe('settings.sections.' + key);
      expect(links[index].textContent?.trim()).toBe('settings.cards.' + key + '.actionLabel');
      expect(links[index].getAttribute('href')).toBe('/settings/' + SECTION_PATHS[key]);
    });
  });

  it('compensationCardFetchesAndDisplaysTheCurrentVersionLabel', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('/api/company/compensation');
    req.flush(samplePlan);
    fixture.detectChanges();

    expect(fixture.componentInstance.compensationCurrent?.versionLabel).toBe('v3');
    expect(fixture.componentInstance.compensationCurrent?.effectiveFrom).toBe('2026-04-01');

    const currentEl: HTMLElement = fixture.nativeElement.querySelector('.settings-overview__compensation-current');
    expect(currentEl).toBeTruthy();
    // Falls back to the translation key (no i18n files loaded in this suite), but the interpolation
    // params must have been supplied for the pipe to have rendered anything at all here.
    expect(currentEl.textContent).toContain('settings.compensationCard.currentVersionLabel');
  });

  it('viewHistoryOpensTheSidePanelPopulatedFromGetHistory', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/company/compensation').flush(samplePlan);
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
