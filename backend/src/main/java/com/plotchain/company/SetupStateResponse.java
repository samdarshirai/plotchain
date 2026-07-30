package com.plotchain.company;

import java.time.Instant;
import java.util.List;

public record SetupStateResponse(
    List<StepStatus> steps,
    boolean canGoLive,
    Instant launchedAt
) {
    public record StepStatus(int number, String key, boolean complete, boolean required, int percentComplete) {}
}
