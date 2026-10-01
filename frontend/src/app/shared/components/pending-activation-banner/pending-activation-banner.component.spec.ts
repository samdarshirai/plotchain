import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PendingActivationBannerComponent } from './pending-activation-banner.component';

describe('PendingActivationBannerComponent', () => {
  let fixture: ComponentFixture<PendingActivationBannerComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PendingActivationBannerComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(PendingActivationBannerComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });
  afterEach(() => httpMock.verify());

  it('shows the banner for a PENDING associate', () => {
    httpMock.expectOne('/api/associates/me/profile').flush({ status: 'PENDING' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pending-banner')).not.toBeNull();
  });

  it('shows nothing for an ACTIVE associate', () => {
    httpMock.expectOne('/api/associates/me/profile').flush({ status: 'ACTIVE' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pending-banner')).toBeNull();
  });

  it('stays hidden on an error', () => {
    httpMock.expectOne('/api/associates/me/profile').flush({}, { status: 500, statusText: 'err' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pending-banner')).toBeNull();
  });
});
