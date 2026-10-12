import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PagerComponent } from './pager.component';

describe('PagerComponent', () => {
  let fixture: ComponentFixture<PagerComponent>;
  let c: PagerComponent;
  const el = () => fixture.nativeElement as HTMLElement;
  const set = (inputs: Partial<Record<'page' | 'size' | 'total' | 'disabled', number | boolean>>) => {
    Object.entries(inputs).forEach(([k, v]) => fixture.componentRef.setInput(k, v));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PagerComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(PagerComponent);
    c = fixture.componentInstance;
  });

  it('renders nothing when total is 0', () => {
    set({ total: 0 });
    expect(el().querySelector('.pager')).toBeNull();
  });

  it('disables Previous on the first page and Next on the last page', () => {
    set({ page: 0, size: 20, total: 45 });
    expect((el().querySelector('.pager__prev') as HTMLButtonElement).disabled).toBeTrue();
    expect((el().querySelector('.pager__next') as HTMLButtonElement).disabled).toBeFalse();
    set({ page: 2 });
    expect((el().querySelector('.pager__prev') as HTMLButtonElement).disabled).toBeFalse();
    expect((el().querySelector('.pager__next') as HTMLButtonElement).disabled).toBeTrue();
  });

  it('emits the next page index when Next is clicked', () => {
    set({ page: 0, size: 20, total: 45 });
    const emitted: number[] = [];
    c.pageChange.subscribe(p => emitted.push(p));
    (el().querySelector('.pager__next') as HTMLButtonElement).click();
    expect(emitted).toEqual([1]);
  });

  it('emits the previous page index when Previous is clicked', () => {
    set({ page: 2, size: 20, total: 45 });
    const emitted: number[] = [];
    c.pageChange.subscribe(p => emitted.push(p));
    (el().querySelector('.pager__prev') as HTMLButtonElement).click();
    expect(emitted).toEqual([1]);
  });

  it('does not emit when disabled', () => {
    set({ page: 1, size: 20, total: 45, disabled: true });
    const emitted: number[] = [];
    c.pageChange.subscribe(p => emitted.push(p));
    (el().querySelector('.pager__next') as HTMLButtonElement).click();
    c.go(0);
    expect(emitted).toEqual([]);
  });

  it('computes totalPages, from and to', () => {
    set({ page: 2, size: 20, total: 45 });
    expect(c.totalPages).toBe(3);
    expect(c.from).toBe(41);
    expect(c.to).toBe(45);
    set({ size: 0 });
    expect(() => c.totalPages).not.toThrow();
  });
});
