package com.plotchain.supportticket;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateMyMessageRequest(
    @NotBlank @Size(max = 200) String subject,
    @NotBlank String description
) {}
