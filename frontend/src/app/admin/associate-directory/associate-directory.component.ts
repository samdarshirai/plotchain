import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage, AdminAssociateFilters } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';
import { CompensationPlanService } from '../../setup/steps/compensation/compensation-plan.service';
import { RankOption } from '../../setup/models/compensation-plan.model';
import { EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-associate-directory',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink, SidePanelComponent, EditableTableComponent],
  template: `
    <div class="associate-directory">
      <div class="associate-directory__header">
        <div>
          <h1 class="card-title">{{ 'admin.associateDirectory.title' | translate }}</h1>
          <p class="associate-directory__subtitle">{{ 'admin.associateDirectory.subtitle' | translate }}</p>
        </div>
        <a class="associate-directory__new-link brand-button" [routerLink]="['/admin/associates/new']">
          {{ 'admin.associateDirectory.newAssociateAction' | translate }}
        </a>
      </div>

      <div class="associate-directory__filters">
        <input
          type="text"
          [placeholder]="'admin.associateDirectory.searchPlaceholder' | translate"
          (input)="onSearchInput($any($event.target).value)"
        />
        <label>
          {{ 'admin.associateDirectory.rankFilterLabel' | translate }}
          <select (change)="onRankChange($any($event.target).value)">
            <option value="">{{ 'admin.associateDirectory.rankFilterAllOption' | translate }}</option>
            <option *ngFor="let rank of availableRanks" [value]="rank.id">{{ rank.name }}</option>
          </select>
        </label>
        <label>
          {{ 'admin.associateDirectory.kycStatusFilterLabel' | translate }}
          <select (change)="onKycStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.associateDirectory.kycStatusFilterAllOption' | translate }}</option>
            <option value="PENDING">PENDING</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <label>
          {{ 'admin.associateDirectory.statusFilterLabel' | translate }}
          <select (change)="onStatusChange($any($event.target).value)">
            <option value="">{{ 'admin.associateDirectory.statusFilterAllOption' | translate }}</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
          </select>
        </label>
        <label>
          {{ 'admin.associateDirectory.joinedFromLabel' | translate }}
          <input type="date" (change)="onJoinedFromChange($any($event.target).value)" />
        </label>
        <label>
          {{ 'admin.associateDirectory.joinedToLabel' | translate }}
          <input type="date" (change)="onJoinedToChange($any($event.target).value)" />
        </label>
      </div>

      <p *ngIf="loadError" class="associate-directory__load-error">{{ 'admin.associateDirectory.loadError' | translate }}</p>
      <p *ngIf="actionError" class="associate-directory__action-error">{{ 'admin.associateDirectory.actionError' | translate }}</p>
      <p *ngIf="rankLoadError" class="associate-directory__rank-load-error">{{ 'admin.associateDirectory.rankLoadError' | translate }}</p>

      <div class="card">
        <app-editable-table
          [readOnly]="true"
          [columns]="directoryColumns"
          [rows]="directoryRows"
          [emptyStateLabel]="'admin.associateDirectory.emptyState' | translate"
          (rowClick)="selectAssociate(page!.associates[$event].id)"
        ></app-editable-table>

        <div class="associate-directory__pagination" *ngIf="page">
          <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
            {{ 'admin.associateDirectory.previousPageAction' | translate }}
          </button>
          <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
            {{ 'admin.associateDirectory.nextPageAction' | translate }}
          </button>
        </div>
      </div>
    </div>

    <app-side-panel [open]="panelOpen" [title]="selected?.userId ?? ''" (closed)="closePanel()">
      <div *ngIf="selected" class="associate-directory__detail">
        <p>{{ selected.name }} — {{ selected.rankName }}</p>
        <p>{{ 'admin.associateDirectory.sponsorLabel' | translate }}: {{ selected.sponsorUserId }}</p>
        <p>{{ 'admin.associateDirectory.placementLabel' | translate }}: {{ selected.parentUserId }} ({{ selected.position }})</p>
        <p>{{ 'admin.associateDirectory.downlineLabel' | translate }}: {{ selected.directDownlineCount }} / {{ selected.totalDownlineCount }}</p>

        <div *ngIf="temporaryPassword" class="associate-directory__temp-password">
          {{ 'admin.associateDirectory.temporaryPasswordNotice' | translate }}: <strong>{{ temporaryPassword }}</strong>
        </div>

        <button type="button" *ngIf="selected.status === 'ACTIVE'" (click)="suspendSelected()">
          {{ 'admin.associateDirectory.suspendAction' | translate }}
        </button>
        <button type="button" *ngIf="selected.status === 'SUSPENDED'" (click)="reactivateSelected()">
          {{ 'admin.associateDirectory.reactivateAction' | translate }}
        </button>
        <button type="button" (click)="resetPasswordForSelected()">
          {{ 'admin.associateDirectory.resetPasswordAction' | translate }}
        </button>
      </div>
    </app-side-panel>
  `
})
export class AssociateDirectoryComponent implements OnInit {
  private associateDirectoryService = inject(AssociateDirectoryService);
  private compensationPlanService = inject(CompensationPlanService);
  private translate = inject(TranslateService);

