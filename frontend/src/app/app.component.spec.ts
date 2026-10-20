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
      imports: [
        AppComponent,
        HttpClientTestingModule,
        RouterTestingModule.withRoutes([
          { path: 'admin/dashboard', children: [] },
          { path: 'settings/company-profile', children: [] }
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
    expect(compiled.querySelector('.associate-sidebar__logout')).toBeFalsy();
  });

  it('shows the logout control and logs out when authenticated as admin-family', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const logoutButton = compiled.querySelector('app-admin-sidebar .associate-sidebar__logout') as HTMLButtonElement;
    expect(logoutButton).toBeTruthy();

    logoutButton.click();

    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('shows the sidebar logout control and logs out when authenticated as an associate', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const router = TestBed.inject(Router);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const logoutButton = compiled.querySelector('.associate-sidebar__logout') as HTMLButtonElement;
    expect(logoutButton).toBeTruthy();

    logoutButton.click();

    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('shows the admin sidebar on a non-setup authenticated admin-family route', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    fixture.detectChanges();

    (app as unknown as { updateSetupRouteState(url: string): void }).updateSetupRouteState('/admin/dashboard');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-admin-sidebar')).toBeTruthy();
    expect(compiled.querySelector('app-associate-sidebar')).toBeFalsy();
  });

  it('keeps the sidebars hidden on /setup routes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ADMIN');
    fixture.detectChanges();

    (app as unknown as { updateSetupRouteState(url: string): void }).updateSetupRouteState('/admin/setup/company-profile');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-admin-sidebar')).toBeFalsy();
    expect(compiled.querySelector('app-associate-sidebar')).toBeFalsy();
  });

  it('renders the associate sidebar (not the admin one) for a plain associate role, with all nav links', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    const translateService = TestBed.inject(TranslateService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    spyOn(translateService, 'get').and.callFake((key: string) => {
      const translations: { [key: string]: string } = {
        'nav.dashboard': 'Dashboard',
        'nav.myTree': 'Genealogy',
        'nav.mySales': 'My Sales',
        'nav.plotBookings': 'Plot Bookings',
        'nav.epinRegister': 'e-Pin Register',
        'nav.myAccount': 'My Account',
        'nav.incomeStatement': 'Income Statement',
        'nav.reports': 'Reports',
        'nav.payoutHistory': 'Payout History',
        'nav.messages': 'Messages',
        'auth.logout': 'Log Out'
      };
      return of(translations[key] || key);
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-admin-sidebar')).toBeFalsy();
    const links = Array.from(compiled.querySelectorAll('.associate-sidebar__link-label')).map(el => el.textContent?.trim());
    expect(links).toEqual([
      'Dashboard', 'My Account', 'e-Pin Register', 'Genealogy', 'Plot Bookings', 'Income Statement', 'Reports', 'Payout History', 'Messages'
    ]);
  });

  it('shifts the content column by the sidebar width for both roles; admin is always expanded', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'isAuthenticated').and.returnValue(true);
    spyOn(authService, 'getRole').and.returnValue('ASSOCIATE');
    fixture.componentInstance.associateSidebarPinned = false;
    fixture.detectChanges();

    let compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-content--sidebar-rail')).toBeTruthy();
    expect(compiled.querySelector('.app-content--sidebar-expanded')).toBeFalsy();

    (authService.getRole as jasmine.Spy).and.returnValue('ADMIN');
    fixture.detectChanges();

    compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.app-content--sidebar-rail')).toBeTruthy();
    expect(compiled.querySelector('.app-content--sidebar-expanded')).toBeTruthy();
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
  describe('admin mobile drawer', () => {
    function adminFixture() {
      const authService = TestBed.inject(AuthService);
      spyOn(authService, 'isAuthenticated').and.returnValue(true);
      spyOn(authService, 'getRole').and.returnValue('ADMIN');
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      return fixture;
    }

    it('renders a menu button that toggles the drawer and shows a backdrop while open', () => {
      const fixture = adminFixture();
      const el = fixture.nativeElement as HTMLElement;
      const drawer = el.querySelector('app-admin-sidebar') as HTMLElement;
      expect(drawer.classList).not.toContain('mobile-drawer--open');
      expect(el.querySelector('.mobile-drawer-backdrop')).toBeFalsy();

      (el.querySelector('.mobile-topbar__menu') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(drawer.classList).toContain('mobile-drawer--open');

      (el.querySelector('.mobile-drawer-backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(drawer.classList).not.toContain('mobile-drawer--open');
    });

    it('closes the drawer on navigation', async () => {
      const fixture = adminFixture();
      fixture.componentInstance.navOpen = true;
      await TestBed.inject(Router).navigateByUrl('/admin/dashboard');
      expect(fixture.componentInstance.navOpen).toBeFalse();
    });
  });

  describe('impersonation banner', () => {
    it('is absent when not impersonating', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.impersonation-banner')).toBeFalsy();
    });

    it('is absent when the impersonating flag is set but the session is not authenticated', () => {
      const authService = TestBed.inject(AuthService);
      spyOn(authService, 'isAuthenticated').and.returnValue(false);
      spyOn(authService, 'isImpersonating').and.returnValue(true);
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.impersonation-banner')).toBeFalsy();
    });

    it('shows the associate name while impersonating', () => {
      const authService = TestBed.inject(AuthService);
      spyOn(authService, 'isAuthenticated').and.returnValue(true);
      spyOn(authService, 'isImpersonating').and.returnValue(true);
      spyOn(authService, 'getImpersonatedName').and.returnValue('Asha Rao');
      TestBed.inject(TranslateService).setTranslation('en', { impersonation: { viewingAs: 'Viewing as {{name}}', exit: 'Exit' } });
      TestBed.inject(TranslateService).use('en');
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      const banner = (fixture.nativeElement as HTMLElement).querySelector('.impersonation-banner') as HTMLElement;
      expect(banner).toBeTruthy();
      expect(banner.textContent).toContain('Viewing as Asha Rao');
    });

    it('Exit ends the associate session and closes the tab', () => {
      const authService = TestBed.inject(AuthService);
      const router = TestBed.inject(Router);
      spyOn(authService, 'isAuthenticated').and.returnValue(true);
      spyOn(authService, 'isImpersonating').and.returnValue(true);
      spyOn(authService, 'getImpersonatedName').and.returnValue('Asha Rao');
      spyOn(authService, 'exitImpersonation');
      spyOn(window, 'close');
      spyOn(router, 'navigate');
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      ((fixture.nativeElement as HTMLElement).querySelector('.impersonation-banner__exit') as HTMLButtonElement).click();
      expect(authService.exitImpersonation).toHaveBeenCalled();
      expect(window.close).toHaveBeenCalled();
    });
  });
});
