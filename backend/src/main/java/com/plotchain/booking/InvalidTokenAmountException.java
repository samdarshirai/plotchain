package com.plotchain.booking;

import java.math.BigDecimal;

// Token must be above zero and at most the payable total (equal = paid in full, one installment). Mapped to 400 in BookingExceptionHandler.
public class InvalidTokenAmountException extends RuntimeException {
    public InvalidTokenAmountException(BigDecimal token, BigDecimal price) {
        super("Token amount " + token.toPlainString() + " must be above 0 and at most the payable total " + price.toPlainString());
    }
}
