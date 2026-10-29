package com.plotchain.associate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
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
    String postalCode
) {}
