import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { MyBusinessReportComponent } from './my-business-report.component';
import { EmiReportComponent } from './emi-report.component';

describe('Reports screens', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MyBusinessReportComponent, EmiReportComponent, TranslateModule.forRoot()],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('my business: renders both legs and reloads with the chosen dates', () => {
    const fixture = TestBed.createComponent(MyBusinessReportComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/reports/business').flush({
      left: [{ paymentDate: '2026-06-03T00:00:00Z', confirmDate: null, associateId: 'VP00001', name: 'Ravi', project: 'Green', plotNumber: 'A-1', business: 100 }],
      right: []
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ravi');
    expect(fixture.nativeElement.querySelectorAll('table').length).toBe(1);

    const input = fixture.nativeElement.querySelectorAll('input[type=date]')[0] as HTMLInputElement;
    input.value = '2026-06-01';
    input.dispatchEvent(new Event('change'));
    const req = http.expectOne(r => r.url === '/api/associates/me/reports/business');
    expect(req.request.params.get('from')).toBe('2026-06-01');
    expect(req.request.params.has('to')).toBeFalse();
  });

  it('emi: renders rows with mode', () => {
    const fixture = TestBed.createComponent(EmiReportComponent);
    fixture.detectChanges();
    http.expectOne(r => r.url === '/api/associates/me/reports/emi').flush([
      { associateId: 'VP00002', name: 'Sita', paymentDate: '2026-06-05T00:00:00Z', amount: 5000, mode: 'UPI' }
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sita');
    expect(fixture.nativeElement.textContent).toContain('UPI');
  });
});
