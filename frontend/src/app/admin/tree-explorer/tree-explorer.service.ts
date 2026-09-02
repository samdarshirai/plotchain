import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TreeNode } from '../models/tree-node.model';
import { TreeSearchResult } from '../models/tree-search.model';

@Injectable({ providedIn: 'root' })
export class TreeExplorerService {
  private http = inject(HttpClient);

  companyTree(depth: number): Observable<TreeNode> {
    return this.http.get<TreeNode>('/api/admin/tree', { params: new HttpParams().set('depth', depth) });
  }

  subtree(associateId: string, depth: number): Observable<TreeNode> {
    return this.http.get<TreeNode>(`/api/admin/tree/${associateId}`, { params: new HttpParams().set('depth', depth) });
  }

  search(userId: string): Observable<TreeSearchResult> {
    return this.http.get<TreeSearchResult>('/api/admin/tree/search', { params: new HttpParams().set('q', userId) });
  }
}
