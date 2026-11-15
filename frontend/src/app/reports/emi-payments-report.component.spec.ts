import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { EmiPaymentsReportComponent } from './emi-payments-report.component';

const row = { bookingId: 'b1', installmentNumber: 1, paymentDate: '2026-10-05T10:00:00Z', associateCode: 'VP1', associateName: 'Asha',
  projectName: 'Alpha', plotNo: 'A-12', amount: 5000, paymentMode: 'CASH', paymentRef: 'R1', entryBy: null, confirmBy: null, confirmedAt: null };
const emptyPage = { payments: [], page: 0, size: 100, totalElements: 0, pageTotal: 0, grandTotal: 0 };
const URL = '/api/associates/me/reports/emi-payments';

describe('EmiPaymentsReportComponent', () => {
  let fixture: ComponentFixture<EmiPaymentsReportComponent>;
  let component: EmiPaymentsReportComponent;
  let http: HttpTestingController;

  const boot = (page: object = emptyPage) => {
    http.expectOne('/api/associates/me/cycles').flush([{ id: 'c1', periodStart: '2026-10-01', periodEnd: '2026-10-15', status: 'CLOSED' }]);
    http.expectOne(q => q.url === URL).flush(page);
  };
  const reload = () => {
    const r = http.expectOne(q => q.url === URL);
    r.flush(emptyPage);
    return r.request.params;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EmiPaymentsReportComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(EmiPaymentsReportComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('loads my team for the whole team and last-30-day range by default', () => {
    http.expectOne('/api/associates/me/cycles').flush([]);
    const r = http.expectOne(q => q.url === URL);
    expect(r.request.params.get('leg')).toBe('ALL');
    expect(r.request.params.get('from')).toBe(component.from);
    expect(r.request.params.get('to')).toBe(component.to);
    expect(r.request.params.get('associateId')).toBeNull();
    r.flush(emptyPage);
  });

  it('leg, associate, plot id and cycle filters are sent; clearing removes them', () => {
    boot();
    component.onLeg('L');
    expect(reload().get('leg')).toBe('L');
    component.onAssociate(' VP2 ');
    expect(reload().get('associateId')).toBe('VP2');
    component.onAssociate('');
    expect(reload().get('associateId')).toBeNull();
    component.onPlot('A-12');
    expect(reload().get('plotNo')).toBe('A-12');
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

  it('Details loads my-team booking and lists only confirmed payments', () => {
    boot({ ...emptyPage, payments: [row], totalElements: 1, grandTotal: 5000 });
    component.open(row as never);
    http.expectOne(`${URL}/b1`).flush({ id: 'b1', plotNo: 'A-12', installments: [
      { installmentNumber: 1, status: 'PAID', amount: 5000, paidAt: '2026-10-05T10:00:00Z' },
      { installmentNumber: 2, status: 'ENTERED', amount: 1000, paidAt: '2026-10-06T10:00:00Z' }] });
    expect(component.history(component.detail!).length).toBe(1);
    component.close();
    expect(component.opening).toBeNull();
  });
});
