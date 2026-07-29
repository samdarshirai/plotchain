import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-quick-actions',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  template: `
    <div class="quick-actions">
      <a class="record-sale" [routerLink]="['/sales/new']">{{ 'dashboard.recordSale' | translate }}</a>
      <a class="add-referral" [routerLink]="['/referrals/new']">{{ 'dashboard.addReferral' | translate }}</a>
    </div>
  `
})
export class QuickActionsComponent {}
