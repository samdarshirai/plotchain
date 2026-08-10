package com.plotchain.cycle;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

// Cycle-management unit 4, Decision #2/#3 rollback guarantee: if any step of the settlement
// batch throws, the whole @Transactional close() rolls back -- including the OPEN -> CALCULATING
// flip from flow step 1, since it was never a separate commit -- leaving the cycle exactly as it
// was before the call. Only LegVolumeRepository is mocked (to force a mid-batch failure at flow
// step 2, the first write after the CALCULATING flip); CycleRepository and AssociateRepository
// stay real, so re-reading the cycle afterward proves the flip didn't survive, not just that no
// LegVolume rows exist (which a mock would guarantee regardless of whether rollback happened).
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseRollbackTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired PlatformTransactionManager transactionManager;

    @MockBean LegVolumeRepository legVolumeRepository;

    private UUID cycleId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        if (cycleId != null) {
            cycleRepository.deleteById(cycleId);
        }
        if (associateId != null) {
            associateRepository.deleteById(associateId);
        }
    }

    private UUID seedOpenCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> cycleRepository.saveAndFlush(cycle));
        return cycle.getId();
    }

    // A single root Admin, no children: rollUpSubtree treats it as a leaf, so it never calls
    // LegVolumeRepository.findByAssociateIdAndCycleId (only nodes with >=1 child do) -- only
    // saveAll needs stubbing below.
    private UUID seedRootAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName("Admin Root");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> associateRepository.saveAndFlush(associate));
        return id;
    }

    @Test
    void exceptionMidBatchRollsBackTheCalculatingFlipLeavingTheCycleOpen() {
        cycleId = seedOpenCycle();
        associateId = seedRootAssociate();
        when(legVolumeRepository.saveAll(anyList())).thenThrow(new RuntimeException("simulated mid-batch failure"));

        assertThatThrownBy(() -> cycleService.close(cycleId)).isInstanceOf(RuntimeException.class);

        Cycle reread = cycleRepository.findById(cycleId).orElseThrow();
        assertThat(reread.getStatus()).isEqualTo(CycleStatus.OPEN);
    }
}
