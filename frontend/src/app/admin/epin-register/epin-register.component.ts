import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { EPinRegisterService } from './epin-register.service';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { AllocateResult, EPin, EPinEvent, EPinFilters, EPinPage, EPinStatus, RedemptionType } from './epin.model';

const PAGE_SIZE = 20;

type Panel =
  | { kind: 'generate' }
  | { kind: 'allocate' }
  | { kind: 'redeem'; epin: EPin }
  | { kind: 'block'; epin: EPin }
  | { kind: 'events'; epin: EPin };

@Component({
  selector: 'app-epin-register',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent],
  providers: [DatePipe],
  template: `
    <div class="epin-register">
      <div class="epin-register__intro">
        <h1 class="epin-register__title">{{ 'admin.epinRegister.title' | translate }}</h1>
        <p class="epin-register__subtitle">{{ 'admin.epinRegister.subtitle' | translate }}</p>
        <div class="epin-register__header-actions">
          <button type="button" class="brand-button" (click)="openPanel({ kind: 'generate' })">
            {{ 'admin.epinRegister.generateAction' | translate }}
          </button>
          <button type="button" class="brand-button brand-button--secondary" (click)="openPanel({ kind: 'allocate' })">
            {{ 'admin.epinRegister.allocateAction' | translate }}
          </button>
        </div>
      </div>

      <div class="epin-register__filters">
        <label>
          {{ 'admin.epinRegister.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.epinRegister.filterAll' | translate }}</option>
            <option *ngFor="let s of statuses" [value]="s">{{ 'admin.epinRegister.status.' + s | translate }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.epinRegister.holderFilterLabel' | translate }}
          <select (change)="onHolderChange($any($event.target).value)">
            <option value="">{{ 'admin.epinRegister.filterAll' | translate }}</option>
            <option *ngFor="let a of associates" [value]="a.id">{{ a.userId }} — {{ a.name }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.epinRegister.batchFilterLabel' | translate }}
          <input type="text" [ngModel]="batchId" (ngModelChange)="onBatchChange($event)" />
        </label>
        <label class="epin-register__check">
          <input type="checkbox" [ngModel]="expiredOnly" (ngModelChange)="onExpiredChange($event)" />
          {{ 'admin.epinRegister.expiredOnlyLabel' | translate }}
        </label>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">{{ 'admin.epinRegister.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="actionError" tone="danger">{{ actionError | translate }}</app-inline-banner>

      <div class="epin-register__panel card" *ngIf="panel">
        <ng-container [ngSwitch]="panel.kind">
          <form *ngSwitchCase="'generate'" (ngSubmit)="submitGenerate()">
            <h2>{{ 'admin.epinRegister.generateAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.countLabel' | translate }}
              <input type="number" min="1" max="2000" name="count" [(ngModel)]="generateCount" required />
            </label>
            <label>{{ 'admin.epinRegister.expiresLabel' | translate }}
              <input type="datetime-local" name="expires" [(ngModel)]="generateExpiresLocal" />
            </label>
            <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
          </form>

          <form *ngSwitchCase="'allocate'" (ngSubmit)="submitAllocate()">
            <h2>{{ 'admin.epinRegister.allocateAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.associateLabel' | translate }}
              <select name="alloc-assoc" [(ngModel)]="allocateAssociateId" required>
                <option value="">—</option>
                <option *ngFor="let a of associates" [value]="a.id">{{ a.userId }} — {{ a.name }}</option>
              </select>
            </label>
            <label>{{ 'admin.epinRegister.countLabel' | translate }}
              <input type="number" min="1" max="2000" name="alloc-count" [(ngModel)]="allocateCount" required />
            </label>
            <label>{{ 'admin.epinRegister.batchFilterLabel' | translate }}
              <input type="text" name="alloc-batch" [(ngModel)]="allocateBatchId" />
            </label>
            <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
            <p *ngIf="allocateResult">{{ 'admin.epinRegister.allocatedCount' | translate: { count: allocateResult.count } }}</p>
          </form>

          <form *ngSwitchCase="'redeem'" (ngSubmit)="submitRedeem()">
            <h2>{{ 'admin.epinRegister.redeemAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.associateLabel' | translate }}
              <select name="redeem-assoc" [(ngModel)]="redeemAssociateId" required>
                <option value="">—</option>
                <option *ngFor="let a of associates" [value]="a.id">{{ a.userId }} — {{ a.name }}</option>
              </select>
            </label>
            <label>{{ 'admin.epinRegister.typeLabel' | translate }}
              <select name="redeem-type" [(ngModel)]="redeemType">
                <option value="ACTIVATION">{{ 'admin.epinRegister.typeActivation' | translate }}</option>
                <option value="TOPUP">{{ 'admin.epinRegister.typeTopup' | translate }}</option>
              </select>
            </label>
            <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
          </form>

          <form *ngSwitchCase="'block'" (ngSubmit)="submitBlock()">
            <h2>{{ 'admin.epinRegister.blockAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.reasonLabel' | translate }}
              <input type="text" name="reason" maxlength="255" [(ngModel)]="panelReason" required />
            </label>
            <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
          </form>

          <div *ngSwitchCase="'events'">
            <h2>{{ 'admin.epinRegister.eventsTitle' | translate }}</h2>
            <ul class="epin-register__events">
              <li *ngFor="let e of events">
                {{ datePipe.transform(e.at, 'medium') }} — {{ e.eventType }}
                <span *ngIf="e.note">({{ e.note }})</span>
              </li>
            </ul>
            <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.close' | translate }}</button>
          </div>
        </ng-container>
      </div>

      <div *ngIf="generatedCodes.length" class="epin-register__codes card">
        <p>{{ 'admin.epinRegister.codesShownOnce' | translate }}</p>
        <ul class="epin-register__code-list">
          <li *ngFor="let c of generatedCodes" class="epin-register__code">{{ c }}</li>
        </ul>
        <button type="button" class="brand-button brand-button--secondary" (click)="copyCodes()">{{ 'admin.epinRegister.copyAll' | translate }}</button>
      </div>

      <div class="card epin-register__table-wrap">
        <table class="epin-register__table">
          <thead>
            <tr>
              <th>{{ 'admin.epinRegister.colCode' | translate }}</th>
              <th>{{ 'admin.epinRegister.colStatus' | translate }}</th>
              <th>{{ 'admin.epinRegister.colBatch' | translate }}</th>
              <th>{{ 'admin.epinRegister.colExpires' | translate }}</th>
              <th>{{ 'admin.epinRegister.colHolder' | translate }}</th>
              <th>{{ 'admin.epinRegister.colRedeemedTo' | translate }}</th>
              <th>{{ 'admin.epinRegister.colActions' | translate }}</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of page?.epins">
              <td class="epin-register__code">{{ p.code }}</td>
              <td>
                <span class="epin-register__chip" [class.epin-register__chip--expired]="p.expired">
                  {{ (p.expired ? 'admin.epinRegister.expiredChip' : 'admin.epinRegister.status.' + p.status) | translate }}
                </span>
              </td>
              <td>{{ p.batchId.slice(0, 8) }}</td>
              <td>{{ p.expiresAt ? datePipe.transform(p.expiresAt, 'mediumDate') : '—' }}</td>
              <td>{{ userId(p.allocatedTo) }}</td>
              <td>{{ userId(p.redeemedTo) }}</td>
              <td class="epin-register__actions">
                <button type="button" *ngIf="p.status === 'UNUSED' || p.status === 'ALLOCATED'" (click)="openPanel({ kind: 'redeem', epin: p })">{{ 'admin.epinRegister.redeemAction' | translate }}</button>
                <button type="button" *ngIf="p.status === 'UNUSED' || p.status === 'ALLOCATED'" (click)="openPanel({ kind: 'block', epin: p })">{{ 'admin.epinRegister.blockAction' | translate }}</button>
                <button type="button" *ngIf="p.status === 'BLOCKED'" (click)="unblock(p)">{{ 'admin.epinRegister.unblockAction' | translate }}</button>
                <button type="button" (click)="openPanel({ kind: 'events', epin: p })">{{ 'admin.epinRegister.eventsAction' | translate }}</button>
              </td>
            </tr>
            <tr *ngIf="!page?.epins?.length">
              <td colspan="7">{{ 'admin.epinRegister.emptyState' | translate }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="epin-register__pagination" *ngIf="page">
        <span>{{ 'admin.epinRegister.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}</span>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="page.page === 0" (click)="loadPage(page.page - 1)">{{ 'admin.epinRegister.previousPageAction' | translate }}</button>
        <button type="button" class="brand-button brand-button--secondary" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="loadPage(page.page + 1)">{{ 'admin.epinRegister.nextPageAction' | translate }}</button>
      </div>
    </div>
  `
})
export class EPinRegisterComponent implements OnInit {
  private service = inject(EPinRegisterService);
  private adminService = inject(AdminService);
  protected datePipe = inject(DatePipe);

