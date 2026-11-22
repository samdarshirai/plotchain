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

  it('has no sponsor columns', () => {
    TestBed.configureTestingModule({ imports: [BookingTableComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(BookingTableComponent);
    fixture.componentRef.setInput('rows', [{ key: 'b1', bookedAt: '2026-10-01', total: 0, paid: 0, rest: 0 }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('plotBookings.table.sponsor');
    expect(el.querySelectorAll('thead th').length).toBe(17);
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

  describe('compare mode', () => {
    const crow = (key: string, plotNo: string, withInst = true) =>
      ({ key, bookedAt: '2026-10-01', plotNo, projectName: 'P', total: 0, paid: 0, rest: 0, ...(withInst ? { installments: [] } : {}) });
    function setup(compare: boolean, rows: any[] = [crow('b1', 'A-1'), crow('b2', 'A-2'), crow('b3', 'B-3')]) {
      TestBed.configureTestingModule({ imports: [BookingTableComponent, TranslateModule.forRoot()] });
      const fixture = TestBed.createComponent(BookingTableComponent);
      fixture.componentRef.setInput('compare', compare);
      fixture.componentRef.setInput('rows', rows);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const ticks = () => Array.from(el.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]'));
      const tick = (i: number) => { ticks()[i].click(); fixture.detectChanges(); };
      const cards = () => el.querySelectorAll('.plot-compare__card').length;
      return { fixture, el, ticks, tick, cards };
    }

    it('compare off: no tick column', () => {
      const t = setup(false);
      expect(t.el.querySelectorAll('thead th').length).toBe(17);
      expect(t.ticks().length).toBe(0);
    });

    it('compare on: ticks appear only on rows with installments', () => {
      const t = setup(true, [crow('b1', 'A-1'), crow('b2', 'A-2'), crow('b3', 'B-3', false)]);
      expect(t.ticks().length).toBe(2);
      expect(t.el.querySelectorAll('thead th').length).toBe(18);
      expect(t.el.querySelector('tfoot tr')!.children.length).toBe(18);
    });

    it('no compare view with one plot ticked, cards appear at two, a third adds a card', () => {
      const t = setup(true);
      t.tick(0);
      expect(t.el.querySelector('app-plot-compare')).toBeNull();
      t.tick(1);
      expect(t.cards()).toBe(2);
      t.tick(2);
      expect(t.cards()).toBe(3);
    });

    it('ticks survive a plot filter', () => {
      const t = setup(true);
      t.tick(0);
      t.tick(1);
      t.fixture.componentInstance.plotFilter = 'B-3';
      t.fixture.detectChanges();
      expect(t.cards()).toBe(2);
    });

    it('a ticked plot that leaves rows drops out of the comparison', () => {
      const t = setup(true);
      t.tick(0);
      t.tick(1);
      t.fixture.componentRef.setInput('rows', [crow('b2', 'A-2'), crow('b3', 'B-3')]);
      t.fixture.detectChanges();
      expect(t.fixture.componentInstance.comparedRows.length).toBe(1);
      expect(t.el.querySelector('app-plot-compare')).toBeNull();
    });

    it('removing from a card unticks it and clearing empties the selection', () => {
      const t = setup(true);
      t.tick(0);
      t.tick(1);
      t.fixture.componentInstance.removeCompared('b1');
      t.fixture.detectChanges();
      expect(t.ticks()[0].checked).toBeFalse();
      t.fixture.componentInstance.clearCompared();
      expect(t.fixture.componentInstance.compared.size).toBe(0);
    });

    it('empty-state colspan follows the column count', () => {
      expect(setup(true, []).el.querySelector('td[colspan]')!.getAttribute('colspan')).toBe('18');
      TestBed.resetTestingModule();
      expect(setup(false, []).el.querySelector('td[colspan]')!.getAttribute('colspan')).toBe('17');
    });
  });
});
