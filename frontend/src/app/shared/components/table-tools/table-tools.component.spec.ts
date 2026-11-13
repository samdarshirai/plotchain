import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TableToolsComponent } from './table-tools.component';

@Component({
  standalone: true,
  imports: [TableToolsComponent],
  template: `<app-table-tools filename="t"></app-table-tools>
    <table><thead><tr><th>A</th><th data-no-export>Act</th></tr></thead><tbody><tr><td>1</td><td>x</td></tr></tbody></table>`,
})
class HostComponent {}

describe('TableToolsComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] }));

  it('renders four buttons', () => {
    const f = TestBed.createComponent(HostComponent); f.detectChanges();
    expect(f.nativeElement.querySelectorAll('.table-tools__btn').length).toBe(4);
  });

  it('copy puts the next table, minus no-export columns, on the clipboard as TSV', async () => {
    const write = jasmine.createSpy('writeText').and.resolveTo();
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText: write } as unknown as Clipboard);
    const f = TestBed.createComponent(HostComponent); f.detectChanges();
    f.nativeElement.querySelector('.table-tools__btn').click();
    await f.whenStable();
    expect(write).toHaveBeenCalledWith('A\n1');
  });

  it('shows an error when the export fails', async () => {
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText: () => Promise.reject(new Error('x')) } as unknown as Clipboard);
    const f = TestBed.createComponent(HostComponent); f.detectChanges();
    f.nativeElement.querySelector('.table-tools__btn').click();
    await f.whenStable(); f.detectChanges();
    expect(f.nativeElement.querySelector('.table-tools__error')).not.toBeNull();
  });
});
