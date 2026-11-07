import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SalesHistoryComponent } from './sales-history.component';
import { PagerComponent } from '../shared/components/pager/pager.component';
import { formatInr } from '../shared/utils/plot-grid.util';

describe('SalesHistoryComponent', () => {
  let fixture: ComponentFixture<SalesHistoryComponent>;
  let httpMock: HttpTestingController;
  let translateService: TranslateService;

  const enTranslations = {
    salesHistory: {
      loadError: 'Something went wrong loading your sales history. Please try again.',
      emptyState: 'No sales to show yet.'
    },
    plotBookings: { table: { bookingDate: 'Booking Date', associateId: 'Associate ID', name: 'Name', project: 'Project', plotType: 'Plot Type', plotNo: 'Plot No.', rate: 'Rate', area: 'Area', price: 'Price', extraPrice: 'Extra Price', totalPrice: 'Total Price', paid: 'Paid Amount', rest: 'Rest Amount', details: 'Details' } },
    shared: { pager: { label: 'Pagination', previous: 'Previous', next: 'Next', summary: '{{from}}-{{to}} of {{total}}' } }
  };

  const frTranslations = {
    ...enTranslations,
    plotBookings: { table: { ...enTranslations.plotBookings.table, name: 'Nom' } }
  };

  const sale = (over: object = {}) => ({
    id: 's1', plotId: 'p1', associateId: '11111111-uuid', associateUserId: 'VP00001', associateName: 'Ravi Kumar',
    buyerName: 'Jane', buyerPhone: '9999999999', buyerEmail: null, amount: 1500000, cycleId: 'c1',
    legCredited: 'L', status: 'RECORDED', voidReason: null, recordedAt: '2026-01-01T00:00:00Z',
    plotNo: null, projectName: null, note: '', ...over
  });

  const flushFirst = (sales: object[], totalElements = sales.length) =>
    httpMock.expectOne(r => r.urlWithParams.startsWith('/api/associates/me/sales?page=0&size=100')).flush({ sales, page: 0, size: 100, totalElements });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalesHistoryComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(SalesHistoryComponent);
    httpMock = TestBed.inject(HttpTestingController);
    translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.setTranslation('en', enTranslations);
    translateService.setTranslation('fr', frTranslations);
    translateService.use('en');
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const q = (sel: string): HTMLElement => fixture.nativeElement.querySelector(sel);

  describe('with a sale', () => {
    beforeEach(() => {
      flushFirst([sale()], 25);
      fixture.detectChanges();
    });

    it('loads the first page of my sales on init', () => {
      expect(fixture.componentInstance.page?.sales.length).toBe(1);
    });

    it('shows the associate login ID and name, never the row UUID', () => {
      const text = fixture.nativeElement.textContent;
      expect(text).toContain('VP00001');
      expect(text).toContain('Ravi Kumar');
      expect(text).not.toContain('11111111-uuid');
    });

    it('formats the amount with the app INR formatter', () => {
      const cell = q('.booking-table__num[data-label="Total Price"]');
      expect(cell.textContent!.trim()).toBe(formatInr(1500000));
      expect(cell.textContent).not.toBe('1500000');
    });

    it('gives every cell a translated data-label for the stacked mobile layout', () => {
      const cells = fixture.nativeElement.querySelectorAll('.booking-table tbody td');
      expect(cells.length).toBe(15);
      cells.forEach((td: HTMLElement) => expect(td.getAttribute('data-label')).toBeTruthy());
    });

    it('renders real translated headers and follows a language switch', () => {
      expect(q('.booking-table thead').textContent).toContain('Name');
      translateService.use('fr');
      fixture.detectChanges();
      expect(q('.booking-table thead').textContent).toContain('Nom');
    });

    it('is view-only: no button, select or input in the table', () => {
      expect(q('.booking-table')).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('.booking-table button, .booking-table select, .booking-table input').length).toBe(0);
    });

  });

  it('shows the empty state when there are no sales', () => {
    flushFirst([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.booking-table thead th').length).toBe(15);
    expect(q('.booking-table__empty')).toBeTruthy();
  });
});
