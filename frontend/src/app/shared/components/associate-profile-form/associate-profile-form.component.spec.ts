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
