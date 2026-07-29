import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { CycleCountdownComponent } from './cycle-countdown.component';

describe('CycleCountdownComponent', () => {
  let fixture: ComponentFixture<CycleCountdownComponent>;
  let translateService: TranslateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CycleCountdownComponent, TranslateModule.forRoot()]
    }).compileComponents();

    translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.setTranslation('en', {
      dashboard: {
        cycleCloses: 'Cycle closes in {{days}} days'
      }
    });

    fixture = TestBed.createComponent(CycleCountdownComponent);
    fixture.componentInstance.data = { cycleId: 'c1', daysRemaining: 10 };
    fixture.detectChanges();
  });

  it('renders the days remaining', () => {
    expect(fixture.nativeElement.textContent).toContain('10');
  });
});
