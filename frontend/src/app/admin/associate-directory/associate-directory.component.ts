import { formatIst } from '../../shared/utils/ist-date';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../auth/auth.service';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage, AdminAssociateFilters } from '../models/admin-associate-page.model';
import { NewAssociatePanelComponent } from '../new-associate-panel/new-associate-panel.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { titleCase } from '../../shared/utils/title-case';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { TabBarComponent, TabDefinition } from '../../shared/components/tab-bar/tab-bar.component';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';

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
  imports: [CommonModule, TranslateModule, InlineBannerComponent, NewAssociatePanelComponent, EditableTableComponent, TabBarComponent, FieldErrorComponent],
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
      <p *ngIf="loginError" class="associate-directory__login-error">{{ 'admin.associateDirectory.loginError' | translate }}</p>

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
            <app-field-error [message]="rangeError"></app-field-error>
          </div>
        </div>
      </div>

      <div class="associate-directory__table-wrap">
        <app-editable-table
          [readOnly]="true"
          [columns]="directoryColumns"
          [rows]="directoryRows"
          [actionTemplate]="loginTpl"
          [emptyStateLabel]="'admin.associateDirectory.emptyState' | translate"
        ></app-editable-table>
        <!-- Rows are built from page.associates, so the template's index maps straight back to it. -->
        <ng-template #loginTpl let-i="index">
          <div class="associate-directory__row-actions">
            <button
              *ngIf="canLogin(i)"
              type="button"
              class="associate-directory__login"
              (click)="loginAs(page!.associates[i].id, page!.associates[i].name)"
            >
              {{ 'admin.associateDirectory.loginAction' | translate }}
            </button>
            <button
              *ngIf="page?.associates?.[i] as a"
              type="button"
              class="associate-directory__recalculate"
              [disabled]="recalculatingId !== null"
              (click)="recalculate(a.id)"
            >
              {{ (recalculatingId === a.id ? 'admin.associateDirectory.recalculatingAction'
                  : recalculatedId === a.id ? 'admin.associateDirectory.recalculatedAction'
                  : 'admin.associateDirectory.recalculateAction') | translate }}
            </button>
            <button
              *ngIf="page?.associates?.[i] as a"
              type="button"
              class="associate-directory__recalculate associate-directory__edit"
              (click)="openEdit(a.id)"
            >
              {{ 'admin.associateDirectory.editAction' | translate }}
            </button>
            <ng-container *ngIf="page?.associates?.[i] as a">
              <button type="button" class="associate-directory__recalculate" *ngIf="a.status === 'ACTIVE'" (click)="suspend(a.id)">
                {{ 'admin.associateDirectory.suspendAction' | translate }}
              </button>
              <button type="button" class="associate-directory__recalculate" *ngIf="a.status === 'SUSPENDED'" (click)="reactivate(a.id)">
                {{ 'admin.associateDirectory.reactivateAction' | translate }}
              </button>
            </ng-container>
          </div>
        </ng-template>

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

    <app-new-associate-panel
      *ngIf="editId"
      [open]="true"
      [editAssociateId]="editId"
      (closed)="editId = null"
      (saved)="onEdited()"
    ></app-new-associate-panel>

    <app-new-associate-panel
      [open]="modalOpen"
      (closed)="closeProvisionModal()"
      (created)="loadPage(page?.page ?? 0); loadCounts()"
    ></app-new-associate-panel>
  `
})
export class AssociateDirectoryComponent implements OnInit {
  private associateDirectoryService = inject(AssociateDirectoryService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);

  page: AdminAssociatePage | null = null;
  editId: string | null = null;
  loadError = false;
  actionError = false;
  loginError = false;
  recalculatingId: string | null = null;
  recalculatedId: string | null = null;
  directoryColumns: EditableTableColumn[] = [];
  directoryRows: Record<string, string>[] = [];
  private search = '';
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
      { key: 'phone', label: this.translate.instant('admin.associateDirectory.columnPhone'), type: 'text' },
      { key: 'sponsorUserId', label: this.translate.instant('admin.associateDirectory.columnSponsorId'), type: 'text' },
      { key: 'position', label: this.translate.instant('admin.associateDirectory.columnPosition'), type: 'text' },
      {
        key: 'status',
        label: this.translate.instant('admin.associateDirectory.columnStatus'),
        type: 'badge',
        badgeTone: value => this.statusBadgeTone(value)
      },
      { key: 'joinedAt', label: this.translate.instant('admin.associateDirectory.columnRegistrationDate'), type: 'text' },
      { key: 'loginPassword', label: this.translate.instant('admin.associateDirectory.loginPasswordLabel'), type: 'text', icon: 'key' },
      { key: 'transactionPassword', label: this.translate.instant('admin.associateDirectory.transactionPasswordLabel'), type: 'text', icon: 'lock' },
      { key: 'login', label: this.translate.instant('admin.associateDirectory.columnLogin'), type: 'action', icon: 'login' }
    ];
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

  // Defensive role guard (the directory only lists associates today); rows can briefly outlive page.associates.
  canLogin(index: number): boolean {
    const a = this.page?.associates[index];
    return !!a && a.role === 'ASSOCIATE' && a.status !== 'SUSPENDED';
  }

  // Opens the associate's dashboard in a new tab; the admin session in this tab is untouched.
  // The tab is opened up front, inside the click, so popup blockers allow it.
  loginAs(id: string, name: string): void {
    this.loginError = false;
    // No noopener: the session is written into this tab's own sessionStorage.
    const tab = window.open('', '_blank');
    if (!tab) {
      this.loginError = true;
      return;
    }
    this.authService.impersonate(id, name, tab).subscribe({
      next: () => {
        tab.location.href = '/dashboard';
      },
      error: () => {
        tab.close();
        this.loginError = true;
      }
    });
  }

  // Re-runs the open cycles' live income server-side (tree-wide), so this associate's matching,
  // royalty and reward numbers reflect every recorded sale without waiting for a payment or close.
  recalculate(id: string): void {
    this.actionError = false;
    this.recalculatingId = id;
    this.recalculatedId = null;
    this.associateDirectoryService.recalculate(id).subscribe({
      next: () => {
        this.recalculatingId = null;
        this.recalculatedId = id;
      },
      error: () => {
        this.recalculatingId = null;
        this.actionError = true;
      }
    });
  }

  openEdit(id: string): void {
    this.editId = id;
  }

  onEdited(): void {
    this.loadPage(this.page?.page ?? 0);
  }

  suspend(id: string): void {
    this.actionError = false;
    this.associateDirectoryService.suspend(id).subscribe({
      next: () => { this.loadPage(this.page?.page ?? 0); this.loadCounts(); },
      error: () => (this.actionError = true)
    });
  }

  reactivate(id: string): void {
    this.actionError = false;
    this.associateDirectoryService.reactivate(id).subscribe({
      next: () => { this.loadPage(this.page?.page ?? 0); this.loadCounts(); },
      error: () => (this.actionError = true)
    });
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

  get rangeError(): string | undefined {
    return this.joinedFrom && this.joinedTo && this.joinedFrom > this.joinedTo ? 'From date is after To date. Pick a From date on or before the To date.' : undefined;
  }

  loadPage(page: number): void {
    if (this.rangeError) return;
    this.loadError = false;
    const filters: AdminAssociateFilters = {};
    if (this.search) filters.search = this.search;
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
          // Short glyph, not a column: an extra column pushed the table past its container and into stacked cards.
          name: a.plotBuyer ? `${a.name} 🏞️` : a.name,
          phone: a.phone ?? '—',
          sponsorUserId: a.sponsorUserId ?? '—',
          position: a.position ?? '—',
          status: titleCase(a.status),
          joinedAt: formatIst(a.joinedAt),
          loginPassword: a.loginPassword ?? '—',
          transactionPassword: a.transactionPassword ?? '—'
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
