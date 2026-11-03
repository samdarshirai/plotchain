import { formatIst } from '../shared/utils/ist-date';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MyTeamService } from './my-team.service';
import { AdminAssociatePage } from '../admin/models/admin-associate-page.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../shared/components/editable-table/editable-table.component';
import { titleCase } from '../shared/utils/title-case';

const PAGE_SIZE = 20;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');
const dateTime = (iso: string | null) => formatIst(iso);

// View Associate Downline, shared by associates (scope 'me') and admins (scope 'admin').
// Reuses the .associate-directory__* global styles (styles/_admin.scss); the table stacks into
// cards on narrow screens via table-fit.
@Component({
  selector: 'app-associate-downline',
  standalone: true,
  imports: [CommonModule, TranslateModule, EditableTableComponent],
  template: `
    <div class="associate-directory">
      <div class="associate-directory__header">
        <div class="associate-directory__intro">
          <h1 class="card-title">{{ 'downlineView.title' | translate }}</h1>
          <p class="associate-directory__subtitle">{{ 'downlineView.subtitle' | translate }}</p>
        </div>
      </div>

      <p *ngIf="loadError" class="associate-directory__load-error">{{ 'admin.associateDirectory.loadError' | translate }}</p>
      <p *ngIf="notFound" class="associate-directory__load-error">
        {{ (scope === 'admin' ? 'downlineView.notFoundAdmin' : 'downlineView.notFound') | translate }}
      </p>

      <div class="associate-directory__list">
        <div class="associate-directory__filters">
          <div class="associate-directory__filter-grid">
            <div class="associate-directory__filter-field">
              <label>{{ 'downlineView.legLabel' | translate }}</label>
              <select (change)="leg = $any($event.target).value; loadPage(0)">
                <option value="">{{ 'downlineView.legAll' | translate }}</option>
                <option value="L">{{ 'downlineView.legLeft' | translate }}</option>
                <option value="R">{{ 'downlineView.legRight' | translate }}</option>
              </select>
            </div>
            <div class="associate-directory__filter-field">
              <label>{{ 'downlineView.searchLabel' | translate }}</label>
              <input type="text"
                [placeholder]="(scope === 'admin' ? 'downlineView.searchPlaceholderAdmin' : 'downlineView.searchPlaceholder') | translate"
                (input)="rootUserId = $any($event.target).value"
                (keydown.enter)="loadPage(0)" />
            </div>
            <div class="associate-directory__filter-field">
              <button type="button" class="associate-directory__pagination-action" (click)="loadPage(0)">
                {{ 'downlineView.viewAction' | translate }}
              </button>
            </div>
          </div>
        </div>

        <div class="associate-directory__table-wrap">
          <app-editable-table
            [readOnly]="true"
            [columns]="columns"
            [rows]="rows"
            [emptyStateLabel]="'downlineView.emptyState' | translate"
          ></app-editable-table>

          <div class="associate-directory__pagination" *ngIf="page">
            <button type="button" class="associate-directory__pagination-action"
              [disabled]="page.page === 0" (click)="loadPage(page.page - 1)">
              {{ 'admin.associateDirectory.previousPageAction' | translate }}
            </button>
            <button type="button" class="associate-directory__pagination-action"
              [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="loadPage(page.page + 1)">
              {{ 'admin.associateDirectory.nextPageAction' | translate }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class AssociateDownlineComponent implements OnInit {
  private service = inject(MyTeamService);
  private translate = inject(TranslateService);
  scope: 'me' | 'admin' = inject(ActivatedRoute).snapshot.data['scope'] ?? 'me';

  page: AdminAssociatePage | null = null;
  loadError = false;
  notFound = false;
  leg = '';
  rootUserId = '';
  columns: EditableTableColumn[] = [];
  rows: Record<string, string>[] = [];

  ngOnInit(): void {
    const t = (k: string) => this.translate.instant('downlineView.' + k);
    this.columns = [
      { key: 'serial', label: t('columnSerial'), type: 'text' },
      { key: 'status', label: t('columnStatus'), type: 'badge', badgeTone: v => this.statusTone(v) },
      { key: 'name', label: t('columnName'), type: 'text' },
      { key: 'userId', label: t('columnUserId'), type: 'text' },
      { key: 'phone', label: t('columnMobile'), type: 'text' },
      { key: 'sponsorUserId', label: t('columnSponsorId'), type: 'text' },
      { key: 'position', label: t('columnPosition'), type: 'text' },
      { key: 'joinedAt', label: t('columnRegistrationDate'), type: 'text' },
      { key: 'activatedAt', label: t('columnActivationDate'), type: 'text' }
    ];
    this.loadPage(0);
  }

  loadPage(page: number): void {
    this.loadError = false;
    this.notFound = false;
    this.service.listFor(this.scope, this.rootUserId.trim(), this.leg, page, PAGE_SIZE).subscribe({
      next: res => {
        this.page = res;
        this.rows = res.associates.map((a, i) => ({
          serial: String(res.page * res.size + i + 1),
          status: titleCase(a.status),
          name: a.name,
          userId: a.userId,
          phone: a.phone ?? '—',
          sponsorUserId: a.sponsorUserId ?? '—',
          position: a.position === 'L' ? 'Left' : a.position === 'R' ? 'Right' : '—',
          joinedAt: dateTime(a.joinedAt),
          activatedAt: date(a.activatedAt)
        }));
      },
      error: err => {
        this.rows = [];
        this.page = null;
        if (err?.status === 404) this.notFound = true;
        else this.loadError = true;
      }
    });
  }

  private statusTone(v: string | number): BadgeTone {
    return v === 'Active' ? 'success' : v === 'Suspended' ? 'danger' : 'default';
  }
}
