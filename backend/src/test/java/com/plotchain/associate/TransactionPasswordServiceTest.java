package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TransactionPasswordServiceTest {

    @Mock AssociateRepository associateRepository;
    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    TransactionPasswordService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new TransactionPasswordService(associateRepository, passwordEncoder);
    }

    private Associate seeded() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    @Test
    void getStatusReportsNotSetWhenHashIsNull() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seeded()));

        assertThat(service.getStatus(ASSOCIATE_ID).isSet()).isFalse();
    }

    @Test
    void getStatusReportsSetWhenHashIsPresent() {
        Associate associate = seeded();
        associate.setTransactionPasswordHash(passwordEncoder.encode("secret123"));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        assertThat(service.getStatus(ASSOCIATE_ID).isSet()).isTrue();
    }

    @Test
    void setPasswordBootstrapsWithoutRequiringACurrentPassword() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        service.setPassword(ASSOCIATE_ID, new SetTransactionPasswordRequest(null, "secret123"));

        assertThat(passwordEncoder.matches("secret123", associate.getTransactionPasswordHash())).isTrue();
    }

    @Test
    void setPasswordRequiresTheCorrectCurrentPasswordOnceOneIsSet() {
        Associate associate = seeded();
        associate.setTransactionPasswordHash(passwordEncoder.encode("oldSecret"));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.setPassword(ASSOCIATE_ID,
            new SetTransactionPasswordRequest("wrongSecret", "newSecret123")))
            .isInstanceOf(InvalidTransactionPasswordException.class);
    }

    @Test
    void setPasswordChangesAnExistingPasswordWithTheCorrectCurrentOne() {
        Associate associate = seeded();
        associate.setTransactionPasswordHash(passwordEncoder.encode("oldSecret"));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        service.setPassword(ASSOCIATE_ID, new SetTransactionPasswordRequest("oldSecret", "newSecret123"));

        assertThat(passwordEncoder.matches("newSecret123", associate.getTransactionPasswordHash())).isTrue();
    }
}
