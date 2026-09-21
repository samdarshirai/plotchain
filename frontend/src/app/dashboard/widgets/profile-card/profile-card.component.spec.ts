import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProfileCardComponent } from './profile-card.component';
import { AssociateSummary } from '../../models/dashboard-response.model';

function associate(overrides: Partial<AssociateSummary>): AssociateSummary {
  return {
    associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
    phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null,
    sponsorAssociateId: null, sponsorName: null,
    ...overrides
  };
}

describe('ProfileCardComponent', () => {
  let fixture: ComponentFixture<ProfileCardComponent>;

  function createComponent(data: AssociateSummary): void {
    fixture = TestBed.createComponent(ProfileCardComponent);
    fixture.componentInstance.associate = data;
    const translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.use('en');
    translateService.setTranslation('en', {
      dashboard: {
        designationValue: 'Sales Executive',
        profileAssociateId: 'Associate ID',
        profileDesignation: 'Designation',
        profileMobile: 'Mobile',
        profileSponsor: 'Sponsor',
        profileSponsorHeadOffice: 'Head Office',
        profileRegistered: 'Registered',
        profileLatestUpgrade: 'Latest Upgrade'
      }
    });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileCardComponent, TranslateModule.forRoot()]
    }).compileComponents();
  });

  it('renders the associate name and static designation', () => {
    createComponent(associate({}));
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Asha Kumar');
    expect(text).toContain('Sales Executive');
  });

  it('computes initials from the first two words of the name, uppercased', () => {
    createComponent(associate({ name: 'asha kumar sinha' }));
    expect(fixture.componentInstance.initials).toBe('AK');
    expect(fixture.nativeElement.querySelector('.profile-card__avatar').textContent.trim()).toBe('AK');
  });

  it('renders the associate ID and mobile rows', () => {
    createComponent(associate({}));
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('SDI384818');
    expect(text).toContain('9876543210');
  });

  it('hides the mobile row when phone is null', () => {
    createComponent(associate({ phone: null }));
    expect(fixture.nativeElement.textContent).not.toContain('Mobile');
  });

  it('renders the sponsor as "id · name" when present', () => {
    createComponent(associate({ sponsorAssociateId: 'SDI100001', sponsorName: 'Head Office Sponsor' }));
    expect(fixture.nativeElement.textContent).toContain('SDI100001 · Head Office Sponsor');
  });

  it('falls back to "Head Office" when the associate has no sponsor', () => {
    createComponent(associate({ sponsorAssociateId: null, sponsorName: null }));
    expect(fixture.nativeElement.textContent).toContain('Head Office');
  });

  it('hides the latest-upgrade row when rankChangedAt is null', () => {
    createComponent(associate({ rankChangedAt: null }));
    expect(fixture.nativeElement.textContent).not.toContain('Latest Upgrade');
  });

  it('shows the latest-upgrade row when rankChangedAt is set', () => {
    createComponent(associate({ rankChangedAt: '2026-01-10T09:00:00Z' }));
    expect(fixture.nativeElement.textContent).toContain('Latest Upgrade');
  });
});
