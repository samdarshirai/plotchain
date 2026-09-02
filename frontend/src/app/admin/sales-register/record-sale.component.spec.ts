import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { RecordSaleComponent } from './record-sale.component';

describe('RecordSaleComponent', () => {
  let fixture: ComponentFixture<RecordSaleComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecordSaleComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(RecordSaleComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([
      { id: 'admin-1', userId: 'ADMIN01', name: 'Root Admin', role: 'ADMIN' },
      { id: 'assoc-1', userId: 'VP00001', name: 'Jane Doe', role: 'ASSOCIATE' }
    ]);
    httpMock.expectOne(req => req.url === '/api/company/projects' && req.method === 'GET')
      .flush([{ id: 'proj-1', name: 'Green Meadows', location: 'Pune', hasThumbnail: false, totalPlots: 2, availablePlots: 1, soldPlots: 1, createdAt: '2026-01-01' }]);
  });

  afterEach(() => httpMock.verify());

  it('excludes the root Admin account from the associate picker', () => {
    expect(fixture.componentInstance.associates.map(a => a.userId)).toEqual(['VP00001']);
  });

  it('loads available plots for the selected project, filtering out non-AVAILABLE plots', () => {
    fixture.componentInstance.onProjectChange('proj-1');

    const req = httpMock.expectOne('/api/company/projects/proj-1/plots?page=0&size=100');
    req.flush({
      plots: [
        { id: 'plot-1', plotNo: 'A1', plotType: 'NORMAL', areaSqft: 1200, rate: 100, price: 120000, status: 'AVAILABLE' },
        { id: 'plot-2', plotNo: 'A2', plotType: 'NORMAL', areaSqft: 1200, rate: 100, price: 120000, status: 'SOLD' }
      ],
      page: 0, size: 100, totalElements: 2
    });

    expect(fixture.componentInstance.availablePlots.length).toBe(1);
    expect(fixture.componentInstance.availablePlots[0].id).toBe('plot-1');
  });

  // Mandatory-fields change: buyerName, projectId, price, and note are now required alongside
  // associateId (unchanged); plotId and buyerPhone became optional.
  it('submits the form and shows a success banner with the recorded sale', () => {
    fixture.componentInstance.form.patchValue({
      projectId: 'proj-1', plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe',
      buyerPhone: '9999999999', price: '120000', note: 'Sold to Jane Doe'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/sales');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      projectId: 'proj-1', plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe',
      buyerPhone: '9999999999', buyerEmail: undefined, price: 120000, note: 'Sold to Jane Doe'
    });
    req.flush({
      id: 'sale-1', plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999',
      buyerEmail: null, amount: 120000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
      voidReason: null, recordedAt: '2026-01-01T00:00:00Z', plotNo: 'A1', projectName: 'Green Meadows',
      associateUserId: 'VP00001', associateName: 'Jane Associate', note: 'Sold to Jane Doe'
    });

    expect(fixture.componentInstance.recorded?.id).toBe('sale-1');
    expect(fixture.componentInstance.submitError).toBeNull();
    expect(fixture.componentInstance.form.get('buyerName')!.value).toBeFalsy();
  });

  // plotId and buyerPhone are optional -- a request with only the mandatory fields must still
  // pass validation and submit them as undefined, not empty strings.
  it('submits without plotId or buyerPhone when they are left blank', () => {
    fixture.componentInstance.form.patchValue({
      projectId: 'proj-1', associateId: 'a1', buyerName: 'Jane Doe', price: '120000', note: 'Sold to Jane Doe'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/sales');
    expect(req.request.body).toEqual({
      projectId: 'proj-1', plotId: undefined, associateId: 'a1', buyerName: 'Jane Doe',
      buyerPhone: undefined, buyerEmail: undefined, price: 120000, note: 'Sold to Jane Doe'
    });
    req.flush({
      id: 'sale-1', plotId: null, associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: null,
      buyerEmail: null, amount: 120000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
      voidReason: null, recordedAt: '2026-01-01T00:00:00Z', plotNo: null, projectName: 'Green Meadows',
      associateUserId: 'VP00001', associateName: 'Jane Associate', note: 'Sold to Jane Doe'
    });

    expect(fixture.componentInstance.recorded?.id).toBe('sale-1');
  });

  it('does not submit when a mandatory field (projectId, price, or note) is missing', () => {
    fixture.componentInstance.form.patchValue({
      projectId: '', associateId: 'a1', buyerName: 'Jane Doe', price: '', note: ''
    });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/admin/sales');
    expect(fixture.componentInstance.recorded).toBeNull();
  });

  it('does not submit when the form is invalid', () => {
    fixture.componentInstance.form.patchValue({ projectId: '', associateId: '', buyerName: '', price: '', note: '' });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/admin/sales');
    expect(fixture.componentInstance.recorded).toBeNull();
  });

  it('sets a submit error on a 409 plot-unavailable conflict', () => {
    fixture.componentInstance.form.patchValue({
      projectId: 'proj-1', plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe',
      buyerPhone: '9999999999', price: '120000', note: 'Sold to Jane Doe'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/sales');
    req.flush({ error: 'Plot is not available' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.submitError).toBeTruthy();
    expect(fixture.componentInstance.recorded).toBeNull();
  });
});
