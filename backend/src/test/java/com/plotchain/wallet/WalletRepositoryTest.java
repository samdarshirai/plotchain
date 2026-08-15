package com.plotchain.wallet;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Wallet/withdrawal unit 1, Decision 5: proves creditBalance's atomic UPDATE against the real H2
// (MODE=PostgreSQL) test datasource -- a Mockito mock can't exercise a real
// "UPDATE ... WHERE associate_id = :associateId" affected-row-count, which is the entire reason
// this method exists instead of a find-then-save round trip (Wallet has no @Version column, so a
// read-then-write race would silently lose an update under concurrent credits).
@DataJpaTest
@ActiveProfiles("test")
class WalletRepositoryTest {

    @Autowired WalletRepository walletRepository;
    @Autowired TestEntityManager entityManager;

    // ADMIN role, no rankId -- chk_associate_rank_required (V4__user_id_login_and_admin_roles.sql)
    // only requires rank_id for ASSOCIATE, so this avoids needing a RankTier fixture, same
    // shortcut CycleCloseRollbackTest's seedRootAssociate takes.
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

    @Test
    void creditBalanceIncrementsAnExistingWalletsBalanceAndReturnsOneAffectedRow() {
        Associate associate = seedAssociate();
        entityManager.persist(Wallet.zero(associate.getId()));
        entityManager.flush();

        int affected = walletRepository.creditBalance(associate.getId(), new BigDecimal("25.50"));
        entityManager.flush();
        entityManager.clear();

        assertThat(affected).isEqualTo(1);
        Wallet reread = walletRepository.findById(associate.getId()).orElseThrow();
        assertThat(reread.getBalance()).isEqualByComparingTo("25.50");
    }

    @Test
    void creditBalanceCalledTwiceAccumulatesRatherThanOverwriting() {
        Associate associate = seedAssociate();
        entityManager.persist(Wallet.zero(associate.getId()));
        entityManager.flush();

        walletRepository.creditBalance(associate.getId(), new BigDecimal("10.00"));
        entityManager.flush();
        entityManager.clear();
        walletRepository.creditBalance(associate.getId(), new BigDecimal("5.00"));
        entityManager.flush();
        entityManager.clear();

        Wallet reread = walletRepository.findById(associate.getId()).orElseThrow();
        assertThat(reread.getBalance()).isEqualByComparingTo("15.00");
    }

    @Test
    void creditBalanceReturnsZeroAffectedRowsAndCreatesNothingWhenNoWalletRowExists() {
        UUID neverCreditedAssociateId = UUID.randomUUID();

        int affected = walletRepository.creditBalance(neverCreditedAssociateId, new BigDecimal("10.00"));

        assertThat(affected).isZero();
        assertThat(walletRepository.findById(neverCreditedAssociateId)).isEmpty();
    }
}
