package com.plotchain.associate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TransactionPasswordServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock TransactionPasswordGuard guard;
    PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    TransactionPasswordService service;
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new TransactionPasswordService(associateRepository, passwordEncoder, guard);
    }

    private Associate seeded() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setRole(AssociateRole.ASSOCIATE);
        a.setPasswordHash(passwordEncoder.encode("login-pass"));
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
    void firstTimeSetSkipsGuard() {
        Associate associate = seeded();
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        service.setPassword(ASSOCIATE_ID, new SetTransactionPasswordRequest(null, "txn-pass-1"));

        verify(guard, never()).require(any(), any());
        assertThat(passwordEncoder.matches("txn-pass-1", associate.getTransactionPasswordHash())).isTrue();
    }

    @Test
    void changeVerifiesCurrentViaGuardThenSavesWithCleanCounters() {
        Associate associate = seeded();
        associate.setTransactionPasswordHash(passwordEncoder.encode("old-txn"));
        associate.setTransactionPasswordFailedAttempts(2);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        service.setPassword(ASSOCIATE_ID, new SetTransactionPasswordRequest("old-txn", "new-txn-1"));

        InOrder order = inOrder(guard, associateRepository);
        order.verify(guard).require(ASSOCIATE_ID, "old-txn");
        order.verify(associateRepository).save(associate);
        assertThat(associate.getTransactionPasswordFailedAttempts()).isZero();
        assertThat(associate.getTransactionPasswordLockedUntil()).isNull();
        assertThat(passwordEncoder.matches("new-txn-1", associate.getTransactionPasswordHash())).isTrue();
    }

    @Test
    void changeWithGuardRejectionLeavesHashUnchanged() {
        Associate associate = seeded();
        associate.setTransactionPasswordHash(passwordEncoder.encode("old-txn"));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));
        doThrow(new InvalidTransactionPasswordException("bad")).when(guard).require(ASSOCIATE_ID, "nope");

        assertThatThrownBy(() -> service.setPassword(ASSOCIATE_ID,
            new SetTransactionPasswordRequest("nope", "new-txn-1")))
            .isInstanceOf(InvalidTransactionPasswordException.class);
        verify(associateRepository, never()).save(any());
    }

    @Test
    void rejectsNewPasswordEqualToLoginPassword() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seeded()));

        assertThatThrownBy(() -> service.setPassword(ASSOCIATE_ID,
            new SetTransactionPasswordRequest(null, "login-pass")))
            .isInstanceOf(TransactionPasswordSameAsLoginException.class);
        verify(associateRepository, never()).save(any());
    }
}
