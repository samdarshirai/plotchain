import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AdminSidebarComponent } from './admin-sidebar.component';

describe('AdminSidebarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AdminSidebarComponent,
        HttpClientTestingModule,
        RouterTestingModule.withRoutes([
          { path: 'admin/dashboard', children: [] },
          { path: 'settings/company-profile', children: [] },
          { path: 'settings/branding', children: [] },
          { path: 'settings/audit-log', children: [] }
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

  it('lists Dashboard plus the six category groups, all closed by default', () => {
    const { el } = render();
    expect(el.querySelector('a[href="/admin/dashboard"]')).toBeTruthy();
    expect(groupLabels(el).length).toBe(6);
    expect(el.querySelectorAll('.associate-sidebar__subnav').length).toBe(0);
    expect(el.querySelectorAll('[aria-expanded="true"]').length).toBe(0);
  });

  it('opens a group on click to show its links, and closes it on a second click', () => {
    const { fixture, el } = render();
    const setup = el.querySelectorAll('.associate-sidebar__group-toggle')[0] as HTMLButtonElement;

    setup.click();
    fixture.detectChanges();
    const hrefs = Array.from(el.querySelectorAll('.associate-sidebar__sublink')).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/settings/company-profile',
      '/settings/branding',
      '/settings/compensation',
      '/settings/payments-kyc'
    ]);
    expect(setup.getAttribute('aria-expanded')).toBe('true');

    setup.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.associate-sidebar__sublink').length).toBe(0);
  });

  it('keeps several groups open at once', () => {
    const { fixture, el } = render();
    const toggles = el.querySelectorAll('.associate-sidebar__group-toggle');
    (toggles[0] as HTMLButtonElement).click();
    (toggles[3] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.associate-sidebar__subnav').length).toBe(2);
  });

  it('auto-opens the group that owns the current route, and follows navigation', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/settings/branding');
    const { fixture, el } = render();
    expect(el.querySelectorAll('.associate-sidebar__subnav').length).toBe(1);
    expect(el.querySelector('.associate-sidebar__sublink[href="/settings/branding"]')).toBeTruthy();

    await router.navigateByUrl('/settings/audit-log');
    fixture.detectChanges();
    expect(el.querySelector('.associate-sidebar__sublink[href="/settings/audit-log"]')).toBeTruthy();
  });

  it('emits logout when the logout button is clicked', () => {
    const { fixture, el } = render();
    let logouts = 0;
    fixture.componentInstance.logout.subscribe(() => logouts++);
    (el.querySelector('.associate-sidebar__logout') as HTMLButtonElement).click();
    expect(logouts).toBe(1);
  });
});
