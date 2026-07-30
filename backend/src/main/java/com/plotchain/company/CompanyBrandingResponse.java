package com.plotchain.company;

import java.time.Instant;

// Never carries raw logo bytes -- those are only ever fetched through the dedicated
// GET /api/company/branding/logo/{variant} endpoint. hasSquareLogo/hasWideLogo are what the
// frontend's logo-uploader tiles use to decide "Upload" vs "Change".
public record CompanyBrandingResponse(
    String primaryColor,
    String secondaryColor,
    String tagline,
    boolean hasSquareLogo,
    boolean hasWideLogo,
    Instant updatedAt
) {}
