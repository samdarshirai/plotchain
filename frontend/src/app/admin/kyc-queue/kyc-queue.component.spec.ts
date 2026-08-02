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
          tabPending: 'Pending',
          tabVerified: 'Verified',
          tabRejected: 'Rejected',
          columnUserId: 'Associate ID',
          columnName: 'Name',
          columnJoinedAt: 'Joined',
          columnActions: 'Actions',
          approveAction: 'Approve',
          rejectAction: 'Reject',
          rejectReasonPlaceholder: 'Reason for rejection',
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

  it('rejects an entry with a reason', () => {
    fixture.componentInstance.rejectReasons['a1'] = 'Blurry PAN photo';
    fixture.componentInstance.reject('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Blurry PAN photo' });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'REJECTED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    httpMock.expectOne('/api/admin/kyc/counts').flush({ pending: 0, verified: 0, rejected: 0 });
  });

  it('keeps each row\'s reject reason independent, so rejecting one leaves the other untouched', () => {
    fixture.componentInstance.rejectReasons['a1'] = 'Blurry PAN photo';
    fixture.componentInstance.rejectReasons['a2'] = 'Name mismatch';

    fixture.componentInstance.reject('a1');

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Blurry PAN photo' });
    req.flush({ id: 'a1', userId: 'VP00001', name: 'Jane', kycStatus: 'REJECTED', joinedAt: '2026-01-01T00:00:00Z' });

    const reload = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    reload.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    httpMock.expectOne('/api/admin/kyc/counts').flush({ pending: 0, verified: 0, rejected: 0 });

    expect(fixture.componentInstance.rejectReasons['a1']).toBeUndefined();
    expect(fixture.componentInstance.rejectReasons['a2']).toBe('Name mismatch');
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
    fixture.componentInstance.rejectReasons['a1'] = 'Blurry PAN photo';
    fixture.componentInstance.reject('a1');

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

  it('only includes the actions column on the PENDING tab', () => {
    expect(fixture.componentInstance.kycColumns.some(c => c.key === 'actions')).toBeTrue();

    fixture.componentInstance.onTabChange('VERIFIED');
    httpMock.expectOne('/api/admin/kyc?status=VERIFIED&page=0&size=20')
      .flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    expect(fixture.componentInstance.kycColumns.some(c => c.key === 'actions')).toBeFalse();
  });

  it('approve button in the rendered action cell calls approve with the row entry id', () => {
    fixture.detectChanges();
    const spy = spyOn(fixture.componentInstance, 'approve');

    const approveButton: HTMLButtonElement = fixture.nativeElement.querySelector('.kyc-queue__approve-action');
    approveButton.click();

    expect(spy).toHaveBeenCalledWith('a1');
  });

  it('accumulates sequential keystrokes in the reject-reason input instead of resetting on every change-detection cycle (regression)', () => {
    // Before the fix, kycRows/kycColumns were getters that produced brand-new
    // array/object identities on every CD tick. With no trackBy on the editable-table's
    // *ngFor, that meant every ngModel-driven CD run (triggered automatically by zone.js
    // right after the `input` event) tore down and rebuilt the row, including this same
    // <input>. The net effect: an admin could type exactly one character before focus
    // (and the DOM node) was destroyed out from under them. This test grabs the input
    // element ONCE, dispatches two real `input` events against that same reference with a
    // detectChanges() in between (forcing the CD cycle the bug depends on), and asserts
    // the model ends up with the full accumulated string. If the row were torn down
    // between events, the second dispatch would land on a detached, delistened node and
    // the second keystroke would be silently lost.
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="text"]');
    expect(input).toBeTruthy();

    input.value = 'B';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    input.value = 'Bl';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.rejectReasons['a1']).toBe('Bl');
  });
});
