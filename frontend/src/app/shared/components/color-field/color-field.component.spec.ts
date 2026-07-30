import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ColorFieldComponent } from './color-field.component';

describe('ColorFieldComponent', () => {
  let fixture: ComponentFixture<ColorFieldComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColorFieldComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(ColorFieldComponent);
    fixture.componentInstance.value = '#7C3AED';
    fixture.detectChanges();
  });

  it('emits when the native color picker changes', () => {
    const spy = jasmine.createSpy('valueChange');
    fixture.componentInstance.valueChange.subscribe(spy);

    fixture.componentInstance.onPickerChange('#E11D48');

    expect(spy).toHaveBeenCalledWith('#E11D48');
  });

  it('emits when the typed hex is a full valid match', () => {
    const spy = jasmine.createSpy('valueChange');
    fixture.componentInstance.valueChange.subscribe(spy);

    fixture.componentInstance.onHexChange('#22D3EE');

    expect(spy).toHaveBeenCalledWith('#22D3EE');
  });

  it('does not emit for a partial or invalid typed hex', () => {
    const spy = jasmine.createSpy('valueChange');
    fixture.componentInstance.valueChange.subscribe(spy);

    fixture.componentInstance.onHexChange('#22D');
    fixture.componentInstance.onHexChange('purple');

    expect(spy).not.toHaveBeenCalled();
  });

  it('renders the swatch with the current color', () => {
    const swatch = fixture.nativeElement.querySelector('.color-field__swatch');
    expect(swatch.style.background).toContain('124, 58, 237');
  });
});
