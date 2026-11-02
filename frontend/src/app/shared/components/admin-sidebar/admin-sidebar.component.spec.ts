import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminSidebarComponent } from './admin-sidebar.component';
import { AuthService } from '../../../auth/auth.service';
import { ADMIN_NAV_CATEGORIES } from '../../../admin-nav-categories.model';

describe('AdminSidebarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AdminSidebarComponent,
        HttpClientTestingModule,
        RouterTestingModule.withRoutes([
          { path: 'admin/dashboard', children: [] },
          { path: 'admin/settings/company-profile', children: [] },
          { path: 'admin/settings/branding', children: [] },
          { path: 'admin/settings/audit-log', children: [] }
        ]),
        TranslateModule.forRoot()
      ]
    }).compileComponents();
  });

  function render() {
    const fixture = TestBed.createComponent(AdminSidebarComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const groupLabels = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.associate-sidebar__group-toggle')).map(b => b.textContent?.trim());

  it('lists Dashboard, Admin Users plus the nine category groups, all closed by default', () => {
    const { el } = render();
    expect(el.querySelector('a[href="/admin/dashboard"]')).toBeTruthy();
    expect(el.querySelector('a[href="/admin/settings/admin-users"]')).toBeTruthy();
    expect(groupLabels(el).length).toBe(9);
    expect(el.querySelectorAll('.associate-sidebar__subnav').length).toBe(0);
    expect(el.querySelectorAll('[aria-expanded="true"]').length).toBe(0);
  });

  it('hides Compensation from a manager but shows it to an admin', () => {
    const setup = ADMIN_NAV_CATEGORIES.find(c => c.key === 'setup')!;
    for (const [role, expected] of [['ADMIN', true], ['MANAGER', false]] as const) {
      TestBed.overrideProvider(AuthService, { useValue: { getRole: () => role } });
      const fixture = TestBed.createComponent(AdminSidebarComponent);
      const keys = fixture.componentInstance.visibleItems(setup).map(i => i.key);
      expect(keys.includes('compensation')).toBe(expected);
      expect(keys.includes('companyProfile')).toBeTrue();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [AdminSidebarComponent, HttpClientTestingModule, RouterTestingModule, TranslateModule.forRoot()] });
    }
  });

  it('opens a group on click to show its links, and closes it on a second click', () => {
    const { fixture, el } = render();
    const masterData = el.querySelectorAll('.associate-sidebar__group-toggle')[0] as HTMLButtonElement;

    masterData.click();
    fixture.detectChanges();
    const hrefs = Array.from(el.querySelectorAll('.associate-sidebar__sublink')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/admin/settings/master-projects',
      '/admin/settings/plots'
    ]);
    expect(masterData.getAttribute('aria-expanded')).toBe('true');

    masterData.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.associate-sidebar__sublink').length).toBe(0);
  });

  it('keeps only one group open: opening a second closes the first', () => {
    const { fixture, el } = render();
    const toggles = el.querySelectorAll('.associate-sidebar__group-toggle');
    (toggles[1] as HTMLButtonElement).click();
    (toggles[4] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.associate-sidebar__subnav').length).toBe(1);
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    expect(toggles[4].getAttribute('aria-expanded')).toBe('true');
  });

  it('auto-opens the group that owns the current route, and follows navigation', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/settings/branding');
    const { fixture, el } = render();
    expect(el.querySelectorAll('.associate-sidebar__subnav').length).toBe(1);
    expect(el.querySelector('.associate-sidebar__sublink[href="/admin/settings/branding"]')).toBeTruthy();

    await router.navigateByUrl('/admin/settings/audit-log');
    fixture.detectChanges();
    expect(el.querySelector('.associate-sidebar__sublink[href="/admin/settings/audit-log"]')).toBeTruthy();
  });

  it('emits logout when the logout button is clicked', () => {
    const { fixture, el } = render();
    let logouts = 0;
    fixture.componentInstance.logout.subscribe(() => logouts++);
    (el.querySelector('.associate-sidebar__logout') as HTMLButtonElement).click();
    expect(logouts).toBe(1);
  });

  it('has a pin button by the logo that collapses the sidebar to an icon rail', () => {
    const { fixture, el } = render();
    expect(el.querySelector('.associate-sidebar--expanded')).toBeTruthy();
    let emitted: boolean | undefined;
    fixture.componentInstance.pinnedChange.subscribe((v: boolean) => (emitted = v));

    (el.querySelector('.associate-sidebar__brand .associate-sidebar__pin') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(emitted).toBe(false);
    expect(el.querySelector('.associate-sidebar--expanded')).toBeFalsy();
    expect(el.querySelectorAll('.associate-sidebar__link-label').length).toBe(0);
    expect(el.querySelectorAll('.associate-sidebar__subnav').length).toBe(0);
  });

  it('peeks expanded on hover while unpinned, without re-pinning', () => {
    const { fixture, el } = render();
    fixture.componentInstance.togglePin();
    fixture.componentInstance.onEnter();
    fixture.detectChanges();
    expect(fixture.componentInstance.pinned).toBe(false);
    expect(el.querySelector('.associate-sidebar--expanded')).toBeTruthy();
  });

  it('shows no pin button in the phone drawer (forceExpanded)', () => {
    const fixture = TestBed.createComponent(AdminSidebarComponent);
    fixture.componentInstance.forceExpanded = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-sidebar__pin')).toBeFalsy();
  });
});
