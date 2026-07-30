package com.plotchain.company;

// Unauthenticated contract consumed by BrandingBootstrapService (pre-login theming) and the
// login page's logo/tagline. Purely additive vs. Phase 2's narrower {primaryColor,
// secondaryColor} shape, so that earlier consumer keeps working unchanged.
public record CompanyBrandingPublicResponse(
    String displayName,
    String tagline,
    String primaryColor,
    String secondaryColor,
    boolean hasSquareLogo,
    boolean hasWideLogo
) {}
