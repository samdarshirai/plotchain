package com.plotchain.company;

import java.util.List;

public class LaunchBlockedException extends RuntimeException {

    private final List<String> incompleteSteps;

    public LaunchBlockedException(List<String> incompleteSteps) {
        super("Cannot go live until required steps are complete: " + incompleteSteps);
        this.incompleteSteps = incompleteSteps;
    }

    public List<String> getIncompleteSteps() { return incompleteSteps; }
}
