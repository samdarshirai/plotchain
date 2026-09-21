import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CycleIncomeCardComponent } from './cycle-income-card.component';
import { CycleIncome } from '../../models/dashboard-response.model';

describe('CycleIncomeCardComponent', () => {
  let fixture: ComponentFixture<CycleIncomeCardComponent>;

  const baseData: CycleIncome = {
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
        componentsAtZero: '{{count}} of {{total}} components at zero'
      }
    });
  });

  function createComponent(data: CycleIncome): void {
    fixture = TestBed.createComponent(CycleIncomeCardComponent);
    fixture.componentInstance.data = data;
    fixture.detectChanges();
  }

  it('renders direct, matching, and total income', () => {
    createComponent(baseData);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1,000');
    expect(text).toContain('500');
    expect(text).toContain('2,400');
  });

  it('renders sponsor matching and self performance income in their own rows', () => {
    createComponent(baseData);
    const sponsorMatching = fixture.nativeElement.querySelector('.sponsor-matching').textContent;
    const selfPerformance = fixture.nativeElement.querySelector('.self-performance').textContent;
    expect(sponsorMatching).toContain('300');
    expect(selfPerformance).toContain('200');
  });

  it('renders royalty bonus with its percentage', () => {
    createComponent(baseData);
    const royalty = fixture.nativeElement.querySelector('.royalty').textContent;
    expect(royalty).toContain('400');
    expect(royalty).toContain('3');
  });

  it('links to the income statement screen', () => {
    createComponent(baseData);
    const link = fixture.nativeElement.querySelector('.seal-card__link');
    expect(link.getAttribute('href')).toContain('/income-statement');
  });

  it('shows a positive delta caption when this cycle beats the previous one', () => {
    createComponent(baseData);
    const delta: HTMLElement = fixture.nativeElement.querySelector('.seal-card__delta');
    expect(delta.classList).not.toContain('seal-card__delta--down');
    expect(delta.textContent).toContain('600');
  });

  it('marks the delta caption as down when this cycle trails the previous one', () => {
    createComponent({ ...baseData, totalIncome: 1500, previousCycleTotalIncome: 1800 });
    const delta: HTMLElement = fixture.nativeElement.querySelector('.seal-card__delta');
    expect(delta.classList).toContain('seal-card__delta--down');
  });

  it('does not render a trend sparkline (dropped from the redesigned card)', () => {
    createComponent(baseData);
    expect(fixture.nativeElement.querySelector('.seal-card__trend')).toBeFalsy();
  });

  it('counts how many of the five income components are zero', () => {
    // direct=1000, matching=500, sponsorMatching=300, selfPerformance=200, royalty=400 -> none zero.
    createComponent(baseData);
    expect(fixture.componentInstance.zeroCount).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('0 of 5 components at zero');
  });

  it('counts zero components correctly when most components have no income yet', () => {
    createComponent({
      ...baseData, matchingIncome: 0, sponsorMatchingIncome: 0, selfPerformanceBonus: 0, royaltyBonus: 0
    });
    expect(fixture.componentInstance.zeroCount).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('4 of 5 components at zero');
  });

  it('sizes each breakdown bar proportionally to the largest component', () => {
    createComponent(baseData);
    // Largest component is directIncome (1000) -> its bar is 100% width.
    expect(fixture.componentInstance.barPct(baseData.directIncome)).toBe(100);
    // sponsorMatchingIncome (300) of directIncome (1000) -> 30%.
    expect(fixture.componentInstance.barPct(baseData.sponsorMatchingIncome)).toBe(30);
  });

  it('reports a zero bar without dividing by zero when every component is zero', () => {
    createComponent({
      ...baseData, directIncome: 0, matchingIncome: 0, sponsorMatchingIncome: 0, selfPerformanceBonus: 0, royaltyBonus: 0
    });
    expect(fixture.componentInstance.barPct(0)).toBe(0);
  });
});
