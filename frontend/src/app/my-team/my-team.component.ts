import { formatIst } from '../shared/utils/ist-date';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MyTeamService } from './my-team.service';
import { fetchAllPages } from '../shared/utils/fetch-all-pages';
import { AdminAssociatePage, AdminAssociateFilters } from '../admin/models/admin-associate-page.model';
import { FieldErrorComponent } from '../shared/components/field-error/field-error.component';
import { TabBarComponent, TabDefinition } from '../shared/components/tab-bar/tab-bar.component';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { titleCase } from '../shared/utils/title-case';
import { TableToolsComponent } from '../shared/components/table-tools/table-tools.component';

// Same views as the admin directory: Green = KYC VERIFIED, Red = anything else, By Date = newest first.
type TeamView = 'all' | 'green' | 'red' | 'left' | 'right' | 'byDate' | 'sponsored';
const VIEWS: TeamView[] = ['all', 'green', 'red', 'left', 'right', 'byDate', 'sponsored'];

// Reuses the admin directory's .associate-directory__* global styles (styles/_admin.scss).
@Component({
  selector: 'app-my-team',
  standalone: true,
  imports: [TableToolsComponent, CommonModule, TranslateModule, EditableTableComponent, TabBarComponent, FieldErrorComponent],
  template: `
    <div class="associate-directory">
      <div class="associate-directory__header">
        <div class="associate-directory__intro">
          <h1 class="card-title">{{ 'myTeam.title' | translate }}</h1>
          <p class="associate-directory__subtitle">{{ 'myTeam.subtitle' | translate }}</p>
        </div>
      </div>

      <p *ngIf="loadError" class="associate-directory__load-error">{{ 'admin.associateDirectory.loadError' | translate }}</p>

      <div class="associate-directory__list">
        <app-tab-bar [tabs]="viewTabs" [activeTabId]="view" (tabChange)="onViewChange($event)"></app-tab-bar>
        <div class="associate-directory__filters">
          <span class="associate-directory__search-wrap">
            <span class="material-symbols-outlined" aria-hidden="true">search</span>
            <input type="text" class="associate-directory__search"
              [placeholder]="'admin.associateDirectory.searchPlaceholder' | translate"
              (input)="search = $any($event.target).value; loadPage()" />
          </span>
          <div class="associate-directory__filter-grid">
            <div class="associate-directory__filter-field">
              <label>{{ 'admin.associateDirectory.statusFilterLabel' | translate }}</label>
              <select (change)="status = $any($event.target).value; loadPage()">
                <option value="">{{ 'admin.associateDirectory.statusFilterAllOption' | translate }}</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </div>
            <div class="associate-directory__filter-field">
              <label>{{ 'admin.associateDirectory.joinedFromLabel' | translate }}</label>
              <input type="date" (change)="joinedFrom = $any($event.target).value; loadPage()" />
            </div>
            <div class="associate-directory__filter-field">
              <label>{{ 'admin.associateDirectory.joinedToLabel' | translate }}</label>
              <input type="date" (change)="joinedTo = $any($event.target).value; loadPage()" />
              <app-field-error [message]="rangeError"></app-field-error>
            </div>
          </div>
        </div>

        <div class="associate-directory__table-wrap">
          <app-table-tools filename="my-team"></app-table-tools>
          <app-editable-table
            [readOnly]="true"
            [columns]="columns"
            [rows]="rows"
            [emptyStateLabel]="'admin.associateDirectory.emptyState' | translate"
          ></app-editable-table>
        </div>
      </div>
    </div>
  `
})
export class MyTeamComponent implements OnInit {
  private myTeamService = inject(MyTeamService);
  private translate = inject(TranslateService);

