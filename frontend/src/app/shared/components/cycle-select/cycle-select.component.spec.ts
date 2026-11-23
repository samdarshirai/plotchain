import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { CycleSelectComponent } from './cycle-select.component';

describe('CycleSelectComponent', () => {
  const cycles = [
    { id: 'c1', periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-10-15T00:00:00Z' },
    { id: 'c2', periodStart: '2026-10-16T00:00:00Z', periodEnd: null }
  ];
  const make = () => {
    TestBed.configureTestingModule({ imports: [CycleSelectComponent, TranslateModule.forRoot()] });
    const c = TestBed.createComponent(CycleSelectComponent).componentInstance;
    c.cycles = cycles;
    return c;
  };

  it('picking a cycle emits its date range', () => {
    const c = make();
    const spy = jasmine.createSpy();
    c.rangeChange.subscribe(spy);
    c.pick('c1');
    expect(spy).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-15' });
  });

  it('selection follows from/to and clears when dates are hand-edited', () => {
    const c = make();
    c.from = '2026-10-01'; c.to = '2026-10-15';
    expect(c.selectedId).toBe('c1');
    c.to = '2026-10-14';
    expect(c.selectedId).toBe('');
  });

  it('open cycle starting after today never emits from > to', () => {
    const c = make();
    const future = new Date(Date.now() + 3 * 864e5).toISOString();
    c.cycles = [{ id: 'f', periodStart: future, periodEnd: null }];
    const spy = jasmine.createSpy();
    c.rangeChange.subscribe(spy);
    c.pick('f');
    const r = spy.calls.mostRecent().args[0];
    expect(r.to >= r.from).toBeTrue();
  });

  it('"All cycles" clears the date range', () => {
    const c = make();
    const spy = jasmine.createSpy();
    c.rangeChange.subscribe(spy);
    c.pick('');
    expect(spy).toHaveBeenCalledWith({ from: '', to: '' });
  });
});
