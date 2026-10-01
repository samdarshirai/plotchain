package com.plotchain.epin;

import jakarta.validation.constraints.NotBlank;

public record AssociateRedeemEPinRequest(@NotBlank String userId) {}
