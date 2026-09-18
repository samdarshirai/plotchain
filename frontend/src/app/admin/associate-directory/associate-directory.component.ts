import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage, AdminAssociateFilters } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';
import { NewAssociatePanelComponent } from '../new-associate-panel/new-associate-panel.component';
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { CompensationPlanService } from '../../setup/steps/compensation/compensation-plan.service';
import { RankOption } from '../../setup/models/compensation-plan.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { titleCase } from '../../shared/utils/title-case';

const PAGE_SIZE = 20;

// Enum values the backend returns for kycStatus/status are shouty-uppercase (PENDING/VERIFIED/...);
// the mockup renders them Title Case (Viraj_Acres_Settings.dc.html lines 646-650) -- see the shared
// titleCase() helper for why the row-building step converts before the value reaches the table.
@Component({
  selector: 'app-associate-directory',
  standalone: true,
  imports: [CommonModule, TranslateModule, SidePanelComponent, InlineBannerComponent, NewAssociatePanelComponent, EditableTableComponent],
  template: `
    <div class="associate-directory">
      <div class="associate-directory__header">
        <div>
          <h1 class="card-title">{{ 'admin.associateDirectory.title' | translate }}</h1>
          <p class="associate-directory__subtitle">{{ 'admin.associateDirectory.subtitle' | translate }}</p>
        </div>
        <button type="button" class="associate-directory__new-link brand-button" (click)="openProvisionModal()">
          {{ 'admin.associateDirectory.newAssociateAction' | translate }}
        </button>
      </div>

      <p *ngIf="loadError" class="associate-directory__load-error">{{ 'admin.associateDirectory.loadError' | translate }}</p>
      <p *ngIf="actionError" class="associate-directory__action-error">{{ 'admin.associateDirectory.actionError' | translate }}</p>
      <p *ngIf="rankLoadError" class="associate-directory__rank-load-error">{{ 'admin.associateDirectory.rankLoadError' | translate }}</p>

      <!-- Filter panel and table sit flush against each other (0 gap, table's border-top:none
           against the panel's bottom edge) -- Viraj_Acres_Settings.dc.html lines 280/290. Grouped
           in one wrapper so the parent's flex gap (used for header/error spacing) doesn't land
           between them the way it would if they were direct siblings of .associate-directory. -->
      <div class="associate-directory__list">
      <div class="associate-directory__filters">
        <input
          type="text"
          class="associate-directory__search"
          [placeholder]="'admin.associateDirectory.searchPlaceholder' | translate"
          (input)="onSearchInput($any($event.target).value)"
        />
        <div class="associate-directory__filter-grid">
          <div class="associate-directory__filter-field">
            <label>{{ 'admin.associateDirectory.rankFilterLabel' | translate }}</label>
            <select (change)="onRankChange($any($event.target).value)">
              <option value="">{{ 'admin.associateDirectory.rankFilterAllOption' | translate }}</option>
              <option *ngFor="let rank of availableRanks" [value]="rank.id">{{ rank.name }}</option>
            </select>
          </div>
          <div class="associate-directory__filter-field">
            <label>{{ 'admin.associateDirectory.kycStatusFilterLabel' | translate }}</label>
            <select (change)="onKycStatusChange($any($event.target).value)">
              <option value="">{{ 'admin.associateDirectory.kycStatusFilterAllOption' | translate }}</option>
              <option value="PENDING">PENDING</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>
          <div class="associate-directory__filter-field">
            <label>{{ 'admin.associateDirectory.statusFilterLabel' | translate }}</label>
            <select (change)="onStatusChange($any($event.target).value)">
              <option value="">{{ 'admin.associateDirectory.statusFilterAllOption' | translate }}</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
          <div class="associate-directory__filter-field">
            <label>{{ 'admin.associateDirectory.joinedFromLabel' | translate }}</label>
            <input type="date" (change)="onJoinedFromChange($any($event.target).value)" />
          </div>
        </div>
        <div class="associate-directory__filter-field associate-directory__filter-secondary-row">
          <label>{{ 'admin.associateDirectory.joinedToLabel' | translate }}</label>
          <input type="date" (change)="onJoinedToChange($any($event.target).value)" />
        </div>
      </div>

      <div class="associate-directory__table-wrap">
        <app-editable-table
          [readOnly]="true"
          [columns]="directoryColumns"
          [rows]="directoryRows"
          [emptyStateLabel]="'admin.associateDirectory.emptyState' | translate"
          (rowClick)="selectAssociate(page!.associates[$event].id)"
        ></app-editable-table>

        <div class="associate-directory__pagination" *ngIf="page">
          <button
            type="button"
            class="associate-directory__pagination-action"
            [disabled]="page.page === 0"
            (click)="goToPage(page.page - 1)"
          >
            {{ 'admin.associateDirectory.previousPageAction' | translate }}
          </button>
          <button
            type="button"
            class="associate-directory__pagination-action"
            [disabled]="(page.page + 1) * page.size >= page.totalElements"
            (click)="goToPage(page.page + 1)"
          >
            {{ 'admin.associateDirectory.nextPageAction' | translate }}
          </button>
        </div>
      </div>
      </div>
    </div>

    <app-side-panel [open]="panelOpen" [title]="selected?.userId ?? ''" (closed)="closePanel()">
      <div *ngIf="selected" class="associate-directory__detail">
        <div class="associate-detail__identity">
          <span class="associate-detail__name">{{ selected.name }}</span>
          <span class="editable-table__rank-badge" *ngIf="selected.rankName">{{ selected.rankName }}</span>
          <span class="associate-detail__status-badge" [ngClass]="'associate-detail__status-badge--' + kycStatusBadgeTone(titleCase(selected.kycStatus))">
            {{ titleCase(selected.kycStatus) }}
          </span>
          <span class="associate-detail__status-badge" [ngClass]="'associate-detail__status-badge--' + statusBadgeTone(titleCase(selected.status))">
            {{ titleCase(selected.status) }}
          </span>
        </div>

        <div class="associate-detail__meta">
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.columnUserId' | translate }}</span>
            <span class="cycle-detail__row-value">{{ selected.userId }}</span>
          </div>
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.emailLabel' | translate }}</span>
            <span class="cycle-detail__row-value">{{ selected.email ?? '—' }}</span>
          </div>
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.phoneLabel' | translate }}</span>
            <span class="cycle-detail__row-value">{{ selected.phone ?? '—' }}</span>
          </div>
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.joinedLabel' | translate }}</span>
            <span class="cycle-detail__row-value">{{ selected.joinedAt | date }}</span>
          </div>
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.lastActiveLabel' | translate }}</span>
            <span class="cycle-detail__row-value">{{ selected.lastActiveAt ? (selected.lastActiveAt | date) : '—' }}</span>
          </div>
        </div>

        <div class="associate-detail__meta">
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.sponsorLabel' | translate }}</span>
            <span class="cycle-detail__row-value">{{ selected.sponsorUserId ?? '—' }}</span>
          </div>
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.placementLabel' | translate }}</span>
            <span class="cycle-detail__row-value">{{ selected.parentUserId ?? '—' }} ({{ selected.position ?? '—' }})</span>
          </div>
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.downlineLabel' | translate }}</span>
            <span class="cycle-detail__row-value">{{ selected.directDownlineCount }} / {{ selected.totalDownlineCount }}</span>
          </div>
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.leftLegVolumeLabel' | translate }}</span>
            <span class="cycle-detail__row-value">₹{{ selected.leftLegVolume | number }}</span>
          </div>
          <div class="cycle-detail__row">
            <span class="cycle-detail__row-label">{{ 'admin.associateDirectory.rightLegVolumeLabel' | translate }}</span>
            <span class="cycle-detail__row-value">₹{{ selected.rightLegVolume | number }}</span>
          </div>
        </div>

        <app-inline-banner *ngIf="temporaryPassword" tone="success">
          {{ 'admin.associateDirectory.temporaryPasswordNotice' | translate }}: <strong>{{ temporaryPassword }}</strong>
        </app-inline-banner>

        <div class="associate-detail__actions">
          <button type="button" class="brand-button brand-button--danger" *ngIf="selected.status === 'ACTIVE'" (click)="suspendSelected()">
            {{ 'admin.associateDirectory.suspendAction' | translate }}
          </button>
          <button type="button" class="brand-button" *ngIf="selected.status === 'SUSPENDED'" (click)="reactivateSelected()">
            {{ 'admin.associateDirectory.reactivateAction' | translate }}
          </button>
          <button type="button" class="brand-button brand-button--secondary" (click)="resetPasswordForSelected()">
            {{ 'admin.associateDirectory.resetPasswordAction' | translate }}
          </button>
        </div>
      </div>
    </app-side-panel>

    <app-new-associate-panel
      [open]="modalOpen"
      (closed)="closeProvisionModal()"
      (created)="loadPage(page?.page ?? 0)"
    ></app-new-associate-panel>
  `
})
export class AssociateDirectoryComponent implements OnInit {
  // Exposed so the detail-panel template can Title Case selected.kycStatus/status the same way
  // loadPage() already does for the table rows (both feed the same badge-tone methods below).
  readonly titleCase = titleCase;

