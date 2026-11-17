import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotTransferComponent } from './plot-transfer.component';

describe('PlotTransferComponent', () => {
  let fixture: ComponentFixture<PlotTransferComponent>;
  let component: PlotTransferComponent;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlotTransferComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(PlotTransferComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => { http.match(r => r.url === '/api/associates' || r.url === '/api/admin/cycles' || r.url === '/api/company/projects').forEach(r => r.flush([])); http.verify(); });

  it('loads ACTIVE bookings for the first project and last-30-day range', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }, { id: 'p2', name: 'Beta' }]);
    const r = http.expectOne(q => q.url === '/api/admin/bookings');
    expect(r.request.params.get('hasPending')).not.toBe('true');
    expect(r.request.params.get('status')).toBe('ACTIVE');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('bookedFrom')).toBe(component.from);
    expect(r.request.params.get('bookedTo')).toBe(component.to);
    r.flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
  });

  it('sends the typed plot name as plotNo, trimmed, and drops it when cleared', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
    component.onPlot('  A-12 New1 ');
    const typed = http.expectOne(q => q.url === '/api/admin/bookings');
    expect(typed.request.params.get('plotNo')).toBe('A-12 New1');
    expect(typed.request.params.get('status')).toBe('ACTIVE');
    typed.flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
    component.onPlot('');
    const cleared = http.expectOne(q => q.url === '/api/admin/bookings');
    expect(cleared.request.params.has('plotNo')).toBe(false);
    cleared.flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
  });

  const booking = (over: Record<string, unknown> = {}) => ({ id: 'b1', plotId: 'pl1', buyerAssociateId: 'u1', paidAmount: 600000,
    dueAmount: 400000, totalAmount: 1000000, discount: 0, ...over } as never);
  const plotItem = (price: number) => ({ plotId: 'pl2', plotNo: 'A-2', price, extraPrice: 0, status: 'AVAILABLE' } as never);

  it('treats a cheaper target as a refund: excess, 35% charge, refund and pay-mode rule', () => {
    const b = booking();
    component.transferFor = b;
    component.selectedPlot = plotItem(400000);
    expect(component.transferExcess(b)).toBe(200000);
    component.chargePct = 35;
    expect(component.charge(200000)).toBe(70000);
    expect(component.refund(200000)).toBe(130000);
    expect(component.transferRefundOk()).toBe(true);
    component.payMode = '';
    expect(component.transferRefundOk()).toBe(false);
    component.payMode = 'CASH';
    component.chargePct = -1; // below 0
    expect(component.transferRefundOk()).toBe(false);
  });

  it('needs no refund when the target is worth more than the amount paid', () => {
    const b = booking();
    component.transferFor = b;
    component.selectedPlot = plotItem(1500000);
    expect(component.transferExcess(b)).toBe(0);
    expect(component.transferRefundOk()).toBe(true);
  });

  it('confirmTransfer sends chargePct and payMode only when there is an excess', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
    component.transferFor = booking();
    component.selectedPlot = plotItem(400000);
    component.chargePct = 35;
    component.payMode = 'UPI';
    component.confirmTransfer();
    const r = http.expectOne('/api/admin/bookings/b1/transfer-plot');
    expect(r.request.body).toEqual({ plotId: 'pl2', chargePct: 35, payMode: 'UPI' });
    r.flush({});
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
  });

  it('move money: defaults to min(paid, target due), keeps the leftover, posts without refund fields', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
    const src = booking({ id: 's', paidAmount: 500000 });
    const tgt = booking({ id: 't', paidAmount: 700000, dueAmount: 300000 }) as never;
    component.moveFor = src;
    component.pickTarget(tgt);
    expect(component.moveAmount).toBe(300000);
    expect(component.moveLeftover(src)).toBe(200000);
    component.moveAmount = 400000; // above the target's balance
    expect(component.moveAmountValid(src)).toBe(false);
    component.moveAmount = 300000;
    component.confirmMove();
    const r = http.expectOne('/api/admin/bookings/s/move-money');
    expect(r.request.body).toEqual({ targetBookingId: 't', amount: 300000, refundRemainder: false, chargePct: null, payMode: null, reason: null });
    r.flush({});
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
  });

  it('move money with refund needs a reason; then sends charge, pay mode and reason', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
    const src = booking({ id: 's', paidAmount: 500000 });
    component.moveFor = src;
    component.pickTarget(booking({ id: 't', dueAmount: 300000 }) as never);
    component.refundRest = true;
    component.chargePct = 35;
    component.confirmMove(); // no reason yet: nothing is sent
    http.expectNone('/api/admin/bookings/s/move-money');
    component.moveReason = 'Customer asked';
    component.confirmMove();
    const r = http.expectOne('/api/admin/bookings/s/move-money');
    expect(r.request.body).toEqual({ targetBookingId: 't', amount: 300000, refundRemainder: true, chargePct: 35, payMode: 'CASH', reason: 'Customer asked' });
    r.flush({});
    http.expectOne(q => q.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 100, totalElements: 0 });
  });
});
