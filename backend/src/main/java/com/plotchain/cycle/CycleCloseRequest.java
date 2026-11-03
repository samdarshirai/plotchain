package com.plotchain.cycle;

import java.time.LocalDate;

// endDate: last day counted in the cycle. Null means today.
public record CycleCloseRequest(LocalDate endDate) {}
