import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ChangePasswordComponent } from './change-password.component';

describe('ChangePasswordComponent', () => {
  let fixture: ComponentFixture<ChangePasswordComponent>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChangePasswordComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(ChangePasswordComponent);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('navigates to /dashboard on successful password change without consulting setup state', () => {
    fixture.componentInstance.form.setValue({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates/me/password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    req.flush(null);

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    httpMock.expectNone('/api/company/setup-state');
  });

  it('navigates to the first incomplete setup step when an ADMIN completes a forced password change while unlaunched', () => {
    localStorage.setItem('plotchain.auth.role', 'ADMIN');

    fixture.componentInstance.form.setValue({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/password').flush(null);
    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [{ number: 1, key: 'companyProfile', complete: false, required: true, percentComplete: 0 }],
      canGoLive: false,
      launchedAt: null
    });

    expect(router.navigate).toHaveBeenCalledWith(['/setup/company-profile']);
  });

  it('navigates to the admin route when an ADMIN completes a forced password change once launched', () => {
    localStorage.setItem('plotchain.auth.role', 'ADMIN');

    fixture.componentInstance.form.setValue({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/password').flush(null);
    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [{ number: 1, key: 'companyProfile', complete: true, required: true, percentComplete: 100 }],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/admin/associates/new']);
  });

  it('navigates to /settings when a non-ADMIN admin-family role completes a forced password change once launched', () => {
    localStorage.setItem('plotchain.auth.role', 'FINANCE');

    fixture.componentInstance.form.setValue({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/password').flush(null);
    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/settings']);
  });

  it('shows an error on failed password change', () => {
    fixture.componentInstance.form.setValue({ currentPassword: 'wrong', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates/me/password');
    req.flush({ error: 'Invalid current password' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.error).toBeTrue();
  });
});
