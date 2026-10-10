package com.plotchain.associate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

// name is NOT NULL on the associate table (V1 migration) -- @NotBlank. phone and email are both
// nullable columns (V11__associate_phone.sql; email's NOT NULL constraint was dropped in
// V4__user_id_login_and_admin_roles.sql), so neither is @NotBlank here: a null value clears the
// field, matching column nullability rather than inventing a "required going forward" rule this
// unit has no product basis for. @Email permits null (only validates format when present), same
// as its use on CreateAssociateRequest.
//
// fatherHusbandName..postalCode (V36) are all nullable/optional, same reasoning as phone/email.
// transactionPassword is required (TransactionPasswordGuard.require) but deliberately NOT
// @NotBlank: an empty value must reach the guard and yield the 401 INVALID path, not a 400.
public record UpdateAssociateProfileRequest(
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
    String transactionPassword
) {}
