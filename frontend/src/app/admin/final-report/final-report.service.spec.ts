import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FinalReportService } from './final-report.service';

describe('FinalReportService', () => {
  it('getAll issues GET /api/admin/cycles/final-report', () => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const service = TestBed.inject(FinalReportService);
    const httpMock = TestBed.inject(HttpTestingController);

    service.getAll().subscribe();

    const req = httpMock.expectOne('/api/admin/cycles/final-report');
    expect(req.request.method).toBe('GET');
    req.flush({});
    httpMock.verify();
  });
});
