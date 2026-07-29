import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { QuickActionsComponent } from './quick-actions.component';

describe('QuickActionsComponent', () => {
  let fixture: ComponentFixture<QuickActionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickActionsComponent, RouterTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(QuickActionsComponent);
    fixture.detectChanges();
  });

  it('links Record Sale to /sales/new and Add Referral to /referrals/new', () => {
    expect(fixture.nativeElement.querySelector('.record-sale').getAttribute('href')).toBe('/sales/new');
    expect(fixture.nativeElement.querySelector('.add-referral').getAttribute('href')).toBe('/referrals/new');
  });
});
