import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

@Component({
  selector: 'app-color-field',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="color-field">
      <label>{{ label }}</label>
      <div class="color-field__row">
        <span class="color-field__swatch" [style.background]="value"></span>
        <input
          type="color"
          class="color-field__picker"
          [ngModel]="value"
          (ngModelChange)="onPickerChange($event)"
        />
        <input
          type="text"
          class="color-field__hex"
          maxlength="7"
          [ngModel]="hexInput"
          (ngModelChange)="onHexChange($event)"
        />
      </div>
    </div>
  `
})
export class ColorFieldComponent {
  @Input() label = '';
  @Input() value = '#000000';
  @Output() valueChange = new EventEmitter<string>();

  get hexInput(): string {
    return this.value;
  }

  onPickerChange(next: string): void {
    // The native color input always yields a normalized valid hex.
    this.valueChange.emit(next);
  }

  onHexChange(next: string): void {
    // A partially typed hex simply doesn't emit yet -- the last valid color stays live.
    // Validation/error display is the parent step's responsibility.
    if (HEX_COLOR_PATTERN.test(next)) {
      this.valueChange.emit(next);
    }
  }
}
