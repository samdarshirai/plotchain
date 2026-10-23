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
    httpMock.expectOne(r => r.urlWithParams.startsWith('/api/associates/me/sales?page=0&size=20')).flush({ sales, page: 0, size: 20, totalElements });

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
      expect(cells.length).toBe(14);
      cells.forEach((td: HTMLElement) => expect(td.getAttribute('data-label')).toBeTruthy());
    });

    it('uses the shared pager and no hand-rolled one', () => {
      expect(q('app-pager')).toBeTruthy();
      expect(q('.sales-history__pagination')).toBeNull();
    });

    it('requests the next page when the pager emits', () => {
      fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.pageChange.emit(1);
      httpMock.expectOne(r => r.urlWithParams.startsWith('/api/associates/me/sales?page=1&size=20')).flush({ sales: [], page: 1, size: 20, totalElements: 25 });
      expect(fixture.componentInstance.page?.page).toBe(1);
    });

    it('shows a load error when a later load fails', () => {
      fixture.componentInstance.goToPage(1);
      httpMock.expectOne(r => r.urlWithParams.startsWith('/api/associates/me/sales?page=1&size=20')).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(q('.my-sales__load-error')?.textContent?.trim()).toBeTruthy();
    });

    it('renders real translated headers and follows a language switch', () => {
      expect(q('.booking-table thead').textContent).toContain('Name');
      translateService.use('fr');
      fixture.detectChanges();
      expect(q('.booking-table thead').textContent).toContain('Nom');
    });

    it('ignores a stale response for a page that is no longer requested', () => {
      const comp = fixture.componentInstance;
      comp.goToPage(1);
      comp.goToPage(2);
      const reqs = httpMock.match(r => r.url === '/api/associates/me/sales');
      reqs[1].flush({ sales: [sale({ buyerName: 'Two' })], page: 2, size: 20, totalElements: 60 });
      reqs[0].flush({ sales: [sale({ buyerName: 'One' })], page: 1, size: 20, totalElements: 60 });
      expect(comp.page?.page).toBe(2);
      expect(comp.loading).toBe(false);
    });

    it('disables the pager while loading and re-enables after an error', () => {
      fixture.componentInstance.goToPage(1);
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.disabled).toBe(true);
      httpMock.expectOne(r => r.urlWithParams.startsWith('/api/associates/me/sales?page=1&size=20')).flush({}, { status: 500, statusText: 'x' });
      fixture.detectChanges();
      expect(fixture.componentInstance.loading).toBe(false);
      expect(fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.disabled).toBe(false);
    });

    it('is view-only: no button, select or input in the table', () => {
      expect(q('.booking-table')).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('.booking-table button, .booking-table select, .booking-table input').length).toBe(0);
    });

    it('renders an em dash when the associate ID or name is missing', () => {
      fixture.componentInstance.goToPage(0);
      httpMock.expectOne(r => r.urlWithParams.startsWith('/api/associates/me/sales?page=0&size=20')).flush({
        sales: [sale({ associateUserId: null, associateName: null })], page: 0, size: 20, totalElements: 1
      });
      fixture.detectChanges();
      expect(q('td[data-label="Associate ID"]').textContent!.trim()).toBe('—');
      expect(q('td[data-label="Name"]').textContent!.trim()).toBe('—');
    });
  });

  it('shows the empty state when there are no sales', () => {
    flushFirst([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.booking-table thead th').length).toBe(14);
    expect(q('.booking-table__empty')).toBeTruthy();
  });
});
