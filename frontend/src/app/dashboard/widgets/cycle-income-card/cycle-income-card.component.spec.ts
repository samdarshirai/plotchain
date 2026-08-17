import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CycleIncomeCardComponent } from './cycle-income-card.component';

describe('CycleIncomeCardComponent', () => {
  let fixture: ComponentFixture<CycleIncomeCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CycleIncomeCardComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(CycleIncomeCardComponent);
    fixture.componentInstance.data = {
      cycleId: 'c1',
      directIncome: 1000,
      matchingIncome: 500,
      sponsorMatchingIncome: 300,
      selfPerformanceBonus: 200,
      royaltyBonus: 400,
      royaltyBonusPct: 3,
      totalIncome: 2400
    };
    fixture.detectChanges();
  });

  it('renders direct, matching, and total income', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1,000');
    expect(text).toContain('500');
    expect(text).toContain('2,400');
  });

  it('renders sponsor matching and self performance income in their own rows', () => {
    const sponsorMatching = fixture.nativeElement.querySelector('.sponsor-matching').textContent;
    const selfPerformance = fixture.nativeElement.querySelector('.self-performance').textContent;
    expect(sponsorMatching).toContain('300');
    expect(selfPerformance).toContain('200');
  });

  it('renders royalty bonus with its percentage', () => {
    const royalty = fixture.nativeElement.querySelector('.royalty').textContent;
    expect(royalty).toContain('400');
    expect(royalty).toContain('3');
  });

  it('links to the income statement screen', () => {
    const link = fixture.nativeElement.querySelector('.cycle-income-card');
    expect(link.getAttribute('href')).toContain('/income-statement');
  });
});
