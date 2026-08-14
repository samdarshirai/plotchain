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
    expect(fixture.componentInstance.selfNodeId).toBe('a1');
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

  it('renders no search input and no associate-id control (view-only, self-scoped only)', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/associates/me/tree?depth=3').flush(selfOnly);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('input')).toBeFalsy();
  });
});
