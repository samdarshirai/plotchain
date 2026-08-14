import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsNavRailComponent } from './settings-nav-rail.component';
import { SECTION_PATHS } from './models/settings-section.model';

describe('SettingsNavRailComponent', () => {
  let fixture: ComponentFixture<SettingsNavRailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsNavRailComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(SettingsNavRailComponent);
  });

  it('renders one row per section plus hardcoded associate directory, tree explorer, kyc queue, audit log, admin stats, sales register, cycle management, and ledger register rows', () => {
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items.length).toBe(Object.keys(SECTION_PATHS).length + 8);
  });

  it('marks the active section', () => {
    fixture.componentInstance.activeSectionKey = 'branding';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    const brandingIndex = Object.keys(SECTION_PATHS).indexOf('branding');
    expect(items[brandingIndex].classList).toContain('settings-nav-rail__item--active');
  });

  it('marks the audit log row active when the active section key is auditLog', () => {
    fixture.componentInstance.activeSectionKey = 'auditLog';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 5].classList).toContain('settings-nav-rail__item--active');
  });

  it('marks the admin stats row active when the active section key is adminStats', () => {
    fixture.componentInstance.activeSectionKey = 'adminStats';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 4].classList).toContain('settings-nav-rail__item--active');
  });

  it('marks the sales register row active when the active section key is salesRegister', () => {
    fixture.componentInstance.activeSectionKey = 'salesRegister';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 3].classList).toContain('settings-nav-rail__item--active');
  });

  it('marks the cycle management row active when the active section key is cycleManagement', () => {
    fixture.componentInstance.activeSectionKey = 'cycleManagement';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 2].classList).toContain('settings-nav-rail__item--active');
  });

  it('marks the ledger register row active when the active section key is ledgerRegister', () => {
    fixture.componentInstance.activeSectionKey = 'ledgerRegister';
    fixture.detectChanges();
    const items = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item');
    expect(items[items.length - 1].classList).toContain('settings-nav-rail__item--active');
  });

  it('links each row to its section route so the shell can be navigated by clicking the rail', () => {
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.settings-nav-rail__item a');
    expect(links[0].getAttribute('href')).toBe('/settings/company-profile');
    expect(links[links.length - 2].getAttribute('href')).toBe('/settings/cycle-management');
    expect(links[links.length - 1].getAttribute('href')).toBe('/settings/ledger-register');
  });
});
