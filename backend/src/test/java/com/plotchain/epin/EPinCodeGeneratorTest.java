package com.plotchain.epin;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EPinCodeGeneratorTest {

    @Test
    void generatesSixDigitNumericPins() {
        for (int i = 0; i < 1000; i++) {
            assertThat(EPinCodeGenerator.generate()).matches("\\d{6}");
        }
    }
}
