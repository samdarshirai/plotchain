package com.plotchain.epin;

import java.time.Instant;

public record EPinUnlockResponse(String token, Instant expiresAt) {}
