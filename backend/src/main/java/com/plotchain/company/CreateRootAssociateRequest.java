package com.plotchain.company;

import jakarta.validation.constraints.NotBlank;

public record CreateRootAssociateRequest(
    @NotBlank String name,
    @NotBlank String phone,
    boolean seedRightRoot,
    String rightName,
    String rightPhone
) {}
