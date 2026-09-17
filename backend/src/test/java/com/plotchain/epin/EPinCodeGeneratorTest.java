package com.plotchain.epin;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EPinCodeGeneratorTest {

    @Test
    void generatesANonBlankCode() {
        String code = EPinCodeGenerator.generate();

        assertThat(code).isNotNull();
        assertThat(code).isNotEmpty();
    }

    @Test
    void generatesDifferentCodesOnSuccessiveCalls() {
        String first = EPinCodeGenerator.generate();
        String second = EPinCodeGenerator.generate();

        assertThat(first).isNotEqualTo(second);
    }
}
