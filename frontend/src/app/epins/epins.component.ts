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
      <h1 class="epins__title">{{ 'epins.title' | translate }}</h1>
      <p class="epins__subtitle">{{ 'epins.subtitle' | translate }}</p>

      <div class="epins__summary">
        <div class="card"><strong>{{ availableCount }}</strong> {{ 'epins.summaryAvailable' | translate }}</div>
        <div class="card"><strong>{{ usedCount }}</strong> {{ 'epins.summaryUsed' | translate }}</div>
        <div class="card"><strong>{{ expiringSoonCount }}</strong> {{ 'epins.summaryExpiring' | translate }}</div>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">{{ 'epins.loadError' | translate }}</app-inline-banner>

      <div class="epins__tabs">
        <button type="button" [class.epins__tab--active]="tab === 'available'" (click)="tab = 'available'">{{ 'epins.tabAvailable' | translate }}</button>
        <button type="button" [class.epins__tab--active]="tab === 'history'" (click)="tab = 'history'">{{ 'epins.tabHistory' | translate }}</button>
      </div>

      <div class="card epins__action" *ngIf="actionPin">
        <h2>{{ (action === 'activate' ? 'epins.activateTitle' : 'epins.transferTitle') | translate }}</h2>
        <p class="epins__code">{{ actionPin.code }}</p>
        <label>{{ 'epins.userIdLabel' | translate }}
          <input type="text" name="userId" [(ngModel)]="userIdInput" />
        </label>
        <app-inline-banner *ngIf="actionError" tone="danger">{{ actionError | translate }}</app-inline-banner>
        <button type="button" class="brand-button" (click)="confirmAction()">{{ 'epins.confirm' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary" (click)="cancelAction()">{{ 'epins.cancel' | translate }}</button>
      </div>

      <div *ngIf="tab === 'available'" class="card">
        <p *ngIf="!available.length">{{ 'epins.emptyAvailable' | translate }}</p>
        <div class="epins__available-row" *ngFor="let p of available">
          <span class="epins__code">{{ p.code }}</span>
          <span class="epins__expiry" *ngIf="p.expiresAt">{{ 'epins.expiresOn' | translate: { date: datePipe.transform(p.expiresAt, 'mediumDate') } }}</span>
          <button type="button" (click)="startAction(p, 'activate')">{{ 'epins.activateAction' | translate }}</button>
          <button type="button" (click)="startAction(p, 'transfer')">{{ 'epins.transferAction' | translate }}</button>
        </div>
      </div>

      <div *ngIf="tab === 'history'" class="card">
        <p *ngIf="!history.length">{{ 'epins.emptyHistory' | translate }}</p>
        <div class="epins__history-row" *ngFor="let p of history">
          <span class="epins__code">{{ p.code }}</span>
          <span>{{ historyLabel(p) | translate }}</span>
        </div>
      </div>
    </div>
  `
})
export class EPinsComponent implements OnInit {
  private service = inject(EPinsService);
  protected datePipe = inject(DatePipe);

  all: EPin[] = [];
  meId: string | null = null;
  loadError = false;
  tab: 'available' | 'history' = 'available';

  actionPin: EPin | null = null;
  action: 'activate' | 'transfer' = 'activate';
  userIdInput = '';
  actionError = '';

  private loadSeq = 0;

  // Until the caller's id is known nothing is actionable. A pin the caller transferred away comes
  // back ALLOCATED to someone else: History only, never Activate/Transfer.
  private isAvailable(p: EPin): boolean {
    return this.meId !== null && p.status === 'ALLOCATED' && !p.expired && p.allocatedTo === this.meId;
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

  startAction(pin: EPin, action: 'activate' | 'transfer'): void {
    this.actionPin = pin;
    this.action = action;
    this.userIdInput = '';
    this.actionError = '';
  }

  cancelAction(): void { this.actionPin = null; }

  confirmAction(): void {
    if (!this.actionPin) return;
    const userId = this.userIdInput.trim();
    if (!userId) {
      this.actionError = 'epins.errorUserIdRequired';
      return;
    }
    this.actionError = '';
    const call = this.action === 'activate'
      ? this.service.redeem(this.actionPin.id, userId)
      : this.service.transfer(this.actionPin.id, userId);
    call.subscribe({
      next: () => { this.actionPin = null; this.load(); },
      error: (e: HttpErrorResponse) => {
        this.actionError = e.status === 404 ? 'epins.errorNotFound'
          : e.status === 409 ? 'epins.errorConflict'
          : 'epins.errorGeneric';
      }
    });
  }
}
