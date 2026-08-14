import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { DigitalIdCardComponent } from './digital-id-card.component';
import { AssociateIdCard } from './models/associate-id-card.model';

describe('DigitalIdCardComponent', () => {
  let fixture: ComponentFixture<DigitalIdCardComponent>;
  let httpMock: HttpTestingController;

  const baseCard: AssociateIdCard = {
    idNumber: 'VP00042', name: 'Priya Nair', rank: 'Gold Associate', photoUrl: null, qrPayload: 'VP00042'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DigitalIdCardComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(DigitalIdCardComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads and displays the associate\'s id number, name, and rank on init', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush(baseCard);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.digital-id-card__id-number')?.textContent?.trim()).toBe('VP00042');
    expect(compiled.querySelector('.digital-id-card__name')?.textContent?.trim()).toBe('Priya Nair');
    expect(compiled.querySelector('.digital-id-card__rank')?.textContent?.trim()).toBe('Gold Associate');
  });

  it('shows a load error when the fetch fails, without silently doing nothing', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    const errorEl: HTMLElement | null = fixture.nativeElement.querySelector('.digital-id-card__load-error');
    expect(errorEl?.textContent?.trim()).toBeTruthy();
  });

  it('renders an initials placeholder instead of a broken image when photoUrl is null', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush(baseCard);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.digital-id-card__avatar')?.textContent?.trim()).toBe('PN');
    expect(compiled.querySelector('.digital-id-card__photo-img')).toBeFalsy();
  });

  it('renders an actual photo image when photoUrl is present, not just the placeholder path', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush({ ...baseCard, photoUrl: 'https://cdn.example.com/p.jpg' });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const img = compiled.querySelector('.digital-id-card__photo-img') as HTMLImageElement | null;
    expect(img?.src).toBe('https://cdn.example.com/p.jpg');
    expect(compiled.querySelector('.digital-id-card__avatar')).toBeFalsy();
  });

  it('renders the QR payload as visible text, not an image or canvas (no QR-rendering library exists)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush(baseCard);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.digital-id-card__qr-payload')?.textContent?.trim()).toBe('VP00042');
    expect(compiled.querySelector('.digital-id-card__qr canvas')).toBeFalsy();
    expect(compiled.querySelector('.digital-id-card__qr img')).toBeFalsy();
  });

  it('renders no edit controls (view-only screen)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/id-card').flush(baseCard);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('input')).toBeFalsy();
    expect(compiled.querySelector('button')).toBeFalsy();
  });
});