  readonly statuses: EPinStatus[] = ['UNUSED', 'ALLOCATED', 'USED', 'BLOCKED'];
  page: EPinPage | null = null;
  associates: AssociateSummary[] = [];
  loadError = false;
  actionError = '';

  status = '';
  holderId = '';
  batchId = '';
  expiredOnly = false;

  panel: Panel | null = null;
  generateCount = 10;
  generateExpiresLocal = '';
  generatedCodes: string[] = [];
  allocateAssociateId = '';
  allocateCount = 1;
  allocateBatchId = '';
  allocateResult: AllocateResult | null = null;
  redeemAssociateId = '';
  redeemType: RedemptionType = 'ACTIVATION';
  panelReason = '';
  events: EPinEvent[] = [];

  get currentPage(): number { return (this.page?.page ?? 0) + 1; }
  get totalPages(): number {
    return !this.page || this.page.size === 0 ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(a => (this.associates = a));
    this.loadPage(0);
  }

  userId(id: string | null): string {
    if (!id) return '—';
    return this.associates.find(a => a.id === id)?.userId ?? id.slice(0, 8);
  }

  onStatusChange(v: string): void { this.status = v; this.loadPage(0); }
  onHolderChange(v: string): void { this.holderId = v; this.loadPage(0); }
  onBatchChange(v: string): void { this.batchId = v.trim(); this.loadPage(0); }
  onExpiredChange(v: boolean): void { this.expiredOnly = v; this.loadPage(0); }

