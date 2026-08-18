import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AuthService } from './auth/auth.service';
import { ADMIN_FAMILY_ROLES } from './admin/admin.guard';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()],
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

  it('shows the header on /admin/associates/new now that it is no longer chromeless', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    fixture.detectChanges();

    (app as unknown as { updateSetupRouteState(url: string): void }).updateSetupRouteState('/admin/associates/new');
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
        'nav.provisionAssociate': 'Provision Associate',
        'nav.settings': 'Settings',
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

  it('shows Dashboard plus the Setup/Network/Finance & Cycles/System category pills for an admin-family role', () => {
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
    const dashboardLink = compiled.querySelector('.app-nav__link')?.textContent?.trim();
    const categoryLabels = Array.from(compiled.querySelectorAll('.app-nav__link-label')).map(el => el.textContent?.trim());
    expect(dashboardLink).toBe('Dashboard');
    expect(categoryLabels).toEqual(['Setup', 'Network', 'Finance & Cycles', 'System']);
  });

  it('shows the active category\'s items as a second pill row once its route is active', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'settings.sections.companyProfile': 'Company Profile',
        'settings.sections.branding': 'Branding',
        'settings.sections.compensation': 'Compensation Plan',
        'settings.sections.projects': 'Projects & Plots',
        'settings.sections.paymentsKyc': 'Payments & KYC',
        'nav.provisionAssociate': 'Provision Associate',
        'auth.logout': 'Log Out'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    (app as unknown as { updateSetupRouteState(url: string): void }).updateSetupRouteState('/settings/branding');
    app.activeNavCategory = app.navCategories.find(c => c.key === 'setup');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('.app-nav-items__link')).map(el => el.textContent?.trim());
    expect(links).toEqual([
      'Company Profile', 'Branding', 'Compensation Plan', 'Projects & Plots', 'Payments & KYC', 'Provision Associate'
    ]);
  });

  it('hides the second pill row when no category is active (e.g. on the admin dashboard)', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-nav-items')).toBeFalsy();
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
