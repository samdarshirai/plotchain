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
    incomeTrend: [1200, 1800, 2400]
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
        deltaDown: '-{{amount}} vs last cycle'
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
    const link = fixture.nativeElement.querySelector('.cycle-income-card');
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

  it('renders a trend sparkline only when at least two points exist', () => {
    createComponent(baseData);
    expect(fixture.nativeElement.querySelector('.seal-card__trend')).toBeTruthy();
  });

  it('omits the sparkline for a single-point trend', () => {
    createComponent({ ...baseData, incomeTrend: [2400] });
    expect(fixture.nativeElement.querySelector('.seal-card__trend')).toBeFalsy();
  });
});