  page: AdminAssociatePage | null = null;
  selected: AdminAssociateDetail | null = null;
  panelOpen = false;
  temporaryPassword: string | null = null;
  loadError = false;
  actionError = false;
  rankLoadError = false;
  availableRanks: RankOption[] = [];
  directoryColumns: EditableTableColumn[] = [];
  directoryRows: Record<string, string>[] = [];
  private search = '';
  private rank = '';
  private kycStatus = '';
  private status = '';
  private joinedFrom = '';
  private joinedTo = '';

  ngOnInit(): void {
    this.directoryColumns = [
      { key: 'userId', label: this.translate.instant('admin.associateDirectory.columnUserId'), type: 'text' },
      { key: 'name', label: this.translate.instant('admin.associateDirectory.columnName'), type: 'text' },
      { key: 'rankName', label: this.translate.instant('admin.associateDirectory.columnRank'), type: 'text' },
      { key: 'kycStatus', label: this.translate.instant('admin.associateDirectory.columnKycStatus'), type: 'text' },
      { key: 'status', label: this.translate.instant('admin.associateDirectory.columnStatus'), type: 'text' }
    ];
    this.compensationPlanService.getCurrent().subscribe({
      next: res => (this.availableRanks = res.availableRanks),
      error: () => (this.rankLoadError = true)
    });
    this.loadPage(0);
  }

  onSearchInput(value: string): void {
    this.search = value;
    this.loadPage(0);
  }

  onRankChange(value: string): void {
    this.rank = value;
    this.loadPage(0);
  }

  onKycStatusChange(value: string): void {
    this.kycStatus = value;
    this.loadPage(0);
  }

  onStatusChange(value: string): void {
    this.status = value;
    this.loadPage(0);
  }

  onJoinedFromChange(value: string): void {
    this.joinedFrom = value;
    this.loadPage(0);
  }

  onJoinedToChange(value: string): void {
    this.joinedTo = value;
    this.loadPage(0);
  }

  goToPage(page: number): void {
    this.loadPage(page);
  }

  selectAssociate(id: string): void {
    this.temporaryPassword = null;
    this.associateDirectoryService.get(id).subscribe(detail => {
      this.selected = detail;
      this.panelOpen = true;
    });
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  suspendSelected(): void {
    if (!this.selected) return;
    this.actionError = false;
    this.associateDirectoryService.suspend(this.selected.id).subscribe({
      next: detail => {
        this.selected = detail;
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.actionError = true)
    });
  }

  reactivateSelected(): void {
    if (!this.selected) return;
    this.actionError = false;
    this.associateDirectoryService.reactivate(this.selected.id).subscribe({
      next: detail => {
        this.selected = detail;
        this.loadPage(this.page?.page ?? 0);
      },
      error: () => (this.actionError = true)
    });
  }

  resetPasswordForSelected(): void {
    if (!this.selected) return;
    this.actionError = false;
    this.associateDirectoryService.resetPassword(this.selected.id).subscribe({
      next: res => (this.temporaryPassword = res.temporaryPassword),
      error: () => (this.actionError = true)
    });
  }

  private loadPage(page: number): void {
    this.loadError = false;
    const filters: AdminAssociateFilters = {};
    if (this.search) filters.search = this.search;
    if (this.rank) filters.rank = this.rank;
    if (this.kycStatus) filters.kycStatus = this.kycStatus;
    if (this.status) filters.status = this.status;
    if (this.joinedFrom) filters.joinedFrom = this.joinedFrom;
    if (this.joinedTo) filters.joinedTo = this.joinedTo;
    this.associateDirectoryService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.directoryRows = (this.page?.associates ?? []).map(a => ({
          userId: a.userId,
          name: a.name,
          rankName: a.rankName ?? '',
          kycStatus: a.kycStatus,
          status: a.status
        }));
      },
      error: () => (this.loadError = true)
    });
  }
}
