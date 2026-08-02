import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage, AdminAssociateFilters } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';
import { CompensationPlanService } from '../../setup/steps/compensation/compensation-plan.service';
import { RankOption } from '../../setup/models/compensation-plan.model';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-associate-directory',
  standalone: true,
  imports: [CommonModule, TranslateModule, SidePanelComponent],
  template: `
    <div class="associate-directory card">
      <h1 class="card-title">{{ 'admin.associateDirectory.title' | translate }}</h1>

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

      <table class="associate-directory__table">
        <thead>
          <tr>
            <th>{{ 'admin.associateDirectory.columnUserId' | translate }}</th>
            <th>{{ 'admin.associateDirectory.columnName' | translate }}</th>
            <th>{{ 'admin.associateDirectory.columnRank' | translate }}</th>
            <th>{{ 'admin.associateDirectory.columnKycStatus' | translate }}</th>
            <th>{{ 'admin.associateDirectory.columnStatus' | translate }}</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let associate of page?.associates" (click)="selectAssociate(associate.id)">
            <td>{{ associate.userId }}</td>
            <td>{{ associate.name }}</td>
            <td>{{ associate.rankName }}</td>
            <td>{{ associate.kycStatus }}</td>
            <td>{{ associate.status }}</td>
          </tr>
        </tbody>
      </table>

      <div class="associate-directory__pagination" *ngIf="page">
        <button type="button" [disabled]="page.page === 0" (click)="goToPage(page.page - 1)">
          {{ 'admin.associateDirectory.previousPageAction' | translate }}
        </button>
        <button type="button" [disabled]="(page.page + 1) * page.size >= page.totalElements" (click)="goToPage(page.page + 1)">
          {{ 'admin.associateDirectory.nextPageAction' | translate }}
        </button>
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

  page: AdminAssociatePage | null = null;
  selected: AdminAssociateDetail | null = null;
  panelOpen = false;
  temporaryPassword: string | null = null;
  loadError = false;
  actionError = false;
  availableRanks: RankOption[] = [];
  private search = '';
  private rank = '';
  private kycStatus = '';
  private status = '';
  private joinedFrom = '';
  private joinedTo = '';

  ngOnInit(): void {
    this.compensationPlanService.getCurrent().subscribe(res => (this.availableRanks = res.availableRanks));
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
      next: res => (this.page = res),
      error: () => (this.loadError = true)
    });
  }
}
