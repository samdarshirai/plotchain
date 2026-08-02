import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { KycQueueService } from './kyc-queue.service';
import { KycPage } from '../models/kyc-page.model';

describe('KycQueueService', () => {
  let service: KycQueueService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [KycQueueService]
    });
    service = TestBed.inject(KycQueueService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists the queue for a given status', () => {
    const mockPage: KycPage = { entries: [], page: 0, size: 20, totalElements: 0 };

    service.list('PENDING', 0, 20).subscribe(res => expect(res).toEqual(mockPage));

    const req = httpMock.expectOne('/api/admin/kyc?status=PENDING&page=0&size=20');
    expect(req.request.method).toBe('GET');
    req.flush(mockPage);
  });

  it('submits an approval decision with no reason', () => {
    service.decide('a1', 'VERIFIED').subscribe();

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ decision: 'VERIFIED', reason: undefined });
    req.flush({});
  });

  it('submits a rejection decision with a reason', () => {
    service.decide('a1', 'REJECTED', 'Blurry PAN photo').subscribe();

    const req = httpMock.expectOne('/api/admin/kyc/a1/decision');
    expect(req.request.body).toEqual({ decision: 'REJECTED', reason: 'Blurry PAN photo' });
    req.flush({});
  });
});
