import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { BookingTableComponent } from './booking-table.component';

describe('BookingTableComponent', () => {
  function render(plotType: string | null) {
    TestBed.configureTestingModule({ imports: [BookingTableComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(BookingTableComponent);
    fixture.componentRef.setInput('rows', [{ key: 'b1', bookedAt: '2026-10-01', plotType, total: 0, paid: 0, rest: 0 }]);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-label="plotBookings.table.plotType"]')!.textContent!.trim();
  }

  it('shows the plot type through its label, not the raw enum', () => {
    expect(render('CORNER_PARK_FACING')).toBe('plotTile.type.CORNER_PARK_FACING');
  });

  it('Total row sums the area column, labelled for stacked mode', () => {
    TestBed.configureTestingModule({ imports: [BookingTableComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(BookingTableComponent);
    const row = (key: string, areaSqft: number | null) => ({ key, bookedAt: '2026-10-01', areaSqft, total: 0, paid: 0, rest: 0 });
    fixture.componentRef.setInput('rows', [row('b1', 1200.5), row('b2', 1000), row('b3', null)]);
    fixture.detectChanges();
    const cell = (fixture.nativeElement as HTMLElement).querySelector('tfoot [data-label="plotBookings.table.area"]')!;
    expect(cell.textContent!.trim()).toBe('2,200.5');
    expect(cell.parentElement!.children.length).toBe(17);
  });

  it('View popup lists only payments, with receipt no and a dash for an unconfirmed payment date', () => {
    TestBed.configureTestingModule({ imports: [BookingTableComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(BookingTableComponent);
    const inst = (n: number, status: string, extra = {}) => ({ installmentNumber: n, amount: 100, dueDate: '2026-10-01', status, paidAt: null, overdue: false, ...extra });
    fixture.componentRef.setInput('inline', true);
    fixture.componentRef.setInput('rows', [{ key: 'b1', bookedAt: '2026-10-01', total: 0, paid: 0, rest: 0, installments: [
      inst(1, 'PAID', { paidAt: '2026-10-02T00:00:00Z', confirmedAt: '2026-10-03T00:00:00Z', receiptNo: 'R-1', paymentMode: 'CHEQUE', paymentRef: 'CHQ9' }),
      inst(2, 'ENTERED', { paidAt: '2026-10-05T00:00:00Z', receiptNo: 'R-2', paymentMode: 'NEFT', paymentRef: 'N7' }),
      inst(3, 'PENDING')] }]);
    fixture.componentInstance.expandedKey = 'b1';
    fixture.detectChanges();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.booking-table__installments tbody tr');
    expect(rows.length).toBe(2);
    const cells = (i: number) => Array.from(rows[i].querySelectorAll('td')).map(td => td.textContent!.trim());
    expect(cells(0)[0]).toBe('1');
    expect(cells(0)[1]).toBe('—');
    expect(cells(0)[3]).toBe('R-2');
    expect(cells(1)[3]).toBe('R-1');
    expect(cells(1)[5]).toBe('CHQ9');
  });

  it('View popup shows an empty state when nothing has been paid yet', () => {
    TestBed.configureTestingModule({ imports: [BookingTableComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(BookingTableComponent);
    fixture.componentRef.setInput('inline', true);
    fixture.componentRef.setInput('rows', [{ key: 'b1', bookedAt: '2026-10-01', total: 0, paid: 0, rest: 0, installments: [
      { installmentNumber: 1, amount: 100, dueDate: '2026-10-01', status: 'PENDING', paidAt: null, overdue: false }] }]);
    fixture.componentInstance.expandedKey = 'b1';
    fixture.detectChanges();
    const body = (fixture.nativeElement as HTMLElement).querySelector('.booking-table__installments tbody')!;
    expect(body.textContent).toContain('plotBookings.payments.empty');
    expect(body.querySelectorAll('tr').length).toBe(1);
  });

  it('View popup headers are the six payment columns', () => {
    TestBed.configureTestingModule({ imports: [BookingTableComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(BookingTableComponent);
    fixture.componentRef.setInput('inline', true);
    fixture.componentRef.setInput('rows', [{ key: 'b1', bookedAt: '2026-10-01', total: 0, paid: 0, rest: 0, installments: [] }]);
    fixture.componentInstance.expandedKey = 'b1';
    fixture.detectChanges();
    const heads = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.booking-table__installments th')).map(th => th.textContent!.trim());
    expect(heads.map(h => h.replace(/^\S+(?=plotBookings)/, ''))).toEqual(
      ['serialNo', 'paymentDate', 'amount', 'receiptNo', 'mode', 'instrumentNo', 'date'].map(k => jasmine.stringMatching(`${k === 'serialNo' ? 'common' : 'plotBookings.payments'}.${k}$`)) as any);
  });

  it('shows a dash when the plot type is missing', () => {
    expect(render(null)).toBe('—');
  });

  describe('filters', () => {
    function setup(filterAssociate: boolean) {
      TestBed.configureTestingModule({ imports: [BookingTableComponent, TranslateModule.forRoot()] });
      const fixture = TestBed.createComponent(BookingTableComponent);
      const row = (key: string, plotNo: string, associateCode: string, total: number) => ({ key, bookedAt: '2026-10-01', plotNo, associateCode, total, paid: 0, rest: 0 });
      fixture.componentRef.setInput('filterAssociate', filterAssociate);
      fixture.componentRef.setInput('rows', [row('a', 'A-12', 'PC100', 10), row('b', 'B-7', 'PC200', 20)]);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const type = (i: number, v: string) => { const inp = el.querySelectorAll('input')[i] as HTMLInputElement; inp.value = v; inp.dispatchEvent(new Event('input')); fixture.detectChanges(); };
      return { el, type, dataRows: () => el.querySelectorAll('tbody tr[data-booking-id]').length };
    }

    it('plot filter narrows rows and totals', () => {
      const t = setup(false);
      t.type(0, 'b-');
      expect(t.dataRows()).toBe(1);
      expect(t.el.querySelector('tfoot [data-label="plotBookings.table.totalPrice"]')!.textContent).toContain('20');
    });

    it('associate filter only appears when enabled and filters by associate code', () => {
      expect(setup(false).el.querySelectorAll('input').length).toBe(1);
      TestBed.resetTestingModule();
      const t = setup(true);
      expect(t.el.querySelectorAll('input').length).toBe(2);
      t.type(1, 'pc200');
      expect(t.dataRows()).toBe(1);
      t.type(1, 'zzz');
      expect(t.dataRows()).toBe(0);
      expect(t.el.querySelector('.booking-table__empty')).toBeTruthy();
    });
  });
});
