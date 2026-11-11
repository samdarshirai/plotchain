import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { MyBusinessReportComponent } from './my-business-report.component';
import { EmiReportComponent } from './emi-report.component';

describe('Reports screens', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MyBusinessReportComponent, EmiReportComponent, TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('my business: renders both legs and reloads with the chosen dates', () => {
    const fixture = TestBed.createComponent(MyBusinessReportComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/reports/business').flush({
      left: [{ paymentDate: '2026-06-03T00:00:00Z', confirmDate: null, associateId: 'VP00001', name: 'Ravi', project: 'Green', plotNumber: 'A-1', business: 100 }],
      right: []
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ravi');
    const tables = fixture.nativeElement.querySelectorAll('table');
    expect(tables.length).toBe(2);
    expect(tables[0].querySelectorAll('tbody tr').length).toBe(1);
    expect(tables[1].querySelector('[role="status"]').textContent).toContain('plotBookings.table.empty');

    const input = fixture.nativeElement.querySelectorAll('input[type=date]')[0] as HTMLInputElement;
    input.value = '2026-06-01';
    input.dispatchEvent(new Event('change'));
    const req = http.expectOne(r => r.url === '/api/associates/me/reports/business');
    expect(req.request.params.get('from')).toBe('2026-06-01');
    expect(req.request.params.has('to')).toBeFalse();
  });

  const emiReq = () => http.expectOne(r => r.url === '/api/associates/me/reports/emi');
  const page = (bookings: unknown[]) => ({ bookings, page: 0, size: 100, totalElements: bookings.length });

  it('emi: loads downline pending bookings and shows associate + remaining', () => {
    const fixture = TestBed.createComponent(EmiReportComponent);
    fixture.detectChanges();
    http.expectOne('/api/associates/me/cycles').flush([]);
    const req = emiReq();
    expect(req.request.params.get('leg')).toBe('ALL');
    expect(req.request.params.has('cycleId')).toBeFalse();
    expect(req.request.params.has('associateId')).toBeFalse();
    req.flush(page([{ id: 'b1', plotId: 'p1', plotNo: 'A-1', associateCode: 'VP00002', associateName: 'Sita',
      totalAmount: 100000, paidAmount: 40000, dueAmount: 60000, installments: [] }]));
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Sita');
    expect(text).toContain('VP00002');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('emi: filters send leg, associate id and cycle', () => {
    const fixture = TestBed.createComponent(EmiReportComponent);
    fixture.detectChanges();
    http.expectOne('/api/associates/me/cycles').flush([{ id: 'c1', periodStart: '2026-06-01', periodEnd: null, status: 'OPEN' }]);
    emiReq().flush(page([]));
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.onLeg('L'); c.onAssociate(' VP00005 '); c.onCycle('c1');
    const reqs = http.match(r => r.url === '/api/associates/me/reports/emi');
    const last = reqs[reqs.length - 1].request.params;
    expect(last.get('leg')).toBe('L');
    expect(last.get('associateId')).toBe('VP00005');
    expect(last.get('cycleId')).toBe('c1');
  });

  it('emi: empty data renders an explicit empty state inside the table', () => {
    const fixture = TestBed.createComponent(EmiReportComponent);
    fixture.detectChanges();
    http.expectOne('/api/associates/me/cycles').flush([]);
    emiReq().flush(page([]));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table')).toBeTruthy();
    expect(el.querySelector('tbody [role="status"]')?.textContent).toContain('admin.addPlotEmi.empty');
  });
});
