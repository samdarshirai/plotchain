import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NewMessageComponent } from './new-message.component';

describe('NewMessageComponent', () => {
  let fixture: ComponentFixture<NewMessageComponent>;
  let httpMock: HttpTestingController;
  let component: NewMessageComponent;
  const URL = '/api/associates/me/support-tickets';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewMessageComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();
    fixture = TestBed.createComponent(NewMessageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  it('does not post when subject or message is blank', () => {
    component.form.setValue({ subject: '  ', description: 'x' });
    component.send();
    httpMock.expectNone(URL);
  });

  it('posts trimmed subject/message and navigates to /messages', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    component.form.setValue({ subject: ' Hi ', description: ' Need help ' });
    component.send();
    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ subject: 'Hi', description: 'Need help' });
    req.flush({});
    expect(navigate).toHaveBeenCalledWith(['/messages']);
  });

  it('shows an error and re-enables send on failure', () => {
    component.form.setValue({ subject: 'Hi', description: 'x' });
    component.send();
    httpMock.expectOne(URL).flush('', { status: 500, statusText: 'err' });
    expect(component.sendError).toBeTrue();
    expect(component.sending).toBeFalse();
  });
});
