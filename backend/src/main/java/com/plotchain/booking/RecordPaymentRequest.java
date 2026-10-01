package com.plotchain.booking;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;

// amount is the admin's confirmation of what was collected; the server never takes it as the
// source of truth, only checks it equals the installment's own amount (Decision 6, resolved
// decision 1). paidAt is optional: absent means "now" per the injected Clock. @Size(max = 100)
// matches emi_installment.payment_ref VARCHAR(100) so an oversized ref is a 400, not a 500.
public record RecordPaymentRequest(
    @NotNull @DecimalMin(value = "0.00", inclusive = false) BigDecimal amount,
    @NotBlank @Size(max = 100) String paymentRef,
    Instant paidAt
) {}
