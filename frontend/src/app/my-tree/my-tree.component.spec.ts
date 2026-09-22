import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { MyTreeComponent } from './my-tree.component';
import { TreeNode } from '../admin/models/tree-node.model';

describe('MyTreeComponent', () => {
  let fixture: ComponentFixture<MyTreeComponent>;
  let httpMock: HttpTestingController;

  const selfOnly: TreeNode = {
    id: 'a1', userId: 'VP00001', name: 'Self', rankName: null, kycStatus: 'PENDING', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
  };

  const nestedTree: TreeNode = {
    id: 'a1', userId: 'VP00001', name: 'Self', rankName: null, kycStatus: 'PENDING', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false,
    children: [
      {
        id: 'a2', userId: 'VP00002', name: 'Child', rankName: null, kycStatus: 'VERIFIED', position: 'L',
        leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false,
        children: [
          {
            id: 'a3', userId: 'VP00003', name: 'Grandchild', rankName: null, kycStatus: 'PENDING', position: 'L',
            leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false,
            children: []
          }
        ]
      }
    ]
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyTreeComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(MyTreeComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('loads its own subtree on init with no user action, and no associate id in the request', () => {
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/associates/me/tree?depth=3');
    expect(req.request.method).toBe('GET');
    req.flush(selfOnly);

    expect(fixture.componentInstance.root?.userId).toBe('VP00001');
  });

  it('tags the root card "You" instead of a search-result tag', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(selfOnly);
    fixture.detectChanges();

    const tag: HTMLElement | null = fixture.nativeElement.querySelector('.tree-explorer__result-tag');
    expect(tag?.textContent?.trim()).toBeTruthy();
    expect(fixture.componentInstance.meId).toBe('a1');
  });

  it('renders every level of a nested downline via the recursive node template', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    const nodeIdEls: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tree-explorer__node-id'));
    expect(nodeIdEls.map(el => el.textContent?.trim())).toEqual(['VP00001', 'VP00002', 'VP00003']);
  });

  it('shows vacant-slot cards for open L/R positions when there is no downline yet (the empty-downline state)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(selfOnly);
    fixture.detectChanges();

    const vacantEls = fixture.nativeElement.querySelectorAll('.tree-explorer__vacant-card');
    expect(vacantEls.length).toBe(2);
    expect(fixture.componentInstance.layout?.vacantCount).toBe(2);
  });

  it('shows stats-pill counts scoped to the loaded subtree', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    // nestedTree: 3 filled nodes (self/child/grandchild) + 4 vacant slots synthesized around
    // them (bounded by maxSlotDepth=3) = 7 total positions in the loaded subtree.
    const values: string[] = Array.from(fixture.nativeElement.querySelectorAll('.tree-explorer__stats-pill b'))
      .map((el: any) => el.textContent?.trim());
    expect(values).toEqual(['7', '3', '4']);
  });

  it('shows a load error when the fetch fails, without silently rendering an empty canvas', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.loadError).toBe(true);
    expect(fixture.componentInstance.root).toBeNull();
    expect(fixture.nativeElement.querySelector('app-inline-banner')).toBeTruthy();
  });

  it('searches within the downline and re-roots the tree at the match', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    fixture.componentInstance.searchQuery = 'Child';
    fixture.componentInstance.onSearch();

    httpMock.expectOne('/api/associates/me/tree/search?q=Child')
      .flush({ ancestorPath: [{ id: 'a2', userId: 'VP00002', name: 'Child' }] });
    httpMock.expectOne('/api/associates/me/tree/a2?depth=3').flush(nestedTree.children[0]);
    fixture.detectChanges();

    expect(fixture.componentInstance.root?.id).toBe('a2');
    // meId stays "a1" (the caller), even though the displayed root is now "a2" -- the reset
    // control's visibility and the "You" tag both depend on this staying put.
    expect(fixture.componentInstance.meId).toBe('a1');
  });

  it('shows a not-found banner when the search has no match in the downline', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(selfOnly);
    fixture.detectChanges();

    fixture.componentInstance.searchQuery = 'Nobody';
    fixture.componentInstance.onSearch();

    httpMock.expectOne('/api/associates/me/tree/search?q=Nobody').flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(fixture.componentInstance.notFound).toBe(true);
    expect(fixture.nativeElement.querySelector('app-inline-banner')).toBeTruthy();
  });

  it('onCardClick fills the search bar with that associate and re-roots at them', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    fixture.componentInstance.onCardClick(nestedTree.children[0]);

    httpMock.expectOne('/api/associates/me/tree/a2?depth=3').flush(nestedTree.children[0]);
    fixture.detectChanges();

    expect(fixture.componentInstance.searchQuery).toBe('VP00002');
    expect(fixture.componentInstance.root?.id).toBe('a2');
  });

  it('tapping a card in the DOM (pointerdown+pointerup, no drag) re-roots at that associate', () => {
    // Regression test: wrap.setPointerCapture() retargets the synthetic `click` event to
    // `wrap` itself, so a plain (click) binding on the card never fires -- this must go through
    // the real pointerdown/pointerup listeners attached to canvasWrap, not a direct method call,
    // or it would not have caught that bug. setPointerCapture is stubbed because headless
    // Chrome throws NotFoundError for a pointerId not tied to a real hardware pointer session.
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    const wrap: HTMLElement = fixture.nativeElement.querySelector('.tree-explorer__canvas-wrap');
    spyOn(wrap, 'setPointerCapture');
    const card: HTMLElement = fixture.nativeElement.querySelector('[data-associate-id="a2"]');
    expect(card).toBeTruthy();

    card.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }));
    card.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }));

    httpMock.expectOne('/api/associates/me/tree/a2?depth=3').flush(nestedTree.children[0]);
    fixture.detectChanges();

    expect(fixture.componentInstance.searchQuery).toBe('VP00002');
    expect(fixture.componentInstance.root?.id).toBe('a2');
  });

  it('a drag past the tap threshold does not re-root, so panning near a card stays panning', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    const wrap: HTMLElement = fixture.nativeElement.querySelector('.tree-explorer__canvas-wrap');
    spyOn(wrap, 'setPointerCapture');
    const card: HTMLElement = fixture.nativeElement.querySelector('[data-associate-id="a2"]');

    card.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, bubbles: true }));
    card.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 140, clientY: 100, bubbles: true }));

    httpMock.expectNone('/api/associates/me/tree/a2?depth=3');
    expect(fixture.componentInstance.root?.id).toBe('a1');
  });

  it('hovering a card past the debounce fires the details request and renders the tooltip', () => {
    jasmine.clock().install();
    try {
      fixture.detectChanges();
      httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
      fixture.detectChanges();

      const card: HTMLElement = fixture.nativeElement.querySelector('[data-associate-id="a2"]');
      card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      jasmine.clock().tick(150);

      const req = httpMock.expectOne('/api/associates/me/tree/a2/details');
      req.flush({
        name: 'Child', userId: 'VP00002', joinedAt: '2025-01-01T00:00:00Z',
        leftMemberId: null, rightMemberId: null,
        totalLeftMembers: 0, totalRightMembers: 0, activeLeftMembers: 0, activeRightMembers: 0,
        totalLeftBusiness: 0, totalRightBusiness: 0, totalSelfBusiness: 0
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.hoveredDetails?.userId).toBe('VP00002');
      expect(fixture.nativeElement.querySelector('.tree-explorer__hover-card')).toBeTruthy();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('leaving a card before the debounce elapses cancels the pending details request', () => {
    jasmine.clock().install();
    try {
      fixture.detectChanges();
      httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
      fixture.detectChanges();

      const card: HTMLElement = fixture.nativeElement.querySelector('[data-associate-id="a2"]');
      card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      card.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      jasmine.clock().tick(150);

      expect(fixture.componentInstance.hoveredNodeId).toBeNull();
      httpMock.expectNone('/api/associates/me/tree/a2/details');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('the "My Tree" reset control returns to the caller\'s own tree as root', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    fixture.componentInstance.onCardClick(nestedTree.children[0]);
    httpMock.expectOne('/api/associates/me/tree/a2?depth=3').flush(nestedTree.children[0]);
    fixture.detectChanges();

    fixture.componentInstance.resetToSelf();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(nestedTree);
    fixture.detectChanges();

    expect(fixture.componentInstance.root?.id).toBe('a1');
    expect(fixture.componentInstance.searchQuery).toBe('');
  });
});
