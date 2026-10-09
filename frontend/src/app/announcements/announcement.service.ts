import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Announcement, AnnouncementPage, CreateAnnouncementRequest } from './announcement.model';

@Injectable({ providedIn: 'root' })
export class AnnouncementService {
  private http = inject(HttpClient);

  list(page: number, size: number): Observable<AnnouncementPage> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<AnnouncementPage>('/api/announcements', { params });
  }

  publish(req: CreateAnnouncementRequest): Observable<Announcement> {
    return this.http.post<Announcement>('/api/admin/announcements', req);
  }
}
