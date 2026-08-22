package com.plotchain.associate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.util.UUID;

public record CreateAssociateRequest(
    @NotBlank String name,
    @NotBlank @Email String email,
    UUID sponsorId,
    UUID parentId,
    @Pattern(regexp = "L|R", message = "position must be L or R") String position,
    String phone
) {}
