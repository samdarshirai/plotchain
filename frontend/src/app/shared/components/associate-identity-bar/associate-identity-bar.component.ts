import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AssociateProfileService } from '../../../profile-kyc/associate-profile.service';

// Always-visible "Name · ID" strip for the signed-in associate (also shows the impersonated
// associate, since impersonation runs in the associate session). Rendered by AppComponent only
// while an associate-realm user is authenticated, so it is created per login and fetches once.
// ponytail: fetched once per login -- a renamed profile shows after reload; add a refetch if it matters.
@Component({
  selector: 'app-associate-identity-bar',
  standalone: true,
  template: `
    @if (profile(); as p) {
      <div class="identity-bar" role="status">
        <span class="identity-bar__name">{{ p.name }}</span>
        <span class="identity-bar__id">{{ p.userId }}</span>
      </div>
    }
  `,
  styles: [`
    .identity-bar {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--surface-card);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.875rem;
      color: var(--text-primary);
    }
    .identity-bar__name { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .identity-bar__id { color: var(--text-muted); flex-shrink: 0; }
    .identity-bar__id::before { content: '· '; }
  `]
})
export class AssociateIdentityBarComponent {
  profile = toSignal(inject(AssociateProfileService).getProfile().pipe(catchError(() => of(null))), { initialValue: null });
}
