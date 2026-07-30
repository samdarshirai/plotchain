import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { WalletCardComponent } from './wallet-card.component';

registerLocaleData(localeEnIn);

describe('WalletCardComponent', () => {
  let fixture: ComponentFixture<WalletCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletCardComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(WalletCardComponent);
    fixture.componentInstance.balance = 2500;
    fixture.detectChanges();
  });

  it('renders the withdrawable balance', () => {
    expect(fixture.nativeElement.textContent).toContain('2,500');
  });

  it('the withdraw action links to /wallet/withdraw', () => {
    const link = fixture.nativeElement.querySelector('.withdraw-action');
    expect(link.getAttribute('href')).toBe('/wallet/withdraw');
  });
});

// Automated version of the roadmap's manual "lakh grouping" check: proves the en-IN locale
// (registered app-wide via app.config.ts) groups digits in lakhs/crores rather than thousands
// once LOCALE_ID is wired through, catching a mis-registered locale before a human opens a browser.
describe('WalletCardComponent with en-IN locale', () => {
  let fixture: ComponentFixture<WalletCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WalletCardComponent, RouterTestingModule, TranslateModule.forRoot()],
      providers: [{ provide: LOCALE_ID, useValue: 'en-IN' }]
    }).compileComponents();
    fixture = TestBed.createComponent(WalletCardComponent);
    fixture.componentInstance.balance = 163200;
    fixture.detectChanges();
  });

  it('renders 163200 with Indian digit grouping via the currency pipe', () => {
    expect(fixture.nativeElement.textContent).toContain('₹1,63,200');
  });
});
