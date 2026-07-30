import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatTileComponent } from './stat-tile.component';

@Component({
  standalone: true,
  imports: [StatTileComponent],
  template: `
    <app-stat-tile [label]="label" [value]="value" [hint]="hint" [tone]="tone">
      <button tile-editor>Edit</button>
    </app-stat-tile>
  `
})
class HostComponent {
  label = 'Wallet balance';
  value = '₹1,63,200';
  hint?: string;
  tone: 'default' | 'accent' = 'default';
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
});
