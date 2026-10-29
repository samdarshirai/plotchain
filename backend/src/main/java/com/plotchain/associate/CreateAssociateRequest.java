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
    @NotBlank @Pattern(regexp = "[A-Z]{5}[0-9]{4}[A-Z]", message = "PAN must be 5 capital letters, 4 digits, 1 capital letter (e.g. ABCDE1234F)") String panNumber,
    @NotBlank @Pattern(regexp = "[0-9]{12}", message = "Aadhaar must be exactly 12 digits, no spaces") String aadhaarNumber,
    LocalDate dateOfBirth,
    String gender,
    String maritalStatus,
    @Email String email,
    @NotBlank @Pattern(regexp = "[+]?[0-9]{10,15}", message = "Mobile number must be 10 to 15 digits, optional leading + (e.g. 9876543210)") String phone,
    @NotBlank String state,
    @NotBlank String district,
    @NotBlank String address,
    String postalCode,
    String nomineeName,
    String nomineeRelation
) implements AssociateProfileFields {}
