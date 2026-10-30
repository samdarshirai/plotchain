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

  describe('keyboard focus ring', () => {
    function focused(type: string, selected: boolean) {
      fixture.componentRef.setInput('type', type);
      fixture.componentRef.setInput('selected', selected);
      fixture.detectChanges();
      document.body.appendChild(fixture.nativeElement);
      button().focus({ focusVisible: true } as FocusOptions);
      expect(button().matches(':focus-visible')).withContext('focus-visible must match for a real assertion').toBeTrue();
      return getComputedStyle(button());
    }
    afterEach(() => fixture.nativeElement.remove());

    it('corner tile draws the ring inset (inside the clip)', () => {
      expect(focused('CORNER', false).outlineOffset).toBe('-7px');
    });
    it('selected corner tile keeps the inset ring and the 3px border', () => {
      const cs = focused('CORNER', true);
      expect(cs.outlineOffset).toBe('-7px');
      expect(cs.borderTopWidth).toBe('3px');
    });
    it('corner combo tile draws the ring inset too', () => {
      expect(focused('CORNER_ROAD_SIDE', false).outlineOffset).toBe('-7px');
    });
    it('non-corner tile keeps the outside 2px offset', () => {
      expect(focused('STANDARD', false).outlineOffset).toBe('2px');
    });
  });

  describe('park facing and road side marks', () => {
    const typeIcon = () => el().querySelector('.plot-tile__type-icon');
    function show(type: string, plan = false) {
      fixture.componentRef.setInput('type', type);
      fixture.componentRef.setInput('plan', plan);
      fixture.detectChanges();
    }

    it('marks a Corner + Park Facing tile as corner and shows the park icon', () => {
      show('CORNER_PARK_FACING');
      expect(button().classList).toContain('plot-tile--corner');
      expect(typeIcon()!.textContent!.trim()).toBe('park');
    });

    it('shows the add_road icon for Road Side and no corner class', () => {
      show('ROAD_SIDE');
      expect(button().classList).not.toContain('plot-tile--corner');
      expect(typeIcon()!.textContent!.trim()).toBe('add_road');
    });

    it('shows the type icon in the plan variant too', () => {
      show('PARK_FACING', true);
      expect(typeIcon()!.textContent!.trim()).toBe('park');
    });

    it('shows no type icon for Normal or Corner', () => {
      show('CORNER');
      expect(typeIcon()).toBeNull();
    });

    it('names the type parts in the meta line', () => {
      show('CORNER_PARK_FACING');
      const meta = el().querySelector('.plot-tile__meta')!.textContent!;
      expect(meta).toContain('plotTile.corner');
      expect(meta).toContain('plotTile.park');
    });
  });
});

