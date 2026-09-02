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

  // The component auto-loads the whole company tree on init. Every test that calls
  // detectChanges() must resolve that request first; this helper does it.
  function initWithCompanyTree(node: TreeNode | null = companyRoot): void {
    fixture.detectChanges();
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
});
