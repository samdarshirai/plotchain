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
  });

  afterEach(() => httpMock.verify());

  it('does nothing on init until a root is searched', () => {
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectNone(() => true);
    expect(fixture.componentInstance.root).toBeNull();
  });

  it('loads a subtree when searching by exact userId', () => {
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    fixture.componentInstance.searchQuery = 'VP00001';
    fixture.componentInstance.onSearch();

    const searchReq = httpMock.expectOne('/api/admin/tree/search?q=VP00001');
    searchReq.flush({ ancestorPath: [{ id: 'a1', userId: 'VP00001', name: 'Root' }] });

    const subtreeReq = httpMock.expectOne('/api/admin/tree/a1?depth=3');
    subtreeReq.flush(rootNode);

    expect(fixture.componentInstance.root?.userId).toBe('VP00001');
  });

  it('renders every level of a nested tree via the recursive node template', () => {
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    fixture.componentInstance.root = nestedTree;
    fixture.detectChanges();

    const nodeIdEls: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('.tree-explorer__node-id'));
    expect(nodeIdEls.length).toBe(3);
    expect(nodeIdEls.map(el => el.textContent?.trim())).toEqual(['VP00001', 'VP00002', 'VP00003']);
  });

  it('shows a load error when the search succeeds but the subtree fetch fails', () => {
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

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
