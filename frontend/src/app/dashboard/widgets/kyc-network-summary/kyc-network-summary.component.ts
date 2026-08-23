import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { KycBreakdown } from '../../models/dashboard-response.model';

@Component({
  selector: 'app-kyc-network-summary',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="kyc-network-summary">
      <span class="kyc-network-summary__label">{{ 'dashboard.kycNetworkLabel' | translate }}</span>
      <div class="kyc-network-summary__counts">
        <span class="kyc-network-summary__count kyc-network-summary__count--verified">
          {{ 'dashboard.kycVerifiedCount' | translate: { count: data.verified } }}
        </span>
        <span class="kyc-network-summary__count kyc-network-summary__count--pending">
          {{ 'dashboard.kycPendingCount' | translate: { count: data.pending } }}
        </span>
        <span class="kyc-network-summary__count kyc-network-summary__count--rejected">
          {{ 'dashboard.kycRejectedCount' | translate: { count: data.rejected } }}
        </span>
      </div>
    </div>
  `
})
export class KycNetworkSummaryComponent {
  @Input({ required: true }) data!: KycBreakdown;
}
