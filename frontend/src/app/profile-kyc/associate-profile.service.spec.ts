import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AssociateProfileService } from './associate-profile.service';
import { AssociateProfileResponse } from './models/associate-profile.model';

describe('AssociateProfileService', () => {
  let service: AssociateProfileService;
  let httpMock: HttpTestingController;

  const mockResponse: AssociateProfileResponse = {
    id: 'a1', userId: 'VP00001', name: 'Jane Doe', phone: '9990001111',
    email: 'jane@example.com', joinedAt: '2026-01-01T00:00:00Z'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(AssociateProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own profile from GET /api/associates/me/profile', () => {
    let result: AssociateProfileResponse | undefined;
    service.getProfile().subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/profile');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);

    expect(result).toEqual(mockResponse);
  });

  it('sends an update via PUT /api/associates/me/profile with the request body', () => {
    let result: AssociateProfileResponse | undefined;
    service.updateProfile({ name: 'Jane A. Doe', phone: '9990002222', email: 'jane.a.doe@example.com' })
      .subscribe(res => (result = res));

    const req = httpMock.expectOne('/api/associates/me/profile');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Jane A. Doe', phone: '9990002222', email: 'jane.a.doe@example.com' });
    req.flush({ ...mockResponse, name: 'Jane A. Doe' });

    expect(result?.name).toBe('Jane A. Doe');
  });

  it('propagates a 409 conflict on the update call without swallowing it', () => {
    let error: any;
    service.updateProfile({ name: 'Jane Doe', phone: null, email: 'taken@example.com' })
      .subscribe({ error: err => (error = err) });

    httpMock.expectOne('/api/associates/me/profile')
      .flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });

    expect(error.status).toBe(409);
  });
});
