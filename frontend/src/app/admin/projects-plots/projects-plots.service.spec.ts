import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ProjectsPlotsService } from './projects-plots.service';

describe('ProjectsPlotsService', () => {
  let service: ProjectsPlotsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(ProjectsPlotsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('reads the plot grid from the any-authenticated /api/projects path', () => {
    service.getGrid('p1').subscribe(g => expect(g.length).toBe(1));
    const req = http.expectOne('/api/projects/p1/plots/grid');
    expect(req.request.method).toBe('GET');
    req.flush([{ plotId: 'x', plotNo: 'A-1', type: 'NORMAL', area: 1, price: 2, status: 'AVAILABLE' }]);
  });

  it('reads a single plot (for its rate) from the company path', () => {
    service.getPlot('p1', 'x').subscribe();
    http.expectOne('/api/company/projects/p1/plots/x').flush({});
  });

  it('creates a booking at POST /api/admin/bookings with the request body', () => {
    const body = { plotId: 'x', associateId: 'a', buyerName: 'Rohit', buyerPhone: '99', tokenAmount: 100000 };
    service.createBooking(body).subscribe();
    const req = http.expectOne('/api/admin/bookings');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('reads the EMI config', () => {
    service.getEmiConfig().subscribe();
    http.expectOne('/api/company/booking-emi').flush({ emiEnabled: true, defaultInstallmentCount: 6 });
  });

  const isPage = (n: string) => (r: any) =>
    r.url === '/api/company/projects/p1/plots' && r.params.get('page') === n && r.params.get('size') === '500';

  it('getPlotRates reads /api/company/projects/p1/plots with page=0&size=500 and maps id -> rate', () => {
    let out: Record<string, number> | undefined;
    service.getPlotRates('p1').subscribe(r => (out = r));
    const req = http.expectOne(isPage('0'));
    expect(req.request.method).toBe('GET');
    req.flush({ plots: [{ id: 'x', rate: 2299 }, { id: 'y', rate: 1999 }], page: 0, size: 500, totalElements: 2 });
    expect(out).toEqual({ x: 2299, y: 1999 });
  });

  it('getPlotRates walks every page', () => {
    let out: Record<string, number> | undefined;
    service.getPlotRates('p1').subscribe(r => (out = r));
    http.expectOne(isPage('0')).flush({ plots: [{ id: 'x', rate: 1 }], page: 0, size: 500, totalElements: 501 });
    http.expectOne(isPage('1')).flush({ plots: [{ id: 'z', rate: 3 }], page: 1, size: 500, totalElements: 501 });
    expect(out).toEqual({ x: 1, z: 3 });
  });

  it('getPlotRates propagates an HTTP error', () => {
    let status = 0;
    service.getPlotRates('p1').subscribe({ error: e => (status = e.status) });
    http.expectOne(isPage('0')).flush('boom', { status: 500, statusText: 'err' });
    expect(status).toBe(500);
  });
});
