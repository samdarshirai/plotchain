import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { PaymentLedgerComponent } from './payment-ledger.component';
import { ReportFiltersComponent } from './report-filters.component';
import { PagerComponent } from '../../shared/components/pager/pager.component';

describe('PaymentLedgerComponent', () => {
  let fixture: ComponentFixture<PaymentLedgerComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const row = (b: string, n: number, amount = 250, over: Record<string, unknown> = {}) => ({
    bookingId: b, installmentNumber: n, paymentDate: '2026-03-02T00:00:00Z', associateCode: 'VA-1', associateName: 'Jane', projectName: 'Alpha',
    plotNo: 'A-1', amount, paymentMode: 'BANK_TRANSFER', paymentRef: 'R', entryBy: 'staff', confirmBy: 'admin', confirmedAt: '2026-03-03T00:00:00Z', ...over });
  const pageOf = (rows: any[], over: Record<string, unknown> = {}) => ({
    payments: rows, page: 0, size: 20, totalElements: rows.length, pageTotal: rows.reduce((s, r) => s + r.amount, 0), grandTotal: 9999, ...over });
  const flushProjects = () => http.expectOne('/api/company/projects').flush([]);
  const listReq = () => http.expectOne(r => r.url === '/api/admin/payments');
  const filters = () => fixture.debugElement.query(By.directive(ReportFiltersComponent)).componentInstance as ReportFiltersComponent;
  const loaded = (rows: any[], over: Record<string, unknown> = {}) => { flushProjects(); listReq().flush(pageOf(rows, over)); fixture.detectChanges(); };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaymentLedgerComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(PaymentLedgerComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('loads status=PAID page 0 size 20 on init', () => {
    flushProjects();
    const r = listReq();
    expect(r.request.params.get('status')).toBe('PAID');
    expect(r.request.params.get('page')).toBe('0');
    expect(r.request.params.get('size')).toBe('20');
    expect(r.request.params.has('from')).toBeFalse();
    r.flush(pageOf([]));
  });

  it('renders Entry by, Confirm by and Confirm date columns', () => {
    loaded([row('b1', 1)]);
    const heads = Array.from(el().querySelectorAll('th')).map(h => h.textContent!.trim());
    for (const k of ['entryBy', 'confirmBy', 'confirmDate']) { expect(heads).toContain('admin.bookingsEmi.col.' + k); }
    const cells = Array.from(el().querySelectorAll('tbody td')).map(c => c.textContent!.trim());
    expect(cells).toContain('staff');
    expect(cells).toContain('admin');
    expect(cells).toContain('Mar 3, 2026');
  });

  it('renders the Total row from pageTotal', () => {
    loaded([row('b1', 1), row('b2', 1)]);
    expect(el().querySelector('tfoot')!.textContent).toContain('₹500');
  });

  it('has no seal card', () => {
    loaded([row('b1', 1)]);
    expect(el().querySelector('app-seal-card')).toBeNull();
  });

  it('filter change reloads page 0 with the range and project', () => {
    loaded([row('b1', 1)]);
    filters().filtersChange.emit({ from: '2026-03-01', to: '2026-03-31', projectId: 'p1' });
    const r = listReq();
    expect(r.request.params.get('page')).toBe('0');
    expect(r.request.params.get('from')).toBe('2026-03-01');
    expect(r.request.params.get('to')).toBe('2026-03-31');
    expect(r.request.params.get('projectId')).toBe('p1');
    r.flush(pageOf([]));
  });

  it('paging requests that page', () => {
    loaded([row('b1', 1)], { totalElements: 50 });
    fixture.debugElement.query(By.directive(PagerComponent)).componentInstance.pageChange.emit(1);
    const r = listReq();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pageOf([], { page: 1, totalElements: 50 }));
  });

  it('shows a skeleton until the first response', () => {
    flushProjects();
    expect(el().querySelector('.booking-register__skeleton')).not.toBeNull();
    listReq().flush(pageOf([]));
  });

  it('shows the empty state', () => {
    loaded([]);
    expect(el().querySelector('.booking-register__empty')!.textContent).toContain('admin.bookingsEmi.empty.ledgerTitle');
  });

  it('shows an error banner with Retry, and Retry reloads', () => {
    flushProjects();
    listReq().flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.err.loadList');
    (el().querySelector('.booking-register__retry') as HTMLButtonElement).click();
    listReq().flush(pageOf([row('b1', 1)]));
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
  });

  it('Print receipt opens the receipt for that row only', () => {
    loaded([row('b1', 1), row('b2', 2)]);
    const btns = () => Array.from(el().querySelectorAll('.payment-ledger__receipt-btn')) as HTMLButtonElement[];
    expect(el().querySelector('app-payment-receipt')).toBeNull();
    btns()[0].click(); fixture.detectChanges();
    expect(el().querySelectorAll('app-payment-receipt').length).toBe(1);
    expect(el().querySelector('app-payment-receipt')!.textContent).toContain('B1-1');
    btns()[1].click(); fixture.detectChanges();
    expect(el().querySelectorAll('app-payment-receipt').length).toBe(1);
    expect(el().querySelector('app-payment-receipt')!.textContent).toContain('B2-2');
    (el().querySelector('.payment-receipt__close') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(el().querySelector('app-payment-receipt')).toBeNull();
  });

  it('closes the receipt when paging or filters change', () => {
    loaded([row('b1', 1)]);
    (el().querySelector('.payment-ledger__receipt-btn') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(el().querySelector('app-payment-receipt')).not.toBeNull();
    filters().filtersChange.emit({ from: '', to: '', projectId: 'p1' }); fixture.detectChanges();
    expect(el().querySelector('app-payment-receipt')).toBeNull();
    listReq().flush(pageOf([row('b1', 1)])); fixture.detectChanges();
    (el().querySelector('.payment-ledger__receipt-btn') as HTMLButtonElement).click(); fixture.detectChanges();
    fixture.componentInstance.load(1); fixture.detectChanges();
    expect(el().querySelector('app-payment-receipt')).toBeNull();
    listReq().flush(pageOf([]));
  });

  it('returns focus to the Print receipt button on Close', () => {
    loaded([row('b1', 1)]);
    document.body.appendChild(fixture.nativeElement);
    const btn = el().querySelector('.payment-ledger__receipt-btn') as HTMLButtonElement;
    btn.click(); fixture.detectChanges();
    (el().querySelector('.payment-receipt__close') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(document.activeElement).toBe(btn);
    fixture.nativeElement.remove();
  });

  describe('export', () => {
    let blobs: Blob[];
    beforeEach(() => {
      blobs = [];
      spyOn(URL, 'createObjectURL').and.callFake((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:x'; });
      spyOn(URL, 'revokeObjectURL');
      spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) { (window as any).__dl = this.download; });
    });
    const exportBtn = () => el().querySelector('.payment-ledger__export') as HTMLButtonElement;
    const exportReq = (page: number) => http.expectOne(r => r.url === '/api/admin/payments' && r.params.get('size') === '100' && r.params.get('page') === String(page));

    it('Export CSV walks every page with size 100 and exports the confirmed rows', async () => {
      loaded([row('b1', 1)]);
      exportBtn().click();
      const mk = (n: number, from: number) => Array.from({ length: n }, (_, i) => row('b' + (from + i), 1));
      const r0 = exportReq(0);
      expect(r0.request.params.get('status')).toBe('PAID');
      r0.flush(pageOf(mk(100, 0), { size: 100, totalElements: 150 }));
      exportReq(1).flush(pageOf(mk(50, 100), { page: 1, size: 100, totalElements: 150 }));
      expect(blobs.length).toBe(1);
      const text = await blobs[0].text();
      expect(Array.from(new Uint8Array(await blobs[0].slice(0, 3).arrayBuffer()))).toEqual([0xef, 0xbb, 0xbf]); // BOM (text() strips it)
      expect(text.split('\r\n').length).toBe(151);
      expect((window as any).__dl).toBe('payments-confirmed.csv');
    });

    it('disables the button while exporting and a failed export shows err.export', () => {
      loaded([row('b1', 1)]);
      exportBtn().click(); fixture.detectChanges();
      expect(exportBtn().disabled).toBeTrue();
      exportReq(0).flush('x', { status: 500, statusText: 'err' });
      fixture.detectChanges();
      expect(exportBtn().disabled).toBeFalse();
      expect(el().textContent).toContain('admin.bookingsEmi.err.export');
    });

    it('locks the filters during export and uses one filter snapshot for every page', () => {
      loaded([row('b1', 1)]);
      filters().filtersChange.emit({ from: '2026-03-01', to: '', projectId: 'p1' });
      listReq().flush(pageOf([]));
      exportBtn().click(); fixture.detectChanges();
      expect(filters().locked).toBeTrue();
      const mk = Array.from({ length: 100 }, (_, i) => row('b' + i, 1));
      exportReq(0).flush(pageOf(mk, { size: 100, totalElements: 150 }));
      fixture.componentInstance.filters = { from: '2027-01-01', to: '', projectId: 'p2' };
      const r1 = exportReq(1);
      expect(r1.request.params.get('from')).toBe('2026-03-01');
      expect(r1.request.params.get('projectId')).toBe('p1');
      r1.flush(pageOf([], { page: 1, size: 100, totalElements: 150 }));
      fixture.detectChanges();
      expect(filters().locked).toBeFalse();
    });

    it('exports a header-only file on an empty result', async () => {
      loaded([]);
      exportBtn().click();
      exportReq(0).flush(pageOf([], { size: 100 }));
      const text = await blobs[0].text();
      expect(text.split('\r\n').length).toBe(1);
    });
  });

  it('ignores a stale list response', () => {
    loaded([row('b1', 1)]);
    filters().filtersChange.emit({ from: '2026-03-01', to: '', projectId: '' });
    const first = listReq();
    filters().filtersChange.emit({ from: '2026-04-01', to: '', projectId: '' });
    const second = listReq();
    second.flush(pageOf([row('new', 1)]));
    first.flush(pageOf([row('old', 1)]));
    fixture.detectChanges();
    expect(el().querySelector('tbody')!.textContent).toContain('VA-1');
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
    expect(fixture.componentInstance.page!.payments[0].bookingId).toBe('new');
  });
});
