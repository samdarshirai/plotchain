import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl } from '@angular/forms';
import { errorMessage } from '../../validation/validation';

@Component({
  selector: 'app-field-error',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="field-error" role="alert" *ngIf="text">{{ text }}</div>`
})
export class FieldErrorComponent {
  /** Pre-built message (legacy / server errors). Wins over `control`. */
  @Input() message?: string;
  /** Reactive control; message derived once it is touched or `submitted`. */
  @Input() control?: AbstractControl | null;
  @Input() label?: string;
  @Input() submitted = false;

  get text(): string | undefined {
    if (this.message) return this.message;
    const c = this.control;
    return c && c.invalid && (c.touched || this.submitted) ? errorMessage(c, this.label) : undefined;
  }
}
