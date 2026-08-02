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

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingEmiConfigServiceTest {

    @Mock BookingEmiConfigRepository bookingEmiConfigRepository;
    // SettingsAuditService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes (see AuthControllerTest), so a real instance is built over mocked
    // (interface) repositories instead, per the repo's established pattern. Audit calls are
    // asserted via the settingsAuditLogRepository.save(...) captor, same as SettingsAuditServiceTest.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    BookingEmiConfigService bookingEmiConfigService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        bookingEmiConfigService = new BookingEmiConfigService(bookingEmiConfigRepository, settingsAuditService);
    }

    @Test
    void updateConfigSavesAllFields() {
        BookingEmiConfig stored = new BookingEmiConfig();
        when(bookingEmiConfigRepository.findAll()).thenReturn(List.of(stored));

        BookingEmiConfigResponse response = bookingEmiConfigService.updateConfig(
            new BookingEmiConfigRequest(true, 12, "AUTO_THRESHOLD", 25), ACTOR_ID);

        ArgumentCaptor<BookingEmiConfig> captor = ArgumentCaptor.forClass(BookingEmiConfig.class);
        verify(bookingEmiConfigRepository).save(captor.capture());
        assertThat(captor.getValue().isEmiEnabled()).isTrue();
        assertThat(captor.getValue().getDefaultInstallmentCount()).isEqualTo(12);
        assertThat(captor.getValue().getConfirmRule()).isEqualTo("AUTO_THRESHOLD");
        assertThat(captor.getValue().getConfirmThresholdPercent()).isEqualTo(25);
        assertThat(response.confirmRule()).isEqualTo("AUTO_THRESHOLD");
    }

    @Test
    void updateConfigClearsTheThresholdWhenSwitchingAwayFromAutoThreshold() {
        BookingEmiConfig stored = new BookingEmiConfig();
        stored.setConfirmRule("AUTO_THRESHOLD");
        stored.setConfirmThresholdPercent(25);
        when(bookingEmiConfigRepository.findAll()).thenReturn(List.of(stored));

        bookingEmiConfigService.updateConfig(new BookingEmiConfigRequest(false, 1, "MANUAL", null), ACTOR_ID);

        ArgumentCaptor<BookingEmiConfig> captor = ArgumentCaptor.forClass(BookingEmiConfig.class);
        verify(bookingEmiConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getConfirmThresholdPercent()).isNull();
    }

    @Test
    void updateConfigRejectsAutoThresholdWithNoThreshold() {
        // Validation runs before the repository is ever touched, so no stubbing is needed here.
        assertThatThrownBy(() -> bookingEmiConfigService.updateConfig(
            new BookingEmiConfigRequest(true, 1, "AUTO_THRESHOLD", null), ACTOR_ID))
            .isInstanceOf(InvalidBookingEmiConfigException.class);
    }

    @Test
    void updateConfigRejectsAutoThresholdWithAZeroOrNegativeThreshold() {
        assertThatThrownBy(() -> bookingEmiConfigService.updateConfig(
            new BookingEmiConfigRequest(true, 1, "AUTO_THRESHOLD", 0), ACTOR_ID))
            .isInstanceOf(InvalidBookingEmiConfigException.class);
    }

    @Test
    void updateConfigRecordsAnAuditEntry() {
        BookingEmiConfig stored = new BookingEmiConfig();
        stored.setConfirmRule("MANUAL");
        when(bookingEmiConfigRepository.findAll()).thenReturn(List.of(stored));

        bookingEmiConfigService.updateConfig(new BookingEmiConfigRequest(true, 6, "KYC_GATED", null), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PAYMENTS_KYC");
        assertThat(saved.getSummary()).isEqualTo("Updated booking & EMI policy settings");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"before\":{\"emiEnabled\":false")
            .contains("\"after\":{\"emiEnabled\":true");
    }
}
