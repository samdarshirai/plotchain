import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormIssue } from '../../validation/validation';

/** "N problems to fix" list; click an item to jump to its field (looked up by [formControlName] or id). */
@Component({
  selector: 'app-error-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="error-summary" role="alert" *ngIf="issues.length">
      <strong>{{ issues.length }} {{ issues.length === 1 ? 'problem' : 'problems' }} to fix before you can continue</strong>
      <ul>
        <li *ngFor="let i of issues">
          <a href="#" (click)="$event.preventDefault(); focus(i.id)"><b>{{ i.label }}:</b> {{ i.message }}</a>
        </li>
      </ul>
    </div>
  `
})
export class ErrorSummaryComponent {
  @Input() issues: FormIssue[] = [];

  focus(id: string): void {
    const el = document.querySelector<HTMLElement>(`[formControlName="${id}"], [name="${id}"], #${id}`);
    el?.scrollIntoView({ block: 'center' });
    el?.focus({ preventScroll: true });
  }
}
