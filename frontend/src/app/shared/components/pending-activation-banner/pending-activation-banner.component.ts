import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../inline-banner/inline-banner.component';

@Component({
  selector: 'app-pending-activation-banner',
  standalone: true,
  imports: [CommonModule, TranslateModule, InlineBannerComponent],
  template: `
    <app-inline-banner *ngIf="pending" tone="warning" class="pending-banner">
      {{ 'epins.pendingBanner' | translate }}
    </app-inline-banner>
  `
})
export class PendingActivationBannerComponent implements OnInit {
  private http = inject(HttpClient);
  pending = false;

  ngOnInit(): void {
    this.http.get<{ status: string }>('/api/associates/me/profile').subscribe({
      next: p => (this.pending = p.status === 'PENDING'),
      error: () => (this.pending = false)
    });
  }
}
