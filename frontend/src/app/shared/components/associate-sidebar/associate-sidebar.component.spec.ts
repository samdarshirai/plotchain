import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSidebarComponent } from './associate-sidebar.component';

describe('AssociateSidebarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AssociateSidebarComponent,
        HttpClientTestingModule,
        RouterTestingModule.withRoutes([]),
        TranslateModule.forRoot()
      ]
    }).compileComponents();
  });

  it('is pinned and expanded by default, showing nav labels', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.associate-sidebar--expanded')).toBeTruthy();
    expect(compiled.querySelectorAll('.associate-sidebar__link-label').length).toBe(10);
  });

  it('collapses to an icon rail and emits pinnedChange when unpinned', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    let emitted: boolean | undefined;
    component.pinnedChange.subscribe((value: boolean) => (emitted = value));

    component.togglePin();
    fixture.detectChanges();

    expect(emitted).toBe(false);
    expect(component.pinned).toBe(false);
    expect(component.expanded).toBe(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.associate-sidebar--expanded')).toBeFalsy();
    expect(compiled.querySelectorAll('.associate-sidebar__link-label').length).toBe(0);
  });

  it('peeks expanded on hover while unpinned, without re-pinning', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    const component = fixture.componentInstance;
    component.togglePin();
    fixture.detectChanges();

    component.onEnter();
    fixture.detectChanges();

    expect(component.expanded).toBe(true);
    expect(component.pinned).toBe(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.associate-sidebar--expanded')).toBeTruthy();

    component.onLeave();
    fixture.detectChanges();
    expect(component.expanded).toBe(false);
  });

  it('keeps My Account collapsed off /profile and toggles open/closed on click', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('.associate-sidebar__group-toggle') as HTMLButtonElement;

    expect(el.querySelectorAll('.associate-sidebar__sublink').length).toBe(0);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.associate-sidebar__sublink').length).toBe(4);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.associate-sidebar__sublink').length).toBe(0);
  });

  it('auto-opens Income Statement with 7 sub-items when navigating to /income-statement/royalty', async () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'income-statement/royalty', component: AssociateSidebarComponent }]);

    await router.navigateByUrl('/income-statement/royalty');
    fixture.detectChanges();

    expect(fixture.componentInstance.isOpen('incomeStatement')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.associate-sidebar__sublink').length).toBe(7);
  });

  it('auto-opens My Account when navigating to a /profile route', async () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'profile/kyc', component: AssociateSidebarComponent }]);

    await router.navigateByUrl('/profile/kyc');
    fixture.detectChanges();

    expect(fixture.componentInstance.isOpen('myAccount')).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.associate-sidebar__sublink').length).toBe(4);
  });

  it('renders the My Account sub-items (Welcome Letter, Profile, Bank Details, KYC Details) when expanded', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.componentInstance.toggle('myAccount');
    fixture.detectChanges();

    const sublinks = fixture.nativeElement.querySelectorAll('.associate-sidebar__sublink');
    expect(sublinks.length).toBe(4);
    const hrefs = Array.from(sublinks as NodeListOf<HTMLAnchorElement>).map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['/profile/welcome-letter', '/profile', '/profile/bank-details', '/profile/kyc']);
  });

  it('hides the My Account sub-items when the sidebar is collapsed', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.componentInstance.toggle('myAccount');
    fixture.detectChanges();
    fixture.componentInstance.togglePin();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.associate-sidebar__sublink').length).toBe(0);
  });

  it('emits logout when the Log Out control is clicked', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    let logoutEmitted = false;
    component.logout.subscribe(() => (logoutEmitted = true));

    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('.associate-sidebar__logout') as HTMLButtonElement).click();

    expect(logoutEmitted).toBe(true);
  });
});
