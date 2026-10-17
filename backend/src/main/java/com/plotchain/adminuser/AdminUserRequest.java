package com.plotchain.adminuser;

import com.plotchain.associate.AssociateStatus;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record AdminUserRequest(
    @NotBlank String userId,
    @NotBlank String name,
    @NotBlank String phone,
    @Email String email,
    AssociateStatus status
) {}
