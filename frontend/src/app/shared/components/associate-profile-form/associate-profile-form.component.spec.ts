import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateProfileFormComponent } from './associate-profile-form.component';

describe('AssociateProfileFormComponent lockedFields', () => {
  function create(lockedFields: string[]) {
    TestBed.configureTestingModule({ imports: [AssociateProfileFormComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(AssociateProfileFormComponent);
    fixture.componentInstance.lockedFields = lockedFields;
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('disables only the locked controls and still reports their values', () => {
    const c = create(['name', 'panNumber']);
    c.form.patchValue({ name: 'Jane', panNumber: 'ABCDE1234F', phone: '9876543210' });
    expect(c.form.controls.name.disabled).toBeTrue();
    expect(c.form.controls.panNumber.disabled).toBeTrue();
    expect(c.form.controls.phone.enabled).toBeTrue();
    expect(c.form.getRawValue().name).toBe('Jane');
  });

  it('locks nothing by default', () => {
    const c = create([]);
    expect(c.form.controls.name.enabled).toBeTrue();
  });
});

describe('AssociateProfileFormComponent placement', () => {
  const a = (userId: string, freeLegs: string[]) =>
    ({ id: 'id-' + userId, userId, name: userId, role: 'ASSOCIATE', status: 'ACTIVE', hasFreeSlot: !!freeLegs.length, hasEpin: false, freeLegs } as const);

  function create() {
    TestBed.configureTestingModule({ imports: [AssociateProfileFormComponent, TranslateModule.forRoot()] });
    const fixture = TestBed.createComponent(AssociateProfileFormComponent);
    const c = fixture.componentInstance;
    c.placementAssociates = [a('VP1', ['L']), a('VP2', ['L', 'R']), a('VP3', [])] as never;
    fixture.detectChanges();
    return c;
  }

  it('offers only associates with a free leg; placement optional, position required', () => {
    const c = create();
    expect(c.placementOptions.map(o => o.userId)).toEqual(['VP1', 'VP2']);
    expect(c.form.controls.placementUserId.hasError('required')).toBeFalse();
    expect(c.form.controls.position.hasError('required')).toBeTrue();
  });

  it('auto-fills the single free leg and lets the admin pick when both are free', () => {
    const c = create();
    c.onPlacement(c.placementOptions[0]);
    expect(c.form.controls.position.value).toBe('L');
    expect(c.legAllowed('R')).toBeFalse();
    c.onPlacement(c.placementOptions[1]);
    expect(c.form.controls.position.value).toBe('');
    expect(c.legAllowed('R')).toBeTrue();
  });
});
