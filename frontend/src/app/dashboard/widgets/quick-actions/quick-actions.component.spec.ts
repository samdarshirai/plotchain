import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { QuickActionsComponent } from './quick-actions.component';

describe('QuickActionsComponent', () => {
  let fixture: ComponentFixture<QuickActionsComponent>;
  let translateService: TranslateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickActionsComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(QuickActionsComponent);
    translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.use('en');
    translateService.setTranslation('en', {
      'dashboard.recordSaleAction': '+ Record Sale',
      'dashboard.provisionAssociateAction': '+ Provision Associate',
      'dashboard.quickActionsContactAdmin': 'Contact your admin to record a sale or add a referral.'
    });
    fixture.detectChanges();
  });

  it('renders both action buttons as inert (no button/link elements)', () => {
    expect(fixture.nativeElement.querySelectorAll('button, a').length).toBe(0);
    const buttons = fixture.nativeElement.querySelectorAll('.quick-actions__button');
    expect(buttons.length).toBe(2);
  });

  it('still shows the contact-admin hint', () => {
    expect(fixture.nativeElement.textContent).toContain('admin');
  });
});
