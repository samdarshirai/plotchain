import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { KycNetworkSummaryComponent } from './kyc-network-summary.component';

describe('KycNetworkSummaryComponent', () => {
  let fixture: ComponentFixture<KycNetworkSummaryComponent>;
  let translateService: TranslateService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycNetworkSummaryComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(KycNetworkSummaryComponent);
    translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.use('en');
    translateService.setTranslation('en', {
      'dashboard.kycNetworkLabel': 'KYC in Network',
      'dashboard.kycVerifiedCount': '{{count}} verified',
      'dashboard.kycPendingCount': '{{count}} pending',
      'dashboard.kycRejectedCount': '{{count}} rejected'
    });
    fixture.componentInstance.data = { verified: 38, pending: 1, rejected: 3 };
    fixture.detectChanges();
  });

  it('renders all three counts', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('38');
    expect(text).toContain('1');
    expect(text).toContain('3');
  });
});
