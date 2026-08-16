package com.plotchain.company;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// M2 fix: proves the V23 migration's expanded chk_settings_audit_log_section CHECK constraint is
// actually live against the real H2 (MODE=PostgreSQL) test datasource -- a mocked repository
// (as SettingsAuditServiceTest uses) can't exercise a DB-level CHECK constraint at all. Before
// V23, KYC/ASSOCIATE/WITHDRAWAL/WALLET weren't in the allow-list, so KycReviewService.decide()
// and 3 other services' settingsAuditService.record(...) calls threw DataIntegrityViolationException
// on every insert, surfaced as a generic 409 (see ApiExceptionHandler.handleDataIntegrityViolation).
@DataJpaTest
@ActiveProfiles("test")
class SettingsAuditLogRepositoryTest {

    @Autowired
    SettingsAuditLogRepository settingsAuditLogRepository;

    @Autowired
    TestEntityManager entityManager;

    @Test
    void checkConstraintAcceptsEachOfTheFourSectionValuesAddedByV23() {
        for (String section : new String[] {"KYC", "ASSOCIATE", "WITHDRAWAL", "WALLET"}) {
            SettingsAuditLog row = new SettingsAuditLog(
                UUID.randomUUID(), null, section, "test summary", null, Instant.now());

            settingsAuditLogRepository.saveAndFlush(row);
            entityManager.clear();

            assertThat(settingsAuditLogRepository.findById(row.getId())).isPresent();
        }
    }

    @Test
    void checkConstraintStillRejectsAnArbitraryUnlistedSectionValue() {
        // The migration extends the allow-list; it must not have accidentally dropped the
        // constraint or turned it into a no-op.
        SettingsAuditLog row = new SettingsAuditLog(
            UUID.randomUUID(), null, "NOT_A_REAL_SECTION", "test summary", null, Instant.now());

        assertThatThrownBy(() -> settingsAuditLogRepository.saveAndFlush(row))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
