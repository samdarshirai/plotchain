package com.plotchain.company;

import java.time.Instant;
import java.util.UUID;

// No status field -- there is no deactivation/suspend state anywhere on Associate, and the
// spec treats an account as either created (active) or not existing yet (decision 6). The
// frontend renders a static "Active" label per row instead of reading one from here.
public record AdminSummaryResponse(UUID id, String userId, String fullName, String role, Instant lastActiveAt) {}
