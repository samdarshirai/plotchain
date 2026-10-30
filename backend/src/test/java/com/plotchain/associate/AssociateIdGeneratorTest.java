package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateIdGeneratorTest {

    @Mock AssociateRepository associateRepository;

    AssociateIdGenerator generator;

    @BeforeEach
    void setUp() {
        generator = new AssociateIdGenerator(associateRepository, "VSA5");
    }

    @Test
    void generatesThePrefixFollowedByFourRandomDigits() {
        when(associateRepository.existsByUserId(ArgumentMatchers.anyString())).thenReturn(false);

        assertThat(generator.generate()).matches("VSA5\\d{4}");
    }

    @Test
    void honoursAConfiguredPrefix() {
        AssociateIdGenerator prefixed = new AssociateIdGenerator(associateRepository, "RS");
        when(associateRepository.existsByUserId(ArgumentMatchers.anyString())).thenReturn(false);

        assertThat(prefixed.generate()).matches("RS\\d{4}");
    }

    @Test
    void retriesWhenTheCandidateAlreadyExists() {
        when(associateRepository.existsByUserId(ArgumentMatchers.anyString())).thenReturn(true, false);

        assertThat(generator.generate()).matches("VSA5\\d{4}");
        verify(associateRepository, times(2)).existsByUserId(ArgumentMatchers.anyString());
    }

    @Test
    void throwsWhenEveryCandidateIsTaken() {
        Mockito.when(associateRepository.existsByUserId(ArgumentMatchers.anyString())).thenReturn(true);

        assertThatThrownBy(() -> generator.generate()).isInstanceOf(IllegalStateException.class);
    }
}
