package com.plotchain.associate;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
class TransactionPasswordLockoutIntegrationTest {

    // V13__seed_default_rank_tiers.sql's lowest-order seeded rank (chk_associate_rank_required).
    private static final UUID SILVER_RANK_ID = UUID.fromString("00000000-0000-0000-0000-000000000201");

    @Autowired TransactionPasswordGuard guard;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlatformTransactionManager txManager;
    @Autowired PasswordEncoder encoder;

    private UUID seededId;

    @AfterEach
    void cleanUp() {
        if (seededId != null) {
            associateRepository.deleteById(seededId);
        }
    }

    private UUID seedAssociate() {
        UUID id = UUID.randomUUID();
        Associate a = new Associate();
        a.setId(id);
        a.setName("Test Associate");
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setUserId("tp-" + id);
        a.setEmail(id + "@test.local");
        a.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setRankId(SILVER_RANK_ID);
        a.setStatus(AssociateStatus.ACTIVE);
        a.setTransactionPasswordHash(encoder.encode("secret123"));
        associateRepository.saveAndFlush(a);
        seededId = id;
        return id;
    }

    @Test
    void failedAttemptsPersistAndFifthLocks() {
        UUID id = seedAssociate();
        for (int i = 0; i < 4; i++) {
            assertThatThrownBy(() -> guard.require(id, "wrong")).isInstanceOf(InvalidTransactionPasswordException.class);
        }
        assertThat(associateRepository.findById(id).orElseThrow().getTransactionPasswordFailedAttempts()).isEqualTo(4);

        assertThatThrownBy(() -> guard.require(id, "wrong")).isInstanceOf(InvalidTransactionPasswordException.class);

        assertThatThrownBy(() -> guard.require(id, "secret123")).isInstanceOf(TransactionPasswordLockedException.class);
    }

    @Test
    void failureCommitsEvenWhenCallerTransactionRollsBack() {
        UUID id = seedAssociate();
        TransactionTemplate tx = new TransactionTemplate(txManager);

        assertThatThrownBy(() -> tx.executeWithoutResult(s -> guard.require(id, "wrong")))
            .isInstanceOf(InvalidTransactionPasswordException.class);

        assertThat(associateRepository.findById(id).orElseThrow().getTransactionPasswordFailedAttempts()).isEqualTo(1);
    }

    @Test
    void successAfterFailuresResetsCounterAndLaterSaveDoesNotRestoreIt() {
        UUID id = seedAssociate();
        assertThatThrownBy(() -> guard.require(id, "wrong")).isInstanceOf(InvalidTransactionPasswordException.class);
        assertThatThrownBy(() -> guard.require(id, "wrong")).isInstanceOf(InvalidTransactionPasswordException.class);

        guard.require(id, "secret123");
        Associate fresh = associateRepository.findById(id).orElseThrow();
        associateRepository.save(fresh); // what a profile save does after the guard

        assertThat(associateRepository.findById(id).orElseThrow().getTransactionPasswordFailedAttempts()).isZero();
    }

    @Test
    void fiveConcurrentWrongAttemptsAllCountAndLock() throws Exception {
        UUID id = seedAssociate();
        int n = 5;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Throwable>> results = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                results.add(pool.submit(() -> {
                    start.await();
                    try {
                        guard.require(id, "wrong");
                        return null;
                    } catch (Throwable t) {
                        return t;
                    }
                }));
            }
            start.countDown();
            for (Future<Throwable> f : results) {
                assertThat(f.get(30, TimeUnit.SECONDS)).isInstanceOfAny(
                    InvalidTransactionPasswordException.class, TransactionPasswordLockedException.class);
            }
        } finally {
            pool.shutdownNow();
        }

        Instant lockedUntil = associateRepository.findById(id).orElseThrow().getTransactionPasswordLockedUntil();
        assertThat(lockedUntil).isNotNull().isAfter(Instant.now());
    }
}
