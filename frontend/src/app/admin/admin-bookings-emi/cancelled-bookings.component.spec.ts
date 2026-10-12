import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { CancelledBookingsComponent } from './cancelled-bookings.component';
import { ReportFiltersComponent } from './report-filters.component';

describe('CancelledBookingsComponent', () => {
  let fixture: ComponentFixture<CancelledBookingsComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const b = (id: string, over: Record<string, unknown> = {}) => ({
    id, plotId: 'plot-' + id + '-xxxxxxxx', plotNo: 'A-1', projectName: 'Alpha', associateId: 'a', associateName: 'Jane', associateCode: 'VA-1',
    buyerName: 'Rohit', buyerPhone: '9999999999', bookedAt: '2026-01-05T00:00:00Z', cancelledAt: '2026-02-10T00:00:00Z', discount: 500,
    totalAmount: 1000000, paidAmount: 200000, status: 'CANCELLED', ...over });
  const pageOf = (bookings: unknown[], total = bookings.length, page = 0) => ({ bookings, page, size: 20, totalElements: total });
  const listReq = () => http.expectOne(r => r.url === '/api/admin/bookings');
  const filters = () => fixture.debugElement.query(By.directive(ReportFiltersComponent)).componentInstance as ReportFiltersComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CancelledBookingsComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(CancelledBookingsComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.match(r => r.url.includes('/projects')).forEach(r => r.flush([]));
  });
  afterEach(() => http.verify());

  it('requests status=CANCELLED page 0 size 20 and no overdue param', () => {
    const r = listReq();
    expect(r.request.params.get('status')).toBe('CANCELLED');
    expect(r.request.params.get('page')).toBe('0');
    expect(r.request.params.get('size')).toBe('20');
    expect(r.request.params.has('overdue')).toBeFalse();
    r.flush(pageOf([]));
  });

  it('filter change sends range + project and returns to page 0', () => {
    listReq().flush(pageOf([b('1')], 40));
    fixture.detectChanges();
    fixture.debugElement.query(By.css('app-pager')).componentInstance.pageChange.emit(1);
    expect(listReq().request.params.get('page')).toBe('1');
    filters().filtersChange.emit({ from: '2026-02-01', to: '2026-02-28', projectId: 'p1' });
    const r = listReq();
    expect(r.request.params.get('cancelledFrom')).toBe('2026-02-01');
    expect(r.request.params.get('cancelledTo')).toBe('2026-02-28');
    expect(r.request.params.get('projectId')).toBe('p1');
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([]));
  });

  it('renders columns, dashes for nulls, and no Due column', () => {
    listReq().flush(pageOf([b('1'), b('2', { buyerPhone: null, discount: null, cancelledAt: null, associateCode: null })]));
    fixture.detectChanges();
    const heads = Array.from(el().querySelectorAll('th')).map(h => h.textContent!.trim());
    expect(heads.length).toBe(9);
    expect(heads).not.toContain('admin.bookingsEmi.col.due');
    const rows = el().querySelectorAll('tbody tr');
    const c1 = Array.from(rows[0].querySelectorAll('td')).map(c => c.textContent!.trim());
    expect(c1[1]).toBe('VA-1');
    expect(c1[3]).toContain('Rohit');
    expect(c1[4]).toBe('9999999999');
    expect(c1[7]).toContain('10,00,000');
    const c2 = Array.from(rows[1].querySelectorAll('td')).map(c => c.textContent!.trim());
    expect([c2[1], c2[4], c2[5], c2[6]]).toEqual(['—', '—', '—', '—']);
    rows[0].querySelectorAll('td').forEach(td => expect(td.getAttribute('data-label')).toBeTruthy());
  });

  it('uses the Cancelled from/to labels', () => {
    listReq().flush(pageOf([]));
    expect(filters().fromKey).toBe('admin.bookingsEmi.filter.cancelledFrom');
    expect(filters().toKey).toBe('admin.bookingsEmi.filter.cancelledTo');
  });

  it('shows skeleton, empty and error with retry', () => {
    expect(el().querySelector('.booking-register__skeleton')).toBeTruthy();
    listReq().error(new ProgressEvent('x'));
    fixture.detectChanges();
    expect(el().querySelector('app-inline-banner')).toBeTruthy();
    (el().querySelector('.cancelled-bookings__retry') as HTMLButtonElement).click();
    listReq().flush(pageOf([]));
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.empty.cancelledTitle');
  });

  it('ignores a stale response', () => {
    const first = listReq();
    filters().filtersChange.emit({ from: '', to: '', projectId: 'p1' });
    const second = listReq();
    second.flush(pageOf([b('new')]));
    first.flush(pageOf([b('old'), b('old2')]));
    fixture.detectChanges();
    expect(el().querySelectorAll('tbody tr').length).toBe(1);
  });

  it('has no seal card and rows are not clickable', () => {
    listReq().flush(pageOf([b('1')]));
    fixture.detectChanges();
    expect(el().querySelector('app-seal-card')).toBeNull();
    expect(el().querySelector('tbody tr button')).toBeNull();
  });

  describe('export', () => {
    let blobs: Blob[];
    let names: string[];
    beforeEach(() => {
      blobs = []; names = [];
      spyOn(URL, 'createObjectURL').and.callFake((x: Blob | MediaSource) => { blobs.push(x as Blob); return 'blob:x'; });
      spyOn(URL, 'revokeObjectURL');
      spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) { names.push(this.download); });
      listReq().flush(pageOf([b('1')]));
      fixture.detectChanges();
    });
    const click = () => (el().querySelector('.cancelled-bookings__export') as HTMLButtonElement).click();

    it('walks all pages at size 100 with the same filters', async () => {
      filters().filtersChange.emit({ from: '2026-02-01', to: '', projectId: '' });
      listReq().flush(pageOf([b('1')]));
      fixture.detectChanges();
      click();
      const r0 = listReq();
      expect(r0.request.params.get('size')).toBe('100');
      expect(r0.request.params.get('cancelledFrom')).toBe('2026-02-01');
      expect(r0.request.params.get('status')).toBe('CANCELLED');
      r0.flush(pageOf([b('1')], 150, 0));
      const r1 = listReq();
      expect(r1.request.params.get('page')).toBe('1');
      r1.flush(pageOf([b('2')], 150, 1));
      expect(names).toEqual(['cancelled-bookings.csv']);
      expect((await blobs[0].text()).split('\r\n').length).toBe(3);
    });

    it('shows err.export on failure', () => {
      click();
      listReq().error(new ProgressEvent('x'));
      fixture.detectChanges();
      expect(el().textContent).toContain('admin.bookingsEmi.err.export');
      expect(names.length).toBe(0);
    });

    it('empty export is a header-only file', async () => {
      click();
      listReq().flush(pageOf([], 0));
      expect((await blobs[0].text()).split('\r\n').length).toBe(1);
    });
  });
});
