import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MyAccountComponent } from './my-account.component';
import { AssociateProfileResponse } from '../profile-kyc/models/associate-profile.model';
import { AssociateKycStatusResponse } from '../profile-kyc/models/associate-kyc-status.model';
import { AssociateRankProgress } from './models/associate-rank-progress.model';
import { AssociateIdCard } from './models/associate-id-card.model';

// Consolidates ProfileKycComponent + RewardsComponent + DigitalIdCardComponent (role-capability /
// income-ledger units) into one "My Account" screen per Account Consolidation.dc.html (claude.ai
// design project cfbfc37d-4de7-4f26-8b81-923167ca3d33). Profile/KYC/rank-progress each fire their
// own independent GET on init (own error surface each, matching each source component's original
// independent-failure behavior). DigitalIdCardComponent is embedded unmodified as a print-only
// child (hidden on screen, shown under @media print) -- it keeps its own self-fetching ngOnInit,
// so its GET /api/associates/me/id-card fires on init too, one component boundary down.
describe('MyAccountComponent', () => {
  let fixture: ComponentFixture<MyAccountComponent>;
  let httpMock: HttpTestingController;

  const profileResponse: AssociateProfileResponse = {
    id: 'a1', userId: 'VP00001', name: 'Left Kumar', phone: null,
    email: 'left@example.com', joinedAt: '2026-09-02T00:00:00Z'
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

  function init(): void {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    httpMock.expectOne('/api/associates/me/rank-progress').flush(rankProgress);
    httpMock.expectOne('/api/associates/me/id-card').flush(idCard);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyAccountComponent, HttpClientTestingModule, TranslateModule.forRoot()]
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
    fixture.detectChanges();

    expect(fixture.componentInstance.rankLoadError).toBeTrue();
  });

  it('renders the current rank figure, next-rank line, and a progress bar width from rank progress', () => {
    init();
    const rankCard: HTMLElement = fixture.nativeElement.querySelector('.rank-card');
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
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('myAccount.rank.maxRankReached');
  });

  it('shows the verification card with the associate userId as the code', () => {
    init();
    const code: HTMLElement = fixture.nativeElement.querySelector('.verification-card__code');
    expect(code.textContent?.trim()).toBe('VP00001');
  });

  it('copies the verification code to the clipboard when "Copy code" is clicked', () => {
    init();
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    fixture.componentInstance.onCopyCode();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('VP00001');
  });

  it('shows a "N field missing" chip on the contact card when phone or email is blank', () => {
    init();
    const chip: HTMLElement | null = fixture.nativeElement.querySelector('.contact-card__missing-chip');
    expect(chip?.textContent).toBeTruthy();
  });

  it('hides the missing-fields chip when phone and email are both present', () => {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush({ ...profileResponse, phone: '9990001111' });
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    httpMock.expectOne('/api/associates/me/rank-progress').flush(rankProgress);
    httpMock.expectOne('/api/associates/me/id-card').flush(idCard);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.contact-card__missing-chip')).toBeFalsy();
  });

  it('submits the edited name/phone/email via updateProfile on save', () => {
    init();
    fixture.componentInstance.form.patchValue({ name: 'Left K. Kumar', phone: '9990002222', email: 'left.k@example.com' });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/associates/me/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Left K. Kumar', phone: '9990002222', email: 'left.k@example.com' });
    req.flush({ ...profileResponse, name: 'Left K. Kumar' });

    expect(fixture.componentInstance.saveError).toBeUndefined();
  });

  it('does not submit when the form is invalid (blank name)', () => {
    init();
    fixture.componentInstance.form.patchValue({ name: '' });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/associates/me/profile');
  });

  it('surfaces a 409 email-conflict as a field-level error, read from the flat error body', () => {
    init();
    fixture.componentInstance.form.patchValue({ email: 'taken@example.com' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/profile')
      .flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.emailConflictError).toBe('Email already registered');
  });

  it('renders a disabled bank-details placeholder with no input fields (known data-model gap)', () => {
    init();
    const bank: HTMLElement | null = fixture.nativeElement.querySelector('.contact-card__bank-placeholder');
    expect(bank).toBeTruthy();
    expect(bank?.querySelectorAll('input').length).toBe(0);
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
    fixture.detectChanges();

    const count: HTMLElement = fixture.nativeElement.querySelector('.kyc-card__count');
    expect(count.textContent?.trim()).toBe('1/3');
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

  it('surfaces a KYC upload error without refreshing status', () => {
    init();
    const file = new File(['dummy'], 'aadhaar.gif', { type: 'image/gif' });
    fixture.componentInstance.onFileSelected('AADHAAR', file);

    httpMock.expectOne('/api/associates/me/kyc/documents/AADHAAR')
      .flush({ error: 'unsupported document content type: image/gif' }, { status: 400, statusText: 'Bad Request' });

    expect(fixture.componentInstance.kycUploadError).toBe('unsupported document content type: image/gif');
    httpMock.expectNone('/api/associates/me/kyc');
  });

  it('renders the reward tiers table when tiers are configured', () => {
    fixture = TestBed.createComponent(MyAccountComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/profile').flush(profileResponse);
    httpMock.expectOne('/api/associates/me/kyc').flush(kycResponse);
    httpMock.expectOne('/api/associates/me/rank-progress').flush({
      ...rankProgress,
      rewardTiers: [{ tierLevel: 1, volumeThreshold: 1000, cashReward: 100, perkDescription: 'Tier 1', achieved: true }]
    });
    httpMock.expectOne('/api/associates/me/id-card').flush(idCard);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tiers-card__empty')).toBeFalsy();
    expect(fixture.componentInstance.tierRows.length).toBe(1);
  });

  it('shows the mockup empty-state copy on the reward tiers strip when no tiers are configured', () => {
    init();
    const empty: HTMLElement | null = fixture.nativeElement.querySelector('.tiers-card__empty');
    expect(empty?.textContent).toBeTruthy();
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
