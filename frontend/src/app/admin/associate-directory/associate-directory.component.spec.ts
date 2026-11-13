import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateDirectoryComponent } from './associate-directory.component';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { NewAssociatePanelComponent } from '../new-associate-panel/new-associate-panel.component';

// loadCounts() fires 8 size-1 queries (total/active/suspended/kyc pending/green/red/left/right); answer each with
// a count derived from its query string so specs can assert on the seal card.
function flushCounts(httpMock: HttpTestingController, totals: Record<string, number> = {}): void {
  httpMock.match(r => r.url === '/api/admin/associates' && r.params.get('size') === '1').forEach(req => {
    const key = req.request.params.keys().filter(k => k !== 'page' && k !== 'size').map(k => `${k}=${req.request.params.get(k)}`).join('&');
    req.flush({ associates: [], page: 0, size: 1, totalElements: totals[key] ?? 0 });
  });
}

describe('AssociateDirectoryComponent', () => {
  let fixture: ComponentFixture<AssociateDirectoryComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // RouterTestingModule provides the Router / ActivatedRoute the component injects (the ?provision=1
    // auto-open path) -- omitting it makes TestBed.createComponent throw NG02801 (no Router provider).
    await TestBed.configureTestingModule({
      imports: [AssociateDirectoryComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(AssociateDirectoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/associates')
      .flush([{ id: 'sponsor-1', userId: 'VP00002', name: 'Sunil Sponsor', role: 'ASSOCIATE', hasFreeSlot: true }]);
    httpMock.expectOne('/api/admin/associates?page=0&size=100')
      .flush({ associates: [{ id: 'a1', userId: 'VP00001', name: 'Jane', designation: 'Sales Associate', kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', sponsorUserId: 'VP00000', position: 'L', lastActiveAt: null, role: 'ASSOCIATE' }], page: 0, size: 20, totalElements: 1 });
    flushCounts(httpMock, { '': 168, 'status=ACTIVE': 142, 'status=SUSPENDED': 26, 'kycStatus=PENDING': 11, 'kycStatus=VERIFIED': 100, 'excludeKycStatus=VERIFIED': 68, 'leg=L': 90, 'leg=R': 78 });
  });

  it('shows network counts on the seal card and tabs', () => {
    expect(fixture.componentInstance.counts).toEqual({ total: 168, active: 142, inactive: 26, kycPending: 11, green: 100, red: 68 });
    expect(fixture.componentInstance.viewTabs.map(t => t.count)).toEqual([168, 100, 68, 90, 78, 168]);
  });

  afterEach(() => httpMock.verify());

  it('marks a plot buyer in the name cell instead of adding a column', () => {
    fixture.componentInstance.loadPage();
    httpMock.expectOne('/api/admin/associates?page=0&size=100')
      .flush({ associates: [{ id: 'a1', userId: 'VP00001', name: 'Jane', designation: null, kycStatus: 'PENDING', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', sponsorUserId: 'VP00000', position: 'L', lastActiveAt: null, role: 'ASSOCIATE', plotBuyer: true }], page: 0, size: 20, totalElements: 1 });

    expect(fixture.componentInstance.directoryRows[0]['name']).toBe('Jane 🏞️');
    expect(fixture.componentInstance.directoryColumns.some(c => c.key === 'plotBuyer')).toBeFalse();
  });

  it('loads and displays the first page of associates', () => {
    expect(fixture.componentInstance.page?.associates.length).toBe(1);
    expect(fixture.componentInstance.page?.associates[0].userId).toBe('VP00001');
  });

  it('suspends the associate and reloads the page', () => {
    fixture.componentInstance.suspend('a1');

    const req = httpMock.expectOne('/api/admin/associates/a1/suspend');
    req.flush({ id: 'a1', userId: 'VP00001', status: 'SUSPENDED' });

    const reloadReq = httpMock.expectOne('/api/admin/associates?page=0&size=100');
    reloadReq.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    flushCounts(httpMock);

  });

  it('reactivates the associate and reloads the page', () => {
    fixture.componentInstance.reactivate('a1');

    const req = httpMock.expectOne('/api/admin/associates/a1/reactivate');
    req.flush({ id: 'a1', userId: 'VP00001', status: 'ACTIVE' });

    const reloadReq = httpMock.expectOne('/api/admin/associates?page=0&size=100');
    reloadReq.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    flushCounts(httpMock);

  });

  it('shows a load error when the page reload fails, without silently doing nothing', () => {
    fixture.componentInstance.loadPage();

    const req = httpMock.expectOne('/api/admin/associates?page=0&size=100');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.associate-directory__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows an action error when suspend fails, without silently doing nothing', () => {
    fixture.componentInstance.suspend('a1');

    const req = httpMock.expectOne('/api/admin/associates/a1/suspend');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.associate-directory__action-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('Green tab loads only VERIFIED associates', () => {
    fixture.componentInstance.onViewChange('green');

    const req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('kycStatus') === 'VERIFIED' && r.params.get('page') === '0');
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('Left and Right tabs filter by leg', () => {
    fixture.componentInstance.onViewChange('left');
    httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('leg') === 'L').flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    fixture.componentInstance.onViewChange('right');
    httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('leg') === 'R').flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('Red tab excludes VERIFIED associates', () => {
    fixture.componentInstance.onViewChange('red');

    const req = httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('excludeKycStatus') === 'VERIFIED' && !r.params.has('kycStatus'));
    req.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
  });

  it('By Date tab asks for newest first, and All clears the view filters', () => {
    fixture.componentInstance.onViewChange('byDate');
    httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('newestFirst') === 'true')
      .flush({ associates: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onViewChange('all');
    const req = httpMock.expectOne(r => r.url === '/api/admin/associates');
    expect(req.request.params.has('newestFirst')).toBe(false);
    expect(req.request.params.has('kycStatus')).toBe(false);
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

  it('shows an empty-state row when no associates match', () => {
    fixture.componentInstance.onSearchInput('nobody');
    httpMock.expectOne(r => r.url === '/api/admin/associates' && r.params.get('search') === 'nobody')
      .flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking a rendered row does nothing (no side panel)', () => {
    fixture.detectChanges();

    fixture.nativeElement.querySelectorAll('tbody tr')[0].click();

    httpMock.expectNone('/api/admin/associates/a1');
    expect(fixture.nativeElement.querySelector('app-side-panel')).toBeNull();
  });

  describe('Login-as-associate column', () => {
    const row = (id: string, name: string, role: string, status: string) =>
      ({ id, userId: 'VP' + id, name, designation: null, kycStatus: 'VERIFIED', status, joinedAt: '2026-01-01T00:00:00Z', sponsorUserId: null, position: null, lastActiveAt: null, role });

    function loadRows(): void {
      fixture.componentInstance.loadPage();
      httpMock.expectOne('/api/admin/associates?page=0&size=100').flush({
        associates: [row('a1', 'Jane', 'ASSOCIATE', 'ACTIVE'), row('a2', 'Root', 'ADMIN', 'ACTIVE'), row('a3', 'Sam', 'ASSOCIATE', 'SUSPENDED')],
        page: 0, size: 20, totalElements: 3
      });
      fixture.detectChanges();
    }
    const buttons = (): HTMLButtonElement[] => Array.from(fixture.nativeElement.querySelectorAll('.associate-directory__login'));

    it('renders the button only for non-suspended associates, not admins', () => {
      loadRows();
      const bodyRows = fixture.nativeElement.querySelectorAll('tbody tr');
      expect(buttons().length).toBe(1);
      expect(bodyRows[0].querySelector('.associate-directory__login')).not.toBeNull();
      expect(bodyRows[1].querySelector('.associate-directory__login')).toBeNull();
      expect(bodyRows[2].querySelector('.associate-directory__login')).toBeNull();
    });

    it('impersonates that row, opens /dashboard in a new tab and does not open the side panel', () => {
      loadRows();
      const impersonate = spyOn(TestBed.inject(AuthService), 'impersonate').and.returnValue(of({} as any));
      const tab = { location: { href: '' }, close: jasmine.createSpy('close') };
      const open = spyOn(window, 'open').and.returnValue(tab as unknown as Window);
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

      buttons()[0].click();

      expect(impersonate).toHaveBeenCalledWith('a1', 'Jane', tab as unknown as Window);
      expect(open).toHaveBeenCalledWith('', '_blank');
      expect(tab.location.href).toBe('/dashboard');
      expect(navigate).not.toHaveBeenCalled();
      httpMock.expectNone('/api/admin/associates/a1');
    });

    it('shows the error paragraph when impersonation fails', () => {
      loadRows();
      spyOn(TestBed.inject(AuthService), 'impersonate').and.returnValue(throwError(() => new Error('boom')));
      const tab = { location: { href: '' }, close: jasmine.createSpy('close') };
      spyOn(window, 'open').and.returnValue(tab as unknown as Window);
      const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

      buttons()[0].click();
      fixture.detectChanges();

      expect(navigate).not.toHaveBeenCalled();
      expect(tab.close).toHaveBeenCalled();
      expect(fixture.componentInstance.loginError).toBeTrue();
      expect(fixture.nativeElement.querySelector('.associate-directory__login-error')?.textContent?.trim()).toBeTruthy();
    });
  });

  describe('Recalculate button', () => {
    const row = (id: string, name: string, role: string, status: string) =>
      ({ id, userId: 'VP' + id, name, designation: null, kycStatus: 'VERIFIED', status, joinedAt: '2026-01-01T00:00:00Z', sponsorUserId: null, position: null, lastActiveAt: null, role });

    function loadRows(): void {
      fixture.componentInstance.loadPage();
      httpMock.expectOne('/api/admin/associates?page=0&size=100').flush({
        associates: [row('a1', 'Jane', 'ASSOCIATE', 'ACTIVE')],
        page: 0, size: 20, totalElements: 1
      });
      fixture.detectChanges();
    }
    it('has no Recalculate button in the row actions', () => {
      loadRows();
      const labels = Array.from(fixture.nativeElement.querySelectorAll('.associate-directory__row-actions button'))
        .map((b: any) => b.textContent.trim());
      expect(labels.length).toBeGreaterThan(0);
      expect(labels).not.toContain('Recalculate');
    });

    it('still posts recalculate via the handler/API', () => {
      loadRows();
      fixture.componentInstance.recalculate('a1');
      httpMock.expectOne({ method: 'POST', url: '/api/admin/associates/a1/recalculate' }).flush({});
      expect(fixture.componentInstance.recalculatedId).toBe('a1');
    });

    it('shows the action error when recalculate fails', () => {
      loadRows();
      fixture.componentInstance.recalculate('a1');
      httpMock.expectOne('/api/admin/associates/a1/recalculate').flush({}, { status: 500, statusText: 'boom' });
      expect(fixture.componentInstance.actionError).toBeTrue();
      expect(fixture.componentInstance.recalculatingId).toBeNull();
    });
  });

  describe('New Associate panel wiring', () => {
    it('opens the panel instead of navigating, via the New Associate button', () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.new-associate-panel__modal-overlay')).toBeNull();

      const newAssociateButton: HTMLButtonElement = fixture.nativeElement.querySelector('.associate-directory__new-link');
      expect(newAssociateButton.tagName).toBe('BUTTON');
      newAssociateButton.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.modalOpen).toBeTrue();
      expect(fixture.nativeElement.querySelector('.new-associate-panel__modal-overlay')).not.toBeNull();
    });

    it('closes the panel and reloads the page when the panel emits created', () => {
      fixture.componentInstance.openProvisionModal();
      fixture.detectChanges();

      const panel = fixture.debugElement.query(By.directive(NewAssociatePanelComponent)).componentInstance as NewAssociatePanelComponent;
      panel.created.emit({ associateId: 'new-id', userId: 'VP00099', temporaryPassword: 'Temp1234!', transactionPassword: 'Txn1234!' });

      const reloadReq = httpMock.expectOne('/api/admin/associates?page=0&size=100');
      reloadReq.flush({ associates: [], page: 0, size: 20, totalElements: 0 });
    flushCounts(httpMock);

      panel.closed.emit();
      expect(fixture.componentInstance.modalOpen).toBeFalse();
    });
  });

  describe('Edit (row action) + contact columns', () => {
    function loadRow(): void {
      fixture.componentInstance.loadPage();
      httpMock.expectOne('/api/admin/associates?page=0&size=100').flush({
        associates: [{ id: 'a1', userId: 'VP00001', name: 'Jane', designation: null, kycStatus: 'VERIFIED', status: 'ACTIVE',
          joinedAt: '2026-01-01T00:00:00Z', sponsorUserId: null, position: null, lastActiveAt: null, role: 'ASSOCIATE',
          phone: '9876543210', email: null }],
        page: 0, size: 20, totalElements: 1
      });
      fixture.detectChanges();
    }

    it('shows the Mobile column and no Email column', () => {
      loadRow();
      const keys = fixture.componentInstance.directoryColumns.map(c => c.key);
      expect(keys).toContain('phone');
      expect(keys).toContain('parentUserId');
      expect(keys).not.toContain('email');
      expect(fixture.componentInstance.directoryRows[0]['phone']).toBe('9876543210');
    });

    it('opens the pre-filled edit modal for that row without opening the side panel', () => {
      loadRow();
      fixture.nativeElement.querySelector('.associate-directory__edit').click();
      fixture.detectChanges();
      const panels = fixture.debugElement.queryAll(By.directive(NewAssociatePanelComponent));
      expect(panels.some(p => p.componentInstance.editAssociateId === 'a1')).toBeTrue();
      httpMock.expectOne('/api/admin/associates/a1').flush({});
      httpMock.expectOne('/api/admin/associates/a1/profile').flush({});
      httpMock.expectOne('/api/admin/associates/a1/nominee').flush({});
      httpMock.expectOne('/api/admin/associates/a1/bank-details').flush({});
    });
  });
});

describe('AssociateDirectoryComponent with ?provision=1', () => {
  it('auto-opens the provisioning modal and strips the query param', async () => {
    await TestBed.configureTestingModule({
      imports: [AssociateDirectoryComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ provision: '1' }) } }
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AssociateDirectoryComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    const navigateSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();

    httpMock.expectOne('/api/associates').flush([]);
    httpMock.expectOne('/api/admin/associates?page=0&size=100')
      .flush({ associates: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.modalOpen).toBeTrue();
    expect(navigateSpy).toHaveBeenCalled();
    flushCounts(httpMock);
    httpMock.verify();
  });

});
