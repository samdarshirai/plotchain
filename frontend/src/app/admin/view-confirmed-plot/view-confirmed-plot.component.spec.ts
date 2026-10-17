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
  afterEach(() => http.verify());

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
});
