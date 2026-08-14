import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TreeNode } from '../admin/models/tree-node.model';

const DEFAULT_DEPTH = 3;

// Self-scoped by construction on the backend (AssociateTreeController reads the associate id
// only from the JWT principal, role-capability unit 5) -- this service deliberately has no
// parameter for an associate id anywhere in its signature, so there is no way for a caller of
// this service to even attempt to request another associate's tree.
@Injectable({ providedIn: 'root' })
export class MyTreeService {
  private http = inject(HttpClient);

  getMyTree(depth: number = DEFAULT_DEPTH): Observable<TreeNode> {
    return this.http.get<TreeNode>('/api/associates/me/tree', { params: new HttpParams().set('depth', depth) });
  }
}
