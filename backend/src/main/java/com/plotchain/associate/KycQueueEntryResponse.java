package com.plotchain.associate;

import java.time.Instant;
import java.util.UUID;

public record KycQueueEntryResponse(UUID id, String userId, String name, KycStatus kycStatus, Instant joinedAt) {}
