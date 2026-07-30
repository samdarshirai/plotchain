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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KycConfigServiceTest {

    @Mock KycConfigRepository kycConfigRepository;
    // SettingsAuditService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes (see AuthControllerTest), so a real instance is built over mocked
    // (interface) repositories instead, per the repo's established pattern. Audit calls are
    // asserted via the settingsAuditLogRepository.save(...) captor, same as SettingsAuditServiceTest.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    KycConfigService kycConfigService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        kycConfigService = new KycConfigService(kycConfigRepository, settingsAuditService);
    }

    @Test
    void getConfigSplitsRequiredDocumentsIntoAList() {
        KycConfig stored = new KycConfig();
        stored.setStrictness("STRICT");
        stored.setRequiredDocuments("AADHAAR,PAN,BANK_PASSBOOK");
        when(kycConfigRepository.findAll()).thenReturn(List.of(stored));

        KycConfigResponse response = kycConfigService.getConfig();

        assertThat(response.strictness()).isEqualTo("STRICT");
        assertThat(response.requiredDocuments()).containsExactly("AADHAAR", "PAN", "BANK_PASSBOOK");
    }

    @Test
    void updateConfigJoinsRequiredDocumentsIntoACommaString() {
        KycConfig stored = new KycConfig();
        stored.setStrictness("STRICT");
        stored.setRequiredDocuments("AADHAAR,PAN,BANK_PASSBOOK");
        when(kycConfigRepository.findAll()).thenReturn(List.of(stored));

        KycConfigResponse response = kycConfigService.updateConfig(
            new KycConfigRequest("RELAXED", List.of("AADHAAR", "PAN")), ACTOR_ID);

        ArgumentCaptor<KycConfig> captor = ArgumentCaptor.forClass(KycConfig.class);
        verify(kycConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getStrictness()).isEqualTo("RELAXED");
        assertThat(captor.getValue().getRequiredDocuments()).isEqualTo("AADHAAR,PAN");
        assertThat(response.requiredDocuments()).containsExactly("AADHAAR", "PAN");
    }

    @Test
    void updateConfigRecordsAnAuditEntry() {
        KycConfig stored = new KycConfig();
        stored.setStrictness("STRICT");
        stored.setRequiredDocuments("AADHAAR,PAN,BANK_PASSBOOK");
        when(kycConfigRepository.findAll()).thenReturn(List.of(stored));

        kycConfigService.updateConfig(new KycConfigRequest("RELAXED", List.of("AADHAAR", "PAN")), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PAYMENTS_KYC");
        assertThat(saved.getSummary()).isEqualTo("Updated KYC requirements");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"before\":{\"strictness\":\"STRICT\"")
            .contains("\"after\":{\"strictness\":\"RELAXED\"");
    }
}
