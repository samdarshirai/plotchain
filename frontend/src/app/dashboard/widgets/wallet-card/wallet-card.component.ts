import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-wallet-card',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="wallet-card card">
      <span class="balance">{{ balance | currency:'INR' }}</span>
      <p class="withdraw-info">{{ 'dashboard.withdrawContactAdmin' | translate }}</p>
    </div>
  `
})
export class WalletCardComponent {
  @Input({ required: true }) balance!: number;
}
