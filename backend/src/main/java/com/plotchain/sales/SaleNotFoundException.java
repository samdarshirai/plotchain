package com.plotchain.sales;

import java.util.UUID;

public class SaleNotFoundException extends RuntimeException {
    public SaleNotFoundException(UUID saleId) {
        super("Sale not found: " + saleId);
    }
}
