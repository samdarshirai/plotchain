import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TreeNode } from '../models/tree-node.model';
import { TreeSearchResult } from '../models/tree-search.model';
import { TreeNodeDetails } from '../models/tree-node-details.model';

@Injectable({ providedIn: 'root' })
export class TreeExplorerService {
  private http = inject(HttpClient);

  companyTree(): Observable<TreeNode> {
    return this.http.get<TreeNode>('/api/admin/tree');
  }

  subtree(associateId: string): Observable<TreeNode> {
    return this.http.get<TreeNode>(`/api/admin/tree/${associateId}`);
  }

  search(userId: string): Observable<TreeSearchResult> {
    return this.http.get<TreeSearchResult>('/api/admin/tree/search', { params: new HttpParams().set('q', userId) });
  }

  nodeDetails(associateId: string): Observable<TreeNodeDetails> {
    return this.http.get<TreeNodeDetails>(`/api/admin/tree/${associateId}/details`);
  }
}
