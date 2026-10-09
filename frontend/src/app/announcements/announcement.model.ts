export const ANNOUNCEMENT_TITLE_MAX = 300; // matches backend @Size(max = 300) / announcement.title VARCHAR(300)

// Mirrors backend AnnouncementResponse; audience is deliberately not exposed (spec Decision 2).
export interface Announcement { id: string; title: string; body: string; publishedAt: string; }
// Mirrors backend AnnouncementPageResponse (list field is "entries").
export interface AnnouncementPage { entries: Announcement[]; page: number; size: number; totalElements: number; }
export interface CreateAnnouncementRequest { title: string; body: string; }
