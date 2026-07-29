import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { KycBannerComponent } from './kyc-banner.component';

describe('KycBannerComponent', () => {
  let fixture: ComponentFixture<KycBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KycBannerComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(KycBannerComponent);
  });

  it('renders the banner when visible is true', () => {
    fixture.componentInstance.visible = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.kyc-banner')).toBeTruthy();
  });

  it('renders nothing when visible is false', () => {
    fixture.componentInstance.visible = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.kyc-banner')).toBeFalsy();
  });
});
