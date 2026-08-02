import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

export type ChecklistRowTone = 'complete' | 'blocking' | 'optional';

const TONE_ICONS: Record<ChecklistRowTone, string> = {
  complete: 'check_circle',
  blocking: 'warning',
  optional: 'rule'
};

@Component({
  selector: 'app-checklist-row',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="checklist-row" [ngClass]="'checklist-row--' + tone">
      <span class="material-symbols-outlined checklist-row__icon">{{ icon }}</span>
      <span class="checklist-row__label">{{ label }}</span>
      <span class="checklist-row__badge" *ngIf="badgeLabel">{{ badgeLabel }}</span>
      <a
        class="checklist-row__edit"
        *ngIf="editLabel && editHref"
        [routerLink]="editHref"
      >
        {{ editLabel }}
      </a>
    </div>
  `
})
export class ChecklistRowComponent {
  @Input({ required: true }) label!: string;
  @Input() tone: ChecklistRowTone = 'complete';
  @Input() badgeLabel?: string;
  @Input() editLabel?: string;
  @Input() editHref?: string;

  get icon(): string {
    return TONE_ICONS[this.tone];
  }
}
