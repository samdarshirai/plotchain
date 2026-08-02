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

  it('defaults to the complete tone and icon', () => {
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('.checklist-row');
    expect(row.classList).toContain('checklist-row--complete');
    expect(fixture.nativeElement.querySelector('.checklist-row__icon').textContent).toContain('check_circle');
  });

  it('switches icon and row class per tone', () => {
    fixture.componentInstance.tone = 'blocking';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checklist-row').classList).toContain('checklist-row--blocking');
    expect(fixture.nativeElement.querySelector('.checklist-row__icon').textContent).toContain('warning');

    fixture.componentInstance.tone = 'optional';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.checklist-row').classList).toContain('checklist-row--optional');
    expect(fixture.nativeElement.querySelector('.checklist-row__icon').textContent).toContain('rule');
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
