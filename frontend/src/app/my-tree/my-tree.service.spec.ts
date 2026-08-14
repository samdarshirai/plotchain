import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MyTreeService } from './my-tree.service';
import { TreeNode } from '../admin/models/tree-node.model';

describe('MyTreeService', () => {
  let service: MyTreeService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [MyTreeService]
    });
    service = TestBed.inject(MyTreeService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own subtree at the default depth (3), with no associate id in the request', () => {
    const mockNode: TreeNode = {
      id: 'a1', userId: 'VP00001', name: 'Self', rankName: null, kycStatus: 'PENDING', position: null,
      leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
    };

    service.getMyTree().subscribe(res => expect(res).toEqual(mockNode));

    const req = httpMock.expectOne('/api/associates/me/tree?depth=3');
    expect(req.request.method).toBe('GET');
    req.flush(mockNode);
  });

  it('fetches at an explicitly requested depth', () => {
    service.getMyTree(1).subscribe();

    const req = httpMock.expectOne('/api/associates/me/tree?depth=1');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'a1', userId: 'VP00001', name: 'Self', rankName: null, kycStatus: 'PENDING', position: null,
      leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
    });
  });
});
