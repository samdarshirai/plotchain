import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TreeExplorerComponent } from './tree-explorer.component';
import { TreeNode } from '../models/tree-node.model';

describe('TreeExplorerComponent', () => {
  let fixture: ComponentFixture<TreeExplorerComponent>;
  let httpMock: HttpTestingController;

  const rootNode = {
    id: 'a1', userId: 'VP00001', name: 'Root', rankName: null, kycStatus: 'PENDING', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
  };

  const companyRoot: TreeNode = {
    id: 'admin', userId: 'admin', name: 'Administrator', rankName: null, kycStatus: 'VERIFIED', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
  };

  const nestedTree: TreeNode = {
    id: 'a1', userId: 'VP00001', name: 'Root', rankName: null, kycStatus: 'PENDING', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false,
    children: [
      {
        id: 'a2', userId: 'VP00002', name: 'Child', rankName: null, kycStatus: 'PENDING', position: 'L',
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
      imports: [TreeExplorerComponent, HttpClientTestingModule, TranslateModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(TreeExplorerComponent);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // The component auto-loads the whole company tree on init, and always mounts the (always-
  // present, not *ngIf-gated) New Associate panel which fetches its own sponsor list. Every test
  // that calls detectChanges() must resolve both requests first; this helper does it.
  function initWithCompanyTree(node: TreeNode | null = companyRoot): void {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates').flush([]);
    const req = httpMock.expectOne('/api/admin/tree?depth=5');
    if (node) {
      req.flush(node);
    } else {
      req.flush(null, { status: 500, statusText: 'Server Error' });
    }
  }

  it('auto-loads the whole company tree on init, rooted at the founding admin', () => {
    initWithCompanyTree();

    expect(fixture.componentInstance.root?.userId).toBe('admin');
    // The default root is not a search result -- it must not carry the highlight/tag.
    expect(fixture.componentInstance.highlightedNodeId).toBeNull();
  });

  it('shows a load error when the initial company-tree fetch fails', () => {
    initWithCompanyTree(null);

    expect(fixture.componentInstance.loadError).toBe(true);
    expect(fixture.componentInstance.root).toBeNull();
  });

  it('loads a subtree when searching by exact userId, and tags it as the result', () => {
    initWithCompanyTree();

    fixture.componentInstance.searchQuery = 'VP00001';
    fixture.componentInstance.onSearch();

    const searchReq = httpMock.expectOne('/api/admin/tree/search?q=VP00001');
    searchReq.flush({ ancestorPath: [{ id: 'a1', userId: 'VP00001', name: 'Root' }] });

    const subtreeReq = httpMock.expectOne('/api/admin/tree/a1?depth=3');
    subtreeReq.flush(rootNode);

    expect(fixture.componentInstance.root?.userId).toBe('VP00001');
    expect(fixture.componentInstance.highlightedNodeId).toBe('a1');
  });

  it('renders every level of a nested tree via the recursive node template', () => {
    initWithCompanyTree();

    fixture.componentInstance.root = nestedTree;
    fixture.detectChanges();

    const nodeIdEls: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tree-explorer__node-id'));
    expect(nodeIdEls.length).toBe(3);
    expect(nodeIdEls.map(el => el.textContent?.trim())).toEqual(['VP00001', 'VP00002', 'VP00003']);
  });

  it('shows stats-pill counts scoped to the loaded subtree, not a whole-downline total', () => {
    initWithCompanyTree();

    fixture.componentInstance.root = nestedTree;
    fixture.detectChanges();

    const values: string[] = Array.from(fixture.nativeElement.querySelectorAll('.tree-explorer__stats-pill b'))
      .map((el: any) => el.textContent?.trim());

    // nestedTree: 3 filled nodes (root/child/grandchild) + 4 vacant slots synthesized
    // around them (bounded by maxSlotDepth=3) = 7 total positions in the loaded subtree.
    expect(values).toEqual(['7', '3', '4']);
  });

  it('renders one vacant-card per vacant slot in the loaded subtree', () => {
    initWithCompanyTree();

    fixture.componentInstance.root = nestedTree;
    fixture.detectChanges();

    const vacantEls = fixture.nativeElement.querySelectorAll('.tree-explorer__vacant-card');
    expect(vacantEls.length).toBe(fixture.componentInstance.layout?.vacantCount);
    expect(vacantEls.length).toBe(4);
  });

  it('shows a load error when the search succeeds but the subtree fetch fails', () => {
    initWithCompanyTree();

    fixture.componentInstance.searchQuery = 'VP00001';
    fixture.componentInstance.onSearch();

    const searchReq = httpMock.expectOne('/api/admin/tree/search?q=VP00001');
    searchReq.flush({ ancestorPath: [{ id: 'a1', userId: 'VP00001', name: 'Root' }] });

    const subtreeReq = httpMock.expectOne('/api/admin/tree/a1?depth=3');
    subtreeReq.flush(null, { status: 500, statusText: 'Server Error' });

    expect(fixture.componentInstance.loadError).toBe(true);
    expect(fixture.componentInstance.root).toBeNull();
  });

  it('renders vacant cards as real buttons that open the New Associate panel preset to their parent', () => {
    initWithCompanyTree();

    fixture.componentInstance.root = nestedTree;
    fixture.detectChanges();

    const vacantButton: HTMLButtonElement = fixture.nativeElement.querySelector('.tree-explorer__vacant-card');
    expect(vacantButton.tagName).toBe('BUTTON');
    vacantButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.panelOpen).toBeTrue();
    expect(fixture.componentInstance.presetParent).not.toBeNull();
    expect(['a1', 'a2', 'a3']).toContain(fixture.componentInstance.presetParent!.parentId);
    expect(['L', 'R']).toContain(fixture.componentInstance.presetParent!.leg);
  });

  it('hovering a card past the debounce fires the details request and renders the tooltip', () => {
    jasmine.clock().install();
    try {
      initWithCompanyTree();
      fixture.componentInstance.root = nestedTree;
      fixture.detectChanges();

      const card: HTMLElement = fixture.nativeElement.querySelector('.tree-explorer__node-card');
      card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      jasmine.clock().tick(150);

      const req = httpMock.expectOne('/api/admin/tree/a1/details');
      req.flush({
        name: 'Root', userId: 'VP00001', joinedAt: '2025-01-01T00:00:00Z',
        leftMemberId: 'VP00002', rightMemberId: null,
        totalLeftMembers: 4, totalRightMembers: 0, activeLeftMembers: 3, activeRightMembers: 0,
        totalLeftBusiness: 50000, totalRightBusiness: 0, totalSelfBusiness: 12000
      });
      fixture.detectChanges();

      expect(fixture.componentInstance.hoveredDetails?.userId).toBe('VP00001');
      expect(fixture.nativeElement.querySelector('.tree-explorer__hover-card')).toBeTruthy();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('leaving a card before the debounce elapses cancels the pending details request', () => {
    jasmine.clock().install();
    try {
      initWithCompanyTree();
      fixture.componentInstance.root = nestedTree;
      fixture.detectChanges();

      const card: HTMLElement = fixture.nativeElement.querySelector('.tree-explorer__node-card');
      card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      card.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      jasmine.clock().tick(150);

      expect(fixture.componentInstance.hoveredNodeId).toBeNull();
      // No request should have fired at all -- afterEach's httpMock.verify() would also catch
      // an unexpected outstanding request here, but this is explicit about what's being proven.
      httpMock.expectNone('/api/admin/tree/a1/details');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('hovering a vacant card does not trigger a details request', () => {
    jasmine.clock().install();
    try {
      initWithCompanyTree();
      fixture.componentInstance.root = nestedTree;
      fixture.detectChanges();

      const vacantCard: HTMLElement = fixture.nativeElement.querySelector('.tree-explorer__vacant-card');
      vacantCard.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      jasmine.clock().tick(150);

      expect(fixture.componentInstance.hoveredNodeId).toBeNull();
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('reloads the current root in the background when the panel emits created, without closing it early', () => {
    initWithCompanyTree();

    fixture.componentInstance.openNewAssociatePanel({
      vacant: true, depth: 1, leg: 'L', x: 0, id: 'vacant-1-1',
      parentId: 'admin', parentUserId: 'admin', parentName: 'Administrator'
    });
    fixture.componentInstance.onAssociateCreated();

    // The panel stays open so the admin can see the success/temporary-password screen; it
    // closes only when they click "Done" (which emits `closed` -> closeNewAssociatePanel()).
    expect(fixture.componentInstance.panelOpen).toBeTrue();
    httpMock.expectOne('/api/admin/tree?depth=5').flush(companyRoot);

    fixture.componentInstance.closeNewAssociatePanel();
    expect(fixture.componentInstance.panelOpen).toBeFalse();
  });
});
