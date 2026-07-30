import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of, tap } from 'rxjs';
import { ThemeService } from './theme.service';

// Phase 5 owns the full /api/company/branding/public contract. Phase 2 only needs enough to
// paint the brand colors, so this type deliberately covers just those two fields rather than
// modeling the whole response.
export interface BrandingPublic {
  primaryColor: string;
  secondaryColor: string;
}

@Injectable({ providedIn: 'root' })
export class BrandingBootstrapService {
  constructor(private http: HttpClient, private theme: ThemeService) {}

  // Runs as an APP_INITIALIZER: the app must not hang or fail to boot if branding is
  // unavailable, so any error (404, network failure, etc.) resolves to `null` instead of
  // rejecting (decision 9) and the theme is simply left at its default.
  initialize(): Promise<void> {
    return firstValueFrom(
      this.http.get<BrandingPublic>('/api/company/branding/public').pipe(
        tap(branding => {
          if (branding) {
            this.theme.apply(branding.primaryColor, branding.secondaryColor);
          }
        }),
        catchError(() => of(null))
      )
    ).then(() => undefined);
  }
}
