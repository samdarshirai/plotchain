import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminUsersComponent } from './admin-users.component';

describe('AdminUsersComponent', () => {
  let fixture: ComponentFixture<AdminUsersComponent>;
  let httpMock: HttpTestingController;
  const user = { id: 'u1', userId: 'ops1', name: 'Op One', phone: '9999999999', email: null, status: 'ACTIVE', lastLoginAt: null };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AdminUsersComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(AdminUsersComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/admin/users').flush([user]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('rendersOneRowPerAdminUserWithEditAndDeleteButtons', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
    expect(el.querySelector('.admin-users__edit')).not.toBeNull();
    expect(el.querySelector('.admin-users__delete')).not.toBeNull();
  });

  it('deletesAfterConfirmAndReloads', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    (fixture.nativeElement.querySelector('.admin-users__delete') as HTMLButtonElement).click();
    httpMock.expectOne({ method: 'DELETE', url: '/api/admin/users/u1' }).flush(null);
    httpMock.expectOne('/api/admin/users').flush([]);
  });

  it('showsTemporaryPasswordAfterCreate', () => {
    const c = fixture.componentInstance;
    c.openModal(null);
    c.form.setValue({ userId: 'ops2', name: 'Op Two', phone: '8888888888', email: '', status: 'ACTIVE' });
    c.save();
    const req = httpMock.expectOne({ method: 'POST', url: '/api/admin/users' });
    expect(req.request.body.email).toBeNull();
    req.flush({ ...user, userId: 'ops2', temporaryPassword: 'Tmp#1234' });
    httpMock.expectOne('/api/admin/users').flush([user]);
    expect(c.tempPassword).toEqual({ userId: 'ops2', value: 'Tmp#1234' });
  });

  it('resetsPasswordViaPopupAndShowsIt', () => {
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector('.admin-users__reset') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.admin-users__reset-modal')).not.toBeNull();
    (el.querySelector('.admin-users__reset-confirm') as HTMLButtonElement).click();
    httpMock.expectOne({ method: 'POST', url: '/api/admin/users/u1/reset-password' }).flush({ ...user, temporaryPassword: 'New#1234' });
    fixture.detectChanges();
    expect(el.querySelector('.admin-users__reset-result')?.textContent).toContain('New#1234');
  });
});
