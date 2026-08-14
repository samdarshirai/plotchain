// Mirrors AssociateIdCardResponse (backend/src/main/java/com/plotchain/associate/AssociateIdCardResponse.java,
// role-capability unit 10, merged a2fb675..568d59b). photoUrl is typed nullable because the
// backend always returns null today (no photo-upload mechanism exists anywhere in the codebase) --
// see DigitalIdCardComponent's photo-placeholder handling. qrPayload is a raw string (the
// associate's own userId), not image bytes -- no QR-image-generation dependency exists in this
// codebase and none is added by this unit.
export interface AssociateIdCard {
  idNumber: string;
  name: string;
  rank: string;
  photoUrl: string | null;
  qrPayload: string;
}
