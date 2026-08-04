package com.plotchain.cycle;

import java.util.UUID;

// Placeholder success response for POST /api/admin/cycles/{id}/close. Cycle-management unit 4
// (the settlement batch) will replace what this method reports once it exists -- entries
// written per income type, total net amount, the newly-reopened cycle's id -- but this unit's
// scope stops at "lock acquired, status confirmed OPEN, nothing thrown."
public record CycleCloseResponse(UUID cycleId, CycleStatus status) {}
