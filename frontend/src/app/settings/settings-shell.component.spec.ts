import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { SettingsShellComponent } from './settings-shell.component';
import { SECTION_PATHS } from './models/settings-section.model';

describe('SettingsShellComponent', () => {
  let fixture: ComponentFixture<SettingsShellComponent>;
  let router: Router;
  let activatedRoute: { firstChild: { firstChild: null; snapshot: { data: { sectionKey?: string } } } };

  beforeEach(async () => {
    activatedRoute = {
      firstChild: { firstChild: null, snapshot: { data: { sectionKey: 'companyProfile' } } }
    };

    await TestBed.configureTestingModule({
      imports: [SettingsShellComponent, RouterTestingModule, TranslateModule.forRoot()],
      providers: [{ provide: ActivatedRoute, useValue: activatedRoute }]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(SettingsShellComponent);
  });

  it('rendersTheNavRailWithSixSectionsPlusAssociateDirectoryPlusTreeExplorerPlusKycQueuePlusAuditLogPlusAdminStatsPlusSalesRegisterPlusCycleManagement', () => {
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items.length).toBe(Object.keys(SECTION_PATHS).length + 7);
    expect(items.length).toBe(13);
  });

  it('highlightsTheActiveSectionKeyFromTheDeepestChildRoute', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSectionKey).toBe('companyProfile');

    // Simulate a deeper nested child route (e.g. a section with its own sub-route) reporting
    // a different sectionKey, then drive a real router navigation event through Router.events
    // so the subscription set up in ngOnInit re-derives the active key (not just initial render).
    activatedRoute.firstChild = {
      firstChild: null,
      snapshot: { data: { sectionKey: 'branding' } }
    };
    (router.events as unknown as Subject<unknown>).next(
      new NavigationEnd(1, '/settings/branding', '/settings/branding')
    );
    fixture.detectChanges();

    expect(fixture.componentInstance.activeSectionKey).toBe('branding');
    const navRailItems = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    const brandingIndex = Object.keys(SECTION_PATHS).indexOf('branding');
    expect(navRailItems[brandingIndex].classList).toContain('settings-nav-rail__item--active');
  });

  it('rendersTheRouterOutletForChildRoutes', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
