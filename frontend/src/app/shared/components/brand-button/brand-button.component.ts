import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-brand-button',
  standalone: true,
  template: `
    <button
      class="brand-button"
      [class.brand-button--secondary]="variant === 'secondary'"
      [class.brand-button--ghost]="variant === 'ghost'"
      [class.brand-button--danger]="variant === 'danger'"
      [class.brand-button--full]="fullWidth"
      [type]="type"
      [disabled]="disabled"
      (click)="onClick()"
    >
      <ng-content></ng-content>
    </button>
  `
})
export class BrandButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'ghost' | 'danger' = 'primary';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;
  @Input() fullWidth = false;
  @Output() clicked = new EventEmitter<void>();

  onClick(): void {
    if (this.disabled) {
      return;
    }
    this.clicked.emit();
  }
}
