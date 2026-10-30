import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { AssociateIdentityBarComponent } from './associate-identity-bar.component';
import { AssociateProfileService } from '../../../profile-kyc/associate-profile.service';
import { AuthService } from '../../../auth/auth.service';
import { RewardsService } from '../../../my-account/rewards.service';

describe('AssociateIdentityBarComponent', () => {
  function render(
    getProfile: () => unknown,
    getMyRankProgress: () => unknown = () => of({ designation: null }),
    realm: 'associate' | 'admin' = 'associate'
  ) {
    TestBed.configureTestingModule({
      imports: [AssociateIdentityBarComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AssociateProfileService, useValue: { getProfile } },
        { provide: RewardsService, useValue: { getMyRankProgress } },
        { provide: AuthService, useValue: { currentRealm: () => realm } }
      ]
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { dashboard: { designationValue: 'Sales Executive' } });
    translate.use('en');
    const fixture = TestBed.createComponent(AssociateIdentityBarComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const profile = () => of({ name: 'Ronali Sen', userId: 'PC10023' });

  it('shows the associate name and id', () => {
    const el = render(profile);
    expect(el.textContent).toContain('Ronali Sen');
    expect(el.textContent).toContain('PC10023');
  });

  it('shows the designation between name and id', () => {
    const el = render(profile, () => of({ designation: 'Team Leader' }));
    expect(el.querySelector('.identity-bar__designation')?.textContent).toContain('Team Leader');
  });

  it('falls back to the base designation when none is achieved', () => {
    const el = render(profile);
    expect(el.querySelector('.identity-bar__designation')?.textContent).toContain('Sales Executive');
  });

  it('shows no designation for admins and does not fetch rank progress', () => {
    const getMyRankProgress = jasmine.createSpy('getMyRankProgress');
    const el = render(profile, getMyRankProgress, 'admin');
    expect(el.querySelector('.identity-bar__designation')).toBeNull();
    expect(getMyRankProgress).not.toHaveBeenCalled();
  });

  it('renders nothing when the profile fails to load', () => {
    const el = render(() => throwError(() => new Error('boom')));
    expect(el.querySelector('.identity-bar')).toBeNull();
  });
});
