package com.plotchain.epin;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
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

    @Test
    void redemptionFieldsRoundTripThroughFindById() {
        UUID adminId = persistAdmin();
        UUID redeemedToId = persistAdmin();
        UUID linkedEntityId = UUID.randomUUID();
        EPin epin = newEPin("code-for-roundtrip", UUID.randomUUID(), adminId);
        epin.setStatus(EPinStatus.USED);
        epin.setRedeemedTo(redeemedToId);
        epin.setRedeemedBy(adminId);
        epin.setRedeemedAt(Instant.now());
        epin.setRedemptionType(RedemptionType.ACTIVATION);
        epin.setLinkedEntityId(linkedEntityId);
        UUID id = epinRepository.saveAndFlush(epin).getId();
        entityManager.clear();

        EPin reloaded = epinRepository.findById(id).orElseThrow();

        assertThat(reloaded.getRedeemedTo()).isEqualTo(redeemedToId);
        assertThat(reloaded.getRedeemedBy()).isEqualTo(adminId);
        assertThat(reloaded.getRedeemedAt()).isNotNull();
        assertThat(reloaded.getRedemptionType()).isEqualTo(RedemptionType.ACTIVATION);
        assertThat(reloaded.getLinkedEntityId()).isEqualTo(linkedEntityId);
    }

    @Test
    void searchFiltersByStatusRedeemedToAndBatchIdIndependentlyAndInCombination() {
        UUID adminId = persistAdmin();
        UUID associateA = persistAdmin();
        UUID associateB = persistAdmin();
        UUID batchA = UUID.randomUUID();
        UUID batchB = UUID.randomUUID();

        EPin unusedInBatchA = epinRepository.saveAndFlush(newEPin("code-1", batchA, adminId));

        EPin usedForA = newEPin("code-2", batchA, adminId);
        usedForA.setStatus(EPinStatus.USED);
        usedForA.setRedeemedTo(associateA);
        usedForA.setRedeemedBy(adminId);
        usedForA.setRedeemedAt(Instant.now());
        usedForA.setRedemptionType(RedemptionType.ACTIVATION);
        epinRepository.saveAndFlush(usedForA);

        EPin usedForBInBatchB = newEPin("code-3", batchB, adminId);
        usedForBInBatchB.setStatus(EPinStatus.USED);
        usedForBInBatchB.setRedeemedTo(associateB);
        usedForBInBatchB.setRedeemedBy(adminId);
        usedForBInBatchB.setRedeemedAt(Instant.now());
        usedForBInBatchB.setRedemptionType(RedemptionType.TOPUP);
        epinRepository.saveAndFlush(usedForBInBatchB);

        Page<EPin> byStatus = epinRepository.search(EPinStatus.UNUSED, null, null, PageRequest.of(0, 20));
        assertThat(byStatus.getContent()).extracting(EPin::getId).containsExactly(unusedInBatchA.getId());

        Page<EPin> byRedeemedTo = epinRepository.search(null, associateA, null, PageRequest.of(0, 20));
        assertThat(byRedeemedTo.getContent()).extracting(EPin::getId).containsExactly(usedForA.getId());

        Page<EPin> byBatchId = epinRepository.search(null, null, batchB, PageRequest.of(0, 20));
        assertThat(byBatchId.getContent()).extracting(EPin::getId).containsExactly(usedForBInBatchB.getId());

        Page<EPin> combined = epinRepository.search(EPinStatus.USED, associateA, batchA, PageRequest.of(0, 20));
        assertThat(combined.getContent()).extracting(EPin::getId).containsExactly(usedForA.getId());

        Page<EPin> unfiltered = epinRepository.search(null, null, null, PageRequest.of(0, 20));
        assertThat(unfiltered.getTotalElements()).isEqualTo(3);
    }

    @Test
    void searchOrdersByGeneratedAtDescendingAndPaginatesCorrectly() {
        UUID adminId = persistAdmin();
        EPin earlier = newEPin("code-earlier", UUID.randomUUID(), adminId);
        earlier.setGeneratedAt(Instant.parse("2026-01-10T00:00:00Z"));
        epinRepository.saveAndFlush(earlier);
        EPin later = newEPin("code-later", UUID.randomUUID(), adminId);
        later.setGeneratedAt(Instant.parse("2026-01-20T00:00:00Z"));
        epinRepository.saveAndFlush(later);
        EPin latest = newEPin("code-latest", UUID.randomUUID(), adminId);
        latest.setGeneratedAt(Instant.parse("2026-01-30T00:00:00Z"));
        epinRepository.saveAndFlush(latest);

        Page<EPin> firstPage = epinRepository.search(null, null, null, PageRequest.of(0, 2));
        assertThat(firstPage.getContent()).extracting(EPin::getId)
            .containsExactly(latest.getId(), later.getId());
        assertThat(firstPage.getTotalElements()).isEqualTo(3);

        Page<EPin> secondPage = epinRepository.search(null, null, null, PageRequest.of(1, 2));
        assertThat(secondPage.getContent()).extracting(EPin::getId).containsExactly(earlier.getId());
    }

    @Test
    void searchReturnsAnEmptyPageWhenNoRowMatchesTheGivenFilters() {
        persistAdmin();

        Page<EPin> result = epinRepository.search(null, UUID.randomUUID(), null, PageRequest.of(0, 20));

        assertThat(result.getContent()).isEmpty();
        assertThat(result.getTotalElements()).isZero();
    }
}
