import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { SettingsShellComponent } from './settings-shell.component';

describe('SettingsShellComponent', () => {
  let fixture: ComponentFixture<SettingsShellComponent>;
  let activatedRoute: { firstChild: { firstChild: null; snapshot: { data: { sectionKey?: string } } } };

  beforeEach(async () => {
    activatedRoute = {
      firstChild: { firstChild: null, snapshot: { data: { sectionKey: 'companyProfile' } } }
    };

    await TestBed.configureTestingModule({
      imports: [
        SettingsShellComponent,
        RouterTestingModule.withRoutes([{ path: 'settings/branding', children: [] }]),
        TranslateModule.forRoot()
      ],
      providers: [{ provide: ActivatedRoute, useValue: activatedRoute }]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsShellComponent);
  });

  it('rendersTheRouterOutletForChildRoutes', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('listsAllFourteenSettingsScreensFlatInSidebarOrder', () => {
    const translateService = TestBed.inject(TranslateService);
    spyOn(translateService, 'get').and.callFake((key: string) => of(key.replace('settings.sections.', '')));
    fixture.detectChanges();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.settings-shell__nav-link') as NodeListOf<HTMLElement>
    ).map(el => el.textContent?.trim());

    expect(labels).toEqual([
      'companyProfile',
      'branding',
      'compensation',
      'projects',
      'paymentsKyc',
      'associateDirectory',
      'treeExplorer',
      'kycQueue',
      'auditLog',
      'adminStats',
      'salesRegister',
      'cycleManagement',
      'ledgerRegister',
      'payoutApproval'
    ]);
  });

  it('pointsEverySidebarLinkAtItsSettingsRoute', () => {
    fixture.detectChanges();

    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('.settings-shell__nav-link') as NodeListOf<HTMLAnchorElement>
    ).map(el => el.getAttribute('href'));

    expect(hrefs.every(href => href!.startsWith('/settings/'))).toBe(true);
    expect(hrefs).toContain('/settings/company-profile');
    expect(hrefs).toContain('/settings/payout-approval');
  });

  it('marksOnlyTheOpenScreensSidebarLinkActive', async () => {
    const router = TestBed.inject(Router);
    fixture.detectChanges();

    await router.navigateByUrl('/settings/branding');
    fixture.detectChanges();

    const active = Array.from(
      fixture.nativeElement.querySelectorAll('.settings-shell__nav-link--active') as NodeListOf<HTMLAnchorElement>
    ).map(el => el.getAttribute('href'));

    expect(active).toEqual(['/settings/branding']);
  });

  it('usesTheStandardContentColumnByDefault', () => {
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSectionKey).toBe('companyProfile');
    const content = fixture.nativeElement.querySelector('.settings-shell__content');
    expect(content.classList).not.toContain('settings-shell__content--full');
  });

  it('switchesToTheFullBleedContentColumnForTreeExplorer', () => {
    activatedRoute.firstChild = { firstChild: null, snapshot: { data: { sectionKey: 'treeExplorer' } } };
    fixture.detectChanges();
    expect(fixture.componentInstance.activeSectionKey).toBe('treeExplorer');
    const content = fixture.nativeElement.querySelector('.settings-shell__content');
    expect(content.classList).toContain('settings-shell__content--full');
  });
});
