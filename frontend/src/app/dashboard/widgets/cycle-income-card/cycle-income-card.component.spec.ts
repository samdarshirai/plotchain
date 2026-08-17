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
      totalIncome: 2000
    };
    fixture.detectChanges();
  });

  it('renders direct, matching, sponsor matching, self performance, and total income', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1,000');
    expect(text).toContain('500');
    expect(text).toContain('300');
    expect(text).toContain('200');
    expect(text).toContain('2,000');
  });

  it('links to the income statement screen', () => {
    const link = fixture.nativeElement.querySelector('.cycle-income-card');
    expect(link.getAttribute('href')).toContain('/income-statement');
  });
});
