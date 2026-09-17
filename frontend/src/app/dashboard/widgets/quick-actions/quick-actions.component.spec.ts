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
      'dashboard.quickActionsContactAdmin': 'To record a sale or add a referral, contact your admin.'
    });
    fixture.detectChanges();
  });

  it('renders no buttons or links (record-sale/provision-associate actions removed)', () => {
    expect(fixture.nativeElement.querySelectorAll('button, a, .quick-actions__button').length).toBe(0);
  });

  it('shows only the contact-admin hint text', () => {
    expect(fixture.nativeElement.textContent.trim()).toBe('To record a sale or add a referral, contact your admin.');
  });
});
