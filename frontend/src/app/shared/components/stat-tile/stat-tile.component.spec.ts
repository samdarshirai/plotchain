import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatTileComponent } from './stat-tile.component';

@Component({
  standalone: true,
  imports: [StatTileComponent],
  template: `
    <app-stat-tile [label]="label" [value]="value" [hint]="hint" [tone]="tone" [icon]="icon">
      <button tile-editor>Edit</button>
    </app-stat-tile>
  `
})
class HostComponent {
  label = 'Wallet balance';
  value = '₹1,63,200';
  hint?: string;
  tone: 'default' | 'accent' | 'success' | 'warning' | 'danger' = 'default';
  icon?: string;
}

describe('StatTileComponent', () => {
  let hostFixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatTileComponent, HostComponent]
    }).compileComponents();
    hostFixture = TestBed.createComponent(HostComponent);
  });

  it('renders the label and value', () => {
    hostFixture.detectChanges();
    const el = hostFixture.nativeElement;
    expect(el.querySelector('.stat-tile__label').textContent).toContain('Wallet balance');
    expect(el.querySelector('.stat-tile__value').textContent).toContain('₹1,63,200');
  });

  it('renders the hint only when provided', () => {
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.stat-tile__hint')).toBeFalsy();

    hostFixture.componentInstance.hint = 'Updated today';
    hostFixture.detectChanges();
    const hint = hostFixture.nativeElement.querySelector('.stat-tile__hint');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toContain('Updated today');
  });

  it('applies the tone class', () => {
    hostFixture.componentInstance.tone = 'accent';
    hostFixture.detectChanges();
    const tile = hostFixture.nativeElement.querySelector('.stat-tile');
    expect(tile.classList.contains('stat-tile--accent')).toBeTrue();
  });

  it('renders content projected into the tile-editor slot', () => {
    hostFixture.detectChanges();
    const editor = hostFixture.nativeElement.querySelector('.stat-tile__editor');
    expect(editor.querySelector('button').textContent).toContain('Edit');
  });

  it('renders no icon by default, and does not apply the with-icon layout', () => {
    hostFixture.detectChanges();
    const el = hostFixture.nativeElement;
    expect(el.querySelector('.stat-tile__icon')).toBeFalsy();
    expect(el.querySelector('.stat-tile').classList.contains('stat-tile--with-icon')).toBeFalse();
  });

  it('renders the icon and switches to the with-icon layout when [icon] is bound', () => {
    hostFixture.componentInstance.icon = 'hourglass_top';
    hostFixture.detectChanges();
    const el = hostFixture.nativeElement;
    const icon = el.querySelector('.stat-tile__icon');
    expect(icon.textContent).toContain('hourglass_top');
    expect(el.querySelector('.stat-tile').classList.contains('stat-tile--with-icon')).toBeTrue();
  });

  it('applies warning/danger tone classes', () => {
    hostFixture.componentInstance.tone = 'warning';
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.stat-tile').classList.contains('stat-tile--warning')).toBeTrue();

    hostFixture.componentInstance.tone = 'danger';
    hostFixture.detectChanges();
    expect(hostFixture.nativeElement.querySelector('.stat-tile').classList.contains('stat-tile--danger')).toBeTrue();
  });
});
