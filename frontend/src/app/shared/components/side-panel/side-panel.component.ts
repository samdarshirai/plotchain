import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-side-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="side-panel__backdrop" *ngIf="open" (click)="close()"></div>
    <aside class="side-panel" [class.side-panel--open]="open">
      <header class="side-panel__header">
        <span class="side-panel__title">{{ title }}</span>
      </header>
      <div class="side-panel__body"><ng-content></ng-content></div>
    </aside>
  `
})
export class SidePanelComponent {
  @Input() open = false;
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();

  close(): void {
    this.closed.emit();
  }
}
