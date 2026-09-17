import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DigitalIdCardService } from './digital-id-card.service';
import { AssociateIdCard } from './models/associate-id-card.model';

describe('DigitalIdCardService', () => {
  let service: DigitalIdCardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [DigitalIdCardService]
    });
    service = TestBed.inject(DigitalIdCardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own digital ID card with no query params', () => {
    const mockResponse: AssociateIdCard = {
      idNumber: 'VP00042', name: 'Priya Nair', rank: 'Gold Associate', photoUrl: null, qrPayload: 'VP00042'
    };

    service.getMyIdCard().subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/associates/me/id-card');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
