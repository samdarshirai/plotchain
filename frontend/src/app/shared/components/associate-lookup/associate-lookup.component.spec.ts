import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateLookupComponent } from './associate-lookup.component';
import { AssociateSummary } from '../../../admin/models/associate-summary.model';

describe('AssociateLookupComponent', () => {
  let fixture: ComponentFixture<AssociateLookupComponent>;
  let c: AssociateLookupComponent;
  const associates: AssociateSummary[] = [
    { id: 'a1', userId: 'VP00001', name: 'Jane Doe', role: 'ASSOCIATE', status: 'ACTIVE', hasFreeSlot: true },
    { id: 'a2', userId: 'VP00002', name: 'Ravi Kumar', role: 'ASSOCIATE', status: 'ACTIVE', hasFreeSlot: false }
  ];
  const el = () => fixture.nativeElement as HTMLElement;
  const type = (v: string) => {
    const input = el().querySelector('input') as HTMLInputElement;
    input.value = v;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssociateLookupComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(AssociateLookupComponent);
    c = fixture.componentInstance;
    c.associates = associates;
    fixture.detectChanges();
  });

  it('lists matches by userId, case-insensitive', () => {
    type('vp00002');
    const opts = el().querySelectorAll('[role="option"]');
    expect(opts.length).toBe(1);
    expect(opts[0].textContent).toContain('Ravi Kumar');
  });

  it('lists matches by name', () => {
    type('jane');
    expect(el().querySelectorAll('[role="option"]').length).toBe(1);
  });

  it('shows the no-match key when nothing matches', () => {
    type('zzz');
    expect(el().textContent).toContain('admin.epinRegister.lookupNoMatch');
  });

  it('emits the associate when an option is picked', () => {
    const spy = jasmine.createSpy('selected');
    c.selected.subscribe(spy);
    type('jane');
    (el().querySelector('[role="option"]') as HTMLElement).dispatchEvent(new Event('mousedown'));
    expect(spy).toHaveBeenCalledWith(associates[0]);
  });

  it('shows the chosen associate and clears with null', () => {
    const spy = jasmine.createSpy('selected');
    c.selected.subscribe(spy);
    c.value = 'a1';
    fixture.detectChanges();
    expect(el().querySelector('.associate-lookup__chosen')!.textContent).toContain('VP00001');
    (el().querySelector('.associate-lookup__clear') as HTMLElement).click();
    expect(spy).toHaveBeenCalledWith(null);
  });

  it('supports keyboard selection with arrows and enter', () => {
    const spy = jasmine.createSpy('selected');
    c.selected.subscribe(spy);
    type('vp');
    const input = el().querySelector('input') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(spy).toHaveBeenCalledWith(associates[1]);
  });

  it('closes the list on Escape', () => {
    type('vp');
    (el().querySelector('input') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el().querySelectorAll('[role="option"]').length).toBe(0);
  });

  it('prevents default on Escape only while the list is open (so a parent drawer stays open)', () => {
    const input = el().querySelector('input') as HTMLInputElement;
    const closedEsc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    input.dispatchEvent(closedEsc);
    expect(closedEsc.defaultPrevented).toBeFalse();
    type('vp');
    const openEsc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    input.dispatchEvent(openEsc);
    expect(openEsc.defaultPrevented).toBeTrue();
  });
});
