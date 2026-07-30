import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ToggleOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-toggle-group',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toggle-group">
      <button
        type="button"
        class="toggle-group__option"
        *ngFor="let option of options"
        [class.toggle-group__option--active]="option.value === value"
        (click)="select(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  `
})
export class ToggleGroupComponent {
  @Input() options: ToggleOption[] = [];
  @Input() value: string | null = null;
  @Output() valueChange = new EventEmitter<string>();

  select(optionValue: string): void {
    if (optionValue === this.value) {
      return;
    }
    this.valueChange.emit(optionValue);
  }
}
