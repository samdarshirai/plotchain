import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CycleIncomeCardComponent } from './cycle-income-card.component';
import { CycleIncome, LegVolumeSummary, NetworkSummary } from '../../models/dashboard-response.model';

describe('CycleIncomeCardComponent (business summary)', () => {
  let fixture: ComponentFixture<CycleIncomeCardComponent>;

  const income: CycleIncome = {
    cycleId: 'c1',
    directIncome: 1000,
    matchingIncome: 500,
    sponsorMatchingIncome: 300,
    selfPerformanceBonus: 200,
    royaltyBonus: 400,
    royaltyBonusPct: 3,
    totalIncome: 2400,
    previousCycleTotalIncome: 1800,
    incomeTrend: [1200, 1800, 2400],
    matchingIncomeLifetime: 126000,
    sponsorMatchingIncomeLifetime: 0
  };
  const legs: LegVolumeSummary = {
    leftLegVolume: 0, rightLegVolume: 0,
    totalLeftBusiness: 3000000, totalRightBusiness: 1500000, totalSelfBusiness: 500000,
    newBookedAreaSqft: 0
  };
  const network: NetworkSummary = { totalDownline: 42, directCount: 8, leftAssociateCount: 30, rightAssociateCount: 12 };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CycleIncomeCardComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setDefaultLang('en');
    translate.use('en');
    translate.setTranslation('en', {
      dashboard: {
        deltaUp: '+{{amount}} vs last cycle',
        deltaDown: '-{{amount}} vs last cycle',
        teamSplit: '{{left}} left · {{right}} right'
      }
    });
  });

  function createComponent(overrides: { income?: CycleIncome; legs?: LegVolumeSummary } = {}): void {
    fixture = TestBed.createComponent(CycleIncomeCardComponent);
    const c = fixture.componentInstance;
    c.data = overrides.income ?? income;
    c.legVolume = overrides.legs ?? legs;
    c.network = network;
    c.rank = 'Sales Associate';
    fixture.detectChanges();
  }

  const el = (sel: string): HTMLElement => fixture.nativeElement.querySelector(sel);

  it('shows total business as left + right + self', () => {
    createComponent();
    expect(fixture.componentInstance.totalBusiness).toBe(5000000);
    expect(el('.seal-card__figure').textContent).toContain('5,000,000');
  });

  it('renders left, right and self business rows', () => {
    createComponent();
    expect(el('.left-business').textContent).toContain('3,000,000');
    expect(el('.right-business').textContent).toContain('1,500,000');
    expect(el('.self-business').textContent).toContain('500,000');
  });

  it('sizes bars against the largest of the three', () => {
    createComponent();
    expect(fixture.componentInstance.barPct(3000000)).toBe(100);
    expect(fixture.componentInstance.barPct(1500000)).toBe(50);
  });

  it('returns a zero bar without dividing by zero when there is no business', () => {
    createComponent({ legs: { ...legs, totalLeftBusiness: 0, totalRightBusiness: 0, totalSelfBusiness: 0 } });
    expect(fixture.componentInstance.barPct(0)).toBe(0);
    expect(fixture.componentInstance.totalBusiness).toBe(0);
  });

  it('shows rank and team size with the left/right split', () => {
    createComponent();
    expect(el('.business-rank').textContent).toContain('Sales Associate');
    const team = el('.business-team').textContent;
    expect(team).toContain('42');
    expect(team).toContain('30 left · 12 right');
  });

  it('shows this cycle earnings as one item, with the up delta', () => {
    createComponent();
    const earnings = el('.business-earnings').textContent;
    expect(earnings).toContain('2,400');
    const delta = el('.seal-card__delta');
    expect(delta.classList).not.toContain('seal-card__delta--down');
    expect(delta.textContent).toContain('600');
  });

  it('marks the delta down when this cycle trails the previous one', () => {
    createComponent({ income: { ...income, totalIncome: 1500 } });
    expect(el('.seal-card__delta').classList).toContain('seal-card__delta--down');
  });

  it('no longer renders the five income component rows', () => {
    createComponent();
    expect(el('.direct')).toBeFalsy();
    expect(el('.royalty')).toBeFalsy();
  });

  it('links to the income statement for the cycle', () => {
    createComponent();
    expect(el('.seal-card__link').getAttribute('href')).toContain('/income-statement');
  });
});
