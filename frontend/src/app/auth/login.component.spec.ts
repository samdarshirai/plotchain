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

  afterEach(() => httpMock.verify());

  it('navigates to /dashboard on successful login', () => {
    fixture.componentInstance.form.setValue({ email: 'jane@plotchain.test', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ token: 'abc.def.ghi', associateId: 'assoc-1', role: 'ASSOCIATE' });

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows an error on failed login', () => {
    fixture.componentInstance.form.setValue({ email: 'jane@plotchain.test', password: 'wrong' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ error: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.error).toBeTrue();
  });
});
