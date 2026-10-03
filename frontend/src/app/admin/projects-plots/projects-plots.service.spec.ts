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
    const body = { plotId: 'x', associateId: 'a', buyerName: 'Rohit', buyerPhone: '99' };
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
});
