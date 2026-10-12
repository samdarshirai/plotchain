import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { LastEmiComponent } from './last-emi.component';

describe('LastEmiComponent', () => {
  let fixture: ComponentFixture<LastEmiComponent>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;
  const URL = '/api/admin/emi-reports/last-emi';
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    bookingId: id, bookedAt: '2026-01-05T10:00:00Z', associateCode: 'AS001', associateName: 'Jane', buyerName: 'Rohit',
    buyerPhone: '9999900000', plotNo: 'A-12', projectName: 'Green Park', lastDueDate: '2026-12-05', discount: 500,
    total: 1000, paid: 400, rest: 600, ...over
  });
  const req = () => http.expectOne(r => r.url === URL);
  const rowEls = () => el().querySelectorAll('tbody tr');
  const cells = (tr: Element) => Array.from(tr.querySelectorAll('td')).map(c => c.textContent!.trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LastEmiComponent, HttpClientTestingModule, TranslateModule.forRoot()] }).compileComponents();
    fixture = TestBed.createComponent(LastEmiComponent);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => { http.match(() => true); });

  it('loads on init with no params', () => {
    const r = req();
    expect(r.request.params.keys().length).toBe(0);
    r.flush([]);
  });

  it('a filter change sends from, to and projectId', () => {
    req().flush([]);
    fixture.componentInstance.onFilters({ from: '2026-01-01', to: '2026-02-01', projectId: 'p1' });
    const r = req();
    expect(r.request.params.get('from')).toBe('2026-01-01');
    expect(r.request.params.get('to')).toBe('2026-02-01');
    expect(r.request.params.get('projectId')).toBe('p1');
    r.flush([]);
  });

  it('renders the columns with dashes for null mobile and discount', () => {
    req().flush([row('b1'), row('b2', { buyerPhone: null, discount: null })]);
    fixture.detectChanges();
    const heads = Array.from(el().querySelectorAll('thead th')).map(h => h.textContent!.trim());
    expect(heads.length).toBe(12);
    const c = cells(rowEls()[0]);
    expect(c[1]).toBe('AS001');
    expect(c[2]).toBe('Jane');
    expect(c[3]).toBe('Rohit');
    expect(c[4]).toBe('9999900000');
    expect(c[5]).toBe('A-12');
    expect(c[6]).toBe('Green Park');
    expect(c[8]).toContain('500');
    const d = cells(rowEls()[1]);
    expect(d[4]).toBe('—');
    expect(d[8]).toBe('—');
  });

  it('the footer sums Total, Paid and Rest client-side', () => {
    req().flush([row('b1'), row('b2', { total: 2000, paid: 100, rest: 1900 })]);
    fixture.detectChanges();
    const foot = el().querySelector('tfoot tr')!;
    expect(foot.querySelector('td[colspan="9"]')).not.toBeNull();
    const nums = Array.from(foot.querySelectorAll('td:not([colspan])')).map(c => c.textContent!.trim());
    expect(nums[0]).toContain('3,000');
    expect(nums[1]).toContain('500');
    expect(nums[2]).toContain('2,500');
  });

  it('has no pager', () => {
    req().flush([row('b1')]);
    fixture.detectChanges();
    expect(el().querySelector('app-pager')).toBeNull();
  });

  it('shows a skeleton, then the empty state', () => {
    expect(el().querySelector('.booking-register__skeleton')).not.toBeNull();
    req().flush([]);
    fixture.detectChanges();
    expect(el().querySelector('.booking-register__skeleton')).toBeNull();
    expect(el().querySelector('.booking-register__empty')!.textContent).toContain('admin.bookingsEmi.empty.lastEmiTitle');
  });

  it('shows an error with Retry that reloads', () => {
    req().flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelector('app-inline-banner')).not.toBeNull();
    (el().querySelector('.last-emi__retry') as HTMLButtonElement).click();
    req().flush([row('b1')]);
    fixture.detectChanges();
    expect(rowEls().length).toBe(1);
    expect(el().querySelector('app-inline-banner')).toBeNull();
  });

  it('ignores a stale response', () => {
    const first = req();
    fixture.componentInstance.onFilters({ from: '', to: '', projectId: 'p2' });
    const second = req();
    second.flush([row('new')]);
    first.flush([row('old'), row('old2')]);
    fixture.detectChanges();
    expect(rowEls().length).toBe(1);
  });

  const trapDownload = () => {
    const blobs: Blob[] = []; const names: string[] = [];
    spyOn(window.URL, 'createObjectURL').and.callFake((b: Blob | MediaSource) => { blobs.push(b as Blob); return 'blob:x'; });
    spyOn(window.URL, 'revokeObjectURL');
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) { names.push(this.download); });
    return { blobs, names };
  };

  it('Export CSV exports the loaded rows to emi-last-date.csv without another request', async () => {
    const t = trapDownload();
    req().flush([row('b1')]);
    fixture.detectChanges();
    (el().querySelector('.last-emi__export') as HTMLButtonElement).click();
    expect(t.names).toEqual(['emi-last-date.csv']);
    expect((await t.blobs[0].text()).split('\r\n').length).toBe(2);
    http.expectNone(URL);
  });

  const exportBtn = () => el().querySelector('.last-emi__export') as HTMLButtonElement;

  it('Export is disabled while loading', () => {
    expect(exportBtn().disabled).toBeTrue();
    req().flush([row('b1')]);
    fixture.detectChanges();
    expect(exportBtn().disabled).toBeFalse();
  });

  it('Export stays disabled after a failed filter reload', () => {
    req().flush([row('b1')]);
    fixture.componentInstance.onFilters({ from: '2026-01-01', to: '', projectId: '' });
    req().flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(exportBtn().disabled).toBeTrue();
  });

  it('associate id and mobile cells use the num class', () => {
    req().flush([row('b1')]);
    fixture.detectChanges();
    const tds = rowEls()[0].querySelectorAll('td');
    expect(tds[1].classList).toContain('booking-register__num');
    expect(tds[4].classList).toContain('booking-register__num');
  });

  it('Export CSV is header-only when empty', async () => {
    const t = trapDownload();
    req().flush([]);
    fixture.detectChanges();
    (el().querySelector('.last-emi__export') as HTMLButtonElement).click();
    expect((await t.blobs[0].text()).split('\r\n').length).toBe(1);
  });
});
