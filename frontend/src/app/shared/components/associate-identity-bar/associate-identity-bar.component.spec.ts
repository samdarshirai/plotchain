import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AssociateIdentityBarComponent } from './associate-identity-bar.component';
import { AssociateProfileService } from '../../../profile-kyc/associate-profile.service';

describe('AssociateIdentityBarComponent', () => {
  function render(getProfile: () => unknown) {
    TestBed.configureTestingModule({
      imports: [AssociateIdentityBarComponent],
      providers: [{ provide: AssociateProfileService, useValue: { getProfile } }]
    });
    const fixture = TestBed.createComponent(AssociateIdentityBarComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the associate name and id', () => {
    const el = render(() => of({ name: 'Ronali Sen', userId: 'PC10023' }));
    expect(el.textContent).toContain('Ronali Sen');
    expect(el.textContent).toContain('PC10023');
  });

  it('renders nothing when the profile fails to load', () => {
    const el = render(() => throwError(() => new Error('boom')));
    expect(el.querySelector('.identity-bar')).toBeNull();
  });
});
