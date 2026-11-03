package com.plotchain.common;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Single place money is rounded: whole rupees, HALF_UP (11.4 -> 11, 11.5 -> 12). */
public final class Money {
    private Money() {}

    public static BigDecimal round(BigDecimal v) {
        return v.setScale(0, RoundingMode.HALF_UP);
    }

    /** base * pct / 100, rounded to whole rupees. */
    public static BigDecimal percentOf(BigDecimal base, BigDecimal pct) {
        return round(base.multiply(pct).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
    }
}
