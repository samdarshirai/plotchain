import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Booking } from '../../plot-bookings/models/associate-booking-page.model';
import { PlotCancelComponent } from './plot-cancel.component';

describe('PlotCancelComponent', () => {
  let fixture: ComponentFixture<PlotCancelComponent>;
  let component: PlotCancelComponent;
  let http: HttpTestingController;
  const booking = { id: 'b1', plotId: 'pl1', plotNo: 'A-12', totalAmount: 600000, paidAmount: 150000, dueAmount: 450000 } as Booking;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PlotCancelComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(PlotCancelComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => { http.match(r => r.url === '/api/associates' || r.url === '/api/admin/cycles').forEach(r => r.flush([])); http.verify(); });

  it('loads ACTIVE bookings for the first project', () => {
    http.expectOne('/api/company/projects').flush([{ id: 'p1', name: 'Alpha' }]);
    const r = http.expectOne(q => q.url === '/api/admin/bookings');
    expect(r.request.params.get('status')).toBe('ACTIVE');
    expect(r.request.params.get('projectId')).toBe('p1');
    r.flush({ bookings: [], page: 0, size: 20, totalElements: 0 });
  });

  describe('cancel popup', () => {
    beforeEach(() => {
      http.expectOne('/api/company/projects').flush([]);
      component.openCancel(booking);
    });

    it('starts at the 35% minimum and computes charge and refund from the amount paid', () => {
      expect(component.chargePct).toBe(35);
      expect(component.charge()).toBe(52500);
      expect(component.refund()).toBe(97500);
      component.chargePct = 50;
      expect(component.charge()).toBe(75000);
      expect(component.refund()).toBe(75000);
    });

    it('treats a percentage below 35 or above 100 as invalid and sends nothing', () => {
      component.cancelReason = 'x';
      component.payMode = 'UPI';
      for (const bad of [34.99, 100.01, null]) {
        component.chargePct = bad;
        expect(component.pctValid()).toBe(false);
        component.confirmCancel();
      }
      http.expectNone('/api/admin/bookings/b1/cancel');
    });

    it('requires a reason, and a pay mode while a refund is due', () => {
      component.confirmCancel();
      expect(component.cancelTried).toBe(true);
      component.cancelReason = 'changed mind';
      component.confirmCancel();
      http.expectNone('/api/admin/bookings/b1/cancel');
    });

    it('posts reason, percentage and pay mode, then closes and reloads', () => {
      component.chargePct = 40;
      component.cancelReason = '  changed mind ';
      component.payMode = 'BANK_TRANSFER';
      component.confirmCancel();
      const r = http.expectOne('/api/admin/bookings/b1/cancel');
      expect(r.request.body).toEqual({ reason: 'changed mind', chargePct: 40, payMode: 'BANK_TRANSFER' });
      r.flush({});
      expect(component.cancelFor).toBeNull();
      expect(component.flash).toBeTruthy();
    });

    it('needs no pay mode when the charge takes the whole payment', () => {
      component.chargePct = 100;
      component.cancelReason = 'x';
      component.confirmCancel();
      expect(http.expectOne('/api/admin/bookings/b1/cancel').request.body.payMode).toBeNull();
    });
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
});
