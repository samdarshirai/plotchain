import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import type { BookingRow } from './booking-table.component';
import { PlotCompareComponent } from './plot-compare.component';

const row = (key: string, plotNo: string, over: Partial<BookingRow> = {}): BookingRow =>
  ({ key, bookedAt: '2026-10-20T00:00:00Z', plotNo, projectName: 'Green', associateCode: 'VSA1', total: 1000, paid: 250, rest: 750, status: 'ACTIVE', installments: [], ...over });
const inst = (n: number, status: string, extra = {}) =>
  ({ installmentNumber: n, amount: 100, dueDate: '2026-10-01', status, paidAt: null, overdue: false, ...extra }) as any;

describe('PlotCompareComponent', () => {
  function render(rows: BookingRow[], inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [PlotCompareComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(PlotCompareComponent);
    fixture.componentRef.setInput('rows', rows);
    Object.entries(inputs).forEach(([k, v]) => fixture.componentRef.setInput(k, v));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, text: () => el.textContent!.replace(/\s+/g, ' ') };
  }

  it('renders a summary column and a payment column per plot', () => {
    const { el } = render([row('b1', 'A-1'), row('b2', 'B-2')]);
    expect(el.querySelectorAll('thead th.plot-compare__plot').length).toBe(2);
    expect(el.querySelectorAll('.plot-compare__cols section').length).toBe(2);
  });

  it('tells two bookings of the same plot apart', () => {
    const { el } = render([row('b1', 'A-2', { associateCode: 'VSA53628' }), row('b2', 'A-2', { associateCode: 'VSA55121', bookedAt: '2026-10-02T00:00:00Z' })]);
    const heads = Array.from(el.querySelectorAll('thead th.plot-compare__plot')).map(h => h.textContent!);
    expect(heads[0]).not.toBe(heads[1]);
    expect(heads[0]).toContain('VSA53628');
    expect(heads[1]).toContain('VSA55121');
  });

  it('summary shows paid percent and the pending count', () => {
    const { text } = render([row('b1', 'A-1', { installments: [inst(1, 'ENTERED', { paidAt: '2026-10-05T00:00:00Z' })] }), row('b2', 'B-2')]);
    expect(text()).toContain('25%');
    expect(text()).toContain('plotBookings.compare.pendingCount');
  });

  it('shows next due and overdue', () => {
    const { text } = render([row('b1', 'A-1', { installments: [
      inst(1, 'PENDING', { dueDate: '2026-12-05', amount: 30000 }),
      inst(2, 'PENDING', { dueDate: '2026-10-05', amount: 30000, overdue: true }),
      inst(3, 'PENDING', { dueDate: '2026-11-05', amount: 30000, overdue: true })] }), row('b2', 'B-2')]);
    expect(text()).toContain('5 Oct 2026');
    expect(text()).toContain('plotBookings.compare.overdue');
  });

  it('cancelled booking shows badge, refund and no next due', () => {
    const { el, text } = render([row('b1', 'A-1', { status: 'CANCELLED', refundAmount: 270000, installments: [inst(1, 'PENDING', { dueDate: '2026-12-05' })] }), row('b2', 'B-2')]);
    expect(text()).toContain('plotBookings.compare.status.CANCELLED');
    expect(text()).toContain('plotBookings.compare.refund');
    const nextDue = el.querySelector('td[data-label] ~ td.plot-compare__nextdue, td.plot-compare__nextdue')!;
    expect(nextDue.textContent!.trim()).toBe('—');
  });

  it('payments list newest first with a status badge and ignores PENDING rows', () => {
    const { el } = render([row('b1', 'A-1', { installments: [
      inst(1, 'PAID', { paidAt: '2026-10-02T00:00:00Z', receiptNo: 'R-1' }),
      inst(2, 'ENTERED', { paidAt: '2026-10-05T00:00:00Z', receiptNo: 'R-2' }),
      inst(3, 'PENDING')] }), row('b2', 'B-2')]);
    const col = el.querySelector('.plot-compare__cols section')!;
    const receipts = Array.from(col.querySelectorAll('tbody [data-label="plotBookings.payments.receiptNo"]')).map(c => c.textContent!.trim());
    expect(receipts).toEqual(['R-2', 'R-1']);
    expect(col.querySelector('tbody tr')!.textContent).toContain('plotBookings.compare.paymentStatus.ENTERED');
  });

  it('shows the empty text for a plot with no payments', () => {
    const { el } = render([row('b1', 'A-1'), row('b2', 'B-2')]);
    expect(el.querySelector('.plot-compare__cols section tbody')!.textContent).toContain('plotBookings.payments.empty');
  });

  it('emits remove with the row key and clear', () => {
    const { fixture, el } = render([row('b1', 'A-1'), row('b2', 'B-2')]);
    const removed: string[] = [];
    let cleared = 0;
    fixture.componentInstance.remove.subscribe(k => removed.push(k));
    fixture.componentInstance.clear.subscribe(() => cleared++);
    (el.querySelector('.plot-compare__remove') as HTMLButtonElement).click();
    (el.querySelector('.plot-compare__clear') as HTMLButtonElement).click();
    expect(removed).toEqual(['b1']);
    expect(cleared).toBe(1);
  });

  it('add control lists available plots by label and emits the chosen key', () => {
    const { fixture, el } = render([row('b1', 'A-1'), row('b2', 'B-2')], {
      available: [row('b3', 'C-3', { associateCode: 'VSA9' }), row('b4', 'D-4')] });
    const added: string[] = [];
    fixture.componentInstance.add.subscribe(k => added.push(k));
    const labels = Array.from(el.querySelectorAll('datalist option')).map(o => (o as HTMLOptionElement).value);
    expect(labels.length).toBe(2);
    expect(labels[0]).toContain('C-3');
    expect(labels[0]).toContain('VSA9');
    const input = el.querySelector('input.plot-compare__add') as HTMLInputElement;
    input.value = labels[0];
    input.dispatchEvent(new Event('change'));
    expect(added).toEqual(['b3']);
    expect(input.value).toBe('');
  });

  it('add control is hidden when nothing is available or at max, with the note at max', () => {
    expect(render([row('b1', 'A-1'), row('b2', 'B-2')]).el.querySelector('input.plot-compare__add')).toBeNull();
    TestBed.resetTestingModule();
    const atMax = render([row('b1', 'A-1'), row('b2', 'B-2')], { available: [row('b3', 'C-3')], atMax: true });
    expect(atMax.el.querySelector('input.plot-compare__add')).toBeNull();
    expect(atMax.text()).toContain('plotBookings.compare.maxNote');
  });
});
