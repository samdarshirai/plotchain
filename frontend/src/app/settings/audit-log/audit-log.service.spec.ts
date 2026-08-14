import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuditLogService } from './audit-log.service';
import { AuditLogPage } from './audit-log.model';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let httpMock: HttpTestingController;

  const page: AuditLogPage = {
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

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AuditLogService]
    });
    service = TestBed.inject(AuditLogService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('lists the audit log with no section param when section is null ("all")', () => {
    let result: AuditLogPage | undefined;
    service.list(null, 0, 20).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/audit-log?page=0&size=20');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('section')).toBe(false);
    req.flush(page);

    expect(result).toEqual(page);
  });

  it('omits the section param when section is an empty string', () => {
    service.list('', 1, 10).subscribe();

    const req = httpMock.expectOne('/api/company/audit-log?page=1&size=10');
    expect(req.request.params.has('section')).toBe(false);
    req.flush({ ...page, page: 1, size: 10 });
  });

  it('translates the camelCase section key to its SCREAMING_SNAKE_CASE backend value', () => {
    service.list('companyProfile', 0, 20).subscribe();

    const req = httpMock.expectOne('/api/company/audit-log?page=0&size=20&section=COMPANY_PROFILE');
    expect(req.request.params.get('section')).toBe('COMPANY_PROFILE');
    req.flush(page);
  });

  it('maps every one of the 5 section keys to its expected backend value', () => {
    const expected: Record<string, string> = {
      companyProfile: 'COMPANY_PROFILE',
      branding: 'BRANDING',
      compensation: 'COMPENSATION',
      projects: 'PROJECTS',
      paymentsKyc: 'PAYMENTS_KYC'
    };

    Object.keys(expected).forEach(key => {
      service.list(key, 0, 20).subscribe();
      const req = httpMock.expectOne(`/api/company/audit-log?page=0&size=20&section=${expected[key]}`);
      expect(req.request.params.get('section')).toBe(expected[key]);
      req.flush(page);
    });
  });

  it('sends page and size as plain query params', () => {
    service.list(null, 2, 5).subscribe();

    const req = httpMock.expectOne('/api/company/audit-log?page=2&size=5');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('size')).toBe('5');
    req.flush({ ...page, page: 2, size: 5 });
  });
});
