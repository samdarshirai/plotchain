import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Wraps POST/GET/DELETE /api/associates/me/photo. The GET requires the Bearer token, which the
// auth interceptor only attaches to HttpClient requests -- a plain <img src="..."> tag bypasses
// it entirely and 401s. Fetching as a blob here (through HttpClient, so the interceptor applies)
// and handing the caller an object URL is the only way to display it -- same reasoning as
// ProjectsService.getThumbnailBlob.
@Injectable({ providedIn: 'root' })
export class AssociatePhotoService {
  constructor(private http: HttpClient) {}

  uploadPhoto(file: File): Observable<void> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<void>('/api/associates/me/photo', formData);
  }

  removePhoto(): Observable<void> {
    return this.http.delete<void>('/api/associates/me/photo');
  }

  getPhotoBlob(): Observable<Blob> {
    return this.http.get('/api/associates/me/photo', { responseType: 'blob' });
  }
}
