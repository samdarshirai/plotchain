import {
  ApplicationConfig,
  provideZoneChangeDetection,
  importProvidersFrom,
  APP_INITIALIZER,
  LOCALE_ID,
  DEFAULT_CURRENCY_CODE
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { authInterceptor } from './auth/auth.interceptor';
import { BrandingBootstrapService } from './core/theme/branding-bootstrap.service';

registerLocaleData(localeEnIn);

export function httpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, '/assets/i18n/', '.json');
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'en',
        loader: { provide: TranslateLoader, useFactory: httpLoaderFactory, deps: [HttpClient] }
      })
    ),
    { provide: LOCALE_ID, useValue: 'en-IN' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'INR' },
    // Angular 18 does not have provideAppInitializer (an Angular 19 addition) — APP_INITIALIZER
    // is the version-correct substitute for kicking off the branding fetch before the app renders.
    {
      provide: APP_INITIALIZER,
      useFactory: (b: BrandingBootstrapService) => () => b.initialize(),
      deps: [BrandingBootstrapService],
      multi: true
    }
  ]
};
