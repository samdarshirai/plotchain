import { TestBed } from '@angular/core/testing';
import { TemplateRef } from '@angular/core';
import { SetupInspectorService, SetupStepController } from './setup-inspector.service';

describe('SetupInspectorService', () => {
  let service: SetupInspectorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SetupInspectorService);
  });

  it('starts with no registered content and saved false', () => {
    let content: TemplateRef<unknown> | null = null;
    let saved = true;
    service.content$.subscribe(value => (content = value));
    service.saved$.subscribe(value => (saved = value));

    expect(content).toBeNull();
    expect(saved).toBeFalse();
  });

  it('emits the registered template to subscribers', () => {
    const template = {} as TemplateRef<unknown>;
    service.register(template);

    let content: TemplateRef<unknown> | null = null;
    service.content$.subscribe(value => (content = value));
    expect(content as TemplateRef<unknown> | null).toBe(template);
  });

  it('clears the registered template and resets saved back to false', () => {
    service.register({} as TemplateRef<unknown>);
    service.setSaved(true);
    service.clear();

    let content: TemplateRef<unknown> | null = {} as TemplateRef<unknown>;
    let saved = true;
    service.content$.subscribe(value => (content = value));
    service.saved$.subscribe(value => (saved = value));

    expect(content).toBeNull();
    expect(saved).toBeFalse();
  });

  it('propagates setSaved to saved$', () => {
    service.setSaved(true);

    let saved = false;
    service.saved$.subscribe(value => (saved = value));
    expect(saved).toBeTrue();
  });

  it('starts with no registered active step', () => {
    expect(service.activeStep).toBeNull();
  });

  it('exposes the most recently registered step as activeStep', () => {
    const step: SetupStepController = { flushPendingSave: () => {}, isStepValid: () => true };
    service.registerStep(step);
    expect(service.activeStep).toBe(step);
  });

  it('clears the active step on clear()', () => {
    service.registerStep({ flushPendingSave: () => {}, isStepValid: () => true });
    service.clear();
    expect(service.activeStep).toBeNull();
  });
});
