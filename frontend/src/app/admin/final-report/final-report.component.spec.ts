import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { FinalReportComponent } from './final-report.component';
import { fitTable } from '../../shared/utils/table-fit';
import { FinalReport, FinalReportTable } from '../models/final-report.model';

describe('FinalReportComponent', () => {
  let fixture: ComponentFixture<FinalReportComponent>;
  let httpMock: HttpTestingController;
  const URL = '/api/admin/cycles/final-report';

  const report = (over: Partial<FinalReport> = {}): FinalReport => ({
    cycleId: 'c1', periodStart: '2026-11-01', periodEnd: '2026-11-15', status: 'CLOSED',
    totalBusiness: 1000000, netCommission: 250000, incomeTypeTotals: [],
    expenses: [{ name: 'Salary', amount: 10000 }, { name: 'Trip Expense', amount: 40000 }],
    totalExpenses: 50000, totalPayout: 300000, payoutPercent: 30,
    refunds: [{ name: 'Plot Cancellation Refund', amount: 30000 }],
    totalRefunds: 30000, ...over
  });

  const table = (over: Partial<FinalReportTable> = {}): FinalReportTable => ({
    expenseTypes: ['Salary', 'Trip Expense'],
    refundTypes: ['Plot Cancellation Refund'],
    rows: [report(), report({ cycleId: 'c2', periodStart: '2026-11-16', periodEnd: null, status: 'OPEN', totalPayout: 100000, payoutPercent: 10 })],
    total: report({ cycleId: null as unknown as string, periodStart: null as unknown as string, periodEnd: null, status: null as never, totalBusiness: 2000000, totalPayout: 400000, payoutPercent: 20 }),
    allCycles: [
      { cycleId: 'c2', periodStart: '2026-11-16', periodEnd: null, status: 'OPEN' },
      { cycleId: 'c1', periodStart: '2026-11-01', periodEnd: '2026-11-15', status: 'CLOSED' }
    ],
    ...over
  });

  const load = (t: FinalReportTable = table()) => {
    httpMock.expectOne(r => r.url === URL && !r.params.has('cycleIds')).flush(t);
    fixture.detectChanges();
  };
  const refetch = (ids: string, t: FinalReportTable) => {
    httpMock.expectOne(r => r.url === URL && r.params.get('cycleIds') === ids).flush(t);
    fixture.detectChanges();
  };
  const select = () => el().querySelector('.final-report__filter select') as HTMLSelectElement;
  const pick = (value: string) => { select().value = value; select().dispatchEvent(new Event('change')); };
  const el = (): HTMLElement => fixture.nativeElement;
  const rows = () => Array.from(el().querySelectorAll('tbody tr'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FinalReportComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(FinalReportComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders one row per cycle plus a Total row, with ongoing for an open period', () => {
    load();
    expect(rows().length).toBe(3);
    expect(rows()[0].textContent).toContain('3,00,000');
    expect(rows()[1].textContent).toContain('admin.cycleManagement.ongoing');
  });

  it('renders one column per expense and refund type, in server order', () => {
    load();
    const heads = Array.from(el().querySelectorAll('thead th')).map(h => h.textContent!.trim());
    expect(heads).toEqual([
      'admin.finalReport.columnCycle', 'admin.finalReport.totalBusiness', 'admin.finalReport.netCommission',
      'Salary', 'Trip Expense', 'admin.finalReport.totalPayout', 'admin.finalReport.payoutPercent',
      'Plot Cancellation Refund'
    ]);
    expect(rows()[0].querySelectorAll('td').length).toBe(heads.length);
  });

  it('last row is Total with server totals and Payout % as received', () => {
    load();
    const last = rows()[2];
    expect(last.textContent).toContain('admin.finalReport.totalRow');
    expect(last.textContent).toContain('20,00,000');
    expect(last.querySelector('.final-report__payout-percent')!.textContent).toContain('20.00%');
  });

  it('still shows a Total row when there are no cycles', () => {
    load(table({ rows: [] }));
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain('admin.finalReport.totalRow');
  });

  it('shows an inline banner on HTTP error', () => {
    httpMock.expectOne(r => r.url === URL).flush('x', { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(el().querySelector('app-inline-banner')).toBeTruthy();
    expect(el().textContent).toContain('admin.finalReport.loadError');
  });

  it('defaults to All cycles, lists every cycle, and the first call sends no cycleIds', () => {
    load();
    expect(select().value).toBe('');
    expect(select().options.length).toBe(3);
    expect(select().textContent).toContain('admin.cycleManagement.ongoing');
  });

  it('picking one cycle refetches with just that id', () => {
    load();
    pick('c1');
    refetch('c1', table({ rows: [report()] }));
    expect(rows().length).toBe(2);
    expect(select().options.length).toBe(3);
  });

  it('going back to All cycles refetches without cycleIds', () => {
    load();
    pick('c1');
    refetch('c1', table({ rows: [report()] }));
    pick('');
    httpMock.expectOne(r => r.url === URL && !r.params.has('cycleIds')).flush(table());
    fixture.detectChanges();
    expect(rows().length).toBe(3);
  });

  it('money cells do not wrap', () => {
    load();
    document.body.appendChild(el());
    const cell = el().querySelector('tbody td.table-number') as HTMLElement;
    expect(getComputedStyle(cell).whiteSpace).toBe('nowrap');
    el().remove();
  });

  [390, 800, 1280].forEach(width => {
    it(`table fits without sideways scroll at ${width}px and keeps its Total row`, () => {
      const many = (p: string) => Array.from({ length: 8 }, (_, i) => `${p} ${i}`);
      const pad = (names: string[]) => names.map(name => ({ name, amount: 123456 }));
      const exp = many('Expense type'), ref = many('Refund type');
      load(table({
        expenseTypes: exp, refundTypes: ref,
        rows: [report({ expenses: pad(exp), refunds: pad(ref) })],
        total: report({ cycleId: null as unknown as string, expenses: pad(exp), refunds: pad(ref) })
      }));
      const host = el();
      host.style.cssText = `display:block;width:${width}px`;
      document.body.appendChild(host);
      const t = host.querySelector('table') as HTMLTableElement;
      const filter = host.querySelector('.final-report__filter') as HTMLElement;
      fitTable(t);
      const box = t.closest('.card') as HTMLElement;
      expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
      expect(filter.scrollWidth).toBeLessThanOrEqual(filter.clientWidth);
      expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
      const total = t.querySelector('tbody tr:last-child td') as HTMLElement;
      expect(total.textContent).toContain('admin.finalReport.totalRow');
      expect(total.getAttribute('data-label')).toBe('admin.finalReport.columnCycle');
      if (width < 1280) {
        expect(t.classList.contains('table--stacked')).toBeTrue();
      }
      host.remove();
    });
  });
});
