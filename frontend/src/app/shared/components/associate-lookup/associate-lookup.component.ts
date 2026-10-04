import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../../../admin/models/associate-summary.model';

const MAX_MATCHES = 8;

// ponytail: filters the already-loaded associate list client-side; add a server search endpoint if the directory outgrows /api/associates.
@Component({
  selector: 'app-associate-lookup',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="associate-lookup">
      <div *ngIf="chosen as a; else search" class="associate-lookup__chosen">
        <span class="associate-lookup__chosen-id">{{ a.userId }}</span>
        <span class="associate-lookup__chosen-name">{{ a.name }}</span>
        <button type="button" class="associate-lookup__clear" [attr.aria-label]="'admin.epinRegister.lookupClear' | translate" (click)="clear()">×</button>
      </div>
      <ng-template #search>
        <input type="text" class="associate-lookup__input" autocomplete="off" role="combobox"
          [attr.aria-expanded]="open" [placeholder]="placeholder" [value]="query"
          (input)="onInput($any($event.target).value)" (focus)="open = true" (blur)="open = false"
          (keydown)="onKey($event)" />
        <ul *ngIf="open && query.trim()" class="associate-lookup__list" role="listbox">
          <li *ngFor="let m of matches; let i = index" role="option" class="associate-lookup__option"
            [class.associate-lookup__option--active]="i === active" (mousedown)="pick(m, $event)">
            <span class="associate-lookup__chosen-id">{{ m.userId }}</span> {{ m.name }}
          </li>
          <li *ngIf="!matches.length" class="associate-lookup__empty">{{ 'admin.epinRegister.lookupNoMatch' | translate }}</li>
        </ul>
      </ng-template>
    </div>
  `
})
export class AssociateLookupComponent {
  @Input() associates: AssociateSummary[] = [];
  @Input() value = '';
  @Input() placeholder = '';
  @Output() selected = new EventEmitter<AssociateSummary | null>();

  query = '';
  open = false;
  active = 0;

  get chosen(): AssociateSummary | null {
    return this.value ? this.associates.find(a => a.id === this.value) ?? null : null;
  }

  get matches(): AssociateSummary[] {
    const q = this.query.trim().toLowerCase();
    return this.associates
      .filter(a => a.userId.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .slice(0, MAX_MATCHES);
  }

  onInput(v: string): void {
    this.query = v;
    this.open = true;
    this.active = 0;
  }

  onKey(e: KeyboardEvent): void {
    const n = this.matches.length;
    if (e.key === 'ArrowDown') { this.open = true; this.active = n ? (this.active + 1) % n : 0; e.preventDefault(); }
    else if (e.key === 'ArrowUp') { this.active = n ? (this.active - 1 + n) % n : 0; e.preventDefault(); }
    else if (e.key === 'Enter' && this.open && n) { this.pick(this.matches[this.active]); e.preventDefault(); }
    else if (e.key === 'Escape') {
      if (this.open && this.query.trim()) { e.preventDefault(); } // list was showing: swallow so a parent drawer stays open
      this.open = false;
    }
  }

  pick(a: AssociateSummary, e?: Event): void {
    e?.preventDefault();
    this.query = '';
    this.open = false;
    this.selected.emit(a);
  }

  clear(): void {
    this.query = '';
    this.selected.emit(null);
  }
}
