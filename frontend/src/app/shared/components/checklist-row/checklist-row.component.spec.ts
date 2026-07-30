import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ChecklistRowComponent } from './checklist-row.component';

describe('ChecklistRowComponent', () => {
  let fixture: ComponentFixture<ChecklistRowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChecklistRowComponent, RouterTestingModule]
    }).compileComponents();
    fixture = TestBed.createComponent(ChecklistRowComponent);
    fixture.componentInstance.label = 'KYC verification';
  });

  it('renders the label', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checklist-row__label').textContent).toContain('KYC verification');
  });

  it('shows the complete-state indicator only when complete', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checklist-row__indicator')).toBeFalsy();

    fixture.componentInstance.complete = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checklist-row__indicator')).toBeTruthy();
  });

  it('renders the badge when badgeLabel is set', () => {
    fixture.componentInstance.badgeLabel = 'Pending';
    fixture.detectChanges();
    const badge = fixture.nativeElement.querySelector('.checklist-row__badge');
    expect(badge.textContent).toContain('Pending');
  });

  it('renders no edit link when neither editLabel nor editHref is supplied', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checklist-row__edit')).toBeFalsy();
  });

  it('renders no edit link when only editLabel is supplied', () => {
    fixture.componentInstance.editLabel = 'Edit';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checklist-row__edit')).toBeFalsy();
  });

  it('renders no edit link when only editHref is supplied', () => {
    fixture.componentInstance.editHref = '/kyc';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checklist-row__edit')).toBeFalsy();
  });

  it('renders the edit link when both editLabel and editHref are supplied', () => {
    fixture.componentInstance.editLabel = 'Edit';
    fixture.componentInstance.editHref = '/kyc';
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('.checklist-row__edit');
    expect(link).toBeTruthy();
    expect(link.textContent).toContain('Edit');
  });
});
