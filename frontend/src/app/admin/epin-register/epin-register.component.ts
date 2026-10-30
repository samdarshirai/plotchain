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
import { toFieldErrors } from '../../core/api/field-errors.model';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { ErrorSummaryComponent } from '../../shared/components/error-summary/error-summary.component';
import { FormIssue } from '../../shared/validation/validation';
import { AllocateResult, EPin, EPinEvent, EPinFilters, EPinPage, EPinStatus, EPinType, RedemptionType } from './epin.model';

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
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent, AssociateLookupComponent, FieldErrorComponent, ErrorSummaryComponent],
  providers: [DatePipe],
  template: `
    <div class="epin-register">
      <div class="epin-register__head">
        <div class="epin-register__intro">
          <span class="epin-register__eyebrow">{{ 'admin.epinRegister.eyebrow' | translate }}</span>
          <h1 class="epin-register__title">{{ 'admin.epinRegister.title' | translate }}</h1>
          <p class="epin-register__subtitle">{{ 'admin.epinRegister.subtitle' | translate }}</p>
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
        <label class="epin-register__filter">
          {{ 'admin.epinRegister.pinTypeLabel' | translate }}
          <select (change)="onPinTypeChange($any($event.target).value)">
            <option value="">{{ 'admin.epinRegister.filterAll' | translate }}</option>
            <option *ngFor="let t of pinTypes" [value]="t">{{ 'admin.epinRegister.pinType.' + t | translate }}</option>
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

      <div class="epin-register__panel" *ngIf="panel && panel.kind !== 'allocate' && panel.kind !== 'redeem'">
        <ng-container [ngSwitch]="panel.kind">
          <form *ngSwitchCase="'generate'" [class.was-submitted]="submitted" (ngSubmit)="submitGenerate()" novalidate>
            <app-error-summary [issues]="issues"></app-error-summary>
            <h2>{{ 'admin.epinRegister.generateAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.countLabel' | translate }}
              <input type="number" min="1" max="2000" name="count" [(ngModel)]="generateCount" required [attr.aria-invalid]="errs['count'] ? 'true' : null" />
              <app-field-error [message]="errs['count']"></app-field-error>
            </label>
            <label>{{ 'admin.epinRegister.pinTypeLabel' | translate }}
              <select name="pin-type" [(ngModel)]="generatePinType">
                <option *ngFor="let t of pinTypes" [value]="t">{{ 'admin.epinRegister.pinType.' + t | translate }}</option>
              </select>
            </label>
            <label>{{ 'admin.epinRegister.expiresLabel' | translate }}
              <input type="datetime-local" name="expires" [(ngModel)]="generateExpiresLocal" />
            </label>
            <div class="epin-register__form-actions">
              <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
              <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
            </div>
          </form>

          <form *ngSwitchCase="'block'" [class.was-submitted]="submitted" (ngSubmit)="submitBlock()" novalidate>
            <app-error-summary [issues]="issues"></app-error-summary>
            <h2>{{ 'admin.epinRegister.blockAction' | translate }}</h2>
            <label>{{ 'admin.epinRegister.reasonLabel' | translate }}
              <input type="text" name="reason" maxlength="255" [(ngModel)]="panelReason" required [attr.aria-invalid]="errs['reason'] ? 'true' : null" />
              <app-field-error [message]="errs['reason']"></app-field-error>
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
                  <th><span class="material-symbols-outlined th-icon" aria-hidden="true">badge</span>{{ 'admin.epinRegister.colCode' | translate }}</th>
                  <th><span class="material-symbols-outlined th-icon" aria-hidden="true">flag</span>{{ 'admin.epinRegister.colStatus' | translate }}</th>
                  <th><span class="material-symbols-outlined th-icon" aria-hidden="true">category</span>{{ 'admin.epinRegister.pinTypeLabel' | translate }}</th>
                  <th><span class="material-symbols-outlined th-icon" aria-hidden="true">badge</span>{{ 'admin.epinRegister.colBatch' | translate }}</th>
                  <th><span class="material-symbols-outlined th-icon" aria-hidden="true">calendar_today</span>{{ 'admin.epinRegister.colExpires' | translate }}</th>
                  <th><span class="material-symbols-outlined th-icon" aria-hidden="true">groups</span>{{ 'admin.epinRegister.colHolder' | translate }}</th>
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
                  <td>{{ 'admin.epinRegister.pinType.' + p.pinType | translate }}</td>
                  <td [attr.title]="p.batchId">{{ p.batchId.slice(0, 8) }}</td>
                  <td [class.epin-register__expired-date]="p.expired">{{ p.expiresAt ? datePipe.transform(p.expiresAt, 'mediumDate') : '—' }}</td>
                  <td>{{ userId(p.allocatedTo) }}</td>
                </tr>
                <tr *ngIf="!page?.epins?.length">
                  <td colspan="6">{{ 'admin.epinRegister.emptyState' | translate }}</td>
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
            <ng-container *ngIf="panel?.kind === 'redeem'">
              <div class="epin-register__seal-title">{{ 'admin.epinRegister.redeemAction' | translate }}</div>
              <div class="epin-register__detail-code">{{ redeemEpin?.code }}</div>
              <form [class.was-submitted]="submitted" (ngSubmit)="submitRedeem()" novalidate>
                <app-error-summary [issues]="issues"></app-error-summary>
                <div class="epin-register__field">{{ 'admin.epinRegister.associateLabel' | translate }}
                  <app-associate-lookup [associates]="associates" [value]="redeemAssociateId"
                    [placeholder]="'admin.epinRegister.lookupPlaceholder' | translate"
                    (selected)="onRedeemAssociate($event)"></app-associate-lookup>
                  <app-field-error [message]="errs['associate']"></app-field-error>
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
            </ng-container>
            <ng-container *ngIf="panel?.kind === 'allocate'; else sealOther">
              <div class="epin-register__seal-title">{{ 'admin.epinRegister.allocateAction' | translate }}</div>
              <form [class.was-submitted]="submitted" (ngSubmit)="submitAllocate()" novalidate>
                <app-error-summary [issues]="issues"></app-error-summary>
                <div class="epin-register__field">{{ 'admin.epinRegister.associateLabel' | translate }}
                  <app-associate-lookup [associates]="associates" [value]="allocateAssociateId"
                    [placeholder]="'admin.epinRegister.lookupPlaceholder' | translate"
                    (selected)="onAllocateAssociate($event)"></app-associate-lookup>
                  <app-field-error [message]="errs['associate']"></app-field-error>
                </div>
                <label>{{ 'admin.epinRegister.countLabel' | translate }}
                  <input type="number" min="1" max="2000" name="alloc-count" [(ngModel)]="allocateCount" required [attr.aria-invalid]="errs['alloc-count'] ? 'true' : null" />
                  <app-field-error [message]="errs['alloc-count']"></app-field-error>
                </label>
                <label>{{ 'admin.epinRegister.pinTypeLabel' | translate }}
                  <select name="alloc-pin-type" [(ngModel)]="allocatePinType">
                    <option value="">{{ 'admin.epinRegister.filterAll' | translate }}</option>
                    <option *ngFor="let t of pinTypes" [value]="t">{{ 'admin.epinRegister.pinType.' + t | translate }}</option>
                  </select>
                </label>
                <label>{{ 'admin.epinRegister.batchFilterLabel' | translate }}
                  <input type="text" name="alloc-batch" [(ngModel)]="allocateBatchId" [attr.aria-invalid]="errs['alloc-batch'] ? 'true' : null" />
                  <app-field-error [message]="errs['alloc-batch']"></app-field-error>
                </label>
                <p *ngIf="allocateResult" class="epin-register__allocated">{{ 'admin.epinRegister.allocatedCount' | translate: { count: allocateResult.count } }}</p>
                <div class="epin-register__form-actions">
                  <button type="submit" class="brand-button">{{ 'admin.epinRegister.submit' | translate }}</button>
                  <button type="button" class="brand-button brand-button--secondary" (click)="closePanel()">{{ 'admin.epinRegister.cancel' | translate }}</button>
                </div>
              </form>
            </ng-container>
            <ng-template #sealOther>
            <ng-container *ngIf="panel?.kind !== 'redeem'">
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
                <div><dt>{{ 'admin.epinRegister.pinTypeLabel' | translate }}</dt><dd>{{ 'admin.epinRegister.pinType.' + p.pinType | translate }}</dd></div>
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
            </ng-container>
            </ng-template>
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
  readonly pinTypes: EPinType[] = ['REGISTRATION', 'TOPUP'];
  page: EPinPage | null = null;
  associates: AssociateSummary[] = [];
  loadError = false;
  actionError = '';

  status = '';
  pinType = '';
  holderId = '';
  redeemedToId = '';
  selectedId: string | null = null;
  batchId = '';
  expiredOnly = false;

  panel: Panel | null = null;
  generateCount = 10;
  generateExpiresLocal = '';
  generatePinType: EPinType = 'REGISTRATION';
  generatedCodes: string[] = [];
  generatedBatchId = '';
  private appliedBatchId = '';
  private loadSeq = 0;
  private eventsSeq = 0;
  allocateAssociateId = '';
  allocateCount = 1;
  allocateBatchId = '';
  allocatePinType: EPinType | '' = '';
  allocateResult: AllocateResult | null = null;
  redeemAssociateId = '';
  redeemType: RedemptionType = 'ACTIVATION';
  panelReason = '';
  submitted = false;
  issues: FormIssue[] = [];
  errs: Record<string, string> = {};
  events: EPinEvent[] = [];

  get currentPage(): number { return (this.page?.page ?? 0) + 1; }
  get totalPages(): number {
    return !this.page || this.page.size === 0 ? 1 : Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  ngOnInit(): void {
    this.adminService.listAssociates().subscribe(a => (this.associates = a));
    this.loadPage(0);
  }

  get redeemEpin(): EPin | null {
    return this.panel?.kind === 'redeem' ? this.panel.epin : null;
  }

  get selected(): EPin | null {
    return this.page?.epins.find(p => p.id === this.selectedId) ?? null;
  }

  chipClass(p: EPin): string {
    return 'epin-register__chip--' + (p.expired ? 'expired' : p.status.toLowerCase());
  }

  select(p: EPin): void {
    if (this.panel?.kind === 'allocate' || this.panel?.kind === 'redeem') this.closePanel();
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
  onPinTypeChange(v: string): void { this.pinType = v; this.loadPage(0); }
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
    if (this.pinType) filters.pinType = this.pinType as EPinType;
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
    if (panel.kind === 'allocate') {
      this.selectedId = null;
      this.events = [];
      this.eventsSeq++;
    }
    this.actionError = '';
    this.clearErrors();
    this.generatedCodes = [];
    this.generatedBatchId = '';
    this.generateCount = 10;
    this.generateExpiresLocal = '';
    this.generatePinType = 'REGISTRATION';
    this.allocateAssociateId = '';
    this.allocateCount = 1;
    this.allocateBatchId = '';
    this.allocatePinType = '';
    this.allocateResult = null;
    this.redeemAssociateId = '';
    this.redeemType = 'ACTIVATION';
    this.panelReason = '';
  }

  closePanel(): void { this.panel = null; }

  private validCount(n: number | null): boolean {
    return Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_COUNT;
  }

  private clearErrors(): void { this.submitted = false; this.issues = []; this.errs = {}; }

  // Records [id, label, message] problems for the open form; returns true when there are none.
  private check(problems: [string, string, string | null][]): boolean {
    this.submitted = true;
    this.issues = [];
    this.errs = {};
    for (const [id, label, message] of problems) {
      if (!message) continue;
      this.errs[id === 'alloc-associate' || id === 'redeem-associate' ? 'associate' : id] = message;
      this.issues.push({ id, label, message });
    }
    return this.issues.length === 0;
  }

  private countMessage(n: number | null): string | null {
    return this.validCount(n) ? null : `Number of PINs must be a whole number from 1 to ${MAX_COUNT}.`;
  }

  private static readonly ASSOCIATE_MSG = 'Associate is required. Search and pick one from the list.';

  submitGenerate(): void {
    this.actionError = '';
    if (!this.check([['count', 'Number of PINs', this.countMessage(this.generateCount)]])) return;
    const expiresAt = this.generateExpiresLocal ? new Date(this.generateExpiresLocal).toISOString() : undefined;
    this.service.generate(this.generateCount, expiresAt, this.generatePinType).subscribe({
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
    if (!this.check([
      ['alloc-associate', 'Associate', this.allocateAssociateId ? null : EPinRegisterComponent.ASSOCIATE_MSG],
      ['alloc-count', 'Number of PINs', this.countMessage(this.allocateCount)],
      ['alloc-batch', 'Batch ID', batch === '' || UUID_RE.test(batch) ? null : 'Batch ID is not valid. Paste the full batch ID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) or leave it empty.']
    ])) return;
    this.service.allocate(this.allocateAssociateId, this.allocateCount, batch || undefined, this.allocatePinType || undefined).subscribe({
      next: res => { this.allocateResult = res; this.loadPage(0); },
      error: e => this.fail(e)
    });
  }

  submitRedeem(): void {
    if (this.panel?.kind !== 'redeem') return;
    this.actionError = '';
    if (!this.check([['redeem-associate', 'Associate', this.redeemAssociateId ? null : EPinRegisterComponent.ASSOCIATE_MSG]])) return;
    this.service.redeem(this.panel.epin.id, this.redeemAssociateId, this.redeemType).subscribe({
      next: () => { this.closePanel(); this.refreshSelected(); },
      error: e => this.fail(e)
    });
  }

  submitBlock(): void {
    if (this.panel?.kind !== 'block') return;
    this.actionError = '';
    const reason = (this.panelReason ?? '').trim();
    if (!this.check([['reason', 'Reason', reason ? null : 'Reason is required. Type why this PIN is being blocked.']])) return;
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
    const fields = toFieldErrors(e);
    if (e.status === 400 && Object.keys(fields).length) {
      // Server field names -> the ids used by the open form.
      const ids: Record<string, string> = { count: this.panel?.kind === 'allocate' ? 'alloc-count' : 'count', batchId: 'alloc-batch', associateId: 'associate', reason: 'reason' };
      this.errs = {};
      this.issues = Object.entries(fields).map(([k, message]) => ({ id: ids[k] ?? k, label: k, message }));
      this.issues.forEach(i => (this.errs[i.id] = i.message));
      return;
    }
    this.actionError = e.status === 409 ? 'admin.epinRegister.errorConflict'
      : e.status === 404 ? 'admin.epinRegister.errorNotFound'
      : e.status === 400 ? 'admin.epinRegister.errorInvalid'
      : 'admin.epinRegister.errorGeneric';
  }
}
