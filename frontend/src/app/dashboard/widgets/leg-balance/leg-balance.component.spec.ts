import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LegBalanceComponent } from './leg-balance.component';
import { LegVolumeSummary } from '../../models/dashboard-response.model';

describe('LegBalanceComponent', () => {
  let fixture: ComponentFixture<LegBalanceComponent>;

  function createComponent(data: LegVolumeSummary): void {
    fixture = TestBed.createComponent(LegBalanceComponent);
    fixture.componentInstance.data = data;
    const translateService = TestBed.inject(TranslateService);
    translateService.setDefaultLang('en');
    translateService.use('en');
    translateService.setTranslation('en', {
      'dashboard.legBalanceEyebrow': 'Leg Balance',
      'dashboard.legBalanceCaption': 'matching pays on the weaker leg',
      'dashboard.leftLegLabel': 'Left Leg',
      'dashboard.rightLegLabel': 'Right Leg',
      'dashboard.legBalanceEmpty': 'No volume on either leg yet. Matching income starts once both legs carry volume in the same cycle.'
    });
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LegBalanceComponent, TranslateModule.forRoot()]
    }).compileComponents();
  });

  it('renders the eyebrow and caption', () => {
    createComponent({ leftLegVolume: 0, rightLegVolume: 0 });
    expect(fixture.nativeElement.textContent).toContain('Leg Balance');
    expect(fixture.nativeElement.textContent).toContain('matching pays on the weaker leg');
  });

  it('renders left and right leg figures as whole-rupee currency (no decimals)', () => {
    createComponent({ leftLegVolume: 300000, rightLegVolume: 200000 });
    const values = fixture.nativeElement.querySelectorAll('.leg-balance__figure-value');
    expect(values[0].textContent.trim()).toBe('₹300,000');
    expect(values[1].textContent.trim()).toBe('₹200,000');
  });

  it('renders a zero figure with no decimals', () => {
    createComponent({ leftLegVolume: 0, rightLegVolume: 0 });
    const values = fixture.nativeElement.querySelectorAll('.leg-balance__figure-value');
    expect(values[0].textContent.trim()).toBe('₹0');
  });

  it('renders the eyebrow label flush left, followed by a single fill rule, with the caption flush right (matches mockup, not the recent-sales double-rule style)', () => {
    createComponent({ leftLegVolume: 0, rightLegVolume: 0 });
    const header = fixture.nativeElement.querySelector('.leg-balance__header');
    const children = Array.from(header.children) as HTMLElement[];
    expect(children.map(el => el.className)).toEqual([
      'leg-balance__label', 'leg-balance__rule', 'leg-balance__caption'
    ]);
  });

  it('renders a vertical divider between the two figures, centered as a group (matches mockup, not a left-aligned list)', () => {
    createComponent({ leftLegVolume: 0, rightLegVolume: 0 });
    const figures = fixture.nativeElement.querySelector('.leg-balance__figures');
    const children = Array.from(figures.children) as HTMLElement[];
    expect(children.map(el => el.className)).toEqual([
      'leg-balance__figure', 'leg-balance__divider', 'leg-balance__figure'
    ]);
  });

  it('shows the empty-state sentence when both legs have zero volume', () => {
    createComponent({ leftLegVolume: 0, rightLegVolume: 0 });
    expect(fixture.nativeElement.textContent).toContain('No volume on either leg yet');
  });

  it('hides the empty-state sentence once either leg carries volume', () => {
    createComponent({ leftLegVolume: 300000, rightLegVolume: 0 });
    expect(fixture.nativeElement.textContent).not.toContain('No volume on either leg yet');
  });

  it('computes each leg as a percentage of the combined volume', () => {
    createComponent({ leftLegVolume: 300000, rightLegVolume: 200000 });
    const component = fixture.componentInstance;
    expect(component.leftPct).toBe(60);
    expect(component.rightPct).toBe(40);
  });

  it('reports zero percentages when both legs are empty, without dividing by zero', () => {
    createComponent({ leftLegVolume: 0, rightLegVolume: 0 });
    const component = fixture.componentInstance;
    expect(component.leftPct).toBe(0);
    expect(component.rightPct).toBe(0);
  });
});
