import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AuthService } from './auth/auth.service';
import { ADMIN_FAMILY_ROLES } from './admin/admin.guard';
import { BrandingBootstrapService } from './core/theme/branding-bootstrap.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AppComponent,
        HttpClientTestingModule,
        // Stub targets for the header nav, so routerLink/routerLinkActive can be exercised: the
        // Dashboard item, plus each category's first item (where its tab links) and one deeper
        // item to prove a tab stays lit past its own landing screen.
        RouterTestingModule.withRoutes([
          { path: 'admin/dashboard', children: [] },
          { path: 'settings/company-profile', children: [] },
          { path: 'settings/branding', children: [] },
          { path: 'settings/associate-directory', children: [] },
          { path: 'settings/sales-register', children: [] },
          { path: 'settings/audit-log', children: [] }
        ]),
        TranslateModule.forRoot()
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  it('does not show the logout control when not authenticated', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.logout')).toBeFalsy();
  });

  it('shows the logout control and logs out when authenticated', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const logoutButton = compiled.querySelector('.logout') as HTMLButtonElement;
    expect(logoutButton).toBeTruthy();

    logoutButton.click();

    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('shows the header on a non-setup authenticated route', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    fixture.detectChanges();

    (app as unknown as { updateSetupRouteState(url: string): void }).updateSetupRouteState('/admin/dashboard');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-header')).toBeTruthy();
  });

  it('keeps the header hidden on /setup routes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    fixture.detectChanges();

    (app as unknown as { updateSetupRouteState(url: string): void }).updateSetupRouteState('/setup/company-profile');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-header')).toBeFalsy();
  });

  it('shows all associate nav links including Income Statement for a plain associate role', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'nav.dashboard': 'Dashboard',
        'nav.myTree': 'My Tree',
        'nav.salesHistory': 'Sales History',
        'nav.plotBookings': 'Plot Bookings',
        'nav.profileKyc': 'Profile',
        'nav.rewards': 'Rewards',
        'nav.digitalIdCard': 'Digital ID Card',
        'nav.incomeStatement': 'Income Statement',
        'nav.payoutHistory': 'Payout History',
        'auth.logout': 'Log Out'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav__link')).map(el => el.textContent?.trim());
    expect(links).toEqual([
      'Dashboard', 'My Tree', 'Sales History', 'Plot Bookings', 'Profile', 'Rewards', 'Digital ID Card', 'Income Statement', 'Payout History'
    ]);
  });

  it('shows Dashboard plus the four category tabs for an admin-family role', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'nav.dashboard': 'Dashboard',
        'nav.categories.setup': 'Setup',
        'nav.categories.network': 'Network',
        'nav.categories.finance': 'Finance & Cycles',
        'nav.categories.system': 'System',
        'auth.logout': 'Log Out'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav__link'));
    // Each category tab's text is its Material Symbols glyph name followed by the label.
    expect(links.map(el => el.textContent?.trim())).toEqual([
      'Dashboard',
      'tuneSetup',
      'groupNetwork',
      'point_of_saleFinance & Cycles',
      'admin_panel_settingsSystem'
    ]);
    // A category tab lands on its own first item -- there is no generic /settings hub any more.
    expect(links.map(el => el.getAttribute('href'))).toEqual([
      '/admin/dashboard',
      '/settings/company-profile',
      '/settings/associate-directory',
      '/settings/sales-register',
      '/settings/audit-log'
    ]);
  });

  it('renders each category tab icon as a Material Symbol', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    fixture.detectChanges();

    const icons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.app-nav__link-icon')
    );
    expect(icons.map(el => el.textContent?.trim())).toEqual([
      'tune',
      'group',
      'point_of_sale',
      'admin_panel_settings'
    ]);
    expect(icons.every(el => el.classList.contains('material-symbols-outlined'))).toBe(true);
  });

  it('lights the owning category tab for any screen in it, not just the tab\'s own landing screen', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    fixture.detectChanges();

    // /settings/branding is Setup's *second* item, so only a URL-derived active state lights it.
    await router.navigateByUrl('/settings/branding');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const active = Array.from(compiled.querySelectorAll('.app-nav__link--active'));
    expect(active.map(el => el.getAttribute('href'))).toEqual(['/settings/company-profile']);
  });

  it('lists the active category\'s items in the second nav row and marks the open one', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    spyOn(translateService, 'get').and.callFake((key: string) => of(key.replace('settings.sections.', '')));
    fixture.detectChanges();

    await router.navigateByUrl('/settings/branding');
    fixture.detectChanges();
    // The row's links are created by this detectChanges, i.e. after NavigationEnd, and
    // RouterLinkActive applies its class in a microtask -- let that settle before asserting.
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const items = Array.from(compiled.querySelectorAll('.app-nav-items__link'));
    expect(items.map(el => el.textContent?.trim())).toEqual([
      'companyProfile',
      'branding',
      'compensation',
      'projects',
      'paymentsKyc'
    ]);
    const active = Array.from(compiled.querySelectorAll('.app-nav-items__link--active'));
    expect(active.map(el => el.getAttribute('href'))).toEqual(['/settings/branding']);
  });

  it('hides the item-tab row on the dashboard, where no category is active', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    fixture.detectChanges();

    await router.navigateByUrl('/admin/dashboard');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-nav-items')).toBeFalsy();
    expect(compiled.querySelector('.app-nav__link--active')?.getAttribute('href')).toBe('/admin/dashboard');
  });

  it('hides the item-tab row for a non-admin role', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-nav-items')).toBeFalsy();
  });

  it('renders the VS fallback brand mark when no square logo has been uploaded', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'brand.fallbackMark': 'VS',
        'brand.wordmark': 'VIRAJ ACRES',
        'brand.caption': 'LEGACY LIVING'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-header__logo')).toBeFalsy();
    expect(compiled.querySelector('.app-header__logo-fallback')?.textContent?.trim()).toBe('VS');
    expect(compiled.querySelector('.app-header__wordmark-name')?.textContent?.trim()).toBe('VIRAJ ACRES');
    expect(compiled.querySelector('.app-header__wordmark-tagline')?.textContent?.trim()).toBe('LEGACY LIVING');
  });

  it('renders the uploaded square logo instead of the fallback mark when one exists', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const branding = TestBed.inject(BrandingBootstrapService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(branding, 'getLast').and.returnValue({
      displayName: 'Viraj Acres',
      tagline: 'Legacy Living',
      primaryColor: '#C6A227',
      secondaryColor: '#5C1A2A',
      hasSquareLogo: true,
      hasWideLogo: false
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-header__logo')).toBeTruthy();
    expect(compiled.querySelector('.app-header__logo-fallback')).toBeFalsy();
  });

  it('hides the Dashboard nav link for every admin-family role', () => {
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    const getRoleSpy = spyOn(authService, 'getRole');

    for (const role of ADMIN_FAMILY_ROLES) {
      getRoleSpy.and.returnValue(role);
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('a[href="/dashboard"]')).toBeFalsy();

      fixture.destroy();
    }
  });
});
