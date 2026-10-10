import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
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
import { TabBarComponent, TabDefinition } from '../../shared/components/tab-bar/tab-bar.component';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';
import { titleCase } from '../../shared/utils/title-case';

const PAGE_SIZE = 20;

// Quick views over the directory. Green/Red are KYC-based: Green = VERIFIED, Red = anything else.
// By Date lists newest joiners first.
type DirectoryView = 'all' | 'green' | 'red' | 'left' | 'right' | 'byDate';
interface DirectoryCounts { total: number; active: number; inactive: number; kycPending: number; green: number; red: number }
const VIEWS: DirectoryView[] = ['all', 'green', 'red', 'left', 'right', 'byDate'];

// Enum values the backend returns for kycStatus/status are shouty-uppercase (PENDING/VERIFIED/...);
// the mockup renders them Title Case (Viraj_Acres_Settings.dc.html lines 646-650) -- see the shared
// titleCase() helper for why the row-building step converts before the value reaches the table.
@Component({
  selector: 'app-associate-directory',
  standalone: true,
  imports: [CommonModule, TranslateModule, SidePanelComponent, InlineBannerComponent, NewAssociatePanelComponent, EditableTableComponent, TabBarComponent],
  template: `
    <div class="associate-directory">
      <div class="associate-directory__header">
        <div class="associate-directory__intro">
          <div class="associate-directory__eyebrow">{{ 'admin.associateDirectory.eyebrow' | translate }}</div>
          <h1 class="card-title">{{ 'admin.associateDirectory.title' | translate }}</h1>
          <p class="associate-directory__subtitle">{{ 'admin.associateDirectory.subtitle' | translate }}</p>
          <button type="button" class="associate-directory__new-link brand-button" (click)="openProvisionModal()">
            <span class="material-symbols-outlined" aria-hidden="true">person_add</span>
            {{ 'admin.associateDirectory.newAssociateAction' | translate }}
          </button>
        </div>
        <div class="associate-directory__seal" *ngIf="counts">
          <div class="associate-directory__seal-label">{{ 'admin.associateDirectory.sealLabel' | translate }}</div>
          <div class="associate-directory__seal-total">
            <span class="associate-directory__seal-number">{{ counts.total }}</span>
            <span>{{ 'admin.associateDirectory.sealUnit' | translate }}</span>
          </div>
          <div class="associate-directory__seal-stats">
            <span><i class="associate-directory__dot associate-directory__dot--ok"></i>{{ counts.active }} {{ 'admin.associateDirectory.sealActive' | translate }}</span>
            <span><i class="associate-directory__dot associate-directory__dot--bad"></i>{{ counts.inactive }} {{ 'admin.associateDirectory.sealInactive' | translate }}</span>
            <span><i class="associate-directory__dot associate-directory__dot--warn"></i>{{ counts.kycPending }} {{ 'admin.associateDirectory.sealKycPending' | translate }}</span>
          </div>
        </div>
      </div>

      <p *ngIf="loadError" class="associate-directory__load-error">{{ 'admin.associateDirectory.loadError' | translate }}</p>
      <p *ngIf="actionError" class="associate-directory__action-error">{{ 'admin.associateDirectory.actionError' | translate }}</p>
      <p *ngIf="rankLoadError" class="associate-directory__rank-load-error">{{ 'admin.associateDirectory.rankLoadError' | translate }}</p>

      <!-- Filter panel and table sit flush against each other (0 gap, table's border-top:none
           against the panel's bottom edge) -- Viraj_Acres_Settings.dc.html lines 280/290. Grouped
           in one wrapper so the parent's flex gap (used for header/error spacing) doesn't land
           between them the way it would if they were direct siblings of .associate-directory. -->
      <div class="associate-directory__list">
      <app-tab-bar [tabs]="viewTabs" [activeTabId]="view" (tabChange)="onViewChange($event)"></app-tab-bar>
      <div class="associate-directory__filters">
        <span class="associate-directory__search-wrap">
          <span class="material-symbols-outlined" aria-hidden="true">search</span>
          <input
            type="text"
            class="associate-directory__search"
            [placeholder]="'admin.associateDirectory.searchPlaceholder' | translate"
            (input)="onSearchInput($any($event.target).value)"
          />
        </span>
        <div class="associate-directory__filter-grid">
          <div class="associate-directory__filter-field">
            <label>{{ 'admin.associateDirectory.rankFilterLabel' | translate }}</label>
            <select (change)="onRankChange($any($event.target).value)">
              <option value="">{{ 'admin.associateDirectory.rankFilterAllOption' | translate }}</option>
              <option *ngFor="let rank of availableRanks" [value]="rank.id">{{ rank.name }}</option>
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
          <div class="associate-directory__filter-field">
            <label>{{ 'admin.associateDirectory.joinedToLabel' | translate }}</label>
            <input type="date" (change)="onJoinedToChange($any($event.target).value)" />
          </div>
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

        <app-inline-banner *ngIf="transactionPasswordResetDone" tone="success">
          {{ 'admin.associateDirectory.resetTransactionPasswordDone' | translate }}
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
          <button type="button" class="brand-button brand-button--secondary" (click)="resetTransactionPasswordForSelected()">
            {{ 'admin.associateDirectory.resetTransactionPasswordAction' | translate }}
          </button>
        </div>
      </div>
    </app-side-panel>

    <app-new-associate-panel
      [open]="modalOpen"
      (closed)="closeProvisionModal()"
      (created)="loadPage(page?.page ?? 0); loadCounts()"
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
  transactionPasswordResetDone = false;
  loadError = false;
  actionError = false;
  rankLoadError = false;
  availableRanks: RankOption[] = [];
  directoryColumns: EditableTableColumn[] = [];
  directoryRows: Record<string, string>[] = [];
  private search = '';
  private rank = '';
  view: DirectoryView = 'all';
  viewTabs: TabDefinition[] = [];
  counts: DirectoryCounts | null = null;
  private status = '';
  private joinedFrom = '';
  private joinedTo = '';

  // "New Associate" panel state -- opened by the header button or by the admin-dashboard
  // quick-action via the ?provision=1 query param. The panel (app-new-associate-panel) owns the
  // provisioning form and sponsor/parent data itself.
  modalOpen = false;

  ngOnInit(): void {
    this.viewTabs = VIEWS.map(id => ({ id, label: this.translate.instant('admin.associateDirectory.views.' + id) }));
    this.directoryColumns = [
      { key: 'userId', label: this.translate.instant('admin.associateDirectory.columnUserId'), type: 'text' },
      { key: 'name', label: this.translate.instant('admin.associateDirectory.columnName'), type: 'text' },
      { key: 'sponsorUserId', label: this.translate.instant('admin.associateDirectory.columnSponsorId'), type: 'text' },
      {
        key: 'status',
        label: this.translate.instant('admin.associateDirectory.columnStatus'),
        type: 'badge',
        badgeTone: value => this.statusBadgeTone(value)
      },
      { key: 'joinedAt', label: this.translate.instant('admin.associateDirectory.columnRegistrationDate'), type: 'text' }
    ];
    this.compensationPlanService.getCurrent().subscribe({
      next: res => (this.availableRanks = res.availableRanks),
      error: () => (this.rankLoadError = true)
    });
    this.loadPage(0);
    this.loadCounts();
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

  onViewChange(view: string): void {
    this.view = view as DirectoryView;
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
    this.transactionPasswordResetDone = false;
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
        this.loadCounts();
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
        this.loadCounts();
      },
      error: () => (this.actionError = true)
    });
  }

  resetTransactionPasswordForSelected(): void {
    if (!this.selected) return;
    if (!window.confirm(this.translate.instant('admin.associateDirectory.resetTransactionPasswordConfirm'))) return;
    this.actionError = false;
    this.transactionPasswordResetDone = false;
    this.associateDirectoryService.resetTransactionPassword(this.selected.id).subscribe({
      next: () => (this.transactionPasswordResetDone = true),
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
    if (this.view === 'green') filters.kycStatus = 'VERIFIED';
    if (this.view === 'red') filters.excludeKycStatus = 'VERIFIED';
    if (this.view === 'left') filters.leg = 'L';
    if (this.view === 'right') filters.leg = 'R';
    if (this.view === 'byDate') filters.newestFirst = 'true';
    if (this.status) filters.status = this.status;
    if (this.joinedFrom) filters.joinedFrom = this.joinedFrom;
    if (this.joinedTo) filters.joinedTo = this.joinedTo;
    this.associateDirectoryService.list(filters, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.directoryRows = (this.page?.associates ?? []).map(a => ({
          userId: a.userId,
          name: a.name,
          sponsorUserId: a.sponsorUserId ?? '—',
          status: titleCase(a.status),
          joinedAt: new Date(a.joinedAt).toLocaleDateString('en-GB')
        }));
      },
      error: () => (this.loadError = true)
    });
  }

  // Tab/seal counts: unfiltered size-1 queries, reading only totalElements -- no stats endpoint.
  loadCounts(): void {
    const n = (f: AdminAssociateFilters) => this.associateDirectoryService.list(f, 0, 1);
    forkJoin([
      n({}), n({ status: 'ACTIVE' }), n({ status: 'SUSPENDED' }), n({ kycStatus: 'PENDING' }),
      n({ kycStatus: 'VERIFIED' }), n({ excludeKycStatus: 'VERIFIED' }), n({ leg: 'L' }), n({ leg: 'R' })
    ]).subscribe(([t, a, i, k, g, r, l, rt]) => {
      this.counts = { total: t.totalElements, active: a.totalElements, inactive: i.totalElements, kycPending: k.totalElements, green: g.totalElements, red: r.totalElements };
      this.viewTabs = VIEWS.map(id => ({
        id,
        label: this.translate.instant('admin.associateDirectory.views.' + id),
        count: ({ all: t, green: g, red: r, left: l, right: rt, byDate: t } as Record<string, { totalElements: number }>)[id]?.totalElements
      }));
    });
  }
}
