import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { EPinRegisterService } from './epin-register.service';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { AssociateLookupComponent } from '../../shared/components/associate-lookup/associate-lookup.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { AllocateResult, EPin, EPinEvent, EPinFilters, EPinPage, EPinStatus, RedemptionType } from './epin.model';

const PAGE_SIZE = 20;
const MAX_COUNT = 2000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Panel =
  | { kind: 'generate' }
  | { kind: 'allocate' }
  | { kind: 'redeem'; epin: EPin }
  | { kind: 'block'; epin: EPin };

@Component({
  selector: 'app-epin-register',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent, AssociateLookupComponent],
  providers: [DatePipe],
  template: `
    <div class="epin-register">
      <div class="epin-register__head">
        <div class="epin-register__intro">
          <h1 class="epin-register__title">{{ 'admin.epinRegister.title' | translate }}</h1>
          <span class="epin-register__count" *ngIf="page">{{ 'admin.epinRegister.pinsCount' | translate: { count: page.totalElements } }}</span>
        </div>
        <div class="epin-register__header-actions">
          <button type="button" class="brand-button brand-button--secondary" (click)="openPanel({ kind: 'allocate' })">
            {{ 'admin.epinRegister.allocateAction' | translate }}
          </button>
          <button type="button" class="brand-button" (click)="openPanel({ kind: 'generate' })">
            {{ 'admin.epinRegister.generateAction' | translate }}
          </button>
        </div>
      </div>

      <div class="epin-register__filters">
        <input type="text" class="epin-register__search" [placeholder]="'admin.epinRegister.searchPlaceholder' | translate"
          [attr.aria-label]="'admin.epinRegister.batchFilterLabel' | translate"
          [ngModel]="batchId" (ngModelChange)="onBatchChange($event)" />
        <label class="epin-register__filter">
          {{ 'admin.epinRegister.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.epinRegister.filterAll' | translate }}</option>
            <option *ngFor="let s of statuses" [value]="s">{{ 'admin.epinRegister.status.' + s | translate }}</option>
          </select>
        </label>
        <div class="epin-register__filter">
          {{ 'admin.epinRegister.holderFilterLabel' | translate }}
          <app-associate-lookup [associates]="associates" [value]="holderId"
            [placeholder]="'admin.epinRegister.filterAll' | translate"
            (selected)="onHolderChange($event?.id ?? '')"></app-associate-lookup>
        </div>
        <div class="epin-register__filter">
          {{ 'admin.epinRegister.redeemedToFilterLabel' | translate }}
          <app-associate-lookup [associates]="associates" [value]="redeemedToId"
            [placeholder]="'admin.epinRegister.filterAll' | translate"
            (selected)="onRedeemedToChange($event?.id ?? '')"></app-associate-lookup>
        </div>
        <button type="button" class="epin-register__toggle" [class.epin-register__toggle--on]="expiredOnly"
          [attr.aria-pressed]="expiredOnly" (click)="onExpiredChange(!expiredOnly)">
          {{ 'admin.epinRegister.expiredOnlyLabel' | translate }}
        </button>
      </div>

      <app-inline-banner *ngIf="loadError" tone="danger">{{ 'admin.epinRegister.loadError' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="actionError" tone="danger">{{ actionError | translate }}</app-inline-banner>

      <div class="epin-register__panel" *ngIf="panel">
        <ng-container [ngSwitch]="panel.kind">
          <form *ngSwitchCase="'generate'" (ngSubmit)="submitGenerate()">
            <h2>{{ 'admin.epinRegister.generateAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.countLabel' | translate }}
              <input type="number" min="1" max="2000" name="count" [(ngModel)]="generateCount" required />
            </label>
            <label>{{ 'admin.epinRegister.expiresLabel' | translate }}
              <input type="datetime-local" name="expires" [(ngModel)]="generateExpiresLocal" />
            </label>
            <div class="epin-register__form-actions">
              <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
              <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
            </div>
          </form>

          <form *ngSwitchCase="'allocate'" (ngSubmit)="submitAllocate()">
            <h2>{{ 'admin.epinRegister.allocateAction' | translate }}</h2>
            <div class="epin-register__field">{{ 'admin.epinRegister.associateLabel' | translate }}
              <app-associate-lookup [associates]="associates" [value]="allocateAssociateId"
                [placeholder]="'admin.epinRegister.lookupPlaceholder' | translate"
                (selected)="onAllocateAssociate($event)"></app-associate-lookup>
            </div>
            <label>{{ 'admin.epinRegister.countLabel' | translate }}
              <input type="number" min="1" max="2000" name="alloc-count" [(ngModel)]="allocateCount" required />
            </label>
            <label>{{ 'admin.epinRegister.batchFilterLabel' | translate }}
              <input type="text" name="alloc-batch" [(ngModel)]="allocateBatchId" />
            </label>
            <div class="epin-register__form-actions">
              <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
              <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
            </div>
            <p *ngIf="allocateResult">{{ 'admin.epinRegister.allocatedCount' | translate: { count: allocateResult.count } }}</p>
          </form>

          <form *ngSwitchCase="'redeem'" (ngSubmit)="submitRedeem()">
            <h2>{{ 'admin.epinRegister.redeemAction' | translate }}</h2>
            <div class="epin-register__field">{{ 'admin.epinRegister.associateLabel' | translate }}
              <app-associate-lookup [associates]="associates" [value]="redeemAssociateId"
                [placeholder]="'admin.epinRegister.lookupPlaceholder' | translate"
                (selected)="onRedeemAssociate($event)"></app-associate-lookup>
            </div>
            <label>{{ 'admin.epinRegister.typeLabel' | translate }}
              <select name="redeem-type" [(ngModel)]="redeemType">
                <option value="ACTIVATION">{{ 'admin.epinRegister.typeActivation' | translate }}</option>
                <option value="TOPUP">{{ 'admin.epinRegister.typeTopup' | translate }}</option>
              </select>
            </label>
            <div class="epin-register__form-actions">
              <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
              <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
            </div>
          </form>

          <form *ngSwitchCase="'block'" (ngSubmit)="submitBlock()">
            <h2>{{ 'admin.epinRegister.blockAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.reasonLabel' | translate }}
              <input type="text" name="reason" maxlength="255" [(ngModel)]="panelReason" required />
            </label>
            <div class="epin-register__form-actions">
              <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
              <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
            </div>
          </form>
        </ng-container>
      </div>

      <div *ngIf="generatedCodes.length" class="epin-register__codes">
        <p>{{ 'admin.epinRegister.codesShownOnce' | translate }}</p>
        <p class="epin-register__batch-id">{{ 'admin.epinRegister.batchIdLabel' | translate }}: {{ generatedBatchId }}</p>
        <ul class="epin-register__code-list">
          <li *ngFor="let c of generatedCodes" class="epin-register__code">{{ c }}</li>
        </ul>
        <button type="button" class="brand-button brand-button--secondary" (click)="copyCodes()">{{ 'admin.epinRegister.copyAll' | translate }}</button>
      </div>

      <div class="epin-register__grid">
        <div class="epin-register__list">
          <div class="epin-register__table-wrap">
            <table class="epin-register__table">
              <thead>
                <tr>
                  <th>{{ 'admin.epinRegister.colCode' | translate }}</th>
                  <th>{{ 'admin.epinRegister.colStatus' | translate }}</th>
                  <th>{{ 'admin.epinRegister.colBatch' | translate }}</th>
                  <th>{{ 'admin.epinRegister.colExpires' | translate }}</th>
                  <th>{{ 'admin.epinRegister.colHolder' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of page?.epins" class="epin-register__row"
                  [class.epin-register__row--selected]="p.id === selectedId" (click)="select(p)">
                  <td class="epin-register__code">{{ p.code }}</td>
                  <td>
                    <span class="epin-register__chip" [ngClass]="chipClass(p)">
                      {{ (p.expired ? 'admin.epinRegister.expiredChip' : 'admin.epinRegister.status.' + p.status) | translate }}
                    </span>
                  </td>
                  <td [attr.title]="p.batchId">{{ p.batchId.slice(0, 8) }}</td>
                  <td [class.epin-register__expired-date]="p.expired">{{ p.expiresAt ? datePipe.transform(p.expiresAt, 'mediumDate') : '—' }}</td>
                  <td>{{ userId(p.allocatedTo) }}</td>
                </tr>
                <tr *ngIf="!page?.epins?.length">
                  <td colspan="5">{{ 'admin.epinRegister.emptyState' | translate }}</td>
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

        <aside class="epin-register__detail">
          <div class="epin-register__seal">
            <div class="epin-register__seal-title">{{ 'admin.epinRegister.detailTitle' | translate }}</div>
            <p *ngIf="!selected" class="epin-register__detail-empty">{{ 'admin.epinRegister.detailEmpty' | translate }}</p>
            <ng-container *ngIf="selected as p">
              <div class="epin-register__detail-head">
                <div class="epin-register__detail-code">{{ p.code }}</div>
                <span class="epin-register__chip" [ngClass]="chipClass(p)">
                  {{ (p.expired ? 'admin.epinRegister.expiredChip' : 'admin.epinRegister.status.' + p.status) | translate }}
                </span>
              </div>
              <dl class="epin-register__meta">
                <div><dt>{{ 'admin.epinRegister.colBatch' | translate }}</dt><dd class="epin-register__code">{{ p.batchId.slice(0, 8) }}</dd></div>
                <div><dt>{{ 'admin.epinRegister.colExpires' | translate }}</dt><dd>{{ p.expiresAt ? datePipe.transform(p.expiresAt, 'mediumDate') : '—' }}</dd></div>
                <div><dt>{{ 'admin.epinRegister.colHolder' | translate }}</dt><dd class="epin-register__code">{{ userId(p.allocatedTo) }}</dd></div>
                <div><dt>{{ 'admin.epinRegister.colRedeemedTo' | translate }}</dt><dd class="epin-register__code">{{ userId(p.redeemedTo) }}</dd></div>
              </dl>
              <div class="epin-register__history">
                <div class="epin-register__history-title">{{ 'admin.epinRegister.historyTitle' | translate }}</div>
                <ol class="epin-register__timeline">
                  <li *ngFor="let e of events" class="epin-register__event">
                    <div class="epin-register__event-what">{{ 'admin.epinRegister.event.' + e.eventType | translate }}
                      <span *ngIf="e.fromAssociateId || e.toAssociateId">
                        — {{ 'admin.epinRegister.eventFrom' | translate }} {{ userId(e.fromAssociateId) }} -&gt; {{ 'admin.epinRegister.eventTo' | translate }} {{ userId(e.toAssociateId) }}
                      </span>
                      <span *ngIf="e.note">({{ e.note }})</span>
                    </div>
                    <div class="epin-register__event-meta">
                      {{ datePipe.transform(e.at, 'medium') }} · {{ 'admin.epinRegister.eventActor' | translate }} {{ userId(e.actorId) }}
                    </div>
                  </li>
                </ol>
              </div>
              <div class="epin-register__detail-actions">
                <ng-container *ngIf="p.status === 'UNUSED' || p.status === 'ALLOCATED'">
                  <button type="button" class="brand-button" (click)="openPanel({ kind: 'redeem', epin: p })">{{ 'admin.epinRegister.redeemPinAction' | translate }}</button>
                  <button type="button" class="epin-register__danger" (click)="openPanel({ kind: 'block', epin: p })">{{ 'admin.epinRegister.blockAction' | translate }}</button>
                </ng-container>
                <button type="button" class="brand-button brand-button--secondary" *ngIf="p.status === 'BLOCKED'" (click)="unblock(p)">{{ 'admin.epinRegister.unblockAction' | translate }}</button>
              </div>
            </ng-container>
          </div>
        </aside>
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
  redeemedToId = '';
  selectedId: string | null = null;
  batchId = '';
  expiredOnly = false;

  panel: Panel | null = null;
  generateCount = 10;
  generateExpiresLocal = '';
  generatedCodes: string[] = [];
  generatedBatchId = '';
  private appliedBatchId = '';
  private loadSeq = 0;
  private eventsSeq = 0;
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

  get selected(): EPin | null {
    return this.page?.epins.find(p => p.id === this.selectedId) ?? null;
  }

  chipClass(p: EPin): string {
    return 'epin-register__chip--' + (p.expired ? 'expired' : p.status.toLowerCase());
  }

  select(p: EPin): void {
    this.selectedId = p.id;
    this.events = [];
    this.loadEvents(p.id);
  }

  private loadEvents(id: string): void {
    const seq = ++this.eventsSeq;
    this.service.events(id).subscribe(e => { if (seq === this.eventsSeq) this.events = e; });
  }

  private refreshSelected(): void {
    this.loadPage(this.page?.page ?? 0);
    if (this.selectedId) this.loadEvents(this.selectedId);
  }

  onRedeemedToChange(v: string): void { this.redeemedToId = v; this.loadPage(0); }
  onAllocateAssociate(a: AssociateSummary | null): void { this.allocateAssociateId = a?.id ?? ''; }
  onRedeemAssociate(a: AssociateSummary | null): void { this.redeemAssociateId = a?.id ?? ''; }

  userId(id: string | null): string {
    if (!id) return '—';
    return this.associates.find(a => a.id === id)?.userId ?? id.slice(0, 8);
  }

  onStatusChange(v: string): void { this.status = v; this.loadPage(0); }
  onHolderChange(v: string): void { this.holderId = v; this.loadPage(0); }
  onBatchChange(v: string): void {
    this.batchId = v;
    const trimmed = (v ?? '').trim();
    if (trimmed === '' || UUID_RE.test(trimmed)) {
      this.appliedBatchId = trimmed;
      this.loadPage(0);
    }
  }
  onExpiredChange(v: boolean): void { this.expiredOnly = v; this.loadPage(0); }

  loadPage(page: number): void {
    this.loadError = false;
    const filters: EPinFilters = {};
    if (this.status) filters.status = this.status as EPinStatus;
    if (this.holderId) filters.allocatedTo = this.holderId;
    if (this.redeemedToId) filters.redeemedTo = this.redeemedToId;
    if (this.appliedBatchId) filters.batchId = this.appliedBatchId;
    if (this.expiredOnly) filters.expired = true;
    const seq = ++this.loadSeq;
    this.service.list(filters, page, PAGE_SIZE).subscribe({
      next: res => { if (seq === this.loadSeq) this.page = res; },
      error: () => { if (seq === this.loadSeq) this.loadError = true; }
    });
  }

  openPanel(panel: Panel): void {
    this.panel = panel;
    this.actionError = '';
    this.generatedCodes = [];
    this.generatedBatchId = '';
    this.generateCount = 10;
    this.generateExpiresLocal = '';
    this.allocateAssociateId = '';
    this.allocateCount = 1;
    this.allocateBatchId = '';
    this.allocateResult = null;
    this.redeemAssociateId = '';
    this.redeemType = 'ACTIVATION';
    this.panelReason = '';
  }

  closePanel(): void { this.panel = null; }

  private validCount(n: number | null): boolean {
    return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_COUNT;
  }

  private invalid(): void { this.actionError = 'admin.epinRegister.errorInvalid'; }

  submitGenerate(): void {
    this.actionError = '';
    if (!this.validCount(this.generateCount)) return this.invalid();
    const expiresAt = this.generateExpiresLocal ? new Date(this.generateExpiresLocal).toISOString() : undefined;
    this.service.generate(this.generateCount, expiresAt).subscribe({
      next: res => { this.generatedCodes = res.codes; this.generatedBatchId = res.batchId; this.loadPage(0); },
      error: e => this.fail(e)
    });
  }

  copyCodes(): void {
    void navigator.clipboard?.writeText(this.generatedCodes.join('\n'));
  }

  submitAllocate(): void {
    this.actionError = '';
    const batch = (this.allocateBatchId ?? '').trim();
    if (!this.allocateAssociateId || !this.validCount(this.allocateCount) || (batch !== '' && !UUID_RE.test(batch))) {
      return this.invalid();
    }
    this.service.allocate(this.allocateAssociateId, this.allocateCount, batch || undefined).subscribe({
      next: res => { this.allocateResult = res; this.loadPage(0); },
      error: e => this.fail(e)
    });
  }

  submitRedeem(): void {
    if (this.panel?.kind !== 'redeem') return;
    this.actionError = '';
    if (!this.redeemAssociateId) return this.invalid();
    this.service.redeem(this.panel.epin.id, this.redeemAssociateId, this.redeemType).subscribe({
      next: () => { this.closePanel(); this.refreshSelected(); },
      error: e => this.fail(e)
    });
  }

  submitBlock(): void {
    if (this.panel?.kind !== 'block') return;
    this.actionError = '';
    const reason = (this.panelReason ?? '').trim();
    if (!reason) return this.invalid();
    this.service.block(this.panel.epin.id, reason).subscribe({
      next: () => { this.closePanel(); this.refreshSelected(); },
      error: e => this.fail(e)
    });
  }

  unblock(p: EPin): void {
    this.actionError = '';
    this.service.unblock(p.id).subscribe({
      next: () => this.refreshSelected(),
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
