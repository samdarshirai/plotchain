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

    httpMock.expectOne(req => req.url === '/api/associates' && req.method === 'GET').flush([]);
    httpMock.expectOne(req => req.url === '/api/company/projects' && req.method === 'GET')
      .flush([{ id: 'proj-1', name: 'Green Meadows', location: 'Pune', hasThumbnail: false, totalPlots: 2, availablePlots: 1, soldPlots: 1, createdAt: '2026-01-01' }]);
  });

  afterEach(() => httpMock.verify());

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

  it('submits the form and shows a success banner with the recorded sale', () => {
    fixture.componentInstance.form.patchValue({
      plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/sales');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999', buyerEmail: undefined
    });
    req.flush({
      id: 'sale-1', plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999',
      buyerEmail: null, amount: 120000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
      voidReason: null, recordedAt: '2026-01-01T00:00:00Z'
    });

    expect(fixture.componentInstance.recorded?.id).toBe('sale-1');
    expect(fixture.componentInstance.submitError).toBeNull();
    expect(fixture.componentInstance.form.get('buyerName')!.value).toBeFalsy();
  });

  it('does not submit when the form is invalid', () => {
    fixture.componentInstance.form.patchValue({ plotId: '', associateId: '', buyerName: '', buyerPhone: '' });
    fixture.componentInstance.onSubmit();

    httpMock.expectNone('/api/admin/sales');
    expect(fixture.componentInstance.recorded).toBeNull();
  });

  it('sets a submit error on a 409 plot-unavailable conflict', () => {
    fixture.componentInstance.form.patchValue({
      plotId: 'plot-1', associateId: 'a1', buyerName: 'Jane Doe', buyerPhone: '9999999999'
    });
    fixture.componentInstance.onSubmit();

    const req = httpMock.expectOne('/api/admin/sales');
    req.flush({ error: 'Plot is not available' }, { status: 409, statusText: 'Conflict' });

    expect(fixture.componentInstance.submitError).toBeTruthy();
    expect(fixture.componentInstance.recorded).toBeNull();
  });
});
