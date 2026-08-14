import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ProfileKycComponent } from './profile-kyc.component';
import { AssociateProfileResponse } from './models/associate-profile.model';
import { AssociateKycStatusResponse } from './models/associate-kyc-status.model';

describe('ProfileKycComponent', () => {
  let fixture: ComponentFixture<ProfileKycComponent>;
  let httpMock: HttpTestingController;

  const profileResponse: AssociateProfileResponse = {
    id: 'a1', userId: 'VP00001', name: 'Jane Doe', phone: '9990001111',
    email: 'jane@example.com', joinedAt: '2026-01-01T00:00:00Z'
  };
  const kycResponse: AssociateKycStatusResponse = {
    kycStatus: 'PENDING',
    documents: [{ documentType: 'AADHAAR', contentType: 'image/png', uploadedAt: '2026-08-01T00:00:00Z' }]
  };

  function init(): void {
    fixture = TestBed.createComponent(ProfileKycComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileKycComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
  });

  afterEach(() => httpMock.verify());

  it('loads and displays the profile and KYC status on init', () => {
    init();
    expect(fixture.componentInstance.form.value.name).toBe('Jane Doe');
    expect(fixture.componentInstance.kycStatus?.kycStatus).toBe('PENDING');
  });

  it('shows a load error banner if the profile fetch fails, without leaving the form silently blank', () => {
    fixture = TestBed.createComponent(ProfileKycComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    fixture.detectChanges();

    expect(fixture.componentInstance.profileLoadError).toBeTrue();
  });

  it('shows a load error banner if the KYC status fetch fails independently of the profile fetch', () => {
    fixture = TestBed.createComponent(ProfileKycComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.kycLoadError).toBeTrue();
  });

  it('submits the edited name/phone/email via updateProfile on save', () => {
    init();
    fixture.componentInstance.form.patchValue({ name: 'Jane A. Doe', phone: '9990002222', email: 'jane.a.doe@example.com' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates/me/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Jane A. Doe', phone: '9990002222', email: 'jane.a.doe@example.com' });
    req.flush({ ...profileResponse, name: 'Jane A. Doe' });

    expect(fixture.componentInstance.saveError).toBeUndefined();
  });

  it('does not submit when the form is invalid (blank name)', () => {
    init();
    fixture.componentInstance.form.patchValue({ name: '' });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/associates/me/profile');
  });

  it('renders a save-error banner in the DOM on a non-409 save failure (e.g. a 500)', () => {
    init();
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/profile')
      .flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.saveError).toBeTruthy();
    const banner: HTMLElement | null = fixture.nativeElement.querySelector('.profile-kyc__save-error');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain(fixture.componentInstance.saveError);
  });

  it('surfaces a 409 email-conflict as a field-level error, read from the flat error body', () => {
    init();
    fixture.componentInstance.form.patchValue({ email: 'taken@example.com' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/profile')
      .flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.emailConflictError).toBe('Email already registered');
  });

  it('uploads a picked KYC document and refreshes status on success', () => {
    init();
    const file = new File(['dummy'], 'aadhaar.png', { type: 'image/png' });
    fixture.componentInstance.onFileSelected('PAN', file);

    const uploadReq = httpMock.expectOne('/api/associates/me/kyc/documents/PAN');
    expect(uploadReq.request.method).toBe('POST');
    uploadReq.flush({ documentType: 'PAN', contentType: 'image/png', uploadedAt: '2026-08-14T00:00:00Z' });

    const refreshReq = httpMock.expectOne('/api/associates/me/kyc');
    refreshReq.flush({ kycStatus: 'PENDING', documents: [{ documentType: 'PAN', contentType: 'image/png', uploadedAt: '2026-08-14T00:00:00Z' }] });

    expect(fixture.componentInstance.kycUploadError).toBeUndefined();
  });

  it('surfaces an upload error without refreshing status', () => {
    init();
    const file = new File(['dummy'], 'aadhaar.gif', { type: 'image/gif' });
    fixture.componentInstance.onFileSelected('AADHAAR', file);

    httpMock.expectOne('/api/associates/me/kyc/documents/AADHAAR')
      .flush({ error: 'unsupported document content type: image/gif' }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.kycUploadError).toBe('unsupported document content type: image/gif');
    httpMock.expectNone('/api/associates/me/kyc');
  });

  it('renders a disabled bank-details section with no input fields (known data-model gap)', () => {
    init();
    const bankSection: HTMLElement | null = fixture.nativeElement.querySelector('.profile-kyc__bank-section');
    expect(bankSection).toBeTruthy();
    expect(bankSection?.querySelectorAll('input').length).toBe(0);
  });

  it('renders one upload row per hardcoded KYC document type', () => {
    init();
    const rows = fixture.nativeElement.querySelectorAll('.profile-kyc__kyc-document-row');
    expect(rows.length).toBe(3); // AADHAAR, PAN, BANK_PASSBOOK
  });

  it('shows the read-only userId and joinedAt identity strip without an editable id field', () => {
    init();
    const identity: HTMLElement | null = fixture.nativeElement.querySelector('.profile-kyc__identity');
    expect(identity?.textContent).toContain('VP00001');
    expect(fixture.nativeElement.querySelector('input[formcontrolname="id"]')).toBeFalsy();
  });
});
