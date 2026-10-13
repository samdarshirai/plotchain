import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { EPinRegisterService } from './epin-register.service';

describe('EPinRegisterService', () => {
  let svc: EPinRegisterService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(EPinRegisterService);
    http = TestBed.inject(HttpTestingController);
    svc.unlock('pw').subscribe();
    http.expectOne('/api/associates/me/epins/unlock').flush({ token: 'tok', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  });

  it('sends the unlock token and filters on unused', () => {
    svc.unused('TOPUP', 'ab', true, 1, 20).subscribe();
    const req = http.expectOne(r => r.url === '/api/associates/me/epins/unused');
    expect(req.request.headers.get('X-Epin-Unlock')).toBe('tok');
    expect(req.request.params.get('type')).toBe('TOPUP');
    expect(req.request.params.get('masked')).toBe('true');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ rows: [], page: 1, size: 20, totalElements: 0 });
  });

  it('bulk transfer posts count, recipient and password with the token', () => {
    svc.transferBulk(3, 'SDI2', '', 'pw').subscribe();
    const req = http.expectOne('/api/associates/me/epins/transfer-bulk');
    expect(req.request.headers.get('X-Epin-Unlock')).toBe('tok');
    expect(req.request.body).toEqual({ count: 3, toUserId: 'SDI2', pinType: null, transactionPassword: 'pw' });
    req.flush({ transferred: 3, toUserId: 'SDI2', toName: 'X' });
  });
});
