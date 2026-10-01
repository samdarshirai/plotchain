package com.plotchain.booking;

import java.util.UUID;

public class InstallmentNotFoundException extends RuntimeException {
    public InstallmentNotFoundException(UUID bookingId, int installmentNumber) {
        super("Installment " + installmentNumber + " not found on booking " + bookingId);
    }
}
