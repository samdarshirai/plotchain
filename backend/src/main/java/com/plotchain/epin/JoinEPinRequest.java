package com.plotchain.epin;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import com.plotchain.associate.AssociateProfileFields;

import java.time.LocalDate;

// Associate Join screen: registers a new member and consumes the pin in one step.
public record JoinEPinRequest(
    @NotBlank String name,
    @NotBlank String sponsorUserId,
    @NotBlank @Pattern(regexp = "L|R", message = "position must be L or R") String position,
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
    String nomineeRelation,
    String transactionPassword
) implements AssociateProfileFields {}
