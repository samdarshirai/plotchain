import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { KycQueueService } from './kyc-queue.service';
import { KycPage } from '../models/kyc-page.model';
import { KycCounts } from '../models/kyc-counts.model';
import { KycQueueEntry } from '../models/kyc-queue-entry.model';
import { TabBarComponent, TabDefinition } from '../../shared/components/tab-bar/tab-bar.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { titleCase } from '../../shared/utils/title-case';

const PAGE_SIZE = 20;
const MS_PER_DAY = 86_400_000;

@Component({
  selector: 'app-kyc-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, TabBarComponent, StatTileComponent, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="kyc-queue">
      <div class="kyc-queue__header">
        <div>
          <p class="kyc-queue__eyebrow">{{ 'admin.kycQueue.eyebrow' | translate }}</p>
          <h1 class="card-title">{{ 'admin.kycQueue.title' | translate }}</h1>
        </div>
        <span class="kyc-queue__synced" *ngIf="syncedAt">
          {{ 'admin.kycQueue.lastSynced' | translate: { time: (syncedAt | date: 'shortTime') } }}
        </span>
      </div>

      <div class="kyc-queue__stats">
        <!-- Seal Card (DESIGN.md SS5): the one card per screen allowed to look like the mark --
             Parchment variant, one figure (pending count). -->
        <div class="kyc-queue__seal">
          <div class="kyc-queue__seal-label">
            <span class="kyc-queue__rule"></span>
            {{ 'admin.kycQueue.sealLabel' | translate }}
            <span class="kyc-queue__rule kyc-queue__rule--flex"></span>
          </div>
          <div class="kyc-queue__seal-body">
            <span class="kyc-queue__seal-figure">{{ counts?.pending ?? 0 }}</span>
            <span class="kyc-queue__seal-hint" *ngIf="oldestPendingDays !== null">
              {{ 'admin.kycQueue.sealOldestHint' | translate: { days: oldestPendingDays } }}
            </span>
          </div>
        </div>
        <app-stat-tile
          tone="success"
          [label]="'admin.kycQueue.tabVerified' | translate"
          [value]="(counts?.verified ?? 0).toString()"
        ></app-stat-tile>
        <app-stat-tile
          tone="danger"
          [label]="'admin.kycQueue.tabRejected' | translate"
          [value]="(counts?.rejected ?? 0).toString()"
        ></app-stat-tile>
      </div>

      <div class="kyc-queue__tabs">
        <app-tab-bar [tabs]="tabs" [activeTabId]="activeStatus" (tabChange)="onTabChange($event)"></app-tab-bar>
      </div>

      <div class="kyc-queue__table-card">
        <p *ngIf="loadError" class="kyc-queue__load-error">{{ 'admin.kycQueue.loadError' | translate }}</p>
        <p *ngIf="decisionError" class="kyc-queue__decision-error">{{ 'admin.kycQueue.decisionError' | translate }}</p>

        <app-editable-table
          [readOnly]="true"
          [columns]="kycColumns"
          [rows]="kycRows"
          [actionTemplate]="actionsTpl"
          [emptyStateLabel]="'admin.kycQueue.emptyState' | translate"
        ></app-editable-table>
        <ng-template #actionsTpl let-i="index">
          <div class="kyc-queue__row-actions">
            <button type="button" class="kyc-queue__reject-action" (click)="openReject(page!.entries[i].id)">
              {{ 'admin.kycQueue.rejectAction' | translate }}
            </button>
            <button type="button" class="kyc-queue__approve-action" (click)="approve(page!.entries[i].id)">
              {{ 'admin.kycQueue.approveAction' | translate }}
            </button>
          </div>
        </ng-template>

        <div class="kyc-queue__reject-drawer" *ngIf="rejectingEntry as entry">
          <div class="kyc-queue__reject-title">
            <span class="kyc-queue__rule kyc-queue__rule--danger"></span>
            {{ 'admin.kycQueue.rejectDrawerTitle' | translate: { id: entry.userId, name: entry.name } }}
            <span class="kyc-queue__rule kyc-queue__rule--flex kyc-queue__rule--danger"></span>
          </div>
          <div class="kyc-queue__chips">
            <button
              type="button"
              class="kyc-queue__chip"
              *ngFor="let chip of rejectChips"
              [class.kyc-queue__chip--active]="selectedChip === chip"
              (click)="selectChip(chip)"
            >
              {{ chip }}
            </button>
          </div>
          <div class="kyc-queue__reject-controls">
            <input
              type="text"
              [(ngModel)]="rejectDraft"
              [placeholder]="'admin.kycQueue.rejectReasonPlaceholder' | translate"
            />
            <button type="button" class="kyc-queue__reject-cancel" (click)="cancelReject()">
              {{ 'admin.kycQueue.rejectCancelAction' | translate }}
            </button>
            <button
              type="button"
              class="kyc-queue__reject-confirm"
              [disabled]="!rejectReason"
              (click)="confirmReject()"
            >
              {{ 'admin.kycQueue.rejectConfirmAction' | translate }}
            </button>
          </div>
        </div>

        <div class="kyc-queue__footer" *ngIf="page">
          <span class="kyc-queue__summary">
            {{ 'admin.kycQueue.showingSummary' | translate: { shown: page.entries.length, total: page.totalElements, status: statusWord } }}
          </span>

          <div class="kyc-queue__pagination">
            <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
              {{ 'admin.kycQueue.previousPageAction' | translate }}
            </button>
            <span class="kyc-queue__page-indicator">
              {{ 'admin.kycQueue.pageIndicator' | translate: { page: currentPage, totalPages: totalPages } }}
            </span>
            <button
              type="button"
              [disabled]="(page.page + 1) * page.size >= page.totalElements"
              (click)="goToPage(page.page + 1)"
            >
              {{ 'admin.kycQueue.nextPageAction' | translate }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class KycQueueComponent implements OnInit {
  private kycQueueService = inject(KycQueueService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);

  page: KycPage | null = null;
  counts: KycCounts | null = null;
  activeStatus = 'PENDING';
  loadError = false;
  decisionError = false;
  kycColumns: EditableTableColumn[] = [];
  kycRows: Record<string, string>[] = [];
  syncedAt: Date | null = null;

  // Reject drawer state -- replaces the old per-row rejectReasons map: only one row is
  // ever mid-rejection, so a single id + draft + chip is enough.
  rejectingId: string | null = null;
  rejectDraft = '';
  selectedChip: string | null = null;

  get tabs(): TabDefinition[] {
    return [
      { id: 'PENDING', label: `${this.translate.instant('admin.kycQueue.tabPending')} ${this.counts?.pending ?? 0}` },
      { id: 'VERIFIED', label: `${this.translate.instant('admin.kycQueue.tabVerified')} ${this.counts?.verified ?? 0}` },
      { id: 'REJECTED', label: `${this.translate.instant('admin.kycQueue.tabRejected')} ${this.counts?.rejected ?? 0}` }
    ];
  }

  get currentPage(): number {
    return (this.page?.page ?? 0) + 1;
  }

  get totalPages(): number {
    if (!this.page || this.page.size === 0) {
      return 1;
    }
    return Math.max(1, Math.ceil(this.page.totalElements / this.page.size));
  }

  get statusWord(): string {
    const key =
      this.activeStatus === 'VERIFIED' ? 'tabVerified' : this.activeStatus === 'REJECTED' ? 'tabRejected' : 'tabPending';
    return this.translate.instant('admin.kycQueue.' + key).toLowerCase();
  }

  get rejectChips(): string[] {
    return [
      this.translate.instant('admin.kycQueue.reasonChipUnreadable'),
      this.translate.instant('admin.kycQueue.reasonChipNameMismatch'),
      this.translate.instant('admin.kycQueue.reasonChipExpiredId'),
      this.translate.instant('admin.kycQueue.reasonChipDuplicate')
    ];
  }

  get rejectingEntry(): KycQueueEntry | null {
    return this.page?.entries.find(entry => entry.id === this.rejectingId) ?? null;
  }

  get rejectReason(): string {
    return this.rejectDraft.trim() || this.selectedChip || '';
  }

  // Age of the oldest pending item, from the first row of PENDING page 0 (the list is
  // ...OrderByJoinedAtAsc). ponytail: page-0 PENDING only -- a cross-tab "oldest" would
  // need its own count query; not worth it for a hint.
  get oldestPendingDays(): number | null {
    if (this.activeStatus !== 'PENDING' || this.page?.page !== 0 || !this.page.entries.length) {
      return null;
    }
    return Math.floor((Date.now() - Date.parse(this.page.entries[0].joinedAt)) / MS_PER_DAY);
  }

  ngOnInit(): void {
    this.loadCounts();
    this.loadPage(0);
  }

  onTabChange(status: string): void {
    this.activeStatus = status;
    this.cancelReject();
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.cancelReject();
    this.loadPage(page);
  }

  approve(id: string): void {
    this.decisionError = false;
    this.kycQueueService.decide(id, 'VERIFIED').subscribe({
      next: () => {
        this.loadPage(this.page?.page ?? 0);
        this.loadCounts();
      },
      error: () => (this.decisionError = true)
    });
  }

  openReject(id: string): void {
    this.decisionError = false;
    this.rejectingId = id;
    this.rejectDraft = '';
    this.selectedChip = null;
  }

  cancelReject(): void {
    this.rejectingId = null;
    this.rejectDraft = '';
    this.selectedChip = null;
  }

  selectChip(chip: string): void {
    this.selectedChip = this.selectedChip === chip ? null : chip;
  }

  confirmReject(): void {
    if (!this.rejectingId || !this.rejectReason) {
      return;
    }
    this.decisionError = false;
    this.kycQueueService.decide(this.rejectingId, 'REJECTED', this.rejectReason).subscribe({
      next: () => {
        this.cancelReject();
        this.loadPage(this.page?.page ?? 0);
        this.loadCounts();
      },
      error: () => (this.decisionError = true)
    });
  }

  private loadPage(page: number): void {
    this.loadError = false;
    this.decisionError = false;
    this.syncedAt = new Date();
    this.kycQueueService.list(this.activeStatus, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.updateTableData();
      },
      error: () => (this.loadError = true)
    });
  }

  private loadCounts(): void {
    this.kycQueueService.counts().subscribe(res => (this.counts = res));
  }

  private updateTableData(): void {
    const columns: EditableTableColumn[] = [
      { key: 'userId', label: this.translate.instant('admin.kycQueue.columnUserId'), type: 'text' },
      { key: 'name', label: this.translate.instant('admin.kycQueue.columnName'), type: 'text' },
      { key: 'joinedAt', label: this.translate.instant('admin.kycQueue.columnJoinedAt'), type: 'text' }
    ];
    if (this.activeStatus === 'PENDING') {
      columns.push({ key: 'actions', label: this.translate.instant('admin.kycQueue.columnActions'), type: 'action' });
    } else {
      // Verified / Rejected tabs have no per-row action, so the trailing column becomes a
      // status badge (green / brick) -- keeps those views on the same ledger grid as PENDING
      // rather than trailing off into empty space.
      columns.push({
        key: 'status',
        label: this.translate.instant('admin.kycQueue.columnStatus'),
        type: 'badge',
        badgeTone: value => this.kycStatusBadgeTone(value)
      });
    }
    this.kycColumns = columns;

    this.kycRows = (this.page?.entries ?? []).map(entry => ({
      userId: entry.userId,
      name: entry.name,
      joinedAt: this.datePipe.transform(entry.joinedAt, 'dd-MMM-yyyy HH:mm') ?? entry.joinedAt,
      status: titleCase(entry.kycStatus)
    }));
  }

  kycStatusBadgeTone(value: string | number): BadgeTone {
    switch (value) {
      case 'Verified':
        return 'success';
      case 'Pending':
        return 'warning';
      case 'Rejected':
        return 'danger';
      default:
        return 'default';
    }
  }
}
