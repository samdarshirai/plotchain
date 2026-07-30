import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SidePanelComponent } from './side-panel.component';

describe('SidePanelComponent', () => {
  let fixture: ComponentFixture<SidePanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidePanelComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(SidePanelComponent);
  });

  it('renders the aside regardless of open state', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside.side-panel')).toBeTruthy();

    fixture.componentInstance.open = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside.side-panel')).toBeTruthy();
  });

  it('toggles the side-panel--open class with open', () => {
    fixture.detectChanges();
    let aside = fixture.nativeElement.querySelector('aside.side-panel');
    expect(aside.classList.contains('side-panel--open')).toBeFalse();

    fixture.componentInstance.open = true;
    fixture.detectChanges();
    aside = fixture.nativeElement.querySelector('aside.side-panel');
    expect(aside.classList.contains('side-panel--open')).toBeTrue();
  });

  it('only puts the backdrop in the DOM when open', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side-panel__backdrop')).toBeFalsy();

    fixture.componentInstance.open = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.side-panel__backdrop')).toBeTruthy();
  });

  it('clicking the backdrop emits closed', () => {
    fixture.componentInstance.open = true;
    fixture.detectChanges();
    const spy = jasmine.createSpy('closed');
    fixture.componentInstance.closed.subscribe(spy);
    fixture.nativeElement.querySelector('.side-panel__backdrop').click();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
