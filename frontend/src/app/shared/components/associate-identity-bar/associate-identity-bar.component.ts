import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { AssociateProfileService } from '../../../profile-kyc/associate-profile.service';

// Always-visible "Name · ID" strip for the signed-in associate or admin (admin accounts are
// associate rows, so GET /me/profile serves both; also shows the impersonated associate, since
// impersonation runs in the associate session). Rendered by AppComponent only while a user is
// authenticated, so it is created per login and fetches once.
// ponytail: fetched once per login -- a renamed profile shows after reload; add a refetch if it matters.
@Component({
  selector: 'app-associate-identity-bar',
  standalone: true,
  template: `
    @if (profile(); as p) {
      <div class="identity-bar" role="status">
        <span class="identity-bar__initial" aria-hidden="true">{{ p.name.trim().charAt(0).toUpperCase() }}</span>
        <span class="identity-bar__name">{{ p.name }}</span>
        <span class="identity-bar__id">{{ p.userId }}</span>
      </div>
    }
  `,
  // Ink strip matching the sidebar; gold monogram echoes the dashboard avatar, ID is the mono
  // "tabular" voice from DESIGN.md. Sticky so name + ID stay visible on scroll, below the
  // impersonation banner (and the 56px mobile topbar under 768px).
  styles: [`
    :host { display: block; position: sticky; top: var(--impersonation-banner-height, 0px); z-index: 12; }
    .identity-bar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      height: 44px;
      padding: 0 1.5rem;
      background: var(--ink);
      border-bottom: 1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent);
      color: var(--brand-on-ink);
    }
    .identity-bar__initial {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      border: 1px solid var(--brand-primary);
      border-radius: 50%;
      font-family: var(--font-display);
      font-size: 0.8125rem;
      color: var(--brand-primary-bright);
    }
    .identity-bar__name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.9375rem;
      font-weight: 600;
    }
    .identity-bar__id {
      flex-shrink: 0;
      margin-left: auto;
      padding: 2px 10px;
      border: 1px solid var(--brand-primary);
      border-radius: 999px;
      font-family: var(--font-mono);
      font-size: 0.75rem;
      letter-spacing: 0.04em;
      color: var(--brand-primary-bright);
    }
    @media (max-width: 767px) {
      :host { top: calc(56px + var(--impersonation-banner-height, 0px)); }
      .identity-bar { height: 40px; padding: 0 1rem; }
    }
  `]
})
export class AssociateIdentityBarComponent {
  profile = toSignal(inject(AssociateProfileService).getProfile().pipe(catchError(() => of(null))), { initialValue: null });
}
