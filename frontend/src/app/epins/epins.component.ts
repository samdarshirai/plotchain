import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { EPinsService } from './epins.service';
import { EPin } from './epin.model';
import { InlineBannerComponent } from '../shared/components/inline-banner/inline-banner.component';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-epins',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="epins">
      <div class="epins__rail"></div>
      <div class="epins__top">
        <header class="epins__header">
          <h1 class="epins__title">{{ 'epins.title' | translate }}</h1>
          <p class="epins__subtitle">{{ 'epins.subtitle' | translate }}</p>
        </header>

        <div class="epins__summary">
          <span><strong>{{ availableCount }}</strong> {{ 'epins.summaryAvailable' | translate }}</span>
          <span><strong>{{ usedCount }}</strong> {{ 'epins.summaryUsed' | translate }}</span>
          <span class="epins__summary--warn"><strong>{{ expiringSoonCount }}</strong> {{ 'epins.summaryExpiring' | translate }}</span>
        </div>

        <app-inline-banner *ngIf="loadError" tone="danger">{{ 'epins.loadError' | translate }}</app-inline-banner>
      </div>

      <div class="epins__lists">
        <section class="epins__section">
          <h2 class="epins__section-title">{{ 'epins.tabAvailable' | translate }}</h2>
          <p *ngIf="!available.length" class="epins__empty">{{ 'epins.emptyAvailable' | translate }}</p>
          <div class="epins__available-row" *ngFor="let p of available" [class.epins__available-row--selected]="p.id === selectedPin?.id"
               role="radio" tabindex="0" [attr.aria-checked]="p.id === selectedPin?.id"
               (click)="select(p)" (keydown.enter)="select(p)" (keydown.space)="select(p); $event.preventDefault()">
            <span class="epins__radio"><span class="epins__radio-dot"></span></span>
            <span class="epins__code">{{ p.code }}</span>
            <span class="epins__left" *ngIf="p.expiresAt">{{ 'epins.daysLeft' | translate: { count: daysLeft(p) } }}</span>
            <span class="epins__expiry" *ngIf="p.expiresAt">{{ p.expiresAt | date: 'mediumDate' }}</span>
          </div>
        </section>

        <section class="epins__section">
          <h2 class="epins__section-title">{{ 'epins.recentActivity' | translate }}</h2>
          <p *ngIf="!history.length" class="epins__empty">{{ 'epins.emptyHistory' | translate }}</p>
          <div class="epins__history-row" *ngFor="let p of history">
            <span class="epins__history-date">{{ (p.redeemedAt || p.allocatedAt || p.generatedAt) | date: 'mediumDate' }}</span>
            <span class="epins__history-label">{{ historyLabel(p) | translate }}</span>
            <span class="epins__code">{{ p.code }}</span>
          </div>
        </section>
      </div>

      <aside class="epins__detail" *ngIf="selectedPin as sel">
        <div class="epins__seal">
          <div class="epins__seal-label">── {{ 'epins.selectedPin' | translate }} ──</div>
          <div class="epins__seal-code">
            <span class="epins__code">{{ sel.code }}</span>
            <button type="button" class="epins__copy" (click)="copy(sel.code)" [attr.aria-label]="'epins.copy' | translate">
              <span class="material-symbols-outlined">{{ copied === sel.code ? 'check' : 'content_copy' }}</span>
            </button>
          </div>
          <div class="epins__seal-meta" *ngIf="sel.expiresAt">
            <span class="epins__left">{{ 'epins.expiresOn' | translate: { date: datePipe.transform(sel.expiresAt, 'mediumDate') } }}</span>
          </div>
        </div>

        <div class="epins__segment" role="tablist">
          <button type="button" role="tab" class="epins__segment-btn" [class.epins__segment-btn--active]="action === 'activate'"
                  (click)="setAction('activate')">
            <span class="material-symbols-outlined">person_add</span>{{ 'epins.activateAction' | translate }}
          </button>
          <button type="button" role="tab" class="epins__segment-btn" [class.epins__segment-btn--active]="action === 'transfer'"
                  (click)="setAction('transfer')">
            <span class="material-symbols-outlined">swap_horiz</span>{{ 'epins.transferAction' | translate }}
          </button>
        </div>

        <div class="epins__form">
          <label>{{ 'epins.userIdLabel' | translate }}
            <input type="text" name="userId" [(ngModel)]="userIdInput" />
          </label>
          <p class="epins__hint">{{ (action === 'activate' ? 'epins.activateHint' : 'epins.transferHint') | translate }}</p>
          <app-inline-banner *ngIf="actionError" tone="danger">{{ actionError | translate }}</app-inline-banner>
          <button type="button" class="brand-button" (click)="confirmAction()">
            {{ (action === 'activate' ? 'epins.activateAction' : 'epins.transferConfirm') | translate }}
          </button>
        </div>
      </aside>
    </div>
  `
})
export class EPinsComponent implements OnInit {
  private service = inject(EPinsService);
  protected datePipe = inject(DatePipe);

  all: EPin[] = [];
  meId: string | null = null;
  loadError = false;
  copied: string | null = null;

  private selectedId: string | null = null;
  action: 'activate' | 'transfer' = 'activate';
  userIdInput = '';
  actionError = '';

  private loadSeq = 0;
  private copyTimer?: ReturnType<typeof setTimeout>;

  // Until the caller's id is known nothing is actionable. A pin the caller transferred away comes
  // back ALLOCATED to someone else: History only, never Activate/Transfer.
  private isAvailable(p: EPin): boolean {
    return this.meId !== null && p.status === 'ALLOCATED' && !p.expired && p.allocatedTo === this.meId;
  }
  // Explicit pick if still available, otherwise the first available pin (none -> no detail panel).
  get selectedPin(): EPin | null {
    const a = this.available;
    return a.find(p => p.id === this.selectedId) ?? a[0] ?? null;
  }
  get available(): EPin[] { return this.all.filter(p => this.isAvailable(p)); }
  get history(): EPin[] { return this.all.filter(p => !this.isAvailable(p)); }

  historyLabel(p: EPin): string {
    if (p.status === 'ALLOCATED' && this.meId !== null && p.allocatedTo !== this.meId) return 'epins.statusTransferred';
    return p.expired ? 'epins.statusExpired' : 'epins.status.' + p.status;
  }
  get availableCount(): number { return this.available.length; }
  get usedCount(): number { return this.all.filter(p => p.status === 'USED').length; }
  get expiringSoonCount(): number {
    const limit = Date.now() + SEVEN_DAYS_MS;
    return this.available.filter(p => p.expiresAt && new Date(p.expiresAt).getTime() <= limit).length;
  }

  ngOnInit(): void {
    this.service.meId().subscribe({ next: id => (this.meId = id), error: () => (this.loadError = true) });
    this.load();
  }

  // Known limit: loads the 100 most recent pins (backend clamp); counts reflect that window.
  load(): void {
    this.loadError = false;
    const seq = ++this.loadSeq;
    this.service.list(undefined, 0, 100).subscribe({
      next: res => { if (seq === this.loadSeq) this.all = res.epins; },
      error: () => { if (seq === this.loadSeq) this.loadError = true; }
    });
  }

  daysLeft(p: EPin): number {
    return Math.max(0, Math.ceil((new Date(p.expiresAt as string).getTime() - Date.now()) / 86_400_000));
  }

  select(pin: EPin): void { this.startAction(pin, this.action); }

  setAction(action: 'activate' | 'transfer'): void {
    if (this.selectedPin) this.startAction(this.selectedPin, action);
  }

  startAction(pin: EPin, action: 'activate' | 'transfer'): void {
    this.selectedId = pin.id;
    this.action = action;
    this.userIdInput = '';
    this.actionError = '';
  }

  copy(code: string): void {
    // writeText rejects asynchronously (unfocused document, denied permission): swallow, the check icon is cosmetic.
    try { navigator.clipboard.writeText(code).catch(() => undefined); } catch { /* clipboard unavailable */ }
    this.copied = code;
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => (this.copied = null), 1400);
  }

  confirmAction(): void {
    const pin = this.selectedPin;
    if (!pin) return;
    const userId = this.userIdInput.trim();
    if (!userId) {
      this.actionError = 'epins.errorUserIdRequired';
      return;
    }
    this.actionError = '';
    const call = this.action === 'activate'
      ? this.service.redeem(pin.id, userId)
      : this.service.transfer(pin.id, userId);
    call.subscribe({
      next: () => { this.userIdInput = ''; this.load(); },
      error: (e: HttpErrorResponse) => {
        this.actionError = e.status === 404 ? 'epins.errorNotFound'
          : e.status === 409 ? 'epins.errorConflict'
          : 'epins.errorGeneric';
      }
    });
  }
}
