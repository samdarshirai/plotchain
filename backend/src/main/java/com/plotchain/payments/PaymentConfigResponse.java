package com.plotchain.payments;

import java.time.Instant;
import java.util.List;

// credentialsConfigured, never the raw/decrypted value -- same masked-indicator shape as
// CompanyBrandingResponse.hasSquareLogo/hasWideLogo.
public record PaymentConfigResponse(
    String gateway,
    boolean credentialsConfigured,
    List<String> modesEnabled,
    Instant updatedAt
) {}
