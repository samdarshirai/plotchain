package com.plotchain.booking;

import java.util.UUID;

public class InstallmentNotEnteredException extends RuntimeException {
    public InstallmentNotEnteredException(UUID bookingId, int installmentNumber) {
        super("Installment " + installmentNumber + " of booking " + bookingId + " has no entered payment to confirm");
    }
}
