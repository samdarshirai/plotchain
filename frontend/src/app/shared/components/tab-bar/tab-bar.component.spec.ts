import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabBarComponent } from './tab-bar.component';

describe('TabBarComponent', () => {
  let fixture: ComponentFixture<TabBarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabBarComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(TabBarComponent);
    fixture.componentInstance.tabs = [
      { id: 'plot-list', label: 'Plot List' },
      { id: 'import-csv', label: 'Import CSV' }
    ];
  });

  it('renders one tab per definition', () => {
    fixture.detectChanges();
    const tabs = fixture.nativeElement.querySelectorAll('.tab-bar__tab');
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('Plot List');
    expect(tabs[1].textContent).toContain('Import CSV');
  });

  it('sets role and aria-selected attributes correctly', () => {
    fixture.componentInstance.activeTabId = 'import-csv';
    fixture.detectChanges();
    const tablist = fixture.nativeElement.querySelector('.tab-bar');
    expect(tablist.getAttribute('role')).toBe('tablist');
    const tabs = fixture.nativeElement.querySelectorAll('.tab-bar__tab');
    expect(tabs[0].getAttribute('role')).toBe('tab');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('clicking a tab emits tabChange with its id', () => {
    fixture.detectChanges();
    const spy = jasmine.createSpy('tabChange');
    fixture.componentInstance.tabChange.subscribe(spy);
    const tabs = fixture.nativeElement.querySelectorAll('.tab-bar__tab');
    tabs[1].click();
    expect(spy).toHaveBeenCalledWith('import-csv');
  });
});
