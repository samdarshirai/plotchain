package com.plotchain.payments;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;

import java.util.List;

// No OFF value in the pattern -- KYC cannot be fully disabled, only strict/relaxed, enforced
// here and again by the DB's chk_kyc_strictness CHECK constraint. requiredDocuments is
// @NotEmpty because required_documents is NOT NULL -- an admin can narrow the list, but never
// clear it to nothing, which would otherwise mean "no documents required at all".
public record KycConfigRequest(
    @NotBlank @Pattern(regexp = "STRICT|RELAXED") String strictness,
    @NotEmpty List<String> requiredDocuments
) {}
