package com.plotchain.company;

import java.util.List;

public record RootAssociateSlotsResponse(List<RootAssociateSummaryResponse> roots, boolean leftOccupied, boolean rightOccupied) {}
