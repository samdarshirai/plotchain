package com.plotchain.company;

import java.time.Instant;
import java.util.UUID;

public record SettingsAuditEntryResponse(
    UUID id, UUID changedByAssociateId, String changedByName, String changedByUserId,
    String section, String summary, String detail, Instant changedAt) {}
