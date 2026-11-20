package com.plotchain.booking;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

// Edit of a booking before its first payment is confirmed. Every field is optional: null = leave unchanged.
// Price, area, rate and status are derived/lifecycle fields and are deliberately not accepted.
public record UpdateBookingRequest(
    UUID associateId,
    UUID buyerAssociateId,
    @Size(max = 20) String buyerPhone,
    @DecimalMin("0.00") BigDecimal discount,
    @DecimalMin("0.00") BigDecimal extraPrice,
    @DecimalMin("0.00") BigDecimal extraPercent
) {}
