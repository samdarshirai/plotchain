package com.plotchain.epin;

// Both passwords are plaintext and returned exactly once, at creation.
public record JoinEPinResponse(String userId, String name, String temporaryPassword, String transactionPassword) {}
