import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateIdentityHeaderComponent } from './associate-identity-header.component';

describe('AssociateIdentityHeaderComponent', () => {
  let fixture: ComponentFixture<AssociateIdentityHeaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssociateIdentityHeaderComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(AssociateIdentityHeaderComponent);
  });

  it('renders associate ID, name, rank, phone, and joined date', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    };
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('SDI384818');
    expect(text).toContain('Asha Kumar');
    expect(text).toContain('Sales Associate');
    expect(text).toContain('9876543210');
  });

  it('renders the rank-changed date when set', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Executive',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: '2026-01-10T09:00:00Z'
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-identity-header__rank-changed')).toBeTruthy();
  });

  it('omits the rank-changed row when never promoted', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-identity-header__rank-changed')).toBeFalsy();
  });

  it('renders an initials avatar derived from the name', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-identity-header__avatar').textContent.trim()).toBe('AK');
  });

  it('omits the phone row when phone is not set', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha Kumar', rank: 'Sales Associate',
      phone: null, joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-identity-header__phone')).toBeFalsy();
  });

  it('renders a single initial when the name has only one word', () => {
    fixture.componentInstance.data = {
      associateId: 'SDI384818', name: 'Asha', rank: 'Sales Associate',
      phone: '9876543210', joinedAt: '2025-09-05T05:25:42Z', rankChangedAt: null
    };
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.associate-identity-header__avatar').textContent.trim()).toBe('A');
  });
});
