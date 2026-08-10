package com.plotchain.cycle;

import java.util.UUID;

// Cycle-management unit 4 expands this from unit 3's placeholder. legVolumeRowsWritten and
// newCycleId are the two facts unit 4's leg-volume-rollup-only scope can honestly report --
// units 5-9 (Matching, Rank, Sponsor Matching, Royalty, Reward), which start writing
// LedgerEntry rows, are expected to add per-income-type fields here (or fold this into the
// spec's eventual full SettlementResult shape) once they have something to report, not before.
// Deliberately kept as this same record/name rather than renamed now: a rename today, before
// any income-type breakdown exists, would just be a rename with no new information, and the
// first unit that actually needs new fields would rename it again anyway.
public record CycleCloseResponse(UUID cycleId, CycleStatus status, int legVolumeRowsWritten, UUID newCycleId) {}
