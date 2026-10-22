package com.plotchain.associate;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TemporaryPasswordGeneratorTest {

    @Test
    void generatesANonBlankPassword() {
        String password = TemporaryPasswordGenerator.generate();

        assertThat(password).isNotNull();
        assertThat(password).isNotEmpty();
    }

    @Test
    void generatesAnEightCharacterPassword() {
        assertThat(TemporaryPasswordGenerator.generate()).hasSize(8);
    }

    @Test
    void generatesDifferentPasswordsOnSuccessiveCalls() {
        String first = TemporaryPasswordGenerator.generate();
        String second = TemporaryPasswordGenerator.generate();

        assertThat(first).isNotEqualTo(second);
    }
}
