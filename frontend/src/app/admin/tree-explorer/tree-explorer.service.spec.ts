import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TreeExplorerService } from './tree-explorer.service';
import { TreeNode } from '../models/tree-node.model';
import { TreeSearchResult } from '../models/tree-search.model';

describe('TreeExplorerService', () => {
  let service: TreeExplorerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [TreeExplorerService]
    });
    service = TestBed.inject(TreeExplorerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches a subtree', () => {
    const mockNode: TreeNode = {
      id: 'a1', userId: 'VP00001', name: 'Root', rankName: null, kycStatus: 'PENDING', position: null,
      leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
    };

    service.subtree('a1').subscribe(res => expect(res).toEqual(mockNode));

    const req = httpMock.expectOne('/api/admin/tree/a1');
    expect(req.request.method).toBe('GET');
    req.flush(mockNode);
  });

  it('fetches the whole company tree', () => {
    const mockNode: TreeNode = {
      id: 'admin', userId: 'admin', name: 'Administrator', rankName: null, kycStatus: 'VERIFIED', position: null,
      leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
    };

    service.companyTree().subscribe(res => expect(res).toEqual(mockNode));

    const req = httpMock.expectOne('/api/admin/tree');
    expect(req.request.method).toBe('GET');
    req.flush(mockNode);
  });

  it('searches by exact userId', () => {
    const mockResult: TreeSearchResult = { ancestorPath: [{ id: 'a1', userId: 'VP00001', name: 'Root' }] };

    service.search('VP00001').subscribe(res => expect(res).toEqual(mockResult));

    const req = httpMock.expectOne('/api/admin/tree/search?q=VP00001');
    expect(req.request.method).toBe('GET');
    req.flush(mockResult);
  });
});
