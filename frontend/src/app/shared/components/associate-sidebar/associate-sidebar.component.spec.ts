import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateSidebarComponent } from './associate-sidebar.component';

describe('AssociateSidebarComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        AssociateSidebarComponent,
        HttpClientTestingModule,
        RouterTestingModule.withRoutes([]),
        TranslateModule.forRoot()
      ]
    }).compileComponents();
  });

  it('is pinned and expanded by default, showing nav labels', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.associate-sidebar--expanded')).toBeTruthy();
    expect(compiled.querySelectorAll('.associate-sidebar__link-label').length).toBe(7);
  });

  it('collapses to an icon rail and emits pinnedChange when unpinned', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    let emitted: boolean | undefined;
    component.pinnedChange.subscribe((value: boolean) => (emitted = value));

    component.togglePin();
    fixture.detectChanges();

    expect(emitted).toBe(false);
    expect(component.pinned).toBe(false);
    expect(component.expanded).toBe(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.associate-sidebar--expanded')).toBeFalsy();
    expect(compiled.querySelectorAll('.associate-sidebar__link-label').length).toBe(0);
  });

  it('peeks expanded on hover while unpinned, without re-pinning', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    const component = fixture.componentInstance;
    component.togglePin();
    fixture.detectChanges();

    component.onEnter();
    fixture.detectChanges();

    expect(component.expanded).toBe(true);
    expect(component.pinned).toBe(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.associate-sidebar--expanded')).toBeTruthy();

    component.onLeave();
    fixture.detectChanges();
    expect(component.expanded).toBe(false);
  });

  it('emits logout when the Log Out control is clicked', () => {
    const fixture = TestBed.createComponent(AssociateSidebarComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    let logoutEmitted = false;
    component.logout.subscribe(() => (logoutEmitted = true));

    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('.associate-sidebar__logout') as HTMLButtonElement).click();

    expect(logoutEmitted).toBe(true);
  });
});
