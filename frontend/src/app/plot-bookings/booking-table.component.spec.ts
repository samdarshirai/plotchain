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

  it('shows a dash when the plot type is missing', () => {
    expect(render(null)).toBe('—');
  });
});
