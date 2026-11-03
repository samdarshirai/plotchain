package com.plotchain.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MoneyTest {
    @Test
    void roundsHalfUpToWholeRupee() {
        assertThat(Money.round(new BigDecimal("11.4"))).isEqualByComparingTo("11");
        assertThat(Money.round(new BigDecimal("11.5"))).isEqualByComparingTo("12");
        assertThat(Money.round(new BigDecimal("11.49"))).isEqualByComparingTo("11");
        assertThat(Money.round(new BigDecimal("11.4")).scale()).isZero();
    }

    @Test
    void percentOfRoundsResult() {
        assertThat(Money.percentOf(new BigDecimal("1000"), new BigDecimal("2.5"))).isEqualByComparingTo("25");
        assertThat(Money.percentOf(new BigDecimal("1010"), new BigDecimal("2.5"))).isEqualByComparingTo("25"); // 25.25
        assertThat(Money.percentOf(new BigDecimal("1030"), new BigDecimal("2.5"))).isEqualByComparingTo("26"); // 25.75
    }
}
