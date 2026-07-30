import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface TabDefinition {
  id: string;
  label: string;
}

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tab-bar" role="tablist">
      <button
        type="button"
        class="tab-bar__tab"
        *ngFor="let tab of tabs"
        role="tab"
        [attr.aria-selected]="tab.id === activeTabId"
        [class.tab-bar__tab--active]="tab.id === activeTabId"
        (click)="select(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>
  `
})
export class TabBarComponent {
  @Input() tabs: TabDefinition[] = [];
  @Input() activeTabId: string | null = null;
  @Output() tabChange = new EventEmitter<string>();

  select(tabId: string): void {
    this.tabChange.emit(tabId);
  }
}
