import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { TreeExplorerComponent } from './tree-explorer.component';

describe('TreeExplorerComponent', () => {
  let fixture: ComponentFixture<TreeExplorerComponent>;
  let httpMock: HttpTestingController;

  const rootNode = {
    id: 'a1', userId: 'VP00001', name: 'Root', rankName: null, kycStatus: 'PENDING', position: null,
    leftLegVolume: 0, rightLegVolume: 0, skewedLegsFlag: false, stagnantFlag: false, children: []
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
});
