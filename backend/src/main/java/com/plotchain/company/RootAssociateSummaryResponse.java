package com.plotchain.company;

import java.util.UUID;

public record RootAssociateSummaryResponse(UUID associateId, String userId, String name, String phone, String slotLabel) {}
