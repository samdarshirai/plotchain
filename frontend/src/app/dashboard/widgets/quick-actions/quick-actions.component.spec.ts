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

  it('does not render a Record Sale or Add Referral link (associates have no self-service route)', () => {
    expect(fixture.nativeElement.querySelector('.record-sale')).toBeNull();
    expect(fixture.nativeElement.querySelector('.add-referral')).toBeNull();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });

  it('renders informational copy directing associates to contact their admin', () => {
    const info = fixture.nativeElement.querySelector('.quick-actions-empty');
    expect(info).not.toBeNull();
    expect(info.textContent.trim().length).toBeGreaterThan(0);
  });
});
