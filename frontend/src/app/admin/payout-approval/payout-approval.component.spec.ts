import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PayoutApprovalComponent } from './payout-approval.component';

describe('PayoutApprovalComponent', () => {
  let fixture: ComponentFixture<PayoutApprovalComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    // RouterTestingModule is required because the template uses [routerLink] (the "+ Submit
    // Withdrawal" link) -- omitting it makes TestBed.createComponent throw NG02801 (no Router
    // provider), same as sales-register.component.spec.ts's own precedent.
    await TestBed.configureTestingModule({
      imports: [PayoutApprovalComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PayoutApprovalComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([
      { id: 'a1', userId: 'VP00001', name: 'Jane Doe' }
    ]);
    httpMock.expectOne('/api/admin/withdrawals?page=0&size=20').flush({
      requests: [
        {
          id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
          amount: 5000, status: 'REQUESTED', reason: null, bankReference: null,
          requestedAt: '2026-08-15T00:00:00Z', decidedAt: null, disbursedAt: null
        }
      ],
      page: 0, size: 20, totalElements: 1
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of the queue on init', () => {
    expect(fixture.componentInstance.page?.requests.length).toBe(1);
  });

  it('reloads with the associate filter when it changes', () => {
    fixture.componentInstance.onAssociateIdChange('a1');

    const req = httpMock.expectOne(r => r.url === '/api/admin/withdrawals' && r.params.get('associateId') === 'a1');
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the status filter when it changes', () => {
    fixture.componentInstance.onStatusChange('APPROVED');

    const req = httpMock.expectOne(r => r.url === '/api/admin/withdrawals' && r.params.get('status') === 'APPROVED');
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('combines associate and status filters', () => {
    fixture.componentInstance.onAssociateIdChange('a1');
    httpMock.expectOne(r => r.params.get('associateId') === 'a1').flush({ requests: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onStatusChange('DISBURSED');
    const req = httpMock.expectOne(
      r => r.url === '/api/admin/withdrawals' && r.params.get('associateId') === 'a1' && r.params.get('status') === 'DISBURSED'
    );
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows a load error when the reload fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/admin/withdrawals?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.payout-approval__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/admin/withdrawals?page=1&size=20');
    req.flush({ requests: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when no requests match', () => {
    fixture.componentInstance.onStatusChange('REJECTED');
    httpMock.expectOne(r => r.params.get('status') === 'REJECTED').flush({ requests: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('formats the associate column as "userId — name"', () => {
    expect(fixture.componentInstance.registerRows[0]['associate']).toBe('VP00001 — Jane Doe');
  });
});
