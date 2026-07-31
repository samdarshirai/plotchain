import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, TemplateRef, ViewChild } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { SetupInspectorAsideComponent } from './setup-inspector-aside.component';
import { SetupInspectorService } from './setup-inspector.service';

@Component({
  standalone: true,
  template: `<ng-template #tpl>custom preview content</ng-template>`
})
class TemplateHostComponent {
  @ViewChild('tpl') tpl!: TemplateRef<unknown>;
}

describe('SetupInspectorAsideComponent', () => {
  let fixture: ComponentFixture<SetupInspectorAsideComponent>;
  let inspectorService: SetupInspectorService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SetupInspectorAsideComponent, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(SetupInspectorAsideComponent);
    inspectorService = TestBed.inject(SetupInspectorService);
  });

  it('renders the default help card when no step has registered content', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-inspector-aside__help')).toBeTruthy();
  });

  it('renders the registered template instead of the default help card', () => {
    const hostFixture = TestBed.createComponent(TemplateHostComponent);
    hostFixture.detectChanges();
    inspectorService.register(hostFixture.componentInstance.tpl);

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.setup-inspector-aside__help')).toBeFalsy();
    expect(fixture.nativeElement.textContent).toContain('custom preview content');
  });
});
