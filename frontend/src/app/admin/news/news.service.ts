import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface News {
  id: string;
  newsDate: string;
  title: string;
  body: string;
}

export type NewsRequest = Omit<News, 'id'>;

const BASE = '/api/admin/news';

@Injectable({ providedIn: 'root' })
export class NewsService {
  private http = inject(HttpClient);

  list(): Observable<News[]> {
    return this.http.get<News[]>(BASE);
  }

  create(request: NewsRequest): Observable<News> {
    return this.http.post<News>(BASE, request);
  }
}
