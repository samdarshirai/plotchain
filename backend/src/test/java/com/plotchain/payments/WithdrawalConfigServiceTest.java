package com.plotchain.payments;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WithdrawalConfigServiceTest {

    @Mock WithdrawalConfigRepository withdrawalConfigRepository;

    WithdrawalConfigService withdrawalConfigService;

    @BeforeEach
    void setUp() {
        withdrawalConfigService = new WithdrawalConfigService(withdrawalConfigRepository);
    }

    @Test
    void updateConfigSavesApprovalModeAndLimit() {
        WithdrawalConfig stored = new WithdrawalConfig();
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        WithdrawalConfigResponse response = withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", new BigDecimal("25000.00")));

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

        withdrawalConfigService.updateConfig(new WithdrawalConfigRequest("ALWAYS_MANUAL", null));

        ArgumentCaptor<WithdrawalConfig> captor = ArgumentCaptor.forClass(WithdrawalConfig.class);
        verify(withdrawalConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getAutoApproveLimit()).isNull();
    }

    @Test
    void updateConfigRejectsAutoUnderLimitWithNoLimit() {
        // Validation runs before the repository is ever touched, so no stubbing is needed here.
        assertThatThrownBy(() -> withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", null)))
            .isInstanceOf(InvalidWithdrawalConfigException.class);
    }

    @Test
    void updateConfigRejectsAutoUnderLimitWithAZeroOrNegativeLimit() {
        assertThatThrownBy(() -> withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", BigDecimal.ZERO)))
            .isInstanceOf(InvalidWithdrawalConfigException.class);
    }
}
