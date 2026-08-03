import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate');
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    // Real AuthService.login() writes the role to localStorage on a successful flush; several
    // tests here flush an ADMIN response, which would otherwise leak into other spec files
    // sharing the same browser instance (e.g. ChangePasswordComponent's role-based routing).
    localStorage.clear();
  });

  it('navigates to /dashboard on successful ASSOCIATE login without consulting setup state', () => {
    fixture.componentInstance.form.setValue({ userId: 'jane', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ token: 'abc.def.ghi', associateId: 'assoc-1', role: 'ASSOCIATE', mustChangePassword: false });

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    httpMock.expectNone('/api/company/setup-state');
  });

  it('navigates to the first incomplete setup step on an ADMIN login while unlaunched', () => {
    fixture.componentInstance.form.setValue({ userId: 'admin', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/auth/login')
      .flush({ token: 'abc.def.ghi', associateId: 'admin-1', role: 'ADMIN', mustChangePassword: false });

    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [{ number: 1, key: 'companyProfile', complete: false, required: true, percentComplete: 0 }],
      canGoLive: false,
      launchedAt: null
    });

    expect(router.navigate).toHaveBeenCalledWith(['/setup/company-profile']);
  });

  it('navigates to the admin route on an ADMIN login once launched', () => {
    fixture.componentInstance.form.setValue({ userId: 'admin', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/auth/login')
      .flush({ token: 'abc.def.ghi', associateId: 'admin-1', role: 'ADMIN', mustChangePassword: false });

    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [{ number: 1, key: 'companyProfile', complete: true, required: true, percentComplete: 100 }],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/admin/associates/new']);
  });

  it('navigates to /settings on a non-ADMIN admin-family login once launched', () => {
    fixture.componentInstance.form.setValue({ userId: 'finance01', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/auth/login')
      .flush({ token: 'abc.def.ghi', associateId: 'finance-1', role: 'FINANCE', mustChangePassword: false });

    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/settings']);
  });

  it('redirects to /change-password before ever consulting setup state', () => {
    fixture.componentInstance.form.setValue({ userId: 'admin', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/auth/login')
      .flush({ token: 'abc.def.ghi', associateId: 'admin-1', role: 'ADMIN', mustChangePassword: true });

    expect(router.navigate).toHaveBeenCalledWith(['/change-password']);
    httpMock.expectNone('/api/company/setup-state');
  });

  it('shows a generic error on a 401', () => {
    fixture.componentInstance.form.setValue({ userId: 'jane', password: 'wrong' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ error: 'Invalid ID or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.error).toBeTrue();
    expect(fixture.componentInstance.platformNotLive).toBeFalse();
  });

  it('shows the platform-not-live error on a 403', () => {
    fixture.componentInstance.form.setValue({ userId: 'jane', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ error: 'This platform has not launched yet.' }, { status: 403, statusText: 'Forbidden' });

    expect(fixture.componentInstance.platformNotLive).toBeTrue();
    expect(fixture.componentInstance.error).toBeFalse();
  });

  it('does not submit when previewMode is true', () => {
    fixture.componentInstance.previewMode = true;
    fixture.componentInstance.form.setValue({ userId: 'jane', password: 'Password123!' });

    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/auth/login');
  });

  it('renders the logo only when hasSquareLogo is true', () => {
    fixture.componentInstance.hasSquareLogo = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.login-logo')).toBeTruthy();

    fixture.componentInstance.hasSquareLogo = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.login-logo')).toBeFalsy();
  });

  it('renders the tagline only when set', () => {
    fixture.componentInstance.tagline = 'Land you can trust';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.login-tagline').textContent).toContain('Land you can trust');

    fixture.componentInstance.tagline = null;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.login-tagline')).toBeFalsy();
  });

  it('toggles the password field type via the show/hide button', () => {
    const passwordInput: HTMLInputElement = fixture.nativeElement.querySelector('input[formControlName="password"]');
    expect(passwordInput.type).toBe('password');

    fixture.nativeElement.querySelector('.login-password-toggle').click();
    fixture.detectChanges();

    expect(passwordInput.type).toBe('text');
  });
});
