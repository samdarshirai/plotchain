import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { EmiReportComponent } from './emi-report.component';

const row = { bookingId: 'b1', installmentNumber: 1, paymentDate: '2026-10-05T10:00:00Z', associateCode: 'VP1', associateName: 'Asha',
  projectName: 'Alpha', plotNo: 'A-12', amount: 5000, paymentMode: 'CASH', paymentRef: 'R1', entryBy: null, confirmBy: null, confirmedAt: null };
const emptyPage = { payments: [], page: 0, size: 100, totalElements: 0, pageTotal: 0, grandTotal: 0 };

describe('EmiReportComponent', () => {
  let fixture: ComponentFixture<EmiReportComponent>;
  let component: EmiReportComponent;
  let http: HttpTestingController;

  const boot = (page: object = emptyPage) => {
    http.expectOne('/api/associates').flush([{ id: 'a1', userId: 'U1', name: 'Asha' }]);
    http.expectOne(q => q.url === '/api/admin/cycles').flush({
      cycles: [{ id: 'c1', periodStart: '2026-10-01', periodEnd: '2026-10-15', status: 'CLOSED' }], page: 0, size: 100, totalElements: 1 });
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    http.expectOne(q => q.url === '/api/admin/payments').flush(page);
  };
  const reload = () => {
    const r = http.expectOne(q => q.url === '/api/admin/payments');
    r.flush(emptyPage);
    return r.request.params;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EmiReportComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(EmiReportComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('loads confirmed payments for the first project and last-30-day range', () => {
    http.expectOne('/api/associates').flush([]);
    http.expectOne(q => q.url === '/api/admin/cycles').flush({ cycles: [], page: 0, size: 100, totalElements: 0 });
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    const r = http.expectOne(q => q.url === '/api/admin/payments');
    expect(r.request.params.get('status')).toBe('PAID');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('from')).toBe(component.from);
    expect(r.request.params.get('to')).toBe(component.to);
    r.flush(emptyPage);
  });

  it('associate, plot id and cycle filters are sent; clearing removes them', () => {
    boot();
    component.onAssociate({ id: 'a1', userId: 'U1', name: 'Asha' } as never);
    expect(reload().get('associateId')).toBe('a1');
    component.onPlot('  A-12 ');
    expect(reload().get('plotNo')).toBe('A-12');
    component.onPlot('');
    expect(reload().get('plotNo')).toBeNull();
    component.onCycle('c1');
    const p = reload();
    expect(p.get('from')).toBe('2026-10-01');
    expect(p.get('to')).toBe('2026-10-15');
  });

  it('renders one row per payment with the grand total', () => {
    boot({ ...emptyPage, payments: [row, { ...row, installmentNumber: 2, amount: 2500 }], totalElements: 2, grandTotal: 7500 });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.querySelector('tfoot')?.textContent).toContain('7,500');
  });

  it('Details loads the booking and lists only confirmed payments', () => {
    boot({ ...emptyPage, payments: [row], totalElements: 1, grandTotal: 5000 });
    component.open(row as never);
    http.expectOne('/api/admin/bookings/b1').flush({ id: 'b1', plotNo: 'A-12', installments: [
      { installmentNumber: 1, status: 'PAID', amount: 5000, paidAt: '2026-10-05T10:00:00Z' },
      { installmentNumber: 2, status: 'ENTERED', amount: 1000, paidAt: '2026-10-06T10:00:00Z' },
      { installmentNumber: 3, status: 'PENDING', amount: 1000, paidAt: null }] });
    expect(component.history(component.detail!).length).toBe(1);
    expect(component.historyTotal(component.detail!)).toBe(5000);
    component.close();
    expect(component.opening).toBeNull();
  });
});
