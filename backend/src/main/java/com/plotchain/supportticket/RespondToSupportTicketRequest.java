package com.plotchain.supportticket;

import jakarta.validation.constraints.NotNull;

public record RespondToSupportTicketRequest(@NotNull SupportTicketStatus status, String response) {}
