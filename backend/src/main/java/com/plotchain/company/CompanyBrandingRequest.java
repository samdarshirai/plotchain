package com.plotchain.company;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CompanyBrandingRequest(
    @NotBlank @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "primary color must be a 6-digit hex value")
    String primaryColor,
    @NotBlank @Pattern(regexp = "^#[0-9A-Fa-f]{6}$", message = "secondary color must be a 6-digit hex value")
    String secondaryColor,
    // No @NotBlank -- tagline is optional, matching the mockup's counter starting at 0/60.
    @Size(max = 60, message = "tagline must be 60 characters or fewer")
    String tagline
) {}
