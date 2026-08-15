package com.plotchain.withdrawal;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Wallet/withdrawal unit 5 -- proves WithdrawalRequest maps correctly onto
// V22__withdrawal_request.sql's real H2 (MODE=PostgreSQL) test schema, including its CHECK
// constraints, the same way WalletRepositoryTest proves creditBalance/debitIfSufficient against
// the real wallet table (a Mockito mock can't exercise a database CHECK constraint).
@DataJpaTest
@ActiveProfiles("test")
class WithdrawalRequestRepositoryTest {

    @Autowired WithdrawalRequestRepository withdrawalRequestRepository;
    @Autowired TestEntityManager entityManager;

    // ADMIN role, no rankId -- chk_associate_rank_required only requires rank_id for ASSOCIATE,
    // same shortcut WalletRepositoryTest's seedAssociate already takes.
    private Associate seedAssociate() {
        Associate associate = new Associate();
        UUID id = UUID.randomUUID();
        associate.setId(id);
        associate.setName("Test Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        entityManager.persist(associate);
        return associate;
    }

    private WithdrawalRequest requestFor(UUID associateId, BigDecimal amount, WithdrawalRequestStatus status) {
        WithdrawalRequest request = new WithdrawalRequest();
        request.setId(UUID.randomUUID());
        request.setAssociateId(associateId);
        request.setAmount(amount);
        request.setStatus(status);
        request.setRequestedAt(Instant.now());
        return request;
    }

    @Test
    void savesAndReloadsARequestedWithdrawalRequest() {
        Associate associate = seedAssociate();
        WithdrawalRequest request = requestFor(associate.getId(), new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);

        withdrawalRequestRepository.save(request);
        entityManager.flush();
        entityManager.clear();

        WithdrawalRequest reread = withdrawalRequestRepository.findById(request.getId()).orElseThrow();
        assertThat(reread.getAssociateId()).isEqualTo(associate.getId());
        assertThat(reread.getAmount()).isEqualByComparingTo("1000.00");
        assertThat(reread.getStatus()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(reread.getDecidedAt()).isNull();
        assertThat(reread.getDisbursedAt()).isNull();
    }

    @Test
    void savesAnAutoApprovedRequestWithADecidedAtTimestamp() {
        Associate associate = seedAssociate();
        WithdrawalRequest request = requestFor(associate.getId(), new BigDecimal("500.00"), WithdrawalRequestStatus.APPROVED);
        request.setDecidedAt(Instant.now());

        withdrawalRequestRepository.save(request);
        entityManager.flush();
        entityManager.clear();

        WithdrawalRequest reread = withdrawalRequestRepository.findById(request.getId()).orElseThrow();
        assertThat(reread.getStatus()).isEqualTo(WithdrawalRequestStatus.APPROVED);
        assertThat(reread.getDecidedAt()).isNotNull();
    }

    @Test
    void rejectsAZeroAmountViaTheDatabaseCheckConstraint() {
        Associate associate = seedAssociate();
        WithdrawalRequest request = requestFor(associate.getId(), BigDecimal.ZERO, WithdrawalRequestStatus.REQUESTED);

        // saveAndFlush (not save()+entityManager.flush()) -- only calls through the repository
        // proxy pass through Spring's PersistenceExceptionTranslationPostProcessor, which is what
        // turns Hibernate's raw ConstraintViolationException into this DataIntegrityViolationException.
        // Same pattern as LedgerEntryRepositoryTest's CHECK/unique-constraint tests.
        assertThatThrownBy(() -> withdrawalRequestRepository.saveAndFlush(request))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
