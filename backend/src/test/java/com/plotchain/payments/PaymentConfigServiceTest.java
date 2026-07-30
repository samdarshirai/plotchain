package com.plotchain.payments;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentConfigServiceTest {

    private static final String SECRETS_KEY = "test-secrets-key-at-least-32-bytes-long-for-aes";

    @Mock PaymentConfigRepository paymentConfigRepository;

    PaymentConfigService paymentConfigService;

    @BeforeEach
    void setUp() {
        paymentConfigService = new PaymentConfigService(
            paymentConfigRepository, new SecretsEncryptionService(SECRETS_KEY));
    }

    @Test
    void updateConfigSavesGatewayAndModesAndEncryptsCredentials() {
        PaymentConfig stored = new PaymentConfig();
        when(paymentConfigRepository.findAll()).thenReturn(List.of(stored));

        PaymentConfigResponse response = paymentConfigService.updateConfig(
            new PaymentConfigRequest("RAZORPAY", "sk_live_secret", List.of("CARDS", "UPI")));

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

        paymentConfigService.updateConfig(new PaymentConfigRequest("PAYU", null, List.of("UPI")));

        ArgumentCaptor<PaymentConfig> captor = ArgumentCaptor.forClass(PaymentConfig.class);
        verify(paymentConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getCredentialsEncrypted()).isEqualTo("already-encrypted-value");
        assertThat(captor.getValue().getGateway()).isEqualTo("PAYU");
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
