package com.plotchain.associate;

import jakarta.validation.constraints.NotNull;

public record KycDecisionRequest(@NotNull KycStatus decision, String reason) {}
