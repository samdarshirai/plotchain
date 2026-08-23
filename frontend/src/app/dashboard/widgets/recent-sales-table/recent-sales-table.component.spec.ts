import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RecentSalesTableComponent } from './recent-sales-table.component';
import { AssociateSalePage } from '../../../sales-history/models/associate-sale-page.model';

describe('RecentSalesTableComponent', () => {
  let fixture: ComponentFixture<RecentSalesTableComponent>;
  let httpMock: HttpTestingController;

  const page: AssociateSalePage = {
    page: 0, size: 5, totalElements: 1,
    sales: [{
      id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane Buyer', buyerPhone: '9999999999',
      buyerEmail: null, amount: 840000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
      voidReason: null, recordedAt: '2026-08-18T00:00:00Z', plotNo: 'VG2-118', projectName: 'Viraj Greens Ph II'
    }]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentSalesTableComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(RecentSalesTableComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('requests exactly 5 recent sales on init and renders plot/project/amount/status', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales' && r.params.get('size') === '5' && r.params.get('page') === '0');
    req.flush(page);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('VG2-118');
    expect(text).toContain('Viraj Greens Ph II');
    const statusPill: HTMLElement = fixture.nativeElement.querySelector('.recent-sales-table__status-pill');
    expect(statusPill.classList).not.toContain('recent-sales-table__status-pill--voided');
  });

  it('renders the sale value and recorded date in their own cells', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    req.flush(page);
    fixture.detectChanges();

    const cells: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('td');
    expect(cells[2].textContent).toContain('840,000');
    expect(cells[3].textContent).toContain('Aug');
  });

  it('shows a loading state before the sales response arrives', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.recent-sales-table__loading')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.recent-sales-table__empty')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('.recent-sales-table__error')).toBeFalsy();

    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    req.flush(page);
  });

  it('marks a VOIDED sale with the voided pill class', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    req.flush({ ...page, sales: [{ ...page.sales[0], status: 'VOIDED' }] });
    fixture.detectChanges();

    const statusPill: HTMLElement = fixture.nativeElement.querySelector('.recent-sales-table__status-pill');
    expect(statusPill.classList).toContain('recent-sales-table__status-pill--voided');
  });

  it('shows an empty state when there are no sales yet', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    req.flush({ page: 0, size: 5, totalElements: 0, sales: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.recent-sales-table__empty')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('table')).toBeFalsy();
  });

  it('shows a load-error state on request failure, isolated from the rest of the dashboard', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne(r => r.url === '/api/associates/me/sales');
    req.flush('error', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.recent-sales-table__error')).toBeTruthy();
  });
});
