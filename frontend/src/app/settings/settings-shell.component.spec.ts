import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsShellComponent } from './settings-shell.component';

describe('SettingsShellComponent', () => {
  let fixture: ComponentFixture<SettingsShellComponent>;
  let activatedRoute: { firstChild: { firstChild: null; snapshot: { data: { sectionKey?: string } } } };

  beforeEach(async () => {
    activatedRoute = {
      firstChild: { firstChild: null, snapshot: { data: { sectionKey: 'companyProfile' } } }
    };

    await TestBed.configureTestingModule({
      imports: [SettingsShellComponent, RouterTestingModule, TranslateModule.forRoot()],
      providers: [{ provide: ActivatedRoute, useValue: activatedRoute }]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsShellComponent);
  });

  it('rendersTheRouterOutletForChildRoutes', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('usesTheCenteredContentColumnByDefault', () => {
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
