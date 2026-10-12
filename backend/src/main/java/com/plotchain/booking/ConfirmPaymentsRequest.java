package com.plotchain.booking;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ConfirmPaymentsRequest(@NotEmpty @Size(max = 200) List<@Valid PaymentRef> items) {}
