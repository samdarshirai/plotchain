import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

// Wraps a password <input> with the same eye show/hide toggle as the login screen; the input
// stays masked by default and keeps its own form binding untouched.
@Directive({ selector: 'input[appPasswordToggle]', standalone: true })
export class PasswordToggleDirective implements OnInit, OnDestroy {
  private input = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private translate = inject(TranslateService);
  private wrapper?: HTMLSpanElement;

  ngOnInit(): void {
    const input = this.input;
    const wrapper = (this.wrapper = document.createElement('span'));
    wrapper.className = 'password-toggle-field';
    input.parentNode?.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle-btn';
    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    button.appendChild(icon);
    wrapper.appendChild(button);

    const render = () => {
      const shown = input.type === 'text';
      icon.textContent = shown ? 'visibility_off' : 'visibility';
      button.setAttribute('aria-label', this.translate.instant(shown ? 'auth.hidePassword' : 'auth.showPassword'));
    };
    button.addEventListener('click', () => {
      input.type = input.type === 'text' ? 'password' : 'text';
      render();
    });
    render();
  }

  ngOnDestroy(): void {
    this.wrapper?.remove();
  }
}
