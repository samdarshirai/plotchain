import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PayoutHistoryComponent } from './payout-history.component';

describe('PayoutHistoryComponent', () => {
  let fixture: ComponentFixture<PayoutHistoryComponent>;
  let httpMock: HttpTestingController;

  const sampleRequest = {
    id: 'w1',
    amount: 5000,
    status: 'DISBURSED',
    reason: null,
    bankReference: 'REF-123',
    requestedAt: '2026-01-05T00:00:00Z',
    decidedAt: '2026-01-06T00:00:00Z',
    disbursedAt: '2026-01-07T00:00:00Z'
  };

  function flushInitialRequests(
    wallet: Record<string, unknown> = { balance: 12500 },
    history: Record<string, unknown>[] = [sampleRequest]
  ): void {
    httpMock.expectOne('/api/associates/me/wallet').flush(wallet);
    httpMock
      .expectOne(r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '0')
      .flush({ requests: history, page: 0, size: 20, totalElements: history.length });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PayoutHistoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PayoutHistoryComponent);
    httpMock = TestBed.inject(HttpTestingController);

    const translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.setTranslation('en', {
      payoutHistory: {
        title: 'Payout History',
        subtitle: 'Your wallet balance and withdrawal request history.',
        walletBalanceLabel: 'Wallet Balance',
        walletLoadError: '—',
        walletLoadErrorHint: "Couldn't load your balance right now. Your request history below is unaffected.",
        statusFilterLabel: 'Status',
        statusFilterAllOption: 'All statuses',
        statusRequestedOption: 'Requested',
        statusApprovedOption: 'Approved',
        statusRejectedOption: 'Rejected',
        statusDisbursedOption: 'Disbursed',
        columnAmount: 'Amount',
        columnStatus: 'Status',
        columnReason: 'Reason',
        columnBankReference: 'Bank Reference',
        columnRequestedAt: 'Requested At',
        columnDecidedAt: 'Decided At',
        columnDisbursedAt: 'Disbursed At',
        emptyValuePlaceholder: '—',
        loadError: 'Something went wrong loading your payout history. Please try again.',
        emptyState: 'No withdrawal requests to show yet.',
        previousPageAction: 'Previous',
        nextPageAction: 'Next',
        pageIndicator: 'Page {{page}} of {{totalPages}}'
      }
    });
    translateService.use('en');

    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('loads the wallet balance and the first unfiltered page of my withdrawal history on init', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.walletBalance).toBe(12500);
    expect(fixture.componentInstance.page?.requests.length).toBe(1);
  });

  it('displays the wallet balance as formatted currency', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const balanceEl: HTMLElement = fixture.nativeElement.querySelector('.payout-history__balance-value');
    expect(balanceEl.textContent).toContain('12,500');
  });

  it('does not show the degraded balance card or error hint while the wallet lookup is still in flight', () => {
    const balanceCard: HTMLElement = fixture.nativeElement.querySelector('.payout-history__wallet-balance');
    expect(balanceCard.classList).not.toContain('payout-history__wallet-balance--degraded');
    const hintEl: HTMLElement | null = fixture.nativeElement.querySelector('.payout-history__balance-hint');
    expect(hintEl).toBeNull();

    httpMock.expectOne('/api/associates/me/wallet').flush({ balance: 12500 });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '0')
      .flush({ requests: [sampleRequest], page: 0, size: 20, totalElements: 1 });
  });

  it('degrades gracefully without blocking the table when the wallet lookup fails', () => {
    httpMock.expectOne('/api/associates/me/wallet').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '0')
      .flush({ requests: [sampleRequest], page: 0, size: 20, totalElements: 1 });
    fixture.detectChanges();

    expect(fixture.componentInstance.walletBalance).toBeNull();
    expect(fixture.componentInstance.loadError).toBe(false);
    expect(fixture.componentInstance.page?.requests.length).toBe(1);
  });

  it('shows a dimmed balance card with a hint line when the wallet lookup fails', () => {
    httpMock.expectOne('/api/associates/me/wallet').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '0')
      .flush({ requests: [sampleRequest], page: 0, size: 20, totalElements: 1 });
    fixture.detectChanges();

    const balanceCard: HTMLElement = fixture.nativeElement.querySelector('.payout-history__wallet-balance');
    expect(balanceCard.classList).toContain('payout-history__wallet-balance--degraded');
    const hintEl: HTMLElement | null = fixture.nativeElement.querySelector('.payout-history__balance-hint');
    expect(hintEl?.textContent?.trim()).toBeTruthy();
  });

  it('reloads with the status filter when the status dropdown changes, resetting to page 0', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('REJECTED');

    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/withdrawals' && r.params.get('status') === 'REJECTED' && r.params.get('page') === '0'
    );
    req.flush({ requests: [], page: 0, size: 20, totalElements: 0 });
    expect(fixture.componentInstance.page?.requests.length).toBe(0);
  });

  it('renders a dash for a null reason, decidedAt, and disbursedAt', () => {
    flushInitialRequests({ balance: 0 }, [
      { ...sampleRequest, id: 'w2', status: 'REQUESTED', bankReference: null, decidedAt: null, disbursedAt: null }
    ]);
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('—');
  });

  it('shows a bank reference once a request is DISBURSED', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('REF-123');
  });

  it('formats the amount column as currency, not a raw number', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('5,000');
    expect(rowText).not.toContain('5000');
  });

  it('shows a load error banner when the withdrawal history load fails, without touching the wallet balance', () => {
    httpMock.expectOne('/api/associates/me/wallet').flush({ balance: 12500 });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '0')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    expect(fixture.componentInstance.walletBalance).toBe(12500);
    const bannerEl: HTMLElement | null = fixture.nativeElement.querySelector('app-inline-banner.payout-history__load-error');
    expect(bannerEl).toBeTruthy();
    expect(bannerEl?.querySelector('.inline-banner--danger')).toBeTruthy();
  });

  it('shows an empty-state row when no withdrawal requests match', () => {
    flushInitialRequests({ balance: 0 }, []);
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    flushInitialRequests();
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/withdrawals' && r.params.get('page') === '1' && r.params.get('size') === '20'
    );
    req.flush({ requests: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('has no action column and no write inputs -- this screen is view-only', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.historyColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
  });
});
