import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../../auth/auth.service';
import { RewardsService } from '../../../my-account/rewards.service';
import { AssociateProfileService } from '../../../profile-kyc/associate-profile.service';

// Always-visible "Name · Designation · ID" strip for the signed-in associate or admin (admin accounts are
// associate rows, so GET /me/profile serves both; also shows the impersonated associate, since
// impersonation runs in the associate session). Rendered by AppComponent only while a user is
// authenticated, so it is created per login and fetches once.
// Designation (from rank-progress) is associate-realm only: admins have no reward-tier title.
// ponytail: fetched once per login -- a renamed profile or new designation shows after reload; add a refetch if it matters.
@Component({
  selector: 'app-associate-identity-bar',
  standalone: true,
  imports: [TranslateModule],
  template: `
    @if (profile(); as p) {
      <div class="identity-bar" role="status">
        <span class="identity-bar__who">
          <span class="identity-bar__initial" aria-hidden="true">{{ p.name.trim().charAt(0).toUpperCase() }}</span>
          <span class="identity-bar__name">{{ p.name }}</span>
        </span>
        @if (rankProgress(); as rp) {
          <span class="identity-bar__designation">{{ rp.designation ?? ('dashboard.designationValue' | translate) }}</span>
        }
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
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: 0.75rem;
      height: 44px;
      padding: 0 1.5rem;
      background: var(--ink);
      border-bottom: 1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent);
      color: var(--brand-on-ink);
    }
    .identity-bar__who {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
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
    .identity-bar__designation {
      grid-column: 2;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--brand-primary-bright);
    }
    .identity-bar__id {
      grid-column: 3;
      justify-self: end;
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
      .identity-bar { height: 40px; padding: 0 1rem; gap: 0.5rem; }
      .identity-bar__designation { font-size: 0.6875rem; letter-spacing: 0.04em; }
    }
  `]
})
export class AssociateIdentityBarComponent {
  profile = toSignal(inject(AssociateProfileService).getProfile().pipe(catchError(() => of(null))), { initialValue: null });
  private rewards = inject(RewardsService);
  rankProgress = toSignal(
    inject(AuthService).currentRealm() === 'associate'
      ? this.rewards.getMyRankProgress().pipe(catchError(() => of(null)))
      : of(null),
    { initialValue: null });
}
