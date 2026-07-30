package com.plotchain.company;

import java.time.Instant;

public record CompanyProfileResponse(
    String displayName,
    String legalName,
    String registrationNumber,
    String contactName,
    String contactPhone,
    String contactEmail,
    String registeredAddress,
    Instant updatedAt
) {}
