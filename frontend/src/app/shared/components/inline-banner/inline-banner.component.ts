import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-inline-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="inline-banner"
      [class.inline-banner--info]="tone === 'info'"
      [class.inline-banner--warning]="tone === 'warning'"
      [class.inline-banner--success]="tone === 'success'"
      [class.inline-banner--danger]="tone === 'danger'"
      *ngIf="visible"
    >
      <div class="inline-banner__content"><ng-content></ng-content></div>
      <button
        *ngIf="dismissible"
        type="button"
        class="inline-banner__dismiss"
        (click)="dismiss()"
      >
        &times;
      </button>
    </div>
  `
})
export class InlineBannerComponent {
  @Input() tone: 'info' | 'warning' | 'success' | 'danger' = 'info';
  @Input() dismissible = false;
  @Output() dismissed = new EventEmitter<void>();

  visible = true;

  dismiss(): void {
    this.visible = false;
    this.dismissed.emit();
  }
}
