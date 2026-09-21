import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-profile-card',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="profile-card">
      <div class="profile-card__identity">
        <div class="profile-card__avatar">{{ initials }}</div>
        <div class="profile-card__name">{{ associate.name }}</div>
        <div class="profile-card__designation">{{ 'dashboard.designationValue' | translate }}</div>
      </div>
      <div class="profile-card__rows">
        <div class="profile-card__row">
          <span class="material-symbols-outlined profile-card__row-icon">badge</span>
          <span class="profile-card__row-label">{{ 'dashboard.profileAssociateId' | translate }}</span>
          <span class="profile-card__row-value">{{ associate.associateId }}</span>
        </div>
        <div class="profile-card__row">
          <span class="material-symbols-outlined profile-card__row-icon">verified</span>
          <span class="profile-card__row-label">{{ 'dashboard.profileDesignation' | translate }}</span>
          <span class="profile-card__row-value">{{ 'dashboard.designationValue' | translate }}</span>
        </div>
        <div class="profile-card__row" *ngIf="associate.phone">
          <span class="material-symbols-outlined profile-card__row-icon">call</span>
          <span class="profile-card__row-label">{{ 'dashboard.profileMobile' | translate }}</span>
          <span class="profile-card__row-value">{{ associate.phone }}</span>
        </div>
        <div class="profile-card__row">
          <span class="material-symbols-outlined profile-card__row-icon">account_balance</span>
          <span class="profile-card__row-label">{{ 'dashboard.profileSponsor' | translate }}</span>
          <span class="profile-card__row-value">{{ sponsorDisplay ?? ('dashboard.profileSponsorHeadOffice' | translate) }}</span>
        </div>
        <div class="profile-card__row">
          <span class="material-symbols-outlined profile-card__row-icon">calendar_month</span>
          <span class="profile-card__row-label">{{ 'dashboard.profileRegistered' | translate }}</span>
          <span class="profile-card__row-value">{{ associate.joinedAt | date:'d MMM y, h:mm a' }}</span>
        </div>
        <div class="profile-card__row" *ngIf="associate.rankChangedAt">
          <span class="material-symbols-outlined profile-card__row-icon">upgrade</span>
          <span class="profile-card__row-label">{{ 'dashboard.profileLatestUpgrade' | translate }}</span>
          <span class="profile-card__row-value">{{ associate.rankChangedAt | date:'d MMM y, h:mm a' }}</span>
        </div>
      </div>
    </div>
  `
})
export class ProfileCardComponent {
  @Input({ required: true }) associate!: AssociateSummary;

  // Same algorithm as DigitalIdCardComponent.initials() / AuditLogComponent.initials(): trim ->
  // split on whitespace -> first 2 words -> first letter of each, uppercased.
  get initials(): string {
    const name = this.associate.name?.trim() ?? '';
    if (!name) {
      return '';
    }
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  }

  get sponsorDisplay(): string | null {
    if (!this.associate.sponsorAssociateId && !this.associate.sponsorName) {
      return null;
    }
    return [this.associate.sponsorAssociateId, this.associate.sponsorName].filter(Boolean).join(' · ');
  }
}
