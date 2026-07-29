import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-wallet-card',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <div class="wallet-card">
      <span class="balance">{{ balance | currency:'INR' }}</span>
      <a class="withdraw-action" [routerLink]="['/wallet/withdraw']">{{ 'dashboard.withdraw' | translate }}</a>
    </div>
  `
})
export class WalletCardComponent {
  @Input({ required: true }) balance!: number;
}
