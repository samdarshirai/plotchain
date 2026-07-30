import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToggleGroupComponent } from './toggle-group.component';

describe('ToggleGroupComponent', () => {
  let fixture: ComponentFixture<ToggleGroupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToggleGroupComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(ToggleGroupComponent);
    fixture.componentInstance.options = [
      { value: 'strict', label: 'Strict' },
      { value: 'relaxed', label: 'Relaxed' }
    ];
  });

  it('renders one button per option', () => {
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.toggle-group__option');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('Strict');
    expect(buttons[1].textContent).toContain('Relaxed');
  });

  it('clicking an option emits the value', () => {
    fixture.detectChanges();
    const spy = jasmine.createSpy('valueChange');
    fixture.componentInstance.valueChange.subscribe(spy);
    const buttons = fixture.nativeElement.querySelectorAll('.toggle-group__option');
    buttons[1].click();
    expect(spy).toHaveBeenCalledWith('relaxed');
  });

  it('applies the active class to the active option', () => {
    fixture.componentInstance.value = 'relaxed';
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll('.toggle-group__option');
    expect(buttons[0].classList.contains('toggle-group__option--active')).toBeFalse();
    expect(buttons[1].classList.contains('toggle-group__option--active')).toBeTrue();
  });

  it('does not re-emit when clicking the already-active option', () => {
    fixture.componentInstance.value = 'strict';
    fixture.detectChanges();
    const spy = jasmine.createSpy('valueChange');
    fixture.componentInstance.valueChange.subscribe(spy);
    const buttons = fixture.nativeElement.querySelectorAll('.toggle-group__option');
    buttons[0].click();
    expect(spy).not.toHaveBeenCalled();
  });
});
