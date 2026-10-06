package com.plotchain.supportticket;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record CreateSupportTicketRequest(
    @NotNull UUID associateId,
    @NotBlank @Size(max = 200) String subject,
    @NotBlank String description
) {}
