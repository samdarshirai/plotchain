import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TreeNode } from '../admin/models/tree-node.model';
import { TreeSearchResult } from '../admin/models/tree-search.model';

const DEFAULT_DEPTH = 3;

// The caller (self) is always resolved server-side from the JWT principal, never passed as a
// parameter here -- this service has no way to request another associate's tree as "me". The
// `subtree`/`search` methods below re-root or search *within* that same self-scoped backend
// route (`/api/associates/me/tree/...`), which independently enforces that the target is in the
// caller's own downline (AssociateTreeController.mySubtree/mySearch) -- they are not an escape
// hatch to request an arbitrary associate's tree, unlike the admin TreeExplorerService.
@Injectable({ providedIn: 'root' })
export class MyTreeService {
  private http = inject(HttpClient);

  getMyTree(depth: number = DEFAULT_DEPTH): Observable<TreeNode> {
    return this.http.get<TreeNode>('/api/associates/me/tree', { params: new HttpParams().set('depth', depth) });
  }

  subtree(associateId: string, depth: number = DEFAULT_DEPTH): Observable<TreeNode> {
    return this.http.get<TreeNode>(`/api/associates/me/tree/${associateId}`, { params: new HttpParams().set('depth', depth) });
  }

  search(q: string): Observable<TreeSearchResult> {
    return this.http.get<TreeSearchResult>('/api/associates/me/tree/search', { params: new HttpParams().set('q', q) });
  }
}
