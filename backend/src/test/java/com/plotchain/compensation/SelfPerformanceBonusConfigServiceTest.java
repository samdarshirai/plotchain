package com.plotchain.compensation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SelfPerformanceBonusConfigServiceTest {

    @Mock SelfPerformanceBonusConfigRepository selfPerformanceBonusConfigRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    SelfPerformanceBonusConfigService selfPerformanceBonusConfigService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        selfPerformanceBonusConfigService =
            new SelfPerformanceBonusConfigService(selfPerformanceBonusConfigRepository, settingsAuditService);
    }

    @Test
    void isEnabledIsFalseByDefault() {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(selfPerformanceBonusConfigService.isEnabled()).isFalse();
    }

    @Test
    void isEnabledIsTrueAfterEnabling() {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        stored.setEnabled(true);
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(selfPerformanceBonusConfigService.isEnabled()).isTrue();
    }

    @Test
    void updateConfigSavesTheEnabledFlag() {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        SelfPerformanceBonusConfigResponse response =
            selfPerformanceBonusConfigService.updateConfig(new SelfPerformanceBonusConfigRequest(true), ACTOR_ID);

        ArgumentCaptor<SelfPerformanceBonusConfig> captor = ArgumentCaptor.forClass(SelfPerformanceBonusConfig.class);
        verify(selfPerformanceBonusConfigRepository).save(captor.capture());
        assertThat(captor.getValue().isEnabled()).isTrue();
        assertThat(response.enabled()).isTrue();
    }

    @Test
    void updateConfigRecordsAnAuditEntry() {
        SelfPerformanceBonusConfig stored = new SelfPerformanceBonusConfig();
        when(selfPerformanceBonusConfigRepository.findAll()).thenReturn(List.of(stored));

        selfPerformanceBonusConfigService.updateConfig(new SelfPerformanceBonusConfigRequest(true), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("COMPENSATION");
        assertThat(saved.getSummary()).isEqualTo("Updated self-performance bonus enabled flag");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"before\":{\"enabled\":false,")
            .contains("\"after\":{\"enabled\":true,");
    }
}
