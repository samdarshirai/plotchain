import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SalesHistoryComponent } from './sales-history.component';

describe('SalesHistoryComponent', () => {
  let fixture: ComponentFixture<SalesHistoryComponent>;
  let httpMock: HttpTestingController;
  let translateService: TranslateService;

  const enTranslations = {
    salesHistory: {
      columnBuyerName: 'Buyer',
      columnBuyerPhone: 'Phone',
      columnAmount: 'Amount',
      columnAssociateId: 'Associate',
      columnLegCredited: 'Leg',
      columnStatus: 'Status',
      columnRecordedAt: 'Recorded At',
      loadError: 'Something went wrong loading your sales history. Please try again.',
      emptyState: 'No sales to show yet.',
      previousPageAction: 'Previous',
      nextPageAction: 'Next',
      pageIndicator: 'Page {{page}} of {{totalPages}}'
    }
  };

  const frTranslations = {
    salesHistory: {
      ...enTranslations.salesHistory,
      columnBuyerName: 'Acheteur',
      columnBuyerPhone: 'Téléphone'
    }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalesHistoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SalesHistoryComponent);
    httpMock = TestBed.inject(HttpTestingController);

    // Real translations registered explicitly (same pattern IncomeStatementComponent's spec
    // uses) -- without this, translate.get() calls resolve to their raw key rather than actual
    // copy, since TranslateModule.forRoot() loads no translation file in tests.
    translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.setTranslation('en', enTranslations);
    translateService.setTranslation('fr', frTranslations);
    translateService.use('en');

    fixture.detectChanges();

    httpMock.expectOne('/api/associates/me/sales?page=0&size=20').flush({
      sales: [
        {
          id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane', buyerPhone: '9999999999',
          buyerEmail: null, amount: 100000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
          voidReason: null, recordedAt: '2026-01-01T00:00:00Z'
        }
      ],
      page: 0, size: 20, totalElements: 1
    });
  });

  afterEach(() => httpMock.verify());

  it('loads the first page of my sales on init', () => {
    expect(fixture.componentInstance.page?.sales.length).toBe(1);
  });

  it('includes an Associate ID column so descendant sales are distinguishable from my own', () => {
    expect(fixture.componentInstance.historyColumns.some(c => c.key === 'associateId')).toBeTrue();
    expect(fixture.componentInstance.historyRows[0]['associateId']).toBe('a1');
  });

  it('shows a load error when the initial load fails, without silently doing nothing', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/associates/me/sales?page=1&size=20').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.sales-history__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('shows an empty-state row when there are no sales yet', () => {
    fixture.componentInstance.goToPage(1);
    httpMock.expectOne('/api/associates/me/sales?page=1&size=20').flush({ sales: [], page: 1, size: 20, totalElements: 0 });
    fixture.detectChanges();

    const emptyCell: HTMLElement | null = fixture.nativeElement.querySelector('.editable-table__empty');
    expect(emptyCell?.textContent?.trim()).toBeTruthy();
  });

  it('clicking Next loads the next page', () => {
    fixture.componentInstance.goToPage(1);
    const req = httpMock.expectOne('/api/associates/me/sales?page=1&size=20');
    req.flush({ sales: [], page: 1, size: 20, totalElements: 21 });

    expect(fixture.componentInstance.page?.page).toBe(1);
  });

  it('renders no action column and no filter controls (view-only)', () => {
    expect(fixture.componentInstance.historyColumns.some(c => c.type === 'action')).toBeFalse();
    expect(fixture.nativeElement.querySelector('select')).toBeFalsy();
  });

  it('resolves real translated column header text, not raw i18n keys', () => {
    expect(fixture.componentInstance.historyColumns.map(c => c.label)).toEqual([
      'Buyer', 'Phone', 'Amount', 'Associate', 'Leg', 'Status', 'Recorded At'
    ]);
    const headerText: string = fixture.nativeElement.querySelector('.editable-table thead tr').textContent;
    expect(headerText).toContain('Buyer');
    expect(headerText).not.toContain('salesHistory.columnBuyerName');
  });

  it('rebuilds the column headers when the active language changes', () => {
    translateService.use('fr');
    fixture.detectChanges();

    expect(fixture.componentInstance.historyColumns.map(c => c.label)).toEqual([
      'Acheteur', 'Téléphone', 'Amount', 'Associate', 'Leg', 'Status', 'Recorded At'
    ]);
  });
});
