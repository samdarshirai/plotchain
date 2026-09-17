package com.plotchain.epin;

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

import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DataJpaTest
@ActiveProfiles("test")
class EPinRepositoryTest {

    @Autowired EPinRepository epinRepository;
    @Autowired TestEntityManager entityManager;

    // Same "persistable, FK-satisfying ADMIN row" fixture reasoning as
    // com.plotchain.sales.SaleRepositoryTest.persistAssociate(): chk_associate_rank_required (V4)
    // only demands a rank_id for an ASSOCIATE row, so ADMIN keeps this fixture minimal.
    private UUID persistAdmin() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setPosition("L");
        associate.setName("Test Admin");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        return entityManager.persist(associate).getId();
    }

    private EPin newEPin(String code, UUID batchId, UUID generatedBy) {
        EPin epin = new EPin();
        epin.setId(UUID.randomUUID());
        epin.setCode(code);
        epin.setBatchId(batchId);
        epin.setStatus(EPinStatus.UNUSED);
        epin.setGeneratedBy(generatedBy);
        epin.setGeneratedAt(Instant.now());
        return epin;
    }

    @Test
    void duplicateCodeInsertIsRejectedByTheUniqueConstraint() {
        UUID adminId = persistAdmin();
        String code = "duplicate-code-value";
        epinRepository.saveAndFlush(newEPin(code, UUID.randomUUID(), adminId));

        assertThatThrownBy(() -> epinRepository.saveAndFlush(newEPin(code, UUID.randomUUID(), adminId)))
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
