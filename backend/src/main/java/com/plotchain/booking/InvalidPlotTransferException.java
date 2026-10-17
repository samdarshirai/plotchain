package com.plotchain.booking;

public class InvalidPlotTransferException extends RuntimeException {
    public InvalidPlotTransferException(String message) {
        super(message);
    }
}
