package com.plotchain.payments;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

// credentials is deliberately NOT @NotBlank: blank/absent leaves the previously stored
// encrypted credentials untouched, so the autosave cadence on gateway/modesEnabled edits never
// forces resending (or clobbering) the secret. Only the explicit "Save credentials" action
// sends a non-blank value.
public record PaymentConfigRequest(
    @NotBlank String gateway,
    String credentials,
    List<String> modesEnabled
) {}
