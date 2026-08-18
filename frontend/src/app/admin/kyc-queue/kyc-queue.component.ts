import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { KycQueueService } from './kyc-queue.service';
import { KycPage } from '../models/kyc-page.model';
import { KycCounts } from '../models/kyc-counts.model';
import { TabBarComponent, TabDefinition } from '../../shared/components/tab-bar/tab-bar.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-kyc-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, TabBarComponent, StatTileComponent, EditableTableComponent],
  providers: [DatePipe],
  template: `
    <div class="kyc-queue">
      <h1 class="card-title">{{ 'admin.kycQueue.title' | translate }}</h1>

      <div class="kyc-queue__stats">
        <app-stat-tile
          icon="hourglass_top"
          tone="warning"
          [label]="'admin.kycQueue.tabPending' | translate"
          [value]="(counts?.pending ?? 0).toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="check_circle"
          tone="success"
          [label]="'admin.kycQueue.tabVerified' | translate"
          [value]="(counts?.verified ?? 0).toString()"
        ></app-stat-tile>
        <app-stat-tile
          icon="cancel"
          tone="danger"
          [label]="'admin.kycQueue.tabRejected' | translate"
          [value]="(counts?.rejected ?? 0).toString()"
        ></app-stat-tile>
      </div>

      <div class="kyc-queue__tabs">
        <app-tab-bar [tabs]="tabs" [activeTabId]="activeStatus" (tabChange)="onTabChange($event)"></app-tab-bar>
      </div>

      <div class="card kyc-queue__table-card">
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
          <button type="button" class="kyc-queue__approve-action" (click)="approve(page!.entries[i].id)">
            {{ 'admin.kycQueue.approveAction' | translate }}
          </button>
          <input
            type="text"
            [(ngModel)]="rejectReasons[page!.entries[i].id]"
            [placeholder]="'admin.kycQueue.rejectReasonPlaceholder' | translate"
          />
          <button type="button" (click)="reject(page!.entries[i].id)">
            {{ 'admin.kycQueue.rejectAction' | translate }}
          </button>
        </ng-template>

        <div class="kyc-queue__pagination" *ngIf="page">
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
  `
})
export class KycQueueComponent implements OnInit {
  private kycQueueService = inject(KycQueueService);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);

  page: KycPage | null = null;
  counts: KycCounts | null = null;
  activeStatus = 'PENDING';
  rejectReasons: Record<string, string> = {};
  loadError = false;
  decisionError = false;
  kycColumns: EditableTableColumn[] = [];
  kycRows: Record<string, string>[] = [];

  get tabs(): TabDefinition[] {
    return [
      { id: 'PENDING', label: this.translate.instant('admin.kycQueue.tabPending') },
      { id: 'VERIFIED', label: this.translate.instant('admin.kycQueue.tabVerified') },
      { id: 'REJECTED', label: this.translate.instant('admin.kycQueue.tabRejected') }
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

  ngOnInit(): void {
    this.loadCounts();
    this.loadPage(0);
  }

  onTabChange(status: string): void {
    this.activeStatus = status;
    this.loadPage(0);
  }

  goToPage(page: number): void {
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

  reject(id: string): void {
    this.decisionError = false;
    this.kycQueueService.decide(id, 'REJECTED', this.rejectReasons[id]).subscribe({
      next: () => {
        delete this.rejectReasons[id];
        this.loadPage(this.page?.page ?? 0);
        this.loadCounts();
      },
      error: () => (this.decisionError = true)
    });
  }

  private loadPage(page: number): void {
    this.loadError = false;
    this.decisionError = false;
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
    }
    this.kycColumns = columns;

    this.kycRows = (this.page?.entries ?? []).map(entry => ({
      userId: entry.userId,
      name: entry.name,
      joinedAt: this.datePipe.transform(entry.joinedAt, 'medium') ?? entry.joinedAt
    }));
  }
}
