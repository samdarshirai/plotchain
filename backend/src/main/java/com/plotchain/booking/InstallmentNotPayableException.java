package com.plotchain.booking;

import java.util.UUID;

public class InstallmentNotPayableException extends RuntimeException {
    public InstallmentNotPayableException(UUID bookingId, int installmentNumber) {
        super("Installment " + installmentNumber + " of booking " + bookingId + " is not payable");
    }
}