  private associateDirectoryService = inject(AssociateDirectoryService);
  private compensationPlanService = inject(CompensationPlanService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

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

  // "New Associate" panel state -- opened by the header button or by the admin-dashboard
  // quick-action via the ?provision=1 query param. The panel (app-new-associate-panel) owns the
  // provisioning form and sponsor/parent data itself.
  modalOpen = false;

  ngOnInit(): void {
    this.directoryColumns = [
      { key: 'userId', label: this.translate.instant('admin.associateDirectory.columnUserId'), type: 'text' },
      { key: 'name', label: this.translate.instant('admin.associateDirectory.columnName'), type: 'text' },
      { key: 'rankName', label: this.translate.instant('admin.associateDirectory.columnRank'), type: 'rank-badge' },
      {
        key: 'kycStatus',
        label: this.translate.instant('admin.associateDirectory.columnKycStatus'),
        type: 'badge',
        badgeTone: value => this.kycStatusBadgeTone(value)
      },
      {
        key: 'status',
        label: this.translate.instant('admin.associateDirectory.columnStatus'),
        type: 'badge',
        badgeTone: value => this.statusBadgeTone(value)
      }
    ];
    this.compensationPlanService.getCurrent().subscribe({
      next: res => (this.availableRanks = res.availableRanks),
      error: () => (this.rankLoadError = true)
    });
    this.loadPage(0);
    if (this.route.snapshot.queryParamMap.has('provision')) {
      this.openProvisionModal();
      // Strip the param so closing the modal then refreshing/going back doesn't reopen it.
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
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

  // Colors by the cell's own value, not by which column it renders in -- KYC Status and Status
  // take different value sets (PENDING/VERIFIED/REJECTED vs ACTIVE/SUSPENDED) so each gets its own
  // mapping even though both ultimately point at the same three status tokens.
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

  statusBadgeTone(value: string | number): BadgeTone {
    switch (value) {
      case 'Active':
        return 'success';
      case 'Suspended':
        return 'danger';
      default:
        return 'default';
    }
  }

  openProvisionModal(): void {
    this.modalOpen = true;
  }

  closeProvisionModal(): void {
    this.modalOpen = false;
  }

  loadPage(page: number): void {
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
          kycStatus: titleCase(a.kycStatus),
          status: titleCase(a.status)
        }));
      },
      error: () => (this.loadError = true)
    });
  }
}
