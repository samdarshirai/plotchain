import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrandButtonComponent } from './brand-button.component';

@Component({
  standalone: true,
  imports: [BrandButtonComponent],
  template: `<app-brand-button>Click me</app-brand-button>`
})
class HostComponent {}

describe('BrandButtonComponent', () => {
  let fixture: ComponentFixture<BrandButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandButtonComponent, HostComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(BrandButtonComponent);
  });

  it('projects content', () => {
    const hostFixture = TestBed.createComponent(HostComponent);
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.brand-button').textContent).toContain('Click me');
  });

  it('emits clicked on click', () => {
    fixture.detectChanges();
    const spy = jasmine.createSpy('clicked');
    fixture.componentInstance.clicked.subscribe(spy);
    fixture.nativeElement.querySelector('button').click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('suppresses emit when disabled', () => {
    fixture.componentInstance.disabled = true;
    fixture.detectChanges();
    const spy = jasmine.createSpy('clicked');
    fixture.componentInstance.clicked.subscribe(spy);
    fixture.nativeElement.querySelector('button').click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('applies the correct modifier class per variant', () => {
    fixture.componentInstance.variant = 'secondary';
    fixture.detectChanges();
    let button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('brand-button--secondary')).toBeTrue();

    fixture.componentInstance.variant = 'ghost';
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('brand-button--ghost')).toBeTrue();

    fixture.componentInstance.variant = 'danger';
    fixture.detectChanges();
    button = fixture.nativeElement.querySelector('button');
    expect(button.classList.contains('brand-button--danger')).toBeTrue();
  });

  it('defaults to type=button', () => {
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('type')).toBe('button');
  });
});
