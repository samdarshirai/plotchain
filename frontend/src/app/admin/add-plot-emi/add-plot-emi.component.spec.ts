import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { AddPlotEmiComponent } from './add-plot-emi.component';

const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 'b1', plotId: 'p1', associateId: 'a1', status: 'ACTIVE', buyerName: 'Jane', totalAmount: 100000,
  installmentCount: 3, bookedAt: '2026-10-01T00:00:00Z', paidAmount: 10000, dueAmount: 90000, plotNo: 'A-1',
  installments: [
    { installmentNumber: 1, amount: 10000, dueDate: '2026-10-01', status: 'PAID', paidAt: '2026-10-01T00:00:00Z', overdue: false, paymentMode: 'CASH' },
    { installmentNumber: 2, amount: 40000, dueDate: '2026-11-01', status: 'PENDING', paidAt: null, overdue: false },
    { installmentNumber: 3, amount: 50000, dueDate: '2026-12-01', status: 'PENDING', paidAt: null, overdue: false }
  ],
  ...over
});

describe('AddPlotEmiComponent', () => {
  let fixture: ComponentFixture<AddPlotEmiComponent>;
  let c: AddPlotEmiComponent;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AddPlotEmiComponent, HttpClientTestingModule, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(AddPlotEmiComponent);
    c = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.match(() => true).forEach(r => r.flush(r.request.url === '/api/admin/cycles' ? { cycles: [] } : [])); // projects, associates, cycles
  });

  it('does not load bookings until a project is chosen', () => {
    http.expectNone(r => r.url === '/api/admin/bookings');
    c.onProject('proj1');
    const req = http.expectOne(r => r.url === '/api/admin/bookings');
    expect(req.request.params.get('projectId')).toBe('proj1');
    expect(req.request.params.get('hasPending')).toBe('true');
  });

  it('sums only PENDING rows as the top-up ceiling and lists ENTERED/PAID in history', () => {
    const b = booking();
    expect(c.pendingOf(b)).toBe(90000);
    expect(c.history(b).map(i => i.installmentNumber)).toEqual([1]);
  });

  it('rejects an amount above pending and a missing bank for non-cash modes', () => {
    c.openPay(booking());
    c.amount = 90001;
    expect(c.amountInvalid).toBeTrue();
    c.amount = 90000;
    expect(c.amountInvalid).toBeFalse();
    c.mode = 'NEFT';
    expect(c.bankInvalid).toBeTrue();
    c.bankName = 'HDFC';
    expect(c.bankInvalid).toBeFalse();
    c.mode = 'CASH';
    c.bankName = '';
    expect(c.bankInvalid).toBeFalse();
  });

  it('posts the top-up and reloads', () => {
    c.onProject('proj1');
    http.expectOne(r => r.url === '/api/admin/bookings').flush({ bookings: [booking()], page: 0, size: 20, totalElements: 1 });
    c.openPay(booking());
    c.amount = 20000; c.mode = 'UPI'; c.bankName = 'SBI'; c.txnNo = 'T1'; c.receiptNo = 'R1'; c.txnDate = c.today;
    c.submit();
    const req = http.expectOne('/api/admin/bookings/b1/top-up');
    expect(req.request.body).toEqual({ amount: 20000, paymentMode: 'UPI', bankName: 'SBI', paymentRef: 'T1', receiptNo: 'R1', paidAt: `${c.today}T00:00:00Z` });
    req.flush(booking());
    expect(c.payFor).toBeNull();
    http.expectOne(r => r.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
  });

  it('requires a receipt no: blocks the top-up, flags the field, lists it in the error summary', () => {
    c.onProject('proj1');
    http.expectOne(r => r.url === '/api/admin/bookings').flush({ bookings: [booking()], page: 0, size: 20, totalElements: 1 });
    c.openPay(booking());
    c.amount = 20000; c.mode = 'CASH'; c.txnNo = 'T1'; c.txnDate = c.today;
    expect(c.receiptNo).toBe('');
    c.receiptNo = '   ';
    c.submit();
    fixture.detectChanges();
    http.expectNone('/api/admin/bookings/b1/top-up');
    expect(c.issues.map(i => i.id)).toEqual(['receiptNo']);
    expect(fixture.nativeElement.textContent).toContain('admin.addPlotEmi.err.receipt');
  });

  it('clears the receipt no when the pay form is reopened', () => {
    c.openPay(booking());
    c.receiptNo = 'R9';
    c.openPay(booking());
    expect(c.receiptNo).toBe('');
  });

  it('shows the receipt no in the payment history', () => {
    c.historyOf = booking({ installments: [{ ...booking().installments[0], receiptNo: 'RCP-5' }] });
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('[data-label="admin.addPlotEmi.hist.receiptNo"]') as HTMLElement;
    expect(row.textContent!.trim()).toBe('RCP-5');
  });

  describe('edit/delete unconfirmed payments and booking', () => {
    const entered = () => booking({
      installments: [
        { installmentNumber: 1, amount: 10000, dueDate: '2026-10-01', status: 'ENTERED', paidAt: '2026-10-01T00:00:00Z', overdue: false, paymentMode: 'CASH', paymentRef: 'T0', receiptNo: 'R0' },
        { installmentNumber: 2, amount: 90000, dueDate: '2026-11-01', status: 'PENDING', paidAt: null, overdue: false }
      ]
    });

    it('edit prefills the form and PUTs to the payment endpoint; amount ceiling includes its own amount', () => {
      const b = entered();
      c.openEditPayment(b, b.installments[0]);
      expect(c.editNo).toBe(1);
      expect(c.amount).toBe(10000);
      c.amount = 100000;
      expect(c.amountInvalid).toBeFalse();
      c.amount = 100001;
      expect(c.amountInvalid).toBeTrue();
      c.amount = 20000; c.txnDate = c.today;
      c.submit();
      const req = http.expectOne('/api/admin/bookings/b1/payments/1');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.amount).toBe(20000);
      req.flush(b);
    });

    it('delete calls DELETE then reloads', () => {
      const b = entered();
      c.onProject('proj1');
      http.expectOne(r => r.url === '/api/admin/bookings').flush({ bookings: [b], page: 0, size: 20, totalElements: 1 });
      c.confirmDelete(b, b.installments[0]);
      const req = http.expectOne('/api/admin/bookings/b1/payments/1');
      expect(req.request.method).toBe('DELETE');
      req.flush(b);
      http.expectOne(r => r.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    });

    it('booking edit allowed only while ACTIVE with no PAID row', () => {
      expect(c.canEditBooking(entered())).toBeTrue();
      expect(c.canEditBooking(booking())).toBeFalse();
      expect(c.canEditBooking({ ...entered(), status: 'CANCELLED' })).toBeFalse();
    });
  });

  describe('cancel booking', () => {
    beforeEach(() => {
      c.onProject('proj1');
      http.expectOne(r => r.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
      c.openCancel(booking());
    });

    it('opens on the detail step; Cancel Plot only moves to the warning (no API call)', () => {
      expect(c.cancelStep).toBe('detail');
      c.cancelStep = 'confirm';
      http.expectNone('/api/admin/bookings/b1/cancel');
    });

    it('dismiss closes without calling the API', () => {
      c.closeCancel();
      expect(c.cancelFor).toBeNull();
      http.expectNone('/api/admin/bookings/b1/cancel');
    });

    it('requires a reason before posting', () => {
      c.cancelStep = 'confirm';
      c.cancelReason = '   ';
      c.confirmCancel();
      expect(c.cancelTried).toBeTrue();
      http.expectNone('/api/admin/bookings/b1/cancel');
    });

    it('posts the trimmed reason, closes and reloads', () => {
      c.cancelReason = ' double booked ';
      c.confirmCancel();
      const req = http.expectOne('/api/admin/bookings/b1/cancel');
      expect(req.request.body).toEqual({ reason: 'double booked' });
      req.flush(booking({ status: 'CANCELLED' }));
      expect(c.cancelFor).toBeNull();
      http.expectOne(r => r.url === '/api/admin/bookings').flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
    });

    it('keeps the popup open and shows the server error on failure', () => {
      c.cancelReason = 'x';
      c.confirmCancel();
      http.expectOne('/api/admin/bookings/b1/cancel').flush({ error: 'nope' }, { status: 400, statusText: 'Bad Request' });
      expect(c.cancelFor).not.toBeNull();
      expect(c.cancelError).toBe('nope');
    });
  });
});
