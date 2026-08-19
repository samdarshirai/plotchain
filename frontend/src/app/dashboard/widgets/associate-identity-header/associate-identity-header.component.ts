import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSummary } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-associate-identity-header',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="associate-identity-header card">
      <span class="associate-identity-header__avatar">{{ initials }}</span>
      <div class="associate-identity-header__details">
        <div class="associate-identity-header__id">{{ 'dashboard.associateIdLabel' | translate }}: {{ data.associateId }}</div>
        <div class="associate-identity-header__name">{{ data.name }}</div>
        <div class="associate-identity-header__rank">{{ data.rank }}</div>
        <div class="associate-identity-header__phone" *ngIf="data.phone">{{ 'dashboard.phoneLabel' | translate }}: {{ data.phone }}</div>
        <div class="associate-identity-header__joined">{{ 'dashboard.joinedAtLabel' | translate }}: {{ data.joinedAt | date: 'mediumDate' }}</div>
        <div class="associate-identity-header__rank-changed" *ngIf="data.rankChangedAt">{{ 'dashboard.rankChangedAtLabel' | translate }}: {{ data.rankChangedAt | date: 'mediumDate' }}</div>
      </div>
    </div>
  `
})
export class AssociateIdentityHeaderComponent {
  @Input({ required: true }) data!: AssociateSummary;

  // Same algorithm as DigitalIdCardComponent.initials() (frontend/src/app/digital-id-card/digital-id-card.component.ts:158-170):
  // trim -> split on whitespace -> first 2 words -> first letter of each, uppercased.
  get initials(): string {
    const name = this.data.name ?? '';
    if (!name.trim()) {
      return '';
    }
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('');
  }
}
