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
    httpMock.expectOne('/api/admin/stats').flush({
      totalAssociates: 0,
      kycBreakdown: { pending: 0, verified: 0, rejected: 0 },
      totalWalletBalance: 0,
      pendingWithdrawals: 7,
      currentCycle: null,
      activePlots: 0,
      totalSalesRecorded: 0,
      cyclesCompleted: 0
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of the queue on init', () => {
    expect(fixture.componentInstance.page?.requests.length).toBe(1);
  });

  it('loads and shows the pending withdrawals count relocated from the dashboard', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.pendingWithdrawals).toBe(7);
    const stat: HTMLElement = fixture.nativeElement.querySelector('.payout-approval__stats .stat-tile__value');
    expect(stat.textContent).toContain('7');
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

  it('shows Approve and Reject actions for a REQUESTED row', () => {
    fixture.detectChanges();
    const approveButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.payout-approval__approve-action');
    const rejectButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.payout-approval__reject-action');
    expect(approveButton).toBeTruthy();
    expect(rejectButton).toBeTruthy();
  });

  it('approves a REQUESTED row with no reason and reloads the page', () => {
    fixture.componentInstance.approve('w1');

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    expect(req.request.body).toEqual({ decision: 'APPROVED', reason: undefined });
    req.flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'APPROVED', reason: null, bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
    });

    const reload = httpMock.expectOne('/api/admin/withdrawals?page=0&size=20');
    reload.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('rejects a REQUESTED row with a reason', () => {
    fixture.componentInstance.decisionReasons['w1'] = 'Duplicate request';
    fixture.componentInstance.reject('w1');

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Duplicate request' });
    req.flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REJECTED', reason: 'Duplicate request', bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
    });

    const reload = httpMock.expectOne('/api/admin/withdrawals?page=0&size=20');
    reload.flush({ requests: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.decisionReasons['w1']).toBeUndefined();
  });

  it('shows Cancel and Disburse actions for an APPROVED row', () => {
    fixture.componentInstance.onStatusChange('APPROVED');
    httpMock.expectOne(r => r.params.get('status') === 'APPROVED').flush({
      requests: [{
        id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
        amount: 5000, status: 'APPROVED', reason: null, bankReference: null,
        requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    const cancelButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.payout-approval__cancel-action');
    const disburseButton: HTMLButtonElement | null = fixture.nativeElement.querySelector('.payout-approval__disburse-action');
    expect(cancelButton).toBeTruthy();
    expect(disburseButton).toBeTruthy();
  });

  it('cancels an APPROVED row with a reason using the same decide() call as reject', () => {
    fixture.componentInstance.decisionReasons['w2'] = 'Associate requested cancellation';
    fixture.componentInstance.reject('w2');

    const req = httpMock.expectOne('/api/admin/withdrawals/w2/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Associate requested cancellation' });
    req.flush({
      id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REJECTED', reason: 'Associate requested cancellation', bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
    });

    httpMock.expectOne('/api/admin/withdrawals?page=0&size=20').flush({ requests: [], page: 0, size: 20, totalElements: 0 });
  });

  it('disburses an APPROVED row with a bank reference', () => {
    fixture.componentInstance.bankReferences['w2'] = 'NEFT-99887';
    fixture.componentInstance.disburse('w2');

    const req = httpMock.expectOne('/api/admin/withdrawals/w2/disburse');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ bankReference: 'NEFT-99887' });
    req.flush({
      id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'DISBURSED', reason: null, bankReference: 'NEFT-99887',
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: '2026-08-15T02:00:00Z'
    });

    httpMock.expectOne('/api/admin/withdrawals?page=0&size=20').flush({ requests: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.bankReferences['w2']).toBeUndefined();
  });

  it('shows no action buttons for a REJECTED or DISBURSED row', () => {
    fixture.componentInstance.onStatusChange('REJECTED');
    httpMock.expectOne(r => r.params.get('status') === 'REJECTED').flush({
      requests: [{
        id: 'w3', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
        amount: 5000, status: 'REJECTED', reason: 'No longer needed', bankReference: null,
        requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.payout-approval__approve-action')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.payout-approval__reject-action')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.payout-approval__cancel-action')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.payout-approval__disburse-action')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.payout-approval__status-tag')?.textContent?.trim()).toBeTruthy();
  });

  it('shows an action error when a decision fails, without silently doing nothing', () => {
    fixture.componentInstance.approve('w1');

    const req = httpMock.expectOne('/api/admin/withdrawals/w1/decision');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.payout-approval__action-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows an action error when a disburse fails, without silently doing nothing', () => {
    fixture.componentInstance.bankReferences['w2'] = 'NEFT-99887';
    fixture.componentInstance.disburse('w2');

    const req = httpMock.expectOne('/api/admin/withdrawals/w2/disburse');
    req.flush({ error: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.actionError).toBe(true);
  });

  it('keeps each row\'s reason/bank-reference state independent', () => {
    fixture.componentInstance.decisionReasons['w1'] = 'Reason for w1';
    fixture.componentInstance.decisionReasons['w2'] = 'Reason for w2';
    fixture.componentInstance.bankReferences['w2'] = 'NEFT-1';

    fixture.componentInstance.reject('w1');
    httpMock.expectOne('/api/admin/withdrawals/w1/decision').flush({
      id: 'w1', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
      amount: 5000, status: 'REJECTED', reason: 'Reason for w1', bankReference: null,
      requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
    });
    httpMock.expectOne('/api/admin/withdrawals?page=0&size=20').flush({ requests: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.decisionReasons['w1']).toBeUndefined();
    expect(fixture.componentInstance.decisionReasons['w2']).toBe('Reason for w2');
    expect(fixture.componentInstance.bankReferences['w2']).toBe('NEFT-1');
  });

  it('renders REQUESTED status as "Requested" with warning tone', () => {
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Requested');
    expect(rowText).not.toContain('REQUESTED');

    // The status column is the 3rd column (index 2); get its badge element
    const statusColumnCells = fixture.nativeElement.querySelectorAll('.editable-table tbody tr td');
    const statusCell = statusColumnCells[2];
    const badgeElement = statusCell.querySelector('.editable-table__badge');
    expect(badgeElement?.classList.contains('editable-table__badge--warning')).toBeTrue();
  });

  it('renders APPROVED status as "Approved" with success tone', () => {
    fixture.componentInstance.onStatusChange('APPROVED');
    httpMock.expectOne(r => r.params.get('status') === 'APPROVED').flush({
      requests: [{
        id: 'w2', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
        amount: 5000, status: 'APPROVED', reason: null, bankReference: null,
        requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Approved');
    expect(rowText).not.toContain('APPROVED');

    const statusColumnCells = fixture.nativeElement.querySelectorAll('.editable-table tbody tr td');
    const statusCell = statusColumnCells[2];
    const badgeElement = statusCell.querySelector('.editable-table__badge');
    expect(badgeElement?.classList.contains('editable-table__badge--success')).toBeTrue();
  });

  it('renders REJECTED status as "Rejected" with danger tone', () => {
    fixture.componentInstance.onStatusChange('REJECTED');
    httpMock.expectOne(r => r.params.get('status') === 'REJECTED').flush({
      requests: [{
        id: 'w3', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
        amount: 5000, status: 'REJECTED', reason: 'No longer needed', bankReference: null,
        requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: null
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Rejected');
    expect(rowText).not.toContain('REJECTED');

    const statusColumnCells = fixture.nativeElement.querySelectorAll('.editable-table tbody tr td');
    const statusCell = statusColumnCells[2];
    const badgeElement = statusCell.querySelector('.editable-table__badge');
    expect(badgeElement?.classList.contains('editable-table__badge--danger')).toBeTrue();
  });

  it('renders DISBURSED status as "Disbursed" with success tone', () => {
    fixture.componentInstance.onStatusChange('DISBURSED');
    httpMock.expectOne(r => r.params.get('status') === 'DISBURSED').flush({
      requests: [{
        id: 'w4', associateId: 'a1', associateUserId: 'VP00001', associateName: 'Jane Doe',
        amount: 5000, status: 'DISBURSED', reason: null, bankReference: 'NEFT-99887',
        requestedAt: '2026-08-15T00:00:00Z', decidedAt: '2026-08-15T01:00:00Z', disbursedAt: '2026-08-15T02:00:00Z'
      }],
      page: 0, size: 20, totalElements: 1
    });
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Disbursed');
    expect(rowText).not.toContain('DISBURSED');

    const statusColumnCells = fixture.nativeElement.querySelectorAll('.editable-table tbody tr td');
    const statusCell = statusColumnCells[2];
    const badgeElement = statusCell.querySelector('.editable-table__badge');
    expect(badgeElement?.classList.contains('editable-table__badge--success')).toBeTrue();
  });
});
