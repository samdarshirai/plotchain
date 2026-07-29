package com.plotchain.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(
    @NotBlank String currentPassword,
    @NotBlank @Size(min = 8, message = "newPassword must be at least 8 characters") String newPassword
) {}
