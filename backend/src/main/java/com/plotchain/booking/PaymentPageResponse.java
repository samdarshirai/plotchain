package com.plotchain.booking;

import java.math.BigDecimal;
import java.util.List;

public record PaymentPageResponse(List<PaymentRow> payments, int page, int size, long totalElements,
                                  BigDecimal pageTotal, BigDecimal grandTotal) {}
