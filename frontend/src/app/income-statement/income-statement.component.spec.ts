import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { IncomeStatementComponent } from './income-statement.component';

describe('IncomeStatementComponent', () => {
  let fixture: ComponentFixture<IncomeStatementComponent>;
  let httpMock: HttpTestingController;
  let translateService: TranslateService;
  let routeData$: BehaviorSubject<Record<string, unknown>>;

  const frColumnTranslations = {
    incomeStatement: {
      columnIncomeType: 'Type de revenu',
      columnCyclePeriod: 'Période',
      columnStatus: 'Statut',
      columnGrossAmount: 'Montant brut',
      columnTdsDeduction: 'Déduction TDS',
      columnAdminDeduction: 'Déduction admin',
      columnNetAmount: 'Montant net',
      columnSourceRef: 'Réf. source',
      columnCreatedAt: 'Créé le'
    }
  };

  const sampleEntry = {
    id: 'l1',
    incomeType: 'DIRECT',
    cycleId: 'c1',
    cyclePeriodStart: '2026-01-01',
    cyclePeriodEnd: '2026-01-31',
    grossAmount: 10000,
    tdsDeduction: 500,
    adminDeduction: 200,
    netAmount: 9300,
    status: 'PAID',
    sourceRef: 's1',
    createdAt: '2026-01-05T00:00:00Z'
  };

  const otherCycleEntry = {
    ...sampleEntry,
    id: 'l2',
    cycleId: 'c2',
    cyclePeriodStart: '2025-12-01',
    cyclePeriodEnd: '2025-12-31'
  };

  function flushInitialRequests(lookupEntries: unknown[] = [sampleEntry, otherCycleEntry]): void {
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '100')
      .flush({ entries: lookupEntries, page: 0, size: 100, totalElements: lookupEntries.length, totalGrossAmount: 0 });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '20')
      .flush({ entries: [sampleEntry], page: 0, size: 20, totalElements: 1, totalGrossAmount: 0 });
    httpMock.expectOne('/api/associates/me/profile').flush({ id: 'a1', userId: 'AS001', name: 'Test Associate' });
  }

  beforeEach(async () => {
    routeData$ = new BehaviorSubject<Record<string, unknown>>({ incomeType: 'ALL' });
    await TestBed.configureTestingModule({
      imports: [IncomeStatementComponent, HttpClientTestingModule, TranslateModule.forRoot()],
      providers: [{ provide: ActivatedRoute, useValue: { data: routeData$ } }]
    }).compileComponents();

    fixture = TestBed.createComponent(IncomeStatementComponent);
    httpMock = TestBed.inject(HttpTestingController);

    // Real translations registered explicitly (same pattern KycQueueComponent's spec uses) --
    // without this, translate.instant() calls (e.g. the noSourceRef fallback) resolve to their
    // raw key rather than actual copy, since TranslateModule.forRoot() loads no translation file
    // in tests.
    translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.setTranslation('fr', frColumnTranslations);
    translateService.setTranslation('en', {
      incomeStatement: {
        title: 'Income Statement',
        subtitle: 'Your itemized income history, by cycle and income type.',
        tabAll: 'All',
        tabDirect: 'Direct',
        tabMatching: 'Matching',
        tabSponsorMatching: 'Sponsor Matching',
        tabRoyalty: 'Royalty',
        tabReward: 'Reward',
        tabPerk: 'Perk',
        cycleFilterLabel: 'Cycle',
        cycleFilterAllOption: 'All cycles',
        statusFilterLabel: 'Status',
        statusFilterAllOption: 'All statuses',
        statusPendingOption: 'Pending',
        statusCarriedForwardOption: 'Carried Forward',
        statusPaidOption: 'Paid',
        statusReversedOption: 'Reversed',
        columnIncomeType: 'Income Type',
        columnCyclePeriod: 'Cycle Period',
        columnStatus: 'Status',
        columnGrossAmount: 'Gross Amount',
        columnTdsDeduction: 'TDS Deduction',
        columnAdminDeduction: 'Admin Deduction',
        columnNetAmount: 'Net Amount',
        columnSourceRef: 'Source Ref',
        columnCreatedAt: 'Created At',
        columnNewLeftBusiness: 'New Left Business', columnNewRightBusiness: 'New Right Business',
        columnNewMatchingBusiness: 'New Matching Business', columnRoyaltyBonus: 'Royalty Bonus',
        columnPeriod: 'Period', columnMatchingBusiness: 'Matching Business', columnMatchingIncome: 'Matching Income',
        columnMemberId: 'Member ID', columnSponsorMatchingIncome: 'Sponsor Matching Income',
        columnReward: 'Reward', columnRequiredLeft: 'Required Left Business', columnRequiredRight: 'Required Right Business',
        columnAchievedDate: 'Achieved Date', statusNotAchieved: 'Not Achieved',
        columnDesignation: 'Designation', columnDate: 'Date', columnPayStatus: 'Pay Status',
        columnPaymentDate: 'Payment Date', columnRemarks: 'Remarks', statusAchieved: 'Achieved', statusPending: 'Pending',
        statusInProgress: 'In progress', leftLeg: 'Left leg', rightLeg: 'Right leg', columnAchieved: 'Achieved', matchingSuffix: 'matching', payStatusPaid: 'Paid', payStatusUnpaid: 'Unpaid',
        bflbAbbr: 'BFLB', bfrbAbbr: 'BFRB', nlbAbbr: 'NLB', nrbAbbr: 'NRB', tlbAbbr: 'TLB', trbAbbr: 'TRB', clbAbbr: 'CLB', crbAbbr: 'CRB',
        bflbLegend: 'Back Forward Left Business', bfrbLegend: 'Back Forward Right Business', nlbLegend: 'New Left Business', nrbLegend: 'New Right Business',
        tlbLegend: 'Total Left Business', trbLegend: 'Total Right Business', clbLegend: 'Calculate Left Business', crbLegend: 'Calculate Right Business',
        noSourceRef: '—',
        loadError: 'Something went wrong loading your income statement. Please try again.',
        emptyState: 'No income entries match these filters.',
        previousPageAction: 'Previous',
        nextPageAction: 'Next',
        pageIndicator: 'Page {{page}} of {{totalPages}}'
      }
    });
    translateService.use('en');

    fixture.detectChanges();
  });

  afterEach(() => {
    // Tests that stop before flushInitialRequests() leave the profile lookup open.
    httpMock.match('/api/associates/me/profile').forEach(r => r.flush({ id: 'a1', userId: 'AS001', name: 'Test Associate' }));
    httpMock.verify();
  });

  it('loads the first unfiltered page of my ledger on init, with the All tab active', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.page?.entries.length).toBe(1);
    expect(fixture.componentInstance.activeIncomeType).toBe('ALL');
  });

  it('derives the cycle filter options from the unfiltered lookup, deduped by cycleId, newest first', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.cycles.map(c => c.cycleId)).toEqual(['c1', 'c2']);
  });

  it('omits a cycle option when its period dates are missing from the batch lookup', () => {
    flushInitialRequests([sampleEntry, { ...otherCycleEntry, cyclePeriodStart: null, cyclePeriodEnd: null }]);
    expect(fixture.componentInstance.cycles.map(c => c.cycleId)).toEqual(['c1']);
  });

  it('leaves the cycle dropdown empty without blocking the main table when the cycle lookup fails', () => {
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '100')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '20')
      .flush({ entries: [sampleEntry], page: 0, size: 20, totalElements: 1, totalGrossAmount: 0 });

    expect(fixture.componentInstance.cycles).toEqual([]);
    expect(fixture.componentInstance.loadError).toBe(false);
  });

  it('navigating to an income type route reloads with the incomeType filter and resets to page 0', () => {
    flushInitialRequests();
    routeData$.next({ incomeType: 'PERK' });

    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/ledger' && r.params.get('incomeType') === 'PERK' && r.params.get('page') === '0'
    );
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0, totalGrossAmount: 0 });
    expect(fixture.componentInstance.activeIncomeType).toBe('PERK');
  });

  it('reloads with the cycleId filter when the cycle dropdown changes', () => {
    flushInitialRequests();
    fixture.componentInstance.onCycleIdChange('c2');

    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('cycleId') === 'c2');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0, totalGrossAmount: 0 });
  });

  it('reloads with the status filter when the status dropdown changes', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('REVERSED');

    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('status') === 'REVERSED');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0, totalGrossAmount: 0 });
  });

  it('combines tab, cycle, and status filters into one request', () => {
    flushInitialRequests();
    routeData$.next({ incomeType: 'MATCHING' });
    httpMock.expectOne(r => r.params.get('incomeType') === 'MATCHING').flush({ entries: [], page: 0, size: 20, totalElements: 0, totalGrossAmount: 0 });

    fixture.componentInstance.onCycleIdChange('c1');
    httpMock.expectOne(r => r.params.get('cycleId') === 'c1').flush({ entries: [], page: 0, size: 20, totalElements: 0, totalGrossAmount: 0 });

    fixture.componentInstance.onStatusChange('PAID');
    const req = httpMock.expectOne(
      r => r.params.get('incomeType') === 'MATCHING' && r.params.get('cycleId') === 'c1' && r.params.get('status') === 'PAID'
    );
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0, totalGrossAmount: 0 });
  });

  it('shows the resolved cycle period dates in each row, not a raw cycle UUID', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('01 Jan 2026');
    expect(rowText).not.toContain('c1');
  });

  it('shows a load error when the initial page load fails, without silently doing nothing', () => {
    httpMock.expectOne(r => r.params.get('size') === '100').flush({ entries: [], page: 0, size: 100, totalElements: 0, totalGrossAmount: 0 });
    httpMock
      .expectOne(r => r.params.get('size') === '20')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.income-statement__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('renders the load error through InlineBannerComponent with tone danger, not a plain paragraph', () => {
    httpMock.expectOne(r => r.params.get('size') === '100').flush({ entries: [], page: 0, size: 100, totalElements: 0, totalGrossAmount: 0 });
    httpMock
      .expectOne(r => r.params.get('size') === '20')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const bannerEl: HTMLElement | null = fixture.nativeElement.querySelector('app-inline-banner.income-statement__load-error');
    expect(bannerEl).toBeTruthy();
    expect(bannerEl?.querySelector('.inline-banner--danger')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('p.income-statement__load-error')).toBeFalsy();
  });

  it('shows an empty-state row when no entries match', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('REVERSED');
    httpMock.expectOne(r => r.params.get('status') === 'REVERSED').flush({ entries: [], page: 0, size: 20, totalElements: 0, totalGrossAmount: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    flushInitialRequests();
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('page') === '1' && r.params.get('size') === '20');
    req.flush({ entries: [], page: 1, size: 20, totalElements: 21, totalGrossAmount: 0 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('has no action column and no write inputs — this screen is view-only', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.statementColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
  });

  it('formats gross amount as currency, with no net amount shown with thousands separators, not raw numbers', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('10,000');
    expect(rowText).not.toContain('10000');
    expect(rowText).not.toContain('9,300');
  });

  it('resolves real translated column header text, not raw i18n keys', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.statementColumns.map(c => c.label)).toEqual([
      'Income Type', 'Cycle Period', 'Status', 'Gross Amount', 'Created At'
    ]);
    const headerText: string = fixture.nativeElement.querySelector('.editable-table thead tr').textContent;
    expect(headerText).toContain('Gross Amount');
    expect(headerText).not.toContain('incomeStatement.columnGrossAmount');
  });

  it('rebuilds the column headers when the active language changes', () => {
    flushInitialRequests();

    translateService.use('fr');
    fixture.detectChanges();

    expect(fixture.componentInstance.statementColumns.map(c => c.label)).toEqual([
      'Type de revenu', 'Période', 'Statut', 'Montant brut', 'Créé le'
    ]);
  });

  it('Matching tab shows the leg-business columns, legend and no S.N.', () => {
    flushInitialRequests();
    routeData$.next({ incomeType: 'MATCHING' });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('incomeType') === 'MATCHING')
      .flush({
        entries: [{
          ...sampleEntry, incomeType: 'MATCHING', cyclePeriodStart: '2026-06-02', cyclePeriodEnd: '2026-06-16', grossAmount: 35000,
          legBreakdown: { bfLeft: 1000000, bfRight: 0, newLeft: 0, newRight: 500000, totalLeft: 1000000, totalRight: 500000,
            calcLeft: 500000, calcRight: 500000, matchingBusiness: 500000 }
        }],
        page: 0, size: 20, totalElements: 1, totalGrossAmount: 0
      });
    fixture.detectChanges();

    expect(fixture.componentInstance.statementColumns.map(c => c.label)).toEqual([
      'Period', 'BFLB', 'BFRB', 'NLB', 'NRB', 'TLB', 'TRB', 'CLB', 'CRB', 'Matching Business', 'Matching Income'
    ]);
    expect(fixture.nativeElement.querySelector('.income-statement__legend').textContent).toContain('Calculate Right Business');
    const cells: string[] = Array.from(fixture.nativeElement.querySelectorAll('.editable-table tbody tr:first-child td'))
      .map((td: any) => td.textContent.trim());
    expect(cells).toEqual(jasmine.arrayContaining(['02 Jun 2026 – 16 Jun 2026', '1000000', '500000', '35000']));
  });

  it('Royalty tab shows date, new left/right/matching business and royalty bonus', () => {
    flushInitialRequests();
    routeData$.next({ incomeType: 'ROYALTY' });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('incomeType') === 'ROYALTY')
      .flush({
        entries: [{
          ...sampleEntry, incomeType: 'ROYALTY', cyclePeriodStart: '2026-06-02', cyclePeriodEnd: '2026-06-16', grossAmount: 5000,
          legBreakdown: { bfLeft: 1000000, bfRight: 0, newLeft: 0, newRight: 500000, totalLeft: 1000000, totalRight: 500000,
            calcLeft: 500000, calcRight: 500000, matchingBusiness: 500000 }
        }],
        page: 0, size: 20, totalElements: 1, totalGrossAmount: 0
      });
    fixture.detectChanges();

    expect(fixture.componentInstance.statementColumns.map(c => c.label)).toEqual([
      'Date', 'New Left Business', 'New Right Business', 'New Matching Business', 'Royalty Bonus'
    ]);
    const cells: string[] = Array.from(fixture.nativeElement.querySelectorAll('.editable-table tbody tr:first-child td'))
      .map((td: any) => td.textContent.trim());
    expect(cells).toEqual(jasmine.arrayContaining(['02 Jun 2026 – 16 Jun 2026', '0', '500000']));
  });

  it('Sponsor Matching tab shows Date, Member ID, Matching Income and Sponsor Matching Income', () => {
    flushInitialRequests();
    routeData$.next({ incomeType: 'SPONSOR_MATCHING' });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('incomeType') === 'SPONSOR_MATCHING')
      .flush({
        entries: [{ ...sampleEntry, incomeType: 'SPONSOR_MATCHING', grossAmount: 3500, sponseeUserId: 'PC200', sponseeMatchingAmount: 35000 }],
        page: 0, size: 20, totalElements: 1, totalGrossAmount: 0
      });
    fixture.detectChanges();

    expect(fixture.componentInstance.statementColumns.map(c => c.label)).toEqual([
      'Date', 'Member ID', 'Matching Income', 'Sponsor Matching Income'
    ]);
    const cells: string[] = Array.from(fixture.nativeElement.querySelectorAll('.editable-table tbody tr:first-child td'))
      .map((td: any) => td.textContent.trim());
    expect(cells).toEqual(jasmine.arrayContaining(['PC200', '₹35,000', '₹3,500']));
  });

  const tier = (n: number, threshold: number, reqL: number, reqR: number, achieved: boolean) => ({
    tierLevel: n, matchingBusiness: threshold, designation: 'T' + n, requiredLeftBusiness: reqL, requiredRightBusiness: reqR,
    reward: 15000, perkDescription: '+ Smart Watch', status: achieved ? 'PAID' : null, achievedDate: achieved ? '2026-01-05T00:00:00Z' : null
  });

  function loadReward(tiers: unknown[], achieved: unknown[] = []) {
    flushInitialRequests();
    routeData$.next({ incomeType: 'REWARD' });
    httpMock.expectOne('/api/associates/me/reward-tiers').flush(tiers);
    httpMock.expectOne('/api/associates/me/rewards-achieved').flush(achieved);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('shows total income and entry count cards from the whole filtered set, and a toned status badge', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('PAID');
    httpMock.expectOne(r => r.params.get('status') === 'PAID').flush({
      entries: [{ ...sampleEntry, status: 'PAID' }], page: 0, size: 20, totalElements: 42, totalGrossAmount: 1250
    });
    fixture.detectChanges();

    const values: string[] = Array.from(fixture.nativeElement.querySelectorAll('.income-statement__card-value'))
      .map((e: any) => e.textContent.trim());
    expect(values).toEqual(['₹1,250', '42']);
    expect(fixture.nativeElement.querySelector('.editable-table__badge--success').textContent.trim()).toBe('PAID');
  });

  it('hides the summary cards on the Reward tab', () => {
    flushInitialRequests();
    routeData$.next({ incomeType: 'REWARD' });
    httpMock.expectOne('/api/associates/me/reward-tiers').flush([]);
    httpMock.expectOne('/api/associates/me/rewards-achieved').flush([]);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.income-statement__cards--summary')).toBeNull();
  });

  it('Reward tab derives totals, rank, 3-state status and bars from remaining business', () => {
    // left total 1.3M (500k-0, 2M-700k), right total 300k (2M-1.7M)
    const c = loadReward(
      [tier(1, 500000, 0, 200000, true), tier(2, 2000000, 700000, 1700000, false), tier(3, 4000000, 2700000, 3700000, false)],
      [{ achievedDate: '2026-01-05T00:00:00Z', designation: 'T1', reward: 15000, perkDescription: '+ Smart Watch', paid: false, paymentDate: null, remarks: null }]
    );
    expect(c.currentRank).toBe('T1');
    expect(c.rewardCards.map(x => x.value)).toEqual(['₹1,300,000', '₹300,000', '₹300,000']);
    expect(c.rewardTierRows.map(t => t['status'])).toEqual(['Achieved', 'In progress', 'Pending']);
    expect(c.rewardTierRows[1]['left']).toBe('₹13 L / ₹20 L');
    expect(c.rewardTierRows[1]['right']).toBe('₹3 L / ₹20 L');
    expect(c.achievedRows[0]['payStatus']).toBe('Unpaid');
    expect(c.achievedRows[0]['paymentDate']).toBe('—');
    expect(fixture.nativeElement.querySelectorAll('.income-statement__table tbody tr').length).toBe(4);
  });

  it('Reward tab with no achieved tier shows em-dash rank and first tier in progress', () => {
    const c = loadReward([tier(1, 500000, 500000, 500000, false), tier(2, 1000000, 1000000, 1000000, false)]);
    expect(c.currentRank).toBe('—');
    expect(c.rewardTierRows.map(t => t['status'])).toEqual(['In progress', 'Pending']);
    expect(c.rewardTierRows[0]['left']).toBe('₹0 L / ₹5 L');
  });

  it('Reward tab with every tier met caps bars at 100% using top threshold as total', () => {
    const c = loadReward([tier(1, 500000, 0, 0, true), tier(2, 1000000, 0, 0, true)]);
    expect(c.currentRank).toBe('T2');
    expect(c.rewardTierRows.every(t => t['status'] === 'Achieved')).toBeTrue();
    expect(c.rewardTierRows[0]['left']).toBe('₹5 L / ₹5 L');
  });
});
