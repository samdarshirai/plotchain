import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ViewConfirmedPlotComponent } from './view-confirmed-plot.component';

const row = (b: string, n: number, amount = 250) => ({
  bookingId: b, installmentNumber: n, paymentDate: '2026-03-02T00:00:00Z', associateCode: 'VA-1', associateName: 'Jane',
  projectName: 'Alpha', plotNo: 'A-1', amount, paymentMode: 'CASH', paymentRef: 'R', entryBy: 'staff', confirmBy: null, confirmedAt: null });
const pageOf = (rows: any[]) => ({ payments: rows, page: 0, size: 20, totalElements: rows.length, pageTotal: 0, grandTotal: 0 });

describe('ViewConfirmedPlotComponent', () => {
  let fixture: ComponentFixture<ViewConfirmedPlotComponent>;
  let component: ViewConfirmedPlotComponent;
  let http: HttpTestingController;
  const listReq = () => http.expectOne(r => r.url === '/api/admin/payments');

  function boot(rows: any[] = [row('b1', 1), row('b2', 1)]) {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]);
    listReq().flush(pageOf(rows));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ViewConfirmedPlotComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(ViewConfirmedPlotComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => { http.match(r => r.url === '/api/associates' || r.url === '/api/admin/cycles').forEach(r => r.flush([])); http.verify(); });

  it('defaults to pending, first project and a last-month range', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]);
    const r = listReq();
    expect(r.request.params.get('status')).toBe('ENTERED');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('from')).toBe(component.from);
    expect(r.request.params.get('to')).toBe(component.to);
    r.flush(pageOf([]));
  });

  it('switching to confirmed reloads with PAID and hides selection', () => {
    boot();
    component.setStatus('PAID');
    expect(listReq().request.params.get('status')).toBe('PAID');
  });

  it('check all then confirm posts every selected payment and reloads', () => {
    boot();
    component.checkAll();
    expect(component.selected.size).toBe(2);
    component.confirm();
    const c = http.expectOne('/api/admin/payments/confirm');
    expect(c.request.body.items).toEqual([{ bookingId: 'b1', installmentNumber: 1 }, { bookingId: 'b2', installmentNumber: 1 }]);
    c.flush([]);
    listReq().flush(pageOf([]));
    expect(component.selected.size).toBe(0);
  });

  it('edit loads the booking, PUTs the payment and reloads', () => {
    boot();
    component.openDetail(row('b1', 1) as any);
    expect(component.detailRow).not.toBeNull();
    component.openEditPayment(row('b1', 1) as any);
    http.expectOne('/api/admin/bookings/b1').flush({ id: 'b1', installments: [
      { installmentNumber: 1, amount: 250, status: 'ENTERED', paidAt: '2026-03-02T00:00:00Z', paymentMode: 'CASH', paymentRef: 'R', receiptNo: 'RC' }] });
    expect(component.payForm).toEqual({ bookingId: 'b1', number: 1, plot: 'A-1' });
    expect(component.detailRow).toBeNull();
    component.amount = 300;
    component.savePayment();
    const req = http.expectOne('/api/admin/bookings/b1/payments/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.amount).toBe(300);
    req.flush({});
    listReq().flush(pageOf([]));
    expect(component.payForm).toBeNull();
  });

  it('delete calls DELETE and reloads', () => {
    boot();
    component.confirmDelete(row('b1', 1) as any);
    const req = http.expectOne('/api/admin/bookings/b1/payments/1');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
    listReq().flush(pageOf([]));
  });

  it('edit plot is refused client-side when the booking has a PAID row', () => {
    boot();
    component.openEditBooking(row('b1', 1) as any);
    http.expectOne('/api/admin/bookings/b1').flush({ id: 'b1', installments: [{ installmentNumber: 1, amount: 1, status: 'PAID' }] });
    expect(component.bookingForm).toBeNull();
    listReq().flush(pageOf([]));
  });

  it('edit plot is offered only when the booking has no confirmed money', () => {
    boot();
    expect(component.canEditPlot({ ...row('b1', 1), paidAmount: 0 } as any)).toBeTrue();
    expect(component.canEditPlot({ ...row('b1', 1), paidAmount: 5000 } as any)).toBeFalse();
    expect(component.canEditPlot(row('b1', 1) as any)).toBeFalse(); // unknown
  });

  it('edit plot form keeps the plot details and previews the new total', () => {
    boot();
    component.openEditBooking({ ...row('b1', 1), paidAmount: 0 } as any);
    http.expectOne('/api/admin/bookings/b1').flush({ id: 'b1', plotNo: 'A-1', listPrice: 100000, discount: 1000, extraPrice: 500,
      installments: [{ installmentNumber: 1, amount: 10, status: 'ENTERED' }] });
    expect(component.bookingForm?.booking.plotNo).toBe('A-1');
    component.ebDiscount = 2000;
    expect(component.newTotal).toBe(98500);
  });
});
