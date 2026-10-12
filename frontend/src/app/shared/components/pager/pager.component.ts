import { Component, EventEmitter, Input, Output, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-pager',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  styleUrl: './pager.component.scss',
  encapsulation: ViewEncapsulation.None,
  template: `
    <nav class="pager" *ngIf="total > 0" [attr.aria-label]="'shared.pager.label' | translate">
      <button type="button" class="pager__prev brand-button brand-button--secondary" [disabled]="disabled || page <= 0" (click)="go(page - 1)">
        {{ 'shared.pager.previous' | translate }}
      </button>
      <span class="pager__summary">{{ 'shared.pager.summary' | translate: { from: from, to: to, total: total, page: page + 1, totalPages: totalPages } }}</span>
      <button type="button" class="pager__next brand-button brand-button--secondary" [disabled]="disabled || page >= totalPages - 1" (click)="go(page + 1)">
        {{ 'shared.pager.next' | translate }}
      </button>
    </nav>
  `
})
export class PagerComponent {
  @Input() page = 0;
  @Input() size = 20;
  @Input() total = 0;
  @Input() disabled = false;
  @Output() pageChange = new EventEmitter<number>();

  get totalPages(): number { return this.size > 0 ? Math.max(1, Math.ceil(this.total / this.size)) : 1; }
  get from(): number { return this.total === 0 ? 0 : this.page * this.size + 1; }
  get to(): number { return this.total === 0 ? 0 : Math.min(this.total, (this.page + 1) * this.size); }

  go(p: number): void {
    if (!this.disabled && p >= 0 && p <= this.totalPages - 1) { this.pageChange.emit(p); }
  }
}
