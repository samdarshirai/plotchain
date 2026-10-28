package com.plotchain.associate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDate;

// Admin create: same profile as the associate e-Pin Join form. sponsorUserId/position are optional
// only so the very first associate of an empty tree can be created parentless; the form enforces them otherwise.
public record CreateAssociateRequest(
    @NotBlank String name,
    String sponsorUserId,
    @Pattern(regexp = "L|R", message = "position must be L or R") String position,
    String fatherHusbandName,
    @NotBlank @Pattern(regexp = "[A-Z]{5}[0-9]{4}[A-Z]", message = "invalid PAN") String panNumber,
    @NotBlank @Pattern(regexp = "[0-9]{12}", message = "invalid Aadhaar") String aadhaarNumber,
    LocalDate dateOfBirth,
    String gender,
    String maritalStatus,
    @Email String email,
    @NotBlank @Pattern(regexp = "[+]?[0-9]{10,15}", message = "invalid mobile number") String phone,
    @NotBlank String state,
    @NotBlank String district,
    @NotBlank String address,
    String postalCode,
    String nomineeName,
    String nomineeRelation
) implements AssociateProfileFields {}
