package com.plotchain.associate;

// role-capability unit 10 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Digital ID card" row -- Associate sees "Own ID card only (photo, ID number, rank, QR)").
//
// photoUrl is always null today: no photo-upload/storage mechanism exists anywhere in this
// codebase, and the spec's own "Own profile" row -- the one place that enumerates which fields
// an Associate can edit -- never mentions a photo either. See
// AssociateIdCardService#getMyIdCard's header comment for the full reasoning. Documented gap,
// not silently dropped: a future unit should revisit this once the spec describes how a photo
// actually gets set.
//
// qrPayload is the raw string a frontend renders into a QR code client-side (the associate's
// own userId), not image bytes -- no QR-image-generation dependency exists in this codebase and
// none is added by this unit.
public record AssociateIdCardResponse(
    String idNumber,
    String name,
    String rank,
    String photoUrl,
    String qrPayload
) {}
