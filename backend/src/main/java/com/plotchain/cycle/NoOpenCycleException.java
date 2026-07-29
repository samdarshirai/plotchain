package com.plotchain.cycle;

public class NoOpenCycleException extends RuntimeException {
    public NoOpenCycleException() {
        super("No open cycle");
    }
}
