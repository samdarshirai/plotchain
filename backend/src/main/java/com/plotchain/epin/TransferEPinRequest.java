package com.plotchain.epin;

import jakarta.validation.constraints.NotBlank;

public record TransferEPinRequest(@NotBlank String toUserId) {}
