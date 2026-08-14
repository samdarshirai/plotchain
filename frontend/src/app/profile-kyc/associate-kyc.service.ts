import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AssociateKycStatusResponse, KycDocumentSummary } from './models/associate-kyc-status.model';

// Wraps GET /api/associates/me/kyc and POST /api/associates/me/kyc/documents/{documentType} only
// (role-capability unit 8) -- see this plan's Design decision 4 for why this is a separate
// service from AssociateProfileService rather than combined.
@Injectable({ providedIn: 'root' })
export class AssociateKycService {
  constructor(private http: HttpClient) {}

  getStatus(): Observable<AssociateKycStatusResponse> {
    return this.http.get<AssociateKycStatusResponse>('/api/associates/me/kyc');
  }

  // multipart/form-data, field name "file" -- matches KycSubmissionController's
  // @RequestParam("file") MultipartFile exactly. Content-Type header is left to the browser
  // (it sets the multipart boundary itself), same as BrandingService.uploadLogo.
  uploadDocument(documentType: string, file: File): Observable<KycDocumentSummary> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<KycDocumentSummary>(`/api/associates/me/kyc/documents/${documentType}`, formData);
  }
}
