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

  afterEach(() => httpMock.verify());

  it('navigates to /dashboard on successful password change', () => {
    fixture.componentInstance.form.setValue({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates/me/password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    req.flush(null);

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows an error on failed password change', () => {
    fixture.componentInstance.form.setValue({ currentPassword: 'wrong', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates/me/password');
    req.flush({ error: 'Invalid current password' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.error).toBeTrue();
  });
});
