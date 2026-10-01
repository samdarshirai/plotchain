package com.plotchain.epin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record BlockEPinRequest(@NotBlank @Size(max = 255) String reason) {}
