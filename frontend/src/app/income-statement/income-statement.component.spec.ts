import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { IncomeStatementComponent } from './income-statement.component';

describe('IncomeStatementComponent', () => {
  let fixture: ComponentFixture<IncomeStatementComponent>;
  let httpMock: HttpTestingController;
  let translateService: TranslateService;

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
      .flush({ entries: lookupEntries, page: 0, size: 100, totalElements: lookupEntries.length });
    httpMock
      .expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('size') === '20')
      .flush({ entries: [sampleEntry], page: 0, size: 20, totalElements: 1 });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IncomeStatementComponent, HttpClientTestingModule, TranslateModule.forRoot()]
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

  afterEach(() => httpMock.verify());

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
      .flush({ entries: [sampleEntry], page: 0, size: 20, totalElements: 1 });

    expect(fixture.componentInstance.cycles).toEqual([]);
    expect(fixture.componentInstance.loadError).toBe(false);
  });

  it('selecting an income type tab reloads with the incomeType filter and resets to page 0', () => {
    flushInitialRequests();
    fixture.componentInstance.onTabChange('PERK');

    const req = httpMock.expectOne(
      r => r.url === '/api/associates/me/ledger' && r.params.get('incomeType') === 'PERK' && r.params.get('page') === '0'
    );
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    expect(fixture.componentInstance.activeIncomeType).toBe('PERK');
  });

  it('reloads with the cycleId filter when the cycle dropdown changes', () => {
    flushInitialRequests();
    fixture.componentInstance.onCycleIdChange('c2');

    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('cycleId') === 'c2');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('reloads with the status filter when the status dropdown changes', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('REVERSED');

    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('status') === 'REVERSED');
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('combines tab, cycle, and status filters into one request', () => {
    flushInitialRequests();
    fixture.componentInstance.onTabChange('MATCHING');
    httpMock.expectOne(r => r.params.get('incomeType') === 'MATCHING').flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onCycleIdChange('c1');
    httpMock.expectOne(r => r.params.get('cycleId') === 'c1').flush({ entries: [], page: 0, size: 20, totalElements: 0 });

    fixture.componentInstance.onStatusChange('PAID');
    const req = httpMock.expectOne(
      r => r.params.get('incomeType') === 'MATCHING' && r.params.get('cycleId') === 'c1' && r.params.get('status') === 'PAID'
    );
    req.flush({ entries: [], page: 0, size: 20, totalElements: 0 });
  });

  it('shows the resolved cycle period dates in each row, not a raw cycle UUID', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('Jan 1, 2026');
    expect(rowText).not.toContain('c1');
  });

  it('renders a dash for a null sourceRef instead of blank or "null"', () => {
    flushInitialRequests();
    fixture.componentInstance.onStatusChange('PENDING');
    httpMock.expectOne(r => r.params.get('status') === 'PENDING').flush({
      entries: [{ ...sampleEntry, id: 'l3', sourceRef: null, status: 'PENDING' }],
      page: 0,
      size: 20,
      totalElements: 1
    });
    fixture.detectChanges();

    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('—');
  });

  it('shows a load error when the initial page load fails, without silently doing nothing', () => {
    httpMock.expectOne(r => r.params.get('size') === '100').flush({ entries: [], page: 0, size: 100, totalElements: 0 });
    httpMock
      .expectOne(r => r.params.get('size') === '20')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.income-statement__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('renders the load error through InlineBannerComponent with tone danger, not a plain paragraph', () => {
    httpMock.expectOne(r => r.params.get('size') === '100').flush({ entries: [], page: 0, size: 100, totalElements: 0 });
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
    httpMock.expectOne(r => r.params.get('status') === 'REVERSED').flush({ entries: [], page: 0, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    flushInitialRequests();
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/ledger' && r.params.get('page') === '1' && r.params.get('size') === '20');
    req.flush({ entries: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('has no action column and no write inputs — this screen is view-only', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.statementColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(0);
  });

  it('formats gross amount and net amount as currency with thousands separators, not raw numbers', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const rowText: string = fixture.nativeElement.querySelector('.editable-table tbody tr').textContent;
    expect(rowText).toContain('10,000');
    expect(rowText).not.toContain('10000');
    expect(rowText).toContain('9,300');
    expect(rowText).not.toContain('9300');
  });

  it('prefixes TDS Deduction and Admin Deduction with a leading minus sign in the formatted value itself', () => {
    flushInitialRequests();
    fixture.detectChanges();
    const cells: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.editable-table tbody tr:first-child td'));
    const tdsCell = cells[4];
    const adminCell = cells[5];
    expect(tdsCell.textContent).toContain('−');
    expect(tdsCell.textContent).toContain('500');
    expect(adminCell.textContent).toContain('−');
    expect(adminCell.textContent).toContain('200');
  });

  it('resolves real translated column header text, not raw i18n keys', () => {
    flushInitialRequests();
    expect(fixture.componentInstance.statementColumns.map(c => c.label)).toEqual([
      'Income Type', 'Cycle Period', 'Status', 'Gross Amount', 'TDS Deduction',
      'Admin Deduction', 'Net Amount', 'Source Ref', 'Created At'
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
      'Type de revenu', 'Période', 'Statut', 'Montant brut', 'Déduction TDS',
      'Déduction admin', 'Montant net', 'Réf. source', 'Créé le'
    ]);
  });
});
