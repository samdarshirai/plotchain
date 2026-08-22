import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage, AdminAssociateFilters } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';
import { AdminService } from '../admin.service';
import { AssociateSummary } from '../models/associate-summary.model';
import { CreateAssociateResponse } from '../models/create-associate-response.model';
import { toFieldErrors } from '../../core/api/field-errors.model';
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { FieldErrorComponent } from '../../shared/components/field-error/field-error.component';
import { CompensationPlanService } from '../../setup/steps/compensation/compensation-plan.service';
import { RankOption } from '../../setup/models/compensation-plan.model';
import { BadgeTone, EditableTableColumn, EditableTableComponent } from '../../shared/components/editable-table/editable-table.component';

const PAGE_SIZE = 20;

// Enum values the backend returns for kycStatus/status are shouty-uppercase (PENDING/VERIFIED/...);
// the mockup renders them Title Case (Viraj_Acres_Settings.dc.html lines 646-650). Since the
// editable-table badge cell renders the row's raw value verbatim, the row-building step below
// title-cases it before it ever reaches the table, and the badgeTone functions match on that
// title-cased string, not the wire enum.
function titleCase(value: string): string {
  return value.length === 0 ? value : value.charAt(0) + value.slice(1).toLowerCase();
}

@Component({
  selector: 'app-associate-directory',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterLink,
    SidePanelComponent,
    InlineBannerComponent,
    FieldErrorComponent,
    EditableTableComponent
  ],
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
          <span
            class="associate-directory__pagination-action"
            [class.associate-directory__pagination-action--disabled]="page.page === 0"
            (click)="page.page > 0 && goToPage(page.page - 1)"
          >
            {{ 'admin.associateDirectory.previousPageAction' | translate }}
          </span>
          <span
            class="associate-directory__pagination-action"
            [class.associate-directory__pagination-action--disabled]="(page.page + 1) * page.size >= page.totalElements"
            (click)="(page.page + 1) * page.size < page.totalElements && goToPage(page.page + 1)"
          >
            {{ 'admin.associateDirectory.nextPageAction' | translate }}
          </span>
        </div>
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

    <div class="associate-directory__modal-overlay" *ngIf="modalOpen">
      <div class="associate-directory__modal">
        <ng-container *ngIf="provisioned as result; else provisionFormTemplate">
          <div class="associate-directory__modal-title">{{ 'admin.associateDirectory.provisionModalTitle' | translate }}</div>
          <app-inline-banner tone="success">
            <p>
              {{ 'admin.assignedUserIdLabel' | translate }}:
              <strong>{{ result.userId }}</strong>
            </p>
            <p>
              {{ 'admin.temporaryPasswordLabel' | translate }}:
              <strong>{{ result.temporaryPassword }}</strong>
            </p>
            <p class="associate-directory__modal-banner-notice">{{ 'admin.temporaryPasswordNotice' | translate }}</p>
          </app-inline-banner>
          <div class="associate-directory__modal-footer">
            <button type="button" class="associate-directory__modal-submit" (click)="finishProvisioning()">
              {{ 'admin.doneButtonLabel' | translate }}
            </button>
          </div>
        </ng-container>

        <ng-template #provisionFormTemplate>
          <div class="associate-directory__modal-title">{{ 'admin.associateDirectory.provisionModalTitle' | translate }}</div>
          <p class="associate-directory__modal-subtitle">{{ 'admin.associateDirectory.provisionModalSubtitle' | translate }}</p>

          <app-inline-banner *ngIf="provisionSubmitError" tone="danger">{{ provisionSubmitError }}</app-inline-banner>

          <form [formGroup]="provisionForm" (ngSubmit)="onProvisionSubmit()">
            <div class="associate-directory__modal-fields">
              <div class="associate-directory__modal-field">
                <label>{{ 'admin.nameLabel' | translate }}</label>
                <input
                  type="text"
                  formControlName="name"
                  [placeholder]="'admin.associateDirectory.fullNamePlaceholder' | translate"
                  (blur)="markProvisionTouched('name')"
                />
                <app-field-error [message]="provisionFieldError('name')"></app-field-error>
              </div>
              <div class="associate-directory__modal-field">
                <label>{{ 'admin.emailLabel' | translate }}</label>
                <input type="email" formControlName="email" (blur)="markProvisionTouched('email')" />
                <app-field-error [message]="provisionFieldError('email')"></app-field-error>
              </div>
              <div class="associate-directory__modal-field">
                <label>{{ 'admin.associateDirectory.phoneLabel' | translate }}</label>
                <input
                  type="tel"
                  formControlName="phone"
                  [placeholder]="'admin.associateDirectory.phonePlaceholder' | translate"
                />
              </div>
              <div class="associate-directory__modal-field">
                <label>{{ 'admin.associateDirectory.sponsorSearchLabel' | translate }}</label>
                <input
                  type="text"
                  formControlName="sponsorSearch"
                  [placeholder]="'admin.associateDirectory.sponsorSearchPlaceholder' | translate"
                  list="associate-directory-sponsor-options"
                  (input)="onSponsorSearchInput($any($event.target).value)"
                />
                <datalist id="associate-directory-sponsor-options">
                  <option *ngFor="let sponsor of sponsorOptions" [value]="sponsorLabel(sponsor)"></option>
                </datalist>
              </div>
            </div>

            <p class="associate-directory__modal-link">
              {{ 'admin.associateDirectory.fullFormLinkPrefix' | translate }}
              <a [routerLink]="['/admin/associates/new']" (click)="closeProvisionModal()">
                {{ 'admin.associateDirectory.fullFormLinkAction' | translate }}
              </a>
            </p>

            <div class="associate-directory__modal-footer">
              <button type="button" class="associate-directory__modal-cancel" (click)="closeProvisionModal()">
                {{ 'admin.associateDirectory.cancelAction' | translate }}
              </button>
              <button type="submit" class="associate-directory__modal-submit">
                {{ 'admin.associateDirectory.provisionSubmitAction' | translate }}
              </button>
            </div>
          </form>
        </ng-template>
      </div>
    </div>
  `
})
export class AssociateDirectoryComponent implements OnInit {
  private associateDirectoryService = inject(AssociateDirectoryService);
  private compensationPlanService = inject(CompensationPlanService);
  private adminService = inject(AdminService);
  private translate = inject(TranslateService);
  private fb = inject(FormBuilder);

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

  // "New Associate" modal state -- Task 9: a lightweight provisioning modal (name/email/phone/
  // sponsor only) replaces this button's old routerLink to /admin/associates/new. That full page
  // still exists for the parentId/position tree-placement case and is reached via the modal's
  // own link-out, not from any nav item (none currently links to it -- see task-9-report.md).
  modalOpen = false;
  provisionForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    sponsorSearch: ['']
  });
  provisioned: CreateAssociateResponse | null = null;
  provisionSubmitError: string | null = null;
  sponsorOptions: AssociateSummary[] = [];
  selectedSponsorId: string | null = null;
  private provisionServerFieldErrors: Record<string, string> = {};

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
    this.adminService.listAssociates().subscribe({
      next: associates => (this.sponsorOptions = associates),
      error: () => {
        // Sponsor autocomplete degrading to a plain text field (no suggestions) is an acceptable
        // fallback -- unlike ranks/associates-page, it isn't required to render this screen.
      }
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

  sponsorLabel(associate: AssociateSummary): string {
    return `${associate.userId} — ${associate.name}`;
  }

  onSponsorSearchInput(value: string): void {
    const match = this.sponsorOptions.find(associate => this.sponsorLabel(associate) === value);
    this.selectedSponsorId = match ? match.id : null;
  }

  openProvisionModal(): void {
    this.provisionForm.reset({ name: '', email: '', phone: '', sponsorSearch: '' });
    this.selectedSponsorId = null;
    this.provisioned = null;
    this.provisionSubmitError = null;
    this.provisionServerFieldErrors = {};
    this.modalOpen = true;
  }

  closeProvisionModal(): void {
    this.modalOpen = false;
  }

  markProvisionTouched(name: string): void {
    this.provisionForm.get(name)?.markAsTouched();
  }

  provisionFieldError(name: string): string | undefined {
    if (this.provisionServerFieldErrors[name]) {
      return this.provisionServerFieldErrors[name];
    }
    const control = this.provisionForm.get(name);
    if (!control || !control.touched || !control.errors) {
      return undefined;
    }
    if (control.errors['required']) {
      return this.translate.instant('admin.validation.required');
    }
    if (control.errors['email']) {
      return this.translate.instant('admin.validation.invalidEmail');
    }
    return undefined;
  }

  onProvisionSubmit(): void {
    this.provisionServerFieldErrors = {};
    this.provisionSubmitError = null;
    if (this.provisionForm.invalid) {
      this.provisionForm.markAllAsTouched();
      return;
    }
    const { name, email, phone } = this.provisionForm.getRawValue();
    this.adminService
      .createAssociate({
        name,
        email,
        phone: phone || undefined,
        sponsorId: this.selectedSponsorId || undefined
      })
      .subscribe({
        next: response => (this.provisioned = response),
        error: (err: HttpErrorResponse) => {
          const fields = toFieldErrors(err);
          if (Object.keys(fields).length > 0) {
            this.provisionServerFieldErrors = fields;
            return;
          }
          if (err.status === 409 && typeof err.error?.error === 'string' && err.error.error.startsWith('Email already registered')) {
            this.provisionSubmitError = this.translate.instant('admin.validation.emailTaken');
          } else {
            this.provisionSubmitError = this.translate.instant('admin.validation.genericSaveError');
          }
        }
      });
  }

  finishProvisioning(): void {
    this.modalOpen = false;
    this.provisioned = null;
    this.loadPage(this.page?.page ?? 0);
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
          kycStatus: titleCase(a.kycStatus),
          status: titleCase(a.status)
        }));
      },
      error: () => (this.loadError = true)
    });
  }
}
