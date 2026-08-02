import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateDirectoryService } from './associate-directory.service';
import { AdminAssociatePage } from '../models/admin-associate-page.model';
import { AdminAssociateDetail } from '../models/admin-associate-detail.model';
import { SidePanelComponent } from '../../shared/components/side-panel/side-panel.component';

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
      </div>

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

  page: AdminAssociatePage | null = null;
  selected: AdminAssociateDetail | null = null;
  panelOpen = false;
  temporaryPassword: string | null = null;
  private search = '';

  ngOnInit(): void {
    this.loadPage(0);
  }

  onSearchInput(value: string): void {
    this.search = value;
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
    this.associateDirectoryService.suspend(this.selected.id).subscribe(detail => {
      this.selected = detail;
    });
  }

  reactivateSelected(): void {
    if (!this.selected) return;
    this.associateDirectoryService.reactivate(this.selected.id).subscribe(detail => {
      this.selected = detail;
    });
  }

  resetPasswordForSelected(): void {
    if (!this.selected) return;
    this.associateDirectoryService.resetPassword(this.selected.id).subscribe(res => {
      this.temporaryPassword = res.temporaryPassword;
    });
  }

  private loadPage(page: number): void {
    this.associateDirectoryService
      .list(this.search ? { search: this.search } : {}, page, PAGE_SIZE)
      .subscribe(res => (this.page = res));
  }
}
