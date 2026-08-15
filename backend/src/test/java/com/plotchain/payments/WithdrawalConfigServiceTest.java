package com.plotchain.payments;

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

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WithdrawalConfigServiceTest {

    @Mock WithdrawalConfigRepository withdrawalConfigRepository;
    // SettingsAuditService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes (see AuthControllerTest), so a real instance is built over mocked
    // (interface) repositories instead, per the repo's established pattern. Audit calls are
    // asserted via the settingsAuditLogRepository.save(...) captor, same as SettingsAuditServiceTest.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    WithdrawalConfigService withdrawalConfigService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        withdrawalConfigService = new WithdrawalConfigService(withdrawalConfigRepository, settingsAuditService);
    }

    @Test
    void updateConfigSavesApprovalModeAndLimit() {
        WithdrawalConfig stored = new WithdrawalConfig();
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        WithdrawalConfigResponse response = withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", new BigDecimal("25000.00"), null), ACTOR_ID);

        ArgumentCaptor<WithdrawalConfig> captor = ArgumentCaptor.forClass(WithdrawalConfig.class);
        verify(withdrawalConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getApprovalMode()).isEqualTo("AUTO_UNDER_LIMIT");
        assertThat(captor.getValue().getAutoApproveLimit()).isEqualByComparingTo("25000.00");
        assertThat(response.approvalMode()).isEqualTo("AUTO_UNDER_LIMIT");
    }

    @Test
    void updateConfigClearsTheLimitWhenSwitchingToAlwaysManual() {
        WithdrawalConfig stored = new WithdrawalConfig();
        stored.setApprovalMode("AUTO_UNDER_LIMIT");
        stored.setAutoApproveLimit(new BigDecimal("25000.00"));
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        withdrawalConfigService.updateConfig(new WithdrawalConfigRequest("ALWAYS_MANUAL", null, null), ACTOR_ID);

        ArgumentCaptor<WithdrawalConfig> captor = ArgumentCaptor.forClass(WithdrawalConfig.class);
        verify(withdrawalConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getAutoApproveLimit()).isNull();
    }

    @Test
    void updateConfigRejectsAutoUnderLimitWithNoLimit() {
        // Validation runs before the repository is ever touched, so no stubbing is needed here.
        assertThatThrownBy(() -> withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", null, null), ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalConfigException.class);
    }

    @Test
    void updateConfigRejectsAutoUnderLimitWithAZeroOrNegativeLimit() {
        assertThatThrownBy(() -> withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", BigDecimal.ZERO, null), ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalConfigException.class);
    }

    @Test
    void updateConfigRecordsAnAuditEntry() {
        WithdrawalConfig stored = new WithdrawalConfig();
        stored.setApprovalMode("ALWAYS_MANUAL");
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", new BigDecimal("25000.00"), null), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PAYMENTS_KYC");
        assertThat(saved.getSummary()).isEqualTo("Updated withdrawal approval settings");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"before\":{\"approvalMode\":\"ALWAYS_MANUAL\"")
            .contains("\"after\":{\"approvalMode\":\"AUTO_UNDER_LIMIT\"");
    }

    @Test
    void updateConfigSavesAndReturnsMinimumWithdrawalAmount() {
        WithdrawalConfig stored = new WithdrawalConfig();
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        WithdrawalConfigResponse response = withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("ALWAYS_MANUAL", null, new BigDecimal("500.00")), ACTOR_ID);

        ArgumentCaptor<WithdrawalConfig> captor = ArgumentCaptor.forClass(WithdrawalConfig.class);
        verify(withdrawalConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getMinimumWithdrawalAmount()).isEqualByComparingTo("500.00");
        assertThat(response.minimumWithdrawalAmount()).isEqualByComparingTo("500.00");
    }
}
