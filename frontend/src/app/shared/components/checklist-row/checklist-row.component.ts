import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-checklist-row',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="checklist-row">
      <span class="checklist-row__indicator" *ngIf="complete">&#10003;</span>
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
  @Input() complete = false;
  @Input() badgeLabel?: string;
  @Input() editLabel?: string;
  @Input() editHref?: string;
}
