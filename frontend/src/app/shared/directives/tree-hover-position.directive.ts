import { AfterViewInit, Directive, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, inject } from '@angular/core';

const VIEWPORT_MARGIN = 8;
const CARD_GAP = 12;

export function treeHoverPosition(
  anchor: Pick<DOMRect, 'left' | 'right' | 'top'>,
  popup: Pick<DOMRect, 'width' | 'height'>,
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const preferredLeft = anchor.right + CARD_GAP;
  const left = preferredLeft + popup.width <= viewport.width - VIEWPORT_MARGIN
    ? preferredLeft : anchor.left - CARD_GAP - popup.width;
  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(left, viewport.width - VIEWPORT_MARGIN - popup.width)),
    top: Math.max(VIEWPORT_MARGIN, Math.min(anchor.top, viewport.height - VIEWPORT_MARGIN - popup.height))
  };
}

/** Keeps a fixed popup beside its untransformed viewport anchor, including after async content arrives. */
@Directive({
  selector: '[appTreeHoverPosition]',
  standalone: true,
  host: {
    '(pointerdown)': '$event.stopPropagation()',
    '(wheel)': '$event.stopPropagation()'
  }
})
export class TreeHoverPositionDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) appTreeHoverPosition: HTMLElement | null = null;
  @Output() hoverPositionDismiss = new EventEmitter<void>();

  private element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private zone = inject(NgZone);
  private observer?: ResizeObserver;
  private dismiss = (event: Event) => {
    // Scrolling the popup itself must remain possible on short screens.
    if (event.type === 'scroll' && event.target instanceof Node && this.element.contains(event.target)) return;
    this.zone.run(() => this.hoverPositionDismiss.emit());
  };

  ngAfterViewInit(): void {
    this.position();
    this.zone.runOutsideAngular(() => {
      this.observer = new ResizeObserver(() => this.position());
      this.observer.observe(this.element);
      window.addEventListener('scroll', this.dismiss, true);
      window.addEventListener('resize', this.dismiss);
    });
  }

  ngOnChanges(): void {
    this.position();
  }

  private position(): void {
    if (!this.appTreeHoverPosition) return;
    const position = treeHoverPosition(
      this.appTreeHoverPosition.getBoundingClientRect(), this.element.getBoundingClientRect(),
      { width: document.documentElement.clientWidth, height: window.innerHeight }
    );
    this.element.style.left = `${position.left}px`;
    this.element.style.top = `${position.top}px`;
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    window.removeEventListener('scroll', this.dismiss, true);
    window.removeEventListener('resize', this.dismiss);
  }
}