  page: AdminAssociatePage | null = null;
  loadError = false;
  view: TeamView = 'all';
  viewTabs: TabDefinition[] = [];
  columns: EditableTableColumn[] = [];
  private allColumns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];
  search = '';
  status = '';
  joinedFrom = '';
  joinedTo = '';

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant('admin.associateDirectory.' + k);
    this.viewTabs = VIEWS.map(id => ({ id, label: t('views.' + id) }));
    this.allColumns = [
      { key: 'userId', label: t('columnUserId'), type: 'text', bold: true },
      { key: 'name', label: t('columnName'), type: 'text', bold: true },
      { key: 'phone', label: t('columnPhone'), type: 'text' },
      { key: 'sponsorUserId', label: t('columnSponsorId'), type: 'text' },
      { key: 'parentUserId', label: t('columnParentId'), type: 'text' },
      { key: 'position', label: t('columnPosition'), type: 'text' },
      { key: 'status', label: t('columnStatus'), type: 'badge', badgeTone: v => this.statusTone(v) },
      { key: 'joinedAt', label: t('columnRegistrationDate'), type: 'text' }
    ];
    this.applyColumns();
    this.loadPage();
    this.loadCounts();
  }

  // Parent ID shows only on the Sponsored Associates tab.
  private applyColumns(): void {
    this.columns = this.allColumns.filter(c => c.key !== 'parentUserId' || this.view === 'sponsored');
  }

  onViewChange(view: string): void {
    this.view = view as TeamView;
    this.applyColumns();
    this.loadPage();
  }

  get rangeError(): string | undefined {
    return this.joinedFrom && this.joinedTo && this.joinedFrom > this.joinedTo ? 'From date is after To date. Pick a From date on or before the To date.' : undefined;
  }

  loadPage(): void {
    if (this.rangeError) return;
    this.loadError = false;
    const filters: AdminAssociateFilters = {};
    if (this.search) filters.search = this.search;
    if (this.view === 'green') filters.kycStatus = 'VERIFIED';
    if (this.view === 'red') filters.excludeKycStatus = 'VERIFIED';
    if (this.view === 'left') filters.leg = 'L';
    if (this.view === 'right') filters.leg = 'R';
    if (this.view === 'all') filters.includeSelf = 'true';
    if (this.view === 'sponsored') filters.sponsoredOnly = 'true';
    if (this.view === 'byDate') filters.newestFirst = 'true';
    if (this.status) filters.status = this.status;
    if (this.joinedFrom) filters.joinedFrom = this.joinedFrom;
    if (this.joinedTo) filters.joinedTo = this.joinedTo;
    fetchAllPages((p, size) => this.myTeamService.list(filters, p, size)).subscribe({
      next: res => {
        this.page = res;
        this.rows = res.associates.map(a => ({
          userId: a.userId,
          // Short glyph, not a column: an extra column would push the table into stacked cards.
          name: a.plotBuyer ? `${a.name} 🏞️` : a.name,
          // Server blanks phone for anyone this associate did not sponsor.
          phone: a.phone ?? '—',
          sponsorUserId: a.sponsorUserId ?? '—',
          parentUserId: a.parentUserId ?? '—',
          position: a.position ?? '—',
          status: titleCase(a.status),
          joinedAt: formatIst(a.joinedAt)
        }));
      },
      error: () => (this.loadError = true)
    });
  }

  private loadCounts(): void {
    const n = (f: AdminAssociateFilters) => this.myTeamService.list(f, 0, 1);
    forkJoin([n({}), n({ kycStatus: 'VERIFIED' }), n({ excludeKycStatus: 'VERIFIED' }), n({ leg: 'L' }), n({ leg: 'R' }), n({ sponsoredOnly: 'true' })]).subscribe(([t, g, r, l, rt, sp]) => {
      this.viewTabs = VIEWS.map(id => ({
        id,
        label: this.translate.instant('admin.associateDirectory.views.' + id),
        count: ({ all: t, green: g, red: r, left: l, right: rt, byDate: t, sponsored: sp } as Record<string, { totalElements: number }>)[id]?.totalElements
      }));
    });
  }

  private statusTone(v: string | number): BadgeTone {
    return v === 'Active' ? 'success' : v === 'Suspended' ? 'danger' : 'default';
  }
}
