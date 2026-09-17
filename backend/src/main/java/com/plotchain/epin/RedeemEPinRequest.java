package com.plotchain.epin;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

// epin-domain unit 3 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Flows "Redeem", Data model): associateId/redemptionType are required (@NotNull, 400 on
// violation via ApiExceptionHandler's existing MethodArgumentNotValidException mapping).
// linkedEntityId is deliberately unvalidated -- Decision 7: nullable, no FK constraint, and
// expected to stay null for ACTIVATION redemptions (redeemedTo already identifies the
// associate). All three fields are defined now, in this guards-only unit, so epin-domain unit
// 4's happy path doesn't need to redefine this record.
public record RedeemEPinRequest(
    @NotNull UUID associateId,
    @NotNull RedemptionType redemptionType,
    UUID linkedEntityId
) {}
