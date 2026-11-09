import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AuditLogComponent } from './audit-log.component';
import { AuditLogPage } from './audit-log.model';

describe('AuditLogComponent', () => {
  let fixture: ComponentFixture<AuditLogComponent>;
  let httpMock: HttpTestingController;

  const namedEntryPage: AuditLogPage = {
    entries: [
      {
        id: 'e1',
        changedByAssociateId: 'a1',
        changedByName: 'Root One',
        changedByUserId: 'VP00001',
        section: 'COMPANY_PROFILE',
        summary: 'Updated company name',
        detail: '{}',
        changedAt: '2026-01-01T00:00:00Z'
      }
    ],
    page: 0,
    size: 20,
    totalElements: 1
  };

  const systemEntryPage: AuditLogPage = {
    entries: [
      {
        id: 'e2',
        changedByAssociateId: null,
        changedByName: null,
        changedByUserId: null,
        section: 'BRANDING',
        summary: 'System-applied default branding',
        detail: '{}',
        changedAt: '2026-01-02T00:00:00Z'
      }
    ],
    page: 0,
    size: 20,
    totalElements: 1
  };

  function flushInitialLoad(page: AuditLogPage = namedEntryPage): void {
    httpMock.expectOne('/api/company/audit-log?page=0&size=100').flush(page);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuditLogComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(AuditLogComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('renders rows from a flushed response', () => {
    flushInitialLoad();

    expect(fixture.nativeElement.textContent).toContain('Root One');
    expect(fixture.nativeElement.textContent).toContain('Updated company name');
    const rows = fixture.debugElement.queryAll(By.css('.audit-log__row'));
    expect(rows.length).toBe(1);
  });

  it('falls back to the system-actor label when changedByName is null', () => {
    flushInitialLoad(systemEntryPage);

    expect(fixture.nativeElement.textContent).toContain('settings.auditLog.systemActor');
    expect(fixture.nativeElement.textContent).toContain('System-applied default branding');
  });

  it('renders a translated section pill for one of the 5 real Settings sections', () => {
    flushInitialLoad();

    // TranslateModule.forRoot() has no loaded translations, so translate.instant returns the key
    // itself -- same convention as compensation-step.component.spec.ts's accordion summary
    // assertions. Real translated copy ("Company Profile") is exercised by the .json files.
    const tag = fixture.debugElement.query(By.css('.audit-log__section-tag'));
    expect(tag.nativeElement.textContent.trim()).toBe('settings.sections.companyProfile');
  });

  it('humanizes a backend section value that has no settings.sections entry (e.g. KYC)', () => {
    flushInitialLoad({
      ...namedEntryPage,
      entries: [{ ...namedEntryPage.entries[0], section: 'KYC' }]
    });

    const tag = fixture.debugElement.query(By.css('.audit-log__section-tag'));
    expect(tag.nativeElement.textContent.trim()).toBe('Kyc');
  });

  it('re-fetches page 0 with the mapped SCREAMING_SNAKE_CASE value when the section filter changes', () => {
    flushInitialLoad();

    const select: HTMLSelectElement = fixture.debugElement.query(By.css('select')).nativeElement;
    select.value = 'companyProfile';
    select.dispatchEvent(new Event('change'));

    const req = httpMock.expectOne('/api/company/audit-log?page=0&size=100&section=COMPANY_PROFILE');
    expect(req.request.method).toBe('GET');
    req.flush(namedEntryPage);
  });

  it('re-fetches with no section param when the filter is switched back to "All"', () => {
    flushInitialLoad();

    const select: HTMLSelectElement = fixture.debugElement.query(By.css('select')).nativeElement;
    select.value = 'companyProfile';
    select.dispatchEvent(new Event('change'));
    httpMock.expectOne('/api/company/audit-log?page=0&size=100&section=COMPANY_PROFILE').flush(namedEntryPage);

    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    const req = httpMock.expectOne('/api/company/audit-log?page=0&size=100');
    expect(req.request.params.has('section')).toBe(false);
    req.flush(namedEntryPage);
  });
});
