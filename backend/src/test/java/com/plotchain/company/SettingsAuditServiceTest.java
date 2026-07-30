package com.plotchain.company;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SettingsAuditServiceTest {

    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    SettingsAuditService settingsAuditService;

    @BeforeEach
    void setUp() {
        settingsAuditService = new SettingsAuditService(settingsAuditLogRepository, associateRepository, new ObjectMapper());
    }

    private SettingsAuditLog auditLog(UUID id, UUID actorId, String section, String summary, String detail) {
        return new SettingsAuditLog(id, actorId, section, summary, detail, Instant.now());
    }

    private Associate associate(UUID id, String name, String userId) {
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName(name);
        associate.setUserId(userId);
        return associate;
    }

    record Detail(String field, int amount) {}

    @Test
    void recordSavesARowWithGeneratedIdActorSectionSummaryAndSerializedDetail() {
        UUID actorId = UUID.randomUUID();

        settingsAuditService.record("COMPANY_PROFILE", "Updated legal name", new Detail("legalName", 42), actorId);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getChangedByAssociateId()).isEqualTo(actorId);
        assertThat(saved.getSection()).isEqualTo("COMPANY_PROFILE");
        assertThat(saved.getSummary()).isEqualTo("Updated legal name");
        assertThat(saved.getDetail()).isEqualTo("{\"field\":\"legalName\",\"amount\":42}");
        assertThat(saved.getChangedAt()).isNotNull();
    }

    @Test
    void recordSerializesAnArbitraryDetailObjectToJsonViaObjectMapper() {
        settingsAuditService.record("BRANDING", "Uploaded new logo", new Detail("logoUrl", 7), UUID.randomUUID());

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getDetail()).isEqualTo("{\"field\":\"logoUrl\",\"amount\":7}");
    }

    @Test
    void listReturnsNewestFirstPageResponseWhenNoSectionFilterGiven() {
        SettingsAuditLog entry = auditLog(UUID.randomUUID(), null, "COMPANY_PROFILE", "Updated", null);
        Page<SettingsAuditLog> page = new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1);
        when(settingsAuditLogRepository.findAllByOrderByChangedAtDesc(any())).thenReturn(page);

        SettingsAuditPageResponse response = settingsAuditService.list(null, 0, 20);

        verify(settingsAuditLogRepository).findAllByOrderByChangedAtDesc(any());
        verify(settingsAuditLogRepository, org.mockito.Mockito.never())
            .findAllBySectionOrderByChangedAtDesc(any(), any());
        assertThat(response.entries()).hasSize(1);
        assertThat(response.page()).isEqualTo(0);
        assertThat(response.size()).isEqualTo(20);
        assertThat(response.totalElements()).isEqualTo(1);
    }

    @Test
    void listFiltersBySectionWhenProvided() {
        SettingsAuditLog entry = auditLog(UUID.randomUUID(), null, "PAYMENTS_KYC", "Updated bank account", null);
        Page<SettingsAuditLog> page = new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1);
        when(settingsAuditLogRepository.findAllBySectionOrderByChangedAtDesc(eq("PAYMENTS_KYC"), any())).thenReturn(page);

        SettingsAuditPageResponse response = settingsAuditService.list("PAYMENTS_KYC", 0, 20);

        verify(settingsAuditLogRepository).findAllBySectionOrderByChangedAtDesc(eq("PAYMENTS_KYC"), any(Pageable.class));
        assertThat(response.entries()).hasSize(1);
        assertThat(response.entries().get(0).section()).isEqualTo("PAYMENTS_KYC");
    }

    @Test
    void listResolvesChangedByNameAndUserIdFromAssociateRepositoryForEachDistinctActor() {
        UUID actorId = UUID.randomUUID();
        SettingsAuditLog entry = auditLog(UUID.randomUUID(), actorId, "ADMIN_TEAM", "Added admin", null);
        Page<SettingsAuditLog> page = new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1);
        when(settingsAuditLogRepository.findAllByOrderByChangedAtDesc(any())).thenReturn(page);
        when(associateRepository.findAllById(List.of(actorId))).thenReturn(List.of(associate(actorId, "Jane Doe", "VP00001")));

        SettingsAuditPageResponse response = settingsAuditService.list(null, 0, 20);

        assertThat(response.entries()).hasSize(1);
        assertThat(response.entries().get(0).changedByAssociateId()).isEqualTo(actorId);
        assertThat(response.entries().get(0).changedByName()).isEqualTo("Jane Doe");
        assertThat(response.entries().get(0).changedByUserId()).isEqualTo("VP00001");
    }

    @Test
    void listLeavesChangedByNameAndUserIdNullWhenChangedByAssociateIdIsNull() {
        SettingsAuditLog entry = auditLog(UUID.randomUUID(), null, "PROJECTS", "System-initiated change", null);
        Page<SettingsAuditLog> page = new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1);
        when(settingsAuditLogRepository.findAllByOrderByChangedAtDesc(any())).thenReturn(page);
        when(associateRepository.findAllById(List.of())).thenReturn(List.of());

        SettingsAuditPageResponse response = settingsAuditService.list(null, 0, 20);

        assertThat(response.entries()).hasSize(1);
        assertThat(response.entries().get(0).changedByAssociateId()).isNull();
        assertThat(response.entries().get(0).changedByName()).isNull();
        assertThat(response.entries().get(0).changedByUserId()).isNull();
    }
}
