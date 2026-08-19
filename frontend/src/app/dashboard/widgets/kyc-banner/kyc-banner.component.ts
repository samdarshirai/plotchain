import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-kyc-banner',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `<div class="kyc-banner" *ngIf="visible">{{ 'dashboard.kycBanner' | translate }}</div>`
})
export class KycBannerComponent {
  @Input() visible = false;
}
