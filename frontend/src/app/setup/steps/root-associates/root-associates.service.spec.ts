import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RootAssociatesService } from './root-associates.service';
import { CreateRootAssociateRequest, CreateRootAssociateResponse, RootAssociateSlots } from '../../models/root-associates.model';

describe('RootAssociatesService', () => {
  let service: RootAssociatesService;
  let httpMock: HttpTestingController;

  const createResponse: CreateRootAssociateResponse = {
    left: {
      associateId: '550e8400-e29b-41d4-a716-446655440000',
      userId: 'VP00001',
      temporaryPassword: 'TempPass123!',
      name: 'Root One',
      slotLabel: 'LEFT'
    },
    right: null
  };

  const slots: RootAssociateSlots = {
    roots: [
      {
        associateId: '550e8400-e29b-41d4-a716-446655440000',
        userId: 'VP00001',
        name: 'Root One',
        phone: '9990001111',
        slotLabel: 'LEFT'
      }
    ],
    leftOccupied: true,
    rightOccupied: false
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [RootAssociatesService]
    });
    service = TestBed.inject(RootAssociatesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('creates root associates', () => {
    const request: CreateRootAssociateRequest = {
      name: 'Root One',
      phone: '9990001111',
      seedRightRoot: false
    };
    let result: CreateRootAssociateResponse | undefined;
    service.createRootAssociates(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/root-associates');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(createResponse);

    expect(result).toEqual(createResponse);
  });

  it('fetches root associate slots', () => {
    let result: RootAssociateSlots | undefined;
    service.getSlots().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/root-associates');
    expect(req.request.method).toBe('GET');
    req.flush(slots);

    expect(result).toEqual(slots);
  });
});
