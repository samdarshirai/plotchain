import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { OverdueReportComponent } from './overdue-report.component';

describe('OverdueReportComponent', () => {
  let fixture: ComponentFixture<OverdueReportComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    bookingId: id, plotId: 'plot-' + id + '-xxxxxxxx', plotNo: 'A-12', associateId: 'a', associateName: 'Jane', buyerName: 'Rohit',
    overdueCount: 2, overdueAmount: 5000, oldestDueDate: '2026-01-05', ...over
  });
  const pageOf = (rows: unknown[], total = rows.length, page = 0) => ({ rows, page, size: 20, totalElements: total });
  const req = () => http.expectOne(r => r.url === '/api/admin/emi-reports/overdue');
  const rowEls = () => el().querySelectorAll('tbody tr');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [OverdueReportComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(OverdueReportComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  it('renders rows with plot, associate, count, amount and oldest due date', () => {
    const r = req();
    expect(r.request.params.get('page')).toBe('0');
    expect(r.request.params.get('size')).toBe('20');
    r.flush(pageOf([row('b1')]));
    fixture.detectChanges();
    const cells = Array.from(rowEls()[0].querySelectorAll('td')).map(c => c.textContent!.trim());
    expect(rowEls().length).toBe(1);
    expect(cells[0]).toContain('Rohit');
    expect(cells[0]).toContain('A-12');
    expect(cells[1]).toBe('Jane');
    expect(cells[2]).toBe('2');
    expect(cells[3]).toContain('5,000');
    expect(cells[4]).toContain('Jan 5, 2026');
    expect(rowEls()[0].querySelector('td')!.getAttribute('data-label')).toBe('admin.bookingsEmi.col.buyer');
  });

  it('falls back to the short plot id when plotNo is missing', () => {
    req().flush(pageOf([row('b1', { plotNo: null })]));
    fixture.detectChanges();
    expect(rowEls()[0].textContent).toContain('plot-b1-');
  });

  it('shows a skeleton until the first response arrives', () => {
    expect(el().querySelectorAll('.overdue-report__skeleton-row').length).toBe(3);
    req().flush(pageOf([row('b1')]));
    fixture.detectChanges();
    expect(el().querySelector('.overdue-report__skeleton-row')).toBeNull();
  });

  it('emits the total after loading', () => {
    const totals: number[] = [];
    fixture.componentInstance.total.subscribe((n: number) => totals.push(n));
    req().flush(pageOf([row('b1')], 41));
    expect(totals).toEqual([41]);
  });

  it('emits openBooking with the booking id on click, Enter and Space', () => {
    const ids: string[] = [];
    fixture.componentInstance.openBooking.subscribe((id: string) => ids.push(id));
    req().flush(pageOf([row('b1'), row('b2')]));
    fixture.detectChanges();
    const rows = rowEls();
    expect(rows[0].getAttribute('tabindex')).toBe('0');
    (rows[0] as HTMLElement).click();
    rows[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const space = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    rows[0].dispatchEvent(space);
    expect(ids).toEqual(['b1', 'b2', 'b1']);
    expect(space.defaultPrevented).toBeTrue();
  });

  it('shows the calm empty state when nothing is overdue', () => {
    req().flush(pageOf([]));
    fixture.detectChanges();
    expect(el().textContent).toContain('admin.bookingsEmi.empty.overdueTitle');
    expect(el().textContent).toContain('admin.bookingsEmi.empty.overdueBody');
    expect(el().querySelector('table')).toBeNull();
    expect(el().querySelector('.overdue-report__retry')).toBeNull();
  });

  it('shows an error banner when the first load fails and Try again re-requests page 0', () => {
    req().flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelector('.overdue-report__skeleton-row')).toBeNull();
    expect(el().textContent).toContain('admin.bookingsEmi.err.loadOverdue');
    el().querySelector<HTMLButtonElement>('.overdue-report__retry')!.click();
    const r = req();
    expect(r.request.params.get('page')).toBe('0');
    r.flush(pageOf([row('b1')]));
    fixture.detectChanges();
    expect(el().querySelector('.overdue-report__retry')).toBeNull();
    expect(rowEls().length).toBe(1);
  });

  it('keeps the previous page visible with an error banner on a failed next-page load, and Try again re-requests that page', () => {
    req().flush(pageOf([row('b1')], 25));
    fixture.detectChanges();
    el().querySelector<HTMLButtonElement>('.overdue-report__next')!.click();
    req().flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(rowEls().length).toBe(1);
    expect(rowEls()[0].textContent).toContain('Rohit');
    expect(el().textContent).toContain('admin.bookingsEmi.err.loadOverdue');
    el().querySelector<HTMLButtonElement>('.overdue-report__retry')!.click();
    const r = req();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pageOf([row('b2', { buyerName: 'Meera' })], 25, 1));
    fixture.detectChanges();
    expect(rowEls()[0].textContent).toContain('Meera');
    expect(el().querySelector('.overdue-report__retry')).toBeNull();
  });

  it('pages with Next using page=1, and Previous is disabled on the first page', () => {
    req().flush(pageOf([row('b1')], 25));
    fixture.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('.overdue-report__prev')!.disabled).toBeTrue();
    el().querySelector<HTMLButtonElement>('.overdue-report__next')!.click();
    const r = req();
    expect(r.request.params.get('page')).toBe('1');
    r.flush(pageOf([row('b2')], 25, 1));
    fixture.detectChanges();
    expect(el().querySelector<HTMLButtonElement>('.overdue-report__next')!.disabled).toBeTrue();
    expect(el().querySelector<HTMLButtonElement>('.overdue-report__prev')!.disabled).toBeFalse();
  });

  it('ignores a stale response that arrives after a newer one', () => {
    req().flush(pageOf([row('b1')], 45));
    fixture.detectChanges();
    const c = fixture.componentInstance;
    c.goTo(1);
    const first = req();
    c.goTo(2);
    const second = req();
    second.flush(pageOf([row('b3', { buyerName: 'Newest' })], 45, 2));
    first.flush(pageOf([row('b2', { buyerName: 'Stale' })], 45, 1));
    fixture.detectChanges();
    expect(rowEls()[0].textContent).toContain('Newest');
    expect(el().textContent).not.toContain('Stale');
  });
});
