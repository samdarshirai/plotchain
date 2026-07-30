package com.plotchain.company;

import jakarta.validation.constraints.NotBlank;

public record CreateAdminRequest(
    @NotBlank String userId,
    @NotBlank String fullName,
    @NotBlank String role,
    String temporaryPassword
) {}
