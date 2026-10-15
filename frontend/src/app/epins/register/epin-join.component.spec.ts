import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { EPinJoinComponent } from './epin-join.component';
import { EPinRegisterService } from './epin-register.service';

describe('EPinJoinComponent', () => {
  let fixture: ComponentFixture<EPinJoinComponent>;
  let c: EPinJoinComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EPinJoinComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'pin-1' } } } }]
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(EPinRegisterService).unlock('pw').subscribe();
    http.expectOne('/api/associates/me/epins/unlock').flush({ token: 'tok', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    fixture = TestBed.createComponent(EPinJoinComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/epins/unused').flush({
      rows: [{ id: 'pin-1', code: 'ABC123', pinType: 'REGISTRATION', pinValue: 0, transferDate: null, transferBy: 'Company' }],
      page: 0, size: 100, totalElements: 1
    });
    fixture.detectChanges();
  });

  const fillValid = () => c.form.patchValue({
    sponsorUserId: 'SDI1', position: 'L', name: 'New Person', panNumber: 'ABCDE1234F', aadhaarNumber: '123456789012',
    phone: '9876543210', state: 'Delhi', district: 'Central', address: 'Addr', transactionPassword: 'pw'
  });

  it('shows the unmasked pin and its package', () => {
    expect(c.pin?.code).toBe('ABC123');
    expect(c.packageLabel).toBe('Registration (INR 0)');
  });

  it('does not submit when required fields or formats are invalid', () => {
    c.form.patchValue({ panNumber: 'bad', aadhaarNumber: '12' });
    c.submit();
    http.expectNone(r => r.url.endsWith('/join'));
    expect(c.err('panNumber')).toBeTruthy();
    expect(c.err('aadhaarNumber')).toBeTruthy();
  });

  it('posts the join request with the unlock token and shows the temporary password', () => {
    fillValid();
    c.submit();
    const req = http.expectOne('/api/associates/me/epins/pin-1/join');
    expect(req.request.headers.get('X-Epin-Unlock')).toBe('tok');
    expect(req.request.body.sponsorUserId).toBe('SDI1');
    expect(req.request.body.dateOfBirth).toBeNull();
    req.flush({ userId: 'VP00009', name: 'New Person', temporaryPassword: 'tmp-pass', transactionPassword: 'txn-pass' });
    fixture.detectChanges();
    expect(c.result?.temporaryPassword).toBe('tmp-pass');
    expect(c.result?.transactionPassword).toBe('txn-pass');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('VP00009');
  });

  it('maps a duplicate PAN conflict to a field error and clears the password', () => {
    fillValid();
    c.submit();
    http.expectOne('/api/associates/me/epins/pin-1/join')
      .flush({ code: 'PAN_TAKEN' }, { status: 409, statusText: 'Conflict' });
    expect(c.err('panNumber')).toContain('already');
    expect(c.form.controls.transactionPassword.value).toBe('');
  });

  it('maps a wrong transaction password to the invalid-password message', () => {
    fillValid();
    c.submit();
    http.expectOne('/api/associates/me/epins/pin-1/join').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(c.error).toBe('epins.errorPasswordInvalid');
  });
});
