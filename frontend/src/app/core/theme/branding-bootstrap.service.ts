import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of, tap, timeout } from 'rxjs';
import { ThemeService } from './theme.service';

// The full /api/company/branding/public contract (Phase 5). displayName/tagline/logo flags
// are additive vs. Phase 2's original {primaryColor, secondaryColor}-only shape.
export interface BrandingPublic {
  displayName: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  hasSquareLogo: boolean;
  hasWideLogo: boolean;
}

@Injectable({ providedIn: 'root' })
export class BrandingBootstrapService {
  private lastBranding: BrandingPublic | null = null;

  constructor(private http: HttpClient, private theme: ThemeService) {}

  // Lets LoginComponent read the last-fetched branding (tagline, logo flags) without a second
  // HTTP round trip, without changing initialize()'s Promise<void> signature.
  getLast(): BrandingPublic | null {
    return this.lastBranding;
  }

  // Runs as an APP_INITIALIZER: the app must not hang or fail to boot if branding is
  // unavailable, so any error (404, network failure, etc.) resolves to `null` instead of
  // rejecting (decision 9) and the theme is simply left at its default. A request that never
  // completes (e.g. a hung backend mid-deploy) would otherwise block bootstrapApplication
  // forever, so `timeout(3000)` turns a hang into a TimeoutError that the same catchError path
  // swallows.
  initialize(): Promise<void> {
    return firstValueFrom(
      this.http.get<BrandingPublic>('/api/company/branding/public').pipe(
        timeout(3000),
        tap(branding => {
          if (branding) {
            this.lastBranding = branding;
            this.theme.apply(branding.primaryColor, branding.secondaryColor);
          }
        }),
        catchError(() => of(null))
      )
    ).then(() => undefined);
  }
}
