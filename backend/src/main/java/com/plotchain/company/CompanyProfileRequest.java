package com.plotchain.company;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

// registrationNumber has no @NotBlank -- the spec is explicit that it's optional until the
// company is registered. The pattern still applies when a value is present: GSTIN's standard
// 15-character alphanumeric format is used since the spec names no format of its own.
public record CompanyProfileRequest(
    @NotBlank String displayName,
    @NotBlank String legalName,
    @Pattern(regexp = "^$|^[0-9A-Z]{15}$", message = "registration number must be 15 characters (GSTIN format)")
    String registrationNumber,
    @NotBlank String contactName,
    @NotBlank @Pattern(regexp = "^[+]?[0-9]{10,15}$", message = "contact phone must be a valid phone number")
    String contactPhone,
    @NotBlank @Email String contactEmail,
    @NotBlank String registeredAddress
) {}
