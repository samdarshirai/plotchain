package com.plotchain.associate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

// Admin counterpart of UpdateAssociateProfileRequest: all personal fields editable, no
// transaction-password gate (the admin is authenticated by role, not by the associate's secret).
public record AdminUpdateAssociateProfileRequest(
    @NotBlank String name,
    String phone,
    @Email String email,
    String address,
    String fatherHusbandName,
    LocalDate dateOfBirth,
    String gender,
    String maritalStatus,
    String state,
    String district,
    String postalCode,
    @NotBlank @Pattern(regexp = "[A-Z]{5}[0-9]{4}[A-Z]", message = "PAN must be 5 capital letters, 4 digits, 1 capital letter (e.g. ABCDE1234F)") String panNumber,
    @NotBlank @Pattern(regexp = "[0-9]{12}", message = "Aadhaar must be exactly 12 digits, no spaces") String aadhaarNumber
) {}
