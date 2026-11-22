import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import type { BookingRow } from './booking-table.component';
import { PlotCompareComponent } from './plot-compare.component';

const row = (key: string, plotNo: string, projectName: string, installments: BookingRow['installments'] = []): BookingRow =>
  ({ key, bookedAt: '2026-10-01', plotNo, projectName, total: 1000, paid: 400, rest: 600, installments });
const inst = (n: number, status: string, extra = {}) =>
  ({ installmentNumber: n, amount: 100, dueDate: '2026-10-01', status, paidAt: null, overdue: false, ...extra }) as any;

describe('PlotCompareComponent', () => {
  function render(rows: BookingRow[]) {
    TestBed.configureTestingModule({ imports: [PlotCompareComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(PlotCompareComponent);
    fixture.componentRef.setInput('rows', rows);
    fixture.detectChanges();
    return fixture;
  }

  it('renders one card per row, headed by project and plot no', () => {
    const el = render([row('b1', 'A-1', 'Green'), row('b2', 'B-2', 'Sun')]).nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.plot-compare__card');
    expect(cards.length).toBe(2);
    expect(cards[0].querySelector('h3')!.textContent!.trim()).toBe('Green · A-1');
  });

  it("lists each plot's payments newest first and ignores PENDING rows", () => {
    const el = render([row('b1', 'A-1', 'Green', [
      inst(1, 'PAID', { paidAt: '2026-10-02T00:00:00Z', receiptNo: 'R-1' }),
      inst(2, 'ENTERED', { paidAt: '2026-10-05T00:00:00Z', receiptNo: 'R-2' }),
      inst(3, 'PENDING')]), row('b2', 'B-2', 'Sun')]).nativeElement as HTMLElement;
    const cells = el.querySelectorAll('.plot-compare__card:first-child tbody [data-label="plotBookings.payments.receiptNo"]');
    expect(Array.from(cells).map(c => c.textContent!.trim())).toEqual(['R-2', 'R-1']);
  });

  it('shows the empty text for a plot with no payments', () => {
    const el = render([row('b1', 'A-1', 'Green'), row('b2', 'B-2', 'Sun')]).nativeElement as HTMLElement;
    expect(el.querySelector('.plot-compare__card tbody')!.textContent).toContain('plotBookings.payments.empty');
  });

  it('emits remove with the row key and clear', () => {
    const fixture = render([row('b1', 'A-1', 'Green'), row('b2', 'B-2', 'Sun')]);
    const removed: string[] = [];
    let cleared = 0;
    fixture.componentInstance.remove.subscribe(k => removed.push(k));
    fixture.componentInstance.clear.subscribe(() => cleared++);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.plot-compare__remove') as HTMLButtonElement).click();
    (el.querySelector('.plot-compare__clear') as HTMLButtonElement).click();
    expect(removed).toEqual(['b1']);
    expect(cleared).toBe(1);
  });
});
