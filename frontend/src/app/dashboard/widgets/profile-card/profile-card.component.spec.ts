import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ProfileCardComponent } from './profile-card.component';
import { AssociateSummary } from '../../models/dashboard-response.model';

function associate(overrides: Partial<AssociateSummary>): AssociateSummary {
  return {
    associateId: 'SDI384818', name: 'Asha Kumar', designation: 'Sales Manager',
    phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z',
    sponsorAssociateId: null, sponsorName: null, lastLoginAt: null,
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
        profileLastLogin: 'Last login',
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

  it('renders the associate name', () => {
    createComponent(associate({}));
    expect(fixture.nativeElement.textContent).toContain('Asha Kumar');
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

  it('shows the last login row only when lastLoginAt is set', () => {
    createComponent(associate({ lastLoginAt: '2026-10-09T08:30:00Z' }));
    expect(fixture.nativeElement.textContent).toContain('Last login');
    fixture.destroy();
    createComponent(associate({ lastLoginAt: null }));
    expect(fixture.nativeElement.textContent).not.toContain('Last login');
  });

  it('hides the mobile row when phone is null', () => {
    createComponent(associate({ phone: null }));
    expect(fixture.nativeElement.textContent).not.toContain('Mobile');
  });

  it('renders only the sponsor id when present', () => {
    createComponent(associate({ sponsorAssociateId: 'SDI100001', sponsorName: 'Head Office Sponsor' }));
    expect(fixture.nativeElement.textContent).toContain('SDI100001');
    expect(fixture.nativeElement.textContent).not.toContain('Head Office Sponsor');
  });

  it('falls back to "Head Office" when the associate has no sponsor', () => {
    createComponent(associate({ sponsorAssociateId: null, sponsorName: null }));
    expect(fixture.nativeElement.textContent).toContain('Head Office');
  });

  it('shows the achieved designation', () => {
    createComponent(associate({ designation: 'Sales Manager' }));
    expect(fixture.nativeElement.textContent).toContain('Sales Manager');
  });

  it('falls back to the base designation when no reward tier is achieved', () => {
    createComponent(associate({ designation: null }));
    expect(fixture.nativeElement.textContent).toContain('Sales Executive');
  });
});
