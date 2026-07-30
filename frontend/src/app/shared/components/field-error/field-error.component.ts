import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-field-error',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="field-error" *ngIf="message">{{ message }}</div>`
})
export class FieldErrorComponent {
  @Input() message?: string;
}
