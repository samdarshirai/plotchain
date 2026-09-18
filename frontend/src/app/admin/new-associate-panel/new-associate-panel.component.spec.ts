import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { NewAssociatePanelComponent } from './new-associate-panel.component';

describe('NewAssociatePanelComponent', () => {
  let fixture: ComponentFixture<NewAssociatePanelComponent>;
  let httpMock: HttpTestingController;

  function open(): void {
    fixture.componentInstance.open = true;
    fixture.componentInstance.ngOnChanges({ open: {} as any });
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewAssociatePanelComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(NewAssociatePanelComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/associates')
      .flush([{ id: 'sponsor-1', userId: 'VP00002', name: 'Sunil Sponsor', role: 'ASSOCIATE', hasFreeSlot: true }]);
  });

  afterEach(() => httpMock.verify());

  describe('free mode (no presetParent)', () => {
    it('does not submit when required fields are blank', () => {
      open();

      fixture.componentInstance.onProvisionSubmit();

      httpMock.expectNone('/api/associates');
      expect(fixture.componentInstance.provisionForm.invalid).toBeTrue();
    });

    it('only offers associates with a free slot in the Parent Node dropdown', () => {
      open();
      fixture.componentInstance.sponsorOptions = [
        { id: 'free-1', userId: 'VP00010', name: 'Has Room', role: 'ASSOCIATE', hasFreeSlot: true },
        { id: 'full-1', userId: 'VP00011', name: 'Fully Placed', role: 'ASSOCIATE', hasFreeSlot: false }
      ];
      fixture.detectChanges();

      const options: string[] = Array.from(
        fixture.nativeElement.querySelectorAll('select[formControlName="parentId"] option')
      )
        .map((el: any) => el.value)
        .filter((v: string) => v);

      expect(options).toEqual(['free-1']);
    });

    it('resolves the typed sponsor search text to the matching associate id', () => {
      open();
      fixture.componentInstance.sponsorOptions = [
        { id: 'sponsor-1', userId: 'VP00002', name: 'Sunil Sponsor', role: 'ASSOCIATE', hasFreeSlot: true }
      ];

      fixture.componentInstance.onSponsorSearchInput('VP00002 — Sunil Sponsor');
      expect(fixture.componentInstance.selectedSponsorId).toBe('sponsor-1');

      fixture.componentInstance.onSponsorSearchInput('not a real match');
      expect(fixture.componentInstance.selectedSponsorId).toBeNull();
    });

    it('submits name/email/phone/sponsorId plus the mandatory parent and placement, and shows the temporary password on success', () => {
      open();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '+919876500000',
        sponsorSearch: 'VP00002 — Sunil Sponsor',
        parentId: 'a1',
        position: 'L'
      });
      fixture.componentInstance.selectedSponsorId = 'sponsor-1';

      let created: any = null;
      fixture.componentInstance.created.subscribe(response => (created = response));
      fixture.componentInstance.onProvisionSubmit();

      const req = httpMock.expectOne('/api/associates');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '+919876500000',
        sponsorId: 'sponsor-1',
        parentId: 'a1',
        position: 'L'
      });
      req.flush({ associateId: 'new-id', userId: 'VP00099', temporaryPassword: 'Temp1234!' });

      expect(fixture.componentInstance.provisioned?.temporaryPassword).toBe('Temp1234!');
      expect(created.temporaryPassword).toBe('Temp1234!');

      let closed = false;
      fixture.componentInstance.closed.subscribe(() => (closed = true));
      fixture.componentInstance.finishProvisioning();
      expect(closed).toBeTrue();
    });

    it('shows a taken-email message on a 409 conflict instead of silently doing nothing', () => {
      open();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '',
        sponsorSearch: '',
        parentId: 'a1',
        position: 'L'
      });

      fixture.componentInstance.onProvisionSubmit();

      const req = httpMock.expectOne('/api/associates');
      req.flush({ error: 'Email already registered' }, { status: 409, statusText: 'Conflict' });

      expect(fixture.componentInstance.provisionSubmitError).toBeTruthy();
      expect(fixture.componentInstance.provisioned).toBeNull();
    });

    it('does not submit until a parent node and a placement position are chosen', () => {
      open();
      fixture.componentInstance.provisionForm.patchValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com'
      });

      expect(fixture.componentInstance.provisionForm.invalid).toBeTrue();
      fixture.componentInstance.onProvisionSubmit();
      httpMock.expectNone('/api/associates');

      fixture.componentInstance.provisionForm.patchValue({ parentId: 'a1' });
      fixture.componentInstance.onPlacementSelect('R');

      expect(fixture.componentInstance.provisionForm.invalid).toBeFalse();
      fixture.componentInstance.onProvisionSubmit();
      httpMock
        .expectOne('/api/associates')
        .flush({ associateId: 'new-id', userId: 'VP00099', temporaryPassword: 'Temp1234!' });
    });

    it('maps a 409 "Placement already occupied" conflict to an error message', () => {
      open();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '',
        sponsorSearch: '',
        parentId: 'a1',
        position: 'L'
      });

      fixture.componentInstance.onProvisionSubmit();

      httpMock
        .expectOne('/api/associates')
        .flush({ error: 'Placement already occupied' }, { status: 409, statusText: 'Conflict' });

      expect(fixture.componentInstance.provisionSubmitError).toBeTruthy();
    });

    it('blocks submit and flags the field when the sponsor text matches no associate', () => {
      open();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '',
        sponsorSearch: 'Sunil Spons',
        parentId: 'a1',
        position: 'L'
      });
      fixture.componentInstance.onSponsorSearchInput('Sunil Spons');
      expect(fixture.componentInstance.selectedSponsorId).toBeNull();

      fixture.componentInstance.onProvisionSubmit();

      httpMock.expectNone('/api/associates');
      expect(fixture.componentInstance.sponsorUnresolved).toBeTrue();
      expect(fixture.componentInstance.sponsorFieldError()).toBeTruthy();
    });

    it('still allows submit with a blank sponsor field (sponsor is optional)', () => {
      open();
      fixture.componentInstance.provisionForm.setValue({
        name: 'Aditya Kumar',
        email: 'aditya@example.com',
        phone: '',
        sponsorSearch: '   ',
        parentId: 'a1',
        position: 'L'
      });

      fixture.componentInstance.onProvisionSubmit();

      const req = httpMock.expectOne('/api/associates');
      expect(req.request.body.sponsorId).toBeUndefined();
      expect(fixture.componentInstance.sponsorUnresolved).toBeFalse();
      req.flush({ associateId: 'new-id', userId: 'VP00099', temporaryPassword: 'Temp1234!' });
    });

    it('clears the unresolved-sponsor error once the field is edited again', () => {
      open();
      fixture.componentInstance.sponsorUnresolved = true;

      fixture.componentInstance.onSponsorSearchInput('VP00002 — Sunil Sponsor');

      expect(fixture.componentInstance.sponsorUnresolved).toBeFalse();
      expect(fixture.componentInstance.sponsorFieldError()).toBeUndefined();
    });
  });

  describe('preset mode (opened from a Tree Explorer vacant slot)', () => {
    beforeEach(() => {
      fixture.componentInstance.presetParent = { parentId: 'p1', leg: 'R', parentUserId: 'VP00050', parentName: 'Ravi Root' };
    });

    it('pre-fills parentId/position from presetParent and hides the parent dropdown and placement toggle', () => {
      open();
      fixture.detectChanges();

      expect(fixture.componentInstance.provisionForm.value.parentId).toBe('p1');
      expect(fixture.componentInstance.provisionForm.value.position).toBe('R');
      expect(fixture.nativeElement.querySelector('select[formControlName="parentId"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('app-toggle-group')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('VP00050');
    });

    it('submits with the preset parentId/position without requiring a dropdown selection', () => {
      open();
      fixture.componentInstance.provisionForm.patchValue({ name: 'Aditya Kumar', email: 'aditya@example.com' });

      fixture.componentInstance.onProvisionSubmit();

      const req = httpMock.expectOne('/api/associates');
      expect(req.request.body.parentId).toBe('p1');
      expect(req.request.body.position).toBe('R');
      req.flush({ associateId: 'new-id', userId: 'VP00099', temporaryPassword: 'Temp1234!' });
    });
  });
});
