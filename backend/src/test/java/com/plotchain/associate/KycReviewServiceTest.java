package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KycReviewServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;

    KycReviewService service;
    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new KycReviewService(associateRepository, settingsAuditService);
    }

    private Associate newAssociate(UUID id, String userId, KycStatus kycStatus) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(kycStatus);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void listReturnsAPageOfEntriesForTheGivenStatus() {
        Associate associate = newAssociate(UUID.randomUUID(), "VP00001", KycStatus.PENDING);
        when(associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            AssociateRole.ASSOCIATE, KycStatus.PENDING, PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(associate), PageRequest.of(0, 20), 1));

        KycPageResponse response = service.list(KycStatus.PENDING, 0, 20);

        assertThat(response.entries()).hasSize(1);
        assertThat(response.entries().get(0).userId()).isEqualTo("VP00001");
    }

    @Test
    void decideApprovesAndRecordsAudit() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        KycQueueEntryResponse response = service.decide(id, new KycDecisionRequest(KycStatus.VERIFIED, null), ACTOR_ID);

        assertThat(associate.getKycStatus()).isEqualTo(KycStatus.VERIFIED);
        assertThat(response.kycStatus()).isEqualTo(KycStatus.VERIFIED);
        verify(associateRepository).save(associate);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getSection()).isEqualTo("kyc");
    }

    @Test
    void decideRejectsWithoutAReasonThrows() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, ""), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, null), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
    }

    @Test
    void decideWithReasonAcceptsRejection() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        KycQueueEntryResponse response =
            service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, "Blurry PAN photo"), ACTOR_ID);

        assertThat(response.kycStatus()).isEqualTo(KycStatus.REJECTED);
    }

    @Test
    void decideRejectsAPendingDecisionValue() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.PENDING, null), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
    }

    @Test
    void decideThrowsWhenAssociateNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.VERIFIED, null), ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void decideThrowsAssociateNotFoundEvenWhenDecisionIsAlsoInvalid() {
        // Precedence check: when BOTH the associateId is bogus AND the decision body is
        // invalid (PENDING is never a valid decision value), the lookup runs first, so the
        // associate-not-found case wins -- callers see 404, not 400. This locks in the
        // lookup-first ordering (see KycReviewService.decide) against ever silently flipping
        // back to validate-first, which none of the other tests here would catch.
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.PENDING, null), ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }
}
