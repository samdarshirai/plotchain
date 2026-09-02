import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { KycQueueComponent } from './kyc-queue.component';

describe('KycQueueComponent', () => {
  let fixture: ComponentFixture<KycQueueComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycQueueComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(KycQueueComponent);
    httpMock = TestBed.inject(HttpTestingController);

    const translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.setTranslation('en', {
      admin: {
        kycQueue: {
          title: 'KYC Review Queue',
          eyebrow: 'Network / Compliance',
          lastSynced: 'Last synced {{time}}',
          sealLabel: 'Awaiting review',
          sealOldestHint: 'oldest pending {{days}} days',
          tabPending: 'Pending',
          tabVerified: 'Verified',
          tabRejected: 'Rejected',
          columnUserId: 'Associate ID',
          columnName: 'Name',
          columnJoinedAt: 'Joined',
          columnActions: 'Actions',
          columnStatus: 'Status',
          approveAction: 'Approve',
          rejectAction: 'Reject',
          rejectReasonPlaceholder: 'Reason for rejection',
          rejectDrawerTitle: 'Rejecting {{id}} — {{name}}',
          reasonChipUnreadable: 'Document unreadable',
          reasonChipNameMismatch: 'Name mismatch',
          reasonChipExpiredId: 'Expired ID',
          reasonChipDuplicate: 'Duplicate associate',
          rejectConfirmAction: 'Confirm rejection',
          rejectCancelAction: 'Cancel',
          showingSummary: 'Showing {{shown}} of {{total}} {{status}}',
          loadError: 'Something went wrong loading the KYC queue. Try again.',
          decisionError: 'Could not save that decision. Please try again.',
          previousPageAction: 'Previous',
          nextPageAction: 'Next',
          pageIndicator: 'Page {{page}} of {{totalPages}}',
          emptyState: 'No entries in this status.'
        }
      }
    });
    translateService.use('en');

    fixture.detectChanges();

    httpMock.expectOne('/api/admin/kyc/counts')
      .flush({ pending: 1, verified: 4, rejected: 2 });
    httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20')
      .flush({ entries: [{ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'PENDING', joinedAt: '2026-01-01T00:00:00Z' }], page: 0, size: 20, totalElements: 1 });
  });

  afterEach(() => httpMock.verify());

  it('loads the pending queue by default', () => {
    expect(fixture.componentInstance.page?.entries.length).toBe(1);
    expect(fixture.componentInstance.activeStatus).toBe('PENDING');
  });

  it('reloads the queue when the status tab changes', () => {
    fixture.componentInstance.onTabChange('REJECTED');

    const req = httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.activeStatus).toBe('REJECTED');
  });

  it('shows a load error when the tab-change reload fails, without silently doing nothing', () => {
    fixture.componentInstance.onTabChange('REJECTED');

    const req = httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('approves an entry and removes it from the pending list', () => {
    fixture.componentInstance.approve('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'VERIFIED', reason: undefined });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'VERIFIED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    httpMock.expectOne('/api/admin/kyc/counts').flush({ pending: 0, verified: 0, rejected: 0 });
  });

  it('rejects an entry with a free-text reason from the drawer', () => {
    fixture.componentInstance.openReject('a1');
    fixture.detectChanges();

    const drawer: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__reject-drawer');
    expect(drawer?.textContent).toContain('VP00001');

    fixture.componentInstance.rejectDraft = 'Blurry PAN photo';
    fixture.componentInstance.confirmReject();

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Blurry PAN photo' });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'REJECTED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    httpMock.expectOne('/api/admin/kyc/counts').flush({ pending: 0, verified: 0, rejected: 0 });

    expect(fixture.componentInstance.rejectingId).toBeNull();
  });

  it('rejects with the selected reason chip when no free text is entered', () => {
    fixture.componentInstance.openReject('a1');
    fixture.componentInstance.selectChip('Name mismatch');
    fixture.componentInstance.confirmReject();

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Name mismatch' });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'REJECTED', joinedAt: '2026-01-01T00:00:00Z' });

    httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    httpMock.expectOne('/api/admin/kyc/counts').flush({ pending: 0, verified: 0, rejected: 0 });
  });

  it('does not submit a rejection with neither a chip nor free text', () => {
    fixture.componentInstance.openReject('a1');
    fixture.componentInstance.confirmReject();

    httpMock.expectNone('/api/admin/kyc/a1/decision');
    expect(fixture.componentInstance.rejectingId).toBe('a1');
  });

  it('cancelling the drawer discards the draft without a request', () => {
    fixture.componentInstance.openReject('a1');
    fixture.componentInstance.rejectDraft = 'typed something';
    fixture.componentInstance.cancelReject();

    httpMock.expectNone('/api/admin/kyc/a1/decision');
    expect(fixture.componentInstance.rejectingId).toBeNull();
    expect(fixture.componentInstance.rejectDraft).toBe('');
  });

  it('shows a decision error when approve fails, without silently doing nothing', () => {
    fixture.componentInstance.approve('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.decisionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__decision-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows a decision error when reject fails, without silently doing nothing', () => {
    fixture.componentInstance.openReject('a1');
    fixture.componentInstance.rejectDraft = 'Blurry PAN photo';
    fixture.componentInstance.confirmReject();

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    req.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.decisionError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__decision-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('clears a stale decision error once a subsequent list load succeeds', () => {
    fixture.componentInstance.approve('a1');
    httpMock.expectOne('/api/admin/kyc/a1/decision').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    expect(fixture.componentInstance.decisionError).toBe(true);

    fixture.componentInstance.onTabChange('REJECTED');
    httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.decisionError).toBe(false);
  });

  it('loads and displays queue counts on init', () => {
    expect(fixture.componentInstance.counts).toEqual({ pending: 1, verified: 4, rejected: 2 });
  });

  it('folds the queue counts into the tab labels', () => {
    const labels = fixture.componentInstance.tabs.map(t => t.label);
    expect(labels).toEqual(['Pending 1', 'Verified 4', 'Rejected 2']);
  });

  it('shows the awaiting-review count in the seal card', () => {
    fixture.detectChanges();
    const seal: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__seal-figure');
    expect(seal?.textContent?.trim()).toBe('1');
  });

  it('renders a "showing X of Y" summary for the loaded page', () => {
    fixture.detectChanges();
    const summary: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__summary');
    expect(summary?.textContent?.trim()).toBe('Showing 1 of 1 pending');
  });

  it('puts the summary and pagination in one footer row', () => {
    fixture.detectChanges();
    const footer: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__footer');
    expect(footer?.querySelector('.kyc-queue__summary')).toBeTruthy();
    expect(footer?.querySelector('.kyc-queue__pagination')).toBeTruthy();
  });

  it('reloads counts after an approval decision', () => {
    fixture.componentInstance.approve('a1');

    const decisionReq = httpMock.expectOne('/api/admin/kyc/a1/decision');
    decisionReq.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'VERIFIED', joinedAt: '2026-01-01T00:00:00Z' });

    httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    httpMock.expectOne('/api/admin/kyc/counts')
      .flush({ pending: 0, verified: 5, rejected: 2 });

    expect(fixture.componentInstance.counts).toEqual({ pending: 0, verified: 5, rejected: 2 });
  });

  it('computes a 1-based current page and total pages from the loaded page', () => {
    expect(fixture.componentInstance.currentPage).toBe(1);
    expect(fixture.componentInstance.totalPages).toBe(1);
  });

  it('renders Prev/Next buttons and a page indicator, Prev disabled on page 1', () => {
    fixture.detectChanges();

    const prevButton: HTMLButtonElement = fixture.nativeElement.querySelector('.kyc-queue__pagination button:first-child');
    expect(prevButton.disabled).toBeTrue();

    const indicator: HTMLElement = fixture.nativeElement.querySelector('.kyc-queue__page-indicator');
    expect(indicator.textContent).toContain('1');
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);

    const req = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=1&size=20');
    req.flush({ entries: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('shows an empty-state row when the queue has no entries', () => {
    fixture.componentInstance.onTabChange('REJECTED');
    httpMock.expectOne('/api/admin/kyc?status=REJECTED&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('drops the actions column off the PENDING tab and carries the status pill inline on Name', () => {
    expect(fixture.componentInstance.kycColumns.some(c => c.key === 'actions')).toBeTrue();
    expect(fixture.componentInstance.kycColumns.find(c => c.key === 'name')?.badgeKey).toBeUndefined();

    fixture.componentInstance.onTabChange('VERIFIED');
    httpMock.expectOne('/api/admin/kyc?status=VERIFIED&page=0&size=20')
      .flush({
        entries: [{ id: 'v1', userId: 'VP00002', name: 'Sam', kycStatus: 'VERIFIED', joinedAt: '2026-01-01T00:00:00Z' }],
        page: 0, size: 20, totalElements: 1
      });

    expect(fixture.componentInstance.kycColumns.some(c => c.key === 'actions')).toBeFalse();
    expect(fixture.componentInstance.kycColumns.some(c => c.key === 'status')).toBeFalse();
    const nameCol = fixture.componentInstance.kycColumns.find(c => c.key === 'name');
    expect(nameCol?.badgeKey).toBe('status');
    expect(nameCol?.badgeTone?.('Verified')).toBe('success');
    expect(fixture.componentInstance.kycRows[0]['status']).toBe('Verified');
  });

  it('maps kyc status to a badge tone', () => {
    expect(fixture.componentInstance.kycStatusBadgeTone('Verified')).toBe('success');
    expect(fixture.componentInstance.kycStatusBadgeTone('Rejected')).toBe('danger');
  });

  it('renders Reject/Approve inside the right-aligned row-actions stack', () => {
    fixture.detectChanges();
    const stack: HTMLElement | null = fixture.nativeElement.querySelector('.kyc-queue__row-actions');
    expect(stack?.querySelector('.kyc-queue__reject-action')).toBeTruthy();
    expect(stack?.querySelector('.kyc-queue__approve-action')).toBeTruthy();
  });

  it('approve button in the rendered action cell calls approve with the row entry id', () => {
    fixture.detectChanges();
    const spy = spyOn(fixture.componentInstance, 'approve');

    const approveButton: HTMLButtonElement = fixture.nativeElement.querySelector('.kyc-queue__approve-action');
    approveButton.click();

    expect(spy).toHaveBeenCalledWith('a1');
  });

  it('accumulates sequential keystrokes in the drawer reject-reason input', () => {
    fixture.componentInstance.openReject('a1');
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('.kyc-queue__reject-controls input[type="text"]');
    expect(input).toBeTruthy();

    input.value = 'B';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    input.value = 'Bl';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.rejectDraft).toBe('Bl');
  });
});
