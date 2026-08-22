import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateDirectoryComponent } from './associate-directory.component';

describe('AssociateDirectoryComponent', () => {
  let fixture: ComponentFixture<AssociateDirectoryComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // RouterTestingModule is required because the template uses [routerLink] (the "+ New
    // Associate" link) -- omitting it makes TestBed.createComponent throw NG02801 (no Router provider).
    await TestBed.configureTestingModule({
      imports: [AssociateDirectoryComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(AssociateDirectoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/company/compensation')
      .flush({ availableRanks: [{ id: 'r1', name: 'Sales Associate' }] });
    httpMock.expectOne('/api/associates')
      .flush([{ id: 'sponsor-1', userId: 'VP00002', name: 'Sunil Sponsor', role: 'ASSOCIATE' }]);
    httpMock.expectOne('/api/admin/associates?page=0&size=20')
      .flush({ associates: [{ id: 'a1', userId: 'VP00001', name: 'Jane', rankName: 'Sales Associate', kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', lastActiveAt: null }], page: 0, size: 20, totalElements: 1 });
  });

  afterEach(() => httpMock.verify());

  it('loads and displays the first page of associates', () => {
    expect(fixture.componentInstance.page?.associates.length).toBe(1);
    expect(fixture.componentInstance.page?.associates[0].userId).toBe('VP00001');
  });

  it('opens the detail panel and loads full detail on row selection', () => {
    fixture.componentInstance.selectAssociate('a1');

    const req = httpMock.expectOne('/api/admin/associates/a1');
    req.flush({
      id: 'a1', userId: 'VP00001', name: 'Jane', email: null, phone: null, rankName: 'Sales Associate',
      kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', lastActiveAt: null,
      sponsorId: null, sponsorUserId: null, parentId: null, parentUserId: null, position: null,
      directDownlineCount: 0, totalDownlineCount: 0, leftLegVolume: 0, rightLegVolume: 0
    });

    expect(fixture.componentInstance.selected?.userId).toBe('VP00001');
    expect(fixture.componentInstance.panelOpen).toBeTrue();
  });

  it('suspends the selected associate and refreshes detail', () => {
    fixture.componentInstance.selected = { id: 'a1', userId: 'VP00001', status: 'ACTIVE' } as any;

    fixture.componentInstance.suspendSelected();

    const req = httpMock.expectOne('/api/admin/associates/a1/suspend');
    req.flush({ id: 'a1', userId: 'VP00001', status: 'SUSPENDED' });

    const reloadReq = httpMock.expectOne('/api/admin/associates?page=0&size=20');
    reloadReq.flush({ associates: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.selected?.status).toBe('SUSPENDED');
  });

  it('reactivates the selected associate and refreshes detail', () => {
    fixture.componentInstance.selected = { id: 'a1', userId: 'VP00001', status: 'SUSPENDED' } as any;

    fixture.componentInstance.reactivateSelected();

    const req = httpMock.expectOne('/api/admin/associates/a1/reactivate');
    req.flush({ id: 'a1', userId: 'VP00001', status: 'ACTIVE' });

    const reloadReq = httpMock.expectOne('/api/admin/associates?page=0&size=20');
    reloadReq.flush({ associates: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.selected?.status).toBe('ACTIVE');
  });

  it('shows the one-time temporary password after a reset', () => {
    fixture.componentInstance.selected = { id: 'a1', userId: 'VP00001' } as any;

    fixture.componentInstance.resetPasswordForSelected();

    const req = httpMock.expectOne('/api/admin/associates/a1/reset-password');
    req.flush({ temporaryPassword: 'Temp1234!' });

    expect(fixture.componentInstance.temporaryPassword).toBe('Temp1234!');
  });

  it('shows a load error when the page reload fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);

    const req = httpMock.expectOne('/api/admin/associates?page=1&size=20');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.associate-directory__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows an action error when suspend fails, without silently doing nothing', () => {
    fixture.componentInstance.selected = { id: 'a1', userId: 'VP00001', status: 'ACTIVE' } as any;

    fixture.componentInstance.suspendSelected();

    const req = httpMock.expectOne('/api/admin/associates/a1/suspend');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.associate-directory__action-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('loads available ranks for the rank filter dropdown', () => {
    expect(fixture.componentInstance.availableRanks).toEqual([{ id: 'r1', name: 'Sales Associate' }]);
  });

  it('changing the rank filter reloads page 0 with the rank param', () => {
    fixture.componentInstance.onRankChange('r1');

    const req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('rank') === 'r1' && r.params.get('page') === '0');
    expect(req.request.method).toBe('GET');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('changing the KYC status filter reloads page 0 with the kycStatus param', () => {
    fixture.componentInstance.onKycStatusChange('VERIFIED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('kycStatus') === 'VERIFIED' && r.params.get('page') === '0');
    expect(req.request.method).toBe('GET');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('changing the status filter reloads page 0 with the status param', () => {
    fixture.componentInstance.onStatusChange('SUSPENDED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('status') === 'SUSPENDED' && r.params.get('page') === '0');
    expect(req.request.method).toBe('GET');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('changing joinedFrom/joinedTo reloads page 0 with both params', () => {
    fixture.componentInstance.onJoinedFromChange('2026-01-01');
    let req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('joinedFrom') === '2026-01-01');
    expect(req.request.method).toBe('GET');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onJoinedToChange('2026-06-30');
    req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('joinedFrom') === '2026-01-01' && r.params.get('joinedTo') === '2026-06-30');
    expect(req.request.method).toBe('GET');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('an empty filter value omits that param instead of sending an empty string', () => {
    fixture.componentInstance.onRankChange('');

    const req = httpMock.expectOne('/api/admin/associates?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows a rank load error when the ranks fetch fails, without silently doing nothing', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AssociateDirectoryComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    const isolatedFixture = TestBed.createComponent(AssociateDirectoryComponent);
    const isolatedHttpMock = TestBed.inject(HttpTestingController);
    isolatedFixture.detectChanges();

    isolatedHttpMock.expectOne('/api/company/compensation')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    isolatedHttpMock.expectOne('/api/associates')
      .flush([]);
    isolatedHttpMock.expectOne('/api/admin/associates?page=0&size=20')
      .flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    isolatedFixture.detectChanges();

    expect(isolatedFixture.componentInstance.rankLoadError).toBe(true);
    const errorEl: HTMLElement | null = isolatedFixture.nativeElement.querySelector('.associate-directory__rank-load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();

    isolatedHttpMock.verify();
  });

  it('shows an empty-state row when no associates match', () => {
    fixture.componentInstance.onRankChange('r1');
    httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('rank') === 'r1')
      .flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking a rendered row opens the detail panel for that associate', () => {
    fixture.detectChanges();

    const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
    bodyRows[0].click();

    const req = httpMock.expectOne('/api/admin/associates/a1');
    req.flush({
      id: 'a1', userId: 'VP00001', name: 'Jane', email: null, phone: null, rankName: 'Sales Associate',
      kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', lastActiveAt: null,
      sponsorId: null, sponsorUserId: null, parentId: null, parentUserId: null, position: null,
      directDownlineCount: 0, totalDownlineCount: 0, leftLegVolume: 0, rightLegVolume: 0
    });

    expect(fixture.componentInstance.selected?.userId).toBe('VP00001');
    expect(fixture.componentInstance.panelOpen).toBeTrue();
  });

  describe('New Associate provisioning modal', () => {
    it('opens the modal instead of navigating, via the New Associate button', () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.associate-directory__modal-overlay')).toBeNull();

      const newAssociateButton: HTMLButtonElement = fixture.nativeElement.querySelector('.associate-directory__new-link');
      expect(newAssociateButton.tagName).toBe('BUTTON');
      newAssociateButton.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.modalOpen).toBeTrue();
      expect(fixture.nativeElement.querySelector('.associate-directory__modal-overlay')).not.toBeNull();
    });

    it('does not submit when required fields are blank', () => {
      fixture.componentInstance.openProvisionModal();

      fixture.componentInstance.onProvisionSubmit();

      httpMock.expectNone('/api/associates');
      expect(fixture.componentInstance.provisionForm.invalid).toBeTrue();
    });

    it('resolves the typed sponsor search text to the matching associate id', () => {
      fixture.componentInstance.openProvisionModal();
      fixture.componentInstance.sponsorOptions = [
        { id: 'sponsor-1', userId: 'VP00002', name: 'Sunil Sponsor', role: 'ASSOCIATE' }
      ];

      fixture.componentInstance.onSponsorSearchInput('VP00002 — Sunil Sponsor');
      expect(fixture.componentInstance.selectedSponsorId).toBe('sponsor-1');

      fixture.componentInstance.onSponsorSearchInput('not a real match');
      expect(fixture.componentInstance.selectedSponsorId).toBeNull();
    });

    it('submits name/email/phone/sponsorId and shows the temporary password on success, without exposing parentId/position fields', () => {
      fixture.componentInstance.openProvisionModal();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '+919876500000',
        sponsorSearch: 'VP00002 — Sunil Sponsor'
      });
      fixture.componentInstance.selectedSponsorId = 'sponsor-1';

      fixture.componentInstance.onProvisionSubmit();

      const req = httpMock.expectOne('/api/associates');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '+919876500000',
        sponsorId: 'sponsor-1'
      });
      req.flush({ associateId: 'new-id', userId: 'VP00099', temporaryPassword: 'Temp1234!' });

      expect(fixture.componentInstance.provisioned?.temporaryPassword).toBe('Temp1234!');

      fixture.componentInstance.finishProvisioning();

      expect(fixture.componentInstance.modalOpen).toBeFalse();
      const reloadReq = httpMock.expectOne('/api/admin/associates?page=0&size=20');
      reloadReq.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    });

    it('shows a taken-email message on a 409 conflict instead of silently doing nothing', () => {
      fixture.componentInstance.openProvisionModal();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '',
        sponsorSearch: ''
      });

      fixture.componentInstance.onProvisionSubmit();

      const req = httpMock.expectOne('/api/associates');
      req.flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });

      expect(fixture.componentInstance.provisionSubmitError).toBeTruthy();
      expect(fixture.componentInstance.provisioned).toBeNull();
    });

    it('blocks submit and flags the field when the sponsor text matches no associate', () => {
      fixture.componentInstance.openProvisionModal();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '',
        sponsorSearch: 'Sunil Spons'
      });
      fixture.componentInstance.onSponsorSearchInput('Sunil Spons');
      expect(fixture.componentInstance.selectedSponsorId).toBeNull();

      fixture.componentInstance.onProvisionSubmit();

      httpMock.expectNone('/api/associates');
      expect(fixture.componentInstance.sponsorUnresolved).toBeTrue();
      expect(fixture.componentInstance.sponsorFieldError()).toBeTruthy();
    });

    it('still allows submit with a blank sponsor field (sponsor is optional)', () => {
      fixture.componentInstance.openProvisionModal();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '',
        sponsorSearch: '   '
      });

      fixture.componentInstance.onProvisionSubmit();

      const req = httpMock.expectOne('/api/associates');
      expect(req.request.body.sponsorId).toBeUndefined();
      expect(fixture.componentInstance.sponsorUnresolved).toBeFalse();
      req.flush({ associateId: 'new-id', userId: 'VP00099', temporaryPassword: 'Temp1234!' });
    });

    it('clears the unresolved-sponsor error once the field is edited again', () => {
      fixture.componentInstance.openProvisionModal();
      fixture.componentInstance.sponsorUnresolved = true;

      fixture.componentInstance.onSponsorSearchInput('VP00002 — Sunil Sponsor');

      expect(fixture.componentInstance.sponsorUnresolved).toBeFalse();
      expect(fixture.componentInstance.sponsorFieldError()).toBeUndefined();
    });
  });

  describe('pagination controls', () => {
    it('renders Previous/Next as real, natively-disable-able buttons', () => {
      fixture.detectChanges();

      const actions: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.associate-directory__pagination-action')
      );
      expect(actions.length).toBe(2);
      actions.forEach(action => expect(action.tagName).toBe('BUTTON'));
      // Single page of results: both ends are at their bound, so both are natively disabled
      // (not merely dimmed by a CSS-only modifier class the way they used to be).
      expect(actions[0].disabled).toBeTrue();
      expect(actions[1].disabled).toBeTrue();
    });

    it('advances a page when Next is clicked', () => {
      fixture.componentInstance.page = { associates: [], page: 0, size: 20, totalElements: 45 } as any;
      fixture.detectChanges();

      const actions: HTMLButtonElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('.associate-directory__pagination-action')
      );
      expect(actions[1].disabled).toBeFalse();
      actions[1].click();

      httpMock.expectOne('/api/admin/associates?page=1&size=20')
        .flush({ associates: [], page: 1, size: 20, totalElements: 45 });
      expect(fixture.componentInstance.page?.page).toBe(1);
    });
  });
});