  loadPage(page: number): void {
    this.loadError = false;
    const filters: EPinFilters = {};
    if (this.status) filters.status = this.status as EPinStatus;
    if (this.holderId) filters.allocatedTo = this.holderId;
    if (this.batchId) filters.batchId = this.batchId;
    if (this.expiredOnly) filters.expired = true;
    this.service.list(filters, page, PAGE_SIZE).subscribe({
      next: res => (this.page = res),
      error: () => (this.loadError = true)
    });
  }

  openPanel(panel: Panel): void {
    this.panel = panel;
    this.actionError = '';
    this.generatedCodes = [];
    this.allocateResult = null;
    this.panelReason = '';
    if (panel.kind === 'events') {
      this.events = [];
      this.service.events(panel.epin.id).subscribe(e => (this.events = e));
    }
  }

  closePanel(): void { this.panel = null; }

  submitGenerate(): void {
    this.actionError = '';
    const expiresAt = this.generateExpiresLocal ? new Date(this.generateExpiresLocal).toISOString() : undefined;
    this.service.generate(this.generateCount, expiresAt).subscribe({
      next: res => { this.generatedCodes = res.codes; this.loadPage(0); },
      error: e => this.fail(e)
    });
  }

  copyCodes(): void {
    void navigator.clipboard?.writeText(this.generatedCodes.join('\n'));
  }

  submitAllocate(): void {
    this.actionError = '';
    this.service.allocate(this.allocateAssociateId, this.allocateCount, this.allocateBatchId || undefined).subscribe({
      next: res => { this.allocateResult = res; this.loadPage(0); },
      error: e => this.fail(e)
    });
  }

  submitRedeem(): void {
    if (this.panel?.kind !== 'redeem') return;
    this.actionError = '';
    this.service.redeem(this.panel.epin.id, this.redeemAssociateId, this.redeemType).subscribe({
      next: () => { this.closePanel(); this.loadPage(this.page?.page ?? 0); },
      error: e => this.fail(e)
    });
  }

  submitBlock(): void {
    if (this.panel?.kind !== 'block') return;
    this.actionError = '';
    this.service.block(this.panel.epin.id, this.panelReason).subscribe({
      next: () => { this.closePanel(); this.loadPage(this.page?.page ?? 0); },
      error: e => this.fail(e)
    });
  }

  unblock(p: EPin): void {
    this.actionError = '';
    this.service.unblock(p.id).subscribe({
      next: () => this.loadPage(this.page?.page ?? 0),
      error: e => this.fail(e)
    });
  }

  private fail(e: HttpErrorResponse): void {
    this.actionError = e.status === 409 ? 'admin.epinRegister.errorConflict'
      : e.status === 404 ? 'admin.epinRegister.errorNotFound'
      : e.status === 400 ? 'admin.epinRegister.errorInvalid'
      : 'admin.epinRegister.errorGeneric';
  }
}
