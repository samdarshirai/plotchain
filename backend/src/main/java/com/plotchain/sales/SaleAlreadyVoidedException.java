package com.plotchain.sales;

import java.util.UUID;

public class SaleAlreadyVoidedException extends RuntimeException {
    public SaleAlreadyVoidedException(UUID saleId) {
        super("Sale is already voided: " + saleId);
    }
}
