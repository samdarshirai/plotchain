package com.plotchain.booking;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record TransferBookingRequest(@NotNull UUID associateId) {}
