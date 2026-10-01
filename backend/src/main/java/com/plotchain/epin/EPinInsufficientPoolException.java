package com.plotchain.epin;

public class EPinInsufficientPoolException extends RuntimeException {
    public EPinInsufficientPoolException(int requested, int available) {
        super("Only " + available + " allocatable e-PIN(s) available, requested " + requested);
    }
}
