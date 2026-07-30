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
class PaymentConfigServiceTest {

    private static final String SECRETS_KEY = "test-secrets-key-at-least-32-bytes-long-for-aes";

    @Mock PaymentConfigRepository paymentConfigRepository;
    // SettingsAuditService is a concrete class -- this JDK's Mockito/ByteBuddy can't instrument
    // concrete classes (see AuthControllerTest), so a real instance is built over mocked
    // (interface) repositories instead, per the repo's established pattern. Audit calls are
    // asserted via the settingsAuditLogRepository.save(...) captor, same as SettingsAuditServiceTest.
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock AssociateRepository associateRepository;

    PaymentConfigService paymentConfigService;

    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        paymentConfigService = new PaymentConfigService(
            paymentConfigRepository, new SecretsEncryptionService(SECRETS_KEY), settingsAuditService);
    }

    @Test
    void updateConfigSavesGatewayAndModesAndEncryptsCredentials() {
        PaymentConfig stored = new PaymentConfig();
        when(paymentConfigRepository.findAll()).thenReturn(List.of(stored));

        PaymentConfigResponse response = paymentConfigService.updateConfig(
            new PaymentConfigRequest("RAZORPAY", "sk_live_secret", List.of("CARDS", "UPI")), ACTOR_ID);

        ArgumentCaptor<PaymentConfig> captor = ArgumentCaptor.forClass(PaymentConfig.class);
        verify(paymentConfigRepository).save(captor.capture());
        PaymentConfig saved = captor.getValue();
        assertThat(saved.getGateway()).isEqualTo("RAZORPAY");
        assertThat(saved.getModesEnabled()).isEqualTo("CARDS,UPI");
        assertThat(saved.getCredentialsEncrypted()).isNotEqualTo("sk_live_secret").isNotNull();
        assertThat(response.gateway()).isEqualTo("RAZORPAY");
        assertThat(response.credentialsConfigured()).isTrue();
        assertThat(response.modesEnabled()).containsExactly("CARDS", "UPI");
    }

    @Test
    void updateConfigWithBlankCredentialsLeavesStoredCiphertextUnchanged() {
        PaymentConfig stored = new PaymentConfig();
        stored.setGateway("RAZORPAY");
        stored.setCredentialsEncrypted("already-encrypted-value");
        when(paymentConfigRepository.findAll()).thenReturn(List.of(stored));

        paymentConfigService.updateConfig(new PaymentConfigRequest("PAYU", null, List.of("UPI")), ACTOR_ID);

        ArgumentCaptor<PaymentConfig> captor = ArgumentCaptor.forClass(PaymentConfig.class);
        verify(paymentConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getCredentialsEncrypted()).isEqualTo("already-encrypted-value");
        assertThat(captor.getValue().getGateway()).isEqualTo("PAYU");
    }

    @Test
    void updateConfigRecordsAnAuditEntry() {
        PaymentConfig stored = new PaymentConfig();
        stored.setGateway("PAYU");
        when(paymentConfigRepository.findAll()).thenReturn(List.of(stored));

        paymentConfigService.updateConfig(
            new PaymentConfigRequest("RAZORPAY", "sk_live_secret", List.of("CARDS", "UPI")), ACTOR_ID);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        SettingsAuditLog saved = captor.getValue();
        assertThat(saved.getSection()).isEqualTo("PAYMENTS_KYC");
        assertThat(saved.getSummary()).isEqualTo("Updated payment gateway configuration");
        assertThat(saved.getChangedByAssociateId()).isEqualTo(ACTOR_ID);
        assertThat(saved.getDetail()).contains("\"before\":{\"gateway\":\"PAYU\"")
            .contains("\"after\":{\"gateway\":\"RAZORPAY\"");
        // Raw credentials must never reach the audit log -- only the credentialsConfigured flag.
        assertThat(saved.getDetail()).doesNotContain("sk_live_secret");
    }

    @Test
    void isCompleteIsFalseWithNoGatewayOrCredentials() {
        when(paymentConfigRepository.findAll()).thenReturn(List.of(new PaymentConfig()));

        assertThat(paymentConfigService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsFalseWithGatewayButNoCredentials() {
        PaymentConfig stored = new PaymentConfig();
        stored.setGateway("RAZORPAY");
        when(paymentConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(paymentConfigService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsTrueWithGatewayAndCredentials() {
        PaymentConfig stored = new PaymentConfig();
        stored.setGateway("RAZORPAY");
        stored.setCredentialsEncrypted("encrypted-value");
        when(paymentConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(paymentConfigService.isComplete()).isTrue();
    }
}
