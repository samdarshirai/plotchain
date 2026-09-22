import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { MyAccountComponent } from './my-account.component';
import { AssociateProfileResponse } from '../profile-kyc/models/associate-profile.model';
import { AssociateKycStatusResponse } from '../profile-kyc/models/associate-kyc-status.model';
import { AssociateRankProgress } from './models/associate-rank-progress.model';
import { AssociateIdCard } from './models/associate-id-card.model';
import { AssociateBankDetailsResponse } from './models/associate-bank-details.model';
import { AssociateNomineeResponse } from './models/associate-nominee.model';
import { TransactionPasswordStatusResponse } from './models/associate-transaction-password.model';
import { CompanyLetterheadResponse } from '../setup/models/company-profile.model';
import { BrandingBootstrapService } from '../core/theme/branding-bootstrap.service';

// Consolidates ProfileKycComponent + RewardsComponent + DigitalIdCardComponent (role-capability /
// income-ledger units) into one "My Account" screen per Account Consolidation.dc.html (claude.ai
// design project cfbfc37d-4de7-4f26-8b81-923167ca3d33), split into 4 sections (Welcome Letter,
// Profile, Bank Details, KYC Details), each a sibling route reusing this component with a
// different `data.tab` (app.routes.ts) and navigated to via the sidebar's My Account sub-items
// (docs/superpowers/plans/can-you-break-down-vectorized-dongarra.md), not an in-page tab bar.
// `activeTab` is driven off ActivatedRoute.data, mocked here with a BehaviorSubject so tests can
// simulate a sidebar sub-item click by pushing a new tab value through it. Profile/KYC/
// rank-progress each fire their own independent GET on init (own error surface each). Bank
// details are lazy-loaded on first navigation to that route, same as PlotBookingsComponent's My
// Bookings tab. DigitalIdCardComponent is embedded unmodified as a print-only child (hidden on
// screen, shown under @media print) -- it keeps its own self-fetching ngOnInit, so its GET
// /api/associates/me/id-card fires on init too.
//
// Profile screen redesign ("Viraj Acres" mockup): the Profile section (activeTab === 'profile')
// additionally fires GET nominee/transaction-password-status/photo on init, and splits into an
// in-page tab bar (`profileSubTab`) -- Profile / Login Password / Transaction Password -- scoped
// to this route's content only, not a route change.
describe('MyAccountComponent', () => {
  let fixture: ComponentFixture<MyAccountComponent>;
  let httpMock: HttpTestingController;
  let routeDataSubject: BehaviorSubject<{ tab: string }>;

  const profileResponse: AssociateProfileResponse = {
    id: 'a1', userId: 'VP00001', name: 'Left Kumar', phone: null,
    email: 'left@example.com', address: null, joinedAt: '2026-09-02T00:00:00Z',
    fatherHusbandName: null, dateOfBirth: null, gender: null, maritalStatus: null,
    state: null, district: null, postalCode: null
  };
  const companyLetterhead: CompanyLetterheadResponse = {
    displayName: 'Plotchain Estates', registeredAddress: '123 MG Road, Bengaluru',
    contactPhone: '+919876543210', contactEmail: 'info@plotchain.test'
  };
  const kycResponse: AssociateKycStatusResponse = {
    kycStatus: 'VERIFIED',
    documents: []
  };
  const rankProgress: AssociateRankProgress = {
    currentRank: 'Silver', currentRankOrder: 1, nextRank: 'Gold',
    progressPercent: 2, cumulativeMatchedVolume: 0, volumeToNextRank: 100000,
    rewardTiers: []
  };
  const idCard: AssociateIdCard = {
    idNumber: 'VP00001', name: 'Left Kumar', rank: 'Silver', photoUrl: null, qrPayload: 'VP00001'
  };
  const bankDetailsResponse: AssociateBankDetailsResponse = {
    bankName: null, accountHolder: null, accountNumber: null, ifscCode: null, accountType: null, updatedAt: null
  };
  const nomineeResponse: AssociateNomineeResponse = { nomineeName: null, relation: null, updatedAt: null };
  const transactionPasswordNotSet: TransactionPasswordStatusResponse = { isSet: false };

  function flushInitRequests(profile: AssociateProfileResponse = profileResponse): void {
    httpMock.expectOne('/api/associates/me/profile').flush(profile);
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    httpMock.expectOne('/api/associates/me/rank-progress').flush(rankProgress);
    httpMock.expectOne('/api/associates/me/id-card').flush(idCard);
    httpMock.expectOne('/api/company/profile/letterhead').flush(companyLetterhead);
    httpMock.expectOne('/api/associates/me/nominee').flush(nomineeResponse);
    httpMock.expectOne('/api/associates/me/transaction-password').flush(transactionPasswordNotSet);
    httpMock.expectOne('/api/associates/me/photo').flush(new Blob(['no photo']), { status: 404, statusText: 'Not Found' });
  }

  function init(): void {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushInitRequests();
    fixture.detectChanges();
  }

  // forkJoin fires the profile and nominee PUTs concurrently; whether an error on the profile
  // request cancels the still-in-flight nominee request before or after this line runs is a
  // race the test can't control, so this tolerates both outcomes -- httpMock.match() removes a
  // matching request from the pending queue either way, only flushing it if it's still live.
  function flushPendingNomineeIfAny(): void {
    httpMock.match('/api/associates/me/nominee').forEach(req => {
      if (!req.cancelled) {
        req.flush(nomineeResponse);
      }
    });
  }

  function switchTab(tabId: string): void {
    routeDataSubject.next({ tab: tabId });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    routeDataSubject = new BehaviorSubject<{ tab: string }>({ tab: 'profile' });
    await TestBed.configureTestingModule({
      imports: [MyAccountComponent, HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [{ provide: ActivatedRoute, useValue: { data: routeDataSubject.asObservable() } }]
    }).compileComponents();
  });

  afterEach(() => httpMock.verify());

  it('loads profile, KYC status, and rank progress independently on init', () => {
    init();
    expect(fixture.componentInstance.profile?.name).toBe('Left Kumar');
    expect(fixture.componentInstance.kycStatus?.kycStatus).toBe('VERIFIED');
    expect(fixture.componentInstance.rankProgress?.currentRank).toBe('Silver');
  });

  it('renders the header identity strip with name, associate ID, joined date, and KYC status', () => {
    init();
    const header: HTMLElement = fixture.nativeElement.querySelector('.my-account__header');
    expect(header.textContent).toContain('Left Kumar');
    expect(header.textContent).toContain('VP00001');
  });

  it('surfaces a profile load error independently of KYC and rank progress', () => {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    httpMock.expectOne('/api/associates/me/rank-progress').flush(rankProgress);
    httpMock.expectOne('/api/associates/me/id-card').flush(idCard);
    httpMock.expectOne('/api/company/profile/letterhead').flush(companyLetterhead);
    httpMock.expectOne('/api/associates/me/nominee').flush(nomineeResponse);
    httpMock.expectOne('/api/associates/me/transaction-password').flush(transactionPasswordNotSet);
    httpMock.expectOne('/api/associates/me/photo').flush(new Blob(['no photo']), { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(fixture.componentInstance.profileLoadError).toBeTrue();
  });

  it('surfaces a rank-progress load error independently of profile and KYC', () => {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    httpMock.expectOne('/api/associates/me/rank-progress').flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne('/api/associates/me/id-card').flush(idCard);
    httpMock.expectOne('/api/company/profile/letterhead').flush(companyLetterhead);
    httpMock.expectOne('/api/associates/me/nominee').flush(nomineeResponse);
    httpMock.expectOne('/api/associates/me/transaction-password').flush(transactionPasswordNotSet);
    httpMock.expectOne('/api/associates/me/photo').flush(new Blob(['no photo']), { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(fixture.componentInstance.rankLoadError).toBeTrue();
  });

  it('renders the current rank figure, next-rank line, and a progress bar width from rank progress', () => {
    init();
    const rankCard: HTMLElement = fixture.nativeElement.querySelector('.profile-hero__rank-plaque');
    expect(rankCard.textContent).toContain('Silver');
    expect(rankCard.textContent).toContain('Gold');
    const fill: HTMLElement = fixture.nativeElement.querySelector('.rank-card__bar-fill');
    expect(fill.style.width).toBe('2%');
  });

  it('renders a max-rank message instead of a next-rank line when nextRank is null', () => {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    httpMock.expectOne('/api/associates/me/rank-progress').flush({ ...rankProgress, nextRank: null, progressPercent: 100 });
    httpMock.expectOne('/api/associates/me/id-card').flush(idCard);
    httpMock.expectOne('/api/company/profile/letterhead').flush(companyLetterhead);
    httpMock.expectOne('/api/associates/me/nominee').flush(nomineeResponse);
    httpMock.expectOne('/api/associates/me/transaction-password').flush(transactionPasswordNotSet);
    httpMock.expectOne('/api/associates/me/photo').flush(new Blob(['no photo']), { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('myAccount.rank.maxRankReached');
  });

  it('shows the profile hero seal card with the associate userId as the code', () => {
    init();
    const code: HTMLElement = fixture.nativeElement.querySelector('.profile-hero__code');
    expect(code.textContent?.trim()).toBe('VP00001');
  });

  it('copies the verification code to the clipboard when "Copy code" is clicked', () => {
    init();
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    fixture.componentInstance.onCopyCode();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('VP00001');
  });

  it('falls back to initials on the hero avatar when no photo is uploaded', () => {
    init();
    expect(fixture.nativeElement.querySelector('.profile-hero__avatar--photo')).toBeFalsy();
    const avatar: HTMLElement = fixture.nativeElement.querySelector('.profile-hero__avatar');
    expect(avatar.textContent?.trim()).toBe('LK');
  });

  it('defaults to the Profile section when the route supplies no other tab', () => {
    init();
    expect(fixture.componentInstance.activeTab).toBe('profile');
    expect(fixture.nativeElement.querySelector('.detail-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.letter-card')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.bank-card')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.kyc-card')).toBeFalsy();
  });

  it('switches sections reactively when ActivatedRoute.data changes (sidebar sub-item navigation between sibling routes)', () => {
    init();
    switchTab('kyc');
    expect(fixture.componentInstance.activeTab).toBe('kyc');
    expect(fixture.nativeElement.querySelector('.kyc-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.detail-card')).toBeFalsy();

    switchTab('welcomeLetter');
    expect(fixture.componentInstance.activeTab).toBe('welcomeLetter');
    expect(fixture.nativeElement.querySelector('.letter-card')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.kyc-card')).toBeFalsy();
  });

  it('shows Rank, the hero, and the Download ID card action only on the Profile section', () => {
    init();
    expect(fixture.nativeElement.querySelector('.profile-hero__rank-plaque')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.profile-hero')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.my-account__header-actions')).toBeTruthy();

    switchTab('kyc');
    expect(fixture.nativeElement.querySelector('.profile-hero__rank-plaque')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.profile-hero')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.my-account__header-actions')).toBeFalsy();
  });

  it('shows the three in-page sub-tabs (Profile / Login Password / Transaction Password) on the Profile section only', () => {
    init();
    expect(fixture.nativeElement.querySelector('.profile-subtabs')).toBeTruthy();

    switchTab('kyc');
    expect(fixture.nativeElement.querySelector('.profile-subtabs')).toBeFalsy();
  });

  it('shows a "N field missing" chip on the contact detail section when phone or email is blank', () => {
    init();
    const chip: HTMLElement | null = fixture.nativeElement.querySelector('.detail-card__missing-chip');
    expect(chip?.textContent).toBeTruthy();
  });

  it('hides the missing-fields chip when phone and email are both present', () => {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushInitRequests({ ...profileResponse, phone: '9990001111' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.detail-card__missing-chip')).toBeFalsy();
  });

  it('submits the profile and nominee forms together via one Save Changes action', () => {
    init();
    fixture.componentInstance.form.patchValue({
      name: 'Left K. Kumar', phone: '9990002222', email: 'left.k@example.com', address: '42 Wallaby Way'
    });
    fixture.componentInstance.nomineeForm.patchValue({ nomineeName: 'Kajal Devi', relation: 'Wife' });
    fixture.componentInstance.onSaveChanges();

    const profileReq = httpMock.expectOne('/api/associates/me/profile');
    expect(profileReq.request.method).toBe('PUT');
    expect(profileReq.request.body.name).toBe('Left K. Kumar');
    expect(profileReq.request.body.address).toBe('42 Wallaby Way');
    profileReq.flush({ ...profileResponse, name: 'Left K. Kumar' });

    const nomineeReq = httpMock.expectOne('/api/associates/me/nominee');
    expect(nomineeReq.request.method).toBe('PUT');
    expect(nomineeReq.request.body).toEqual({ nomineeName: 'Kajal Devi', relation: 'Wife', transactionPassword: null });
    nomineeReq.flush({ nomineeName: 'Kajal Devi', relation: 'Wife', updatedAt: '2026-09-22T00:00:00Z' });

    expect(fixture.componentInstance.saveError).toBeUndefined();
    expect(fixture.componentInstance.saveSuccess).toBeTrue();
  });

  it('does not submit when the form is invalid (blank name)', () => {
    init();
    fixture.componentInstance.form.patchValue({ name: '' });
    fixture.componentInstance.onSaveChanges();

    httpMock.expectNone('/api/associates/me/profile');
  });

  it('surfaces a 409 email-conflict as a field-level error, read from the flat error body', () => {
    init();
    fixture.componentInstance.form.patchValue({ email: 'taken@example.com' });
    fixture.componentInstance.onSaveChanges();

    httpMock.expectOne('/api/associates/me/profile')
      .flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });
    flushPendingNomineeIfAny();

    expect(fixture.componentInstance.emailConflictError).toBe('Email already registered');
  });

  it('surfaces a 401 as an authorisation error when the transaction password gate rejects the save', () => {
    init();
    fixture.componentInstance.onSaveChanges();

    httpMock.expectOne('/api/associates/me/profile')
      .flush({ error: 'Transaction password is required to save these changes' }, { status: 401, statusText: 'Unauthorized' });
    flushPendingNomineeIfAny();

    expect(fixture.componentInstance.saveError).toBe('Transaction password is required to save these changes');
  });

  it('changes the login password via the Login Password sub-tab, reusing AuthService', () => {
    init();
    fixture.componentInstance.profileSubTab = 'loginPassword';
    fixture.detectChanges();
    fixture.componentInstance.loginPasswordForm.setValue({
      currentPassword: 'OldPass123!', newPassword: 'NewPass123!', confirmPassword: 'NewPass123!'
    });
    fixture.componentInstance.onLoginPasswordSubmit();

    const req = httpMock.expectOne('/api/associates/me/password');
    expect(req.request.method).toBe('POST');
    req.flush(null);

    expect(fixture.componentInstance.loginPasswordSaveSuccess).toBeTrue();
  });

  it('rejects a login-password submit when new and confirm do not match, without calling the API', () => {
    init();
    fixture.componentInstance.loginPasswordForm.setValue({
      currentPassword: 'OldPass123!', newPassword: 'NewPass123!', confirmPassword: 'Different123!'
    });
    fixture.componentInstance.onLoginPasswordSubmit();

    httpMock.expectNone('/api/associates/me/password');
    expect(fixture.componentInstance.loginPasswordSaveError).toBeTruthy();
  });

  it('sets a transaction password for the first time via the Transaction Password sub-tab', () => {
    init();
    fixture.componentInstance.profileSubTab = 'transactionPassword';
    fixture.detectChanges();
    fixture.componentInstance.transactionPasswordForm.setValue({
      currentTransactionPassword: '', newTransactionPassword: 'secret123', confirmTransactionPassword: 'secret123'
    });
    fixture.componentInstance.onTransactionPasswordSubmit();

    const req = httpMock.expectOne('/api/associates/me/transaction-password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ currentTransactionPassword: null, newTransactionPassword: 'secret123' });
    req.flush(null);

    httpMock.expectOne('/api/associates/me/transaction-password').flush({ isSet: true });

    expect(fixture.componentInstance.transactionPasswordSaveSuccess).toBeTrue();
  });

  it('uploads a selected photo and reloads the avatar as a blob', () => {
    init();
    const file = new File(['dummy'], 'photo.png', { type: 'image/png' });
    fixture.componentInstance.onPhotoSelected(file);

    const uploadReq = httpMock.expectOne('/api/associates/me/photo');
    expect(uploadReq.request.method).toBe('POST');
    uploadReq.flush(null);

    const reloadReq = httpMock.expectOne('/api/associates/me/photo');
    expect(reloadReq.request.method).toBe('GET');
    reloadReq.flush(new Blob(['fake image bytes'], { type: 'image/png' }));

    expect(fixture.componentInstance.photoObjectUrl).toBeTruthy();
  });

  it('removes the photo and reverts to the initials fallback', () => {
    init();
    fixture.componentInstance.photoObjectUrl = 'blob:existing';
    fixture.componentInstance.onRemovePhoto();

    const req = httpMock.expectOne('/api/associates/me/photo');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);

    expect(fixture.componentInstance.photoObjectUrl).toBeNull();
  });

  it('renders the Welcome Letter tab with static notes and the associate\'s own dynamic fields', () => {
    init();
    switchTab('welcomeLetter');

    const letter: HTMLElement = fixture.nativeElement.querySelector('.letter-card');
    expect(letter).toBeTruthy();
    expect(letter.textContent).toContain('VP00001');
    expect(letter.textContent).toContain('Left Kumar');
    expect(letter.textContent).toContain('myAccount.welcomeLetter.note1');
    expect(letter.textContent).toContain('myAccount.welcomeLetter.note9');
  });

  it('shows an em-dash for the associate\'s address on the Welcome Letter when none is on file', () => {
    init();
    switchTab('welcomeLetter');

    const letter: HTMLElement = fixture.nativeElement.querySelector('.letter-card');
    expect(letter.textContent).toContain('—');
  });

  it('renders the associate\'s own address on the Welcome Letter when present', () => {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    flushInitRequests({ ...profileResponse, address: '42 Wallaby Way' });
    fixture.detectChanges();
    switchTab('welcomeLetter');

    const letter: HTMLElement = fixture.nativeElement.querySelector('.letter-card');
    expect(letter.textContent).toContain('42 Wallaby Way');
  });

  it('renders the real company details in the Welcome Letter footer, not a hardcoded company name', () => {
    init();
    switchTab('welcomeLetter');

    const letter: HTMLElement = fixture.nativeElement.querySelector('.letter-card');
    expect(letter.textContent).toContain('Plotchain Estates');
    expect(letter.textContent).toContain('123 MG Road, Bengaluru');
    expect(letter.textContent).toContain('+919876543210');
    expect(letter.textContent).not.toContain('Samvardhani');
  });

  it('shows the company logo on the Welcome Letter when a square logo is configured', () => {
    const brandingBootstrap = TestBed.inject(BrandingBootstrapService);
    spyOn(brandingBootstrap, 'getLast').and.returnValue({
      displayName: 'Plotchain Estates', tagline: '', primaryColor: '#000', secondaryColor: '#000',
      hasSquareLogo: true, hasWideLogo: false
    });
    init();
    switchTab('welcomeLetter');

    const logo: HTMLImageElement | null = fixture.nativeElement.querySelector('.letter-card__logo');
    expect(logo).toBeTruthy();
    expect(logo?.src).toContain('/api/company/branding/logo/square');
  });

  it('omits the company logo on the Welcome Letter when no square logo is configured', () => {
    init();
    switchTab('welcomeLetter');

    expect(fixture.nativeElement.querySelector('.letter-card__logo')).toBeFalsy();
  });

  it('prints only the Welcome Letter when its Download button is clicked', () => {
    init();
    switchTab('welcomeLetter');
    spyOn(window, 'print');

    fixture.componentInstance.printWelcomeLetter();
    fixture.detectChanges();

    expect(window.print).toHaveBeenCalled();
    expect(fixture.componentInstance.printTarget).toBe('welcomeLetter');
    expect(fixture.nativeElement.querySelector('.my-account__print-letter')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.my-account__print-card')).toBeFalsy();
  });

  it('lazy-loads bank details on first switch to the Bank Details tab, not on init', () => {
    init();
    switchTab('bankDetails');

    httpMock.expectOne('/api/associates/me/bank-details').flush(bankDetailsResponse);
    expect(fixture.nativeElement.querySelector('.bank-card')).toBeTruthy();
  });

  it('does not re-fetch bank details on a second switch back to the Bank Details tab', () => {
    init();
    switchTab('bankDetails');
    httpMock.expectOne('/api/associates/me/bank-details').flush(bankDetailsResponse);

    switchTab('profile');
    switchTab('bankDetails');

    httpMock.expectNone('/api/associates/me/bank-details');
  });

  it('submits the bank details form via updateBankDetails on save', () => {
    init();
    switchTab('bankDetails');
    httpMock.expectOne('/api/associates/me/bank-details').flush(bankDetailsResponse);

    fixture.componentInstance.bankForm.patchValue({
      bankName: 'State Bank', accountHolder: 'Left Kumar', accountNumber: '123456789012',
      ifscCode: 'SBIN0001234', accountType: 'SAVINGS'
    });
    fixture.componentInstance.onBankSubmit();

    const req = httpMock.expectOne('/api/associates/me/bank-details');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      bankName: 'State Bank', accountHolder: 'Left Kumar', accountNumber: '123456789012',
      ifscCode: 'SBIN0001234', accountType: 'SAVINGS'
    });
    req.flush({ ...bankDetailsResponse, bankName: 'State Bank' });

    expect(fixture.componentInstance.bankSaveSuccess).toBeTrue();
  });

  it('does not submit the bank details form with a malformed IFSC code', () => {
    init();
    switchTab('bankDetails');
    httpMock.expectOne('/api/associates/me/bank-details').flush(bankDetailsResponse);

    fixture.componentInstance.bankForm.patchValue({
      bankName: 'State Bank', accountHolder: 'Left Kumar', accountNumber: '123456789012',
      ifscCode: 'not-an-ifsc', accountType: 'SAVINGS'
    });
    fixture.componentInstance.onBankSubmit();

    httpMock.expectNone('/api/associates/me/bank-details');
  });

  it('renders the KYC document count as uploaded/total', () => {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush({
      kycStatus: 'PENDING',
      documents: [{ documentType: 'AADHAAR', contentType: 'image/png', uploadedAt: '2026-08-01T00:00:00Z' }]
    });
    httpMock.expectOne('/api/associates/me/rank-progress').flush(rankProgress);
    httpMock.expectOne('/api/associates/me/id-card').flush(idCard);
    httpMock.expectOne('/api/company/profile/letterhead').flush(companyLetterhead);
    httpMock.expectOne('/api/associates/me/nominee').flush(nomineeResponse);
    httpMock.expectOne('/api/associates/me/transaction-password').flush(transactionPasswordNotSet);
    httpMock.expectOne('/api/associates/me/photo').flush(new Blob(['no photo']), { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    switchTab('kyc');

    const count: HTMLElement = fixture.nativeElement.querySelector('.kyc-card__count');
    expect(count.textContent?.trim()).toBe('1/3');
  });

  it('uploads a picked KYC document and refreshes status on success', () => {
    init();
    switchTab('kyc');
    const file = new File(['dummy'], 'aadhaar.png', { type: 'image/png' });
    fixture.componentInstance.onFileSelected('PAN', file);

    const uploadReq = httpMock.expectOne('/api/associates/me/kyc/documents/PAN');
    expect(uploadReq.request.method).toBe('POST');
    uploadReq.flush({ documentType: 'PAN', contentType: 'image/png', uploadedAt: '2026-08-14T00:00:00Z' });

    const refreshReq = httpMock.expectOne('/api/associates/me/kyc');
    refreshReq.flush({ kycStatus: 'PENDING', documents: [{ documentType: 'PAN', contentType: 'image/png', uploadedAt: '2026-08-14T00:00:00Z' }] });

    expect(fixture.componentInstance.kycUploadError).toBeUndefined();
  });

  it('surfaces a KYC upload error without refreshing status', () => {
    init();
    switchTab('kyc');
    const file = new File(['dummy'], 'aadhaar.gif', { type: 'image/gif' });
    fixture.componentInstance.onFileSelected('AADHAAR', file);

    httpMock.expectOne('/api/associates/me/kyc/documents/AADHAAR')
      .flush({ error: 'unsupported document content type: image/gif' }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.kycUploadError).toBe('unsupported document content type: image/gif');
    httpMock.expectNone('/api/associates/me/kyc');
  });

  it('embeds the digital ID card as a print-only child that loads its own data', () => {
    init();
    const printCard: HTMLElement = fixture.nativeElement.querySelector('.my-account__print-card');
    expect(printCard.querySelector('.digital-id-card__id-number')?.textContent?.trim()).toBe('VP00001');
  });

  it('prints the page when "Download ID card" is clicked', () => {
    init();
    spyOn(window, 'print');

    fixture.componentInstance.printIdCard();

    expect(window.print).toHaveBeenCalled();
  });
});
