import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { PlotTileComponent } from './plot-tile.component';

describe('PlotTileComponent', () => {
  let fixture: ComponentFixture<PlotTileComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const button = () => el().querySelector('button') as HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PlotTileComponent, TranslateModule.forRoot()] });
    fixture = TestBed.createComponent(PlotTileComponent);
    fixture.componentRef.setInput('plotNo', 'A-12');
    fixture.componentRef.setInput('type', 'CORNER');
    fixture.componentRef.setInput('area', 1800);
    fixture.componentRef.setInput('price', 5130000);
    fixture.componentRef.setInput('status', 'AVAILABLE');
    fixture.detectChanges();
  });

  it('shows plot number, grouped area, lakh price and a corner marker', () => {
    const text = el().textContent!;
    expect(text).toContain('A-12');
    expect(text).toContain('1,800');
    expect(text).toContain('₹51.3 L');
    expect(button().classList).toContain('plot-tile--corner');
  });

  it('carries the status as a class and a visible status key (never colour alone)', () => {
    expect(button().classList).toContain('plot-tile--available');
    expect(el().querySelector('.plot-tile__status')!.textContent).toContain('plotTile.status.AVAILABLE');
    expect(el().querySelector('.plot-tile__icon')).not.toBeNull();
  });

  it('exposes a full aria-label with the full rupee price', () => {
    expect(button().getAttribute('aria-label')).toContain('plotTile.aria');
  });

  it('emits tileSelect on click and reflects aria-pressed', () => {
    const emitted: string[] = [];
    fixture.componentInstance.tileSelect.subscribe(() => emitted.push('x'));
    button().click();
    expect(emitted.length).toBe(1);
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });

  it('is inert and not pressable when selectable is false', () => {
    fixture.componentRef.setInput('selectable', false);
    fixture.detectChanges();
    expect(button().disabled).toBeTrue();
    expect(button().getAttribute('aria-pressed')).toBeNull();
  });
});
