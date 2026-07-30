package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentMatchers;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AssociateIdGeneratorTest {

    @Mock AssociateRepository associateRepository;

    AssociateIdGenerator generator;

    @BeforeEach
    void setUp() {
        generator = new AssociateIdGenerator(associateRepository, "VP");
        Mockito.lenient().when(associateRepository.existsByUserId(ArgumentMatchers.anyString())).thenReturn(false);
    }

    @Test
    void generatesTheFirstIdWhenNoneExist() {
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP")).thenReturn(Optional.empty());

        assertThat(generator.generate()).isEqualTo("VP00001");
    }

    @Test
    void generatesTheNextIdGivenAnExistingMaximum() {
        Associate existing = new Associate();
        existing.setUserId("VP00007");
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP")).thenReturn(Optional.of(existing));

        assertThat(generator.generate()).isEqualTo("VP00008");
    }

    @Test
    void honoursAConfiguredPrefix() {
        AssociateIdGenerator prefixed = new AssociateIdGenerator(associateRepository, "RS");
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("RS")).thenReturn(Optional.empty());

        assertThat(prefixed.generate()).isEqualTo("RS00001");
    }

    @Test
    void skipsOverIdsThatAlreadyExist() {
        when(associateRepository.findTopByUserIdStartingWithOrderByUserIdDesc("VP")).thenReturn(Optional.empty());
        when(associateRepository.existsByUserId("VP00001")).thenReturn(true);
        when(associateRepository.existsByUserId("VP00002")).thenReturn(false);

        assertThat(generator.generate()).isEqualTo("VP00002");
    }
}
