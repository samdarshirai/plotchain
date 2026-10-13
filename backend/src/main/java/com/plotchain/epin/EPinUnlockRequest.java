package com.plotchain.epin;

// Not @NotBlank on purpose: a blank password counts as a failed attempt in TransactionPasswordGuard.
public record EPinUnlockRequest(String transactionPassword) {}
