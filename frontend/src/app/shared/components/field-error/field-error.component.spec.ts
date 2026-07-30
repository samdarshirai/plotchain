import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldErrorComponent } from './field-error.component';

describe('FieldErrorComponent', () => {
  let fixture: ComponentFixture<FieldErrorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FieldErrorComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(FieldErrorComponent);
  });

  it('renders the message when present', () => {
    fixture.componentInstance.message = 'must not be blank';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.field-error').textContent).toContain('must not be blank');
  });

  it('renders nothing when the message is absent', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.field-error')).toBeFalsy();
  });
});
