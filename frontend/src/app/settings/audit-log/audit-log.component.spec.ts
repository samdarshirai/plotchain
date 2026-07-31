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
    httpMock.expectOne('/api/company/audit-log?page=0&size=20').flush(page);
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

  it('re-fetches page 0 with the mapped SCREAMING_SNAKE_CASE value when the section filter changes', () => {
    flushInitialLoad();

    const select: HTMLSelectElement = fixture.debugElement.query(By.css('select')).nativeElement;
    select.value = 'companyProfile';
    select.dispatchEvent(new Event('change'));

    const req = httpMock.expectOne('/api/company/audit-log?page=0&size=20&section=COMPANY_PROFILE');
    expect(req.request.method).toBe('GET');
    req.flush(namedEntryPage);
  });

  it('re-fetches with no section param when the filter is switched back to "All"', () => {
    flushInitialLoad();

    const select: HTMLSelectElement = fixture.debugElement.query(By.css('select')).nativeElement;
    select.value = 'companyProfile';
    select.dispatchEvent(new Event('change'));
    httpMock.expectOne('/api/company/audit-log?page=0&size=20&section=COMPANY_PROFILE').flush(namedEntryPage);

    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    const req = httpMock.expectOne('/api/company/audit-log?page=0&size=20');
    expect(req.request.params.has('section')).toBe(false);
    req.flush(namedEntryPage);
  });

  it('disables Previous on the first page and Next on the last page', () => {
    flushInitialLoad({ ...namedEntryPage, page: 0, size: 20, totalElements: 1 });

    const buttons = fixture.debugElement.queryAll(By.css('.audit-log__pagination button'));
    const [previousButton, nextButton] = buttons;
    expect(previousButton.nativeElement.disabled).toBe(true);
    expect(nextButton.nativeElement.disabled).toBe(true);
  });

  it('enables Next and calls list() with the next page when more results remain', () => {
    // page 0, size 20 (PAGE_SIZE), totalElements 25: (0+1)*20=20 < 25, so Next stays enabled.
    flushInitialLoad({ ...namedEntryPage, page: 0, size: 20, totalElements: 25 });

    const buttons = fixture.debugElement.queryAll(By.css('.audit-log__pagination button'));
    const [previousButton, nextButton] = buttons;
    expect(previousButton.nativeElement.disabled).toBe(true);
    expect(nextButton.nativeElement.disabled).toBe(false);

    nextButton.nativeElement.click();
    const req = httpMock.expectOne('/api/company/audit-log?page=1&size=20');
    expect(req.request.method).toBe('GET');
    req.flush({ ...namedEntryPage, page: 1, size: 20, totalElements: 25 });
  });

  it('enables Previous and calls list() with the prior page once past page 0', () => {
    flushInitialLoad({ ...namedEntryPage, page: 0, size: 20, totalElements: 25 });

    const nextButton = fixture.debugElement.queryAll(By.css('.audit-log__pagination button'))[1];
    nextButton.nativeElement.click();
    // page 1, size 20, totalElements 25: (1+1)*20=40 >= 25, so Next is now disabled.
    httpMock
      .expectOne('/api/company/audit-log?page=1&size=20')
      .flush({ ...namedEntryPage, page: 1, size: 20, totalElements: 25 });
    fixture.detectChanges();

    const buttons = fixture.debugElement.queryAll(By.css('.audit-log__pagination button'));
    const [previousButton, nextButtonAfter] = buttons;
    expect(previousButton.nativeElement.disabled).toBe(false);
    expect(nextButtonAfter.nativeElement.disabled).toBe(true);

    previousButton.nativeElement.click();
    const req = httpMock.expectOne('/api/company/audit-log?page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush({ ...namedEntryPage, page: 0, size: 20, totalElements: 25 });
  });
});
