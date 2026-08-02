import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateDirectoryComponent } from './associate-directory.component';

describe('AssociateDirectoryComponent', () => {
  let fixture: ComponentFixture<AssociateDirectoryComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssociateDirectoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(AssociateDirectoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

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
});
