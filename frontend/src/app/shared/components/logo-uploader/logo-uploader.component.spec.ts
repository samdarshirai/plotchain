import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LogoUploaderComponent } from './logo-uploader.component';

describe('LogoUploaderComponent', () => {
  let fixture: ComponentFixture<LogoUploaderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogoUploaderComponent]
    }).compileComponents();
    fixture = TestBed.createComponent(LogoUploaderComponent);
    fixture.componentInstance.uploadLabel = 'Upload';
    fixture.componentInstance.changeLabel = 'Change';
    fixture.detectChanges();
  });

  function fileInput(): HTMLInputElement {
    return fixture.nativeElement.querySelector('.logo-uploader__input');
  }

  function fakeChangeEvent(file: File | null): Event {
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: file ? [file] : [], configurable: true });
    return { target: input } as unknown as Event;
  }

  it('shows the Upload label when no logo is present', () => {
    const button = fixture.nativeElement.querySelector('.logo-uploader__action');
    expect(button.textContent.trim()).toBe('Upload');
  });

  it('shows the Change label when a logo is present', () => {
    fixture.componentInstance.hasLogo = true;
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.logo-uploader__action');
    expect(button.textContent.trim()).toBe('Change');
  });

  it('emits the selected file', () => {
    const spy = jasmine.createSpy('fileSelected');
    fixture.componentInstance.fileSelected.subscribe(spy);
    const file = new File(['data'], 'logo.png', { type: 'image/png' });

    fixture.componentInstance.onFileSelected(fakeChangeEvent(file));

    expect(spy).toHaveBeenCalledWith(file);
  });

  it('resets the native input value after a selection so the same filename can be re-picked', () => {
    const file = new File(['data'], 'logo.png', { type: 'image/png' });
    const event = fakeChangeEvent(file);

    fixture.componentInstance.onFileSelected(event);

    expect((event.target as HTMLInputElement).value).toBe('');
  });

  it('does not emit when no file is selected', () => {
    const spy = jasmine.createSpy('fileSelected');
    fixture.componentInstance.fileSelected.subscribe(spy);

    fixture.componentInstance.onFileSelected(fakeChangeEvent(null));

    expect(spy).not.toHaveBeenCalled();
  });
});
