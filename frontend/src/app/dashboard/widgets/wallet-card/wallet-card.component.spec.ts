import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { WalletCardComponent } from './wallet-card.component';

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
