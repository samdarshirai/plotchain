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
    expect(cell.parentElement!.children.length).toBe(14);
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
    expect(cells(0)[0]).toBe('—');
    expect(cells(0)[2]).toBe('R-2');
    expect(cells(1)[2]).toBe('R-1');
    expect(cells(1)[4]).toBe('CHQ9');
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
      ['paymentDate', 'amount', 'receiptNo', 'mode', 'instrumentNo', 'date'].map(k => jasmine.stringMatching(`plotBookings.payments.${k}$`)) as any);
  });

  it('shows a dash when the plot type is missing', () => {
    expect(render(null)).toBe('—');
  });
});
